import React, { useState, useEffect, useRef } from 'react';

export default function Dashboard({ state, onOpenSettings }) {
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState([]);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    const unsub = window.api.onServerEvent((event) => {
      const time = new Date().toLocaleTimeString();
      let message = '';
      if (event.type === 'agent-start') {
        message = `Agent started in ${event.cwd}`;
      } else if (event.type === 'agent-finish') {
        message = `Agent finished in ${event.cwd} (exit: ${event.exitCode})`;
      } else {
        message = JSON.stringify(event);
      }
      setLogs((prev) => [...prev.slice(-99), { time, message }]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (state.tunnelUrl) {
      generateQr(state.tunnelUrl);
    } else {
      setQrDataUrl(null);
    }
  }, [state.tunnelUrl]);

  async function generateQr(url) {
    try {
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, { width: 180, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    }
  }

  async function handleCopy() {
    const ok = await window.api.copyTunnelUrl();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Local Cloud Agent</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => window.api.restartServer()}>
            ↻ Restart
          </button>
          <button className="btn-icon" onClick={onOpenSettings} title="Settings">
            ⚙
          </button>
        </div>
      </div>

      <div className="content">
        {/* Server Status */}
        <div className="card">
          <div className="card-title">Server Status</div>
          <div className="status-row">
            <div className={`status-dot ${state.serverRunning ? 'running' : 'stopped'}`} />
            <span className="status-text">
              {state.serverRunning ? `Running on port ${state.port}` : 'Stopped'}
            </span>
          </div>
          {state.serverError && (
            <p className="text-error mt-2">{state.serverError}</p>
          )}
        </div>

        {/* Tunnel URL */}
        <div className="card">
          <div className="card-title">Public URL</div>
          {state.tunnelConnected && state.tunnelUrl ? (
            <>
              <div className="url-box">
                <span className="url-text">{state.tunnelUrl}</span>
                <button className="btn btn-primary" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              {qrDataUrl && (
                <div className="qr-container">
                  <img src={qrDataUrl} alt="QR Code" width="180" height="180" />
                </div>
              )}
              <p className="text-muted mt-2" style={{ textAlign: 'center' }}>
                Scan with your phone or enter the URL in the app
              </p>
            </>
          ) : (
            <div className="url-box">
              <span className="url-placeholder">
                {state.tunnelError || 'Tunnel not connected'}
              </span>
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="card">
          <div className="card-title">Recent Activity</div>
          {logs.length === 0 ? (
            <p className="text-muted">No activity yet. Waiting for connections...</p>
          ) : (
            <ul className="log-list">
              {logs.map((log, i) => (
                <li key={i} className="log-item">
                  <span className="log-time">{log.time}</span>
                  <span className="log-message">{log.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
