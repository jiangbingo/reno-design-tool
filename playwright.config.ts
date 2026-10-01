import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 1,
  use: {
    viewport: { width: 1680, height: 1050 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
});
