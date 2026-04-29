const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('./server');
const { startTunnel, stopTunnel } = require('./tunnel');
const Store = require('electron-store');

// Prevent multiple instances — if another is already running, focus it instead
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

const store = new Store({
  defaults: {
    port: 31337,
    autoStart: false,
    ngrokAuthtoken: '',
    windowBounds: { width: 900, height: 650 },
    firstRunComplete: false,
  },
});

let mainWindow = null;
let tray = null;
let serverInfo = { running: false, port: null };
let tunnelUrl = null;
let isShuttingDown = false;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 700,
    minHeight: 500,
    title: 'Local Cloud Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    store.set('windowBounds', { width, height });
  });
}

function createTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }

  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromBuffer(Buffer.alloc(1)) : trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Copy Tunnel URL',
      enabled: !!tunnelUrl,
      click: () => {
        if (tunnelUrl) {
          const { clipboard } = require('electron');
          clipboard.writeText(tunnelUrl);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => gracefulQuit(),
    },
  ]);

  tray.setToolTip('Local Cloud Agent');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

async function gracefulQuit() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    await stopTunnel();
    await stopServer();
  } catch {
    // Best-effort cleanup
  }
  app.isQuitting = true;
  app.quit();
}

async function boot() {
  const port = store.get('port');
  try {
    await startServer(port, (event) => sendToRenderer('server-event', event));
    serverInfo = { running: true, port };
    sendToRenderer('server-status', { running: true, port });

    const ngrokToken = store.get('ngrokAuthtoken');
    if (ngrokToken) {
      try {
        tunnelUrl = await startTunnel(port, ngrokToken);
        sendToRenderer('tunnel-status', { connected: true, url: tunnelUrl });
        createTray();
      } catch (err) {
        sendToRenderer('tunnel-status', { connected: false, error: err.message });
      }
    } else {
      sendToRenderer('tunnel-status', { connected: false, error: 'No ngrok authtoken configured' });
    }
  } catch (err) {
    sendToRenderer('server-status', { running: false, error: err.message });
  }
}

// IPC handlers
ipcMain.handle('get-state', () => ({
  serverRunning: serverInfo.running,
  port: serverInfo.port || store.get('port'),
  tunnelUrl,
  firstRunComplete: store.get('firstRunComplete'),
  ngrokAuthtoken: store.get('ngrokAuthtoken'),
  autoStart: store.get('autoStart'),
}));

ipcMain.handle('save-settings', async (_event, settings) => {
  if (settings.ngrokAuthtoken !== undefined) store.set('ngrokAuthtoken', settings.ngrokAuthtoken);
  if (settings.port !== undefined) store.set('port', settings.port);
  if (settings.autoStart !== undefined) {
    store.set('autoStart', settings.autoStart);
    app.setLoginItemSettings({ openAtLogin: settings.autoStart });
  }
  return { ok: true };
});

ipcMain.handle('complete-first-run', async () => {
  store.set('firstRunComplete', true);
  return { ok: true };
});

ipcMain.handle('stop-server', async () => {
  try {
    await stopTunnel();
    await stopServer();
    tunnelUrl = null;
    serverInfo = { running: false, port: null };
    sendToRenderer('server-status', { running: false });
    sendToRenderer('tunnel-status', { connected: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('start-server', async () => {
  try {
    await boot();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('restart-server', async () => {
  try {
    await stopTunnel();
    await stopServer();
    tunnelUrl = null;
    serverInfo = { running: false, port: null };
    sendToRenderer('server-status', { running: false });
    sendToRenderer('tunnel-status', { connected: false });
    await boot();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('copy-tunnel-url', () => {
  if (tunnelUrl) {
    const { clipboard } = require('electron');
    clipboard.writeText(tunnelUrl);
    return true;
  }
  return false;
});

ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url);
});

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  await boot();
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

app.on('before-quit', (e) => {
  if (!isShuttingDown) {
    e.preventDefault();
    gracefulQuit();
  }
});
