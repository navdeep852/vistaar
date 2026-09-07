import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

import { ALLOWED_TAX_RATES, AllowedTaxRate, normalizeToNearestAllowedTaxRate } from '../constants/tax';

export const GST_RATE_SLABS = ALLOWED_TAX_RATES;
export type GstRateSlab = AllowedTaxRate;

export interface GstRateInputProps {
  value?: number;
  onChange: (value: GstRateSlab) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  id?: string;
  name?: string;
}

/**
 * Normalizes any number to the nearest legal Indian GST rate slab (0, 5, 12, 18, 40).
 */
export function normalizeToNearestGstSlab(rate: number): GstRateSlab {
  return normalizeToNearestAllowedTaxRate(rate);
}

export const GstRateInput: React.FC<GstRateInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  ariaLabel = 'GST Rate Percentage',
  size = 'md',
  id,
  name,
}) => {
  // Normalize current value to one of the 5 standard slabs
  const currentSlab = normalizeToNearestGstSlab(Number(value) || 0);
  const currentIndex = GST_RATE_SLABS.indexOf(currentSlab);

  const canStepUp = !disabled && currentIndex < GST_RATE_SLABS.length - 1;
  const canStepDown = !disabled && currentIndex > 0;

  const handleStepUp = () => {
    if (canStepUp) {
      const nextSlab = GST_RATE_SLABS[currentIndex + 1];
      onChange(nextSlab);
    }
  };

  const handleStepDown = () => {
    if (canStepDown) {
      const prevSlab = GST_RATE_SLABS[currentIndex - 1];
      onChange(prevSlab);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStepUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStepDown();
    }
  };

  const sizeClasses = {
    sm: {
      container: 'h-8 text-xs',
      input: 'w-10 h-8 text-xs px-1',
      btnContainer: 'w-5 h-8',
      btn: 'h-3.5',
      icon: 'w-3 h-3',
      rounded: 'rounded-lg',
    },
    md: {
      container: 'h-9 text-xs sm:text-sm',
      input: 'w-12 sm:w-14 h-9 text-xs sm:text-sm px-1.5',
      btnContainer: 'w-5 sm:w-6 h-9',
      btn: 'h-4',
      icon: 'w-3.5 h-3.5',
      rounded: 'rounded-xl',
    },
  }[size];

  return (
    <div
      className={`inline-flex items-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 ${sizeClasses.rounded} shadow-sm overflow-hidden transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${
        disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900' : ''
      } ${className}`}
    >
      <input
        id={id}
        name={name}
        type="text"
        readOnly
        disabled={disabled}
        aria-label={ariaLabel}
        value={`${currentSlab}%`}
        onKeyDown={handleKeyDown}
        className={`${sizeClasses.input} text-center font-black text-slate-900 dark:text-slate-100 bg-transparent cursor-default select-none focus:outline-none focus:bg-blue-50/20 dark:focus:bg-blue-950/20`}
      />

      <div className={`flex flex-col border-l border-slate-200 dark:border-slate-800 ${sizeClasses.btnContainer}`}>
        <button
          type="button"
          tabIndex={-1}
          onClick={handleStepUp}
          disabled={!canStepUp}
          aria-label="Increase GST rate"
          className={`${sizeClasses.btn} flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer select-none`}
        >
          <ChevronUp className={sizeClasses.icon} />
        </button>
        <div className="border-t border-slate-200 dark:border-slate-800" />
        <button
          type="button"
          tabIndex={-1}
          onClick={handleStepDown}
          disabled={!canStepDown}
          aria-label="Decrease GST rate"
          className={`${sizeClasses.btn} flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer select-none`}
        >
          <ChevronDown className={sizeClasses.icon} />
        </button>
      </div>
    </div>
  );
};

export default GstRateInput;
