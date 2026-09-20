import React from 'react';
import {
  TrendDataPoint,
  ChannelDataPoint,
  AgingBucket,
  ProductPerformanceItem,
  ProfitabilityDataPoint,
  InventoryHealthMetrics,
  QuotationFunnelStage,
  ExpenseCategoryBreakdown,
} from '../../services/supabase/enterpriseAnalyticsService';
import {
  SalesTrendComboChart,
  ChannelDonutChart,
  ReceivablesAgingChart as PbiReceivablesAgingChart,
  TopProductsBarChart,
  InventoryHealthGauge,
  ProfitabilityWaterfallChart,
  QuotationFunnelChart as PbiQuotationFunnelChart,
  ExpenseAnalysisChart as PbiExpenseAnalysisChart,
} from '../charts';

// =========================================================================
// 1. SALES TREND COMBO CHART (Power BI Combo Chart)
// =========================================================================
interface SalesTrendChartProps {
  points: TrendDataPoint[];
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
  totalSales: number;
  peakSales: number;
  peakLabel: string;
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({
  points,
  granularity,
  totalSales,
  peakSales,
  peakLabel,
}) => {
  return (
    <SalesTrendComboChart
      points={points}
      granularity={granularity}
      totalSales={totalSales}
      peakSales={peakSales}
      peakLabel={peakLabel}
    />
  );
};

// =========================================================================
// 2. SALES CHANNEL DONUT & STACKED BAR (Power BI Channel Breakdown)
// =========================================================================
interface SalesChannelChartProps {
  totalInvoiceSales: number;
  totalCounterSales: number;
  invoicePercentage: number;
  counterPercentage: number;
  points: ChannelDataPoint[];
  onDrillDown?: (channel: string) => void;
}

export const SalesChannelChart: React.FC<SalesChannelChartProps> = ({
  totalInvoiceSales,
  totalCounterSales,
  invoicePercentage,
  counterPercentage,
  points,
  onDrillDown,
}) => {
  return (
    <ChannelDonutChart
      totalInvoiceSales={totalInvoiceSales}
      totalCounterSales={totalCounterSales}
      invoicePercentage={invoicePercentage}
      counterPercentage={counterPercentage}
      points={points}
      onDrillDown={onDrillDown}
    />
  );
};

// =========================================================================
// 3. RECEIVABLES AGING CHART (Power BI Color Ramp Column Chart)
// =========================================================================
interface ReceivablesAgingChartProps {
  totalOutstanding: number;
  overdueAmount: number;
  buckets: AgingBucket[];
  onDrillDown?: () => void;
}

export const ReceivablesAgingChart: React.FC<ReceivablesAgingChartProps> = ({
  totalOutstanding,
  overdueAmount,
  buckets,
  onDrillDown,
}) => {
  return (
    <PbiReceivablesAgingChart
      totalOutstanding={totalOutstanding}
      overdueAmount={overdueAmount}
      buckets={buckets}
      onDrillDown={onDrillDown}
    />
  );
};

// =========================================================================
// 4. TOP PRODUCTS BAR CHART (Power BI Horizontal Ranked Bars + Treemap)
// =========================================================================
interface TopProductsChartProps {
  byValue: ProductPerformanceItem[];
  byQuantity: ProductPerformanceItem[];
  onDrillDown?: () => void;
}

export const TopProductsChart: React.FC<TopProductsChartProps> = ({
  byValue,
  byQuantity,
  onDrillDown,
}) => {
  return (
    <TopProductsBarChart
      byValue={byValue}
      byQuantity={byQuantity}
      onDrillDown={onDrillDown}
    />
  );
};

// =========================================================================
// 5. INVENTORY HEALTH GAUGE (Power BI Semi-Circle Gauge + Attention Items)
// =========================================================================
interface InventoryHealthChartProps {
  metrics: InventoryHealthMetrics;
  onDrillDown?: () => void;
}

export const InventoryHealthChart: React.FC<InventoryHealthChartProps> = ({
  metrics,
  onDrillDown,
}) => {
  return (
    <InventoryHealthGauge
      metrics={metrics}
      onDrillDown={onDrillDown}
    />
  );
};

// =========================================================================
// 6. PROFITABILITY WATERFALL CHART (Power BI Waterfall Walk)
// =========================================================================
interface ProfitabilityChartProps {
  totalRevenue: number;
  totalCogs: number;
  totalGrossProfit: number;
  totalExpenses: number;
  totalNetProfit: number;
  overallMarginPercent: number;
  points: ProfitabilityDataPoint[];
}

export const ProfitabilityChart: React.FC<ProfitabilityChartProps> = ({
  totalRevenue,
  totalCogs,
  totalGrossProfit,
  totalExpenses,
  totalNetProfit,
  overallMarginPercent,
  points,
}) => {
  return (
    <ProfitabilityWaterfallChart
      totalRevenue={totalRevenue}
      totalCogs={totalCogs}
      totalGrossProfit={totalGrossProfit}
      totalExpenses={totalExpenses}
      totalNetProfit={totalNetProfit}
      overallMarginPercent={overallMarginPercent}
      points={points}
    />
  );
};

// =========================================================================
// 7. QUOTATION CONVERSION FUNNEL (Power BI Funnel Visual)
// =========================================================================
interface QuotationFunnelChartProps {
  conversionRatePercent: number;
  stages: QuotationFunnelStage[];
  totalQuotations: number;
  convertedCount: number;
  convertedValue: number;
  onDrillDown?: () => void;
}

export const QuotationFunnelChart: React.FC<QuotationFunnelChartProps> = ({
  conversionRatePercent,
  stages,
  totalQuotations,
  convertedCount,
  convertedValue,
  onDrillDown,
}) => {
  return (
    <PbiQuotationFunnelChart
      conversionRatePercent={conversionRatePercent}
      stages={stages}
      totalQuotations={totalQuotations}
      convertedCount={convertedCount}
      convertedValue={convertedValue}
      onDrillDown={onDrillDown}
    />
  );
};

// =========================================================================
// 8. EXPENSE ANALYSIS (Power BI Donut & Ranked Horizontal Bars)
// =========================================================================
interface ExpenseAnalysisChartProps {
  totalExpenses: number;
  categories: ExpenseCategoryBreakdown[];
  onDrillDown?: () => void;
}

export const ExpenseAnalysisChart: React.FC<ExpenseAnalysisChartProps> = ({
  totalExpenses,
  categories,
  onDrillDown,
}) => {
  return (
    <PbiExpenseAnalysisChart
      totalExpenses={totalExpenses}
      categories={categories}
      onDrillDown={onDrillDown}
    />
  );
};
