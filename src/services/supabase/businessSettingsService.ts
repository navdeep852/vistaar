import { supabase } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';
import { BusinessSettings } from '../../types';
import { DbBusinessSettings } from './types';

/**
 * Maps a database snake_case row from public.business_settings to the frontend
 * camelCase BusinessSettings shape.
 */
export function mapDbSettingsToApp(row: DbBusinessSettings): BusinessSettings {
  const bank = typeof row.bank_details === 'object' && row.bank_details !== null ? row.bank_details : {};
  const upiQr = (row as any).upi_qr_url || bank.upiQrCodeUrl || bank.upi_qr_url || '';

  return {
    businessName: row.legal_name || '',
    legalName: row.legal_name || '',
    companyName: row.legal_name || '',
    businessType: row.business_type || 'Private Limited',
    businessDescription: row.business_description || '',
    ownerName: row.owner_name || '',
    phone: row.phone || '',
    alternatePhone: row.alternate_phone || '',
    email: row.email || '',
    website: row.website || '',
    gstin: row.gstin || '',
    pan: row.pan || '',
    regNumber: row.reg_number || '',
    address: row.address || '',
    addressLine2: row.address_line_2 || '',
    city: row.city || '',
    state: row.state || '',
    pincode: row.pincode || '',
    country: row.country || 'India',

    logoUrl: row.logo_url || '',
    logoAlignment: (row.logo_alignment as 'left' | 'center' | 'right') || 'left',
    logoScale: typeof row.logo_scale === 'number' ? row.logo_scale : Number(row.logo_scale) || 1,

    signatureUrl: row.signature_url || '',
    signatureAlignment: (row.signature_alignment as 'left' | 'center' | 'right') || 'right',
    signatureScale: typeof row.signature_scale === 'number' ? row.signature_scale : Number(row.signature_scale) || 1,

    stampUrl: row.stamp_url || '',
    stampAlignment: (row.stamp_alignment as 'left' | 'center' | 'right') || 'left',
    stampScale: typeof row.stamp_scale === 'number' ? row.stamp_scale : Number(row.stamp_scale) || 1,

    bankDetails: {
      bankName: bank.bankName || bank.bank_name || '',
      accountHolder: bank.accountHolder || bank.account_holder || '',
      accountNo: bank.accountNo || bank.account_no || '',
      ifscCode: bank.ifscCode || bank.ifsc_code || '',
      branch: bank.branch || '',
      upiId: bank.upiId || bank.upi_id || '',
      upiQrCodeUrl: upiQr,
    },
    upiQrCodeUrl: upiQr,
    showUpiQrOnQuotation: (row as any).show_upi_qr_on_quotation ?? true,
    showBankDetailsOnInvoice: row.show_bank_on_invoice ?? true,
    showBankDetailsOnQuotation: row.show_bank_on_quotation ?? true,

    currency: row.currency || '₹',
    defaultTaxMode: (row.default_tax_mode as 'Inclusive' | 'Exclusive' | 'No Tax') || 'Exclusive',
    invoicePrefix: row.invoice_prefix || 'INV-',
    quotationPrefix: row.quotation_prefix || 'QT-',
    defaultPaymentTerms: row.default_payment_terms || 'Net 15',
    defaultQuotationValidity: row.default_quotation_validity || '15 Days',
    defaultFont: row.default_font || 'Inter',
    defaultOrientation: (row.default_orientation as 'portrait' | 'landscape') || 'portrait',
    defaultInvoiceTemplate: row.default_invoice_template || 'inv-modern-blue',
    defaultQuotationTemplate: row.default_quotation_template || 'qt-modern-blue',
    brandColor: row.brand_color || '#2563eb',
    theme: (row.theme as 'light' | 'dark') || 'light',

    termsAndConditions: row.terms_and_conditions || '',
    defaultInvoiceTerms: row.default_invoice_terms || '',
    defaultQuotationTerms: row.default_quotation_terms || '',
  };
}

