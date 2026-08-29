import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Package,
  Phone,
  Mail,
  MapPin,
  User,
  Edit2,
  Trash2,
  ChevronRight,
  X,
  AlertCircle,
  TrendingUp,
  Building2,
} from 'lucide-react';
import { Supplier, Product } from '../types';
import { productService } from '../services/supabase';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';

interface SuppliersViewProps {
  onNavigateTab?: (tab: string, supplierFilter?: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ onNavigateTab }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Modals & Drawers State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form Inputs
  const [name, setName] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Supplier Details Drawer State
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Deletion Modal
  const [deleteConfirmSup, setDeleteConfirmSup] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [supRes, prodRes] = await Promise.all([
        productService.getSuppliers(),
        productService.getProducts(),
      ]);
      setSuppliers(supRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Suppliers
  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
      (s.phone && s.phone.includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  );

  // Metrics helper per supplier
  const getSupplierMetrics = (sup: Supplier) => {
    const supProds = products.filter(
      (p) => p.supplierId === sup.id || p.supplier === sup.name || p.supplier === sup.id
    );
    const productCount = supProds.length;
    const totalStock = supProds.reduce((sum, p) => sum + (p.currentStock || 0), 0);
    const totalValue = supProds.reduce((sum, p) => sum + (p.currentStock || 0) * (p.buyPrice || 0), 0);
    return { supProds, productCount, totalStock, totalValue };
  };

  // Overall KPIs
  const totalSuppliers = suppliers.length;
  const activeSuppliersWithProds = suppliers.filter((s) => getSupplierMetrics(s).productCount > 0).length;
  const totalSourcedProducts = products.filter((p) => p.supplierId || p.supplier).length;
  const totalSourcedValuation = products.reduce((sum, p) => sum + (p.currentStock || 0) * (p.buyPrice || 0), 0);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setModalOpen(true);
  };

  const handleOpenEdit = (sup: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSupplier(sup);
    setName(sup.name);
    setContactPerson(sup.contactPerson || '');
    setPhone(sup.phone || '');
    setEmail(sup.email || '');
    setAddress(sup.address || '');
    setModalOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!name.trim()) {
      showToast('Supplier/Company name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Supplier> = {
        name,
        contactPerson,
        phone,
        email,
        address,
      };

      if (editingSupplier) {
        const res = await productService.updateSupplier(editingSupplier.id, payload);
        if (res.error) {
          showToast(res.error, 'error');
        } else {
          showToast('Supplier updated successfully!', 'success');
          setModalOpen(false);
          fetchData();
        }
      } else {
        const res = await productService.createSupplier(payload);
        if (res.error) {
          showToast(res.error, 'error');
        } else {
          showToast('Supplier created successfully!', 'success');
          setModalOpen(false);
          fetchData();
        }
      }
    } catch (e: any) {
      showToast(e.message || 'Error saving supplier', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmSup) return;
    setDeleting(true);
    try {
      const res = await productService.deleteSupplier(deleteConfirmSup.id);
      if (res.error) {
        showToast(res.error, 'error');
      } else {
        showToast('Supplier removed successfully', 'success');
        setDeleteConfirmSup(null);
        if (selectedSupplier?.id === deleteConfirmSup.id) {
          setDrawerOpen(false);
        }
        fetchData();
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to delete supplier', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenDetails = (sup: Supplier) => {
    setSelectedSupplier(sup);
    setDrawerOpen(true);
  };

  const handleViewProductsFilter = (sup: Supplier, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onNavigateTab) {
      onNavigateTab('products', sup.id);
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Supplier Directory</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage vendor profiles, track supplied inventory lines, and evaluate procurement value.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Supplier</span>
        </button>
      </div>

      {/* 2. OVERALL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Suppliers</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalSuppliers}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Vendors</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{activeSuppliersWithProds}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sourced Product Lines</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalSourcedProducts}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sourced Inventory Value</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalSourcedValuation)}</p>
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name, contact, phone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Showing {filteredSuppliers.length} of {suppliers.length} suppliers
        </div>
      </div>

      {/* 4. VISUAL CARDS GRID OF SUPPLIERS */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
            <Truck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Suppliers Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {search ? 'No vendors match your active search filter.' : 'Add your first vendor/supplier to track procurement sources.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSuppliers.map((sup) => {
            const { productCount, totalStock, totalValue } = getSupplierMetrics(sup);
            return (
              <div
                key={sup.id}
                onClick={() => handleOpenDetails(sup)}
                className="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {sup.name}
                        </h3>
                        {sup.contactPerson && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{sup.contactPerson}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => handleOpenEdit(sup, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Edit Supplier"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmSup(sup);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Delete Supplier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contact Details Badges */}
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {sup.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{sup.phone}</span>
                      </div>
                    )}
                    {sup.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{sup.email}</span>
                      </div>
                    )}
                    {sup.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{sup.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                      <span className="text-[10px] font-semibold text-slate-400 block">Supplied Products</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{productCount} items</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                      <span className="text-[10px] font-semibold text-slate-400 block">Sourced Valuation</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(totalValue)}</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleViewProductsFilter(sup, e)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>View Sourced Products</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ADD / EDIT SUPPLIER MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier Profile' : 'Add New Supplier'}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Company / Supplier Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apex Hardware Wholesalers Pvt Ltd"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Contact Person</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Suresh Patel"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. orders@apexhardware.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Office / Warehouse Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Plot 15, Industrial Estate, Mumbai"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSupplier}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 shadow-md shadow-indigo-600/25 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 6. DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteConfirmSup}
        onClose={() => setDeleteConfirmSup(null)}
        title="Remove Supplier"
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                Are you sure you want to remove "{deleteConfirmSup?.name}"?
              </p>
              <p className="text-amber-700 dark:text-amber-300">
                Linked inventory items will be detached from this supplier but remain safely in your catalog.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDeleteConfirmSup(null)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? 'Removing...' : 'Remove Supplier'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. SUPPLIER DETAILS DRAWER */}
      {drawerOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl overflow-y-auto flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{selectedSupplier.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vendor Contact & Procurement Ledger</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 space-y-6 flex-1">
              {/* Contact Information Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] mb-2">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Contact Person</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSupplier.contactPerson || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Phone Number</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSupplier.phone || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Email Address</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSupplier.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Address</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedSupplier.address || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Sourced Metrics Summary */}
              {(() => {
                const { supProds, productCount, totalStock, totalValue } = getSupplierMetrics(selectedSupplier);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block uppercase">Products Sourced</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{productCount}</span>
                      </div>
                      <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase">Stock Units</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{totalStock}</span>
                      </div>
                      <div className="bg-purple-50/50 dark:bg-purple-950/30 p-3.5 rounded-2xl border border-purple-100 dark:border-purple-900/40">
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block uppercase">Procurement Value</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalValue)}</span>
                      </div>
                    </div>

                    {/* Supplied Products */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Supplied Products ({supProds.length})
                        </h3>
                        <button
                          onClick={() => {
                            setDrawerOpen(false);
                            if (onNavigateTab) onNavigateTab('products', selectedSupplier.id);
                          }}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                        >
                          View Products in Catalog →
                        </button>
                      </div>

                      {supProds.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                          No products are linked to this supplier yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                          {supProds.map((p) => (
                            <div key={p.id} className="p-3.5 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                                <p className="text-[10px] text-slate-400">SKU: {p.sku} • Buy Price: {formatCurrency(p.buyPrice)}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(p.sellingPrice)}</p>
                                <p className="text-[10px] text-emerald-600 font-semibold">{p.currentStock} {p.unit} in stock</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
