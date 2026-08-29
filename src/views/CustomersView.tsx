import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  MapPin,
  Scale,
  Eye,
  Edit,
  Building,
  CreditCard,
  X,
} from 'lucide-react';
import { customerService } from '../services/supabase';
import { Customer } from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';
import { PhoneInput } from '../components/PhoneInput';
import { validateIndianPhoneNumber, normalizeIndianPhoneNumber, formatIndianPhoneNumber } from '../lib/phoneUtils';

interface CustomersViewProps {
  initialOpenCreate?: boolean;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  initialOpenCreate = false,
  onNavigateTab,
  activeTab,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(initialOpenCreate);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<any>({ outstanding: 0, totalDebit: 0, totalCredit: 0, invoices: [] });

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [state, setState] = useState('Maharashtra');
  const [pincode, setPincode] = useState('400001');
  const [gstin, setGstin] = useState('');
  const [customerType, setCustomerType] = useState<'Retail' | 'Wholesale' | 'Corporate'>('Retail');
  const [creditLimit, setCreditLimit] = useState(50000);
  const [paymentTerms, setPaymentTerms] = useState('Net 30');

  const loadCustomers = async () => {
    const { data } = await customerService.getCustomers();
    setCustomers(data || []);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      showToast('Name and phone number are required.', 'error');
      return;
    }

    if (!validateIndianPhoneNumber(phone)) {
      showToast('Please enter a valid 10-digit Indian phone number (starting with 6-9).', 'error');
      return;
    }

    if (whatsapp && !validateIndianPhoneNumber(whatsapp)) {
      showToast('Please enter a valid 10-digit Indian WhatsApp number.', 'error');
      return;
    }

    const cleanPhone = normalizeIndianPhoneNumber(phone);
    const cleanWhatsapp = whatsapp ? normalizeIndianPhoneNumber(whatsapp) : cleanPhone;

    const res = await customerService.addCustomer({
      name,
      phone: cleanPhone,
      whatsapp: cleanWhatsapp,
      email,
      address,
      city,
      state,
      pincode,
      gstin,
      customerType,
      creditLimit,
      paymentTerms,
    });

    if (res.success && res.data) {
      showToast(`Customer ${res.data.name} added successfully!`, 'success');
      setCreateModalOpen(false);
      resetForm();
      loadCustomers();
    } else {
      showToast(res.error || 'Failed to add customer.', 'error');
    }
  };

  const handleOpenDetail = async (c: Customer) => {
    setSelectedCustomer(c);
    const ledgerRes = await customerService.getCustomerLedger(c.id);
    setSelectedLedger(ledgerRes.data || { outstanding: (c as any).outstandingBalance || 0, totalDebit: 0, totalCredit: 0, invoices: [] });
    setDetailModalOpen(true);
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setWhatsapp('');
    setEmail('');
    setAddress('');
    setGstin('');
    setCreditLimit(50000);
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.city || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <div className="relative flex-1 sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name, phone, city..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => {
            resetForm();
            setCreateModalOpen(true);
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Customer</span>
        </button>
      </div>

      {/* Customers Cards / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            No customers found. Click <strong>+ Add Customer</strong> to add your first client!
          </div>
        ) : (
          filteredCustomers.map((c) => {
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-card shadow-card-hover flex flex-col justify-between transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{c.name}</h3>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase">
                        {c.customerType}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 block">Outstanding</span>
                      <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                        ₹{((c as any).outstandingBalance || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span>{formatIndianPhoneNumber(c.phone)}</span>
                    </p>
                    {c.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </p>
                    )}
                    {c.address && (
                      <p className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">{c.address}, {c.city}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Limit: ₹{(c.creditLimit || 0).toLocaleString()}</span>
                  <button
                    onClick={() => handleOpenDetail(c)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE CUSTOMER WORKSPACE */}
      {createModalOpen && (
        <DedicatedWorkspace
          title="Add New Customer Profile"
          subtitle="Create customer profile with contact, billing & GST details"
          badgeText="NEW CUSTOMER"
          icon={Users}
          onClose={() => setCreateModalOpen(false)}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'customers'}
        >
          <form onSubmit={handleSaveCustomer} className="space-y-6 max-w-4xl mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Full Name / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rajesh Enterprise"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <PhoneInput
                label="Phone Number *"
                required
                value={phone}
                onChange={setPhone}
                placeholder="9820011223"
              />

              <PhoneInput
                label="WhatsApp Number"
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder="Leave blank to use phone number"
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop/Office number, Street name"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">GSTIN</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="27ABCDE1234F1Z2"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Save Customer
              </button>
            </div>
          </form>
        </DedicatedWorkspace>
      )}

      {/* CUSTOMER PROFILE & LEDGER MODAL */}
      {selectedCustomer && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Customer Profile — ${selectedCustomer.name}`}
          maxWidth="4xl"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Total Billed</span>
                <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                  ₹{(selectedLedger.totalDebit || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Total Paid</span>
                <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  ₹{(selectedLedger.totalCredit || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Outstanding Udhari</span>
                <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                  ₹{(selectedLedger.outstanding || 0).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-700 dark:text-slate-300">
                Customer Invoices ({selectedLedger.invoices?.length || 0})
              </div>
              <div className="p-4 bg-white dark:bg-slate-900">
                {!selectedLedger.invoices || selectedLedger.invoices.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No invoices recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedLedger.invoices.map((inv: any) => (
                      <div key={inv.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs border border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="font-bold text-blue-600 dark:text-blue-400">{inv.invoice_number || inv.invoiceNumber}</span>
                          <span className="text-slate-400 dark:text-slate-500 ml-2">{inv.invoice_date || inv.date}</span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          ₹{(inv.total_amount || inv.grandTotal || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