/**
 * Maps frontend BusinessSettings fields to the explicit PostgreSQL snake_case payload
 * for public.business_settings. NEVER spreads arbitrary or camelCase fields.
 */
export function mapAppSettingsToDb(settings: Partial<BusinessSettings>, workspaceId: string): DbBusinessSettings {
  const bankObj = settings.bankDetails || (settings as any).bank_details || {};
  const upiQr = bankObj.upiQrCodeUrl || bankObj.upi_qr_url || settings.upiQrCodeUrl || (settings as any).upi_qr_url || '';

  const bankDetailsPayload = {
    bankName: bankObj.bankName || bankObj.bank_name || '',
    accountHolder: bankObj.accountHolder || bankObj.account_holder || '',
    accountNo: bankObj.accountNo || bankObj.account_no || '',
    ifscCode: bankObj.ifscCode || bankObj.ifsc_code || '',
    branch: bankObj.branch || '',
    upiId: bankObj.upiId || bankObj.upi_id || '',
    upiQrCodeUrl: upiQr,
  };

  const legalNameValue = (
    settings.legalName ||
    settings.businessName ||
    (settings as any).legal_name ||
    ''
  ).trim();

  return {
    workspace_id: workspaceId,
    legal_name: legalNameValue,
    business_type: settings.businessType || (settings as any).business_type || 'Private Limited',
    business_description: settings.businessDescription || (settings as any).business_description || '',
    owner_name: settings.ownerName || (settings as any).owner_name || '',
    phone: (settings.phone || (settings as any).phone || '').trim(),
    alternate_phone: settings.alternatePhone || (settings as any).alternate_phone || null,
    email: (settings.email || (settings as any).email || '').trim(),
    website: settings.website || (settings as any).website || '',
    gstin: (settings.gstin || (settings as any).gstin || '').trim(),
    pan: (settings.pan || (settings as any).pan || '').trim(),
    reg_number: settings.regNumber || (settings as any).reg_number || '',
    address: (settings.address || (settings as any).address || '').trim(),
    address_line_2: settings.addressLine2 || (settings as any).address_line_2 || '',
    city: (settings.city || (settings as any).city || '').trim(),
    state: (settings.state || (settings as any).state || '').trim(),
    pincode: (settings.pincode || (settings as any).pincode || '').trim(),
    country: settings.country || (settings as any).country || 'India',
    logo_url: settings.logoUrl || (settings as any).logo_url || null,
    logo_alignment: settings.logoAlignment || (settings as any).logo_alignment || 'left',
    logo_scale: settings.logoScale ?? (settings as any).logo_scale ?? 1.0,
    signature_url: settings.signatureUrl || (settings as any).signature_url || null,
    signature_alignment: settings.signatureAlignment || (settings as any).signature_alignment || 'right',
    signature_scale: settings.signatureScale ?? (settings as any).signature_scale ?? 1.0,
    stamp_url: settings.stampUrl || (settings as any).stamp_url || null,
    stamp_alignment: settings.stampAlignment || (settings as any).stamp_alignment || 'left',
    stamp_scale: settings.stampScale ?? (settings as any).stamp_scale ?? 1.0,
    bank_details: bankDetailsPayload,
    upi_qr_url: upiQr || null,
    show_upi_qr_on_quotation: settings.showUpiQrOnQuotation ?? (settings as any).show_upi_qr_on_quotation ?? true,
    show_bank_on_invoice: settings.showBankDetailsOnInvoice ?? (settings as any).show_bank_on_invoice ?? true,
    show_bank_on_quotation: settings.showBankDetailsOnQuotation ?? (settings as any).show_bank_on_quotation ?? true,
    currency: settings.currency || (settings as any).currency || '₹',
    default_tax_mode: settings.defaultTaxMode || (settings as any).default_tax_mode || 'Exclusive',
    invoice_prefix: settings.invoicePrefix || (settings as any).invoice_prefix || 'INV-',
    quotation_prefix: settings.quotationPrefix || (settings as any).quotation_prefix || 'QT-',
    default_payment_terms: settings.defaultPaymentTerms || (settings as any).default_payment_terms || 'Net 15',
    default_quotation_validity: settings.defaultQuotationValidity || (settings as any).default_quotation_validity || '15 Days',
    default_font: settings.defaultFont || (settings as any).default_font || 'Inter',
    default_orientation: settings.defaultOrientation || (settings as any).default_orientation || 'portrait',
    default_invoice_template: settings.defaultInvoiceTemplate || (settings as any).default_invoice_template || 'inv-modern-blue',
    default_quotation_template: settings.defaultQuotationTemplate || (settings as any).default_quotation_template || 'qt-modern-blue',
    brand_color: settings.brandColor || (settings as any).brand_color || '#2563eb',
    theme: settings.theme || (settings as any).theme || 'light',
    terms_and_conditions: settings.termsAndConditions || (settings as any).terms_and_conditions || '',
    default_invoice_terms: settings.defaultInvoiceTerms || (settings as any).default_invoice_terms || '',
    default_quotation_terms: settings.defaultQuotationTerms || (settings as any).default_quotation_terms || '',
    updated_at: new Date().toISOString(),
  };
}

