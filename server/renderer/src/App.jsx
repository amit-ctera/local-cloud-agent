import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import Settings from './Settings';
import FirstRun from './FirstRun';
import './styles.css';

export default function App() {
  const [view, setView] = useState('loading');
  const [state, setState] = useState(null);

  useEffect(() => {
    window.api.getState().then((s) => {
      setState(s);
      setView(s.firstRunComplete ? 'dashboard' : 'firstrun');
    });
  }, []);

  useEffect(() => {
    const unsub1 = window.api.onServerStatus((data) => {
      setState((prev) => ({ ...prev, serverRunning: data.running, serverError: data.error }));
    });
    const unsub2 = window.api.onTunnelStatus((data) => {
      setState((prev) => ({
        ...prev,
        tunnelUrl: data.url || null,
        tunnelConnected: data.connected,
        tunnelError: data.error,
      }));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  if (view === 'loading' || !state) {
    return <div className="loading">Starting...</div>;
  }

  if (view === 'firstrun') {
    return (
      <FirstRun
        state={state}
        onComplete={() => {
          setView('dashboard');
        }}
      />
    );
  }

  if (view === 'settings') {
    return (
      <Settings
        state={state}
        onBack={() => setView('dashboard')}
        onSaved={(newState) => setState((prev) => ({ ...prev, ...newState }))}
      />
    );
  }

  return (
    <Dashboard
      state={state}
      onOpenSettings={() => setView('settings')}
    />
  );
}
