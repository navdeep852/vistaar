import React from 'react';
import { BackupDashboard } from '../components/backup/BackupDashboard';

export const BackupRestoreView: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <BackupDashboard />
    </div>
  );
};
