import React, { useState, useEffect } from 'react';
import { PieChart, TrendingUp, TrendingDown, DollarSign, Calculator, Scale } from 'lucide-react';
import { store } from '../services/store';

export const ProfitLossView: React.FC = () => {
  const [pl, setPl] = useState({
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
  });

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => setPl(store.calculatePL());
    updateData();
    return store.subscribe(updateData);
  }, []);

  const grossMarginPct = pl.revenue > 0 ? (pl.grossProfit / pl.revenue) * 100 : 0;
  const netMarginPct = pl.revenue > 0 ? (pl.netProfit / pl.revenue) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <PieChart className="w-4 h-4" />
            <span>Financial Statement</span>
          </div>
          <h2 className="text-2xl font-extrabold mt-1">Profit & Loss Statement</h2>
          <p className="text-xs text-slate-400 mt-1">
            Calculated from real transaction data: Gross Profit = Revenue - COGS | Net Profit = Gross Profit - Expenses
          </p>
        </div>
      </div>

      {/* Main P&L Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card p-6 space-y-6 transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 border-b pb-3 border-slate-100 dark:border-slate-800">
          Accounting Statement Breakdown
        </h3>

        <div className="space-y-4 text-sm">
          {/* Revenue */}
          <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100">Total Sales Revenue</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gross revenue from all finalized & issued invoices</p>
            </div>
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              {settings.currency}{pl.revenue.toLocaleString()}
            </span>
          </div>

          {/* COGS */}
          <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100">Cost of Goods Sold (COGS)</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total buy price / procurement cost of sold products</p>
            </div>
            <span className="text-lg font-extrabold text-rose-600 dark:text-rose-400">
              - {settings.currency}{pl.cogs.toLocaleString()}
            </span>
          </div>

          {/* Gross Profit */}
          <div className="flex justify-between items-center p-4 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl font-bold">
            <div>
              <h4 className="text-blue-900 dark:text-blue-200 font-extrabold">Gross Profit</h4>
              <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">Revenue minus Cost of Goods Sold</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-extrabold text-blue-700 dark:text-blue-300">
                {settings.currency}{pl.grossProfit.toLocaleString()}
              </span>
              <span className="block text-[10px] text-blue-600 dark:text-blue-400">{grossMarginPct.toFixed(1)}% Gross Margin</span>
            </div>
          </div>

          {/* Operating Expenses */}
          <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100">Total Operating Expenses</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Rent, electricity, salaries, marketing & overheads</p>
            </div>
            <span className="text-lg font-extrabold text-rose-600 dark:text-rose-400">
              - {settings.currency}{pl.expenses.toLocaleString()}
            </span>
          </div>

          {/* Net Profit */}
          <div
            className={`flex justify-between items-center p-5 rounded-2xl border font-bold ${
              pl.netProfit >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900/80 text-emerald-950 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/80 text-rose-950 dark:text-rose-100'
            }`}
          >
            <div>
              <h3 className="text-lg font-extrabold">Net Profit / (Loss)</h3>
              <p className="text-xs font-medium opacity-80">Gross Profit minus Operating Expenses</p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-black ${pl.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                {settings.currency}{pl.netProfit.toLocaleString()}
              </span>
              <span className="block text-xs font-bold opacity-80">{netMarginPct.toFixed(1)}% Net Margin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
