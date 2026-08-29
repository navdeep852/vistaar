import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  Plus,
  Search,
  Package,
  Boxes,
  IndianRupee,
  Layers,
  Edit2,
  Trash2,
  Eye,
  ChevronRight,
  X,
  Tag,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { Category, Product } from '../types';
import { productService } from '../services/supabase';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';

interface CategoriesViewProps {
  onNavigateTab?: (tab: string, categoryFilter?: string) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ onNavigateTab }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Modals & Drawers State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [nameInput, setNameInput] = useState<string>('');
  const [descInput, setDescInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Category Details Drawer State
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Deletion Modal
  const [deleteConfirmCat, setDeleteConfirmCat] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        productService.getCategories(),
        productService.getProducts(),
      ]);
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Categories
  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  // Helper Calculations
  const getCategoryMetrics = (cat: Category) => {
    const catProds = products.filter(
      (p) => p.categoryId === cat.id || p.category === cat.name || p.category === cat.id
    );
    const productCount = catProds.length;
    const totalStock = catProds.reduce((sum, p) => sum + (p.currentStock || 0), 0);
    const totalValue = catProds.reduce((sum, p) => sum + (p.currentStock || 0) * (p.buyPrice || 0), 0);
    return { catProds, productCount, totalStock, totalValue };
  };

  // Overall KPIs
  const totalCategories = categories.length;
  const uncategorizedProds = products.filter((p) => !p.categoryId && !p.category);
  const totalCategorizedProds = products.length - uncategorizedProds.length;
  const totalInventoryValue = products.reduce(
    (sum, p) => sum + (p.currentStock || 0) * (p.buyPrice || 0),
    0
  );

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setNameInput('');
    setDescInput('');
    setModalOpen(true);
  };

  const handleOpenEdit = (cat: Category, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCategory(cat);
    setNameInput(cat.name);
    setDescInput(cat.description || '');
    setModalOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!nameInput.trim()) {
      showToast('Category name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingCategory) {
        const res = await productService.updateCategory(editingCategory.id, {
          name: nameInput.trim(),
          description: descInput.trim(),
        });
        if (res.error) {
          showToast(res.error, 'error');
        } else if (res.category) {
          const updatedCat = res.category;
          showToast('Category updated successfully!', 'success');
          setModalOpen(false);
          setCategories((prev) => prev.map((c) => (c.id === updatedCat.id ? updatedCat : c)));
          await fetchData();
        } else {
          showToast('Unable to update category.', 'error');
        }
      } else {
        const res = await productService.createCategory({
          name: nameInput.trim(),
          description: descInput.trim(),
        });
        if (res.error) {
          showToast(res.error, 'error');
        } else if (res.category) {
          const newCat = res.category;
          showToast('Category created successfully!', 'success');
          setModalOpen(false);
          setNameInput('');
          setDescInput('');
          setCategories((prev) => [newCat, ...prev.filter((c) => c.id !== newCat.id)]);
          await fetchData();
        } else {
          showToast('Unable to create category record.', 'error');
        }
      }
    } catch (e: any) {
      showToast(e.message || 'Error saving category', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmCat) return;
    const targetId = deleteConfirmCat.id;
    setDeleting(true);
    try {
      const res = await productService.deleteCategory(targetId);
      if (res.error) {
        showToast(res.error, 'error');
      } else {
        showToast('Category deleted successfully', 'success');
        setDeleteConfirmCat(null);
        setCategories((prev) => prev.filter((c) => c.id !== targetId));
        if (selectedCategory?.id === targetId) {
          setDrawerOpen(false);
        }
        await fetchData();
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to delete category', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenDetails = (cat: Category) => {
    setSelectedCategory(cat);
    setDrawerOpen(true);
  };

  const handleViewProductsFilter = (cat: Category, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onNavigateTab) {
      onNavigateTab('products', cat.id);
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Category Dashboard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Organize inventory into product groups, track stock allocation, and analyze category valuation.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Category</span>
        </button>
      </div>

      {/* 2. OVERALL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Categories</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalCategories}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Categorized Products</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalCategorizedProds}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Category Inventory Value</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalInventoryValue)}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Uncategorized Items</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{uncategorizedProds.length}</p>
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
            placeholder="Search categories..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Showing {filteredCategories.length} of {categories.length} categories
        </div>
      </div>

      {/* 4. VISUAL GRID OF CATEGORIES */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
            <FolderTree className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Categories Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {search ? 'No categories match your search criteria.' : 'Start by creating your first product category.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Category</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCategories.map((cat) => {
            const { productCount, totalStock, totalValue } = getCategoryMetrics(cat);
            return (
              <div
                key={cat.id}
                onClick={() => handleOpenDetails(cat)}
                className="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                        <FolderTree className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {cat.name}
                        </h3>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          {productCount} {productCount === 1 ? 'Product' : 'Products'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => handleOpenEdit(cat, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmCat(cat);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Delete Category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-3 min-h-[32px]">
                    {cat.description || 'No description provided for this category.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                      <span className="text-[10px] font-semibold text-slate-400 block">Stock Units</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{totalStock}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                      <span className="text-[10px] font-semibold text-slate-400 block">Stock Value</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(totalValue)}</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleViewProductsFilter(cat, e)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>View Products in Category</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ADD / EDIT CATEGORY MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Create New Category'}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category Name *</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Electronics, Hardware, Beverages"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              placeholder="Describe the type of products in this category..."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
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
              onClick={handleSaveCategory}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 shadow-md shadow-blue-600/25 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Save Category'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 6. DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteConfirmCat}
        onClose={() => setDeleteConfirmCat(null)}
        title="Confirm Category Deletion"
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                Are you sure you want to delete "{deleteConfirmCat?.name}"?
              </p>
              <p className="text-amber-700 dark:text-amber-300">
                Products currently assigned to this category will remain safe in inventory but will become uncategorized.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDeleteConfirmCat(null)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Category'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. CATEGORY DETAILS DRAWER */}
      {drawerOpen && selectedCategory && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl overflow-y-auto flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{selectedCategory.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Category Breakdown & Inventory Ledger</p>
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
              {/* Category Description */}
              {selectedCategory.description && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Description</p>
                  <p className="text-xs text-slate-800 dark:text-slate-200">{selectedCategory.description}</p>
                </div>
              )}

              {/* Category Metrics Summary */}
              {(() => {
                const { catProds, productCount, totalStock, totalValue } = getCategoryMetrics(selectedCategory);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 block uppercase">Products</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{productCount}</span>
                      </div>
                      <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase">Stock Units</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{totalStock}</span>
                      </div>
                      <div className="bg-purple-50/50 dark:bg-purple-950/30 p-3.5 rounded-2xl border border-purple-100 dark:border-purple-900/40">
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block uppercase">Valuation</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalValue)}</span>
                      </div>
                    </div>

                    {/* Products in this Category */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Products in {selectedCategory.name} ({catProds.length})
                        </h3>
                        <button
                          onClick={() => {
                            setDrawerOpen(false);
                            if (onNavigateTab) onNavigateTab('products', selectedCategory.id);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                        >
                          View Full Product Catalog →
                        </button>
                      </div>

                      {catProds.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                          No products belong to this category yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                          {catProds.map((p) => (
                            <div key={p.id} className="p-3.5 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                                <p className="text-[10px] text-slate-400">SKU: {p.sku} • Brand: {p.brand || 'N/A'}</p>
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
