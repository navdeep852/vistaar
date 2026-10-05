import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  Loader2,
  Package,
  Users,
  Receipt,
  FileText,
  Building,
  ShoppingCart,
  Scale,
  DollarSign,
  Compass,
  CornerDownLeft,
} from 'lucide-react';
import {
  globalSearchService,
  GlobalSearchResult,
  GroupedSearchResults,
  SearchResultCategory,
} from '../services/globalSearchService';

interface GlobalSearchProps {
  setActiveTab: (tab: string) => void;
  className?: string;
  placeholder?: string;
}

const CATEGORY_ICONS: Record<SearchResultCategory, React.ComponentType<{ className?: string }>> = {
  products: Package,
  customers: Users,
  invoices: Receipt,
  quotations: FileText,
  suppliers: Building,
  purchase_orders: ShoppingCart,
  udhari: Scale,
  expenses: DollarSign,
  modules: Compass,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-400' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-400' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', darkBg: 'dark:bg-purple-950/60', darkText: 'dark:text-purple-400' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', darkBg: 'dark:bg-indigo-950/60', darkText: 'dark:text-indigo-400' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-400' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', darkBg: 'dark:bg-cyan-950/60', darkText: 'dark:text-cyan-400' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', darkBg: 'dark:bg-rose-950/60', darkText: 'dark:text-rose-400' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', darkBg: 'dark:bg-orange-950/60', darkText: 'dark:text-orange-400' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', darkBg: 'dark:bg-slate-800', darkText: 'dark:text-slate-400' },
};

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  setActiveTab,
  className = '',
  placeholder = 'Search anything...',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [results, setResults] = useState<GroupedSearchResults>({
    modules: [],
    products: [],
    customers: [],
    invoices: [],
    quotations: [],
    suppliers: [],
    purchase_orders: [],
    udhari: [],
    expenses: [],
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const lastQueryIdRef = useRef<number>(0);

  // Platform-aware shortcut indicator
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent);
  }, []);
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K';

  // Flattened array of all current result items for keyboard arrow navigation
  const flattenedResults = useMemo(() => {
    const list: GlobalSearchResult[] = [];
    const categories: (keyof GroupedSearchResults)[] = [
      'modules',
      'products',
      'customers',
      'invoices',
      'quotations',
      'suppliers',
      'purchase_orders',
      'udhari',
      'expenses',
    ];
    for (const cat of categories) {
      if (results[cat] && results[cat].length > 0) {
        list.push(...results[cat]);
      }
    }
    return list;
  }, [results]);

  const hasAnyResults = flattenedResults.length > 0;

  // Execute search with debouncing & race-condition cancellation
  const executeSearch = useCallback((query: string) => {
    const queryId = ++lastQueryIdRef.current;
    setIsLoading(true);

    globalSearchService
      .search(query)
      .then((res) => {
        // Discard out-of-order responses
        if (queryId === lastQueryIdRef.current) {
          setResults(res);
          setIsLoading(false);
          setHighlightedIndex(0);
        }
      })
      .catch((err) => {
        if (queryId === lastQueryIdRef.current) {
          console.error('[GlobalSearch Error]', err);
          setIsLoading(false);
        }
      });
  }, []);

  // Handle typing change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsDropdownOpen(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(val);
    }, 200);
  };

  // Focus input and open dropdown
  const handleInputFocus = () => {
    setIsFocused(true);
    setIsDropdownOpen(true);
    executeSearch(searchQuery);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
  };

  // Clear query
  const handleClear = () => {
    setSearchQuery('');
    executeSearch('');
    searchInputRef.current?.focus();
  };

  // Item selection
  const handleSelectResult = (result: GlobalSearchResult) => {
    setIsDropdownOpen(false);
    setSearchQuery('');
    setActiveTab(result.targetTab);
    searchInputRef.current?.blur();

    // Dispatch global custom event for optional destination view reaction
    window.dispatchEvent(
      new CustomEvent('vistaar:global-search-select', {
        detail: result,
      })
    );
  };

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setIsDropdownOpen(true);
        executeSearch(searchQuery);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [executeSearch, searchQuery]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation within the search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        return;
      }
      if (flattenedResults.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % flattenedResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        return;
      }
      if (flattenedResults.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? flattenedResults.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isDropdownOpen && highlightedIndex >= 0 && highlightedIndex < flattenedResults.length) {
        handleSelectResult(flattenedResults[highlightedIndex]);
      } else if (isDropdownOpen && flattenedResults.length > 0) {
        handleSelectResult(flattenedResults[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (isDropdownOpen) {
        setIsDropdownOpen(false);
      } else if (searchQuery) {
        setSearchQuery('');
      }
      searchInputRef.current?.blur();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector(`[data-result-index="${highlightedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  // Helper to render a group of search results
  let globalItemIndex = 0;
  const renderGroup = (
    title: string,
    items: GlobalSearchResult[],
    category: SearchResultCategory
  ) => {
    if (!items || items.length === 0) return null;
    const IconComponent = CATEGORY_ICONS[category] || Compass;

    return (
      <div key={category} className="mb-2 last:mb-0">
        <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <IconComponent className="w-3 h-3 text-slate-400" />
          <span>{title}</span>
          <span className="text-[9px] text-slate-400/80 font-normal">({items.length})</span>
        </div>
        <div className="space-y-0.5 mt-0.5">
          {items.map((item) => {
            const itemIdx = globalItemIndex++;
            const isHighlighted = itemIdx === highlightedIndex;
            const badgeColor = item.badgeColor || 'slate';
            const colorCfg = CATEGORY_COLORS[badgeColor] || CATEGORY_COLORS.slate;

            return (
              <div
                key={item.id}
                data-result-index={itemIdx}
                onMouseEnter={() => setHighlightedIndex(itemIdx)}
                onClick={() => handleSelectResult(item)}
                className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  isHighlighted
                    ? 'bg-blue-50/90 dark:bg-blue-950/60 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500/25'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${colorCfg.bg} ${colorCfg.text} ${colorCfg.darkBg} ${colorCfg.darkText}`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate leading-tight text-slate-900 dark:text-slate-100">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.badge && (
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${colorCfg.bg} ${colorCfg.text} ${colorCfg.darkBg} ${colorCfg.darkText}`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isHighlighted && (
                    <CornerDownLeft className="w-3 h-3 text-blue-500 dark:text-blue-400 shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Reset global item index on each render pass
  globalItemIndex = 0;

  // Shortcut badge visibility: visible only on hover or focus, hidden normally
  const showShortcutHint = (isHovered || isFocused) && !searchQuery;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-full ${className}`}
    >
      {/* 1. Real Search Input Control */}
      <div className="relative w-full group">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-blue-500" />

        <input
          ref={searchInputRef}
          type="search"
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-label="Search VISTAAR"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-8 pr-16 py-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/60 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-blue-500/80 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs"
        />

        {/* Action Controls / Dynamic Indicator on the Right */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin mr-1 shrink-0" />
          )}

          {searchQuery ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <kbd
              className={`hidden sm:inline-block text-[9px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded shadow-2xs pointer-events-none transition-all duration-150 ${
                showShortcutHint ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
            >
              {shortcutHint}
            </kbd>
          )}
        </div>
      </div>

      {/* 2. Professional Compact Results Dropdown */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 w-full min-w-[320px] max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-fade-in max-h-[440px] overflow-y-auto no-scrollbar"
        >
          {isLoading && !hasAnyResults ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Searching VISTAAR...</span>
            </div>
          ) : !hasAnyResults && searchQuery.trim().length >= 2 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No results found for <span className="font-bold text-slate-800 dark:text-slate-200">"{searchQuery}"</span>
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Try searching for product names, SKU numbers, customer phone numbers, invoices, or module names.
              </p>
            </div>
          ) : (
            <div>
              {renderGroup('Products & Inventory', results.products, 'products')}
              {renderGroup('Customers', results.customers, 'customers')}
              {renderGroup('Invoices', results.invoices, 'invoices')}
              {renderGroup('Quotations', results.quotations, 'quotations')}
              {renderGroup('Suppliers', results.suppliers, 'suppliers')}
              {renderGroup('Purchase Orders', results.purchase_orders, 'purchase_orders')}
              {renderGroup('Udhari Ledger', results.udhari, 'udhari')}
              {renderGroup('Expenses', results.expenses, 'expenses')}
              {renderGroup('Quick Navigation', results.modules, 'modules')}
            </div>
          )}

          {/* Footer Navigation Hints */}
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800/80 px-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 select-none">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">↑</kbd>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">↓</kbd>
                <span className="ml-1">Navigate</span>
              </span>
              <span className="flex items-center gap-0.5">
                <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">↵</kbd>
                <span className="ml-1">Select</span>
              </span>
            </div>
            <span className="flex items-center gap-0.5">
              <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">Esc</kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
