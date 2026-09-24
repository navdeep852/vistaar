import React from 'react';
import { FinancialStatementsView } from './FinancialStatementsView';

interface ReportsViewProps {
  onNavigateTab?: (tab: string, extraParam?: string) => void;
}

/**
 * Backward compatibility redirect:
 * Per Part 2 of Architecture Specification, generic standalone Reports tab
 * is migrated to the authoritative Financial Statements / Profit & Loss destination.
 */
export const ReportsView: React.FC<ReportsViewProps> = ({ onNavigateTab }) => {
  return <FinancialStatementsView onNavigateTab={onNavigateTab} />;
};

export default ReportsView;
