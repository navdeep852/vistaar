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
} from 'lucide-react';
import { store } from '../services/store';
import { Invoice, InvoiceStatus, PaymentMethod } from '../types';
import { Modal } from '../components/Modal';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';
import { DocumentEditorView } from './DocumentEditorView';
import { DocumentRenderer } from '../components/DocumentRenderer';
import { printDocument } from '../services/printService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { showToast } from '../components/Toast';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Workflow State: list | gallery | editor
  const [mode, setMode] = useState<'list' | 'gallery' | 'editor'>(
    initialOpenCreate ? 'gallery' : 'list'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('inv-modern-blue');
  const [editingDraftInvoice, setEditingDraftInvoice] = useState<Invoice | null>(null);

  // Preview & Record Payment Modals
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Record Payment Form
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => setInvoices(store.getInvoices());
    updateData();
    return store.subscribe(updateData);
  }, []);

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

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    if (payAmount <= 0) {
      showToast('Payment amount must be greater than zero.', 'error');
      return;
    }

    store.recordPayment({
      customerId: selectedInvoice.customerId || 'manual-cust',
      customerName: selectedInvoice.customerName,
      invoiceId: selectedInvoice.id,
      invoiceNumber: selectedInvoice.invoiceNumber,
      amount: payAmount,
      date: new Date().toISOString().split('T')[0],
      method: payMethod,
      referenceNo: payRef,
    });

    showToast(`Recorded payment of ${settings.currency}${payAmount} for Invoice ${selectedInvoice.invoiceNumber}!`, 'success');
    setPaymentModalOpen(false);
  };

  const handleSendWhatsApp = (inv: Invoice) => {
    const text = `Hello ${inv.customerName} ji,\n\nPlease find invoice ${inv.invoiceNumber} for ${settings.currency}${inv.grandTotal.toLocaleString()}.\nPaid: ${settings.currency}${inv.paidAmount} | Balance Due: ${settings.currency}${inv.balanceAmount}.\n\nThank you,\n${settings.businessName}`;
    const cleanPhone = (inv.customerWhatsapp || inv.customerPhone).replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`Opening WhatsApp for ${inv.customerName}...`, 'info');
  };

  const handlePrintInvoice = (inv: Invoice) => {
    printDocument({
      templateId: inv.templateId,
      documentType: 'invoice',
      documentNumber: inv.invoiceNumber,
      date: inv.date,
      dueDateOrValidUntil: inv.dueDate,
      businessName: inv.snapshot?.businessName || settings.businessName,
      phone: inv.snapshot?.phone || settings.phone,
      email: inv.snapshot?.email || settings.email,
      address: inv.snapshot?.address || settings.address,
      city: inv.snapshot?.city || settings.city,
      state: inv.snapshot?.state || settings.state,
      pincode: inv.snapshot?.pincode || settings.pincode,
      gstin: inv.snapshot?.gstin || settings.gstin,
      bankDetails: inv.snapshot?.bankDetails || settings.bankDetails,
      customerName: inv.customerName,
      customerPhone: inv.customerPhone,
      customerWhatsapp: inv.customerWhatsapp,
      customerEmail: inv.customerEmail,
      customerAddress: inv.customerAddress,
      customerGstin: inv.customerGstin,
      items: inv.items,
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      taxTotal: inv.taxTotal,
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      balanceAmount: inv.balanceAmount,
      currency: settings.currency,
      notes: inv.notes,
      terms: inv.terms,
      footerText: inv.footerText,
      branding: inv.branding,
      theme: inv.theme,
      customization: inv.customization,
    });
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
            setMode('gallery');
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>+ Create Invoice</span>
        </button>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Invoice #</th>
                <th className="px-6 py-3.5">Customer</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Due Date</th>
                <th className="px-6 py-3.5">Grand Total</th>
                <th className="px-6 py-3.5">Balance</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    No invoices found. Click <strong>+ Create Invoice</strong> to choose a template!
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{inv.customerName}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{inv.date}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{inv.dueDate}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                      {settings.currency}{inv.grandTotal.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-rose-600 dark:text-rose-400">
                      {settings.currency}{inv.balanceAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                          inv.status === 'Paid'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : inv.status === 'Partially Paid'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : inv.status === 'Issued'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {inv.status}
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
                        onClick={() => handleSendWhatsApp(inv)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                        title="Send via WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      {inv.balanceAmount > 0 && (
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
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
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
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-md cursor-pointer"
              >
                Save Payment
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
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Download / Print PDF</span>
                </button>
                <button
                  onClick={() => handleSendWhatsApp(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5"
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
    </div>
  );
};
