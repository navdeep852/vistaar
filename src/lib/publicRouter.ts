import { useState, useEffect } from 'react';

export const navigateTo = (path: string) => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new CustomEvent('vistaar:route_change', { detail: { path } }));
};

export const usePublicPath = () => {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };

    const handleCustomRoute = (e: any) => {
      if (e.detail?.path) {
        setCurrentPath(e.detail.path);
      } else {
        setCurrentPath(window.location.pathname || '/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('vistaar:route_change', handleCustomRoute);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('vistaar:route_change', handleCustomRoute);
    };
  }, []);

  return currentPath;
};
