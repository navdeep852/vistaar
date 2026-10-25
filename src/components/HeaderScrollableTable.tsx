import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface HeaderScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  minWidth?: number | string;
  showScrollButtons?: boolean;
  scrollbarHeight?: number;
}

/**
 * HeaderScrollableTable
 * 
 * Implements a specialized table layout where the horizontal scrollbar
 * is visually and functionally positioned DIRECTLY BELOW the table header row
 * and ABOVE the scrollable data rows.
 * 
 * Visual Layout:
 * [ Table Title, Search, Filters, Actions ] (outside)
 * ─────────────────────────────────────────
 * [ Table Header Row ]                      (Header Viewport)
 * ═════════════════════════════════════════
 * [ ── Dedicated Horizontal Scrollbar ── ]  (Top Scroll Track)
 * ─────────────────────────────────────────
 * [ Scrollable Data Rows ]                  (Body Viewport)
 * ─────────────────────────────────────────
 * 
 * Synchronized Bidirectionally:
 * - Scrolling the top scrollbar smoothly scrolls the data columns and header.
 * - Scrolling the data container (mouse wheel, trackpad, touch swipe) scrolls the top scrollbar and header.
 * - Active scroll lock prevents infinite synchronization loops.
 * - Measured column widths ensure sub-pixel alignment between header and data rows.
 */
