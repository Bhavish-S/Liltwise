import type { AppInfo } from '@liltwise/contracts';

declare global {
  interface Window {
    liltwise: {
      getAppInfo: () => Promise<AppInfo>;
    };
  }
}

export {};
