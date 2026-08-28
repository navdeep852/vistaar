import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Printer,
  Share2,
  CheckCircle,
  Plus,
  Trash2,
  Upload,
  Palette,
  Type,
  User,
  Package,
  FileText,
  Eye,
  Sliders,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { store } from '../services/store';
import {
  DocumentType,
  BrandingConfig,
  ThemeConfig,
  DocumentCustomization,
  LogoAlignment,
  FontFamily,
  DOCUMENT_FONTS,
} from '../types/template';
import { Customer, Product, QuotationItem, InvoiceItem } from '../types';
import { INVOICE_TEMPLATES } from '../templates/invoiceTemplates';
import { QUOTATION_TEMPLATES } from '../templates/quotationTemplates';
import { DocumentRenderer } from '../components/DocumentRenderer';
import { printDocument } from '../services/printService';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';
import { ProductAutocomplete } from '../components/ProductAutocomplete';


interface DocumentEditorViewProps {
  documentType: DocumentType;
  initialTemplateId?: string;
  initialDraftData?: any;
  onBack: () => void;
  onSuccess?: () => void;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const DocumentEditorView: React.FC<DocumentEditorViewProps> = ({
  documentType,
  initialTemplateId,
  initialDraftData,
  onBack,
  onSuccess,
  onNavigateTab,
  activeTab,
}) => {
  const settings = store.getSettings();
  const customers = store.getCustomers();
  const products = store.getProducts();

  const allTemplates = [...INVOICE_TEMPLATES, ...QUOTATION_TEMPLATES];

  // 1. Template State
  const [templateId, setTemplateId] = useState<string>(
    initialDraftData?.templateId ||
      initialTemplateId ||
      store.getLastUsedTemplate(documentType)
  );
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [editorSection, setEditorSection] = useState<
    'customer' | 'items' | 'branding' | 'appearance' | 'layout' | 'terms'
  >('customer');

  // Active Template Object
  const currentTemplate =
    allTemplates.find((t) => t.id === templateId) ||
    (documentType === 'invoice' ? INVOICE_TEMPLATES[0] : QUOTATION_TEMPLATES[0]);

  // 2. Customer State
  const [customerMode, setCustomerMode] = useState<'existing' | 'manual'>('manual');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialDraftData?.customerId || ''
  );
  const [saveCustomerToDb, setSaveCustomerToDb] = useState(false);

  const [customerName, setCustomerName] = useState(
    initialDraftData?.customerName || ''
  );
  const [customerPhone, setCustomerPhone] = useState(
    initialDraftData?.customerPhone || ''
  );
  const [customerWhatsapp, setCustomerWhatsapp] = useState(
    initialDraftData?.customerWhatsapp || ''
  );
  const [customerEmail, setCustomerEmail] = useState(
    initialDraftData?.customerEmail || ''
  );
  const [customerAddress, setCustomerAddress] = useState(
    initialDraftData?.customerAddress || ''
  );
  const [customerGstin, setCustomerGstin] = useState(
    initialDraftData?.customerGstin || ''
  );

  // Dates
  const [date, setDate] = useState(
    initialDraftData?.date || new Date().toISOString().split('T')[0]
  );
  const [dueDateOrValid, setDueDateOrValid] = useState(
    initialDraftData?.dueDate ||
      initialDraftData?.validUntil ||
      new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  );

  // 3. Line Items State
  interface EditorItem {
    productId?: string;
    productName: string;
    sku?: string;
    partNumber?: string;
    availableStock?: number;
    unit: string;
    quantity: number;
    sellingPrice: number;
    discountAmount: number;
    taxPercent: number;
  }


  const [items, setItems] = useState<EditorItem[]>(
    initialDraftData?.items || [
      {
        productId: products[0]?.id,
        productName: products[0]?.name || 'Wireless Bluetooth Headset',
        sku: products[0]?.sku || 'SKU-HEADSET-01',
        unit: 'Pcs',
        quantity: 2,
        sellingPrice: products[0]?.sellingPrice || 1999,
        discountAmount: 0,
        taxPercent: 18,
      },
    ]
  );

