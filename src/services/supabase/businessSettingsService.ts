import { supabase } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

const FIELD_ALIASES: Record<string, string> = {
  businessName: 'legal_name',
  legalName: 'legal_name',
  alternatePhone: 'alternate_phone',
  businessType: 'business_type',
  ownerName: 'owner_name',
  regNumber: 'reg_number',
  logoUrl: 'logo_url',
  logoScale: 'logo_scale',
  logoAlignment: 'logo_alignment',
  signatureUrl: 'signature_url',
  signatureScale: 'signature_scale',
  signatureAlignment: 'signature_alignment',
  stampUrl: 'stamp_url',
  stampScale: 'stamp_scale',
  stampAlignment: 'stamp_alignment',
  bankDetails: 'bank_details',
  showBankDetailsOnInvoice: 'show_bank_on_invoice',
  showBankDetailsOnQuotation: 'show_bank_on_quotation',
  showBankOnInvoice: 'show_bank_on_invoice',
  showBankOnQuotation: 'show_bank_on_quotation',
  defaultTaxMode: 'default_tax_mode',
  invoicePrefix: 'invoice_prefix',
  quotationPrefix: 'quotation_prefix',
  defaultPaymentTerms: 'default_payment_terms',
  defaultQuotationValidity: 'default_quotation_validity',
  defaultFont: 'default_font',
  defaultOrientation: 'default_orientation',
  defaultInvoiceTerms: 'default_invoice_terms',
  defaultQuotationTerms: 'default_quotation_terms',
  defaultInvoiceTemplate: 'default_invoice_template',
  defaultQuotationTemplate: 'default_quotation_template',
  termsAndConditions: 'terms_and_conditions',
  brandColor: 'brand_color',
  businessDescription: 'business_description',
  addressLine2: 'address_line_2',
};

const VALID_COLUMNS = new Set([
  'address', 'address_line_2', 'alternate_phone', 'bank_details', 'brand_color',
  'business_description', 'business_type', 'city', 'country', 'currency', 'default_font',
  'default_invoice_template', 'default_invoice_terms', 'default_orientation',
  'default_payment_terms', 'default_quotation_template', 'default_quotation_terms',
  'default_quotation_validity', 'default_tax_mode', 'email', 'gstin', 'invoice_prefix',
  'legal_name', 'logo_alignment', 'logo_scale', 'logo_url', 'owner_name', 'pan', 'phone',
  'pincode', 'quotation_prefix', 'reg_number', 'show_bank_on_invoice', 'show_bank_on_quotation',
  'signature_alignment', 'signature_scale', 'signature_url', 'stamp_alignment', 'stamp_scale',
  'stamp_url', 'state', 'terms_and_conditions', 'theme', 'website',
]);

function sanitizeSettingsPayload(settings: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    const mappedKey = FIELD_ALIASES[key] || key;
    if (VALID_COLUMNS.has(mappedKey)) {
      out[mappedKey] = value;
    } else if (import.meta.env.DEV) {
      console.warn(`[businessSettingsService] Dropping unknown field "${key}" from update payload — no matching column.`);
    }
  }
  return out;
}

export class SupabaseBusinessSettingsService {
  public async getSettings(): Promise<{ success: boolean; data?: any; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        const errStr = handleSupabaseError(error, 'getSettings');
        return { success: false, error: errStr };
      }
      return { success: true, data };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'getSettings');
      return { success: false, error: errStr };
    }
  }

  public async getBusinessSettings(): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.getSettings();
  }


  public async updateSettings(settings: any): Promise<{ success: boolean; data?: any; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace found.' };
    }

    if (settings.phone) {
      const pRes = validateIndianPhoneNumber(settings.phone, false);
      if (!pRes.isValid) {
        return { success: false, error: pRes.error || 'Business phone number must contain exactly 10 digits.' };
      }
      settings.phone = pRes.normalized;
    }

    const alt = settings.alternate_phone || settings.alternatePhone;
    if (alt) {
      const aRes = validateIndianPhoneNumber(alt, false);
      if (!aRes.isValid) {
        return { success: false, error: aRes.error || 'Alternate phone number must contain exactly 10 digits.' };
      }
      if (settings.alternate_phone) settings.alternate_phone = aRes.normalized;
      if (settings.alternatePhone) settings.alternatePhone = aRes.normalized;
    }

    try {
      const payload = {
        workspace_id: workspaceId,
        ...sanitizeSettingsPayload(settings),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('business_settings')
        .upsert(payload, { onConflict: 'workspace_id' })
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'updateSettings');
        return { success: false, error: errStr };
      }
      return { success: true, data };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'updateSettings');
      return { success: false, error: errStr };
    }
  }
}

export const businessSettingsService = new SupabaseBusinessSettingsService();
