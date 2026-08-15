import React, { Suspense } from 'react';
import { SettingsProvider, useSettings } from './state/SettingsContext.jsx';
import { UiProvider } from './state/UiContext.jsx';
import { ChatProvider } from './state/ChatContext.jsx';
import { useRoute, useWidth, navigate } from './state/router.js';
import Shell from './components/Shell.jsx';
import { SourceDrawer, ConfirmDialog, Toast } from './components/Chrome.jsx';
import Landing from './screens/Landing.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Chat from './screens/Chat.jsx';
import Library from './screens/Library.jsx';
import Article from './screens/Article.jsx';
import Settings from './screens/Settings.jsx';
import Privacy from './screens/Privacy.jsx';
import Disclaimer from './screens/Disclaimer.jsx';
import NotFound from './screens/NotFound.jsx';

// Voice is lazy: it will pull the TTS/lipsync stack (incl. the 660KB G2P
// lexicon) in later phases — keep all of that out of the initial chunk.
const Voice = React.lazy(() => import('./screens/Voice.jsx'));

function Routed() {
  const { settings } = useSettings();
  const path = useRoute(settings.onboarded);
  const width = useWidth();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;

  if (path === '/') {
    const openApp = () => navigate(settings.onboarded ? '#/app/home' : '#/onboarding/1');
    const browseLibrary = () => navigate(settings.onboarded ? '#/app/library' : '#/onboarding/1');
    return <Landing openApp={openApp} browseLibrary={browseLibrary} />;
  }

  if (path.startsWith('/onboarding')) {
    const step = parseInt(path.split('/')[2], 10) || 1;
    return <Onboarding step={step} />;
  }

  if (path === '/app/voice') {
    return (
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>Loading…</div>}>
        <Voice />
      </Suspense>
    );
  }

  const artId = path.startsWith('/app/library/') ? path.split('/')[3] : null;
  let screen, active;
  if (path === '/app/home') { screen = <Home />; active = 'home'; }
  else if (path === '/app/chat') { screen = <Chat isDesktop={isDesktop} isMobile={isMobile} />; active = 'chat'; }
  else if (path === '/app/library') { screen = <Library />; active = 'lib'; }
  else if (artId) { screen = <Article artId={artId} />; active = 'lib'; }
  else if (path === '/app/settings') { screen = <Settings />; active = 'set'; }
  else if (path === '/privacy') { screen = <Privacy />; active = null; }
  else if (path === '/disclaimer') { screen = <Disclaimer />; active = null; }
  else { screen = <NotFound />; active = null; }

  return (
    <Shell active={active} isDesktop={isDesktop} isTablet={isTablet} isMobile={isMobile}>
      {screen}
    </Shell>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <UiProvider>
        <ChatProvider>
          <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontSize: '1rem', lineHeight: '1.55' }}>
            <RoutedWithChrome />
          </div>
        </ChatProvider>
      </UiProvider>
    </SettingsProvider>
  );
}

function RoutedWithChrome() {
  const width = useWidth();
  return (
    <ErrorBoundary>
      <Routed />
      <SourceDrawer isMobile={width < 768} />
      <ConfirmDialog />
      <Toast />
    </ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[app] render error:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', textAlign: 'center', padding: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Something went wrong</h1>
        <p style={{ margin: 0, color: 'var(--text2)', maxWidth: '30em' }}>Your conversations and settings are safe. Try going back to the start.</p>
        <button onClick={() => { this.setState({ error: null }); navigate('#/app/home'); }} style={{ minHeight: '50px', padding: '0 24px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Home</button>
      </div>
    );
  }
}