  // 4. Branding Assets State (Auto-fetches workspace defaults)
  const [branding, setBranding] = useState<BrandingConfig>(
    initialDraftData?.branding || {
      logoUrl: settings.logoUrl || '',
      logoAlignment: settings.logoAlignment || 'left',
      logoScale: settings.logoScale || 1,
      logoSource: settings.logoUrl ? 'saved' : 'none',

      signatureUrl: settings.signatureUrl || '',
      signatureScale: settings.signatureScale || 1,
      signatureSource: settings.signatureUrl ? 'saved' : 'none',

      stampUrl: settings.stampUrl || '',
      stampScale: settings.stampScale || 1,
      stampSource: settings.stampUrl ? 'saved' : 'none',
    }
  );

  // 5. Customization State (Font, Colors, Toggles, Scaling)
  const [customization, setCustomization] = useState<DocumentCustomization>(
    initialDraftData?.customization || {
      fontFamily: (settings.defaultFont as FontFamily) || currentTemplate.defaultTheme.fontFamily || 'Inter',
      headingFont: (settings.defaultFont as FontFamily) || currentTemplate.defaultTheme.fontFamily || 'Inter',
      bodyFont: (settings.defaultFont as FontFamily) || currentTemplate.defaultTheme.fontFamily || 'Inter',
      fontScale: 'standard',
      primaryColor: settings.brandColor || currentTemplate.defaultTheme.primaryColor || '#2563eb',
      secondaryColor: currentTemplate.defaultTheme.secondaryColor || '#3b82f6',
      accentColor: '#3b82f6',
      textColor: '#0f172a',

      showGstin: true,
      showPan: true,
      showHsnSac: true,
      showBankDetails:
        documentType === 'invoice'
          ? settings.showBankDetailsOnInvoice ?? true
          : settings.showBankDetailsOnQuotation ?? true,
      showUpi: true,
      showSignature: true,
      showStamp: true,
      showTerms: true,
      showNotes: true,
      showDueDate: true,

      businessAlignment: 'left',
      titleAlignment: 'right',
      orientation: settings.defaultOrientation || 'portrait',
    }
  );

  // 6. Notes, Terms & Footer
  const [notes, setNotes] = useState(
    initialDraftData?.notes || 'Prices valid for 15 days. Delivery within 3 business days.'
  );
  const [terms, setTerms] = useState(
    initialDraftData?.terms ||
      (documentType === 'invoice'
        ? settings.defaultInvoiceTerms || settings.termsAndConditions
        : settings.defaultQuotationTerms || '1. Quotation valid for 15 days.\n2. Prices subject to applicable GST taxes.')
  );
  const [footerText, setFooterText] = useState(
    initialDraftData?.footerText || 'Thank you for doing business with us!'
  );

  // Finalize Confirmation Modal
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  // Sync template customization when template changes
  useEffect(() => {
    if (currentTemplate && !initialDraftData) {
      setCustomization((prev) => ({
        ...prev,
        fontFamily: currentTemplate.defaultTheme?.fontFamily || 'Inter',
        headingFont: currentTemplate.defaultTheme?.fontFamily || 'Inter',
        bodyFont: currentTemplate.defaultTheme?.fontFamily || 'Inter',
        primaryColor: currentTemplate.defaultTheme?.primaryColor || '#2563eb',
        secondaryColor: currentTemplate.defaultTheme?.secondaryColor || '#3b82f6',
        textColor: currentTemplate.defaultTheme?.textColor || '#0f172a',
      }));
    }
  }, [templateId]);

