import React, { useState, forwardRef } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  showLockIcon?: boolean;
  leftIcon?: React.ReactNode;
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      label,
      value,
      onChange,
      placeholder = '••••••••',
      required = false,
      disabled = false,
      error,
      autoComplete = 'current-password',
      name,
      id,
      showLockIcon = true,
      leftIcon,
      containerClassName = '',
      labelClassName = '',
      inputClassName = '',
      autoFocus,
      onKeyDown,
      onBlur,
      ...rest
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    const toggleVisibility = () => {
      setShowPassword((prev) => !prev);
    };

    const inputId = id || (name ? `password-input-${name}` : undefined);
    const errorId = inputId ? `${inputId}-error` : undefined;

    const hasLeftIcon = showLockIcon || !!leftIcon;

    return (
      <div className={`space-y-1 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider ${labelClassName}`}
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}

        <div className="relative rounded-xl shadow-xs">
          {/* Left Icon (Lock or custom icon) */}
          {hasLeftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              {leftIcon || <Lock className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
          )}

          {/* Password Input Field */}
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={showPassword ? 'text' : 'password'}
            required={required}
            disabled={disabled}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={`block w-full ${hasLeftIcon ? 'pl-10' : 'pl-3.5'} pr-10 py-2.5 sm:py-3 bg-slate-50 dark:bg-slate-950 border ${
              error
                ? 'border-rose-500 ring-2 ring-rose-500/20'
                : 'border-slate-300 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            } rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${inputClassName}`}
            {...rest}
          />

          {/* Right Visibility Toggle Button */}
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={disabled}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:text-blue-600 dark:focus:text-blue-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>

        {/* Validation Error Message */}
        {error && (
          <p id={errorId} className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
