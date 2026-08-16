// Minimal hash router with the prototype's route table and onboarding guard.
import { useEffect, useState } from 'react';

export const getPath = () => (location.hash || '#/').replace(/^#/, '') || '/';

export function useRoute(onboarded) {
  const [path, setPath] = useState(getPath);
  useEffect(() => {
    const onHash = () => setPath(getPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Guard: /app/* requires completed onboarding.
  useEffect(() => {
    if (path.startsWith('/app') && !onboarded) location.hash = '#/onboarding/1';
  }, [path, onboarded]);
  return path;
}

export const go = (r) => () => {
  location.hash = r;
};
export const navigate = (r) => {
  location.hash = r;
};

export function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}
