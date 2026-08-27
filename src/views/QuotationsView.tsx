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
} from 'lucide-react';
import { store } from '../services/store';
import { Quotation, QuotationStatus } from '../types';
import { Modal } from '../components/Modal';
import { TemplateGalleryModal } from '../components/TemplateGalleryModal';
import { DocumentEditorView } from './DocumentEditorView';
import { DocumentRenderer } from '../components/DocumentRenderer';
import { printDocument } from '../services/printService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { showToast } from '../components/Toast';

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

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => setQuotations(store.getQuotations());
    updateData();
    return store.subscribe(updateData);
  }, []);

  const handleEditDraft = (qt: Quotation) => {
    setEditingDraftQuotation(qt);
    setSelectedTemplateId(qt.templateId);
    setMode('editor');
  };

  const handleConvertToInvoice = (qt: Quotation) => {
    const inv = store.convertQuotationToInvoice(qt.id);
    if (inv) {
      showToast(`Quotation ${qt.quotationNumber} converted to Invoice ${inv.invoiceNumber}!`, 'success');
      setPreviewModalOpen(false);
    } else {
      showToast('Quotation is already converted or invalid.', 'error');
    }
  };

  const handleSendWhatsApp = (qt: Quotation) => {
    const text = `Hello ${qt.customerName} ji,\n\nPlease find quotation ${qt.quotationNumber} for ${settings.currency}${qt.grandTotal.toLocaleString()}.\nQuotation valid until ${qt.validUntil}.\n\nThank you,\n${settings.businessName}`;
    const cleanPhone = (qt.customerWhatsapp || qt.customerPhone).replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(text)}`;
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
                        onChange={(e) =>
                          store.updateQuotationStatus(qt.id, e.target.value as QuotationStatus)
                        }
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
                          onClick={() => handleConvertToInvoice(qt)}
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
                    onClick={() => handleConvertToInvoice(selectedQuotation)}
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
    </div>
  );
};
