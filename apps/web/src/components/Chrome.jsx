// App-level overlays: citation/source drawer, confirm dialog, toast.
//
// The drawer and the confirmation are modal: while one is open the page behind
// it is out of reach. They are built on Radix's dialog primitives, which move
// focus into the dialog when it opens, keep Tab inside it, close it on Escape,
// hide the rest of the page from screen readers, and put focus back where it
// was when it closes.
import React, { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { useUi } from '../state/UiContext.jsx';
import { navigate } from '../state/router.js';
import { SourceDrawerBody } from './SourceDrawerBody.jsx';
import { Button } from './ui/Button.jsx';

const scrim = { position: 'fixed', inset: '0', background: 'rgba(15,25,32,.45)' };

/**
 * Puts focus back where it was when a dialog closes.
 *
 * Radix returns focus to a dialog's own trigger button. These dialogs are
 * opened from state, by whichever control asked, so there is no trigger for it
 * to return to and focus would be left on the page body. This remembers what
 * had focus as the dialog opened and gives it back.
 */
function useReturnFocus() {
  const opener = useRef(null);
  return {
    // Fired before focus moves into the dialog, so this is still the opener.
    onOpenAutoFocus: () => {
      opener.current = document.activeElement;
    },
    onCloseAutoFocus: (event) => {
      event.preventDefault();
      if (opener.current?.isConnected) opener.current.focus();
      opener.current = null;
    },
  };
}

// Present for screen readers, which need a dialog to have a name; not shown.
const hidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: '0',
};

// The drawer chrome; the content and its action rules live in
// SourceDrawerBody.jsx, presentational and tested.
export function SourceDrawer({ isMobile }) {
  const { effDark } = useSettings();
  const { drawer, setDrawer } = useChat();
  const returnFocus = useReturnFocus();
  const close = () => setDrawer(null);

  return (
    <Dialog.Root open={!!drawer} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ ...scrim, zIndex: '60' }} />
        <Dialog.Content
          // The body is a title, an excerpt and links: there is no one
          // description to point a screen reader at.
          aria-describedby={undefined}
          {...returnFocus}
          style={{
            position: 'fixed',
            zIndex: '61',
            background: 'var(--surface)',
            color: 'var(--text)',
            border: 'var(--bw) solid var(--border)',
            boxShadow: '0 8px 40px rgba(10,20,28,.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            padding: '26px',
            boxSizing: 'border-box',
            top: isMobile ? 'auto' : '0',
            bottom: '0',
            right: '0',
            left: isMobile ? '0' : 'auto',
            width: isMobile ? 'auto' : 'min(440px,92vw)',
            borderRadius: isMobile ? '22px 22px 0 0' : '0',
            maxHeight: '100vh',
            overflowY: 'auto',
          }}
        >
          <Dialog.Title style={hidden}>Source preview</Dialog.Title>
          <Dialog.Close asChild>
            <Button icon variant="secondary" aria-label="Close preview" className="self-end">
              ✕
            </Button>
          </Dialog.Close>
          {drawer && (
            <SourceDrawerBody
              drawer={drawer}
              effDark={effDark}
              onOpenArticle={(id) => {
                close();
                navigate('#/app/library/' + id);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// A question that must be answered before anything else. Focus starts on the
// choice that changes nothing, and Escape takes that choice.
export function ConfirmDialog() {
  const { confirm, confirmNo, confirmAccept } = useUi();
  const returnFocus = useReturnFocus();
  return (
    <AlertDialog.Root open={!!confirm} onOpenChange={(open) => !open && confirmNo()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay style={{ ...scrim, zIndex: '70' }} />
        <AlertDialog.Content
          {...returnFocus}
          style={{
            position: 'fixed',
            zIndex: '71',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--surface)',
            color: 'var(--text)',
            border: 'var(--bw) solid var(--border)',
            borderRadius: '20px',
            boxShadow: '0 8px 40px rgba(10,20,28,.3)',
            padding: '28px',
            maxWidth: '420px',
            width: 'calc(100% - 48px)',
            boxSizing: 'border-box',
          }}
        >
          <AlertDialog.Title style={{ margin: '0 0 10px', fontSize: '1.25rem' }}>
            {confirm?.title}
          </AlertDialog.Title>
          <AlertDialog.Description style={{ margin: '0 0 22px', color: 'var(--text2)' }}>
            {confirm?.message}
          </AlertDialog.Description>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{confirm?.noLabel || 'Keep history'}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={confirmAccept}>{confirm?.yesLabel || 'Confirm'}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function Toast() {
  const { toast } = useUi();
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '88px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '80',
        background: 'var(--text)',
        color: 'var(--bg)',
        padding: '12px 22px',
        borderRadius: '999px',
        fontWeight: '600',
        boxShadow: '0 4px 18px rgba(10,20,28,.3)',
        maxWidth: '90vw',
      }}
    >
      {toast}
    </div>
  );
}
