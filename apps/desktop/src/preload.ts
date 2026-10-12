import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_CHANNEL, appInfoSchema, type AppInfo } from '@liltwise/contracts';

const liltwiseBridge = Object.freeze({
  getAppInfo: async (): Promise<AppInfo> =>
    appInfoSchema.parse(await ipcRenderer.invoke(APP_INFO_CHANNEL)),
});

contextBridge.exposeInMainWorld('liltwise', liltwiseBridge);
