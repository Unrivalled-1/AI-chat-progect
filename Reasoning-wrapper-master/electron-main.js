const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');

let mainWindow;
let screenshotWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  function loadWidget() {
    mainWindow.loadURL('http://localhost:5000/widget').catch(err => {
      console.log('Backend not ready, retrying in 1s...');
      setTimeout(loadWidget, 1000);
    });
  }
  loadWidget();
}

ipcMain.on('open-main-app', () => {
  const fullAppWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'AI Chat Dashboard',
    frame: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  fullAppWin.maximize();
  fullAppWin.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (${sourceId}:${line})`);
  });
  fullAppWin.loadURL('http://localhost:5000');
});

// IPC handlers for full window controls
ipcMain.on('full-app-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('full-app-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('full-app-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.handle('get-desktop-stream-id', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  // Choose the primary screen or the first one available
  return sources[0].id;
});

ipcMain.on('start-screen-capture', () => {
  if (screenshotWindow) {
    screenshotWindow.close();
  }
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  screenshotWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  screenshotWindow.loadFile(path.join(__dirname, 'templates', 'screenshot.html'));
  screenshotWindow.show();
});

ipcMain.on('capture-complete', (event, imageBase64) => {
  if (screenshotWindow) {
    screenshotWindow.close();
    screenshotWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('screenshot-captured', imageBase64);
  }
});

ipcMain.on('capture-cancel', () => {
  if (screenshotWindow) {
    screenshotWindow.close();
    screenshotWindow = null;
  }
  if (mainWindow) mainWindow.show();
});

app.whenReady().then(() => {
  createWindow();

  // Register global shortcuts (binding a few common variations to ensure one works)
  const toggleWidget = () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        mainWindow.focus();
      }
    }
  };

  const shortcuts = ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space', 'CommandOrControl+Alt+X', 'Super+Alt+Space'];
  for (const k of shortcuts) {
    const success = globalShortcut.register(k, toggleWidget);
    if (!success) console.warn('Failed to register global shortcut:', k);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});
