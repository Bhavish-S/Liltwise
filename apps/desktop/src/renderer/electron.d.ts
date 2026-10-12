import type {
  AppInfo,
  TeleprompterActionResult,
  TeleprompterData,
  TeleprompterStatus,
} from '@liltwise/contracts';

declare global {
  interface Window {
    liltwise: {
      getAppInfo: () => Promise<AppInfo>;
      getTeleprompterStatus: () => Promise<TeleprompterStatus>;
      openTeleprompter: (data: TeleprompterData) => Promise<TeleprompterActionResult>;
      updateTeleprompter: (data: TeleprompterData) => Promise<TeleprompterActionResult>;
      hideTeleprompter: () => Promise<TeleprompterStatus>;
      onTeleprompterData: (callback: (data: TeleprompterData) => void) => () => void;
      onTeleprompterStatus: (callback: (status: TeleprompterStatus) => void) => () => void;
    };
  }
}

export {};
