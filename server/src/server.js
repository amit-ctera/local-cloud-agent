const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');
const db = require('./db');
const { router: authRouter, authenticateToken } = require('./auth');

let app = null;
let httpServer = null;
let emitEvent = () => {};

const STARTED_RESPONSE = { ok: true, message: 'Agent started' };
const projectQueues = new Map();
const noopRes = { headersSent: true, writableEnded: true };

function getToolName(toolCall) {
  if (!toolCall) return 'unknown';
  for (const key of Object.keys(toolCall)) {
    if (key.endsWith('ToolCall')) return key.replace('ToolCall', '');
    if (key === 'function') return toolCall.function?.name || 'unknown';
  }
  return 'unknown';
}

function processNext(cwd) {
  const state = projectQueues.get(cwd);
  if (!state || state.queue.length === 0) return;
  const item = state.queue.shift();
  state.running = true;
  const res = item.stream ? item.res : noopRes;
  startOneAgent(cwd, item.promptTrimmed, item.model, item.force, item.sessionId, item.apiKey, res, item.stream, () => {
    state.running = false;
    processNext(cwd);
  });
}

function startOneAgent(cwd, promptTrimmed, model, _force, sessionId, apiKey, res, stream, onDone) {
  const agentPath = getAgentPath();
  if (!agentPath) {
    const errMsg = 'agent.ps1 not found. Set CURSOR_AGENT_PATH or install to %LOCALAPPDATA%\\cursor-agent\\agent.ps1';
    if (stream && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: errMsg });
    }
    onDone();
    return;
  }

  const escapePs = (s) => (s || '').replace(/'/g, "''");
  const apiKeyPart = " --api-key '" + escapePs(apiKey) + "'";
  const modelPart = model && typeof model === 'string' && model.trim()
    ? " --model '" + escapePs(model.trim()) + "'" : '';
  const resumePart = sessionId && typeof sessionId === 'string' && sessionId.trim()
    ? " --resume '" + escapePs(sessionId.trim()) + "'" : '';
  const agentPathPs = agentPath.replace(/\\/g, '/').replace(/'/g, "''");
  const cwdPs = cwd.replace(/'/g, "''");

  const scriptLines = [
    "Set-Location -LiteralPath '" + cwdPs + "'",
    "& '" + agentPathPs + "' -p" + apiKeyPart
      + " --output-format stream-json --stream-partial-output --trust --force"
      + modelPart + resumePart + " '" + escapePs(promptTrimmed) + "'",
  ];

  const tmpDir = os.tmpdir();
  const tmpScript = path.join(tmpDir, 'cursor-agent-run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.ps1');
  try {
    fs.writeFileSync(tmpScript, scriptLines.join('\r\n'), { encoding: 'utf8' });
  } catch (writeErr) {
    if (stream && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to write temp script', detail: writeErr.message })}\n\n`);
      res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to write temp script', detail: writeErr.message });
    }
    onDone();
    return;
  }

  try {
    console.log('[run] Starting agent in', cwd, sessionId ? '(resuming ' + sessionId + ')' : '(new session)');
    emitEvent({ type: 'agent-start', cwd, sessionId: sessionId || null });

    const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', tmpScript], {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let capturedSessionId = null;
    let resultSent = false;

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch (_) {
        process.stdout.write('[agent] ' + line + '\n');
        return;
      }

      process.stdout.write('[agent] ' + event.type + (event.subtype ? '.' + event.subtype : '') + '\n');

      if (!stream || res.writableEnded) return;

      switch (event.type) {
        case 'system':
          if (event.subtype === 'init' && event.session_id) {
            capturedSessionId = event.session_id;
            res.write(`event: started\ndata: ${JSON.stringify({ sessionId: event.session_id })}\n\n`);
          }
          break;

        case 'assistant':
          if (event.timestamp_ms && !event.model_call_id) {
            const text = event.message?.content
              ?.filter(c => c.type === 'text')
              .map(c => c.text)
              .join('') || '';
            if (text) {
              res.write(`data: ${JSON.stringify(text)}\n\n`);
            }
          }
          break;

        case 'tool_call': {
          const name = getToolName(event.tool_call);
          const status = event.subtype || 'unknown';
          res.write(`event: tool\ndata: ${JSON.stringify({ name, status })}\n\n`);
          break;
        }

        case 'result':
          capturedSessionId = event.session_id || capturedSessionId;
          resultSent = true;
          res.write(`event: done\ndata: ${JSON.stringify({ exitCode: 0, sessionId: capturedSessionId })}\n\n`);
          res.end();
          break;
      }
    });

    child.stderr.on('data', (data) => {
      process.stderr.write('[agent:stderr] ' + data.toString());
    });

    child.on('error', (err) => {
      try { fs.unlinkSync(tmpScript); } catch (_) {}
      if (stream && !res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to start agent', detail: err.message })}\n\n`);
        res.end();
      } else if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start agent', detail: err.message });
      }
      onDone();
    });

    child.on('close', (exitCode) => {
      try { fs.unlinkSync(tmpScript); } catch (_) {}
      console.log('[run] Agent finished in', cwd, '| exitCode:', exitCode);
      emitEvent({ type: 'agent-finish', cwd, exitCode });
      if (!resultSent && stream && !res.writableEnded) {
        res.write(`event: done\ndata: ${JSON.stringify({ exitCode: exitCode ?? -1, sessionId: capturedSessionId })}\n\n`);
        res.end();
      }
      onDone();
    });

    if (!stream && !res.headersSent) {
      res.status(202).json(STARTED_RESPONSE);
    }
  } catch (spawnErr) {
    try { fs.unlinkSync(tmpScript); } catch (_) {}
    if (stream && !res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to start agent', detail: spawnErr.message })}\n\n`);
      res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start agent', detail: spawnErr.message });
    }
    onDone();
  }
}

