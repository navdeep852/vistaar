import React, { ClipboardEvent, ChangeEvent } from 'react';
import { normalizeIndianPhoneNumber } from '../lib/phoneUtils';

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  label,
  error,
  required = false,
  disabled = false,
  placeholder = '10-digit mobile number',
  className = '',
  id,
  name,
  onBlur,
}) => {
  // Ensure local value is clean 10-digit representation
  const displayDigits = normalizeIndianPhoneNumber(value);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip non-numeric digits
    const cleanDigits = raw.replace(/[^0-9]/g, '').slice(0, 10);
    onChange(cleanDigits);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const normalized = normalizeIndianPhoneNumber(pastedText);
    onChange(normalized);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
        className={`flex rounded-xl overflow-hidden border transition-all ${
          error
            ? 'border-rose-500 ring-2 ring-rose-500/10'
            : 'border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800'}`}
      >
        {/* +91 Country Code Badge */}
        <div className="flex items-center gap-1 px-3 bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-xs font-bold border-r border-slate-200 dark:border-slate-700 select-none flex-shrink-0">
          <span className="text-sm">🇮🇳</span>
          <span>+91</span>
        </div>

        {/* 10-digit Numeric Input */}
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          disabled={disabled}
          value={displayDigits}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {error && <p className="text-[11px] font-medium text-rose-500 mt-1">{error}</p>}
    </div>
  );
};
