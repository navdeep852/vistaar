# VISTAAR Dashboard Charts Redesign — Power BI Visuals

## Overview
This document outlines the presentation-layer redesign of the VISTAAR Business OS Dashboard and shared analytics visual components to match the aesthetic, typography, color palettes, and interaction patterns of **Microsoft Power BI**.

---

## 1. Files Added & Modified

### Files Added
- `src/components/charts/theme.ts`: Power BI classic series palette (`#118DFF`, `#12239E`, `#E66C37`, `#6B007B`, `#E044A7`, `#744EC2`, `#D9B300`, `#D64550`), semantic status colors, light/dark gridlines, font tokens, and compact/full Indian numbering formatters (`formatCompactInr`, `formatFullInr`, `formatCompactCount`).
- `src/components/charts/ChartCard.tsx`: Standard Power BI visual container featuring header, subtitle, status badges, loading skeleton, empty state, "..." context menu with **Export as PNG** and **Show as a table** (accessible data table modal).
- `src/components/charts/PbiTooltip.tsx`: Custom hover card with series indicator, title, full currency/count values, and dynamic % of total share.
- `src/components/charts/PbiLegend.tsx`: Interactive legend with hover-dimming (opacity: 0.35 on unhovered series) and click-to-filter toggles.
- `src/components/charts/PbiSlicerBar.tsx`: Power BI-style slicer toolbar driving reporting period presets (Today, 7D, 30D, Last Month, Custom) with IST date ranges and refresh triggers.
- `src/components/charts/KpiCard.tsx`: Power BI Card visual with micro-area sparkline, bold primary metric, period delta badges (▲ green / ▼ red), and comparison subtitles.
- `src/components/charts/SalesTrendComboChart.tsx`: Combo chart with clustered columns for sales, smooth moving average line with area fill gradient, peak sales annotation callout, dashed average reference line, and responsive brush/zoom slider.
- `src/components/charts/ChannelDonutChart.tsx`: Donut visual with centered total callout, right-aligned legend with percentage shares, click-to-filter channel cross-filtering, and toggle to 100% daily stacked columns.
- `src/components/charts/ReceivablesAgingChart.tsx`: Receivables aging columns with 4-stage color ramp (green -> yellow -> orange -> red), total outstanding banner card, and direct column data labels.
- `src/components/charts/TopProductsBarChart.tsx`: Ranked horizontal bar chart with top-5 descending sort, Sales Value / Quantity sold toggle, and Treemap visual mode toggle.
- `src/components/charts/InventoryHealthGauge.tsx`: Semi-circle inventory health distribution gauge and critical stock attention table with conditional formatting badges.
- `src/components/charts/ProfitabilityWaterfallChart.tsx`: Multi-stage financial waterfall visual (Revenue -> -COGS -> Gross Profit -> -Operating Expenses -> Net Profit) using stacked transparent base bars and margin KPI badges.
- `src/components/charts/QuotationFunnelChart.tsx`: Pipeline conversion funnel chart (Created -> Sent -> Accepted -> Converted) with conversion ratios between consecutive stages.
- `src/components/charts/ExpenseAnalysisChart.tsx`: Donut visual + ranked horizontal category breakdown with percentage shares.
- `src/components/charts/ExecutiveSummaryCards.tsx`: Qualitative executive insight cards with colored status accent left borders (green / amber / red) and icons.
- `src/components/charts/index.ts`: Barrel export for all chart components.
- `docs/backups/DashboardView.original.tsx`: Backup of original dashboard view before redesign.
- `docs/backups/AnalyticsCharts.original.tsx`: Backup of original analytics chart components before redesign.

### Files Modified
- `src/views/DashboardView.tsx`: Redesigned with Power BI 12-column responsive layout, top slicer bar, single cross-filtering state (`selectedChannel`, `selectedProduct`, `selectedAgingBracket`), and integration with newly created visual components.
- `src/components/analytics/AnalyticsCharts.tsx`: Updated to wrap and forward props to the new `src/components/charts/` components, preserving backwards compatibility for other views.
- `package.json` / `package-lock.json`: Added `recharts` dependency.

---

## 2. Chart-to-Visual Mapping

| # | Previous Visual | New Power BI Visual Component | Key Features & Enhancements |
|---|---|---|---|
| 1 | Flat KPI Cards (Total Sales, Collections, Gross Profit, Udhari) | `KpiCard.tsx` | Big bold metric, delta badge (▲/▼), micro-area sparkline, IST date period context |
| 2 | Hand-rolled SVG Weekly Sales Line | `SalesTrendComboChart.tsx` | Clustered bars + smooth moving average line, area fill, peak annotation callout, dashed reference line, brush/zoom slider |
| 3 | CSS Progress Bars for Channel | `ChannelDonutChart.tsx` | Donut chart with centered total, right legend with % share, click cross-filtering, 100% daily stacked view |
| 4 | Aging Progress Bars | `ReceivablesAgingChart.tsx` | Clustered columns with green->yellow->orange->red ramp, data labels, total card |
| 5 | Simple Product Bar List | `TopProductsBarChart.tsx` | Horizontal ranked bars (top 5), Value/Quantity switch, Treemap visual toggle |
| 6 | Stock Metric Count Cards | `InventoryHealthGauge.tsx` | Semi-circle gauge + critical attention items table with conditional formatting |
| 7 | Metric Badges | `ProfitabilityWaterfallChart.tsx` | Financial waterfall (Revenue, COGS, Gross Profit, OpEx, Net Profit) + margin badge |
| 8 | Funnel Percent List | `QuotationFunnelChart.tsx` | Funnel visual showing drop-off and conversion rates across 4 stages |
| 9 | Expense List | `ExpenseAnalysisChart.tsx` | Donut chart + ranked horizontal category bars with % shares |
| 10 | Insight Cards | `ExecutiveSummaryCards.tsx` | Power BI insight cards with green/amber/red left border accents |

---

## 3. Assumptions & Architectural Guarantees
1. **Zero Calculation Alterations**: All calculations, formulas, and data providers (`salesAnalyticsService`, `enterpriseAnalyticsService`, `udhariService`, `quotationService`, `productService`) remain unchanged and authoritative.
2. **Theme Compatibility**: High-contrast, clean Power BI visuals using Tailwind `dark:` variants and CSS variables (`text-slate-900 dark:text-slate-100`, `border-slate-200/80 dark:border-slate-800`).
3. **Cross-Filtering**: Clicking any channel, product, or aging bucket applies a cross-filter across the visuals and displays an active filter banner with a "Clear filter" button.
4. **Export & Inspection**: Every `ChartCard` provides Power BI's "..." menu with instant PNG visual export and "Show as a table" underlying dataset modal.
5. **Responsiveness**: Mobile (360px) to desktop 4K layout using flexible CSS grid (`grid-cols-1 md:grid-cols-12`) without horizontal overflow.

---

## 4. Verification Results
- `npx tsc -b`: **PASS** (0 errors)
- `npm run build`: **PASS** (Vite production bundle compiled with 0 errors)
- Acceptance Test Suite (`scripts/test_root_inventory_synchronization.ts`): **24 PASSED, 0 FAILED**
