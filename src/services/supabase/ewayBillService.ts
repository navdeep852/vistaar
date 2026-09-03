import { supabase } from '../../lib/supabase';
import { EwayBill, EwayBillEvent, EwayBillFilterOptions, EwayBillItem } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_EWAY_BILLS_KEY = 'vistaar_local_eway_bills_db';

export class EwayBillService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  /**
   * Helper mapper from Supabase snake_case row to TS camelCase interface
   */
  private mapRowToEwayBill(row: any): EwayBill {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      invoiceId: row.invoice_id,
      ewayBillNumber: row.eway_bill_number,
      documentType: row.document_type || 'INV',
      documentNumber: row.document_number,
      documentDate: row.document_date,
      supplyType: row.supply_type || 'OUTWARD',
      subSupplyType: row.sub_supply_type || 'SUPPLY',
      transactionType: row.transaction_type || 'REGULAR',

      fromGstin: row.from_gstin,
      fromTradeName: row.from_trade_name,
      fromAddress: row.from_address,
      fromPlace: row.from_place,
      fromState: row.from_state,
      fromPincode: row.from_pincode,

      toGstin: row.to_gstin,
      toTradeName: row.to_trade_name,
      toAddress: row.to_address,
      toPlace: row.to_place,
      toState: row.to_state,
      toPincode: row.to_pincode,
      billToGstin: row.bill_to_gstin,
      shipToGstin: row.ship_to_gstin,

      totalTaxableValue: Number(row.total_taxable_value || 0),
      cgstAmount: Number(row.cgst_amount || 0),
      sgstAmount: Number(row.sgst_amount || 0),
      igstAmount: Number(row.igst_amount || 0),
      cessAmount: Number(row.cess_amount || 0),
      totalInvoiceValue: Number(row.total_invoice_value || 0),

      transportMode: row.transport_mode || 'ROAD',
      transporterId: row.transporter_id,
      transporterName: row.transporter_name,
      transporterGstin: row.transporter_gstin,
      vehicleNumber: row.vehicle_number,
      vehicleType: row.vehicle_type || 'REGULAR',
      transportDocumentNumber: row.transport_document_number,
      transportDocumentDate: row.transport_document_date,
      approxDistanceKm: Number(row.approx_distance_km || 0),

      generatedAt: row.generated_at,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      status: row.status || 'DRAFT',

      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      cancellationRemarks: row.cancellation_remarks,

      governmentReference: row.government_reference,
      ewbTransactionId: row.ewb_transaction_id || row.transaction_id,
      ewbOfficialResponse: row.ewb_official_response || row.official_response,
      ewbQrPayload: row.ewb_qr_payload || row.qr_payload,
      ewbEnvironment: row.ewb_environment || row.environment,
      ewbErrorCode: row.ewb_error_code || row.error_code,
      ewbErrorMessage: row.ewb_error_message || row.error_message,
      lastApiStatus: row.last_api_status,
      lastApiErrorCode: row.last_api_error_code,
      lastApiErrorMessage: row.last_api_error_message,

      items: (row.eway_bill_items || []).map((itemRow: any) => ({
        id: itemRow.id,
        workspaceId: itemRow.workspace_id,
        ewayBillId: itemRow.eway_bill_id,
        invoiceItemId: itemRow.invoice_item_id,
        productId: itemRow.product_id,
        productName: itemRow.product_name,
        hsnCode: itemRow.hsn_code,
        quantity: Number(itemRow.quantity || 1),
        unit: itemRow.unit || 'Pcs',
        taxableValue: Number(itemRow.taxable_value || 0),
        cgstRate: Number(itemRow.cgst_rate || 0),
        cgstAmount: Number(itemRow.cgst_amount || 0),
        sgstRate: Number(itemRow.sgst_rate || 0),
        sgstAmount: Number(itemRow.sgst_amount || 0),
        igstRate: Number(itemRow.igst_rate || 0),
        igstAmount: Number(itemRow.igst_amount || 0),
        cessRate: Number(itemRow.cess_rate || 0),
        cessAmount: Number(itemRow.cess_amount || 0),
        createdAt: itemRow.created_at,
      })),

      events: (row.eway_bill_events || []).map((evtRow: any) => ({
        id: evtRow.id,
        workspaceId: evtRow.workspace_id,
        ewayBillId: evtRow.eway_bill_id,
        eventType: evtRow.event_type,
        oldStatus: evtRow.old_status,
        newStatus: evtRow.new_status,
        performedBy: evtRow.performed_by,
        eventTime: evtRow.event_time,
        remarks: evtRow.remarks,
        metadata: evtRow.metadata || {},
      })),

      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async getEwayBills(options?: EwayBillFilterOptions): Promise<{ data: EwayBill[]; count: number; error?: string }> {
    const wsId = this.getWorkspaceId();
    let query = supabase
      .from('eway_bills')
      .select('*, eway_bill_items(*), eway_bill_events(*)', { count: 'exact' })
      .eq('workspace_id', wsId);

    if (options?.search) {
      const s = `%${options.search}%`;
      query = query.or(`document_number.ilike.${s},to_trade_name.ilike.${s},eway_bill_number.ilike.${s},vehicle_number.ilike.${s}`);
    }

    if (options?.status && options.status !== 'ALL') {
      query = query.eq('status', options.status);
    }

    if (options?.transportMode && options.transportMode !== 'ALL') {
      query = query.eq('transport_mode', options.transportMode);
    }

    if (options?.page && options?.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('created_at', { ascending: false });

    try {
      const { data, count, error } = await query;

      if (error) {
        const errStr = handleSupabaseError(error, 'getEwayBills');
        const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
        return { data: fallback, count: fallback.length, error: errStr };
      }

      const mapped = (data || []).map((row: any) => this.mapRowToEwayBill(row));

      // Auto-update status for expired EWBs based on current time
      const now = new Date().getTime();
      mapped.forEach((ewb: EwayBill) => {
        if (ewb.status === 'ACTIVE' && ewb.validUntil) {
          const until = new Date(ewb.validUntil).getTime();
          if (now > until) {
            ewb.status = 'EXPIRED';
          }
        }
      });


      safeSaveTenantStorage(LOCAL_EWAY_BILLS_KEY, mapped);
      return { data: mapped, count: count || mapped.length };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getEwayBills');
      const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      return { data: fallback, count: fallback.length, error: errStr };
    }
  }

  public async getEwayBillById(id: string): Promise<{ data?: EwayBill; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('eway_bills')
        .select('*, eway_bill_items(*), eway_bill_events(*)')
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'getEwayBillById');
        const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
        const match = fallback.find((e) => e.id === id);
        return { data: match, error: match ? undefined : errStr };
      }

      return { data: this.mapRowToEwayBill(data) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getEwayBillById');
      const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      const match = fallback.find((e) => e.id === id);
      return { data: match, error: match ? undefined : errStr };
    }
  }

  public async getEwayBillByInvoiceId(invoiceId: string): Promise<{ data?: EwayBill; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('eway_bills')
        .select('*, eway_bill_items(*), eway_bill_events(*)')
        .eq('workspace_id', wsId)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
        const match = fallback.find((e) => e.invoiceId === invoiceId);
        return { data: match };
      }

      return { data: data ? this.mapRowToEwayBill(data) : undefined };
    } catch (e: any) {
      const fallback = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      const match = fallback.find((e) => e.invoiceId === invoiceId);
      return { data: match };
    }
  }

  public async createEwayBill(
    ewayBill: Partial<EwayBill>,
    items: Partial<EwayBillItem>[]
  ): Promise<{ data?: EwayBill; error?: string }> {
    const wsId = this.getWorkspaceId();
    const ewbId = ewayBill.id || `ewb-${Date.now()}`;

    const parentPayload = {
      workspace_id: wsId,
      invoice_id: ewayBill.invoiceId || null,
      eway_bill_number: ewayBill.ewayBillNumber || null,
      document_type: ewayBill.documentType || 'INV',
      document_number: ewayBill.documentNumber,
      document_date: ewayBill.documentDate || new Date().toISOString().split('T')[0],
      supply_type: ewayBill.supplyType || 'OUTWARD',
      sub_supply_type: ewayBill.subSupplyType || 'SUPPLY',
      transaction_type: ewayBill.transactionType || 'REGULAR',

      from_gstin: ewayBill.fromGstin || null,
      from_trade_name: ewayBill.fromTradeName,
      from_address: ewayBill.fromAddress,
      from_place: ewayBill.fromPlace || '',
      from_state: ewayBill.fromState,
      from_pincode: ewayBill.fromPincode,

      to_gstin: ewayBill.toGstin || null,
      to_trade_name: ewayBill.toTradeName,
      to_address: ewayBill.toAddress,
      to_place: ewayBill.toPlace || '',
      to_state: ewayBill.toState,
      to_pincode: ewayBill.toPincode,
      bill_to_gstin: ewayBill.billToGstin || null,
      ship_to_gstin: ewayBill.shipToGstin || null,

      total_taxable_value: ewayBill.totalTaxableValue || 0,
      cgst_amount: ewayBill.cgstAmount || 0,
      sgst_amount: ewayBill.sgstAmount || 0,
      igst_amount: ewayBill.igstAmount || 0,
      cess_amount: ewayBill.cessAmount || 0,
      total_invoice_value: ewayBill.totalInvoiceValue || 0,

      transport_mode: ewayBill.transportMode || 'ROAD',
      transporter_id: ewayBill.transporterId || null,
      transporter_name: ewayBill.transporterName || null,
      transporter_gstin: ewayBill.transporterGstin || null,
      vehicle_number: ewayBill.vehicleNumber || null,
      vehicle_type: ewayBill.vehicleType || 'REGULAR',
      transport_document_number: ewayBill.transportDocumentNumber || null,
      transport_document_date: ewayBill.transportDocumentDate || null,
      approx_distance_km: ewayBill.approxDistanceKm || 0,

      status: ewayBill.status || 'DRAFT',
      generated_at: ewayBill.generatedAt || null,
      valid_from: ewayBill.validFrom || null,
      valid_until: ewayBill.validUntil || null,
      government_reference: ewayBill.governmentReference || null,
      ewb_transaction_id: ewayBill.ewbTransactionId || null,
      ewb_official_response: ewayBill.ewbOfficialResponse || null,
      ewb_qr_payload: ewayBill.ewbQrPayload || null,
      ewb_environment: ewayBill.ewbEnvironment || 'SANDBOX',
      ewb_error_code: ewayBill.ewbErrorCode || null,
      ewb_error_message: ewayBill.ewbErrorMessage || null,
    };

    try {
      const { data: parent, error: parentErr } = await supabase
        .from('eway_bills')
        .insert([parentPayload])
        .select('*')
        .single();

      if (parentErr) {
        const errStr = handleSupabaseError(parentErr, 'createEwayBill');
        const fallbackObj: EwayBill = {
          id: ewbId,
          workspaceId: wsId,
          ...ewayBill,
          documentType: ewayBill.documentType || 'INV',
          documentNumber: ewayBill.documentNumber || '',
          documentDate: ewayBill.documentDate || new Date().toISOString().split('T')[0],
          supplyType: ewayBill.supplyType || 'OUTWARD',
          subSupplyType: ewayBill.subSupplyType || 'SUPPLY',
          transactionType: ewayBill.transactionType || 'REGULAR',
          fromTradeName: ewayBill.fromTradeName || '',
          fromAddress: ewayBill.fromAddress || '',
          fromState: ewayBill.fromState || '',
          fromPincode: ewayBill.fromPincode || '',
          toTradeName: ewayBill.toTradeName || '',
          toAddress: ewayBill.toAddress || '',
          toState: ewayBill.toState || '',
          toPincode: ewayBill.toPincode || '',
          totalTaxableValue: ewayBill.totalTaxableValue || 0,
          cgstAmount: ewayBill.cgstAmount || 0,
          sgstAmount: ewayBill.sgstAmount || 0,
          igstAmount: ewayBill.igstAmount || 0,
          cessAmount: ewayBill.cessAmount || 0,
          totalInvoiceValue: ewayBill.totalInvoiceValue || 0,
          transportMode: ewayBill.transportMode || 'ROAD',
          approxDistanceKm: ewayBill.approxDistanceKm || 0,
          status: ewayBill.status || 'DRAFT',
          items: items as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const list = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
        list.unshift(fallbackObj);
        safeSaveTenantStorage(LOCAL_EWAY_BILLS_KEY, list);
        return { data: fallbackObj };
      }

      const createdEwbId = parent.id;

      // Insert line items
      if (items && items.length > 0) {
        const itemRows = items.map((it) => ({
          workspace_id: wsId,
          eway_bill_id: createdEwbId,
          invoice_item_id: it.invoiceItemId || null,
          product_id: it.productId || null,
          product_name: it.productName,
          hsn_code: it.hsnCode,
          quantity: it.quantity,
          unit: it.unit || 'Pcs',
          taxable_value: it.taxableValue,
          cgst_rate: it.cgstRate || 0,
          cgst_amount: it.cgstAmount || 0,
          sgst_rate: it.sgstRate || 0,
          sgst_amount: it.sgstAmount || 0,
          igst_rate: it.igstRate || 0,
          igst_amount: it.igstAmount || 0,
          cess_rate: it.cessRate || 0,
          cess_amount: it.cessAmount || 0,
        }));

        await supabase.from('eway_bill_items').insert(itemRows);
      }

      // Record Audit Event
      await this.recordEvent(createdEwbId, 'CREATED', undefined, parent.status, 'E-Way Bill Draft Created in VISTAAR');

      const fullRes = await this.getEwayBillById(createdEwbId);
      return { data: fullRes.data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createEwayBill');
      const fallbackObj: EwayBill = {
        id: ewbId,
        workspaceId: wsId,
        ...ewayBill,
        documentType: ewayBill.documentType || 'INV',
        documentNumber: ewayBill.documentNumber || '',
        documentDate: ewayBill.documentDate || new Date().toISOString().split('T')[0],
        supplyType: ewayBill.supplyType || 'OUTWARD',
        subSupplyType: ewayBill.subSupplyType || 'SUPPLY',
        transactionType: ewayBill.transactionType || 'REGULAR',
        fromTradeName: ewayBill.fromTradeName || '',
        fromAddress: ewayBill.fromAddress || '',
        fromState: ewayBill.fromState || '',
        fromPincode: ewayBill.fromPincode || '',
        toTradeName: ewayBill.toTradeName || '',
        toAddress: ewayBill.toAddress || '',
        toState: ewayBill.toState || '',
        toPincode: ewayBill.toPincode || '',
        totalTaxableValue: ewayBill.totalTaxableValue || 0,
        cgstAmount: ewayBill.cgstAmount || 0,
        sgstAmount: ewayBill.sgstAmount || 0,
        igstAmount: ewayBill.igstAmount || 0,
        cessAmount: ewayBill.cessAmount || 0,
        totalInvoiceValue: ewayBill.totalInvoiceValue || 0,
        transportMode: ewayBill.transportMode || 'ROAD',
        approxDistanceKm: ewayBill.approxDistanceKm || 0,
        status: ewayBill.status || 'DRAFT',
        items: items as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      list.unshift(fallbackObj);
      safeSaveTenantStorage(LOCAL_EWAY_BILLS_KEY, list);
      return { data: fallbackObj };
    }
  }

  public async updateEwayBill(
    id: string,
    updates: Partial<EwayBill>,
    eventType?: string,
    remarks?: string
  ): Promise<{ data?: EwayBill; error?: string }> {
    const wsId = this.getWorkspaceId();

    const dbPayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status) dbPayload.status = updates.status;
    if (updates.ewayBillNumber) dbPayload.eway_bill_number = updates.ewayBillNumber;
    if (updates.generatedAt) dbPayload.generated_at = updates.generatedAt;
    if (updates.validFrom) dbPayload.valid_from = updates.validFrom;
    if (updates.validUntil) dbPayload.valid_until = updates.validUntil;
    if (updates.cancelledAt) dbPayload.cancelled_at = updates.cancelledAt;
    if (updates.cancellationReason) dbPayload.cancellation_reason = updates.cancellationReason;
    if (updates.cancellationRemarks) dbPayload.cancellation_remarks = updates.cancellationRemarks;
    if (updates.vehicleNumber) dbPayload.vehicle_number = updates.vehicleNumber;
    if (updates.vehicleType) dbPayload.vehicle_type = updates.vehicleType;
    if (updates.governmentReference) dbPayload.government_reference = updates.governmentReference;
    if (updates.lastApiStatus) dbPayload.last_api_status = updates.lastApiStatus;
    if (updates.lastApiErrorCode) dbPayload.last_api_error_code = updates.lastApiErrorCode;
    if (updates.lastApiErrorMessage) dbPayload.last_api_error_message = updates.lastApiErrorMessage;

    try {
      const { data: existing } = await this.getEwayBillById(id);
      const oldStatus = existing?.status;

      const { error } = await supabase
        .from('eway_bills')
        .update(dbPayload)
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) handleSupabaseError(error, 'updateEwayBill');

      if (eventType && updates.status) {
        await this.recordEvent(id, eventType, oldStatus, updates.status, remarks || `Status updated to ${updates.status}`);
      }

      // Update local storage fallback
      const list = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      const idx = list.findIndex((e) => e.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
        safeSaveTenantStorage(LOCAL_EWAY_BILLS_KEY, list);
      }

      const res = await this.getEwayBillById(id);
      return { data: res.data };
    } catch (e: any) {
      const list = safeGetTenantStorage<EwayBill>(LOCAL_EWAY_BILLS_KEY, []);
      const idx = list.findIndex((e) => e.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
        safeSaveTenantStorage(LOCAL_EWAY_BILLS_KEY, list);
      }
      const match = list.find((e) => e.id === id);
      return { data: match };
    }
  }

  public async recordEvent(
    ewayBillId: string,
    eventType: string,
    oldStatus: string | undefined,
    newStatus: string,
    remarks?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const wsId = this.getWorkspaceId();
    const user = supabaseAuthService.getUser();

    const payload = {
      workspace_id: wsId,
      eway_bill_id: ewayBillId,
      event_type: eventType,
      old_status: oldStatus || null,
      new_status: newStatus,
      performed_by: user?.name || user?.email || 'System User',
      remarks: remarks || '',
      metadata: metadata || {},
    };

    try {
      await supabase.from('eway_bill_events').insert([payload]);
    } catch (e) {
      // Local fallback recording
    }
  }
}

export const ewayBillService = new EwayBillService();
