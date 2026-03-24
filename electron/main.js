import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure a single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    // Use the 512x512 pwa icon on Windows frame
    icon: path.join(__dirname, '../public/pwa-512x512.png'),
    title: 'Brainstorm',
    autoHideMenuBar: true
  });

  // Check if we are in development mode by checking if vite server is up
  // The npm script passes a URL to wait-on, so if we're here and the URL is active,
  // we can just load it. 
  // We can use an env var or a simple try catch. Alternatively, we just check if it's packed.
  if (!app.isPackaged) {
    // Development
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle Auto-Updates
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
