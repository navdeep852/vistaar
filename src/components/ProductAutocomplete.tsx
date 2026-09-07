import React, { useState, useEffect, useRef, useId, forwardRef, useImperativeHandle } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Product } from '../types';
import { productService } from '../services/supabase/productService';
import { rankProductSearchResults, getProductDisplayName, getProductPartNumber, getProductSellingPrice, getProductStock } from '../lib/productHelpers';

export interface ProductAutocompleteProps {
  onSelectProduct: (product: Product) => void;
  selectedProductId?: string;
  selectedProductName?: string;
  selectedPartNumber?: string;
  placeholder?: string;
  currency?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  fallbackProducts?: Product[];
  prioritizePartNumber?: boolean;
  onEnterWithoutSelection?: () => void;
}

export const ProductAutocomplete = forwardRef<HTMLInputElement, ProductAutocompleteProps>(({
  onSelectProduct,
  selectedProductId,
  selectedProductName,
  selectedPartNumber,
  placeholder = 'Search part number or product...',
  currency = '₹',
  disabled = false,
  autoFocus = false,
  className = '',
  inputClassName = '',
  fallbackProducts = [],
  prioritizePartNumber = true,
  onEnterWithoutSelection,
}, ref) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  // Perform search when search term changes or when dropdown opens
  useEffect(() => {
    let isMounted = true;
    const trimmed = searchTerm.trim();

    if (!isOpen && !trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        let rawProducts: Product[] = [];

        // Check local fallback first for instant matching
        if (fallbackProducts && fallbackProducts.length > 0) {
          rawProducts = [...fallbackProducts];
        }

        // Search via backend service
        const searchRes = await productService.searchProducts(trimmed, 30);
        if (searchRes.data && searchRes.data.length > 0) {
          const remoteProds = searchRes.data;
          const merged = [...remoteProds];
          rawProducts.forEach((lp) => {
            if (!merged.some((mp) => mp.id === lp.id)) {
              merged.push(lp);
            }
          });
          rawProducts = merged;
        }

        if (!isMounted) return;

        // Rank search results with exact Part Number prioritization
        const ranked = rankProductSearchResults(trimmed, rawProducts);

        setResults(ranked.slice(0, 25));
        setHighlightedIndex(ranked.length > 0 ? 0 : -1);
      } catch (err) {
        console.warn('Product autocomplete search error:', err);
        if (isMounted) {
          const ranked = rankProductSearchResults(trimmed, fallbackProducts);
          setResults(ranked.slice(0, 25));
          setHighlightedIndex(ranked.length > 0 ? 0 : -1);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchTerm, isOpen, fallbackProducts]);

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
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchTerm.trim().toLowerCase();

      // Check for exact Part Number match in local fallback or results first
      if (trimmed) {
        const pool = [...results, ...fallbackProducts];
        const exactMatch = pool.find((p) => {
          const pNo = getProductPartNumber(p).toLowerCase();
          return pNo === trimmed;
        });

        if (exactMatch) {
          handleSelect(exactMatch);
          return;
        }
      }

      // If a result is highlighted in dropdown
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]);
        return;
      }

      // Otherwise, inform caller of Enter
      onEnterWithoutSelection?.();
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'Tab') {
      // If user tabs while an item is highlighted and dropdown is open, auto-select it
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < results.length && searchTerm.trim().length > 0) {
        handleSelect(results[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    }
  };

  const displayPlaceholder = selectedPartNumber
    ? `${selectedPartNumber} — ${selectedProductName || 'Selected'}`
    : selectedProductName
    ? selectedProductName
    : placeholder;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input container */}
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
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
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={displayPlaceholder}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          className={`w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50 ${inputClassName}`}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100 min-w-[280px]"
        >
          {loading && results.length === 0 ? (
            <div className="p-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Searching catalog...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No products found</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                No matching product for "{searchTerm}".
              </p>
            </div>
          ) : (
            results.map((prod, idx) => {
              const isSelected = prod.id === selectedProductId;
              const isHighlighted = idx === highlightedIndex;
              const stock = getProductStock(prod);
              const partNo = getProductPartNumber(prod);
              const name = getProductDisplayName(prod);
              const price = getProductSellingPrice(prod);
              const unit = prod.unit || 'Pcs';

              return (
                <div
                  key={prod.id || idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(prod)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-2.5 cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50 dark:bg-slate-800/80 ring-1 ring-inset ring-blue-500/30'
                      : isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {partNo && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-extrabold shrink-0 border border-blue-200 dark:border-blue-900/50">
                            {partNo}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                          {name}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-3">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs whitespace-nowrap">
                        {currency}{price.toLocaleString('en-IN')}
                      </span>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          stock > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        Stock: {stock}
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
});

ProductAutocomplete.displayName = 'ProductAutocomplete';

export default ProductAutocomplete;
