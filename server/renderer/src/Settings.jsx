import React, { useState } from 'react';

export default function Settings({ state, onBack, onSaved }) {
  const [ngrokToken, setNgrokToken] = useState(state.ngrokAuthtoken || '');
  const [port, setPort] = useState(String(state.port || 31337));
  const [autoStart, setAutoStart] = useState(state.autoStart || false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setMessage('Port must be between 1 and 65535');
        setSaving(false);
        return;
      }

      await window.api.saveSettings({
        ngrokAuthtoken: ngrokToken.trim(),
        port: portNum,
        autoStart,
      });

      onSaved({
        ngrokAuthtoken: ngrokToken.trim(),
        port: portNum,
        autoStart,
      });
      setMessage('Settings saved. Restart the server to apply changes.');
    } catch (err) {
      setMessage('Failed to save: ' + err.message);
    }
    setSaving(false);
  }

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn-icon" onClick={onBack} title="Back">←</button>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <div className="card-title">ngrok Configuration</div>
          <div className="form-group">
            <label className="form-label">Authtoken</label>
            <input
              type="password"
              className="form-input"
              value={ngrokToken}
              onChange={(e) => setNgrokToken(e.target.value)}
              placeholder="Enter your ngrok authtoken"
            />
            <p className="form-hint">
              Get your token at{' '}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); window.api.openExternal('https://dashboard.ngrok.com/get-started/your-authtoken'); }}
                style={{ color: 'var(--accent)' }}
              >
                dashboard.ngrok.com
              </a>
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Server</div>
          <div className="form-group">
            <label className="form-label">Port</label>
            <input
              type="number"
              className="form-input"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min="1"
              max="65535"
            />
            <p className="form-hint">Default: 31337</p>
          </div>

          <div className="form-group">
            <label
              className="toggle"
              onClick={() => setAutoStart(!autoStart)}
            >
              <div className={`toggle-track ${autoStart ? 'active' : ''}`}>
                <div className="toggle-thumb" />
              </div>
              <span>Start on Windows boot</span>
            </label>
          </div>
        </div>

        {message && (
          <p className={message.includes('Failed') ? 'text-error mb-4' : 'text-success mb-4'}>
            {message}
          </p>
        )}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
