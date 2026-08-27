import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Receipt, FileText, Package } from 'lucide-react';
import { store } from '../services/store';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState({
    invoicesCount: 0,
    quotationsCount: 0,
    customersCount: 0,
    productsCount: 0,
  });

  const settings = store.getSettings();
  const pl = store.calculatePL();

  useEffect(() => {
    const updateData = () => {
      setData({
        invoicesCount: store.getInvoices().length,
        quotationsCount: store.getQuotations().length,
        customersCount: store.getCustomers().length,
        productsCount: store.getProducts().length,
      });
    };
    updateData();
    return store.subscribe(updateData);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Analytics & Business Reports</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Live aggregated metrics from database records</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Total Sales Invoices</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.invoicesCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Quotations Issued</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.quotationsCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Client Base</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.customersCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Net Profit Margin</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
            {pl.revenue > 0 ? ((pl.netProfit / pl.revenue) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
      </div>
    </div>
  );
};
