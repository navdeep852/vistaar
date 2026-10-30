import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { Product } from '../types';

export interface SearchableProductSelectProps {
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (product: Product | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * Filters products by name, part number, product code, or SKU using case-insensitive partial matching.
 */
export function filterProducts(products: Product[], query: string): Product[] {
  if (!query || !query.trim()) return products;
  const q = query.toLowerCase().trim();
  return products.filter((p) => {
    const name = (p.name || p.productName || '').toLowerCase();
    const partNumber = (p.partNumber || '').toLowerCase();
    const productCode = (p.productCode || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    const barcode = (p.barcode || '').toLowerCase();
    return (
      name.includes(q) ||
      partNumber.includes(q) ||
      productCode.includes(q) ||
      sku.includes(q) ||
      barcode.includes(q)
    );
  });
}

/**
 * Formats a product's display label matching VISTAAR's standard stock receipt format:
 * e.g., "27W USB-C Charger (Part #: EL-CHG-017) — Avail: 30 Piece"
 */
export function formatProductOptionLabel(p: Product): string {
  const code = p.partNumber || p.productCode || p.sku || 'N/A';
  const avail = p.currentStock ?? 0;
  const unit = p.unit || 'Units';
  return `${p.name} (Part #: ${code}) — Avail: ${avail} ${unit}`;
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  placeholder = 'Select a product...',
  searchPlaceholder = 'Search by product name, part number or code...',
  disabled = false,
  required = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Find currently selected product object
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  // Filter products based on search query
  const filteredProducts = useMemo(
    () => filterProducts(products, searchTerm),
    [products, searchTerm]
  );

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setHighlightedIndex(0);
      // Small timeout ensures the DOM node is rendered before focusing
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

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

  // Ensure highlighted element is scrolled into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const highlightedEl = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      // Prevent form submission on enter
      e.preventDefault();
      e.stopPropagation();
      if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
        handleSelect(filteredProducts[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input to satisfy native HTML form validation when required */}
      <input
        type="text"
        tabIndex={-1}
        required={required}
        value={selectedProductId}
        onChange={() => {}}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Main Trigger Field (Visually identical to existing select field) */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-200 dark:border-slate-800'
        } rounded-xl text-xs font-bold text-left text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <span className="truncate flex-1">
          {selectedProduct ? (
            formatProductOptionLabel(selectedProduct)
          ) : (
            <span className="text-slate-400 dark:text-slate-500 font-normal">
              {placeholder}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Panel with Search Input & Product List */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Product Items Listbox */}
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1"
          >
            {filteredProducts.length === 0 ? (
              <div className="p-5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                No matching products found.
              </div>
            ) : (
              filteredProducts.map((p, idx) => {
                const isSelected = p.id === selectedProductId;
                const isHighlighted = idx === highlightedIndex;
                const code = p.partNumber || p.productCode || p.sku;
                const avail = p.currentStock ?? 0;
                const unit = p.unit || 'Units';

                return (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(p)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs ${
                      isHighlighted
                        ? 'bg-blue-50 dark:bg-slate-800/80 text-blue-900 dark:text-blue-200'
                        : isSelected
                        ? 'bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold truncate">
                        <span className="truncate">{p.name}</span>
                        {code && (
                          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 shrink-0">
                            (Part #: {code})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Avail:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {avail} {unit}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

