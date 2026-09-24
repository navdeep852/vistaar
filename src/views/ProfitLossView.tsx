import React from 'react';
import { FinancialStatementsView } from './FinancialStatementsView';

interface ProfitLossViewProps {
  onNavigateTab?: (tab: string, extraParam?: string) => void;
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({ onNavigateTab }) => {
  return <FinancialStatementsView onNavigateTab={onNavigateTab} />;
};

export default ProfitLossView;