export class SupabaseBusinessSettingsService {
  /**
   * Reads business settings for the current workspace, mapping database snake_case fields
   * into the frontend camelCase BusinessSettings shape.
   */
  public async getSettings(): Promise<{ success: boolean; data?: BusinessSettings | null; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace found.' };
    }

    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        // PGRST116 indicates 0 rows found: normal initialization case
        if (error.code === 'PGRST116') {
          return { success: true, data: null };
        }
        const errStr = handleSupabaseError(error, 'getSettings');
        return { success: false, error: errStr };
      }

      if (!data) {
        return { success: true, data: null };
      }

      return { success: true, data: mapDbSettingsToApp(data as DbBusinessSettings) };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'getSettings');
      return { success: false, error: errStr };
    }
  }

  /**
   * Convenience alias for getSettings returning camelCase BusinessSettings.
   */
  public async getBusinessSettings(): Promise<{ success: boolean; data?: BusinessSettings | null; error?: string }> {
    return this.getSettings();
  }

  /**
   * Saves business settings to Supabase for the current workspace.
   * Explicitly maps camelCase settings to strictly valid database snake_case columns.
   */
  public async updateSettings(settings: Partial<BusinessSettings>): Promise<{ success: boolean; data?: BusinessSettings; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace found.' };
    }

    let normalizedPhone = settings.phone || (settings as any).phone || '';
    if (normalizedPhone) {
      const pRes = validateIndianPhoneNumber(normalizedPhone, false);
      if (!pRes.isValid) {
        return { success: false, error: pRes.error || 'Business phone number must contain exactly 10 digits.' };
      }
      normalizedPhone = pRes.normalized;
    }

    const rawAlt = settings.alternatePhone || (settings as any).alternate_phone;
    let normalizedAltPhone = '';
    if (rawAlt) {
      const aRes = validateIndianPhoneNumber(rawAlt, false);
      if (!aRes.isValid) {
        return { success: false, error: aRes.error || 'Alternate phone number must contain exactly 10 digits.' };
      }
      normalizedAltPhone = aRes.normalized;
    }

    try {
      const dbPayload = mapAppSettingsToDb(
        {
          ...settings,
          phone: normalizedPhone,
          alternatePhone: normalizedAltPhone,
        },
        workspaceId
      );

      const { data, error } = await supabase
        .from('business_settings')
        .upsert(dbPayload, { onConflict: 'workspace_id' })
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'updateSettings');
        return { success: false, error: errStr };
      }

      return { success: true, data: mapDbSettingsToApp(data as DbBusinessSettings) };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'updateSettings');
      return { success: false, error: errStr };
    }
  }
}

export const businessSettingsService = new SupabaseBusinessSettingsService();
