import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  FileText,
  Eye,
  Printer,
  Share2,
  ArrowRightLeft,
  Sparkles,
  Edit,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { store } from '../services/store';
import { quotationService } from '../services/supabase/quotationService';
import { Quotation, QuotationStatus } from '../types';
import { Modal } from '../components/Modal';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';
import { DocumentEditorView } from './DocumentEditorView';
import { DocumentRenderer } from '../components/DocumentRenderer';
import { printDocument } from '../services/printService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { showToast } from '../components/Toast';
import { toWhatsAppNumber } from '../lib/phoneUtils';

interface QuotationsViewProps {
  initialOpenCreate?: boolean;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const QuotationsView: React.FC<QuotationsViewProps> = ({
  initialOpenCreate = false,
  onNavigateTab,
  activeTab,
}) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Workflow State: list | gallery | editor
  const [mode, setMode] = useState<'list' | 'gallery' | 'editor'>(
    initialOpenCreate ? 'gallery' : 'list'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('qt-modern-blue');
  const [editingDraftQuotation, setEditingDraftQuotation] = useState<Quotation | null>(null);

  // Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  // Convert to Invoice Modal State
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'Unpaid' | 'Partially Paid' | 'Fully Paid'>('Unpaid');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('0');
  const [paymentMode, setPaymentMode] = useState<string>('Cash');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmittingConversion, setIsSubmittingConversion] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => setQuotations(store.getQuotations());
    updateData();
    // Also perform non-blocking reconciliation of previous conversions
    quotationService.reconcileConversions().catch((err) => {
      console.warn('Quotation conversion reconciliation background notice:', err);
    });
    return store.subscribe(updateData);
  }, []);

  const handleEditDraft = (qt: Quotation) => {
    setEditingDraftQuotation(qt);
    setSelectedTemplateId(qt.templateId);
    setMode('editor');
  };

  const openConvertModal = (qt: Quotation) => {
    if (qt.status === 'Converted' || (qt as any).converted_invoice_id || (qt as any).convertedInvoiceId) {
      showToast('This quotation has already been converted to an invoice.', 'info');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const defaultDue = qt.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    setQuotationToConvert(qt);
    setPaymentStatus('Unpaid');
    setPaidAmountInput('0');
    setPaymentMode('Cash');
    setInvoiceDate(today);
    setPaymentDate(today);
    setDueDate(defaultDue);
    setPaymentReference('');
    setPaymentNotes('');
    setValidationError(null);
    setConvertModalOpen(true);
  };

  const handleSelectPaymentStatus = (status: 'Unpaid' | 'Partially Paid' | 'Fully Paid') => {
    setPaymentStatus(status);
    setValidationError(null);
    if (!quotationToConvert) return;
    if (status === 'Unpaid') {
      setPaidAmountInput('0');
    } else if (status === 'Fully Paid') {
      setPaidAmountInput(String(quotationToConvert.grandTotal));
    } else if (status === 'Partially Paid') {
      const half = Math.round(quotationToConvert.grandTotal * 0.5);
      setPaidAmountInput(String(half));
    }
  };

  const handlePaidAmountChange = (val: string) => {
    setPaidAmountInput(val);
    if (!quotationToConvert) return;
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) {
      setValidationError('Partial payment amount must be greater than 0.');
    } else if (num >= quotationToConvert.grandTotal) {
      setValidationError(`Amount cannot equal or exceed total (${settings.currency}${quotationToConvert.grandTotal.toLocaleString()}). Select "Fully Paid" instead.`);
    } else {
      setValidationError(null);
    }
  };

  const handleExecuteConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotationToConvert) return;
    if (isSubmittingConversion) return;

    const total = quotationToConvert.grandTotal;
    let effectivePaid = 0;

    if (paymentStatus === 'Fully Paid') {
      effectivePaid = total;
    } else if (paymentStatus === 'Partially Paid') {
      const parsed = parseFloat(paidAmountInput);
      if (isNaN(parsed) || parsed <= 0) {
        setValidationError('Please enter a valid partial amount greater than 0, or select "Unpaid".');
        return;
      }
      if (parsed >= total) {
        setValidationError(`Partial payment amount cannot equal or exceed total (${settings.currency}${total.toLocaleString()}). Select "Fully Paid" instead.`);
        return;
      }
      effectivePaid = parsed;
    } else {
      effectivePaid = 0;
    }

    setIsSubmittingConversion(true);
    setValidationError(null);

    try {
      const result = await quotationService.convertQuotationToInvoice({
        quotationId: quotationToConvert.id,
        paymentStatus,
        paidAmount: effectivePaid,
        paymentMode: effectivePaid > 0 ? paymentMode : undefined,
        paymentReference: effectivePaid > 0 ? paymentReference : undefined,
        paymentNotes: paymentNotes || undefined,
        invoiceDate: invoiceDate || undefined,
        paymentDate: effectivePaid > 0 ? paymentDate : undefined,
        dueDate: dueDate || undefined,
      });

      if (!result.success) {
        showToast(result.error || 'Failed to convert quotation to invoice.', 'error');
        setIsSubmittingConversion(false);
        return;
      }

      showToast(
        `Quotation ${quotationToConvert.quotationNumber} successfully converted to Invoice ${result.invoiceNumber || ''}!`,
        'success'
      );

      setConvertModalOpen(false);
      setPreviewModalOpen(false);
      setQuotationToConvert(null);
      setQuotations(store.getQuotations());
    } catch (err: any) {
      console.error('Conversion execution error:', err);
      showToast(err?.message || 'Error converting quotation to invoice.', 'error');
    } finally {
      setIsSubmittingConversion(false);
    }
  };

  const handleSendWhatsApp = (qt: Quotation) => {
    const text = `Hello ${qt.customerName} ji,\n\nPlease find quotation ${qt.quotationNumber} for ${settings.currency}${qt.grandTotal.toLocaleString()}.\nQuotation valid until ${qt.validUntil}.\n\nThank you,\n${settings.businessName}`;
    const cleanPhone = toWhatsAppNumber(qt.customerWhatsapp || qt.customerPhone);
    if (!cleanPhone) {
      showToast('Customer phone number is invalid for WhatsApp.', 'error');
      return;
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`Opening WhatsApp for ${qt.customerName}...`, 'info');
  };

  const handlePrintQuotation = (qt: Quotation) => {
    printDocument({
      templateId: qt.templateId,
      documentType: 'quotation',
      documentNumber: qt.quotationNumber,
      date: qt.date,
      dueDateOrValidUntil: qt.validUntil,
      businessName: qt.snapshot?.businessName || settings.businessName,
      phone: qt.snapshot?.phone || settings.phone,
      email: qt.snapshot?.email || settings.email,
      address: qt.snapshot?.address || settings.address,
      city: qt.snapshot?.city || settings.city,
      state: qt.snapshot?.state || settings.state,
      pincode: qt.snapshot?.pincode || settings.pincode,
      gstin: qt.snapshot?.gstin || settings.gstin,
      bankDetails: qt.snapshot?.bankDetails || settings.bankDetails,
      customerName: qt.customerName,
      customerPhone: qt.customerPhone,
      customerWhatsapp: qt.customerWhatsapp,
      customerEmail: qt.customerEmail,
      customerAddress: qt.customerAddress,
      customerGstin: qt.customerGstin,
      items: qt.items,
      subtotal: qt.subtotal,
      discountTotal: qt.discountTotal,
      taxTotal: qt.taxTotal,
      grandTotal: qt.grandTotal,
      currency: settings.currency,
      notes: qt.notes,
      terms: qt.terms,
      footerText: qt.footerText,
      branding: qt.branding,
      theme: qt.theme,
      customization: qt.customization,
    });
  };

  const filteredQuotations = quotations.filter((q) => {
    const matchesSearch =
      q.quotationNumber.toLowerCase().includes(search.toLowerCase()) ||
      q.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (mode === 'editor') {
    return (
      <ErrorBoundary fallbackTitle="Unable to load Quotation Editor" onReset={() => setMode('list')}>
        <DocumentEditorView
          key={editingDraftQuotation?.id || selectedTemplateId}
          documentType="quotation"
          initialTemplateId={selectedTemplateId}
          initialDraftData={editingDraftQuotation}
          onBack={() => {
            setEditingDraftQuotation(null);
            setMode('list');
          }}
          onSuccess={() => {
            setEditingDraftQuotation(null);
            setMode('list');
          }}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'quotations'}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Action Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation # or customer..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Accepted">Accepted</option>
            <option value="Converted">Converted</option>
            <option value="Expired">Expired</option>
          </select>
        </div>

        <button
          onClick={() => {
            setEditingDraftQuotation(null);
            setMode('gallery');
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>+ Add New Quotation</span>
        </button>
      </div>

      {/* Quotations Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Quotation #</th>
                <th className="px-6 py-3.5">Customer</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Valid Until</th>
                <th className="px-6 py-3.5">Grand Total</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    No quotations found. Click <strong>+ Add New Quotation</strong> to choose a template!
                  </td>
                </tr>
              ) : (
                filteredQuotations.map((qt) => (
                  <tr key={qt.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">{qt.quotationNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{qt.customerName}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{qt.date}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{qt.validUntil}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                      {settings.currency}{qt.grandTotal.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={qt.status}
                        onChange={(e) => {
                          const newStatus = e.target.value as QuotationStatus;
                          if (newStatus === 'Converted') {
                            openConvertModal(qt);
                          } else {
                            store.updateQuotationStatus(qt.id, newStatus);
                          }
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full border-0 focus:ring-2 focus:ring-blue-500 ${
                          qt.status === 'Accepted'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : qt.status === 'Converted'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                            : qt.status === 'Sent'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Expired">Expired</option>
                        <option value="Converted">Converted</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      {qt.status === 'Draft' && (
                        <button
                          onClick={() => handleEditDraft(qt)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800"
                          title="Edit Draft & Change Template"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedQuotation(qt);
                          setPreviewModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="Preview & Print PDF"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSendWhatsApp(qt)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                        title="Send via WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      {qt.status !== 'Converted' && (
                        <button
                          onClick={() => openConvertModal(qt)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                          title="Convert to Invoice"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TEMPLATE GALLERY MODAL */}
      <TemplateGalleryModal
        isOpen={mode === 'gallery'}
        onClose={() => setMode('list')}
        documentType="quotation"
        currentTemplateId={selectedTemplateId}
        onSelectTemplate={(tId) => {
          setSelectedTemplateId(tId);
          setMode('editor');
        }}
      />

      {/* PREVIEW & PRINT MODAL */}
      {selectedQuotation && (
        <Modal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={`Quotation Preview — ${selectedQuotation.quotationNumber}`}
          maxWidth="4xl"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between no-print bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Printable A4 Document</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintQuotation(selectedQuotation)}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Download / Print PDF</span>
                </button>
                <button
                  onClick={() => handleSendWhatsApp(selectedQuotation)}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
                {selectedQuotation.status !== 'Converted' && (
                  <button
                    onClick={() => openConvertModal(selectedQuotation)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Convert to Invoice</span>
                  </button>
                )}
              </div>
            </div>

            {/* Document Snapshot Renderer */}
            <DocumentRenderer
              templateId={selectedQuotation.templateId}
              documentType="quotation"
              documentNumber={selectedQuotation.quotationNumber}
              date={selectedQuotation.date}
              dueDateOrValidUntil={selectedQuotation.validUntil}
              businessName={selectedQuotation.snapshot?.businessName || settings.businessName}
              phone={selectedQuotation.snapshot?.phone || settings.phone}
              email={selectedQuotation.snapshot?.email || settings.email}
              address={selectedQuotation.snapshot?.address || settings.address}
              city={selectedQuotation.snapshot?.city || settings.city}
              state={selectedQuotation.snapshot?.state || settings.state}
              pincode={selectedQuotation.snapshot?.pincode || settings.pincode}
              gstin={selectedQuotation.snapshot?.gstin || settings.gstin}
              bankDetails={selectedQuotation.snapshot?.bankDetails || settings.bankDetails}
              customerName={selectedQuotation.customerName}
              customerPhone={selectedQuotation.customerPhone}
              customerWhatsapp={selectedQuotation.customerWhatsapp}
              customerEmail={selectedQuotation.customerEmail}
              customerAddress={selectedQuotation.customerAddress}
              customerGstin={selectedQuotation.customerGstin}
              items={selectedQuotation.items}
              subtotal={selectedQuotation.subtotal}
              discountTotal={selectedQuotation.discountTotal}
              taxTotal={selectedQuotation.taxTotal}
              grandTotal={selectedQuotation.grandTotal}
              currency={settings.currency}
              notes={selectedQuotation.notes}
              terms={selectedQuotation.terms}
              footerText={selectedQuotation.footerText}
              branding={selectedQuotation.branding}
              theme={selectedQuotation.theme}
              customization={selectedQuotation.customization}
            />
          </div>
        </Modal>
      )}

      {/* CONVERT QUOTATION TO INVOICE PIPELINE MODAL */}
      {quotationToConvert && (
        <Modal
          isOpen={convertModalOpen}
          onClose={() => {
            if (!isSubmittingConversion) setConvertModalOpen(false);
          }}
          title="Convert Quotation to Invoice"
          subtitle={`Quotation: ${quotationToConvert.quotationNumber} • Customer: ${quotationToConvert.customerName}`}
          maxWidth="2xl"
        >
          {(() => {
            const invoiceTotal = quotationToConvert.grandTotal;
            const parsedPaid = parseFloat(paidAmountInput);
            const effectivePaidAmount =
              paymentStatus === 'Unpaid'
                ? 0
                : paymentStatus === 'Fully Paid'
                ? invoiceTotal
                : Math.min(invoiceTotal, Math.max(0, isNaN(parsedPaid) ? 0 : parsedPaid));
            const effectiveBalanceDue = Math.max(0, invoiceTotal - effectivePaidAmount);

            return (
              <form onSubmit={handleExecuteConversion} className="space-y-5 text-slate-800 dark:text-slate-100">
                {/* Invoice Total Banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 rounded-2xl border border-blue-100 dark:border-slate-700">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      Invoice Gross Amount
                    </span>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                      {settings.currency}{invoiceTotal.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {quotationToConvert.items.length} item{quotationToConvert.items.length === 1 ? '' : 's'} • Quotation Date: {quotationToConvert.date}
                    </div>
                  </div>
                  <div className="mt-3 sm:mt-0 flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-slate-700 shadow-sm text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span>Target: Official Invoice</span>
                  </div>
                </div>

                {/* Payment Status Selection Cards */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                    Payment Status on Conversion
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Unpaid */}
                    <div
                      onClick={() => handleSelectPaymentStatus('Unpaid')}
                      className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        paymentStatus === 'Unpaid'
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Unpaid</span>
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentStatus === 'Unpaid' ? 'border-amber-500 bg-amber-500' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {paymentStatus === 'Unpaid' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        No payment received yet. Full invoice amount added to Customer Udhari.
                      </p>
                      <div className="mt-3 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Paid: {settings.currency}0
                      </div>
                    </div>

                    {/* Partially Paid */}
                    <div
                      onClick={() => handleSelectPaymentStatus('Partially Paid')}
                      className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        paymentStatus === 'Partially Paid'
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Partially Paid</span>
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentStatus === 'Partially Paid' ? 'border-blue-500 bg-blue-500' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {paymentStatus === 'Partially Paid' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Advance / partial payment received. Balance due tracked in Udhari.
                      </p>
                      <div className="mt-3 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        Partial Advance
                      </div>
                    </div>

                    {/* Fully Paid */}
                    <div
                      onClick={() => handleSelectPaymentStatus('Fully Paid')}
                      className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        paymentStatus === 'Fully Paid'
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Fully Paid</span>
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          paymentStatus === 'Fully Paid' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {paymentStatus === 'Fully Paid' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        100% upfront settlement. Cashbook updated immediately. ₹0 Udhari.
                      </p>
                      <div className="mt-3 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Paid: {settings.currency}{invoiceTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Partial Payment Input */}
                {paymentStatus === 'Partially Paid' && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Amount Received Upfront ({settings.currency}) <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[0.25, 0.5, 0.75].map((pct) => {
                          const amt = Math.round(invoiceTotal * pct);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => handlePaidAmountChange(String(amt))}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                            >
                              {pct * 100}%
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-400">
                        {settings.currency}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max={invoiceTotal - 1}
                        step="1"
                        required
                        value={paidAmountInput}
                        onChange={(e) => handlePaidAmountChange(e.target.value)}
                        className="w-full pl-8 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="Enter amount received"
                      />
                    </div>

                    {validationError && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{validationError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Mode & Details (if payment > 0) */}
                {paymentStatus !== 'Unpaid' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Payment Mode <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI / GPay / PhonePe</option>
                        <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                        <option value="Card">Credit / Debit Card</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Reference / UTR (Optional)
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="e.g. UTR-98765432"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Dates Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Live Accounting Pipeline Breakdown */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Live Accounting Synchronization Impact
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs">
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Total Sales
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                        {settings.currency}{invoiceTotal.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-emerald-600 font-medium mt-0.5">
                        Dashboard & Daybook
                      </div>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs">
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Cashbook Inflow
                      </div>
                      <div className={`text-sm font-black mt-0.5 ${
                        effectivePaidAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}>
                        {settings.currency}{effectivePaidAmount.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium mt-0.5">
                        {effectivePaidAmount > 0 ? paymentMode : 'No inflow'}
                      </div>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs">
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Customer Udhari
                      </div>
                      <div className={`text-sm font-black mt-0.5 ${
                        effectiveBalanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}>
                        {settings.currency}{effectiveBalanceDue.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium mt-0.5">
                        {effectiveBalanceDue > 0 ? 'Outstanding' : 'Fully Cleared'}
                      </div>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs">
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Pipeline Status
                      </div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">
                        Atomic
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium mt-0.5">
                        1-Click Synchronized
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isSubmittingConversion}
                    onClick={() => setConvertModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingConversion || !!validationError}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-colors cursor-pointer"
                  >
                    {isSubmittingConversion ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Converting & Synchronizing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Create Invoice</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};
