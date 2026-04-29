import React, { useState } from 'react';

export default function FirstRun({ state, onComplete }) {
  const [step, setStep] = useState(1);
  const [ngrokToken, setNgrokToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalSteps = 3;

  async function handleSaveToken() {
    if (!ngrokToken.trim()) {
      setError('Please enter your ngrok authtoken');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await window.api.saveSettings({ ngrokAuthtoken: ngrokToken.trim() });
      await window.api.restartServer();
      setStep(3);
    } catch (err) {
      setError('Failed to save: ' + err.message);
    }
    setSaving(false);
  }

  async function handleFinish() {
    await window.api.completeFirstRun();
    onComplete();
  }

  return (
    <div className="wizard">
      <div className="step-indicator">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`step-dot ${i + 1 === step ? 'active' : ''}`}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <h1>Welcome to Local Cloud Agent</h1>
          <p>
            This app lets you control Cursor remotely from any device.
            It creates a secure tunnel so you can send prompts to the Cursor CLI
            from your phone, tablet, or any browser.
          </p>
          <button className="btn btn-primary" onClick={() => setStep(2)}>
            Get Started →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Connect ngrok</h1>
          <p>
            To expose your server securely, you'll need an ngrok account (free).
            Paste your authtoken below.
          </p>
          <div className="form-group">
            <label className="form-label">ngrok Authtoken</label>
            <input
              type="text"
              className="form-input"
              value={ngrokToken}
              onChange={(e) => { setNgrokToken(e.target.value); setError(''); }}
              placeholder="Paste your ngrok authtoken here"
              autoFocus
            />
            <p className="form-hint">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.api.openExternal('https://dashboard.ngrok.com/get-started/your-authtoken');
                }}
                style={{ color: 'var(--accent)' }}
              >
                Get your free authtoken →
              </a>
            </p>
          </div>
          {error && <p className="text-error mb-4">{error}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn btn-primary" onClick={handleSaveToken} disabled={saving}>
              {saving ? 'Connecting...' : 'Connect →'}
            </button>
          </div>
          <p className="text-muted mt-4" style={{ fontSize: '0.85rem' }}>
            You can also skip this and configure it later in Settings.
            <br />
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); handleFinish(); }}
              style={{ color: 'var(--accent)' }}
            >
              Skip for now
            </a>
          </p>
        </>
      )}

      {step === 3 && (
        <>
          <h1>You're all set!</h1>
          <p>
            Your server is running and the tunnel is active.
            {state.tunnelUrl ? (
              <> Use the URL below or scan the QR code to connect from your device.</>
            ) : (
              <> The tunnel URL will appear on the dashboard once connected.</>
            )}
          </p>
          {state.tunnelUrl && (
            <div className="url-box" style={{ maxWidth: '400px', margin: '0 auto 16px' }}>
              <span className="url-text">{state.tunnelUrl}</span>
              <button className="btn btn-primary" onClick={() => window.api.copyTunnelUrl()}>
                Copy
              </button>
            </div>
          )}
          <button className="btn btn-primary" onClick={handleFinish}>
            Open Dashboard →
          </button>
        </>
      )}
    </div>
  );
}
