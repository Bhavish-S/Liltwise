import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import {
  APP_INFO_CHANNEL,
  appInfoSchema,
  GET_TELEPROMPTER_STATUS_CHANNEL,
  HIDE_TELEPROMPTER_CHANNEL,
  OPEN_TELEPROMPTER_CHANNEL,
  readingSettingsSchema,
  TELEPROMPTER_DATA_CHANNEL,
  TELEPROMPTER_READY_CHANNEL,
  TELEPROMPTER_STATUS_CHANNEL,
  teleprompterActionResultSchema,
  teleprompterDataSchema,
  teleprompterStatusSchema,
  UPDATE_TELEPROMPTER_CHANNEL,
  type TeleprompterData,
} from '@liltwise/contracts';
import { DEFAULT_READING_SETTINGS } from '@liltwise/domain';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const MINIMUM_SCRIPT_LENGTH = 1;
let mainWindow: BrowserWindow | null = null;
let teleprompterWindow: BrowserWindow | null = null;
let teleprompterReady = false;
let isQuitting = false;
let teleprompterData: TeleprompterData = {
  script: '',
  settings: readingSettingsSchema.parse(DEFAULT_READING_SETTINGS),
};

function statusSnapshot() {
  const open = teleprompterWindow !== null && !teleprompterWindow.isDestroyed();
  const visible = teleprompterWindow && !teleprompterWindow.isDestroyed()
    ? teleprompterWindow.isVisible()
    : false;
  return teleprompterStatusSchema.parse({
    open,
    visible,
  });
}

function attachDevelopmentDiagnostics(window: BrowserWindow, label: 'workspace' | 'teleprompter'): void {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) return;

  window.webContents.on('did-finish-load', () => {
    console.info(`[renderer:${label}] loaded ${window.webContents.getURL()}`);
    setTimeout(() => {
      void window.webContents.executeJavaScript(`({
        title: document.title,
        rootChildCount: document.getElementById('root')?.childElementCount ?? -1,
      })`).then((state: { title: string; rootChildCount: number }) => {
        console.info(`[renderer:${label}] startup check:`, JSON.stringify(state));
      }).catch((error: unknown) => console.error(`[renderer:${label}] startup check failed:`, error));
    }, 1000);
  });
  window.webContents.on('did-fail-load', (_event, code, description, targetUrl) => {
    console.error(`[renderer:${label}] failed to load ${targetUrl}: ${description} (${code})`);
  });
  window.webContents.on('console-message', (details) => {
    const method = details.level === 'warning'
      ? 'warn'
      : details.level === 'debug' ? 'info' : details.level;
    console[method](`[renderer:${label}:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer:${label}] process exited: ${details.reason} (exit code ${details.exitCode})`);
  });
}

function applyPlatformWindowBehavior(window: BrowserWindow): void {
  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating');
  } else {
    window.setAlwaysOnTop(true);
  }
}

function broadcastTeleprompterStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(TELEPROMPTER_STATUS_CHANNEL, statusSnapshot());
}

function sendTeleprompterData(): void {
  if (!teleprompterReady || !teleprompterWindow || teleprompterWindow.isDestroyed()) return;
  teleprompterWindow.webContents.send(TELEPROMPTER_DATA_CHANNEL, teleprompterDataSchema.parse(teleprompterData));
}

function isTrustedMainSender(event: IpcMainInvokeEvent): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function isTrustedPrompterSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return Boolean(teleprompterWindow && !teleprompterWindow.isDestroyed() && event.sender === teleprompterWindow.webContents);
}

