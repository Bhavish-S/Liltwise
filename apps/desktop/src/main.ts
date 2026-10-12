import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { APP_INFO_CHANNEL, appInfoSchema } from '@liltwise/contracts';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

function registerIpcHandlers(): void {
  ipcMain.handle(APP_INFO_CHANNEL, () =>
    appInfoSchema.parse({ name: app.getName(), version: app.getVersion() }),
  );
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 360,
    minHeight: 480,
    title: 'Liltwise',
    show: false,
    backgroundColor: '#f8f7f3',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const isAllowed = isDevelopment
      ? targetUrl.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? '')
      : targetUrl.startsWith('file://');

    if (!isAllowed) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return window;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
