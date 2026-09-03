import React, { useState, useEffect, useRef, useId } from 'react';
import { Search, X, User, Phone, MapPin, Loader2, RefreshCw, Check, Building2 } from 'lucide-react';
import { Customer } from '../types';
import { customerService } from '../services/supabase/customerService';
import { formatIndianPhoneNumber } from '../lib/phoneUtils';
import { store } from '../services/store';

interface CustomerSelectProps {
  selectedCustomerId: string;
  onSelectCustomer: (customer: Customer | null) => void;
  customers?: Customer[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const CustomerSelect: React.FC<CustomerSelectProps> = ({
  selectedCustomerId,
  onSelectCustomer,
  customers: initialCustomers,
  placeholder = 'Search customer by name, phone, or location...',
  disabled = false,
  required = false,
  className = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerList, setCustomerList] = useState<Customer[]>(initialCustomers || []);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Load / Sync customer data
  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await customerService.getCustomers();
      if (res.data) {
        setCustomerList(res.data);
        store.setCustomers(res.data);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      console.warn('CustomerSelect load customers error:', err);
      setError('Unable to load customer list.');
    } finally {
      setLoading(false);
    }
  };

  // Hydrate or refresh customer list if initial list is missing or empty
  useEffect(() => {
    if (initialCustomers && initialCustomers.length > 0) {
      setCustomerList(initialCustomers);
    } else {
      const existingInStore = store.getCustomers();
      if (existingInStore && existingInStore.length > 0) {
        setCustomerList(existingInStore);
      } else {
        loadCustomers();
      }
    }
  }, [initialCustomers]);

  // Subscribe to store updates for customers
  useEffect(() => {
    const unsub = store.subscribe(() => {
      const updated = store.getCustomers();
      if (updated && updated.length > 0) {
        setCustomerList(updated);
      }
    });
    return unsub;
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selected Customer Object lookup
  const selectedCustomer = customerList.find((c) => c.id === selectedCustomerId);

  // Filtered customer results based on search input
  const filteredCustomers = customerList.filter((c) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    const nameMatch = c.name && c.name.toLowerCase().includes(q);
    const phoneMatch = c.phone && c.phone.includes(q);
    const emailMatch = c.email && c.email.toLowerCase().includes(q);
    const cityMatch = c.city && c.city.toLowerCase().includes(q);
    const gstinMatch = c.gstin && c.gstin.toLowerCase().includes(q);
    return nameMatch || phoneMatch || emailMatch || cityMatch || gstinMatch;
  });

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCustomer(null);
    setSearchTerm('');
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredCustomers.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredCustomers.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredCustomers.length) {
        handleSelect(filteredCustomers[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML form validation when required */}
      <input
        type="text"
        tabIndex={-1}
        required={required}
        value={selectedCustomerId}
        onChange={() => {}}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Selected Customer View (When a customer is chosen) */}
      {selectedCustomer && !isOpen ? (
        <div className="flex items-center justify-between p-2.5 bg-blue-50/60 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 rounded-xl transition-all">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'C'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                  {selectedCustomer.name}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold shrink-0">
                  {selectedCustomer.customerType || 'Retail'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{formatIndianPhoneNumber(selectedCustomer.phone)}</span>
                </span>
                {selectedCustomer.city && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{selectedCustomer.city}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              disabled={disabled}
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Change Customer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Search Control (When selecting or searching) */
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              setIsOpen(true);
              if (customerList.length === 0 && !loading) {
                loadCustomers();
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={listboxId}
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
          />

          {loading ? (
            <Loader2 className="w-4 h-4 absolute right-3 text-blue-600 animate-spin" />
          ) : searchTerm ? (
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
          ) : null}
        </div>
      )}

      {/* Autocomplete Dropdown Panel */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100"
        >
          {loading && customerList.length === 0 ? (
            <div className="p-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading customers...</span>
            </div>
          ) : error && customerList.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={loadCustomers}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-4 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No customers found</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {searchTerm
                  ? `No matching customer for "${searchTerm}".`
                  : 'No customer records available.'}
              </p>
            </div>
          ) : (
            filteredCustomers.map((cust, idx) => {
              const isSelected = cust.id === selectedCustomerId;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={cust.id || idx}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(cust)}
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
                          {cust.name}
                        </span>
                        {cust.customerType && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                            {cust.customerType}
                          </span>
                        )}
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Selected
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {formatIndianPhoneNumber(cust.phone)}
                        </span>
                        {cust.city && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {cust.city}
                              {cust.state ? `, ${cust.state}` : ''}
                            </span>
                          </>
                        )}
                        {cust.gstin && (
                          <>
                            <span>•</span>
                            <span>
                              GST: <strong className="text-slate-700 dark:text-slate-300">{cust.gstin}</strong>
                            </span>
                          </>
                        )}
                      </div>
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
