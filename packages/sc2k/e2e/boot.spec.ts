// ===== e2e/boot.spec.ts =====（WP0 冒烟：标题页 → 新城 → 画布存在且非单色 → 截图；WP12 接手后并入 smoke.spec.ts）
import { expect, test } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// window.__sc2k 的类型由 src/app/boot.ts 的 declare global 提供（e2e 与 src 同在 tsconfig.json 的 include 内）。

const here = dirname(fileURLToPath(import.meta.url));
const SHOT = resolve(here, 'output/boot.png');

/** 画布上出现的不同颜色数（抽样步长 prime，最多数到 limit）。 */
const distinctColors = (limit: number): number => {
  const c = document.querySelector('canvas');
  if (!c) return 0;
  const ctx = c.getContext('2d');
  if (!ctx) return 0;
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set<number>();
  for (let i = 0; i < d.length && seen.size < limit; i += 4 * 7) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
  return seen.size;
};

test('标题页 → 新城 → 画布非单色', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?debug');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('new-city').click();
  await expect(page.getByTestId('title')).toHaveCount(0);

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__sc2k));
  await expect.poll(() => page.evaluate(distinctColors, 8), { timeout: 15_000 }).toBeGreaterThan(1);

  // 调试句柄可读：host / renderer / shell / version
  const debug = await page.evaluate(() => {
    const h = window.__sc2k!;
    return { version: h.version, age: h.host.state.clock.age, stats: h.renderer.stats(), hasShell: typeof h.shell.showTitle === 'function' };
  });
  expect(debug.version).toBeTruthy();
  expect(debug.hasShell).toBe(true);
  expect(debug.stats).toHaveProperty('drawCalls');

  await page.screenshot({ path: SHOT });
  expect(errors, errors.join('\n')).toEqual([]);
});
