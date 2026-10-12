import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Liltwise',
    asar: true,
    appBundleId: 'com.liltwise.desktop',
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      config: {},
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: { name: 'liltwise' },
      platforms: ['win32'],
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
      concurrent: 2,
      hotRestart: true,
    }),
  ],
};

export default config;
