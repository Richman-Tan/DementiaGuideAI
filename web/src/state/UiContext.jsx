// App-level UI chrome: toast + confirm dialog (used for "Clear history").
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const UiCtx = createContext(null);

export function UiProvider({ children }) {
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, yesLabel }
  const toastT = useRef(null);
  const confirmYes = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const askConfirm = useCallback((opts, onYes) => {
    confirmYes.current = onYes;
    setConfirm(opts);
  }, []);
  const confirmNo = useCallback(() => setConfirm(null), []);
  const confirmAccept = useCallback(() => {
    setConfirm(null);
    if (confirmYes.current) confirmYes.current();
  }, []);

  return (
    <UiCtx.Provider value={{ toast, showToast, confirm, askConfirm, confirmNo, confirmAccept }}>
      {children}
    </UiCtx.Provider>
  );
}

export const useUi = () => useContext(UiCtx);