function getTeleprompterWindowOptions(): BrowserWindowConstructorOptions {
  const platformSpecific = process.platform === 'darwin'
    ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
    : {};

  return {
    width: 720,
    height: 500,
    minWidth: 400,
    minHeight: 280,
    title: 'Liltwise Teleprompter',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    ...platformSpecific,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function loadRenderer(window: BrowserWindow, view: 'workspace' | 'teleprompter'): void {
  const viewOptions = view === 'teleprompter' ? { query: { view } } : undefined;
  const loadPromise = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? (() => {
        const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        if (view === 'teleprompter') url.searchParams.set('view', view);
        return window.loadURL(url.toString());
      })()
    : window.loadFile(
        join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        viewOptions,
      );

  void loadPromise.catch((error: unknown) => {
    console.error(`[renderer] could not load the ${view} interface:`, error);
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 820,
    minHeight: 640,
    title: 'Liltwise — Your AI Co-Presenter',
    show: false,
    backgroundColor: '#f7f6fb',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  attachDevelopmentDiagnostics(window, 'workspace');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const isAllowed = isDevelopment
      ? targetUrl.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? '')
      : targetUrl.startsWith('file://');
    if (!isAllowed) event.preventDefault();
  });
  window.on('closed', () => {
    mainWindow = null;
    if (process.platform !== 'darwin' && teleprompterWindow && !teleprompterWindow.isDestroyed()) {
      teleprompterWindow.close();
    }
  });

  loadRenderer(window, 'workspace');
  return window;
}

function createTeleprompterWindow(): BrowserWindow {
  const window = new BrowserWindow(getTeleprompterWindowOptions());
  teleprompterWindow = window;
  teleprompterReady = false;
  attachDevelopmentDiagnostics(window, 'teleprompter');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const isAllowed = isDevelopment
      ? targetUrl.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? '')
      : targetUrl.startsWith('file://');
    if (!isAllowed) event.preventDefault();
  });
  window.on('show', broadcastTeleprompterStatus);
  window.on('hide', broadcastTeleprompterStatus);
  window.on('close', (event) => {
    if (isQuitting || !mainWindow) return;
    event.preventDefault();
    window.hide();
  });
  window.on('closed', () => {
    if (teleprompterWindow === window) teleprompterWindow = null;
    teleprompterReady = false;
    broadcastTeleprompterStatus();
  });

  applyPlatformWindowBehavior(window);

  loadRenderer(window, 'teleprompter');
  broadcastTeleprompterStatus();
  return window;
}

function getOrCreateTeleprompterWindow(): BrowserWindow {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) return teleprompterWindow;
  return createTeleprompterWindow();
}

function registerIpcHandlers(): void {
  ipcMain.handle(APP_INFO_CHANNEL, () =>
    appInfoSchema.parse({ name: app.getName(), version: app.getVersion() }),
  );

  ipcMain.handle(GET_TELEPROMPTER_STATUS_CHANNEL, (event) => {
    if (!isTrustedMainSender(event)) throw new Error('Only the Liltwise workspace can request teleprompter status.');
    return statusSnapshot();
  });

  ipcMain.handle(OPEN_TELEPROMPTER_CHANNEL, async (event, input: unknown) => {
    if (!isTrustedMainSender(event)) throw new Error('Only the Liltwise workspace can open the teleprompter.');
    const parsed = teleprompterDataSchema.safeParse(input);
    if (!parsed.success) {
      return teleprompterActionResultSchema.parse({ ok: false, message: 'The script or reading settings are invalid.' });
    }
    if (parsed.data.script.trim().length < MINIMUM_SCRIPT_LENGTH) {
      return teleprompterActionResultSchema.parse({ ok: false, message: 'Add some script text before opening the teleprompter.' });
    }

    teleprompterData = parsed.data;
    const window = getOrCreateTeleprompterWindow();
    if (teleprompterReady) {
      sendTeleprompterData();
      window.show();
      window.focus();
    }
    broadcastTeleprompterStatus();
    return teleprompterActionResultSchema.parse({ ok: true, message: 'Teleprompter opened with the latest script.' });
  });

  ipcMain.handle(UPDATE_TELEPROMPTER_CHANNEL, (event, input: unknown) => {
    if (!isTrustedMainSender(event)) throw new Error('Only the Liltwise workspace can update the teleprompter.');
    const parsed = teleprompterDataSchema.safeParse(input);
    if (!parsed.success) {
      return teleprompterActionResultSchema.parse({ ok: false, message: 'The script or reading settings are invalid.' });
    }
    if (!teleprompterWindow || teleprompterWindow.isDestroyed()) {
      return teleprompterActionResultSchema.parse({ ok: false, message: 'Open the floating teleprompter first.' });
    }

    teleprompterData = parsed.data;
    sendTeleprompterData();
    return teleprompterActionResultSchema.parse({ ok: true, message: 'The floating script and reading settings were updated.' });
  });

  ipcMain.handle(HIDE_TELEPROMPTER_CHANNEL, (event) => {
    if (!isTrustedPrompterSender(event)) throw new Error('Only the teleprompter can hide itself.');
    teleprompterWindow?.hide();
    return statusSnapshot();
  });

  ipcMain.on(TELEPROMPTER_READY_CHANNEL, (event) => {
    if (!isTrustedPrompterSender(event)) return;
    teleprompterReady = true;
    sendTeleprompterData();
    teleprompterWindow?.show();
    broadcastTeleprompterStatus();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
