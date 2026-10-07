import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  FileText,
  Eye,
  Printer,
  Share2,
  DollarSign,
  Sparkles,
  Edit,
  Truck,
  Calendar,
  Copy,
  Download,
  Loader2,
} from 'lucide-react';
import { store } from '../services/store';
import { invoiceService, paymentService } from '../services/supabase';
import { Invoice, InvoiceStatus, PaymentMethod } from '../types';
import { Modal } from '../components/Modal';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';
import { DocumentEditorView } from './DocumentEditorView';
import { DocumentRenderer, DocumentRendererProps } from '../components/DocumentRenderer';
import { printDocument } from '../services/printService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { showToast } from '../components/Toast';
import {
  normalizeInvoiceToDocument,
  documentDataToRendererProps,
  saveDocumentPdf,
} from '../services/document';
import { toWhatsAppNumber } from '../lib/phoneUtils';
import { CreateEwayBillModal } from '../components/eway/CreateEwayBillModal';
import { shareService, clipboardService } from '../platform';
import { calculateInvoiceFinancials } from '../services/financialCalculationService';
import { useBranch } from '../context/BranchContext';


interface InvoicesViewProps {
  initialOpenCreate?: boolean;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  initialOpenCreate = false,
  onNavigateTab,
  activeTab,
}) => {
  const { currentBranch } = useBranch();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Workflow State: list | gallery | editor
  const [mode, setMode] = useState<'list' | 'gallery' | 'editor'>(
    initialOpenCreate ? (typeof window !== 'undefined' && window.innerWidth < 768 ? 'editor' : 'gallery') : 'list'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => store.getLastUsedTemplate('invoice') || 'inv-modern-blue');
  const [editingDraftInvoice, setEditingDraftInvoice] = useState<Invoice | null>(null);

  // Preview & Record Payment Modals
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [ewayBillModalOpen, setEwayBillModalOpen] = useState(false);

  // Record Payment Form
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => {
      const all = store.getInvoices();
      if (currentBranch) {
        setInvoices(all.filter((i) => !i.branchId || i.branchId === currentBranch.id));
      } else {
        setInvoices(all);
      }
    };
    updateData();

    import('../services/supabase/invoiceService').then(({ invoiceService }) => {
      invoiceService.getInvoices({ branchId: currentBranch?.id }).then((res) => {
        if (res.data && res.data.length > 0) {
          store.syncRemoteInvoices(res.data);
          updateData();
        }
      }).catch(() => {});
    }).catch(() => {});

    const handleBranchChanged = () => updateData();
    window.addEventListener('vistaar:branch_changed', handleBranchChanged);
    const unsub = store.subscribe(updateData);
    return () => {
      window.removeEventListener('vistaar:branch_changed', handleBranchChanged);
      unsub();
    };
  }, [currentBranch?.id]);

  const handleEditDraft = (inv: Invoice) => {
    setEditingDraftInvoice(inv);
    setSelectedTemplateId(inv.templateId);
    setMode('editor');
  };

  const handleOpenPaymentModal = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPayAmount(inv.balanceAmount);
    setPayMethod('UPI');
    setPayRef('');
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || isSubmittingPay) return;

    if (payAmount <= 0) {
      showToast('Payment amount must be greater than zero.', 'error');
      return;
    }

    if (payAmount > (selectedInvoice.balanceAmount + 0.05)) {
      showToast(`Amount received (${settings.currency}${payAmount}) cannot exceed outstanding balance (${settings.currency}${selectedInvoice.balanceAmount}).`, 'error');
      return;
    }

    setIsSubmittingPay(true);
    try {
      const { customerPaymentService } = await import('../services/supabase/customerPaymentService');
      const payData = {
        customerId: selectedInvoice.customerId || 'manual-cust',
        customerName: selectedInvoice.customerName,
        customerPhone: selectedInvoice.customerPhone,
        invoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        branchId: selectedInvoice.branchId || currentBranch?.id || undefined,
        amount: payAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: payMethod,
        reference: payRef,
      };

      const res = await customerPaymentService.recordCustomerPayment(payData);
      if (!res.success) {
        showToast(res.error || 'Payment failed — no financial records were changed.', 'error');
        return;
      }

      showToast(`Recorded payment of ${settings.currency}${payAmount} for Invoice ${selectedInvoice.invoiceNumber}!`, 'success');
      setPaymentModalOpen(false);

      // Refresh invoices from both store and Supabase
      setInvoices(store.getInvoices());
      try {
        const { data } = await invoiceService.getInvoices();
        if (data && Array.isArray(data)) {
          setInvoices(data);
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      showToast(err.message || 'Payment transaction failed', 'error');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleSendWhatsApp = (inv: Invoice) => {
    const text = `Hello ${inv.customerName} ji,\n\nPlease find invoice ${inv.invoiceNumber} for ${settings.currency}${inv.grandTotal.toLocaleString()}.\nPaid: ${settings.currency}${inv.paidAmount} | Balance Due: ${settings.currency}${inv.balanceAmount}.\n\nThank you,\n${settings.businessName}`;
    const cleanPhone = toWhatsAppNumber(inv.customerWhatsapp || inv.customerPhone);
    if (!cleanPhone) {
      showToast('Customer phone number is invalid for WhatsApp.', 'error');
      return;
    }
    shareService.shareToWhatsApp(cleanPhone, text);
    showToast(`Opening WhatsApp for ${inv.customerName}...`, 'info');
  };

  const getInvoiceRendererProps = (inv: Invoice): DocumentRendererProps => {
    const docData = normalizeInvoiceToDocument(inv, settings);
    return documentDataToRendererProps(docData);
  };

  const handlePrintInvoice = (inv: Invoice) => {
    printDocument(getInvoiceRendererProps(inv));
  };

  const handleSavePdf = async (inv: Invoice) => {
    setIsGeneratingPdf(true);
    try {
      const props = getInvoiceRendererProps(inv);
      await saveDocumentPdf(props);
    } catch (e: any) {
      showToast('Failed to generate PDF.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (mode === 'editor') {
    return (
      <ErrorBoundary fallbackTitle="Unable to load Invoice Editor" onReset={() => setMode('list')}>
        <DocumentEditorView
          key={editingDraftInvoice?.id || selectedTemplateId}
          documentType="invoice"
          initialTemplateId={selectedTemplateId}
          initialDraftData={editingDraftInvoice}
          onBack={() => {
            setEditingDraftInvoice(null);
            setMode('list');
          }}
          onSuccess={() => {
            setEditingDraftInvoice(null);
            setMode('list');
            setInvoices(store.getInvoices());
            invoiceService.getInvoices().then((res) => {
              if (res.data && res.data.length > 0) {
                store.syncRemoteInvoices(res.data);
                setInvoices(store.getInvoices());
              }
            }).catch(() => {});
          }}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'invoices'}
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
              placeholder="Search invoice # or customer..."
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
            <option value="Issued">Issued</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <button
          onClick={() => {
            setEditingDraftInvoice(null);
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setSelectedTemplateId(store.getLastUsedTemplate('invoice') || 'inv-modern-blue');
              setMode('editor');
            } else {
              setMode('gallery');
            }
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>+ Create Invoice</span>
        </button>
      </div>

      {/* Invoices List / Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        {/* DESKTOP TABLE VIEW (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-xs z-10">
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3.5">Invoice #</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Due Date</th>
                <th className="px-5 py-3.5">Grand Total</th>
                <th className="px-5 py-3.5">Paid</th>
                <th className="px-5 py-3.5">Balance</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    No invoices found. Click <strong>+ Create Invoice</strong> to choose a template!
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const fin = calculateInvoiceFinancials(inv.grandTotal, inv.paidAmount, inv.status);
                  return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-blue-600 dark:text-blue-400">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await clipboardService.writeText(inv.invoiceNumber);
                          showToast(`Copied ${inv.invoiceNumber}`, 'success');
                        }}
                        title="Click to copy invoice number"
                        className="group inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer text-left font-bold"
                      >
                        <span>{inv.invoiceNumber}</span>
                        <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 text-slate-400 dark:text-slate-500 transition-opacity" />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100">{inv.customerName}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{inv.date}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{inv.dueDate}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                      {settings.currency}{fin.grandTotal.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      {settings.currency}{fin.paidAmount.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-rose-600 dark:text-rose-400">
                      {settings.currency}{fin.balanceAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                          fin.status === 'Paid'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : fin.status === 'Partially Paid'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : fin.status === 'Issued'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {fin.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      {inv.status === 'Draft' && (
                        <button
                          onClick={() => handleEditDraft(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          title="Edit Draft & Change Template"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setPreviewModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="Preview & Print PDF"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setEwayBillModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800"
                        title="Generate E-Way Bill"
                      >
                        <Truck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSendWhatsApp(inv)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                        title="Send via WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {fin.balanceAmount > 0 && (
                        <button
                          onClick={() => handleOpenPaymentModal(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                          title="Record Payment"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );})
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD LIST VIEW (below md) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              No invoices found. Tap <strong>+ Create Invoice</strong> to get started!
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const fin = calculateInvoiceFinancials(inv.grandTotal, inv.paidAmount, inv.status);
              const isPaid = fin.status === 'Paid';
              const isPartial = fin.status === 'Partially Paid';
              const paid = fin.paidAmount;
              const remaining = fin.balanceAmount;

              return (
                <div key={inv.id} className="p-4 space-y-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  {/* Top Bar: Invoice Number & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                        {inv.invoiceNumber}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                        {inv.customerName}
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0 ${
                        isPaid
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : isPartial
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                          : fin.status === 'Issued'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {fin.status}
                    </span>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{inv.date}</span>
                    </span>
                    <span>Due: {inv.dueDate || '-'}</span>
                  </div>

                  {/* Accounting Synchronized Figures: Total -> Paid -> Remaining */}
                  <div className="bg-slate-50/80 dark:bg-slate-950/60 rounded-xl p-2.5 grid grid-cols-3 gap-2 text-center border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Total</span>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {settings.currency}{fin.grandTotal.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Paid</span>
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        {settings.currency}{paid.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-rose-500 dark:text-rose-400">Remaining</span>
                      <span className="font-bold text-xs text-rose-600 dark:text-rose-400">
                        {settings.currency}{remaining.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Touch-Friendly Action Buttons */}
                  <div className="pt-1 flex flex-col gap-2">
                    {remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenPaymentModal(inv)}
                        className="w-full touch-target min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Record Payment ({settings.currency}{remaining.toLocaleString()})</span>
                      </button>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setPreviewModalOpen(true);
                        }}
                        className="touch-target min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(inv)}
                        className="touch-target min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setEwayBillModalOpen(true);
                        }}
                        className="touch-target min-h-[44px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Truck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>E-Way</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* TEMPLATE GALLERY MODAL */}
      <TemplateGalleryModal
        isOpen={mode === 'gallery'}
        onClose={() => setMode('list')}
        documentType="invoice"
        currentTemplateId={selectedTemplateId}
        onSelectTemplate={(tId) => {
          setSelectedTemplateId(tId);
          setMode('editor');
        }}
      />

      {/* RECORD PAYMENT MODAL */}
      {selectedInvoice && (
        <Modal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          title={`Record Payment — ${selectedInvoice.invoiceNumber}`}
          subtitle={`Customer: ${selectedInvoice.customerName} | Balance Due: ${settings.currency}${selectedInvoice.balanceAmount.toLocaleString()}`}
          maxWidth="md"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Amount ({settings.currency})</label>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min="1"
                required
                value={payAmount || ''}
                onChange={(e) => setPayAmount(Math.floor(parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="UPI" className="bg-white dark:bg-slate-900">UPI / GPay / PhonePe</option>
                <option value="Cash" className="bg-white dark:bg-slate-900">Cash</option>
                <option value="Bank Transfer" className="bg-white dark:bg-slate-900">Bank Transfer (NEFT/IMPS)</option>
                <option value="Card" className="bg-white dark:bg-slate-900">Credit / Debit Card</option>
                <option value="Cheque" className="bg-white dark:bg-slate-900">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reference / UTR No.</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="e.g. UTR-123456789"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingPay}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer transition-all ${
                  isSubmittingPay ? 'bg-slate-400 cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isSubmittingPay ? 'Processing...' : 'Save Payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PREVIEW & PRINT MODAL */}
      {selectedInvoice && (
        <Modal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={`Invoice Preview — ${selectedInvoice.invoiceNumber}`}
          maxWidth="4xl"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between no-print bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Printable A4 Tax Invoice</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSavePdf(selectedInvoice)}
                  disabled={isGeneratingPdf}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                    isGeneratingPdf
                      ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>{isGeneratingPdf ? 'Generating...' : 'Save PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
                {selectedInvoice.balanceAmount > 0 && (
                  <button
                    onClick={() => {
                      setPreviewModalOpen(false);
                      handleOpenPaymentModal(selectedInvoice);
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}
              </div>
            </div>

            {/* Document Snapshot Renderer */}
            <DocumentRenderer
              templateId={selectedInvoice.templateId}
              documentType="invoice"
              documentNumber={selectedInvoice.invoiceNumber}
              date={selectedInvoice.date}
              dueDateOrValidUntil={selectedInvoice.dueDate}
              businessName={selectedInvoice.snapshot?.businessName || settings.businessName}
              phone={selectedInvoice.snapshot?.phone || settings.phone}
              email={selectedInvoice.snapshot?.email || settings.email}
              address={selectedInvoice.snapshot?.address || settings.address}
              city={selectedInvoice.snapshot?.city || settings.city}
              state={selectedInvoice.snapshot?.state || settings.state}
              pincode={selectedInvoice.snapshot?.pincode || settings.pincode}
              gstin={selectedInvoice.snapshot?.gstin || settings.gstin}
              bankDetails={selectedInvoice.snapshot?.bankDetails || settings.bankDetails}
              customerName={selectedInvoice.customerName}
              customerPhone={selectedInvoice.customerPhone}
              customerWhatsapp={selectedInvoice.customerWhatsapp}
              customerEmail={selectedInvoice.customerEmail}
              customerAddress={selectedInvoice.customerAddress}
              customerGstin={selectedInvoice.customerGstin}
              items={selectedInvoice.items}
              subtotal={selectedInvoice.subtotal}
              discountTotal={selectedInvoice.discountTotal}
              taxTotal={selectedInvoice.taxTotal}
              grandTotal={selectedInvoice.grandTotal}
              paidAmount={selectedInvoice.paidAmount}
              balanceAmount={selectedInvoice.balanceAmount}
              currency={settings.currency}
              notes={selectedInvoice.notes}
              terms={selectedInvoice.terms}
              footerText={selectedInvoice.footerText}
              branding={selectedInvoice.branding}
              theme={selectedInvoice.theme}
              customization={selectedInvoice.customization}
            />
          </div>
        </Modal>
      )}

      {/* CREATE E-WAY BILL MODAL */}
      <CreateEwayBillModal
        isOpen={ewayBillModalOpen}
        onClose={() => setEwayBillModalOpen(false)}
        invoice={selectedInvoice}
        onSuccess={() => {
          showToast('E-Way Bill generated successfully!', 'success');
          if (onNavigateTab) onNavigateTab('eway');
        }}
      />
    </div>
  );
};