  // Color Presets
  const colorPresets = [
    { name: 'Vistaar Blue', primary: '#2563eb', secondary: '#3b82f6' },
    { name: 'Corporate Dark', primary: '#0f172a', secondary: '#475569' },
    { name: 'Emerald Green', primary: '#059669', secondary: '#10b981' },
    { name: 'Royal Purple', primary: '#7c3aed', secondary: '#8b5cf6' },
    { name: 'Amber Gold', primary: '#d97706', secondary: '#f59e0b' },
    { name: 'Crimson Red', primary: '#dc2626', secondary: '#ef4444' },
    { name: 'Slate Teal', primary: '#0f766e', secondary: '#14b8a6' },
    { name: 'Monochrome', primary: '#000000', secondary: '#525252' },
  ];

  // Handle Existing Customer Change
  const handleSelectExistingCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.phone);
      setCustomerWhatsapp(cust.whatsapp || cust.phone);
      setCustomerEmail(cust.email);
      setCustomerAddress(`${cust.address}, ${cust.city}`);
      setCustomerGstin(cust.gstin || '');
    }
  };

  // Line Item Handlers
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        productName: 'Custom Item / Service',
        unit: 'Pcs',
        quantity: 1,
        sellingPrice: 1000,
        discountAmount: 0,
        taxPercent: 18,
      },
    ]);
  };

  const handleSelectProductForLine = (index: number, prod: Product) => {
    const availStock = Number(prod.currentStock ?? (prod as any).current_stock ?? 0);
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        productName: prod.name || (prod as any).productName || 'Product',
        sku: prod.sku || (prod as any).product_code || '',
        partNumber: prod.partNumber || (prod as any).part_number || '',
        unit: prod.unit || 'Pcs',
        sellingPrice: prod.sellingPrice ?? (prod as any).selling_price ?? 0,
        availableStock: availStock,
        taxPercent: prod.taxPercent ?? 18,
      };
      return updated;
    });
  };



  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Math Calculations
  const calculatedItems: (QuotationItem | InvoiceItem)[] = items.map((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const lineSubtotal = item.quantity * item.sellingPrice;
    const afterDiscount = Math.max(0, lineSubtotal - item.discountAmount);
    const taxAmount = (afterDiscount * item.taxPercent) / 100;
    const total = afterDiscount + taxAmount;

    return {
      id: `item-${idx}`,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit,
      quantity: item.quantity,
      buyPrice: prod ? prod.buyPrice : 0, // NEVER exposed
      sellingPrice: item.sellingPrice,
      discountAmount: item.discountAmount,
      taxPercent: item.taxPercent,
      taxAmount,
      total,
    };
  });

  const subtotal = calculatedItems.reduce((acc, i) => acc + i.quantity * i.sellingPrice, 0);
  const discountTotal = calculatedItems.reduce((acc, i) => acc + i.discountAmount, 0);
  const taxTotal = calculatedItems.reduce((acc, i) => acc + i.taxAmount, 0);
  const grandTotal = subtotal - discountTotal + taxTotal;

  // File Upload Handlers (Logo, Signature, Stamp with override validation)
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logo' | 'signature' | 'stamp'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = store.validateAssetFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (field === 'logo') {
        setBranding((prev) => ({ ...prev, logoUrl: url, logoSource: 'override' }));
      } else if (field === 'signature') {
        setBranding((prev) => ({ ...prev, signatureUrl: url, signatureSource: 'override' }));
      } else if (field === 'stamp') {
        setBranding((prev) => ({ ...prev, stampUrl: url, stampSource: 'override' }));
      }
      showToast(`${field.toUpperCase()} overridden for this document only.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleResetToSavedAsset = (field: 'logo' | 'signature' | 'stamp') => {
    if (field === 'logo') {
      setBranding((prev) => ({
        ...prev,
        logoUrl: settings.logoUrl || '',
        logoAlignment: settings.logoAlignment || 'left',
        logoScale: settings.logoScale || 1,
        logoSource: settings.logoUrl ? 'saved' : 'none',
      }));
    } else if (field === 'signature') {
      setBranding((prev) => ({
        ...prev,
        signatureUrl: settings.signatureUrl || '',
        signatureScale: settings.signatureScale || 1,
        signatureSource: settings.signatureUrl ? 'saved' : 'none',
      }));
    } else if (field === 'stamp') {
      setBranding((prev) => ({
        ...prev,
        stampUrl: settings.stampUrl || '',
        stampScale: settings.stampScale || 1,
        stampSource: settings.stampUrl ? 'saved' : 'none',
      }));
    }
    showToast(`Restored saved workspace business ${field}.`, 'info');
  };

  // Save Draft Action
  const handleSaveDraft = () => {
    if (documentType === 'invoice') {
      store.addInvoice({
        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone,
        customerWhatsapp,
        customerEmail,
        customerAddress,
        customerGstin,
        status: 'Draft',
        date,
        dueDate: dueDateOrValid,
        items: calculatedItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paidAmount: 0,
        balanceAmount: grandTotal,
        notes,
        terms,
        footerText,
        templateId,
        branding,
        theme: {
          primaryColor: customization.primaryColor,
          secondaryColor: customization.secondaryColor,
          textColor: customization.textColor,
          fontFamily: customization.bodyFont,
        },
        customization,
      });
      showToast('Invoice saved as Draft!', 'success');
    } else {
      store.addQuotation({
        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone,
        customerWhatsapp,
        customerEmail,
        customerAddress,
        customerGstin,
        status: 'Draft',
        date,
        validUntil: dueDateOrValid,
        items: calculatedItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        notes,
        terms,
        footerText,
        templateId,
        branding,
        theme: {
          primaryColor: customization.primaryColor,
          secondaryColor: customization.secondaryColor,
          textColor: customization.textColor,
          fontFamily: customization.bodyFont,
        },
        customization,
      });
      showToast('Quotation saved as Draft!', 'success');
    }
    onSuccess?.() || onBack();
  };

  // Finalize Document Action
  const handleFinalizeDocument = () => {
    if (!customerName) {
      showToast('Please enter customer name.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Please add at least one line item.', 'error');
      return;
    }

    if (saveCustomerToDb && customerMode === 'manual') {
      store.addCustomer({
        name: customerName,
        phone: customerPhone,
        whatsapp: customerWhatsapp || customerPhone,
        email: customerEmail,
        address: customerAddress,
        city: 'City',
        state: 'State',
        pincode: '000000',
        gstin: customerGstin,
        customerType: 'Retail',
        creditLimit: 50000,
        paymentTerms: 'Immediate',
      });
    }

    if (documentType === 'invoice') {
      // Stock validation for linked catalog products
      for (const item of items) {
        if (item.productId) {
          const storeProd = store.getProducts().find((p: Product) => p.id === item.productId);
          const avail = (item as any).availableStock ?? storeProd?.currentStock ?? 0;
          if (item.quantity > avail) {

            showToast(
              `Insufficient stock for "${item.productName}". Available: ${avail}, Requested: ${item.quantity}`,
              'error'
            );
            return;
          }
        }
      }

      const inv = store.addInvoice({

        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone,
        customerWhatsapp,
        customerEmail,
        customerAddress,
        customerGstin,
        status: 'Issued',
        date,
        dueDate: dueDateOrValid,
        items: calculatedItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paidAmount: 0,
        balanceAmount: grandTotal,
        notes,
        terms,
        footerText,
        templateId,
        branding,
        theme: {
          primaryColor: customization.primaryColor,
          secondaryColor: customization.secondaryColor,
          textColor: customization.textColor,
          fontFamily: customization.bodyFont,
        },
        customization,
      });
      showToast(`Invoice ${inv.invoiceNumber} finalized & snapshot saved!`, 'success');
    } else {
      const qt = store.addQuotation({
        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone,
        customerWhatsapp,
        customerEmail,
        customerAddress,
        customerGstin,
        status: 'Sent',
        date,
        validUntil: dueDateOrValid,
        items: calculatedItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        notes,
        terms,
        footerText,
        templateId,
        branding,
        theme: {
          primaryColor: customization.primaryColor,
          secondaryColor: customization.secondaryColor,
          textColor: customization.textColor,
          fontFamily: customization.bodyFont,
        },
        customization,
      });
      showToast(`Quotation ${qt.quotationNumber} finalized & snapshot saved!`, 'success');
    }

    setFinalizeConfirmOpen(false);
    onSuccess?.() || onBack();
  };

  // WhatsApp Handoff
  const handleSendWhatsApp = () => {
    const docTitle = documentType === 'invoice' ? 'Invoice' : 'Quotation';
    const text = `Hello ${customerName} ji,\n\nPlease find your ${docTitle} for ${settings.currency}${grandTotal.toLocaleString()}.\n\nThank you for your business,\n${settings.businessName}`;
    const cleanPhone = (customerWhatsapp || customerPhone).replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast('Opening WhatsApp with pre-filled document summary...', 'info');
  };

  // Isolated A4 Document Printing
  const handlePrintDocument = () => {
    printDocument({
      templateId,
      documentType,
      documentNumber: documentType === 'invoice' ? 'INV-2026-0001' : 'QT-2026-0001',
      date,
      dueDateOrValidUntil: dueDateOrValid,
      businessName: settings.businessName,
      phone: settings.phone,
      email: settings.email,
      address: settings.address,
      city: settings.city,
      state: settings.state,
      pincode: settings.pincode,
      gstin: settings.gstin,
      bankDetails: settings.bankDetails,
      customerName: customerName || 'Customer Name',
      customerPhone,
      customerWhatsapp,
      customerEmail,
      customerAddress,
      customerGstin,
      items: calculatedItems,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      currency: settings.currency,
      notes,
      terms,
      footerText,
      branding,
      theme: {
        primaryColor: customization.primaryColor,
        secondaryColor: customization.secondaryColor,
        textColor: customization.textColor,
        fontFamily: customization.bodyFont,
      },
      customization,
    });
  };

  return (
    <DedicatedWorkspace
      title={documentType === 'invoice' ? 'Generate Invoice' : 'Generate Quotation'}
      subtitle="Create, customize, preview, and issue professional business documents."
      badgeText={documentType === 'invoice' ? 'INVOICE WORKSPACE' : 'QUOTATION WORKSPACE'}
      icon={FileText}
      onClose={onBack}
      onNavigateTab={onNavigateTab}
      activeTab={activeTab || (documentType === 'invoice' ? 'invoices' : 'quotations')}
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
          {/* Template Switcher Button */}
          <button
            onClick={() => setGalleryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Template: {currentTemplate.name}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {/* Quick Font Selector Dropdown */}
          <div className="relative">
            <select
              value={customization.bodyFont}
              onChange={(e) =>
                setCustomization((prev) => ({
                  ...prev,
                  fontFamily: e.target.value as FontFamily,
                  headingFont: e.target.value as FontFamily,
                  bodyFont: e.target.value as FontFamily,
                }))
              }
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
            >
              {DOCUMENT_FONTS.map((font) => (
                <option
                  key={font}
                  value={font}
                  style={{ fontFamily: `'${font}', sans-serif` }}
                >
                  Font: {font}
                </option>
              ))}
            </select>
          </div>

          {/* Mobile Tab Toggle */}
          <div className="flex lg:hidden bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setMobileTab('editor')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                mobileTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setMobileTab('preview')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                mobileTab === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Preview
            </button>
          </div>

          <button
            onClick={handleSaveDraft}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          <button
            onClick={() => setFinalizeConfirmOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition-colors cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Finalize</span>
          </button>
        </div>
      }
    >

      {/* Main Split Screen Desktop / Mobile Toggle */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: EDITOR CONTROLS */}
        <div
          className={`lg:col-span-5 space-y-5 ${
            mobileTab === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Section Selector Tabs */}
          <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs justify-between overflow-x-auto scrollbar-none transition-colors">
            {[
              { id: 'customer', label: 'Customer', icon: User },
              { id: 'items', label: 'Items', icon: Package },
              { id: 'branding', label: 'Branding', icon: Upload },
              { id: 'appearance', label: 'Style', icon: Palette },
              { id: 'layout', label: 'Toggles', icon: Sliders },
              { id: 'terms', label: 'Terms', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = editorSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setEditorSection(tab.id as any)}
                  className={`flex-1 min-w-fit px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* SECTION 1: CUSTOMER SELECTION */}
          {editorSection === 'customer' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                Customer Details
              </h3>

              <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCustomerMode('manual')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    customerMode === 'manual' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Enter Manually
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    customerMode === 'existing' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Select Existing
                </button>
              </div>

              {customerMode === 'existing' ? (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    Select Customer Record
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold"
                  >
                    <option value="">-- Choose Existing Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Rajesh Enterprise"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Phone</label>
                      <input
                        type="text"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="9820011223"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">WhatsApp</label>
                      <input
                        type="text"
                        value={customerWhatsapp}
                        onChange={(e) => setCustomerWhatsapp(e.target.value)}
                        placeholder="9820011223"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Address</label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Shop/Office address"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">GSTIN</label>
                    <input
                      type="text"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value)}
                      placeholder="27ABCDE1234F1Z2"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: LINE ITEMS & PRICING */}
          {editorSection === 'items' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Line Items & Pricing</h3>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Item #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 p-1 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                        Search & Select Product from Catalog
                      </label>
                      <ProductAutocomplete
                        onSelectProduct={(prod) => handleSelectProductForLine(idx, prod)}
                        selectedProductId={item.productId}
                        selectedProductName={item.productName}
                        currency={settings.currency}
                        fallbackProducts={products}
                      />
                      {item.productId && (
                        <div className="flex items-center justify-between text-[10px] pt-1">
                          <span className="font-bold text-slate-500 dark:text-slate-400">
                            Available Stock:{' '}
                            <strong
                              className={
                                (item.quantity || 0) > ((item as any).availableStock ?? 0)
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }
                            >
                              {(item as any).availableStock ?? 0} {item.unit || 'Pcs'}
                            </strong>
                          </span>
                          {documentType === 'invoice' && (item.quantity || 0) > ((item as any).availableStock ?? 0) && (
                            <span className="font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              ⚠️ Insufficient stock for finalization
                            </span>
                          )}
                        </div>
                      )}
                    </div>


                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                        Item / Service Description *
                      </label>
                      <input
                        type="text"
                        required
                        value={item.productName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItems((prev) => {
                            const updated = [...prev];
                            updated[idx].productName = val;
                            return updated;
                          });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx].quantity = val;
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">Price</label>
                        <input
                          type="number"
                          value={item.sellingPrice}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx].sellingPrice = val;
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">Disc ({settings.currency})</label>
                        <input
                          type="number"
                          value={item.discountAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx].discountAmount = val;
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">Tax %</label>
                        <input
                          type="number"
                          value={item.taxPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setItems((prev) => {
                              const updated = [...prev];
                              updated[idx].taxPercent = val;
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: BRANDING ASSETS */}
          {editorSection === 'branding' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <div className="border-b pb-2 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Document Branding & Assets
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Global workspace defaults auto-loaded
                </span>
              </div>

              {/* Logo Section */}
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Company Logo</label>
                  {branding.logoSource === 'override' ? (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                      Overridden for this document
                    </span>
                  ) : branding.logoUrl ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Using saved business logo</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">No logo active</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors">
                    <span>{branding.logoUrl ? 'Replace for This Document' : 'Upload Custom Logo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={(e) => handleFileUpload(e, 'logo')}
                      className="hidden"
                    />
                  </label>

                  {branding.logoSource === 'override' && (
                    <button
                      type="button"
                      onClick={() => handleResetToSavedAsset('logo')}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      Use Saved Logo
                    </button>
                  )}

                  {branding.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setBranding((prev) => ({ ...prev, logoUrl: '', logoSource: 'none' }))}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                    >
                      Remove from Document
                    </button>
                  )}
                </div>

                {branding.logoUrl && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Position:</span>
                    {(['left', 'center', 'right'] as LogoAlignment[]).map((align) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => setBranding((prev) => ({ ...prev, logoAlignment: align }))}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg border ${
                          branding.logoAlignment === align
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Signature Section */}
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Authorized Signature</label>
                  {branding.signatureSource === 'override' ? (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                      Overridden for this document
                    </span>
                  ) : branding.signatureUrl ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Using saved signature</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">No signature active</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors">
                    <span>{branding.signatureUrl ? 'Replace for This Document' : 'Upload Custom Signature'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={(e) => handleFileUpload(e, 'signature')}
                      className="hidden"
                    />
                  </label>

                  {branding.signatureSource === 'override' && (
                    <button
                      type="button"
                      onClick={() => handleResetToSavedAsset('signature')}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      Use Saved Signature
                    </button>
                  )}

                  {branding.signatureUrl && (
                    <button
                      type="button"
                      onClick={() => setBranding((prev) => ({ ...prev, signatureUrl: '', signatureSource: 'none' }))}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                    >
                      Remove from Document
                    </button>
                  )}
                </div>
              </div>

              {/* Stamp Section */}
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Official Stamp / Seal</label>
                  {branding.stampSource === 'override' ? (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                      Overridden for this document
                    </span>
                  ) : branding.stampUrl ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Using saved stamp</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">No stamp active</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors">
                    <span>{branding.stampUrl ? 'Replace for This Document' : 'Upload Custom Stamp'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={(e) => handleFileUpload(e, 'stamp')}
                      className="hidden"
                    />
                  </label>

                  {branding.stampSource === 'override' && (
                    <button
                      type="button"
                      onClick={() => handleResetToSavedAsset('stamp')}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      Use Saved Stamp
                    </button>
                  )}

                  {branding.stampUrl && (
                    <button
                      type="button"
                      onClick={() => setBranding((prev) => ({ ...prev, stampUrl: '', stampSource: 'none' }))}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-bold hover:bg-rose-100"
                    >
                      Remove from Document
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: APPEARANCE (FONTS, COLORS, FONT SCALING) */}
          {editorSection === 'appearance' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-5 transition-colors">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                Appearance & Typography
              </h3>

              {/* Heading Font vs Body Font */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Heading Font</label>
                  <select
                    value={customization.headingFont}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, headingFont: e.target.value as FontFamily }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold"
                  >
                    {DOCUMENT_FONTS.map((font) => (
                      <option key={font} value={font} style={{ fontFamily: `'${font}', sans-serif` }}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Body Font</label>
                  <select
                    value={customization.bodyFont}
                    onChange={(e) =>
                      setCustomization((prev) => ({
                        ...prev,
                        bodyFont: e.target.value as FontFamily,
                        fontFamily: e.target.value as FontFamily,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-bold"
                  >
                    {DOCUMENT_FONTS.map((font) => (
                      <option key={font} value={font} style={{ fontFamily: `'${font}', sans-serif` }}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Page Orientation</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'portrait', label: 'Portrait (210×297 mm)' },
                      { id: 'landscape', label: 'Landscape (297×210 mm)' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() =>
                          setCustomization((prev) => ({ ...prev, orientation: o.id as any }))
                        }
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                          (customization.orientation || 'portrait') === o.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Document Font Scale</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'compact', label: 'Compact' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'large', label: 'Large' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setCustomization((prev) => ({ ...prev, fontScale: s.id as any }))
                        }
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border ${
                          customization.fontScale === s.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color Presets & HEX Pickers */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Theme Color Presets</label>
                <div className="flex flex-wrap gap-2">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setCustomization((prev) => ({
                          ...prev,
                          primaryColor: preset.primary,
                          secondaryColor: preset.secondary,
                        }))
                      }
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 shadow-md transition-transform hover:scale-110"
                      style={{ backgroundColor: preset.primary }}
                      title={preset.name}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Primary</span>
                    <input
                      type="color"
                      value={customization.primaryColor}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 p-1 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Text Color</span>
                    <input
                      type="color"
                      value={customization.textColor}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, textColor: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 p-1 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: LAYOUT & SECTION TOGGLES */}
          {editorSection === 'layout' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                Document Section Toggles
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Enable or disable specific sections with clean automatic reflow.</p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { key: 'showGstin', label: 'Show GSTIN' },
                  { key: 'showPan', label: 'Show PAN' },
                  { key: 'showBankDetails', label: 'Show Bank Details' },
                  { key: 'showUpi', label: 'Show UPI ID' },
                  { key: 'showSignature', label: 'Show Signature' },
                  { key: 'showStamp', label: 'Show Stamp' },
                  { key: 'showTerms', label: 'Show Terms' },
                  { key: 'showNotes', label: 'Show Notes' },
                  { key: 'showDueDate', label: 'Show Due / Valid Date' },
                ].map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={(customization as any)[toggle.key]}
                      onChange={(e) =>
                        setCustomization((prev) => ({
                          ...prev,
                          [toggle.key]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{toggle.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 6: TERMS & NOTES */}
          {editorSection === 'terms' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                Notes & Terms
              </h3>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Document Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Terms & Conditions</label>
                <textarea
                  rows={4}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Footer Remark</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium"
                />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: LIVE INTERACTIVE A4 DOCUMENT PREVIEW */}
        <div
          className={`lg:col-span-7 ${
            mobileTab === 'editor' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="bg-slate-900 p-4 rounded-2xl shadow-xl flex justify-between items-center mb-3 no-print">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-blue-400" />
              <span>Live A4 Document Preview</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintDocument}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Print</span>
              </button>
              <button
                onClick={handleSendWhatsApp}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white flex items-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Render A4 Document */}
          <DocumentRenderer
            templateId={templateId}
            documentType={documentType}
            documentNumber={documentType === 'invoice' ? 'INV-2026-0001' : 'QT-2026-0001'}
            date={date}
            dueDateOrValidUntil={dueDateOrValid}
            businessName={settings.businessName}
            phone={settings.phone}
            email={settings.email}
            address={settings.address}
            city={settings.city}
            state={settings.state}
            pincode={settings.pincode}
            gstin={settings.gstin}
            bankDetails={settings.bankDetails}
            customerName={customerName || 'Customer Name'}
            customerPhone={customerPhone}
            customerWhatsapp={customerWhatsapp}
            customerEmail={customerEmail}
            customerAddress={customerAddress}
            customerGstin={customerGstin}
            items={calculatedItems}
            subtotal={subtotal}
            discountTotal={discountTotal}
            taxTotal={taxTotal}
            grandTotal={grandTotal}
            currency={settings.currency}
            notes={notes}
            terms={terms}
            footerText={footerText}
            branding={branding}
            theme={{
              primaryColor: customization.primaryColor,
              secondaryColor: customization.secondaryColor,
              textColor: customization.textColor,
              fontFamily: customization.bodyFont,
            }}
            customization={customization}
          />
        </div>
      </div>

      {/* FINALIZE CONFIRMATION MODAL */}
      <Modal
        isOpen={finalizeConfirmOpen}
        onClose={() => setFinalizeConfirmOpen(false)}
        title={`Finalize ${documentType === 'invoice' ? 'Invoice' : 'Quotation'}?`}
        subtitle="Once finalized, a permanent snapshot is created for financial audit integrity."
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Are you sure you want to finalize this document for <strong>{customerName}</strong> for{' '}
            <strong>{settings.currency}{grandTotal.toFixed(2)}</strong>?
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setFinalizeConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalizeDocument}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-md transition-colors"
            >
              Confirm & Finalize
            </button>
          </div>
        </div>
      </Modal>

      {/* TEMPLATE GALLERY MODAL FOR LIVE SWITCHING */}
      <TemplateGalleryModal
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        documentType={documentType}
        currentTemplateId={templateId}
        onSelectTemplate={(tId) => {
          setTemplateId(tId);
          setGalleryOpen(false);
          showToast('Switched document template layout!', 'info');
        }}
      />
    </DedicatedWorkspace>
  );
};
