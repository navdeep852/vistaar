import React, { useState, useEffect } from 'react';
import { Search, Heart, Sparkles, Check, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { DocumentTemplate, TemplateCategory, DocumentType } from '../types/template';
import { INVOICE_TEMPLATES } from '../templates/invoiceTemplates';
import { QUOTATION_TEMPLATES } from '../templates/quotationTemplates';

interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentType;
  currentTemplateId?: string;
  onSelectTemplate: (templateId: string) => void;
}

export const TemplateGalleryModal: React.FC<TemplateGalleryModalProps> = ({
  isOpen,
  onClose,
  documentType,
  currentTemplateId,
  onSelectTemplate,
}) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vistaar_favorite_templates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem('vistaar_favorite_templates', JSON.stringify(next));
      return next;
    });
  };

  const templates: DocumentTemplate[] =
    documentType === 'invoice' ? INVOICE_TEMPLATES : QUOTATION_TEMPLATES;

  const categories: (TemplateCategory | 'Favorites')[] = [
    'All',
    'Favorites',
    'Minimal',
    'Corporate',
    'Modern',
    'Classic',
    'Creative',
    'Retail',
    'Service',
    'Premium',
  ];

  const lastUsedId = localStorage.getItem(`vistaar_last_used_${documentType}`);
  const lastUsedTemplate = templates.find((t) => t.id === lastUsedId);

  const handleSelect = (id: string) => {
    localStorage.setItem(`vistaar_last_used_${documentType}`, id);
    onSelectTemplate(id);
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.style.toLowerCase().includes(search.toLowerCase());

    const isFav = favorites.includes(t.id);
    const matchesCat =
      activeCategory === 'All'
        ? true
        : activeCategory === 'Favorites'
        ? isFav
        : t.category === activeCategory;

    return matchesSearch && matchesCat;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={documentType === 'invoice' ? 'Choose an Invoice Template' : 'Choose a Quotation Template'}
      subtitle="Select from 10+ professional business document layouts. Switch anytime without data loss!"
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* Continue with Last Used Template Banner */}
        {lastUsedTemplate && currentTemplateId !== lastUsedTemplate.id && (
          <div className="p-4 bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
                style={{ backgroundColor: lastUsedTemplate.previewColor }}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-300 tracking-wider">
                  Quick Continue — Last Used Template
                </span>
                <h4 className="text-sm font-bold">{lastUsedTemplate.name}</h4>
              </div>
            </div>

            <button
              onClick={() => handleSelect(lastUsedTemplate.id)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition-colors shadow-md"
            >
              <span>Use {lastUsedTemplate.name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search & Category Filter Chips */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${documentType} templates...`}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat === 'Favorites' ? `♥ Favorites (${favorites.length})` : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filteredTemplates.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              No templates found matching your search criteria.
            </div>
          ) : (
            filteredTemplates.map((t) => {
              const isFav = favorites.includes(t.id);
              const isSelected = currentTemplateId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelect(t.id)}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all cursor-pointer overflow-hidden shadow-card hover:shadow-xl flex flex-col justify-between group relative ${
                    isSelected ? 'border-2 border-blue-600 ring-4 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Active Selected Badge */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 z-10 bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 shadow-md">
                      <Check className="w-3 h-3" />
                      <span>CURRENTLY SELECTED</span>
                    </div>
                  )}

                  {/* Card Header Preview Area */}
                  <div
                    className="h-36 p-4 flex flex-col justify-between relative transition-transform duration-200 group-hover:scale-[1.01]"
                    style={{ backgroundColor: t.previewColor }}
                  >
                    <div className="flex justify-between items-start">
                      {!isSelected && (
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-white/20 backdrop-blur-md text-white">
                          {t.badgeText || t.category}
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(t.id);
                        }}
                        className={`p-1.5 rounded-full transition-colors ml-auto ${
                          isFav ? 'bg-rose-500 text-white' : 'bg-black/30 text-white/80 hover:bg-black/50'
                        }`}
                        title="Toggle Favorite"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
                      </button>
                    </div>

                    {/* Visual Realistic Sample Data A4 Mock Card */}
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 rounded-lg shadow-md border border-white/40 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-[9px]">
                      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1 font-bold">
                        <span>VISTAAR CORP</span>
                        <span className="text-blue-600 dark:text-blue-400">{t.type === 'invoice' ? 'INV-2026' : 'QT-2026'}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[8px] text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>Item x 2</span>
                          <span className="font-bold">₹1,999</span>
                        </div>
                        <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-0.5 border-t border-slate-100 dark:border-slate-800">
                          <span>TOTAL</span>
                          <span>₹2,358</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{t.name}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{t.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">{t.style}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(t.id);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-xs ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Use Template'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
