// Minimal hash router with the prototype's route table and onboarding guard.
import { useEffect, useState } from 'react';

export const getPath = () => (location.hash || '#/').replace(/^#/, '') || '/';

export function useRoute(onboarded, exemptFromOnboarding = false) {
  const [path, setPath] = useState(getPath);
  useEffect(() => {
    const onHash = () => setPath(getPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Guard: /app/* requires completed onboarding — except during a study session.
  // A participant arrives in a clean browser where `onboarded` is false, so
  // without the exemption the first task drops them into the 12-step wizard with
  // the time-on-task clock already running.
  useEffect(() => {
    if (path.startsWith('/app') && !onboarded && !exemptFromOnboarding) {
      location.hash = '#/onboarding/1';
    }
  }, [path, onboarded, exemptFromOnboarding]);
  return path;
}

export const go = (r) => () => { location.hash = r; };
export const navigate = (r) => { location.hash = r; };

export function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}
