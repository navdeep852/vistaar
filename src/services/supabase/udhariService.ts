import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UdhariRecord, UdhariPaymentRecord } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

const LOCAL_UDHARI_KEY = 'vistaar_local_udharis_db';
const LOCAL_UDHARI_PAYMENTS_KEY = 'vistaar_local_udhari_payments_db';

export class UdhariService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getUdhariRecords(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('udhari_records')
        .select('*, udhari_payments(*)')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getUdhariRecords');
        const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getUdhariRecords');
      const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createUdhari(udhari: Partial<UdhariRecord>): Promise<{ udhariId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (udhari.phoneSnapshot) {
      const pRes = validateIndianPhoneNumber(udhari.phoneSnapshot, true);
      if (!pRes.isValid) {
        return { error: pRes.error || 'Customer phone number must contain exactly 10 digits.' };
      }
      udhari.phoneSnapshot = pRes.normalized;
    } else {
      return { error: 'Customer phone number is required.' };
    }

    const code = udhari.id || `UD-${Date.now()}`;
    const payload: any = {
      workspace_id: wsId,
      customer_id: udhari.customerId || null,
      invoice_id: udhari.invoiceId || null,
      udhari_code: code,
      customer_name_snapshot: udhari.customerNameSnapshot || 'Customer',
      phone_snapshot: udhari.phoneSnapshot,
      original_amount: udhari.originalAmount || 0,
      total_received: udhari.totalReceived || 0,
      outstanding_amount: udhari.outstandingAmount !== undefined ? udhari.outstandingAmount : (udhari.originalAmount || 0),
      due_date: udhari.dueDate || new Date().toISOString().split('T')[0],
      status: udhari.status || 'UNPAID',
    };

    try {
      let { data, error } = await supabase
        .from('udhari_records')
        .insert([payload])
        .select('id')
        .single();

      if (error && (error.code === '42703' || error.message?.includes('invoice_id'))) {
        delete payload.invoice_id;
        const retry = await supabase.from('udhari_records').insert([payload]).select('id').single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        const errStr = handleSupabaseError(error, 'createUdhari');
        const newId = `ud-${Date.now()}`;
        const localRec = { id: newId, ...payload, createdAt: new Date().toISOString() };
        const local = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
        local.unshift(localRec);
        safeSaveTenantStorage(LOCAL_UDHARI_KEY, local);
        return { udhariId: newId };
      }
      return { udhariId: data.id };
    } catch (e: any) {
      const newId = `ud-${Date.now()}`;
      const localRec = { id: newId, ...payload, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      local.unshift(localRec);
      safeSaveTenantStorage(LOCAL_UDHARI_KEY, local);
      return { udhariId: newId };
    }
  }

  /**
   * Idempotently synchronizes an invoice with the Udhari ledger and Follow-up reminders
   */
  public async syncInvoiceUdhari(params: {
    invoiceId: string;
    invoiceNumber: string;
    customerId?: string;
    customerName: string;
    customerPhone: string;
    grandTotal: number;
    paidAmount: number;
    balanceAmount: number;
    dueDate?: string;
  }): Promise<{ udhariId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const effectiveDueDate = params.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const isCleared = params.balanceAmount <= 0.01;
    const udhariStatus = isCleared ? 'PAID' : (params.paidAmount > 0 ? 'PARTIALLY PAID' : 'UNPAID');

    try {
      if (isValidUuid(wsId) && isValidUuid(params.invoiceId)) {
        // 1. Check if an Udhari record exists for this invoice
        let { data: existingUdhari } = await supabase
          .from('udhari_records')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('invoice_id', params.invoiceId)
          .maybeSingle();

        // Fallback check by udhari_code if invoice_id column not yet queried
        if (!existingUdhari) {
          const { data: byCode } = await supabase
            .from('udhari_records')
            .select('*')
            .eq('workspace_id', wsId)
            .eq('udhari_code', `UD-${params.invoiceNumber}`)
            .maybeSingle();
          existingUdhari = byCode;
        }

        let udhariId = existingUdhari?.id;

        if (existingUdhari) {
          // Update existing Udhari record
          const updatePayload: any = {
            total_received: params.paidAmount,
            outstanding_amount: Math.max(0, params.balanceAmount),
            status: udhariStatus,
            updated_at: new Date().toISOString(),
          };
          if (!isCleared) {
            updatePayload.original_amount = params.grandTotal;
            updatePayload.due_date = effectiveDueDate;
          }
          await supabase.from('udhari_records').update(updatePayload).eq('id', existingUdhari.id);
        } else if (!isCleared) {
          // Create new Udhari record
          const res = await this.createUdhari({
            id: `UD-${params.invoiceNumber}`,
            customerId: params.customerId,
            invoiceId: params.invoiceId,
            customerNameSnapshot: params.customerName,
            phoneSnapshot: params.customerPhone || '9999999999',
            originalAmount: params.grandTotal,
            totalReceived: params.paidAmount,
            outstandingAmount: params.balanceAmount,
            dueDate: effectiveDueDate,
            status: udhariStatus as any,
          });
          udhariId = res.udhariId;
        }

        // 2. Synchronize Follow-up
        try {
          const { data: existingFollowUp } = await supabase
            .from('follow_ups')
            .select('id, status')
            .eq('workspace_id', wsId)
            .or(`invoice_id.eq.${params.invoiceId},invoice_number.eq.${params.invoiceNumber}`)
            .maybeSingle();

          if (isCleared) {
            if (existingFollowUp && existingFollowUp.status !== 'Completed') {
              await supabase
                .from('follow_ups')
                .update({ status: 'Completed', completed_at: new Date().toISOString() })
                .eq('id', existingFollowUp.id);
            }
          } else {
            if (existingFollowUp) {
              await supabase
                .from('follow_ups')
                .update({
                  status: 'Pending',
                  due_date: effectiveDueDate,
                  notes: `Payment follow-up for Invoice #${params.invoiceNumber}. Outstanding: ₹${params.balanceAmount.toLocaleString('en-IN')}`,
                })
                .eq('id', existingFollowUp.id);
            } else {
              const followUpPayload: any = {
                workspace_id: wsId,
                customer_id: isValidUuid(params.customerId) ? params.customerId : null,
                customer_name: params.customerName || 'Customer',
                customer_phone: params.customerPhone || '9999999999',
                invoice_id: params.invoiceId,
                invoice_number: params.invoiceNumber,
                udhari_id: udhariId && isValidUuid(udhariId) ? udhariId : null,
                title: `Payment follow-up — ${params.invoiceNumber}`,
                notes: `Outstanding receivable: ₹${params.balanceAmount.toLocaleString('en-IN')}`,
                due_date: effectiveDueDate,
                due_time: '10:00',
                priority: 'High',
                status: 'Pending',
                action_type: 'INTERNAL_REMINDER',
              };

              let { error: fuErr } = await supabase.from('follow_ups').insert([followUpPayload]);
              if (fuErr && (fuErr.code === '42703' || fuErr.message?.includes('udhari_id'))) {
                delete followUpPayload.udhari_id;
                await supabase.from('follow_ups').insert([followUpPayload]);
              }
            }
          }
        } catch (fuEx) {
          console.warn('[syncInvoiceUdhari] Follow-up sync notice:', fuEx);
        }

        return { udhariId };
      }
    } catch (e: any) {
      console.warn('[syncInvoiceUdhari] notice:', e);
    }

    return {};
  }

  /**
   * Authoritative Udhari settlement with atomic RPC execution & multi-table sync
   */
  public async recordUdhariPayment(payment: Partial<UdhariPaymentRecord>): Promise<{ paymentId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const paymentAmount = Math.abs(Number(payment.amount) || 0);

    if (paymentAmount <= 0) {
      return { error: 'Payment amount must be greater than ₹0.' };
    }

    if (payment.phoneNumber) {
      const pRes = validateIndianPhoneNumber(payment.phoneNumber, false);
      if (pRes.isValid) {
        payment.phoneNumber = pRes.normalized;
      }
    }

    const payDate = payment.paymentDate || new Date().toISOString().split('T')[0];
    const payMethod = payment.paymentMethod || 'Cash';

    // 1. Fetch Udhari record to check overpayment & linked invoice
    let currentUdhari: any = null;
    if (isValidUuid(wsId) && payment.udhariId && isValidUuid(payment.udhariId)) {
      try {
        const { data } = await supabase
          .from('udhari_records')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('id', payment.udhariId)
          .single();
        currentUdhari = data;
      } catch (fetchErr) {
        // Fall through
      }
    }

    if (currentUdhari) {
      const maxAllowed = Number(currentUdhari.outstanding_amount) || 0;
      if (paymentAmount > (maxAllowed + 0.05)) {
        return {
          error: `Overpayment rejected: payment amount (₹${paymentAmount.toLocaleString('en-IN')}) exceeds outstanding balance (₹${maxAllowed.toLocaleString('en-IN')}).`,
        };
      }
    }

    // 2. Attempt Atomic PostgreSQL RPC Function
    if (isSupabaseConfigured() && isValidUuid(wsId) && payment.udhariId && isValidUuid(payment.udhariId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_udhari_payment_atomic', {
          p_payload: {
            workspace_id: wsId,
            udhari_id: payment.udhariId,
            amount: paymentAmount,
            payment_method: payMethod,
            payment_date: payDate,
            phone_number: payment.phoneNumber || '',
            reference: payment.reference || null,
            notes: payment.notes || null,
          },
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          return { paymentId: rpcRes.payment_id };
        }

        if (rpcErr) {
          const isMissingRpc = rpcErr.code === '42883' || rpcErr.message?.includes('function') || rpcErr.message?.includes('does not exist');
          if (!isMissingRpc) {
            return { error: rpcErr.message || 'Failed to record payment' };
          }
        }
      } catch (rpcEx) {
        // Fall through to client-side pipeline
      }
    }

    // 3. Resilient Client-Side Multi-Table Pipeline Fallback
    const createdId = `pay-${Date.now()}`;
    const paymentCode = `PAY-${new Date(payDate).getFullYear()}-${String(Date.now()).slice(-5)}`;

    const paymentPayload: any = {
      workspace_id: wsId,
      udhari_id: payment.udhariId,
      customer_id: payment.customerId || (currentUdhari ? currentUdhari.customer_id : null),
      payment_code: paymentCode,
      amount: paymentAmount,
      payment_method: payMethod,
      payment_date: payDate,
      phone_number: payment.phoneNumber || (currentUdhari ? currentUdhari.phone_snapshot : ''),
      reference: payment.reference || null,
      notes: payment.notes || null,
    };

    if (isValidUuid(wsId)) {
      try {
        // Step A: Insert udhari_payments
        const { data: insData } = await supabase
          .from('udhari_payments')
          .insert([paymentPayload])
          .select('id')
          .single();

        const persistentId = insData?.id || createdId;

        // Step B: Update udhari_records
        if (currentUdhari) {
          const newReceived = Number(currentUdhari.total_received || 0) + paymentAmount;
          const newOutstanding = Math.max(0, Math.round((Number(currentUdhari.original_amount || 0) - newReceived) * 100) / 100);
          const newStatus = newOutstanding <= 0.01 ? 'PAID' : 'PARTIALLY PAID';

          await supabase
            .from('udhari_records')
            .update({
              total_received: newReceived,
              outstanding_amount: newOutstanding,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentUdhari.id);

          // Step C: If linked to an invoice, sync Invoices, Payments, and Daybook sale
          if (currentUdhari.invoice_id) {
            const { data: invData } = await supabase
              .from('invoices')
              .select('*')
              .eq('id', currentUdhari.invoice_id)
              .single();

            if (invData) {
              const invNewPaid = Number(invData.paid_amount || 0) + paymentAmount;
              const invNewBalance = Math.max(0, Math.round((Number(invData.grand_total || 0) - invNewPaid) * 100) / 100);
              const invNewStatus = invNewBalance <= 0.01 ? 'Paid' : 'Partially Paid';
              const invTag = invNewBalance <= 0.01 ? 'PAID' : 'PARTIALLY PAID';

              await supabase
                .from('invoices')
                .update({
                  paid_amount: invNewPaid,
                  balance_amount: invNewBalance,
                  status: invNewStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentUdhari.invoice_id);

              // Standard payments record
              await supabase.from('payments').insert([{
                workspace_id: wsId,
                customer_id: currentUdhari.customer_id,
                invoice_id: currentUdhari.invoice_id,
                payment_number: paymentCode,
                customer_name: currentUdhari.customer_name_snapshot,
                invoice_number: invData.invoice_number,
                amount: paymentAmount,
                payment_date: payDate,
                method: payMethod,
                reference_no: payment.reference || null,
                notes: payment.notes || `Udhari Settlement for Invoice ${invData.invoice_number}`,
              }]);

              // Update original Daybook sale entry
              const { daybookService } = await import('./daybookService');
              await daybookService.recordFinancialTransaction({
                referenceType: 'INVOICE',
                referenceId: currentUdhari.invoice_id,
                referenceNumber: invData.invoice_number,
                transactionType: 'SALE',
                direction: 'IN',
                amount: invNewPaid,
                totalAmount: Number(invData.grand_total) || 0,
                remainingAmount: invNewBalance,
                paymentStatus: invTag,
                partyType: 'customer',
                partyId: currentUdhari.customer_id,
                partyName: currentUdhari.customer_name_snapshot,
                description: `Invoice #${invData.invoice_number}`,
                transactionDate: invData.date || payDate,
              });
            }
          }

          // Step D: Record Daybook payment event on actual payment date (Total = NULL strictly)
          try {
            const { daybookService } = await import('./daybookService');
            await daybookService.recordFinancialTransaction({
              referenceType: 'UDHARI_PAYMENT',
              referenceId: persistentId,
              referenceNumber: payment.reference || paymentCode,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: 'IN',
              amount: paymentAmount,
              totalAmount: null,
              remainingAmount: null,
              paymentStatus: 'PAID',
              paymentMode: payMethod,
              partyType: 'customer',
              partyId: currentUdhari.customer_id,
              partyName: currentUdhari.customer_name_snapshot,
              description: `Receivable Collection / Udhari Payment (${currentUdhari.udhari_code})`,
              notes: payment.notes || undefined,
              transactionDate: payDate,
            });
          } catch (dbErr) {
            console.warn('Daybook payment event notice:', dbErr);
          }

          // Step E: Record Cashbook receipt for actual money received on payment date
          try {
            const { cashbookService } = await import('./cashbookService');
            await cashbookService.recordCashbookEntry({
              sourceType: 'UDHARI_PAYMENT',
              sourceId: persistentId,
              referenceNumber: payment.reference || paymentCode,
              direction: 'IN',
              amount: paymentAmount,
              paymentMethod: payMethod,
              partyName: currentUdhari.customer_name_snapshot,
              description: `Udhari payment received from ${currentUdhari.customer_name_snapshot}`,
              notes: payment.notes || undefined,
              transactionDate: payDate,
            });
          } catch (cbErr) {
            console.warn('Cashbook entry notice:', cbErr);
          }

          // Step F: Synchronize Follow-up
          if (newOutstanding <= 0.01) {
            await supabase
              .from('follow_ups')
              .update({ status: 'Completed', completed_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .or(`udhari_id.eq.${payment.udhariId},invoice_id.eq.${currentUdhari.invoice_id}`);
          }

          return { paymentId: persistentId };
        }
      } catch (err: any) {
        console.error('Fallback Udhari settlement error:', err);
      }
    }

    // Local Storage backup
    const localPay = { id: createdId, ...paymentPayload, createdAt: new Date().toISOString() };
    const local = safeGetTenantStorage<any>(LOCAL_UDHARI_PAYMENTS_KEY, []);
    local.unshift(localPay);
    safeSaveTenantStorage(LOCAL_UDHARI_PAYMENTS_KEY, local);

    return { paymentId: createdId };
  }
}

export const udhariService = new UdhariService();
