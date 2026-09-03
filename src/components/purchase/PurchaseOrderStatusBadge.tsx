import React from 'react';
import { PurchaseOrderStatus } from '../../types';

interface PurchaseOrderStatusBadgeProps {
  status: PurchaseOrderStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const PurchaseOrderStatusBadge: React.FC<PurchaseOrderStatusBadgeProps> = ({ status, size = 'md' }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'DRAFT':
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700';
      case 'SENT':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
      case 'CONFIRMED':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
      case 'PARTIALLY_RECEIVED':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      case 'FULLY_RECEIVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      case 'CLOSED':
        return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800';
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'DRAFT':
        return 'Draft';
      case 'SENT':
        return 'Sent to Supplier';
      case 'CONFIRMED':
        return 'Confirmed';
      case 'PARTIALLY_RECEIVED':
        return 'Partially Received';
      case 'FULLY_RECEIVED':
        return 'Fully Received';
      case 'CLOSED':
        return 'Closed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold border ${sizeClasses[size]} ${getBadgeStyle()}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
      <span>{getLabel()}</span>
    </span>
  );
};
