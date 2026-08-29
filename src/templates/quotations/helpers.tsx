import React from 'react';
import { BrandingConfig } from '../../types/template';

export function formatCurrency(amount: number | undefined | null, symbol: string = '₹'): string {
  const safeVal = Number(amount || 0);
  return `${symbol}${safeVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatFullAddress(
  address?: string,
  addressLine2?: string,
  city?: string,
  state?: string,
  pincode?: string
): string {
  const parts = [address, addressLine2, city, state, pincode ? `- ${pincode}` : ''].filter(Boolean);
  return parts.join(', ');
}

export function hasValue(val: any): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (typeof val === 'number') return !isNaN(val);
  return Boolean(val);
}

export const LogoComponent: React.FC<{
  branding: BrandingConfig;
  businessName: string;
  className?: string;
  fallbackStyle?: 'default' | 'badge' | 'minimal' | 'executive';
}> = ({ branding, businessName, className = '', fallbackStyle = 'default' }) => {
  const initial = (businessName?.charAt(0) || 'B').toUpperCase();
  const scale = branding.logoScale || 1;

  if (branding.logoUrl) {
    return (
      <div className={`flex items-center ${className}`}>
        <img
          src={branding.logoUrl}
          alt={businessName}
          className="max-h-16 max-w-[200px] object-contain transition-all"
          style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}
        />
      </div>
    );
  }

  if (fallbackStyle === 'badge') {
    return (
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md ${className}`}>
        {initial}
      </div>
    );
  }

  if (fallbackStyle === 'executive') {
    return (
      <div className={`w-12 h-12 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-400 font-bold text-xl flex items-center justify-center ${className}`}>
        {initial}
      </div>
    );
  }

  return (
    <div className={`w-11 h-11 rounded-xl bg-slate-100 text-slate-800 font-bold text-lg flex items-center justify-center border border-slate-200 ${className}`}>
      {initial}
    </div>
  );
};
