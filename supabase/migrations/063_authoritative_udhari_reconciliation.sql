-- =================================================================================
-- VISTAAR Business OS — Migration 063: Authoritative Udhari Reconciliation & Branch KPI Isolation
-- Permanent fix for discrepancies between Main Dashboard, Udhari Analytics, and Ledger.
-- =================================================================================

-- 1. Ensure udhari_records branch_id is synchronized from invoices
update public.udhari_records u
set branch_id = i.branch_id,
    updated_at = now()
from public.invoices i
where u.invoice_id = i.id
  and u.branch_id is distinct from i.branch_id
  and i.branch_id is not null;

-- 2. Repair any orphan invoice receivables: create missing udhari_records for credit invoices with remaining balance
insert into public.udhari_records (
    workspace_id,
    branch_id,
    customer_id,
    invoice_id,
    udhari_code,
    customer_name_snapshot,
    phone_snapshot,
    original_amount,
    total_received,
    outstanding_amount,
    due_date,
    status,
    notes,
    created_at,
    updated_at
)
select
    i.workspace_id,
    i.branch_id,
    i.customer_id,
    i.id,
    'UD-' || i.invoice_number,
    coalesce(i.customer_name, 'Customer'),
    coalesce(i.customer_phone, '9999999999'),
    i.grand_total,
    coalesce(i.paid_amount, 0),
    coalesce(i.balance_amount, i.grand_total),
    coalesce(i.due_date, (i.date + interval '15 days')::date),
    case
        when coalesce(i.balance_amount, 0) <= 0.005 then 'PAID'
        when coalesce(i.paid_amount, 0) > 0 then 'PARTIALLY PAID'
        when coalesce(i.due_date, (i.date + interval '15 days')::date) < current_date then 'OVERDUE'
        else 'UNPAID'
    end,
    'Auto-reconciled credit entry for Invoice #' || i.invoice_number,
    coalesce(i.created_at, now()),
    now()
from public.invoices i
where i.status in ('Issued', 'Partially Paid')
  and coalesce(i.balance_amount, 0) > 0.005
  and not exists (
      select 1 from public.udhari_records u
      where u.invoice_id = i.id
         or u.udhari_code = 'UD-' || i.invoice_number
         or (u.udhari_code = i.invoice_number)
  );

-- 3. Reconcile statuses and balances for existing udhari records linked to invoices
update public.udhari_records u
set original_amount = round(i.grand_total, 2),
    total_received = round(least(i.grand_total, greatest(coalesce(u.total_received, 0), coalesce(i.paid_amount, 0))), 2),
    outstanding_amount = round(greatest(0::numeric, i.grand_total - least(i.grand_total, greatest(coalesce(u.total_received, 0), coalesce(i.paid_amount, 0)))), 2),
    status = case
        when round(greatest(0::numeric, i.grand_total - least(i.grand_total, greatest(coalesce(u.total_received, 0), coalesce(i.paid_amount, 0)))), 2) <= 0.005 then 'PAID'
        when least(i.grand_total, greatest(coalesce(u.total_received, 0), coalesce(i.paid_amount, 0))) > 0 then 'PARTIALLY PAID'
        when u.due_date < current_date then 'OVERDUE'
        else 'UNPAID'
    end,
    updated_at = now()
from public.invoices i
where u.invoice_id = i.id
  and (
      abs(coalesce(u.original_amount, 0) - i.grand_total) > 0.005 or
      abs(coalesce(u.outstanding_amount, 0) - i.balance_amount) > 0.005
  );

-- 4. Authoritative Database RPC Function for Authoritative Udhari KPIs with strict Branch Scope
create or replace function public.get_authoritative_udhari_kpis(
    p_workspace_id uuid,
    p_branch_id uuid default null,
    p_as_of_date date default current_date
)
returns table (
    total_udhari_issued numeric,
    total_recovered numeric,
    net_outstanding numeric,
    overdue_credit numeric,
    active_count bigint,
    settled_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_as_of date := coalesce(p_as_of_date, current_date);
begin
    return query
    with scoped_records as (
        select
            u.id,
            round(coalesce(u.original_amount, 0), 2) as orig,
            round(coalesce(u.total_received, 0), 2) as rec,
            round(coalesce(u.outstanding_amount, 0), 2) as bal,
            u.due_date,
            u.created_at::date as c_date
        from public.udhari_records u
        where u.workspace_id = p_workspace_id
          and (p_branch_id is null or u.branch_id = p_branch_id)
          and (u.created_at::date <= v_as_of)
    ),
    calculated as (
        select
            coalesce(sum(orig), 0) as s_orig,
            coalesce(sum(case when bal <= 0.005 then orig else rec end), 0) as s_rec,
            coalesce(sum(case when bal <= 0.005 then 0 else bal end), 0) as s_bal,
            coalesce(sum(case when bal > 0.005 and due_date < v_as_of then bal else 0 end), 0) as s_overdue,
            count(*) filter (where bal > 0.005) as c_active,
            count(*) filter (where bal <= 0.005) as c_settled
        from scoped_records
    )
    select
        round(s_orig, 2) as total_udhari_issued,
        round(s_rec, 2) as total_recovered,
        round(s_bal, 2) as net_outstanding,
        round(least(s_bal, s_overdue), 2) as overdue_credit,
        c_active as active_count,
        c_settled as settled_count
    from calculated;
end;
$$;

-- Grant execute privileges
grant execute on function public.get_authoritative_udhari_kpis(uuid, uuid, date) to authenticated, anon;

-- Notify schema reload
notify pgrst, 'reload schema';
