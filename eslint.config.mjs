import eslint from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/.next/**', '**/node_modules/**', '**/.vite/**', '**/out/**', '**/dist/**', '**/coverage/**', 'pnpm-lock.yaml'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/site/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: nextPlugin.configs.recommended.rules,
    settings: {
      next: {
        rootDir: 'apps/site/',
      },
    },
  },
);
