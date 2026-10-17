/// <reference types="node" />
// ===== tools/headless.ts =====（ARCHITECTURE §10.4 / §10.5 / §10.6；WORKPLAN §7 第 4 条）
// 无头长跑：用 app/wire.ts 的 createWiredHost()（DOM-free 半边；tools/ 是允许 import app 的唯一地方）跑金城脚本 N 年，每年输出
//   { year, hash, pop, funds, phaseMsP95, growthDayMsP95, runTrips }，不变量违规计入退出码；可选 CPU 合成缩略图（e2e 降级路径）。
// 金城脚本假设全平地（GOLDEN_LAYOUT 的电线 / 道路不能落在坡面上）：与 longrun.test 一样在 newCity 后 flattenTerrain（hills 0 的生成器仍有两级起伏，spec:terrain §3）。
// 用法：tsx tools/headless.ts --years N [--script golden-mini-city] [--variant full|noPower|noRoad] [--seed S] [--out file.json]
//                             [--thumbnail out.png] [--quiet] [--strict-wire]
// 退出码：0 全部通过；1 不变量违规 / 缩略图单色；2 参数错误 / 严格接线检查失败（WIRE_STUB_ALLOWLIST 非空，open-questions #24）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { RenderSnapshot } from '../src/contracts/render';
import { mapCanvasSize } from '../src/contracts/render';
import type { GoldenMiniCityVariant } from '../src/contracts/testkit';
import { WIRE_STUB_ALLOWLIST, createWiredHost, createWiredProvider } from '../src/app/wire';
import { sceneCompiler } from '../src/render/scene';
import { flattenTerrain, goldenMiniCity, isMonochrome, pngOf, runHeadless, simContextOf } from '../src/testkit';
import type { YearRecord } from '../src/testkit';
import { cpuCompositor } from '../src/render/cpu';   // 直接取纯函数层（不经 render/index 拉入 Pixi）

interface Args { years: number; script: string; variant: GoldenMiniCityVariant; seed?: number; out?: string; thumbnail?: string; quiet: boolean; strictWire: boolean }

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = { years: 3, script: 'golden-mini-city', variant: 'full', quiet: false, strictWire: process.env.SC2K_STRICT_WIRE === '1' };
  for (let k = 0; k < argv.length; k++) {
    const key = argv[k]!, next = (): string => { const v = argv[++k]; if (v === undefined) throw new Error(`参数 ${key} 缺少值`); return v; };
    switch (key) {
      case '--years': a.years = Number(next()); break;
      case '--script': a.script = next(); break;
      case '--variant': { const v = next(); if (v !== 'full' && v !== 'noPower' && v !== 'noRoad') throw new Error(`未知 variant "${v}"`); a.variant = v; break; }
      case '--seed': a.seed = Number(next()) >>> 0; break;
      case '--out': a.out = next(); break;
      case '--thumbnail': a.thumbnail = next(); break;
      case '--quiet': a.quiet = true; break;
      case '--strict-wire': a.strictWire = true; break;
      case '--help': case '-h': printUsage(); process.exit(0); break;
      default: throw new Error(`未知参数 "${key}"`);
    }
  }
  if (!Number.isFinite(a.years) || a.years < 0) throw new Error('--years 必须是非负整数');
  if (a.script !== 'golden-mini-city') throw new Error(`未知脚本 "${a.script}"（目前只有 golden-mini-city）`);
  return a;
}
function printUsage(): void {
  console.log('用法：tsx tools/headless.ts --years N [--script golden-mini-city] [--variant full|noPower|noRoad] [--seed S] [--out file.json] [--thumbnail out.png] [--quiet] [--strict-wire]');
}

const fmt = (n: number): string => n.toFixed(2).padStart(7);
function printYear(r: YearRecord): void {
  const worst = (Object.entries(r.phaseMsP95) as [string, number][]).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([id, ms]) => `${id} ${ms.toFixed(2)}ms`).join(' / ');
  console.log(`year ${String(r.year).padStart(3)}  age ${String(r.age).padStart(6)}  hash ${r.hash.toString(16).padStart(8, '0')}  pop ${String(r.pop).padStart(7)}  funds ${String(r.funds).padStart(9)}  growthDay p95 ${fmt(r.growthDayMsP95)} ms  trips ${r.runTrips}  worst: ${worst}${r.invariants.length ? `  !! ${r.invariants.length} 项不变量违规` : ''}`);
  for (const v of r.invariants) console.log(`    - ${v}`);
}

