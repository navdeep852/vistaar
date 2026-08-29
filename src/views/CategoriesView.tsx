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
  RefreshCw,
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
  const [errorState, setErrorState] = useState<string | null>(null);
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
    setErrorState(null);
    try {
      const [catRes, prodRes] = await Promise.all([
        productService.getCategories(),
        productService.getProducts(),
      ]);

      if (catRes.error) {
        setErrorState(catRes.error);
        showToast(catRes.error, 'error');
      } else {
        setCategories(catRes.data || []);
      }

      setProducts(prodRes.data || []);
    } catch (err: any) {
      const errMsg = err.message || 'Failed to load categories';
      setErrorState(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Categories
  const filteredCategories = categories.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  // Helper Calculations per Category
  const getCategoryMetrics = (cat: Category) => {
    const catProds = products.filter(
      (p) => p.categoryId === cat.id || p.category === cat.name || p.category === cat.id
    );
    const productCount = catProds.length;
    const totalStock = catProds.reduce((sum, p) => sum + (p.currentStock || 0), 0);
    const totalValue = catProds.reduce((sum, p) => sum + (p.currentStock || 0) * (p.buyPrice || 0), 0);
    return { catProds, productCount, totalStock, totalValue };
  };

  // Authoritative Overall KPIs
  const totalCategories = categories.length;
  
  // Categorized products: products assigned to a valid category record in workspace
  const categorizedProductsList = products.filter((p) =>
    categories.some(
      (c) => c.id === p.categoryId || c.name === p.category || c.id === p.category
    )
  );

  const totalCategorizedProds = categorizedProductsList.length;
  const totalUncategorizedProds = Math.max(0, products.length - totalCategorizedProds);

  // Category Inventory Value: Sum of value for products belonging to valid category records
  const categoryInventoryValue = categorizedProductsList.reduce(
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
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(categoryInventoryValue)}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Uncategorized Items</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalUncategorizedProds}</p>
          </div>
        </div>
      </div>

      {/* 3. ERROR BANNER */}
      {errorState && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 rounded-2xl flex items-center justify-between gap-4 text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">Unable to load category data</p>
              <p className="text-xs">{errorState}</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-500 flex items-center gap-1.5 shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 4. SEARCH & FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search category name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium self-end sm:self-center">
          Showing <span className="font-bold text-slate-900 dark:text-slate-100">{filteredCategories.length}</span> of{' '}
          <span className="font-bold text-slate-900 dark:text-slate-100">{categories.length}</span> categories
        </div>
      </div>

      {/* 5. CONTENT GRID / STATES */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-800/50 animate-pulse border border-slate-200 dark:border-slate-800" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <FolderTree className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Categories Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You haven't created any product categories yet. Create your first category to group your products cleanly.
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Category</span>
          </button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Matching Categories</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No category matching <span className="font-semibold text-slate-900 dark:text-slate-100">"{search}"</span> was found.
            </p>
          </div>
          <button
            onClick={() => setSearch('')}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-2 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear Search</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((cat) => {
            const { productCount, totalStock, totalValue } = getCategoryMetrics(cat);

            return (
              <div
                key={cat.id}
                onClick={() => handleOpenDetails(cat)}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <FolderTree className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {cat.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleOpenEdit(cat, e)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmCat(cat);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[2rem]">
                    {cat.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-center bg-slate-50/50 dark:bg-slate-800/30 p-2.5 rounded-xl">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Products</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{productCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Stock Units</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{totalStock}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Valuation</p>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{formatCurrency(totalValue)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold pt-1">
                  <span className="flex items-center gap-1 group-hover:underline">
                    <span>View Category Details</span>
                  </span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. CREATE / EDIT MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Add New Category'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Category Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Bearings, Fasteners, Lubricants"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Brief description of products in this category..."
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCategory}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingCategory ? 'Save Changes' : 'Create Category'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteConfirmCat}
        onClose={() => setDeleteConfirmCat(null)}
        title="Delete Category"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Are you sure you want to delete this category?</p>
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                Category: <span className="font-bold">{deleteConfirmCat?.name}</span>
              </p>
              {deleteConfirmCat && getCategoryMetrics(deleteConfirmCat).productCount > 0 && (
                <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
                  ⚠️ {getCategoryMetrics(deleteConfirmCat).productCount} products are currently assigned to this category. Deleting it will safely convert them to Uncategorized.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setDeleteConfirmCat(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* 8. CATEGORY DETAILS DRAWER */}
      {drawerOpen && selectedCategory && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm flex justify-end transition-opacity">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
                  <FolderTree className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selectedCategory.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Category Details & Product Valuation</p>
                </div>
              </div>

              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Description */}
              <div className="space-y-1 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {selectedCategory.description || 'No description provided.'}
                </p>
              </div>

              {/* Category Metrics Summary */}
              {(() => {
                const { catProds, productCount, totalStock, totalValue } = getCategoryMetrics(selectedCategory);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Products</p>
                        <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-1">{productCount}</p>
                      </div>

                      <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Total Stock</p>
                        <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-1">{totalStock}</p>
                      </div>

                      <div className="p-4 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">Valuation</p>
                        <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-1">{formatCurrency(totalValue)}</p>
                      </div>
                    </div>

                    {/* Products in Category List */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Assigned Inventory Products ({catProds.length})
                        </h3>
                        {catProds.length > 0 && (
                          <button
                            onClick={() => handleViewProductsFilter(selectedCategory)}
                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <span>View in Product List</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {catProds.length === 0 ? (
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                          No products are currently assigned to this category.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {catProds.map((prod) => (
                            <div
                              key={prod.id}
                              className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                            >
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-900 dark:text-slate-100">{prod.name}</p>
                                <p className="text-[10px] text-slate-400">SKU: {prod.sku || 'N/A'}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-900 dark:text-slate-100">{prod.currentStock || 0} {prod.unit || 'units'}</p>
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{formatCurrency((prod.currentStock || 0) * (prod.buyPrice || 0))}</p>
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

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <button
                onClick={(e) => {
                  setDrawerOpen(false);
                  setDeleteConfirmCat(selectedCategory);
                }}
                className="px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Category</span>
              </button>

              <button
                onClick={(e) => {
                  setDrawerOpen(false);
                  handleOpenEdit(selectedCategory, e);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit Category</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
