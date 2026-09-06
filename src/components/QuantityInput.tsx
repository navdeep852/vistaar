import React, { useState, useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface QuantityInputProps {
  value?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  name?: string;
  placeholder?: string;
}

export const QuantityInput: React.FC<QuantityInputProps> = ({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  disabled = false,
  required = false,
  className = '',
  ariaLabel = 'Quantity',
  size = 'md',
  id,
  name,
  placeholder,
}) => {
  const [draft, setDraft] = useState<string>(() => (value !== undefined && value !== null ? String(value) : ''));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft state with external value changes
  useEffect(() => {
    setDraft(value !== undefined && value !== null ? String(value) : '');
  }, [value]);

  const commitValue = (valStr: string) => {
    let num = parseInt(valStr, 10);
    if (isNaN(num)) {
      num = min ?? 1;
    }
    if (min !== undefined && num < min) {
      num = min;
    }
    if (max !== undefined && num > max) {
      num = max;
    }

    setDraft(String(num));
    if (num !== value) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    commitValue(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue(draft);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    // Allow empty string or non-negative integers only
    if (/^\d*$/.test(nextVal)) {
      setDraft(nextVal);
    }
  };

  const handleIncrement = () => {
    if (disabled) return;
    const current = parseInt(draft, 10);
    const base = isNaN(current) ? (min ?? 1) : current;
    let next = base + step;
    if (max !== undefined && next > max) {
      next = max;
    }
    if (min !== undefined && next < min) {
      next = min;
    }
    setDraft(String(next));
    onChange(next);
  };

  const handleDecrement = () => {
    if (disabled) return;
    const current = parseInt(draft, 10);
    const base = isNaN(current) ? (min ?? 1) : current;
    let next = base - step;
    if (min !== undefined && next < min) {
      next = min;
    }
    if (max !== undefined && next > max) {
      next = max;
    }
    setDraft(String(next));
    onChange(next);
  };

  // Determine boundary disable states
  const parsedDraft = parseInt(draft, 10);
  const effectiveVal = isNaN(parsedDraft) ? (value ?? (min ?? 1)) : parsedDraft;
  const isMinusDisabled = disabled || (min !== undefined && effectiveVal <= min);
  const isPlusDisabled = disabled || (max !== undefined && effectiveVal >= max);

  // Size styling variants
  const sizeConfig = {
    sm: {
      container: 'h-8 text-xs',
      btn: 'w-7 h-8 text-xs',
      input: 'w-12 h-8 text-xs px-1',
      iconSize: 'w-3 h-3',
      rounded: 'rounded-lg',
    },
    md: {
      container: 'h-9 text-xs sm:text-sm',
      btn: 'w-8 h-9 text-xs',
      input: 'w-14 sm:w-16 h-9 text-xs sm:text-sm px-1.5',
      iconSize: 'w-3.5 h-3.5',
      rounded: 'rounded-xl',
    },
    lg: {
      container: 'h-10 text-sm',
      btn: 'w-9 h-10 text-sm',
      input: 'w-16 sm:w-20 h-10 text-sm px-2',
      iconSize: 'w-4 h-4',
      rounded: 'rounded-xl',
    },
  }[size];

  return (
    <div
      className={`inline-flex items-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 ${sizeConfig.rounded} shadow-sm overflow-hidden transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${
        disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900' : ''
      } ${className}`}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={handleDecrement}
        disabled={isMinusDisabled}
        aria-label="Decrease quantity"
        className={`${sizeConfig.btn} inline-flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer select-none`}
      >
        <Minus className={sizeConfig.iconSize} />
      </button>

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`${sizeConfig.input} text-center font-black text-slate-900 dark:text-slate-100 bg-transparent border-x border-slate-200 dark:border-slate-800 focus:outline-none focus:bg-blue-50/20 dark:focus:bg-blue-950/20`}
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={handleIncrement}
        disabled={isPlusDisabled}
        aria-label="Increase quantity"
        className={`${sizeConfig.btn} inline-flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer select-none`}
      >
        <Plus className={sizeConfig.iconSize} />
      </button>
    </div>
  );
};

export default QuantityInput;
