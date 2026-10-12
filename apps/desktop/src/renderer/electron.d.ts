import type {
  AppInfo,
  TeleprompterActionResult,
  TeleprompterData,
  TeleprompterStatus,
  CompanionActionResult,
  CompanionSnapshot,
} from '@liltwise/contracts';

declare global {
  interface Window {
    liltwise: {
      getAppInfo: () => Promise<AppInfo>;
      getTeleprompterStatus: () => Promise<TeleprompterStatus>;
      openTeleprompter: (data: TeleprompterData) => Promise<TeleprompterActionResult>;
      updateTeleprompter: (data: TeleprompterData) => Promise<TeleprompterActionResult>;
      hideTeleprompter: () => Promise<TeleprompterStatus>;
      getCompanionSnapshot: () => Promise<CompanionSnapshot>;
      createCompanionPairingCode: () => Promise<CompanionSnapshot>;
      revokeCompanionPairing: () => Promise<CompanionSnapshot>;
      acceptIncomingScript: (transferId: string) => Promise<CompanionActionResult>;
      dismissIncomingScript: (transferId: string) => Promise<CompanionActionResult>;
      onCompanionState: (callback: (snapshot: CompanionSnapshot) => void) => () => void;
      onTeleprompterData: (callback: (data: TeleprompterData) => void) => () => void;
      onTeleprompterStatus: (callback: (status: TeleprompterStatus) => void) => () => void;
    };
  }
}

export {};
