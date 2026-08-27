import React, { useState, useEffect } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { store } from '../services/store';
import { Feedback } from '../types';

export const FeedbackView: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);

  useEffect(() => {
    const updateData = () => setFeedbacks(store.getFeedbacks());
    updateData();
    return store.subscribe(updateData);
  }, []);

  const avgRating =
    feedbacks.length > 0
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
      : '5.0';

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex items-center justify-between transition-colors">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Customer Feedback & Reviews</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Track client satisfaction ratings</p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/60 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-900/60">
          <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          <span className="text-xl font-extrabold text-amber-900 dark:text-amber-200">{avgRating} / 5.0</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {feedbacks.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            No feedback entries recorded yet.
          </div>
        ) : (
          feedbacks.map((f) => (
            <div key={f.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-2 transition-colors">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{f.customerName}</h4>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < f.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200 dark:text-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{f.comment}"</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(f.date).toLocaleDateString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