export const HeaderScrollableTable: React.FC<HeaderScrollableTableProps> = ({
  children,
  header: explicitHeader,
  className = '',
  containerClassName = '',
  minWidth = '1100px',
  showScrollButtons = true,
  scrollbarHeight = 12,
  ...rest
}) => {
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);
  const bodyTableRef = useRef<HTMLTableElement | null>(null);

  const [colWidths, setColWidths] = useState<number[]>([]);
  const [scrollWidth, setScrollWidth] = useState<number>(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Active source lock to prevent feedback loops during scroll synchronization
  const activeSourceRef = useRef<'scrollbar' | 'body' | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Extract thead, tbody, and table props if children is a <table> element
  let tableProps: any = {};
  let extractedThead: React.ReactNode = null;
  let extractedTbody: React.ReactNode = null;

  if (React.isValidElement(children) && (children as React.ReactElement<any>).type === 'table') {
    const tableEl = children as React.ReactElement<any>;
    tableProps = tableEl.props || {};
    React.Children.forEach(tableEl.props.children, (child) => {
      if (React.isValidElement(child)) {
        if ((child as React.ReactElement<any>).type === 'thead') {
          extractedThead = child;
        } else if ((child as React.ReactElement<any>).type === 'tbody') {
          extractedTbody = child;
        }
      }
    });
  }

  const theadContent = explicitHeader || extractedThead;
  const tbodyContent = extractedTbody || children;

  // Measure and align column widths from the rendered body table
  const measureColumns = useCallback(() => {
    if (!bodyTableRef.current || !bodyContainerRef.current) return;

    // Measure widths of header cells or first row cells
    const headerCells = bodyTableRef.current.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
    const firstRowCells = bodyTableRef.current.querySelectorAll('tbody tr:first-child td');

    const targetCells = headerCells.length > 0 ? headerCells : firstRowCells;
    if (targetCells.length > 0) {
      const widths = Array.from(targetCells).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return Math.round(rect.width * 100) / 100;
      });

      if (widths.length > 0) {
        setColWidths((prev) => {
          if (prev.length === widths.length && prev.every((w, i) => Math.abs(w - widths[i]) < 0.5)) {
            return prev;
          }
          return widths;
        });
      }
    }

    const sw = bodyContainerRef.current.scrollWidth;
    const cw = bodyContainerRef.current.clientWidth;
    setScrollWidth(sw);

    const sl = bodyContainerRef.current.scrollLeft;
    setCanScrollLeft(sl > 4);
    setCanScrollRight(sl + cw < sw - 4);
  }, []);

  useLayoutEffect(() => {
    measureColumns();
  }, [measureColumns, children]);

  useEffect(() => {
    const bodyEl = bodyContainerRef.current;
    if (!bodyEl) return;

    measureColumns();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureColumns();
      });
      resizeObserver.observe(bodyEl);
      if (bodyTableRef.current) {
        resizeObserver.observe(bodyTableRef.current);
      }
    }

    const handleWindowResize = () => measureColumns();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [measureColumns]);

  // Handle Top Scrollbar -> Body & Header sync
  const handleScrollbarScroll = () => {
    if (activeSourceRef.current && activeSourceRef.current !== 'scrollbar') return;
    activeSourceRef.current = 'scrollbar';

    const sl = scrollbarTrackRef.current?.scrollLeft ?? 0;

    if (bodyContainerRef.current && Math.abs(bodyContainerRef.current.scrollLeft - sl) > 0.5) {
      bodyContainerRef.current.scrollLeft = sl;
    }
    if (headerContainerRef.current && Math.abs(headerContainerRef.current.scrollLeft - sl) > 0.5) {
      headerContainerRef.current.scrollLeft = sl;
    }

    const sw = scrollbarTrackRef.current?.scrollWidth ?? scrollWidth;
    const cw = scrollbarTrackRef.current?.clientWidth ?? 0;
    setCanScrollLeft(sl > 4);
    setCanScrollRight(sl + cw < sw - 4);

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      activeSourceRef.current = null;
    });
  };

  // Handle Body Container -> Top Scrollbar & Header sync
  const handleBodyScroll = () => {
    if (activeSourceRef.current && activeSourceRef.current !== 'body') return;
    activeSourceRef.current = 'body';

    const sl = bodyContainerRef.current?.scrollLeft ?? 0;

    if (scrollbarTrackRef.current && Math.abs(scrollbarTrackRef.current.scrollLeft - sl) > 0.5) {
      scrollbarTrackRef.current.scrollLeft = sl;
    }
    if (headerContainerRef.current && Math.abs(headerContainerRef.current.scrollLeft - sl) > 0.5) {
      headerContainerRef.current.scrollLeft = sl;
    }

    const sw = bodyContainerRef.current?.scrollWidth ?? scrollWidth;
    const cw = bodyContainerRef.current?.clientWidth ?? 0;
    setCanScrollLeft(sl > 4);
    setCanScrollRight(sl + cw < sw - 4);

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      activeSourceRef.current = null;
    });
  };

  const handleScrollButton = (direction: 'left' | 'right') => {
    const el = bodyContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(220, Math.floor(el.clientWidth * 0.45));
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Keyboard navigation for top scrollbar
  const handleScrollbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollbarTrackRef.current;
    if (!el) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      el.scrollLeft = Math.max(0, el.scrollLeft - 40);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      el.scrollLeft = Math.min(scrollWidth, el.scrollLeft + 40);
    } else if (e.key === 'Home') {
      e.preventDefault();
      el.scrollLeft = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      el.scrollLeft = scrollWidth;
    }
  };

  const tableMinWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;

  // Render colgroup with calculated or natural column widths
  const renderColGroup = () => {
    if (colWidths.length === 0) return null;
    return (
      <colgroup>
        {colWidths.map((w, idx) => (
          <col key={idx} style={{ width: `${w}px`, minWidth: `${w}px` }} />
        ))}
      </colgroup>
    );
  };

  return (
    <div
      className={`relative w-full max-w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group ${className}`}
      {...rest}
    >
      {/* 1. TABLE HEADER ROW VIEWPORT (Positioned above the horizontal scrollbar) */}
      {theadContent && (
        <div
          ref={headerContainerRef}
          className="w-full max-w-full overflow-hidden select-none bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800"
          style={{ scrollbarWidth: 'none' }}
        >
          <table
            className={`w-full text-left border-collapse ${tableProps.className || ''}`}
            style={{ minWidth: tableMinWidth }}
          >
            {renderColGroup()}
            {theadContent}
          </table>
        </div>
      )}

      {/* 2. DEDICATED HORIZONTAL SCROLLBAR (Positioned directly below the header row and above data rows) */}
      <div
        className="relative w-full bg-slate-100/90 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 py-1 px-1 flex items-center transition-colors"
        style={{ zIndex: 10 }}
      >
        {/* Left Scroll Button */}
        {showScrollButtons && canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScrollButton('left')}
            className="shrink-0 mr-1 p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 shadow-xs cursor-pointer transition-all"
            aria-label="Scroll left"
            title="Scroll table left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Scrollbar Track Container */}
        <div
          ref={scrollbarTrackRef}
          tabIndex={0}
          role="scrollbar"
          aria-label="Horizontal table scrollbar positioned below headers"
          aria-valuenow={scrollbarTrackRef.current?.scrollLeft || 0}
          aria-valuemin={0}
          aria-valuemax={scrollWidth}
          onScroll={handleScrollbarScroll}
          onKeyDown={handleScrollbarKeyDown}
          className="header-table-scrollbar w-full overflow-x-auto overflow-y-hidden cursor-ew-resize focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          style={{
            height: `${scrollbarHeight}px`,
          }}
        >
          {/* Virtual spacer matching exact scrollWidth of table data columns */}
          <div
            style={{
              width: `${Math.max(scrollWidth, 1)}px`,
              height: '1px',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Right Scroll Button */}
        {showScrollButtons && canScrollRight && (
          <button
            type="button"
            onClick={() => handleScrollButton('right')}
            className="shrink-0 ml-1 p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 shadow-xs cursor-pointer transition-all"
            aria-label="Scroll right"
            title="Scroll table right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 3. SCROLLABLE DATA ROWS VIEWPORT (Positioned below the scrollbar) */}
      <div
        ref={bodyContainerRef}
        onScroll={handleBodyScroll}
        className={`w-full max-w-full overflow-x-auto overflow-y-visible ${containerClassName}`}
        style={{
          minWidth: undefined,
          // Hide redundant bottom native scrollbar in favor of the header-adjacent scrollbar
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <table
          ref={bodyTableRef}
          className={`w-full text-left border-collapse ${tableProps.className || ''}`}
          style={{ minWidth: tableMinWidth }}
        >
          {renderColGroup()}

          {/* Invisible mirror header: preserves natural browser column width calculations */}
          {theadContent && (
            <thead className="invisible h-0 overflow-hidden pointer-events-none" aria-hidden="true">
              {React.cloneElement(theadContent as React.ReactElement<any>, {
                className: 'invisible h-0 p-0 m-0 border-0',
                children: React.Children.map(
                  (theadContent as React.ReactElement<any>).props?.children,
                  (tr: any) =>
                    React.isValidElement(tr)
                      ? React.cloneElement(tr as React.ReactElement<any>, {
                          className: 'invisible h-0 p-0 m-0 border-0',
                          children: React.Children.map(
                            (tr as React.ReactElement<any>).props?.children,
                            (th: any) =>
                              React.isValidElement(th)
                                ? React.cloneElement(th as React.ReactElement<any>, {
                                    className: `${(th as any).props?.className || ''} !h-0 !py-0 !border-0 invisible`,
                                    style: {
                                      ...((th as any).props?.style || {}),
                                      height: 0,
                                      paddingTop: 0,
                                      paddingBottom: 0,
                                      borderTop: 0,
                                      borderBottom: 0,
                                      lineHeight: 0,
                                    },
                                  })
                                : th
                          ),
                        })
                      : tr
                ),
              })}
            </thead>
          )}

          {tbodyContent}
        </table>
      </div>
    </div>
  );
};

export default HeaderScrollableTable;
