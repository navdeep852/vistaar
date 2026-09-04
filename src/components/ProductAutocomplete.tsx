import React, { useState, useEffect, useRef, useId } from 'react';
import { Search, X, Package, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Product } from '../types';
import { productService } from '../services/supabase/productService';

interface ProductAutocompleteProps {
  onSelectProduct: (product: Product) => void;
  selectedProductId?: string;
  selectedProductName?: string;
  placeholder?: string;
  currency?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  fallbackProducts?: Product[];
}

export const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  onSelectProduct,
  selectedProductId,
  selectedProductName,
  placeholder = 'Search product name, part number, or code...',
  currency = '₹',
  disabled = false,
  autoFocus = false,
  className = '',
  fallbackProducts = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Perform search when search term changes or when dropdown opens
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const trimmed = searchTerm.trim();
        // Query Supabase / tenant search
        const searchRes = await productService.searchProducts(trimmed);
        if (!isMounted) return;

        let matched = searchRes.data || [];

        // Fallback or merge with local fallbackProducts if available
        if (matched.length === 0 && fallbackProducts.length > 0) {
          const q = trimmed.toLowerCase();
          matched = fallbackProducts.filter(
            (p) =>
              !q ||
              (p.name && p.name.toLowerCase().includes(q)) ||
              (p.productName && p.productName.toLowerCase().includes(q)) ||
              (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
              (p.sku && p.sku.toLowerCase().includes(q)) ||
              ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q))
          );
        }

        setResults(matched);
        setHighlightedIndex(matched.length > 0 ? 0 : -1);
      } catch (err) {
        console.warn('Product autocomplete search error:', err);
        const q = searchTerm.trim().toLowerCase();
        const matched = fallbackProducts.filter(
          (p) =>
            !q ||
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.productName && p.productName.toLowerCase().includes(q)) ||
            (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q)) ||
            ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q))
        );
        if (isMounted) {
          setResults(matched);
          setHighlightedIndex(matched.length > 0 ? 0 : -1);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchTerm, fallbackProducts]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input container */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          autoFocus={autoFocus}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedProductName ? `Selected: ${selectedProductName}` : placeholder}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100"
        >
          {loading ? (
            <div className="p-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Searching catalog...</span>
            </div>
          ) : searchTerm.trim().length < 1 ? (
            <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
              Start typing at least 1 character to search products...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No products found</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                No matching product name, part number, or code for "{searchTerm}".
              </p>
            </div>
          ) : (
            results.map((prod, idx) => {
              const isSelected = prod.id === selectedProductId;
              const isHighlighted = idx === highlightedIndex;
              const stock = Number(prod.currentStock ?? (prod as any).current_stock ?? 0);
              const partNo = prod.partNumber || (prod as any).part_number || 'N/A';
              const sku = prod.sku || (prod as any).product_code || 'N/A';
              const price = prod.sellingPrice ?? (prod as any).selling_price ?? 0;
              const unit = prod.unit || 'Pcs';

              return (
                <div
                  key={prod.id || idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(prod)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-3 cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50 dark:bg-slate-800/80'
                      : isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate">
                          {prod.name || prod.productName}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                            Selected
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>
                          Code: <strong className="text-slate-700 dark:text-slate-300">{sku}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Part No: <strong className="text-slate-700 dark:text-slate-300">{partNo}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-slate-900 dark:text-slate-100 text-xs block">
                        {currency}
                        {price.toLocaleString('en-IN')} / {unit}
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          stock > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        Stock: {stock} {unit}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