function getAgentPath() {
  const envPath = process.env.CURSOR_AGENT_PATH;
  if (envPath && typeof envPath === 'string') {
    const p = path.normalize(path.resolve(envPath.trim())).replace(/[/\\]+$/, '') || path.resolve(envPath.trim());
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const agentPs1 = path.join(localAppData, 'cursor-agent', 'agent.ps1');
  try {
    if (fs.existsSync(agentPs1)) return agentPs1;
  } catch { /* ignore */ }
  return null;
}

function resolveAndValidateProjectPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return { error: 'projectPath is required and must be a string' };
  }
  const trimmed = rawPath.trim();
  if (!trimmed) return { error: 'projectPath cannot be empty' };
  let resolved;
  try {
    resolved = path.resolve(trimmed);
  } catch {
    return { error: 'Invalid projectPath' };
  }
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return { error: 'projectPath must be an existing directory' };
  } catch (e) {
    if (e.code === 'ENOENT') return { error: 'projectPath directory does not exist' };
    return { error: 'Cannot access projectPath: ' + (e.message || 'unknown error') };
  }
  return { resolved };
}

function startServer(port, eventCallback) {
  return new Promise((resolve, reject) => {
    if (eventCallback) emitEvent = eventCallback;

    db.initDb();

    app = express();
    app.use(express.json({ limit: '1mb' }));

    // Public routes
    app.use('/auth', authRouter);
    app.get('/health', (_req, res) => {
      res.json({ ok: true, service: 'local-cloud-agent' });
    });

    // Protected routes
    app.post('/run', authenticateToken, (req, res) => {
      const { projectPath, prompt, model, force, sessionId } = req.body;
      const stream = req.query.stream === 'true';

      // Retrieve the user's Cursor API key
      const apiKey = db.getUserToken(req.user.userId);
      if (!apiKey) {
        return res.status(403).json({ error: 'No Cursor API key found for your account. Update your key in settings.' });
      }

      const pathResult = resolveAndValidateProjectPath(projectPath);
      if (pathResult.error) return res.status(400).json({ error: pathResult.error });
      const cwd = pathResult.resolved;

      if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt is required and must be a string' });
      const promptTrimmed = prompt.trim();
      if (!promptTrimmed) return res.status(400).json({ error: 'prompt cannot be empty' });

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
      }

      if (!projectQueues.has(cwd)) {
        projectQueues.set(cwd, { running: false, queue: [] });
      }
      const state = projectQueues.get(cwd);

      if (state.running) {
        if (stream) {
          state.queue.push({ promptTrimmed, model, force, sessionId: sessionId || null, apiKey, stream: true, res });
          res.write(`event: queued\ndata: ${JSON.stringify({ position: state.queue.length })}\n\n`);
        } else {
          state.queue.push({ promptTrimmed, model, force, sessionId: sessionId || null, apiKey, stream: false });
          res.status(202).json({ ok: true, message: 'Queued', position: state.queue.length });
        }
        return;
      }

      state.running = true;
      startOneAgent(cwd, promptTrimmed, model, force, sessionId || null, apiKey, res, stream, () => {
        state.running = false;
        processNext(cwd);
      });
    });

    app.get('/tunnel-url', authenticateToken, (_req, res) => {
      res.json({ url: null }); // Populated by main process if needed
    });

    const host = '0.0.0.0'; // Listen on all interfaces (ngrok needs this)
    httpServer = app.listen(port, host, () => {
      console.log(`Local Cloud Agent server listening on http://${host}:${port}`);
      resolve();
    });

    httpServer.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(() => {
        db.closeDb();
        httpServer = null;
        app = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = { startServer, stopServer };
