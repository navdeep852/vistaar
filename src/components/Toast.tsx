import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

let toastListener: ((toast: ToastMessage) => void) | null = null;

export const showToast = (title: string, type: 'success' | 'error' | 'info' = 'success', message?: string) => {
  if (toastListener) {
    toastListener({
      id: Math.random().toString(36).substring(2, 9),
      type,
      title,
      message,
    });
  }
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListener = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);

      const dismissDelay = toast.duration || (toast.type === 'error' ? 5000 : 3500);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, dismissDelay);
    };

    return () => {
      toastListener = null;
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-[380px] w-full px-4 sm:px-0 pointer-events-none no-print">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-200 animate-fade-in ${
            toast.type === 'success'
              ? 'bg-white/95 dark:bg-slate-900/95 border-emerald-500/30 text-slate-900 dark:text-slate-100 shadow-emerald-500/10'
              : toast.type === 'error'
              ? 'bg-white/95 dark:bg-slate-900/95 border-rose-500/30 text-slate-900 dark:text-slate-100 shadow-rose-500/10'
              : 'bg-white/95 dark:bg-slate-900/95 border-blue-500/30 text-slate-900 dark:text-slate-100 shadow-blue-500/10'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0 pr-1">
            <h4 className="text-xs font-bold leading-tight text-slate-900 dark:text-slate-100">{toast.title}</h4>
            {toast.message && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{toast.message}</p>}
          </div>

          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
