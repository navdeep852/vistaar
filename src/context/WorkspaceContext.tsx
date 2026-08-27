import React, { createContext, useContext, useState, useEffect } from 'react';

interface WorkspaceContextType {
  isWorkspaceActive: boolean;
  setIsWorkspaceActive: (active: boolean) => void;
  activeWorkspaceTitle: string;
  setActiveWorkspaceTitle: (title: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  isWorkspaceActive: false,
  setIsWorkspaceActive: () => {},
  activeWorkspaceTitle: '',
  setActiveWorkspaceTitle: () => {},
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isWorkspaceActive, setIsWorkspaceActive] = useState(false);
  const [activeWorkspaceTitle, setActiveWorkspaceTitle] = useState('');

  return (
    <WorkspaceContext.Provider
      value={{
        isWorkspaceActive,
        setIsWorkspaceActive,
        activeWorkspaceTitle,
        setActiveWorkspaceTitle,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);
