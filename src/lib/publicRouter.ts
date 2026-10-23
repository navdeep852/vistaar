import { useState, useEffect } from 'react';

export const navigateTo = (path: string) => {
  if (typeof window === 'undefined') return;
  const currentFull = window.location.pathname + window.location.search;
  if (currentFull === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new CustomEvent('vistaar:route_change', { detail: { path } }));
  // Dedicated route-change scroll to top: ONLY triggers on explicit route transitions
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
};

export const usePublicPath = () => {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };

    const handleCustomRoute = (e: any) => {
      const target = e.detail?.path || window.location.pathname || '/';
      // Normalize target to pathname for route matching
      const targetPath = target.split('?')[0].split('#')[0] || '/';
      setCurrentPath(targetPath);
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
