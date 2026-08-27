import React, { useState, useEffect } from 'react';
import { Tag, Plus, CheckCircle, XCircle } from 'lucide-react';
import { store } from '../services/store';
import { Offer } from '../types';

export const OffersView: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    const updateData = () => setOffers(store.getOffers());
    updateData();
    return store.subscribe(updateData);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex justify-between items-center transition-colors">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Promotions & Offer Campaigns</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Configure discount codes and minimum order values</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {offers.map((o) => (
          <div key={o.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-3 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase">
                  CODE: {o.code}
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-2">{o.name}</h4>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                {o.status}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">{o.description}</p>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span>Discount: {o.discountValue}{o.discountType === 'Percentage' ? '%' : ' OFF'}</span>
              <span>Min Order: ₹{o.minimumOrder}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
