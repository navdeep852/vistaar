import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { DaybookTransaction, DaybookFilterOptions, DaybookSummaryMetrics } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem } from './safeStorage';
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
          const buildDtQuery = (includeBranch: boolean) => {
            let q = supabase
              .from('daybook_transactions')
              .select('*', { count: 'exact' })
              .eq('workspace_id', wsId);

            if (includeBranch && options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
              q = q.eq('branch_id', options.branchId);
            }

            const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);
            if (start) q = q.gte('transaction_date', start);
            if (end) q = q.lte('transaction_date', end);

            if (options?.transactionType && options.transactionType !== 'ALL') {
              q = q.eq('transaction_type', options.transactionType);
            }

            if (options?.paymentStatus && options.paymentStatus !== 'ALL') {
              q = q.eq('payment_status', options.paymentStatus);
            }

            if (options?.paymentMode && options.paymentMode !== 'ALL') {
              q = q.eq('payment_mode', options.paymentMode);
            }

            if (options?.search && options.search.trim()) {
              const s = `%${options.search.trim()}%`;
              q = q.or(`transaction_code.ilike.${s},reference_number.ilike.${s},description.ilike.${s},party_name.ilike.${s}`);
            }

            return q.order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
          };

          let { data: dtData, error: dtErr } = await buildDtQuery(true);
          // If branch_id column does not exist in schema cache (42703), retry without branch_id
          if (dtErr && (dtErr.code === '42703' || dtErr.message?.includes('branch_id'))) {
            const retryRes = await buildDtQuery(false);
            dtData = retryRes.data;
            dtErr = retryRes.error;
          }

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
        if (t.id) seenIds.add(t.id.toLowerCase().trim());
        if (t.referenceType && t.referenceId) seenRefKeys.add(`${t.referenceType}:${t.referenceId}`.toLowerCase().trim());
        if (t.referenceType && t.referenceNumber) seenRefKeys.add(`${t.referenceType}:${t.referenceNumber}`.toLowerCase().trim());
        if (t.transactionCode) seenRefKeys.add(`CODE:${t.transactionCode}`.toLowerCase().trim());
      });

      for (const lt of local) {
        const idKey = lt.id ? lt.id.toLowerCase().trim() : '';
        const refIdKey = lt.referenceType && lt.referenceId ? `${lt.referenceType}:${lt.referenceId}`.toLowerCase().trim() : '';
        const refNumKey = lt.referenceType && lt.referenceNumber ? `${lt.referenceType}:${lt.referenceNumber}`.toLowerCase().trim() : '';
        const codeKey = lt.transactionCode ? `CODE:${lt.transactionCode}`.toLowerCase().trim() : '';

        const isDuplicate =
          (idKey && seenIds.has(idKey)) ||
          (refIdKey && seenRefKeys.has(refIdKey)) ||
          (refNumKey && seenRefKeys.has(refNumKey)) ||
          (codeKey && seenRefKeys.has(codeKey));

        if (!isDuplicate) {
          if (idKey) seenIds.add(idKey);
          if (refIdKey) seenRefKeys.add(refIdKey);
          if (refNumKey) seenRefKeys.add(refNumKey);
          if (codeKey) seenRefKeys.add(codeKey);
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
    const effectiveBranchId = options?.branchId !== undefined ? options.branchId : (safeGetTenantItem('active_branch_id') || undefined);
    const mainBranchId = safeGetTenantItem('main_branch_id');
    const isMainBranch = !effectiveBranchId || effectiveBranchId === 'ALL' || effectiveBranchId === mainBranchId || String(effectiveBranchId).toLowerCase().includes('main');

    // 1. Collect Invoices from Supabase and Local Store
    const invoiceMap = new Map<string, any>(); // key: id and invoice_number
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let invQ = supabase
          .from('invoices')
          .select('id, invoice_number, grand_total, paid_amount, balance_amount, status, date, due_date, customer_id, customer_name, customer_phone, created_at, branch_id')
          .eq('workspace_id', wsId);

        if (effectiveBranchId && effectiveBranchId !== 'ALL' && isValidUuid(effectiveBranchId)) {
          invQ = invQ.eq('branch_id', effectiveBranchId);
        }

        const { data: dbInvs } = await invQ;

        (dbInvs || []).forEach((inv: any) => {
          const b = inv.branch_id || inv.branchId;
          if (effectiveBranchId && effectiveBranchId !== 'ALL') {
            if (b ? b !== effectiveBranchId : !isMainBranch) return;
          }
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
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          const b = inv.branchId || (inv as any).branch_id;
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        const row = {
          id: inv.id,
          invoice_number: inv.invoiceNumber,
          branch_id: inv.branchId,
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

    // 1b. Collect Counter Sales from Supabase, Store, and Local Storage
    const counterSaleMap = new Map<string, any>();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let csQ = supabase
          .from('counter_sales')
          .select('id, sale_number, invoice_number, branch_id, customer_id, customer_name, final_total, amount_received, balance_amount, status, payment_method, sale_date, created_at')
          .eq('workspace_id', wsId);

        if (effectiveBranchId && effectiveBranchId !== 'ALL' && isValidUuid(effectiveBranchId)) {
          csQ = csQ.eq('branch_id', effectiveBranchId);
        }

        let { data: dbCs, error: csErr } = await csQ;

        if (csErr && csErr.code === '42703') {
          const fb = await supabase
            .from('counter_sales')
            .select('id, sale_number, invoice_number, customer_id, customer_name, final_total, amount_received, balance_amount, status, payment_method, sale_date, created_at')
            .eq('workspace_id', wsId);
          dbCs = fb.data;
        }

        (dbCs || []).forEach((cs: any) => {
          const b = cs.branch_id || cs.branchId;
          if (effectiveBranchId && effectiveBranchId !== 'ALL') {
            if (b ? b !== effectiveBranchId : !isMainBranch) return;
          }
          if (cs.id) counterSaleMap.set(cs.id, cs);
          if (cs.sale_number) counterSaleMap.set(cs.sale_number, cs);
          if (cs.invoice_number) counterSaleMap.set(cs.invoice_number, cs);
        });
      }
    } catch {
      // ignore
    }

    try {
      const { store } = await import('../store');
      store.getCounterSales().forEach((cs) => {
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          const b = cs.branchId || (cs as any).branch_id;
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        const row = {
          id: cs.id,
          sale_number: cs.saleNumber,
          invoice_number: cs.invoiceNumber,
          branch_id: cs.branchId,
          customer_id: cs.customerId,
          customer_name: cs.customerName,
          final_total: cs.finalTotal,
          amount_received: cs.amountReceived !== undefined ? cs.amountReceived : cs.finalTotal,
          balance_amount: cs.balanceAmount !== undefined ? cs.balanceAmount : 0,
          status: cs.status,
          payment_method: cs.paymentMethod,
          sale_date: cs.saleDate,
          created_at: cs.createdAt,
        };
        if (cs.id && !counterSaleMap.has(cs.id)) counterSaleMap.set(cs.id, row);
        if (cs.saleNumber && !counterSaleMap.has(cs.saleNumber)) counterSaleMap.set(cs.saleNumber, row);
        if (cs.invoiceNumber && !counterSaleMap.has(cs.invoiceNumber)) counterSaleMap.set(cs.invoiceNumber, row);
      });
    } catch {
      // ignore
    }

    try {
      const localCS = safeGetTenantStorage<any>('vistaar_local_counter_sales_db', []);
      localCS.forEach((cs: any) => {
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          const b = cs.branchId || cs.branch_id;
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        const row = {
          id: cs.id,
          sale_number: cs.saleNumber || cs.sale_number,
          invoice_number: cs.invoiceNumber || cs.invoice_number,
          branch_id: cs.branchId || cs.branch_id,
          customer_id: cs.customerId || cs.customer_id,
          customer_name: cs.customerName || cs.customer_name,
          final_total: cs.finalTotal ?? cs.final_total,
          amount_received: cs.amountReceived ?? cs.amount_received ?? cs.finalTotal ?? cs.final_total,
          balance_amount: cs.balanceAmount ?? cs.balance_amount ?? 0,
          status: cs.status,
          payment_method: cs.paymentMethod || cs.payment_method,
          sale_date: cs.saleDate || cs.sale_date,
          created_at: cs.createdAt || cs.created_at,
        };
        const sId = cs.id;
        const sNum = cs.saleNumber || cs.sale_number;
        const iNum = cs.invoiceNumber || cs.invoice_number;
        if (sId && !counterSaleMap.has(sId)) counterSaleMap.set(sId, row);
        if (sNum && !counterSaleMap.has(sNum)) counterSaleMap.set(sNum, row);
        if (iNum && !counterSaleMap.has(iNum)) counterSaleMap.set(iNum, row);
      });
    } catch {
      // ignore
    }

    // 2. Collect Payments from Supabase and Local Store
    const paymentsList: any[] = [];
    const seenPaymentKeys = new Set<string>();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let payQ = supabase
          .from('payments')
          .select('id, payment_number, invoice_id, invoice_number, amount, payment_date, method, customer_id, customer_name, reference_no, notes, created_at, branch_id')
          .eq('workspace_id', wsId);

        if (effectiveBranchId && effectiveBranchId !== 'ALL' && isValidUuid(effectiveBranchId)) {
          payQ = payQ.eq('branch_id', effectiveBranchId);
        }

        const { data: dbPays } = await payQ;

        (dbPays || []).forEach((p: any) => {
          const b = p.branch_id || p.branchId;
          if (effectiveBranchId && effectiveBranchId !== 'ALL') {
            if (b ? b !== effectiveBranchId : !isMainBranch) return;
          }
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
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          const b = p.branchId || (p as any).branch_id;
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        const k = p.id || `${p.invoiceId}:${p.paymentNumber}:${p.amount}`;
        if (!seenPaymentKeys.has(k)) {
          seenPaymentKeys.add(k);
          paymentsList.push({
            id: p.id,
            payment_number: p.paymentNumber,
            invoice_id: p.invoiceId,
            invoice_number: p.invoiceNumber,
            branch_id: p.branchId,
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

    // Identify upfront payments that are absorbed by the primary document (Invoice or Counter Sale)
    const upfrontPaymentIds = new Set<string>();
    const counterSalePaymentIds = new Set<string>();

    // Counter sale payments in paymentsList are absorbed by the COUNTER_SALE entry
    for (const p of paymentsList) {
      if (p.counter_sale_id || p.counter_sale_number) {
        if (p.id) counterSalePaymentIds.add(String(p.id).toLowerCase().trim());
      }
    }

    // For each invoice, determine the initial upfront payment
    for (const [, pList] of paymentsByInvoice.entries()) {
      if (!pList || pList.length === 0) continue;
      const firstPay = pList[0];
      if (firstPay && firstPay.id) {
        const linkedInv = firstPay.invoice_id ? invoiceMap.get(firstPay.invoice_id) : (firstPay.invoice_number ? invoiceMap.get(firstPay.invoice_number) : null);
        const invPaid = linkedInv ? Number(linkedInv.paid_amount) || 0 : 0;
        const firstAmt = Number(firstPay.amount) || 0;
        if (firstAmt > 0 && (pList.length === 1 || Math.abs(firstAmt - invPaid) < 0.01 || (linkedInv?.date && firstPay.payment_date && firstPay.payment_date <= linkedInv.date))) {
          upfrontPaymentIds.add(String(firstPay.id).toLowerCase().trim());
        }
      }
    }

    const unifiedList: DaybookTransaction[] = [];

    // 4. Enrich existing transactions
    for (const tx of existingTxList) {
      if (tx.status === 'VOID' || tx.paymentStatus === 'CANCELLED') {
        unifiedList.push(tx);
        continue;
      }

      // Check Counter Sale
      if (tx.referenceType === 'COUNTER_SALE') {
        let linkedCs = tx.referenceId ? counterSaleMap.get(tx.referenceId) : null;
        if (!linkedCs && tx.referenceNumber) linkedCs = counterSaleMap.get(tx.referenceNumber);
        if (linkedCs) {
          const finalTot = Number(linkedCs.final_total) || 0;
          tx.totalAmount = finalTot > 0 ? finalTot : (tx.totalAmount || tx.amount);
          const csBal = Number(linkedCs.balance_amount) ?? 0;
          tx.remainingAmount = csBal;
          tx.paymentStatus = csBal <= 0.01 ? 'PAID' : (tx.amount > 0 ? 'PARTIALLY PAID' : 'UNPAID');
        }
        unifiedList.push(tx);
        continue;
      }

      // Check Invoice
      let linkedInv = tx.referenceId ? invoiceMap.get(tx.referenceId) : null;
      if (!linkedInv && tx.referenceNumber) {
        linkedInv = invoiceMap.get(tx.referenceNumber);
      }

      if (tx.referenceType === 'INVOICE') {
        if (linkedInv) {
          const grandTotal = Number(linkedInv.grand_total) || 0;
          tx.totalAmount = grandTotal > 0 ? grandTotal : (tx.totalAmount || tx.amount);
          const invPaid = Number(linkedInv.paid_amount) || 0;
          const invBal = Number(linkedInv.balance_amount) ?? Math.max(0, grandTotal - invPaid);
          tx.remainingAmount = invBal;
          tx.paymentStatus = invBal <= 0.01 ? 'PAID' : (invPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          // If entry has amount 0 but invoice was paid, restore the initial inflow
          if ((tx.amount === 0 || tx.amount === null || tx.amount === undefined) && invPaid > 0) {
            const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];
            const firstAmt = invPayments.length > 0 ? Number(invPayments[0].amount) || 0 : invPaid;
            tx.amount = firstAmt > 0 ? firstAmt : invPaid;
          }
        }
        unifiedList.push(tx);
        continue;
      }

      if (tx.referenceType === 'PAYMENT' || tx.transactionType === 'CUSTOMER_PAYMENT') {
        const payRefId = (tx.referenceId || '').toLowerCase().trim();
        const payRefNum = (tx.referenceNumber || '').toLowerCase().trim();

        // 1. If payment is linked to a Counter Sale, Counter Sale entry already represents the cash receipt -> DROP
        if (counterSalePaymentIds.has(payRefId) || counterSaleMap.has(payRefId) || counterSaleMap.has(payRefNum)) {
          continue;
        }

        // 2. If payment is the upfront payment for an Invoice, Invoice entry already represents the initial receipt -> DROP
        if (upfrontPaymentIds.has(payRefId)) {
          continue;
        }

        if (linkedInv) {
          const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];
          if (invPayments.length > 0 && invPayments[0].id && String(invPayments[0].id).toLowerCase().trim() === payRefId) {
            continue; // Upfront payment absorbed by invoice
          }
        }

        // 3. This is a genuine SUBSEQUENT payment (e.g. Scenario C)
        if (linkedInv) {
          const grandTotal = Number(linkedInv.grand_total) || 0;
          tx.totalAmount = grandTotal > 0 ? grandTotal : (tx.totalAmount || tx.amount);
          const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];
          let cumulativePaid = 0;
          for (const p of invPayments) {
            cumulativePaid += Number(p.amount) || 0;
            if (p.id === tx.referenceId || (p.payment_date && tx.transactionDate && p.payment_date <= tx.transactionDate && Number(p.amount) === tx.amount)) {
              break;
            }
          }
          if (cumulativePaid === 0) {
            cumulativePaid = Number(tx.amount) || 0;
          }
          tx.remainingAmount = Math.max(0, Number((grandTotal - cumulativePaid).toFixed(2)));
          tx.paymentStatus = tx.remainingAmount <= 0.01 ? 'PAID' : 'PARTIALLY PAID';
        }
        unifiedList.push(tx);
        continue;
      }

      // Other transaction types (EXPENSE, etc.)
      unifiedList.push(tx);
    }

    // 5. Synthesize any missing SUBSEQUENT payments from payments table (e.g. Payment 2 made later)
    for (const p of paymentsList) {
      const pId = String(p.id || '').toLowerCase().trim();
      const pAmt = Number(p.amount) || 0;

      // Do not synthesize upfront payments or counter sale receipts
      if (counterSalePaymentIds.has(pId) || upfrontPaymentIds.has(pId)) {
        continue;
      }

      const linkedInv = p.invoice_id ? invoiceMap.get(p.invoice_id) : (p.invoice_number ? invoiceMap.get(p.invoice_number) : null);
      if (!linkedInv) continue;

      const invPayments = paymentsByInvoice.get(linkedInv.id) || paymentsByInvoice.get(linkedInv.invoice_number) || [];
      // If this is the first payment of the invoice and was already absorbed by the invoice entry, skip
      if (invPayments.length > 0 && invPayments[0].id && String(invPayments[0].id).toLowerCase().trim() === pId) {
        continue;
      }

      const isAlreadyRepresented =
        seenPaymentIdsInTx.has(p.id) ||
        seenTxKeys.has(`PAYMENT:${p.id}`) ||
        seenTxKeys.has(`db-pay-${p.id}`) ||
        unifiedList.some(
          (t) =>
            (t.referenceType === 'PAYMENT' || t.transactionType === 'CUSTOMER_PAYMENT') &&
            (t.referenceId === p.id || (t.referenceNumber === linkedInv.invoice_number && Math.abs(t.amount - pAmt) < 0.01 && t.transactionDate === (p.payment_date || '').split('T')[0]))
        );

      if (isAlreadyRepresented) {
        continue;
      }

      const pDate = (p.payment_date || p.created_at || '').split('T')[0];
      const grandTotal = Number(linkedInv.grand_total) || 0;

      let cumulativePaid = 0;
      for (const invP of invPayments) {
        cumulativePaid += Number(invP.amount) || 0;
        if (invP.id === p.id) break;
      }
      if (cumulativePaid === 0) {
        cumulativePaid = pAmt;
      }

      const remaining = Math.max(0, Number((grandTotal - cumulativePaid).toFixed(2)));
      const pStatus = remaining <= 0.01 ? 'PAID' : 'PARTIALLY PAID';

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
        const invPayments = paymentsByInvoice.get(inv.id) || paymentsByInvoice.get(inv.invoice_number) || [];
        const grandTotal = Number(inv.grand_total) || 0;
        const paid = Number(inv.paid_amount) || 0;
        const remaining = Number(inv.balance_amount) || Math.max(0, grandTotal - paid);
        const pStatus = remaining <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        // Upfront payment is represented on the synthesized invoice entry; subsequent payments are synthesized separately
        const firstPayAmt = invPayments.length > 0 ? Number(invPayments[0].amount) || 0 : paid;
        const effectiveInflow = firstPayAmt > 0 ? firstPayAmt : paid;

        unifiedList.push({
          id: `db-syn-inv-${inv.id}`,
          workspaceId: wsId,
          transactionCode: inv.invoice_number || `INV-${inv.id.substring(0, 8)}`,
          transactionDate: (inv.date || '').split('T')[0] || new Date().toISOString().split('T')[0],
          transactionType: 'SALE',
          direction: 'IN',
          amount: effectiveInflow,
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

    // 6b. Synthesize any missing Counter Sales
    for (const [csIdOrNum, cs] of counterSaleMap.entries()) {
      if (csIdOrNum !== cs.id) continue;
      if (cs.status === 'Cancelled' || cs.status === 'CANCELLED') continue;

      const csRefKey = `COUNTER_SALE:${cs.id}`;
      const csNumRefKey = `COUNTER_SALE:${cs.sale_number}`;
      const hasCsTx = seenTxKeys.has(csRefKey) || seenTxKeys.has(csNumRefKey) || unifiedList.some((t) => t.referenceId === cs.id || t.referenceNumber === cs.sale_number || t.referenceNumber === cs.invoice_number);

      if (!hasCsTx) {
        const finalTot = Number(cs.final_total) || 0;
        const isCredit = ['Credit', 'Credit / Udhari', 'Udhari'].includes(cs.payment_method);
        const recAmt = Number(cs.amount_received !== undefined ? cs.amount_received : (isCredit ? 0 : finalTot)) || 0;
        const balAmt = Number(cs.balance_amount !== undefined ? cs.balance_amount : (isCredit ? finalTot : 0)) || 0;
        const pStatus = balAmt <= 0.01 ? 'PAID' : (recAmt > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        unifiedList.push({
          id: `db-syn-cs-${cs.id}`,
          workspaceId: wsId,
          branchId: cs.branch_id,
          transactionCode: cs.sale_number || cs.invoice_number || `CS-${cs.id.substring(0, 8)}`,
          transactionDate: (cs.sale_date || '').split('T')[0] || new Date().toISOString().split('T')[0],
          transactionType: 'SALE',
          direction: 'IN',
          amount: recAmt,
          totalAmount: finalTot,
          remainingAmount: balAmt,
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

    // 6c. Collect & Synthesize Expenses from Supabase, Store, and Local Storage
    const expensesList: any[] = [];
    const seenExpenseIds = new Set<string>();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let expQ = supabase
          .from('expenses')
          .select('*')
          .eq('workspace_id', wsId);

        let { data: dbExps, error: expErr } = await expQ;
        if (!expErr && dbExps) {
          dbExps.forEach((e: any) => {
            const b = e.branch_id || e.branchId;
            if (effectiveBranchId && effectiveBranchId !== 'ALL') {
              if (b ? b !== effectiveBranchId : !isMainBranch) return;
            }
            if (!seenExpenseIds.has(e.id)) {
              seenExpenseIds.add(e.id);
              expensesList.push(e);
            }
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const { store } = await import('../store');
      (store.getExpenses() || []).forEach((e: any) => {
        const b = e.branchId || e.branch_id;
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        if (e.id && !seenExpenseIds.has(e.id)) {
          seenExpenseIds.add(e.id);
          expensesList.push(e);
        }
      });
    } catch {
      // ignore
    }

    try {
      const localExps = safeGetTenantStorage<any>('vistaar_local_expenses_db', []);
      localExps.forEach((e: any) => {
        const b = e.branchId || e.branch_id;
        if (effectiveBranchId && effectiveBranchId !== 'ALL') {
          if (b ? b !== effectiveBranchId : !isMainBranch) return;
        }
        if (e.id && !seenExpenseIds.has(e.id)) {
          seenExpenseIds.add(e.id);
          expensesList.push(e);
        }
      });
    } catch {
      // ignore
    }

    for (const exp of expensesList) {
      const expRefKey = `EXPENSE:${exp.id}`;
      const hasExpTx = seenTxKeys.has(expRefKey) || seenTxKeys.has(exp.id) || unifiedList.some((t) => t.referenceId === exp.id && t.referenceType === 'EXPENSE');

      if (!hasExpTx) {
        const amt = Number(exp.amount) || 0;
        const eDate = (exp.date || exp.expense_date || exp.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0];
        const desc = exp.expenseName || exp.expense_name ? `${exp.category}: ${exp.expenseName || exp.expense_name}` : `${exp.category || 'Operational'} Expense`;
        const party = exp.paidTo || exp.paid_to || exp.category || 'Operational Vendor';
        const mode = exp.paymentMode || exp.payment_mode || 'Cash';
        const isPaid = (exp.status || 'PAID').toUpperCase() !== 'UNPAID';

        unifiedList.push({
          id: `db-syn-exp-${exp.id}`,
          workspaceId: wsId,
          branchId: exp.branchId || exp.branch_id,
          transactionCode: `EXP-${(exp.referenceNo || exp.reference_no || exp.id).substring(0, 8)}`,
          transactionDate: eDate,
          transactionType: 'EXPENSE',
          direction: 'OUT',
          amount: amt,
          totalAmount: amt,
          remainingAmount: 0,
          paymentStatus: isPaid ? 'PAID' : 'UNPAID',
          paymentMode: mode as any,
          partyType: 'other',
          partyName: party,
          referenceType: 'EXPENSE',
          referenceId: exp.id,
          referenceNumber: exp.referenceNo || exp.reference_no || exp.category,
          description: desc,
          notes: exp.notes,
          status: 'COMPLETED',
          createdAt: exp.created_at || exp.createdAt,
        });

        seenTxKeys.add(expRefKey);
        seenTxKeys.add(exp.id);
      }
    }

    // 7. Robust Deduplication and Financial Event Isolation
    // Pass 1: Identify all invoices and counter sales that have distinct payment records
    const invoiceNumbersWithPayments = new Set<string>();
    const invoiceIdsWithPayments = new Set<string>();
    const counterSaleNumbersWithPayments = new Set<string>();
    const counterSaleIdsWithPayments = new Set<string>();

    // First populate from paymentsList directly (authoritative source)
    for (const p of paymentsList) {
      if (p.invoice_id) invoiceIdsWithPayments.add(String(p.invoice_id).toLowerCase().trim());
      if (p.invoice_number) invoiceNumbersWithPayments.add(String(p.invoice_number).toLowerCase().trim());
      if (p.counter_sale_id) counterSaleIdsWithPayments.add(String(p.counter_sale_id).toLowerCase().trim());
      if (p.counter_sale_number) counterSaleNumbersWithPayments.add(String(p.counter_sale_number).toLowerCase().trim());
    }

    // Also populate from unified list payments
    for (const tx of unifiedList) {
      if (tx.status === 'VOID' || tx.paymentStatus === 'CANCELLED') continue;
      const isPayTx = tx.referenceType === 'PAYMENT' || tx.transactionType === 'CUSTOMER_PAYMENT';
      if (isPayTx && tx.amount > 0) {
        if (tx.referenceNumber) {
          const numKey = tx.referenceNumber.toLowerCase().trim();
          invoiceNumbersWithPayments.add(numKey);
          counterSaleNumbersWithPayments.add(numKey);
        }
        // Link to invoice map to resolve underlying invoice ID
        const linkedInv = tx.referenceId ? invoiceMap.get(tx.referenceId) : (tx.referenceNumber ? invoiceMap.get(tx.referenceNumber) : null);
        if (linkedInv?.id) invoiceIdsWithPayments.add(String(linkedInv.id).toLowerCase().trim());
        if (linkedInv?.invoice_number) invoiceNumbersWithPayments.add(String(linkedInv.invoice_number).toLowerCase().trim());
      }
    }

    // Also check paymentsByInvoice map
    for (const [key, pList] of paymentsByInvoice.entries()) {
      if (pList && pList.length > 0) {
        const k = key.toLowerCase().trim();
        invoiceNumbersWithPayments.add(k);
        invoiceIdsWithPayments.add(k);
      }
    }

    const finalFiltered: DaybookTransaction[] = [];
    const seenPaymentEventKeys = new Set<string>();
    const seenInvoiceSaleRefs = new Set<string>();
    const seenCounterSaleRefs = new Set<string>();

    for (const tx of unifiedList) {
      if (tx.status === 'VOID' || tx.paymentStatus === 'CANCELLED') {
        finalFiltered.push(tx);
        continue;
      }

      // 1. COUNTER_SALE rows:
      // Authoritative POS cash sale entry. Inflow is preserved.
      if (tx.referenceType === 'COUNTER_SALE') {
        const csKey = (tx.referenceNumber || tx.referenceId || tx.id).toLowerCase().trim();
        if (seenCounterSaleRefs.has(csKey)) {
          continue; // Drop duplicate counter sale row
        }
        seenCounterSaleRefs.add(csKey);
        if (tx.referenceNumber) seenCounterSaleRefs.add(tx.referenceNumber.toLowerCase().trim());
        if (tx.referenceId) seenCounterSaleRefs.add(tx.referenceId.toLowerCase().trim());
        finalFiltered.push(tx);
        continue;
      }

      // 2. INVOICE commercial sale rows:
      // Primary document entry carrying initial upfront payment and grand total. Inflow is preserved.
      if (tx.referenceType === 'INVOICE') {
        const invKey = (tx.referenceNumber || tx.referenceId || tx.id).toLowerCase().trim();
        if (seenInvoiceSaleRefs.has(invKey)) {
          continue; // Drop duplicate invoice row
        }
        seenInvoiceSaleRefs.add(invKey);
        if (tx.referenceNumber) seenInvoiceSaleRefs.add(tx.referenceNumber.toLowerCase().trim());
        if (tx.referenceId) seenInvoiceSaleRefs.add(tx.referenceId.toLowerCase().trim());
        finalFiltered.push(tx);
        continue;
      }

      // 3. PAYMENT rows:
      if (tx.referenceType === 'PAYMENT' || tx.transactionType === 'CUSTOMER_PAYMENT') {
        const refNumKey = (tx.referenceNumber || '').toLowerCase().trim();
        const refIdKey = (tx.referenceId || '').toLowerCase().trim();

        // If this payment is linked to a Counter Sale that already recorded the inflow, DROP IT
        if ((refNumKey && seenCounterSaleRefs.has(refNumKey)) || (refIdKey && seenCounterSaleRefs.has(refIdKey)) || counterSalePaymentIds.has(refIdKey)) {
          continue;
        }

        // If this payment is the upfront payment for an invoice, it is already absorbed by the invoice row -> DROP IT
        if (upfrontPaymentIds.has(refIdKey)) {
          continue;
        }

        // Check for duplicate representation of the exact same payment event
        const stableEventKey = tx.referenceId ? `PAY_REF:${tx.referenceId.toLowerCase().trim()}` : `PAY_CODE:${tx.transactionCode.toLowerCase().trim()}`;
        if (seenPaymentEventKeys.has(stableEventKey)) {
          continue;
        }

        seenPaymentEventKeys.add(stableEventKey);
        finalFiltered.push(tx);
        continue;
      }

      // Other transaction types (EXPENSE, SALARY, ADJUSTMENT, etc.)
      finalFiltered.push(tx);
    }

    // 8. Apply User Filters (Date bounds, Type, Status, Mode, Search, Branch)
    const result = finalFiltered.filter((tx) => {
      if (options?.branchId && options.branchId !== 'ALL') {
        const txBId = (tx as any).branchId || (tx as any).branch_id;
        if (txBId ? txBId !== options.branchId : !isMainBranch) return false;
      }
      const txDate = (tx.transactionDate || '').split('T')[0];
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;

      if (options?.transactionType && options.transactionType !== 'ALL') {
        if (options.transactionType === 'SALE') {
          if (tx.transactionType !== 'SALE' && tx.transactionType !== 'CUSTOMER_PAYMENT' && tx.referenceType !== 'INVOICE' && tx.referenceType !== 'PAYMENT' && tx.referenceType !== 'COUNTER_SALE') {
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
      if (options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
        csQuery = csQuery.eq('branch_id', options.branchId);
      }

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
            branchId: cs.branch_id,
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
      if (options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
        invQuery = invQuery.eq('branch_id', options.branchId);
      }

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
        // STRICT ACCOUNTING RULE:
        // Cash Outflow represents actual money disbursed.
        // Unpaid expenses/transactions are liabilities, not cash outflow!
        if (tx.paymentStatus !== 'UNPAID') {
          totalOutflow += amt;
          modeBreakdown[mode] = (modeBreakdown[mode] || 0) - amt;
        }
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
    branchId?: string;
    referenceType: 'COUNTER_SALE' | 'PAYMENT' | 'EXPENSE' | 'UDHARI_PAYMENT' | 'INVOICE' | 'SALARY' | 'MANUAL';
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
          branch_id: params.branchId && isValidUuid(params.branchId) ? params.branchId : null,
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
            delete dtPayload.branch_id;
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
            delete dtPayload.branch_id;
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
      branchId: params.branchId,
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
    branchId?: string;
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
      branchId: payload.branchId,
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

          // Ensure local daybook sale entry has totalAmount and initial inflow
          const dbSaleIdx = localDaybook.findIndex((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber));
          const initialInflow = invPays.length > 0 ? Number(invPays[0].amount) || 0 : (inv.paidAmount || 0);
          if (dbSaleIdx >= 0) {
            localDaybook[dbSaleIdx].totalAmount = inv.grandTotal;
            localDaybook[dbSaleIdx].amount = initialInflow;
            localDaybook[dbSaleIdx].remainingAmount = expectedBal;
            synced++;
          }

          // Remove any duplicate upfront payment entry in localDaybook
          if (invPays.length > 0 && invPays[0].id) {
            const dupPayIdx = localDaybook.findIndex((t) => t.referenceType === 'PAYMENT' && t.referenceId === invPays[0].id);
            if (dupPayIdx >= 0) {
              localDaybook.splice(dupPayIdx, 1);
            }
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
        // The first payment (upfront payment) is carried by the primary INVOICE entry.
        // Subsequent payments (index >= 1) create separate CUSTOMER_PAYMENT Daybook rows.
        let runningCumulativePaid = 0;
        for (let i = 0; i < invPays.length; i++) {
          const p = invPays[i];
          const pAmt = Number(p.amount) || 0;
          runningCumulativePaid += pAmt;
          const remainingAfterThisPay = Math.max(0, Number((grandTotal - runningCumulativePaid).toFixed(2)));

          if (i === 0) {
            // Upfront payment: Ensure existingSale carries this initial inflow
            if (existingSale) {
              await supabase
                .from('daybook_transactions')
                .update({
                  amount: pAmt,
                  total_amount: grandTotal,
                  remaining_amount: expectedBal,
                  payment_status: expectedStatus.toUpperCase(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingSale.id);
            }
            // Safely delete duplicate upfront payment row from daybook_transactions if it exists
            await supabase
              .from('daybook_transactions')
              .delete()
              .eq('workspace_id', wsId)
              .eq('reference_type', 'PAYMENT')
              .eq('reference_id', p.id);
          } else {
            // Subsequent payment (Scenario C)
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
      }

      // 4. Counter Sales reconciliation
      const { data: sales } = await supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      for (const sale of (sales || [])) {
        const isCredit = ['Credit', 'Credit / Udhari', 'Udhari'].includes(sale.payment_method);
        const recAmt = Number(sale.amount_received !== undefined ? sale.amount_received : (isCredit ? 0 : sale.final_total)) || 0;
        const balAmt = Number(sale.balance_amount !== undefined ? sale.balance_amount : (isCredit ? sale.final_total : 0)) || 0;

        await this.recordFinancialTransaction({
          referenceType: 'COUNTER_SALE',
          referenceId: sale.id,
          referenceNumber: sale.invoice_number || sale.sale_number,
          transactionType: 'SALE',
          direction: 'IN',
          amount: recAmt,
          totalAmount: Number(sale.final_total) || 0,
          remainingAmount: balAmt,
          paymentMode: sale.payment_method || 'Cash',
          partyName: sale.customer_name || 'Walk-in Customer',
          description: `Counter Sale #${sale.invoice_number || sale.sale_number}`,
          transactionDate: sale.sale_date,
        });

        // Clean up any duplicate payment rows in daybook_transactions for this counter sale
        await supabase
          .from('daybook_transactions')
          .delete()
          .eq('workspace_id', wsId)
          .eq('reference_type', 'PAYMENT')
          .or(`reference_id.eq.${sale.id},reference_number.eq.${sale.invoice_number || sale.sale_number}`);

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
    const mainBranchId = safeGetTenantItem('main_branch_id');
    const isMainBranch = !options?.branchId || options.branchId === 'ALL' || options.branchId === mainBranchId || String(options.branchId).toLowerCase().includes('main');

    return local.filter((t) => {
      if (t.workspaceId && wsId && t.workspaceId !== wsId) return false;
      if (options?.branchId && options.branchId !== 'ALL') {
        const entryBranch = t.branchId || (t as any).branch_id;
        if (entryBranch ? entryBranch !== options.branchId : !isMainBranch) return false;
      }
      if (start && t.transactionDate < start) return false;
      if (end && t.transactionDate > end) return false;
      if (options?.transactionType && options.transactionType !== 'ALL' && t.transactionType !== options.transactionType) return false;
      if (options?.paymentMode && options.paymentMode !== 'ALL' && t.paymentMode !== options.paymentMode) return false;
      return true;
    });
  }

  /**
   * Authoritative Cleanup of Duplicate Daybook Records
   * Safely eliminates redundant upfront payment records without deleting genuine subsequent payments.
   */
  public async cleanDaybookDuplicates(): Promise<{ cleanedCount: number; details: string[] }> {
    let cleanedCount = 0;
    const details: string[] = [];
    const wsId = await this.getWorkspaceId();

    // 1. Clean local storage duplicates
    try {
      const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
      const invoiceSaleMap = new Map<string, any>();
      const csSaleMap = new Map<string, any>();

      local.forEach((t: any) => {
        if (t.referenceType === 'INVOICE') {
          if (t.referenceNumber) invoiceSaleMap.set(t.referenceNumber.toLowerCase().trim(), t);
          if (t.referenceId) invoiceSaleMap.set(t.referenceId.toLowerCase().trim(), t);
        } else if (t.referenceType === 'COUNTER_SALE') {
          if (t.referenceNumber) csSaleMap.set(t.referenceNumber.toLowerCase().trim(), t);
          if (t.referenceId) csSaleMap.set(t.referenceId.toLowerCase().trim(), t);
        }
      });

      const cleanedLocal = local.filter((t: any) => {
        if (t.referenceType === 'PAYMENT' || t.transactionType === 'CUSTOMER_PAYMENT') {
          const numKey = (t.referenceNumber || '').toLowerCase().trim();
          const idKey = (t.referenceId || '').toLowerCase().trim();

          // If linked to Counter Sale, drop duplicate payment
          if (csSaleMap.has(numKey) || csSaleMap.has(idKey)) {
            cleanedCount++;
            details.push(`Cleaned local counter sale payment duplicate: ${t.transactionCode || t.id}`);
            return false;
          }

          // If linked to Invoice and invoice entry has same amount / is upfront payment
          const matchingInv = invoiceSaleMap.get(numKey) || invoiceSaleMap.get(idKey);
          if (matchingInv) {
            const invInflow = Number(matchingInv.amount) || 0;
            const payAmt = Number(t.amount) || 0;
            if (invInflow === 0 && payAmt > 0) {
              matchingInv.amount = payAmt;
              cleanedCount++;
              details.push(`Absorbed upfront payment ${t.transactionCode} into invoice ${matchingInv.referenceNumber}`);
              return false;
            } else if (invInflow > 0 && Math.abs(invInflow - payAmt) < 0.01) {
              cleanedCount++;
              details.push(`Cleaned local upfront invoice payment duplicate: ${t.transactionCode || t.id}`);
              return false;
            }
          }
        }
        return true;
      });

      if (cleanedLocal.length !== local.length) {
        safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, cleanedLocal);
      }
    } catch (e: any) {
      console.warn('[cleanDaybookDuplicates] Local cleanup notice:', e);
    }

    // 2. Clean Supabase database duplicates if configured
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data: dbTxs } = await supabase
          .from('daybook_transactions')
          .select('*')
          .eq('workspace_id', wsId);

        if (dbTxs && dbTxs.length > 0) {
          const invEntries = new Map<string, any>();
          const csEntries = new Map<string, any>();
          const paymentsToDelete: string[] = [];

          dbTxs.forEach((t: any) => {
            if (t.reference_type === 'INVOICE') {
              if (t.reference_number) invEntries.set(t.reference_number.toLowerCase().trim(), t);
              if (t.reference_id) invEntries.set(t.reference_id.toLowerCase().trim(), t);
            } else if (t.reference_type === 'COUNTER_SALE') {
              if (t.reference_number) csEntries.set(t.reference_number.toLowerCase().trim(), t);
              if (t.reference_id) csEntries.set(t.reference_id.toLowerCase().trim(), t);
            }
          });

          for (const t of dbTxs) {
            if (t.reference_type === 'PAYMENT' || t.transaction_type === 'CUSTOMER_PAYMENT') {
              const numKey = (t.reference_number || '').toLowerCase().trim();
              const idKey = (t.reference_id || '').toLowerCase().trim();

              // Counter sale duplicate
              if (csEntries.has(numKey) || csEntries.has(idKey)) {
                paymentsToDelete.push(t.id);
                cleanedCount++;
                details.push(`Cleaned DB counter sale payment duplicate: ${t.id} (${t.transaction_code})`);
                continue;
              }

              // Invoice upfront duplicate
              const matchingInv = invEntries.get(numKey) || invEntries.get(idKey);
              if (matchingInv) {
                const invInflow = Number(matchingInv.amount) || 0;
                const payAmt = Number(t.amount) || 0;
                if (invInflow === 0 && payAmt > 0) {
                  // Restore initial inflow on invoice row
                  await supabase
                    .from('daybook_transactions')
                    .update({ amount: payAmt, updated_at: new Date().toISOString() })
                    .eq('id', matchingInv.id);
                  paymentsToDelete.push(t.id);
                  cleanedCount++;
                  details.push(`Absorbed DB upfront payment ${t.transaction_code} into invoice ${matchingInv.reference_number}`);
                } else if (invInflow > 0 && Math.abs(invInflow - payAmt) < 0.01) {
                  paymentsToDelete.push(t.id);
                  cleanedCount++;
                  details.push(`Cleaned DB upfront invoice payment duplicate: ${t.id} (${t.transaction_code})`);
                }
              }
            }
          }

          if (paymentsToDelete.length > 0) {
            await supabase
              .from('daybook_transactions')
              .delete()
              .eq('workspace_id', wsId)
              .in('id', paymentsToDelete);
          }
        }
      } catch (e: any) {
        console.warn('[cleanDaybookDuplicates] DB cleanup notice:', e);
      }
    }

    return { cleanedCount, details };
  }
}

export const daybookService = new DaybookService();
