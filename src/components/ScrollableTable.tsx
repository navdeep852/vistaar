import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  minWidth?: number | string;
  showScrollButtons?: boolean;
}

/**
 * Reusable horizontal scroll container for wide VISTAAR data tables.
 * Prevents page-level overflow, guarantees visible sleek scrollbar,
 * supports touch swipe, trackpad, and keyboard accessibility,
 * and maintains natural column widths.
 */
export const ScrollableTable: React.FC<ScrollableTableProps> = ({
  children,
  className = '',
  containerClassName = '',
  minWidth,
  showScrollButtons = true,
  ...rest
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScrollability();

    const handleScroll = () => checkScrollability();
    el.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => checkScrollability());
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', handleScroll);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleScroll);
    };
  }, [checkScrollability]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(220, Math.floor(el.clientWidth * 0.45));
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`relative w-full max-w-full group ${className}`} {...rest}>
      {/* Left Edge Fade & Scroll Button */}
      {showScrollButtons && canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-2 z-20 flex items-center pr-4 pl-1 bg-gradient-to-r from-white/95 dark:from-slate-900/95 via-white/80 dark:via-slate-900/80 to-transparent pointer-events-none transition-opacity duration-200">
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="pointer-events-auto p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            aria-label="Scroll table left"
            title="Scroll table left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Horizontally Scrollable Container */}
      <div
        ref={scrollRef}
        className={`table-scroll-container w-full max-w-full overflow-x-auto overflow-y-visible ${containerClassName}`}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </div>

      {/* Right Edge Fade & Scroll Button */}
      {showScrollButtons && canScrollRight && (
        <div className="absolute right-0 top-0 bottom-2 z-20 flex items-center pl-4 pr-1 bg-gradient-to-l from-white/95 dark:from-slate-900/95 via-white/80 dark:via-slate-900/80 to-transparent pointer-events-none transition-opacity duration-200">
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="pointer-events-auto p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            aria-label="Scroll table right"
            title="Scroll table right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export const HorizontalScrollTable = ScrollableTable;
export default ScrollableTable;
