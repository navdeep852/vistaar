import React, { useRef, useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
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
 * Parses explicit pixel widths or min-widths defined on <th> elements
 * e.g., style={{ width: 140 }} or className="min-w-[150px]"
 */
function extractColWidthsFromThead(thead: React.ReactNode): number[] {
  const widths: number[] = [];
  if (!thead || !React.isValidElement(thead)) return widths;

  let trElement: React.ReactElement<any> | null = null;
  React.Children.forEach((thead as React.ReactElement<any>).props?.children, (child) => {
    if (React.isValidElement(child)) {
      if ((child as any).type === 'tr' || !trElement) {
        trElement = child as React.ReactElement<any>;
      }
    }
  });

  if (!trElement) return widths;

  React.Children.forEach((trElement as React.ReactElement<any>).props?.children, (th) => {
    if (!React.isValidElement(th)) return;
    const thProps = (th as React.ReactElement<any>).props || {};
    const className = thProps.className || '';
    const style = thProps.style || {};

    let w = 0;
    if (style.width && typeof style.width === 'number') w = style.width;
    else if (style.minWidth && typeof style.minWidth === 'number') w = style.minWidth;
    else if (typeof style.width === 'string' && style.width.endsWith('px')) w = parseFloat(style.width);
    else if (typeof style.minWidth === 'string' && style.minWidth.endsWith('px')) w = parseFloat(style.minWidth);

    if (!w) {
      const match = className.match(/(?:min-w|w)-\[(\d+)px\]/);
      if (match && match[1]) {
        w = parseInt(match[1], 10);
      }
    }

    if (!w || isNaN(w)) {
      w = 120; // Default minimum column width
    }

    widths.push(w);
  });

  return widths;
}

/**
 * HeaderScrollableTable
 * 
 * Implements a synchronized table layout where a dedicated horizontal scrollbar
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
 * Full Real-Time Synchronization:
 * - Header viewport, Top scrollbar, and Body viewport share exact total width and colgroup widths.
 * - Both tables use table-layout: fixed to guarantee 0.0px column drift between header & body.
 * - Synchronous active lock prevents infinite loops while guaranteeing real-time response.
 * - Full accessibility: mouse drag, trackpad, touch swipe, keyboard (ArrowLeft/ArrowRight/Home/End).
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
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const headerTableRef = useRef<HTMLTableElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);
  const bodyTableRef = useRef<HTMLTableElement | null>(null);

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

  // Base widths extracted from JSX definitions
  const baseWidths = useMemo(() => {
    return extractColWidthsFromThead(theadContent);
  }, [theadContent]);

  const [colWidths, setColWidths] = useState<number[]>(baseWidths);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Active sync lock to prevent recursive loop
  const activeSourceRef = useRef<'scrollbar' | 'body' | 'header' | null>(null);
  const isSyncingRef = useRef(false);

  // Parse specified min-width prop
  const parsedMinWidth = typeof minWidth === 'number'
    ? minWidth
    : (typeof minWidth === 'string' && minWidth.endsWith('px') ? parseFloat(minWidth) : 0);

  // Sum of column widths
  const sumColWidths = useMemo(() => {
    return colWidths.reduce((sum, w) => sum + w, 0);
  }, [colWidths]);

  // Adjust column widths if container is wider than the sum, so table naturally fills 100%
  const finalColWidths = useMemo(() => {
    if (colWidths.length === 0) return [];
    if (containerWidth <= sumColWidths || sumColWidths === 0) {
      return colWidths;
    }
    const ratio = containerWidth / sumColWidths;
    let distributed = 0;
    return colWidths.map((w, idx) => {
      if (idx === colWidths.length - 1) {
        return Math.max(w, containerWidth - distributed);
      }
      const newW = Math.round(w * ratio);
      distributed += newW;
      return newW;
    });
  }, [colWidths, containerWidth, sumColWidths]);

  const effectiveColWidths = finalColWidths.length > 0 ? finalColWidths : baseWidths;
  const effectiveTotalWidth = Math.max(
    parsedMinWidth,
    effectiveColWidths.reduce((s, w) => s + w, 0),
    containerWidth
  );

  // Measure rendered cell widths and container dimensions
  const measureColumns = useCallback(() => {
    const rootEl = rootContainerRef.current || bodyContainerRef.current;
    if (rootEl) {
      const cw = rootEl.clientWidth;
      if (cw > 0 && Math.abs(cw - containerWidth) > 1) {
        setContainerWidth(cw);
      }
    }

    if (!headerTableRef.current) return;

    const thEls = headerTableRef.current.querySelectorAll('thead tr:first-child > th, thead tr:first-child > td');
    if (thEls.length === 0) return;

    const bodyFirstRowTds = bodyTableRef.current?.querySelectorAll('tbody tr:first-child > td');

    const nextWidths: number[] = [];
    thEls.forEach((th, idx) => {
      const baseW = baseWidths[idx] || 110;
      let naturalThWidth = 0;
      let naturalTdWidth = 0;

      // Measure header cell
      const thRect = (th as HTMLElement).getBoundingClientRect();
      naturalThWidth = Math.round(thRect.width);

      // Measure body cell if single cell without colSpan
      if (bodyFirstRowTds && bodyFirstRowTds[idx]) {
        const td = bodyFirstRowTds[idx] as HTMLTableCellElement;
        if (!td.colSpan || td.colSpan === 1) {
          const tdRect = td.getBoundingClientRect();
          naturalTdWidth = Math.round(tdRect.width);
        }
      }

      nextWidths.push(Math.max(baseW, naturalThWidth, naturalTdWidth));
    });

    if (nextWidths.length > 0) {
      setColWidths((prev) => {
        if (
          prev.length === nextWidths.length &&
          prev.every((w, i) => Math.abs(w - nextWidths[i]) < 1)
        ) {
          return prev;
        }
        return nextWidths;
      });
    }

    // Update scroll button affordances
    const scrollEl = bodyContainerRef.current || scrollbarTrackRef.current;
    if (scrollEl) {
      const sl = scrollEl.scrollLeft;
      const sw = scrollEl.scrollWidth;
      const cw = scrollEl.clientWidth;
      setCanScrollLeft(sl > 4);
      setCanScrollRight(sl + cw < sw - 4);
    }
  }, [baseWidths, containerWidth]);

  useLayoutEffect(() => {
    measureColumns();
  }, [measureColumns, children]);

  useEffect(() => {
    const rootEl = rootContainerRef.current;
    if (!rootEl) return;

    measureColumns();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureColumns();
      });
      resizeObserver.observe(rootEl);
      if (headerTableRef.current) resizeObserver.observe(headerTableRef.current);
      if (bodyTableRef.current) resizeObserver.observe(bodyTableRef.current);
    }

    const handleWindowResize = () => measureColumns();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [measureColumns]);

  // Synchronous, non-recursive horizontal scroll coordinator
  const syncScroll = useCallback((source: 'scrollbar' | 'body' | 'header') => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    activeSourceRef.current = source;

    const scrollbarEl = scrollbarTrackRef.current;
    const bodyEl = bodyContainerRef.current;
    const headerEl = headerContainerRef.current;

    let sl = 0;
    if (source === 'scrollbar' && scrollbarEl) {
      sl = scrollbarEl.scrollLeft;
    } else if (source === 'body' && bodyEl) {
      sl = bodyEl.scrollLeft;
    } else if (source === 'header' && headerEl) {
      sl = headerEl.scrollLeft;
    }

    // Synchronously update the other containers
    if (source !== 'scrollbar' && scrollbarEl && Math.abs(scrollbarEl.scrollLeft - sl) > 0.5) {
      scrollbarEl.scrollLeft = sl;
    }
    if (source !== 'body' && bodyEl && Math.abs(bodyEl.scrollLeft - sl) > 0.5) {
      bodyEl.scrollLeft = sl;
    }
    if (source !== 'header' && headerEl && Math.abs(headerEl.scrollLeft - sl) > 0.5) {
      headerEl.scrollLeft = sl;
    }

    setCanScrollLeft(sl > 4);
    const sw = bodyEl?.scrollWidth || scrollbarEl?.scrollWidth || effectiveTotalWidth;
    const cw = bodyEl?.clientWidth || scrollbarEl?.clientWidth || 0;
    setCanScrollRight(sl + cw < sw - 4);

    isSyncingRef.current = false;
    activeSourceRef.current = null;
  }, [effectiveTotalWidth]);

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
    const step = 60;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      el.scrollLeft = Math.max(0, el.scrollLeft - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      el.scrollLeft = Math.min(effectiveTotalWidth, el.scrollLeft + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      el.scrollLeft = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      el.scrollLeft = effectiveTotalWidth;
    }
  };

  // Render colgroup with pixel-exact column widths
  const renderColGroup = () => {
    if (effectiveColWidths.length === 0) return null;
    return (
      <colgroup>
        {effectiveColWidths.map((w, idx) => (
          <col key={idx} style={{ width: `${w}px`, minWidth: `${w}px` }} />
        ))}
      </colgroup>
    );
  };

  return (
    <div
      ref={rootContainerRef}
      className={`relative w-full max-w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group ${className}`}
      {...rest}
    >
      {/* 1. TABLE HEADER ROW VIEWPORT (Positioned directly above the horizontal scrollbar) */}
      {theadContent && (
        <div
          ref={headerContainerRef}
          onScroll={() => syncScroll('header')}
          className="w-full max-w-full overflow-x-auto overflow-y-hidden select-none bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 no-scrollbar"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <table
            ref={headerTableRef}
            className={`w-full text-left border-collapse ${tableProps.className || ''}`}
            style={{
              width: `${effectiveTotalWidth}px`,
              minWidth: `${effectiveTotalWidth}px`,
              tableLayout: 'fixed',
            }}
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
          aria-valuemax={Math.max(0, effectiveTotalWidth - (bodyContainerRef.current?.clientWidth || 0))}
          onScroll={() => syncScroll('scrollbar')}
          onKeyDown={handleScrollbarKeyDown}
          className="header-table-scrollbar w-full overflow-x-auto overflow-y-hidden cursor-ew-resize focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          style={{
            height: `${scrollbarHeight}px`,
          }}
        >
          {/* Virtual spacer matching exact total width */}
          <div
            style={{
              width: `${effectiveTotalWidth}px`,
              minWidth: `${effectiveTotalWidth}px`,
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
        onScroll={() => syncScroll('body')}
        className={`w-full max-w-full overflow-x-auto overflow-y-visible no-scrollbar ${containerClassName}`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <table
          ref={bodyTableRef}
          className={`w-full text-left border-collapse ${tableProps.className || ''}`}
          style={{
            width: `${effectiveTotalWidth}px`,
            minWidth: `${effectiveTotalWidth}px`,
            tableLayout: 'fixed',
          }}
        >
          {renderColGroup()}
          {tbodyContent}
        </table>
      </div>
    </div>
  );
};

export default HeaderScrollableTable;
