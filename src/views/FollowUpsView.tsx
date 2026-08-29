import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Plus,
  CheckCircle2,
  Clock,
  User,
  AlertCircle,
  MessageSquare,
  Mail,
  PhoneCall,
  FileText,
  RotateCw,
  Eye,
  Send,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Check,
} from 'lucide-react';
import { store } from '../services/store';
import {
  FollowUp,
  Customer,
  FollowUpPriority,
  Quotation,
  Invoice,
} from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { generateHumanFollowUpMessage, MessageTone } from '../services/messageGenerator';
import { normalizeIndianPhoneNumber, formatIndianPhoneNumber, toWhatsAppNumber } from '../lib/phoneUtils';

const TOPIC_SUGGESTIONS = [
  'Quotation follow-up',
  'Demo reminder',
  'Payment reminder',
  'Invoice follow-up',
  'Order confirmation',
  'Service renewal',
  'Check if customer needs help',
  'Product enquiry follow-up',
  'Customer feedback',
  'Meeting follow-up',
];

export const FollowUpsView: React.FC = () => {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [topic, setTopic] = useState('Quotation follow-up');
  const [tone, setTone] = useState<MessageTone>('Natural');
  const [sendVia, setSendVia] = useState<'WhatsApp' | 'Internal Reminder'>('WhatsApp');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [variationIndex, setVariationIndex] = useState(0);

  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState('10:00');
  const [priority, setPriority] = useState<FollowUpPriority>('High');
  const [assignedTo, setAssignedTo] = useState('Staff Member');

  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  // Confirmation banner state for WhatsApp opening
  const [justOpenedWhatsAppId, setJustOpenedWhatsAppId] = useState<string | null>(null);

  useEffect(() => {
    const updateData = () => {
      setFollowUps(store.getFollowUps());
      setCustomers(store.getCustomers());
      setQuotations(store.getQuotations());
      setInvoices(store.getInvoices());
    };
    updateData();
    return store.subscribe(updateData);
  }, []);

  // Update generated message dynamically when customer, topic, tone, or variation changes
  useEffect(() => {
    if (!createModalOpen) return;
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const qt = quotations.find((q) => q.id === selectedQuotationId);
    const inv = invoices.find((i) => i.id === selectedInvoiceId);
    const settings = store.getSettings();

    const msg = generateHumanFollowUpMessage({
      customerName: cust?.name || 'Customer',
      businessName: settings?.businessName,
      topic,
      tone,
      quotationNumber: qt?.quotationNumber,
      invoiceNumber: inv?.invoiceNumber,
      assignedTo,
      variationIndex,
    });

    setGeneratedMessage(msg);
  }, [
    selectedCustomerId,
    topic,
    tone,
    variationIndex,
    selectedQuotationId,
    selectedInvoiceId,
    createModalOpen,
  ]);

  const handleOpenCreateModal = () => {
    if (customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
    setVariationIndex(0);
    setCreateModalOpen(true);
  };

  const handleRegenerate = () => {
    setVariationIndex((prev) => prev + 1);
    showToast('Regenerated natural message variation!', 'info');
  };

  const handleSaveFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !topic) {
      showToast('Please select a customer and enter a topic.', 'error');
      return;
    }

    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) return;

    const linkedQt = quotations.find((q) => q.id === selectedQuotationId);
    const linkedInv = invoices.find((i) => i.id === selectedInvoiceId);

    const titleText = `${topic}${linkedQt ? ' (' + linkedQt.quotationNumber + ')' : ''}`;

    store.addFollowUp({
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerEmail: cust.email,
      customerWhatsapp: cust.whatsapp || cust.phone,
      quotationId: linkedQt?.id,
      quotationNumber: linkedQt?.quotationNumber,
      invoiceId: linkedInv?.id,
      invoiceNumber: linkedInv?.invoiceNumber,
      title: titleText,
      notes: generatedMessage,
      dueDate,
      dueTime,
      priority,
      assignedTo,
      status: 'Pending',
      actionType: 'WHATSAPP_MESSAGE',
      actionConfig: {
        topic,
        message: generatedMessage,
        tone,
        sendVia,
        quotationId: linkedQt?.id,
        invoiceId: linkedInv?.id,
      },
      attemptCount: 0,
      maxAttempts: 3,
      executionLogs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Scheduled follow-up for ${dueDate} at ${dueTime} IST. Channel: ${sendVia}. Topic: "${topic}".`,
        },
      ],
    });

    showToast('Follow-up scheduled with pre-filled message!', 'success');
    setCreateModalOpen(false);
  };

  const handleSendViaWhatsApp = (f: FollowUp) => {
    const rawPhone = f.customerWhatsapp || f.customerPhone || '';
    const cleanPhone = toWhatsAppNumber(rawPhone);
    if (!cleanPhone) {
      showToast('Customer does not have a valid WhatsApp phone number.', 'error');
      return;
    }

    const msgText = f.actionConfig?.message || f.notes || f.title;
    const encodedText = encodeURIComponent(msgText);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    // Open WhatsApp Web or Mobile App in new tab/app launcher
    window.open(whatsappUrl, '_blank');

    // Mark activity in store
    store.markWhatsAppOpened(f.id);
    setJustOpenedWhatsAppId(f.id);

    showToast(`Opening WhatsApp for ${f.customerName}... Message pre-filled!`, 'info');
  };

  const handleMarkCompleted = (id: string) => {
    store.updateFollowUpStatus(id, 'Completed');
    setJustOpenedWhatsAppId(null);
    showToast('Follow-up marked as Completed!', 'success');
    if (historyModalOpen && selectedFollowUp?.id === id) {
      const updated = store.getFollowUps().find((item) => item.id === id);
      if (updated) setSelectedFollowUp(updated);
    }
  };

  const renderMaskedPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    const clean = normalizeIndianPhoneNumber(phone);
    if (clean.length < 4) return '****';
    return '+91 ***** ' + clean.slice(-4);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Staff Customer Follow-up Assistant</span>
            <span className="px-2.5 py-0.5 text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-full font-extrabold uppercase flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>WhatsApp Pre-fill</span>
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Schedule customer check-ins, auto-generate human messages, and launch pre-filled WhatsApp dispatches
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>+ Schedule Follow-up</span>
        </button>
      </div>

      {/* Confirmation Banner for Just Opened WhatsApp */}
      {justOpenedWhatsAppId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100 text-xs font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>WhatsApp opened with pre-filled message! Did you send the message to the customer?</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleMarkCompleted(justOpenedWhatsAppId)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm"
            >
              Yes, Mark Completed
            </button>
            <button
              onClick={() => setJustOpenedWhatsAppId(null)}
              className="px-3.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Keep Due
            </button>
          </div>
        </div>
      )}

      {/* Follow-ups Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Customer</th>
                <th className="px-6 py-3.5">Topic</th>
                <th className="px-6 py-3.5">Channel</th>
                <th className="px-6 py-3.5">Due Date & Time</th>
                <th className="px-6 py-3.5">Assigned To</th>
                <th className="px-6 py-3.5">Priority</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {followUps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    No follow-up tasks scheduled. Click <strong>+ Schedule Follow-up</strong> to set up smart reminders!
                  </td>
                </tr>
              ) : (
                followUps.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                      <div>{f.customerName}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {renderMaskedPhone(f.customerPhone)}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                      <div>{f.actionConfig?.topic || f.title}</div>
                      {f.actionConfig?.wasWhatsAppOpened && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span>WhatsApp Opened</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {f.actionConfig?.sendVia === 'Internal Reminder' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60">
                          <Clock className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span>Internal</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                          <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>WhatsApp</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium">
                      {f.dueDate} at {f.dueTime}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{f.assignedTo}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md ${
                          f.priority === 'High' || f.priority === 'Urgent'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {f.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                          f.status === 'Completed'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : f.status === 'Due'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 animate-pulse'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button
                        onClick={() => {
                          setSelectedFollowUp(f);
                          setHistoryModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800"
                        title="View Details & Generated Message"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleSendViaWhatsApp(f)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm"
                        title="Open WhatsApp with pre-filled message"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Send via WhatsApp</span>
                      </button>

                      {f.status !== 'Completed' && (
                        <button
                          onClick={() => handleMarkCompleted(f.id)}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800"
                          title="Mark Completed"
                        >
                          <CheckCircle2 className="w-4 h-4" />
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

      {/* CREATE FOLLOWUP MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Schedule Follow-up Assistant"
        maxWidth="5xl"
      >
        <form onSubmit={handleSaveFollowUp} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Customer *</label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({renderMaskedPhone(c.phone)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Send Via *</label>
              <select
                value={sendVia}
                onChange={(e) => setSendVia(e.target.value as 'WhatsApp' | 'Internal Reminder')}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400"
              >
                <option value="WhatsApp">💬 WhatsApp (Pre-fill & Open App/Web)</option>
                <option value="Internal Reminder">🔔 Internal Staff Reminder Only</option>
              </select>
            </div>
          </div>

          {/* TOPIC SELECTION & SUGGESTIONS */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Topic / Contact Reason *</label>
            <input
              type="text"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Quotation follow-up"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setTopic(sug)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    topic === sug
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* OPTIONAL DOCUMENT LINKING */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Link Quotation (Optional)</label>
              <select
                value={selectedQuotationId}
                onChange={(e) => setSelectedQuotationId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="">-- No Linked Quotation --</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quotationNumber} (₹{q.grandTotal.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Link Invoice (Optional)</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="">-- No Linked Invoice --</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} (₹{inv.grandTotal.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TONE & GENERATED HUMAN MESSAGE BOX */}
          <div className="space-y-2 bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>Generated Human WhatsApp Message</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                  {(['Natural', 'Friendly', 'Professional', 'Short & Direct'] as MessageTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded capitalize transition-colors ${
                        tone === t
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-[11px] font-bold flex items-center gap-1 border border-slate-700"
                  title="Generate a new natural variation"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Regenerate</span>
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={generatedMessage}
              onChange={(e) => setGeneratedMessage(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-sans text-slate-100 focus:outline-none focus:border-blue-500 leading-relaxed"
            />

            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>Human style • 0-1 emojis • Context aware</span>
              <span>{generatedMessage.split(/\s+/).filter(Boolean).length} words | {generatedMessage.length} chars</span>
            </div>
          </div>

          {/* DATE, TIME, ASSIGNED, PRIORITY */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Due Time *</label>
              <input
                type="time"
                required
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Assigned To *</label>
              <input
                type="text"
                required
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as FollowUpPriority)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="Low" className="bg-white dark:bg-slate-900">Low</option>
                <option value="Medium" className="bg-white dark:bg-slate-900">Medium</option>
                <option value="High" className="bg-white dark:bg-slate-900">High</option>
                <option value="Urgent" className="bg-white dark:bg-slate-900">Urgent</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Schedule Follow-up
            </button>
          </div>
        </form>
      </Modal>

      {/* EXECUTION DETAILS MODAL */}
      {selectedFollowUp && (
        <Modal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          title={`Follow-up Details — ${selectedFollowUp.customerName}`}
          maxWidth="xl"
        >
          <div className="space-y-5 text-xs">
            {/* Summary Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{selectedFollowUp.customerName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    ({renderMaskedPhone(selectedFollowUp.customerPhone)})
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                      selectedFollowUp.status === 'Completed'
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                        : selectedFollowUp.status === 'Due'
                        ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 animate-pulse'
                        : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {selectedFollowUp.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Scheduled for {selectedFollowUp.dueDate} at {selectedFollowUp.dueTime} IST
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSendViaWhatsApp(selectedFollowUp)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Send via WhatsApp</span>
                </button>

                {selectedFollowUp.status !== 'Completed' && (
                  <button
                    onClick={() => handleMarkCompleted(selectedFollowUp.id)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Completed</span>
                  </button>
                )}
              </div>
            </div>

            {/* Topic & Message View/Editor */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                Prepared Message Content
              </label>
              <textarea
                rows={4}
                value={selectedFollowUp.actionConfig?.message || selectedFollowUp.notes || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  store.updateFollowUpMessage(selectedFollowUp.id, val);
                  setSelectedFollowUp({
                    ...selectedFollowUp,
                    notes: val,
                    actionConfig: { ...selectedFollowUp.actionConfig, message: val },
                  });
                }}
                className="w-full p-3 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-700 dark:border-slate-800 rounded-xl text-xs font-sans leading-relaxed focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Timeline Logs */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">Activity History</h4>
              <div className="bg-slate-900 dark:bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-[11px] space-y-1.5 max-h-40 overflow-y-auto border border-slate-800">
                {!selectedFollowUp.executionLogs || selectedFollowUp.executionLogs.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">No activity logs recorded yet.</p>
                ) : (
                  selectedFollowUp.executionLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-slate-500 select-none">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className="text-emerald-400 font-semibold">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
