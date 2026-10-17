// ===== e2e/playwright.config.ts =====（WP0；WP12 接手 smoke.spec / hash.spec）
// Chromium 已预装在 /opt/pw-browsers/chromium（不经 `playwright install`）；webServer 用 vite dev（端口 5174，strictPort）。
// CI 以 SC2K_E2E=skip 跳过（ARCHITECTURE §10.6 降级）。
import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env['SC2K_E2E_PORT'] ?? 5174);   // 并行 worktree 下用 SC2K_E2E_PORT 指定私有端口
const CHROMIUM = process.env['SC2K_CHROMIUM'] ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  outputDir: resolve(here, 'output/test-results'),
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-gpu'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: resolve(here, '..'),
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 90_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
