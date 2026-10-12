import { contextBridge, ipcRenderer } from 'electron';
import {
  APP_INFO_CHANNEL,
  appInfoSchema,
  companionActionResultSchema,
  companionSnapshotSchema,
  COMPANION_ACCEPT_IMPORT_CHANNEL,
  COMPANION_DISMISS_IMPORT_CHANNEL,
  COMPANION_PAIR_CHANNEL,
  COMPANION_REVOKE_CHANNEL,
  COMPANION_SNAPSHOT_CHANNEL,
  COMPANION_STATE_CHANNEL,
  companionTransferIdSchema,
  GET_TELEPROMPTER_STATUS_CHANNEL,
  HIDE_TELEPROMPTER_CHANNEL,
  OPEN_TELEPROMPTER_CHANNEL,
  TELEPROMPTER_DATA_CHANNEL,
  TELEPROMPTER_READY_CHANNEL,
  TELEPROMPTER_STATUS_CHANNEL,
  teleprompterActionResultSchema,
  teleprompterDataSchema,
  teleprompterStatusSchema,
  UPDATE_TELEPROMPTER_CHANNEL,
  type AppInfo,
  type CompanionActionResult,
  type CompanionSnapshot,
  type TeleprompterActionResult,
  type TeleprompterData,
  type TeleprompterStatus,
} from '@liltwise/contracts';

function subscribeToTeleprompterData(callback: (data: TeleprompterData) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, input: unknown): void => {
    const parsed = teleprompterDataSchema.safeParse(input);
    if (parsed.success) callback(parsed.data);
    else console.error('[preload] ignored invalid teleprompter data from the main process.');
  };

  ipcRenderer.on(TELEPROMPTER_DATA_CHANNEL, listener);
  ipcRenderer.send(TELEPROMPTER_READY_CHANNEL);
  return () => ipcRenderer.removeListener(TELEPROMPTER_DATA_CHANNEL, listener);
}

function subscribeToTeleprompterStatus(callback: (status: TeleprompterStatus) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, input: unknown): void => {
    const parsed = teleprompterStatusSchema.safeParse(input);
    if (parsed.success) callback(parsed.data);
    else console.error('[preload] ignored invalid teleprompter status from the main process.');
  };

  ipcRenderer.on(TELEPROMPTER_STATUS_CHANNEL, listener);
  return () => ipcRenderer.removeListener(TELEPROMPTER_STATUS_CHANNEL, listener);
}

function subscribeToCompanionState(callback: (snapshot: CompanionSnapshot) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, input: unknown): void => {
    const parsed = companionSnapshotSchema.safeParse(input);
    if (parsed.success) callback(parsed.data);
    else console.error('[preload] ignored invalid companion status from the main process.');
  };

  ipcRenderer.on(COMPANION_STATE_CHANNEL, listener);
  return () => ipcRenderer.removeListener(COMPANION_STATE_CHANNEL, listener);
}

const liltwiseBridge = Object.freeze({
  getAppInfo: async (): Promise<AppInfo> =>
    appInfoSchema.parse(await ipcRenderer.invoke(APP_INFO_CHANNEL)),
  getTeleprompterStatus: async (): Promise<TeleprompterStatus> =>
    teleprompterStatusSchema.parse(await ipcRenderer.invoke(GET_TELEPROMPTER_STATUS_CHANNEL)),
  openTeleprompter: async (input: TeleprompterData): Promise<TeleprompterActionResult> =>
    teleprompterActionResultSchema.parse(await ipcRenderer.invoke(OPEN_TELEPROMPTER_CHANNEL, input)),
  updateTeleprompter: async (input: TeleprompterData): Promise<TeleprompterActionResult> =>
    teleprompterActionResultSchema.parse(await ipcRenderer.invoke(UPDATE_TELEPROMPTER_CHANNEL, input)),
  hideTeleprompter: async (): Promise<TeleprompterStatus> =>
    teleprompterStatusSchema.parse(await ipcRenderer.invoke(HIDE_TELEPROMPTER_CHANNEL)),
  getCompanionSnapshot: async (): Promise<CompanionSnapshot> =>
    companionSnapshotSchema.parse(await ipcRenderer.invoke(COMPANION_SNAPSHOT_CHANNEL)),
  createCompanionPairingCode: async (): Promise<CompanionSnapshot> =>
    companionSnapshotSchema.parse(await ipcRenderer.invoke(COMPANION_PAIR_CHANNEL)),
  revokeCompanionPairing: async (): Promise<CompanionSnapshot> =>
    companionSnapshotSchema.parse(await ipcRenderer.invoke(COMPANION_REVOKE_CHANNEL)),
  acceptIncomingScript: async (transferId: string): Promise<CompanionActionResult> =>
    companionActionResultSchema.parse(await ipcRenderer.invoke(COMPANION_ACCEPT_IMPORT_CHANNEL, companionTransferIdSchema.parse(transferId))),
  dismissIncomingScript: async (transferId: string): Promise<CompanionActionResult> =>
    companionActionResultSchema.parse(await ipcRenderer.invoke(COMPANION_DISMISS_IMPORT_CHANNEL, companionTransferIdSchema.parse(transferId))),
  onCompanionState: subscribeToCompanionState,
  onTeleprompterData: subscribeToTeleprompterData,
  onTeleprompterStatus: subscribeToTeleprompterStatus,
});

contextBridge.exposeInMainWorld('liltwise', liltwiseBridge);
