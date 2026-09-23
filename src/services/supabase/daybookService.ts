import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { DaybookTransaction, DaybookFilterOptions, DaybookSummaryMetrics } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { fromDbDaybookTransaction } from './types';
import { expenseService } from './expenseService';

const LOCAL_DAYBOOK_KEY = 'vistaar_local_daybook_db';

export class DaybookService {
  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in daybookService:', e);
    }
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  /**
   * Helper to compute date bounds based on preset range strings
   */
  private getDateBounds(range?: string, customStart?: string, customEnd?: string): { start?: string; end?: string } {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (!range || range === 'all') return { start: customStart, end: customEnd };

    if (range === 'today') {
      return { start: todayStr, end: todayStr };
    }

    if (range === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      return { start: yStr, end: yStr };
    }

    if (range === 'week') {
      const d = new Date(today);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return { start: monday.toISOString().split('T')[0], end: todayStr };
    }

    if (range === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }

    if (range === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: firstDay.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }

    if (range === 'custom') {
      return { start: customStart, end: customEnd };
    }

    return {};
  }

  /**
   * Fetch Daybook Transactions with server-side filtering, sorting, and synthesis fallback
   */
  public async getTransactions(options?: DaybookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const wsId = await this.getWorkspaceId();

    try {
      let rawTransactions: DaybookTransaction[] = [];

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // 1. Query public.daybook_transactions first (Authoritative unified financial journal)
        try {
          let dtQuery = supabase
            .from('daybook_transactions')
            .select('*', { count: 'exact' })
            .eq('workspace_id', wsId);

          const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);
          if (start) dtQuery = dtQuery.gte('transaction_date', start);
          if (end) dtQuery = dtQuery.lte('transaction_date', end);

          if (options?.transactionType && options.transactionType !== 'ALL') {
            dtQuery = dtQuery.eq('transaction_type', options.transactionType);
          }

          if (options?.paymentStatus && options.paymentStatus !== 'ALL') {
            dtQuery = dtQuery.eq('payment_status', options.paymentStatus);
          }

          if (options?.paymentMode && options.paymentMode !== 'ALL') {
            dtQuery = dtQuery.eq('payment_mode', options.paymentMode);
          }

          if (options?.search && options.search.trim()) {
            const s = `%${options.search.trim()}%`;
            dtQuery = dtQuery.or(`transaction_code.ilike.${s},reference_number.ilike.${s},description.ilike.${s},party_name.ilike.${s}`);
          }

          dtQuery = dtQuery.order('transaction_date', { ascending: false }).order('created_at', { ascending: false });

          const { data: dtData, error: dtErr } = await dtQuery;
          if (!dtErr && dtData) {
            rawTransactions = dtData.map((row: any) => fromDbDaybookTransaction(row));
          }
        } catch (dtEx) {
          // Fall through
        }
      }

      // Merge with local tenant storage transactions
      const local = this.getFilteredLocalTransactions(wsId, options);
      const seenIds = new Set<string>();
      const seenRefKeys = new Set<string>();

      rawTransactions.forEach((t) => {
        if (t.id) seenIds.add(t.id);
        if (t.referenceType && t.referenceId) seenRefKeys.add(`${t.referenceType}:${t.referenceId}`);
      });

      for (const lt of local) {
        const refKey = `${lt.referenceType}:${lt.referenceId}`;
        if (!seenIds.has(lt.id) && !seenRefKeys.has(refKey)) {
          seenIds.add(lt.id);
          seenRefKeys.add(refKey);
          rawTransactions.push(lt);
        }
      }

      // 2. Authoritative Enrichment & Reconciled Synthesis (Invoices, Payments, Counter Sales, Expenses)
      const reconciled = await this.enrichAndReconcileTransactions(rawTransactions, wsId, options);
      if (reconciled.length > 0) {
        return { data: reconciled, count: reconciled.length };
      }

      // 3. Fallback: Synthesize from live sales if raw journal was completely empty
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const synthesized = await this.synthesizeDaybookFromLiveSales(wsId, options);
        if (synthesized.length > 0) {
          return { data: synthesized, count: synthesized.length };
        }
      }
    } catch (e: any) {
      handleSupabaseError(e, 'getTransactions');
    }

    const fallback = this.getFilteredLocalTransactions(wsId, options);
    return { data: fallback, count: fallback.length };
  }

  /**
   * Authoritative Financial Enrichment & Reconciliation
   * Guarantees:
   * 1. TOTAL = invoice.grand_total (never payment.amount)
   * 2. INFLOW = payment.amount (actual money received in this payment transaction)
   * 3. REMAINING = Math.max(0, invoice.grand_total - cumulativePaymentsUpToThisPayment)
   * 4. Multi-payment history: Payment 1 shows Inflow=10700, Remaining=7000; Payment 2 shows Inflow=7000, Remaining=0.
   * 5. Unpaid invoices show Total=17700, Inflow=0, Remaining=17700.
   * 6. No duplicate entries between invoice creation and payment transactions.
   */
  private async enrichAndReconcileTransactions(
    existingTxList: DaybookTransaction[],
    wsId: string,
    options?: DaybookFilterOptions
  ): Promise<DaybookTransaction[]> {
    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    // 1. Collect Invoices from Supabase and Local Store
    const invoiceMap = new Map<string, any>(); // key: id and invoice_number
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: dbInvs } = await supabase
          .from('invoices')
          .select('id, invoice_number, grand_total, paid_amount, balance_amount, status, date, due_date, customer_id, customer_name, customer_phone, created_at')
          .eq('workspace_id', wsId);

        (dbInvs || []).forEach((inv: any) => {
          if (inv.id) invoiceMap.set(inv.id, inv);
          if (inv.invoice_number) invoiceMap.set(inv.invoice_number, inv);
        });
      }
    } catch {
      // ignore
    }

    try {
      const { store } = await import('../store');
      store.getInvoices().forEach((inv) => {
        const row = {
          id: inv.id,
          invoice_number: inv.invoiceNumber,
          grand_total: inv.grandTotal,
          paid_amount: inv.paidAmount,
          balance_amount: inv.balanceAmount,
          status: inv.status,
          date: inv.date,
          due_date: inv.dueDate,
          customer_id: inv.customerId,
          customer_name: inv.customerName,
          customer_phone: inv.customerPhone,
          created_at: inv.createdAt,
        };
        if (inv.id && !invoiceMap.has(inv.id)) invoiceMap.set(inv.id, row);
        if (inv.invoiceNumber && !invoiceMap.has(inv.invoiceNumber)) invoiceMap.set(inv.invoiceNumber, row);
      });
    } catch {
      // ignore
    }

    // 2. Collect Payments from Supabase and Local Store
    const paymentsList: any[] = [];
    const seenPaymentKeys = new Set<string>();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: dbPays } = await supabase
          .from('payments')
          .select('id, payment_number, invoice_id, invoice_number, amount, payment_date, method, customer_id, customer_name, reference_no, notes, created_at')
          .eq('workspace_id', wsId);

        (dbPays || []).forEach((p: any) => {
          const k = p.id || `${p.invoice_id}:${p.payment_number}:${p.amount}`;
          if (!seenPaymentKeys.has(k)) {
            seenPaymentKeys.add(k);
            paymentsList.push(p);
          }
        });
      }
    } catch {
      // ignore
    }

    try {
      const { store } = await import('../store');
      store.getPayments().forEach((p) => {
        const k = p.id || `${p.invoiceId}:${p.paymentNumber}:${p.amount}`;
        if (!seenPaymentKeys.has(k)) {
          seenPaymentKeys.add(k);
          paymentsList.push({
            id: p.id,
            payment_number: p.paymentNumber,
            invoice_id: p.invoiceId,
            invoice_number: p.invoiceNumber,
            amount: p.amount,
            payment_date: p.date,
            method: p.method,
            customer_id: p.customerId,
            customer_name: p.customerName,
            reference_no: p.referenceNo,
            notes: p.notes,
            created_at: p.createdAt,
          });
        }
      });
    } catch {
      // ignore
    }

    // Index payments by invoice (id and number), sorted chronologically ascending
    const paymentsByInvoice = new Map<string, any[]>();
    for (const p of paymentsList) {
      const invKeys = [p.invoice_id, p.invoice_number].filter(Boolean);
      for (const k of invKeys) {
        if (!paymentsByInvoice.has(k)) {
          paymentsByInvoice.set(k, []);
        }
        paymentsByInvoice.get(k)!.push(p);
      }
    }

    for (const [, pList] of paymentsByInvoice.entries()) {
      pList.sort((a, b) => {
        const dateA = a.payment_date || a.created_at || '';
        const dateB = b.payment_date || b.created_at || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
    }

    // 3. Track existing references and payments in existingTxList
    const seenTxKeys = new Set<string>();
    const seenPaymentIdsInTx = new Set<string>();
    const invoiceIdsWithPaymentTx = new Set<string>();

    existingTxList.forEach((tx) => {
      seenTxKeys.add(tx.id);
      if (tx.referenceType && tx.referenceId) {
        seenTxKeys.add(`${tx.referenceType}:${tx.referenceId}`);
      }
      if (tx.referenceType === 'PAYMENT' && tx.referenceId) {
        seenPaymentIdsInTx.add(tx.referenceId);
        if (tx.referenceNumber) invoiceIdsWithPaymentTx.add(tx.referenceNumber);
      }
    });

    const unifiedList: DaybookTransaction[] = [];

    // 4. Enrich existing transactions
    for (const tx of existingTxList) {
      let isInvoiceLinked = tx.referenceType === 'INVOICE' || tx.referenceType === 'PAYMENT' || tx.transactionType === 'SALE' || tx.transactionType === 'CUSTOMER_PAYMENT';
      let linkedInv = tx.referenceId ? invoiceMap.get(tx.referenceId) : null;
      if (!linkedInv && tx.referenceNumber) {
        linkedInv = invoiceMap.get(tx.referenceNumber);
      }

      if (linkedInv) {
        const grandTotal = Number(linkedInv.grand_total) || 0;
        // Total MUST always be the authoritative document total
        tx.totalAmount = grandTotal > 0 ? grandTotal : (tx.totalAmount || tx.amount);

        const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];

        if (tx.referenceType === 'PAYMENT' || tx.transactionType === 'CUSTOMER_PAYMENT') {
          // Cumulative payment up to this transaction
          let cumulativePaid = 0;
          for (const p of invPayments) {
            const pAmt = Number(p.amount) || 0;
            const pDate = p.payment_date || '';
            cumulativePaid += pAmt;
            if (p.id === tx.referenceId || (pDate && tx.transactionDate && pDate <= tx.transactionDate && pAmt === tx.amount)) {
              break;
            }
          }
          if (cumulativePaid === 0) {
            cumulativePaid = Number(tx.amount) || 0;
          }

          tx.remainingAmount = Math.max(0, Number((grandTotal - cumulativePaid).toFixed(2)));
          tx.paymentStatus = tx.remainingAmount <= 0.01 ? 'PAID' : 'PARTIALLY PAID';
        } else if (tx.referenceType === 'INVOICE') {
          const invPaid = Number(linkedInv.paid_amount) || 0;
          const invBal = Number(linkedInv.balance_amount) || Math.max(0, grandTotal - invPaid);

          // If payments exist as distinct transactions, the invoice row should not duplicate inflow
          if (invPayments.length > 0 && (seenPaymentIdsInTx.size > 0 || invoiceIdsWithPaymentTx.has(linkedInv.invoice_number))) {
            // Unpaid invoice sale row
            tx.amount = 0;
            tx.remainingAmount = invBal;
            tx.paymentStatus = invBal <= 0.01 ? 'PAID' : (invPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
          } else {
            // Single historical invoice entry with both sale total and initial inflow
            tx.remainingAmount = invBal;
            tx.paymentStatus = invBal <= 0.01 ? 'PAID' : (invPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
          }
        }
      }

      unifiedList.push(tx);
    }

    // 5. Synthesize any missing payments from payments table (e.g. Payment 2 made later)
    for (const p of paymentsList) {
      if (seenPaymentIdsInTx.has(p.id) || seenTxKeys.has(`PAYMENT:${p.id}`) || seenTxKeys.has(`db-pay-${p.id}`)) {
        continue;
      }

      const linkedInv = p.invoice_id ? invoiceMap.get(p.invoice_id) : (p.invoice_number ? invoiceMap.get(p.invoice_number) : null);
      if (!linkedInv) continue;

      const pDate = (p.payment_date || p.created_at || '').split('T')[0];
      const grandTotal = Number(linkedInv.grand_total) || 0;
      const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];

      let cumulativePaid = 0;
      for (const invP of invPayments) {
        cumulativePaid += Number(invP.amount) || 0;
        if (invP.id === p.id) break;
      }
      if (cumulativePaid === 0) {
        cumulativePaid = Number(p.amount) || 0;
      }

      const remaining = Math.max(0, Number((grandTotal - cumulativePaid).toFixed(2)));
      const pStatus = remaining <= 0.01 ? 'PAID' : 'PARTIALLY PAID';

      const pAmt = Number(p.amount) || 0;
      const newPayTx: DaybookTransaction = {
        id: `db-pay-${p.id}`,
        workspaceId: wsId,
        transactionCode: p.payment_number || `PAY-${p.id.substring(0, 8)}`,
        transactionDate: pDate || new Date().toISOString().split('T')[0],
        transactionType: 'CUSTOMER_PAYMENT',
        direction: 'IN',
        amount: pAmt,
        totalAmount: grandTotal,
        remainingAmount: remaining,
        paymentStatus: pStatus as any,
        paymentMode: (p.method || 'Cash') as any,
        partyType: 'customer',
        partyId: linkedInv.customer_id || p.customer_id,
        partyName: linkedInv.customer_name || p.customer_name || 'Customer',
        referenceType: 'PAYMENT',
        referenceId: p.id,
        referenceNumber: linkedInv.invoice_number,
        description: `Invoice #${linkedInv.invoice_number}`,
        notes: p.notes,
        status: 'COMPLETED',
        createdAt: p.created_at,
      };

      seenPaymentIdsInTx.add(p.id);
      seenTxKeys.add(`PAYMENT:${p.id}`);
      seenTxKeys.add(newPayTx.id);
      unifiedList.push(newPayTx);
    }

    // 6. Synthesize any missing Invoices (including completely unpaid invoices)
    for (const [invIdOrNum, inv] of invoiceMap.entries()) {
      if (invIdOrNum !== inv.id) continue; // Only process once per invoice ID
      if (inv.status === 'Draft' || inv.status === 'Cancelled') continue;

      const invRefKey = `INVOICE:${inv.id}`;
      const invNumRefKey = `INVOICE:${inv.invoice_number}`;
      const hasInvoiceTx = seenTxKeys.has(invRefKey) || seenTxKeys.has(invNumRefKey) || unifiedList.some((t) => t.referenceId === inv.id || t.referenceNumber === inv.invoice_number);

      if (!hasInvoiceTx) {
        const grandTotal = Number(inv.grand_total) || 0;
        const paid = Number(inv.paid_amount) || 0;
        const remaining = Number(inv.balance_amount) || Math.max(0, grandTotal - paid);
        const pStatus = remaining <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        unifiedList.push({
          id: `db-syn-inv-${inv.id}`,
          workspaceId: wsId,
          transactionCode: inv.invoice_number || `INV-${inv.id.substring(0, 8)}`,
          transactionDate: (inv.date || '').split('T')[0] || new Date().toISOString().split('T')[0],
          transactionType: 'SALE',
          direction: 'IN',
          amount: paid,
          totalAmount: grandTotal,
          remainingAmount: remaining,
          paymentStatus: pStatus as any,
          paymentMode: 'Cash' as any,
          partyType: 'customer',
          partyId: inv.customer_id,
          partyName: inv.customer_name || 'Customer',
          referenceType: 'INVOICE',
          referenceId: inv.id,
          referenceNumber: inv.invoice_number,
          description: `Invoice #${inv.invoice_number}`,
          status: 'COMPLETED',
          createdAt: inv.created_at,
        });
      }
    }

    // 7. Deduplicate identical upfront payments recorded as both SALE and PAYMENT on the same invoice & date
    const finalFiltered: DaybookTransaction[] = [];
    const seenInflowsByInvoiceAndDate = new Set<string>();

    for (const tx of unifiedList) {
      if (tx.status === 'VOID' || tx.paymentStatus === 'CANCELLED') {
        finalFiltered.push(tx);
        continue;
      }

      // Check if this transaction represents an invoice payment
      const isPayOrSale = (tx.referenceType === 'INVOICE' || tx.referenceType === 'PAYMENT') && tx.amount > 0;
      if (isPayOrSale && tx.referenceNumber) {
        const dedupKey = `${tx.referenceNumber}:${tx.transactionDate}:${tx.amount}`;
        if (seenInflowsByInvoiceAndDate.has(dedupKey) && tx.referenceType === 'INVOICE') {
          // If a distinct PAYMENT entry already recorded this exact inflow on this date, zero out the invoice SALE inflow
          tx.amount = 0;
        } else {
          seenInflowsByInvoiceAndDate.add(dedupKey);
        }
      }
      finalFiltered.push(tx);
    }

    // 8. Apply User Filters (Date bounds, Type, Status, Mode, Search)
    const result = finalFiltered.filter((tx) => {
      const txDate = (tx.transactionDate || '').split('T')[0];
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;

      if (options?.transactionType && options.transactionType !== 'ALL') {
        if (options.transactionType === 'SALE') {
          if (tx.transactionType !== 'SALE' && tx.transactionType !== 'CUSTOMER_PAYMENT' && tx.referenceType !== 'INVOICE' && tx.referenceType !== 'PAYMENT') {
            return false;
          }
        } else if (tx.transactionType !== options.transactionType) {
          return false;
        }
      }

      if (options?.paymentStatus && options.paymentStatus !== 'ALL' && tx.paymentStatus !== options.paymentStatus) {
        return false;
      }

      if (options?.paymentMode && options.paymentMode !== 'ALL' && tx.paymentMode !== options.paymentMode) {
        return false;
      }

      if (options?.search && options.search.trim()) {
        const q = options.search.trim().toLowerCase();
        const code = (tx.transactionCode || '').toLowerCase();
        const ref = (tx.referenceNumber || '').toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const party = (tx.partyName || '').toLowerCase();
        if (!code.includes(q) && !ref.includes(q) && !desc.includes(q) && !party.includes(q)) {
          return false;
        }
      }

      return true;
    });

    result.sort((a, b) => {
      if (b.transactionDate !== a.transactionDate) {
        return b.transactionDate.localeCompare(a.transactionDate);
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return result;
  }

  /**
   * Resilient synthesis of Daybook records from authoritative Counter Sales and Invoices
   */
  private async synthesizeDaybookFromLiveSales(wsId: string, options?: DaybookFilterOptions): Promise<DaybookTransaction[]> {
    const list: DaybookTransaction[] = [];
    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    try {
      // 1. Fetch completed counter sales
      let csQuery = supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      if (start) csQuery = csQuery.gte('sale_date', start);
      if (end) csQuery = csQuery.lte('sale_date', end);

      const { data: csList } = await csQuery;
      if (csList) {
        for (const cs of csList) {
          const total = Number(cs.final_total) || 0;
          const received = Number(cs.amount_received !== undefined && cs.amount_received !== null ? cs.amount_received : cs.final_total) || 0;
          const remaining = Number(cs.balance_amount) || Math.max(0, total - received);
          const pStatus = remaining <= 0 ? 'PAID' : (received > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          if (options?.paymentStatus && options.paymentStatus !== 'ALL' && pStatus !== options.paymentStatus) {
            continue;
          }

          list.push({
            id: cs.id,
            workspaceId: cs.workspace_id,
            transactionCode: cs.sale_number || `CS-${cs.id.substring(0, 8)}`,
            transactionDate: cs.sale_date,
            transactionType: 'SALE',
            direction: 'IN',
            amount: received, // Inflow = actual money received
            totalAmount: total, // Gross Total column strictly for sales
            remainingAmount: remaining, // Unpaid remaining
            paymentStatus: pStatus as any,
            paymentMode: (cs.payment_method || 'Cash') as any,
            partyType: 'customer',
            partyId: cs.customer_id,
            partyName: cs.customer_name || 'Walk-in Customer',
            referenceType: 'COUNTER_SALE',
            referenceId: cs.id,
            referenceNumber: cs.invoice_number || cs.sale_number,
            description: `Counter Sale #${cs.invoice_number || cs.sale_number}`,
            status: 'COMPLETED',
            createdAt: cs.created_at,
          });
        }
      }

      // 2. Fetch issued invoices
      let invQuery = supabase
        .from('invoices')
        .select('*')
        .eq('workspace_id', wsId)
        .in('status', ['Issued', 'Partially Paid', 'Paid']);

      if (start) invQuery = invQuery.gte('date', start);
      if (end) invQuery = invQuery.lte('date', end);

      const { data: invList } = await invQuery;
      if (invList) {
        for (const inv of invList) {
          const grandTotal = Number(inv.grand_total) || 0;
          const paid = Number(inv.paid_amount) || 0;
          const remaining = Number(inv.balance_amount) || Math.max(0, grandTotal - paid);
          const pStatus = remaining <= 0 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          if (options?.paymentStatus && options.paymentStatus !== 'ALL' && pStatus !== options.paymentStatus) {
            continue;
          }

          list.push({
            id: inv.id,
            workspaceId: inv.workspace_id,
            transactionCode: inv.invoice_number || `INV-${inv.id.substring(0, 8)}`,
            transactionDate: inv.date,
            transactionType: 'SALE',
            direction: 'IN',
            amount: paid, // Inflow = actual money received
            totalAmount: grandTotal, // Gross Total column strictly for sales
            remainingAmount: remaining, // Remaining unpaid amount
            paymentStatus: pStatus as any,
            paymentMode: 'Cash' as any,
            partyType: 'customer',
            partyId: inv.customer_id,
            partyName: inv.customer_name || 'Customer',
            referenceType: 'INVOICE',
            referenceId: inv.id,
            referenceNumber: inv.invoice_number || `INV-${inv.id.substring(0, 8)}`,
            description: `Invoice #${inv.invoice_number || `INV-${inv.id.substring(0, 8)}`}`,
            status: 'COMPLETED',
            createdAt: inv.created_at,
          });
        }
      }

      // 3. Fetch operational expenses
      if (!options?.transactionType || options.transactionType === 'ALL' || options.transactionType === 'EXPENSE') {
        let expQuery = supabase
          .from('expenses')
          .select('*')
          .eq('workspace_id', wsId);

        if (start) expQuery = expQuery.gte('expense_date', start);
        if (end) expQuery = expQuery.lte('expense_date', end);

        const { data: expList } = await expQuery;
        if (expList) {
          for (const exp of expList) {
            const amt = Number(exp.amount) || 0;
            const desc = exp.expense_name ? `${exp.category}: ${exp.expense_name}` : (exp.category || 'Operational Expense');
            list.push({
              id: `syn-exp-${exp.id}`,
              workspaceId: exp.workspace_id,
              transactionCode: exp.reference_no || `EXP-${exp.id.substring(0, 8)}`,
              transactionDate: exp.expense_date,
              transactionType: 'EXPENSE',
              direction: 'OUT',
              amount: amt,
              paymentMode: (exp.payment_mode || 'Cash') as any,
              partyType: 'other',
              partyName: exp.paid_to || 'Vendor / Payee',
              referenceType: 'EXPENSE',
              referenceId: exp.id,
              referenceNumber: exp.reference_no,
              description: desc,
              notes: exp.notes,
              status: 'COMPLETED',
              createdAt: exp.created_at,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[synthesizeDaybookFromLiveSales] notice:', e);
    }

    list.sort((a, b) => (b.transactionDate > a.transactionDate ? 1 : -1));
    return list;
  }

  /**
   * Calculate summary metrics for current filter view
   */
  public async getSummaryMetrics(options?: DaybookFilterOptions): Promise<DaybookSummaryMetrics> {
    const { data } = await this.getTransactions({ ...options, page: undefined, pageSize: undefined });
    const active = (data || []).filter((t) => t.status !== 'VOID' && t.status !== 'REVERSED');

    let totalInflow = 0;
    let totalOutflow = 0;
    const modeBreakdown: Record<string, number> = {};

    for (const tx of active) {
      const mode = tx.paymentMode || 'Cash';
      const amt = Number(tx.amount) || 0;

      if (tx.direction === 'IN') {
        totalInflow += amt;
        modeBreakdown[mode] = (modeBreakdown[mode] || 0) + amt;
      } else if (tx.direction === 'OUT') {
        totalOutflow += amt;
        modeBreakdown[mode] = (modeBreakdown[mode] || 0) - amt;
      }
    }

    return {
      totalInflow,
      totalOutflow,
      netMovement: totalInflow - totalOutflow,
      totalCount: active.length,
      modeBreakdown,
    };
  }

  /**
   * Record a Daybook Financial Transaction
   * Writes to public.accounting_entries with full multi-tenant isolation and idempotency.
   */
  public async recordFinancialTransaction(params: {
    referenceType: 'COUNTER_SALE' | 'PAYMENT' | 'EXPENSE' | 'UDHARI_PAYMENT' | 'INVOICE' | 'MANUAL';
    referenceId: string;
    referenceNumber?: string;
    transactionType: DaybookTransaction['transactionType'];
    direction?: DaybookTransaction['direction'];
    amount: number;
    paymentMode?: string;
    partyType?: 'customer' | 'supplier' | 'other';
    partyId?: string;
    partyName?: string;
    description?: string;
    totalAmount?: number | null;
    remainingAmount?: number | null;
    paymentStatus?: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' | 'CANCELLED';
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const entryDate = params.transactionDate || new Date().toISOString().split('T')[0];
    const entryNumber = `ACC-${params.referenceNumber || params.referenceId || Date.now()}`;
    let savedDbId: string | undefined;

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      // 1. Primary write target: daybook_transactions with full idempotency & audit trail
      try {
        const { data: existing } = await supabase
          .from('daybook_transactions')
          .select('id')
          .eq('workspace_id', wsId)
          .eq('reference_type', params.referenceType)
          .eq('reference_id', params.referenceId)
          .maybeSingle();

        const dtPayload: any = {
          workspace_id: wsId,
          transaction_code: entryNumber,
          transaction_date: entryDate,
          transaction_type: params.transactionType,
          direction: params.direction || 'IN',
          amount: Math.abs(Number(params.amount) || 0),
          total_amount: params.totalAmount !== undefined ? params.totalAmount : null,
          remaining_amount: params.remainingAmount !== undefined ? params.remainingAmount : null,
          payment_status: params.paymentStatus || (params.transactionType === 'SALE' ? (params.remainingAmount && params.remainingAmount > 0 ? (params.amount > 0 ? 'PARTIALLY PAID' : 'UNPAID') : 'PAID') : null),
          payment_mode: params.paymentMode || 'Cash',
          party_type: params.partyType || 'customer',
          party_id: isValidUuid(params.partyId) ? params.partyId : null,
          party_name: params.partyName || null,
          reference_type: params.referenceType,
          reference_id: params.referenceId,
          reference_number: params.referenceNumber || null,
          description: params.description,
          notes: params.notes,
          status: params.paymentStatus === 'CANCELLED' ? 'VOID' : 'COMPLETED',
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update existing transaction entry
          let { error: updErr } = await supabase
            .from('daybook_transactions')
            .update(dtPayload)
            .eq('id', existing.id);

          if (updErr && (updErr.code === '42703' || updErr.message?.includes('column'))) {
            delete dtPayload.total_amount;
            delete dtPayload.remaining_amount;
            delete dtPayload.payment_status;
            await supabase.from('daybook_transactions').update(dtPayload).eq('id', existing.id);
          }
          savedDbId = existing.id;
        } else {
          // Insert new transaction entry
          let { data: insData, error: insErr } = await supabase
            .from('daybook_transactions')
            .insert([dtPayload])
            .select('id')
            .single();

          if (insErr && (insErr.code === '42703' || insErr.message?.includes('column'))) {
            delete dtPayload.total_amount;
            delete dtPayload.remaining_amount;
            delete dtPayload.payment_status;
            const retry = await supabase.from('daybook_transactions').insert([dtPayload]).select('id').single();
            if (!retry.error && retry.data) {
              savedDbId = retry.data.id;
            }
          } else if (!insErr && insData) {
            savedDbId = insData.id;
          }
        }
      } catch (dtErr) {
        // Fall through to local fallback
      }
    }

    // Local Storage backup
    const localEntry: DaybookTransaction = {
      id: `db-${Date.now()}`,
      workspaceId: wsId,
      transactionCode: entryNumber,
      transactionDate: entryDate,
      transactionType: params.transactionType,
      direction: params.direction || 'IN',
      amount: Math.abs(Number(params.amount) || 0),
      totalAmount: params.totalAmount,
      remainingAmount: params.remainingAmount,
      paymentStatus: params.paymentStatus || (params.transactionType === 'SALE' ? (params.remainingAmount && params.remainingAmount > 0 ? (params.amount > 0 ? 'PARTIALLY PAID' : 'UNPAID') : 'PAID') : undefined),
      paymentMode: (params.paymentMode || 'Cash') as any,
      partyType: params.partyType,
      partyId: params.partyId,
      partyName: params.partyName,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      description: params.description,
      notes: params.notes,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };

    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const existingIndex = local.findIndex((t: any) => t.referenceType === params.referenceType && t.referenceId === params.referenceId);
    if (existingIndex >= 0) {
      local[existingIndex] = { ...local[existingIndex], ...localEntry, id: local[existingIndex].id };
    } else {
      local.unshift(localEntry);
    }
    safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, local);

    return { success: true, id: savedDbId || localEntry.id };
  }

  /**
   * Record a Financial Reversal Transaction (Never silently delete financial history)
   */
  public async recordReversalTransaction(params: {
    sourceType: string;
    sourceId: string;
    referenceNumber?: string;
    description: string;
    amount?: number;
  }): Promise<{ success: boolean }> {
    return this.recordFinancialTransaction({
      referenceType: params.sourceType as any,
      referenceId: params.sourceId,
      referenceNumber: params.referenceNumber,
      transactionType: 'ADJUSTMENT',
      direction: 'OUT',
      amount: params.amount || 0,
      description: `[REVERSAL]: ${params.description}`,
    });
  }

  /**
   * Create a manually logged Daybook Transaction
   */
  public async createManualTransaction(payload: {
    transactionType: DaybookTransaction['transactionType'];
    direction: DaybookTransaction['direction'];
    amount: number;
    paymentMode?: DaybookTransaction['paymentMode'];
    partyName?: string;
    description: string;
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    return this.recordFinancialTransaction({
      referenceType: 'MANUAL',
      referenceId: `MAN-${Date.now()}`,
      referenceNumber: `MAN-${Date.now()}`,
      transactionType: payload.transactionType,
      direction: payload.direction,
      amount: payload.amount,
      paymentMode: (payload.paymentMode || 'Cash') as any,
      partyType: 'other',
      partyName: payload.partyName || 'Manual Entry',
      description: payload.description,
      notes: payload.notes,
      transactionDate: payload.transactionDate,
    });
  }

  /**
   * Void a financial transaction with audit reason
   */
  public async voidTransaction(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        await supabase
          .from('accounting_entries')
          .update({
            notes: reason ? `[VOIDED]: ${reason}` : '[VOIDED]',
          })
          .eq('workspace_id', wsId)
          .eq('id', id);

        await supabase
          .from('daybook_transactions')
          .update({
            status: 'VOID',
            notes: reason ? `[VOIDED]: ${reason}` : '[VOIDED]',
          })
          .eq('workspace_id', wsId)
          .eq('id', id);

        return { success: true };
      }
    } catch (e: any) {
      handleSupabaseError(e, 'voidTransaction');
    }

    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const target = local.find((t) => t.id === id);
    if (target) {
      target.status = 'VOID';
      target.notes = reason ? `[VOIDED]: ${reason}` : '[VOIDED]';
      safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, local);
    }
    return { success: true };
  }

  /**
   * Safe financial reconciliation across Invoices, Payments, Counter Sales, and Daybook Transactions.
   * Guarantees:
   * 1. Reconciles invoice.paid_amount and invoice.balance_amount against actual payment transactions.
   * 2. Preserves all original payment records without blind overwrites.
   * 3. Ensures Daybook transactions have authoritative total_amount (= invoice grand total) and remaining_amount.
   * 4. Idempotently creates any missing Daybook payment journal rows.
   */
  public async syncHistoricalTransactions(): Promise<{ syncedCount: number; reconciledInvoices?: number; reconciledPayments?: number }> {
    let synced = 0;
    let reconciledInvoices = 0;
    let reconciledPayments = 0;
    const wsId = await this.getWorkspaceId();

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      // Local fallback reconciliation
      try {
        const { store } = await import('../store');
        const localInvs = store.getInvoices();
        const localPays = store.getPayments();
        const localDaybook = safeGetTenantStorage<DaybookTransaction>(LOCAL_DAYBOOK_KEY, []);

        for (const inv of localInvs) {
          const invPays = localPays.filter((p) => p.invoiceId === inv.id || p.invoiceNumber === inv.invoiceNumber);
          const expectedPaid = invPays.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const expectedBal = Math.max(0, Number((inv.grandTotal - expectedPaid).toFixed(2)));

          if (Math.abs((inv.paidAmount || 0) - expectedPaid) > 0.01 || Math.abs((inv.balanceAmount || 0) - expectedBal) > 0.01) {
            inv.paidAmount = expectedPaid;
            inv.balanceAmount = expectedBal;
            inv.status = expectedBal <= 0.01 ? 'Paid' : (expectedPaid > 0 ? 'Partially Paid' : 'Issued');
            reconciledInvoices++;
          }

          // Ensure local daybook sale entry has totalAmount
          const dbSaleIdx = localDaybook.findIndex((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber));
          if (dbSaleIdx >= 0) {
            localDaybook[dbSaleIdx].totalAmount = inv.grandTotal;
            localDaybook[dbSaleIdx].remainingAmount = expectedBal;
            synced++;
          }
        }
        safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, localDaybook);
      } catch (locErr) {
        console.warn('Local reconciliation notice:', locErr);
      }
      return { syncedCount: synced, reconciledInvoices, reconciledPayments };
    }

    try {
      // 1. Fetch Invoices and Payments for this tenant workspace
      const [invRes, payRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('workspace_id', wsId),
        supabase.from('payments').select('*').eq('workspace_id', wsId).order('payment_date', { ascending: true }),
      ]);

      const invoices = invRes.data || [];
      const payments = payRes.data || [];

      // Group payments by invoice
      const paymentsByInvId = new Map<string, any[]>();
      for (const p of payments) {
        const key = p.invoice_id || p.invoice_number;
        if (key) {
          if (!paymentsByInvId.has(key)) paymentsByInvId.set(key, []);
          paymentsByInvId.get(key)!.push(p);
        }
      }

      // 2. Safe Invoice Reconciliation
      for (const inv of invoices) {
        if (inv.status === 'Draft' || inv.status === 'Cancelled') continue;

        const invPays = (paymentsByInvId.get(inv.id) || paymentsByInvId.get(inv.invoice_number) || []);
        const totalPaidFromPays = invPays.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        const grandTotal = Number(inv.grand_total) || 0;
        const expectedBal = Math.max(0, Number((grandTotal - totalPaidFromPays).toFixed(2)));
        const expectedStatus = expectedBal <= 0.01 ? 'Paid' : (totalPaidFromPays > 0 ? 'Partially Paid' : 'Issued');

        const currentPaid = Number(inv.paid_amount) || 0;
        const currentBal = Number(inv.balance_amount) || 0;

        if (Math.abs(currentPaid - totalPaidFromPays) > 0.01 || Math.abs(currentBal - expectedBal) > 0.01 || (inv.status !== expectedStatus && inv.status !== 'Issued')) {
          console.info(`[DaybookService] Reconciling invoice ${inv.invoice_number}: stored (paid=${currentPaid}, bal=${currentBal}) -> expected (paid=${totalPaidFromPays}, bal=${expectedBal})`);
          await supabase
            .from('invoices')
            .update({
              paid_amount: totalPaidFromPays,
              balance_amount: expectedBal,
              status: expectedStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', inv.id)
            .eq('workspace_id', wsId);

          reconciledInvoices++;
          synced++;
        }

        // Reconcile or create daybook SALE transaction
        const { data: existingSale } = await supabase
          .from('daybook_transactions')
          .select('id, total_amount, remaining_amount')
          .eq('workspace_id', wsId)
          .eq('reference_type', 'INVOICE')
          .or(`reference_id.eq.${inv.id},reference_number.eq.${inv.invoice_number}`)
          .maybeSingle();

        if (existingSale) {
          if (existingSale.total_amount !== grandTotal || existingSale.remaining_amount !== expectedBal) {
            await supabase
              .from('daybook_transactions')
              .update({
                total_amount: grandTotal,
                remaining_amount: expectedBal,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingSale.id);
            synced++;
          }
        }

        // 3. Reconcile Payments into Daybook transactions with cumulative balance
        let runningCumulativePaid = 0;
        for (const p of invPays) {
          const pAmt = Number(p.amount) || 0;
          runningCumulativePaid += pAmt;
          const remainingAfterThisPay = Math.max(0, Number((grandTotal - runningCumulativePaid).toFixed(2)));

          await this.recordFinancialTransaction({
            referenceType: 'PAYMENT',
            referenceId: p.id,
            referenceNumber: inv.invoice_number || p.payment_number,
            transactionType: 'CUSTOMER_PAYMENT',
            direction: 'IN',
            amount: pAmt,
            totalAmount: grandTotal,
            remainingAmount: remainingAfterThisPay,
            paymentMode: p.method || 'Cash',
            partyId: inv.customer_id,
            partyName: inv.customer_name,
            description: `Invoice #${inv.invoice_number}`,
            notes: p.notes,
            transactionDate: p.payment_date || inv.date,
          });

          reconciledPayments++;
          synced++;
        }
      }

      // 4. Counter Sales reconciliation
      const { data: sales } = await supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      for (const sale of (sales || [])) {
        await this.recordFinancialTransaction({
          referenceType: 'COUNTER_SALE',
          referenceId: sale.id,
          referenceNumber: sale.invoice_number || sale.sale_number,
          transactionType: 'SALE',
          direction: 'IN',
          amount: Number(sale.final_total) || 0,
          totalAmount: Number(sale.final_total) || 0,
          remainingAmount: Number(sale.balance_amount) || 0,
          paymentMode: sale.payment_method || 'Cash',
          partyName: sale.customer_name || 'Walk-in Customer',
          description: `Counter Sale #${sale.invoice_number || sale.sale_number}`,
          transactionDate: sale.sale_date,
        });
        synced++;
      }

      // 5. Operational expenses reconciliation
      try {
        const expReconcileRes = await expenseService.reconcileWithDaybook();
        synced += (expReconcileRes.reconciledCount || 0) + (expReconcileRes.updatedCount || 0);
      } catch (expErr) {
        console.warn('Expense reconcile notice in daybookService:', expErr);
      }
    } catch (e) {
      console.warn('Sync historical notice:', e);
    }

    return { syncedCount: synced, reconciledInvoices, reconciledPayments };
  }

  /**
   * Filter local fallback records
   */
  private getFilteredLocalTransactions(wsId: string, options?: DaybookFilterOptions): DaybookTransaction[] {
    const local = safeGetTenantStorage<DaybookTransaction>(LOCAL_DAYBOOK_KEY, []);
    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    return local.filter((t) => {
      if (t.workspaceId && wsId && t.workspaceId !== wsId) return false;
      if (start && t.transactionDate < start) return false;
      if (end && t.transactionDate > end) return false;
      if (options?.transactionType && options.transactionType !== 'ALL' && t.transactionType !== options.transactionType) return false;
      if (options?.paymentMode && options.paymentMode !== 'ALL' && t.paymentMode !== options.paymentMode) return false;
      return true;
    });
  }
}

export const daybookService = new DaybookService();