/** 中部 1024×768 的 M 档缩略图（零视图：zoom 2、rotation 0、无地下、无热力）。 */
function thumbnail(host: ReturnType<typeof createWiredHost>): { png: Uint8Array; monochrome: boolean } {
  const s = host.state;
  const snap: RenderSnapshot = {
    layers: s.layers, maps: s.maps, markers: host.q.disasters.markers(),
    view: { zoom: 2, rotation: 0, centerX: 64, centerY: 64, underground: false, show: { buildings: true, signs: true, infrastructure: true, zones: true }, mapLayer: null },
    seaLevel: s.terrain.seaLevel, artScale: 'M', trafficLight: 48, trafficHeavy: 160,
  };
  const items = sceneCompiler.compileAll(snap);
  const size = mapCanvasSize(2);
  const rect = { x: Math.floor(size.w / 2) - 512, y: Math.floor(size.h / 2) - 384, w: 1024, h: 768 };
  const provider = createWiredProvider();
  const bmp = cpuCompositor.render(items, provider, 'M', rect);
  return { png: pngOf(items, provider, 'M', rect).png, monochrome: isMonochrome(bmp) };
}

function main(): number {
  let args: Args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`headless: ${e instanceof Error ? e.message : String(e)}`); printUsage(); return 2; }
  if (args.strictWire && WIRE_STUB_ALLOWLIST.length > 0) {
    console.error(`headless: SC2K_STRICT_WIRE：WIRE_STUB_ALLOWLIST 仍含 ${WIRE_STUB_ALLOWLIST.join(', ')}`);
    return 2;
  }
  const host = createWiredHost();
  const script = goldenMiniCity(args.variant);
  const stubs = host.systems.filter((s) => s.stub).map((s) => s.id);
  if (!args.quiet) console.log(`headless: script ${args.script} variant ${args.variant} seed ${args.seed ?? script.params.seed} years ${args.years}; 桩系统：${stubs.length ? stubs.join(', ') : '无'}`);
  const t0 = performance.now();
  const records = runHeadless(host, script, { years: args.years, seed: args.seed, now: () => performance.now(), onYear: args.quiet ? undefined : printYear, afterNewCity: (h) => flattenTerrain(h.state) });
  const elapsed = performance.now() - t0;
  const failures = records.flatMap((r) => r.invariants.map((v) => `year ${r.year}: ${v}`));
  const diag = simContextOf(host).diag.slice(-50);   // 最近 50 条诊断（core.countsMismatch / 桩忽略的模态回答等）
  let thumb: { png: Uint8Array; monochrome: boolean } | null = null;
  if (args.thumbnail) {
    thumb = thumbnail(host);
    mkdirSync(dirname(resolve(args.thumbnail)), { recursive: true });
    writeFileSync(resolve(args.thumbnail), thumb.png);
    if (!args.quiet) console.log(`headless: 缩略图 → ${resolve(args.thumbnail)}（${thumb.png.length} B，${thumb.monochrome ? '单色!' : '非单色'}）`);
  }
  const report = {
    meta: { script: args.script, variant: args.variant, seed: args.seed ?? script.params.seed, years: args.years, flat: true, stubs, elapsedMs: Math.round(elapsed), commandsDispatched: host.commandLog().length },
    years: records.map((r) => ({ year: r.year, age: r.age, hash: r.hash, hashSc2: r.hashSc2, pop: r.pop, funds: r.funds, phaseMsP95: r.phaseMsP95, growthDayMsP95: r.growthDayMsP95, runTrips: r.runTrips })),
    invariantFailures: failures,
    thumbnailMonochrome: thumb?.monochrome ?? null,
    diag,
  };
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), JSON.stringify(report, null, 2));
    if (!args.quiet) console.log(`headless: JSON → ${resolve(args.out)}`);
  }
  if (!args.quiet) console.log(`headless: ${records.length} 年，${Math.round(elapsed)} ms，日志命令 ${host.commandLog().length} 条，最终 hash(full) ${records.at(-1)?.hash.toString(16) ?? '-'}`);
  if (failures.length > 0) { console.error(`headless: ${failures.length} 项不变量违规`); return 1; }
  if (thumb?.monochrome) { console.error('headless: 缩略图为单色'); return 1; }
  return 0;
}

process.exitCode = main();
