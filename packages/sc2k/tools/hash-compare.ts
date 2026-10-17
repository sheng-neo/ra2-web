/// <reference types="node" />
// ===== tools/hash-compare.ts =====（ARCHITECTURE §10.1 确定性；WORKPLAN §7 第 5 条）
// 双跑哈希比对：同 seed + 同脚本独立跑两次，逐年比较 hash('full') / hash('sc2')；可选第三跑 = 第一跑的命令日志重放（replayInto）；
// 可选与 tools/headless.ts 的 JSON 基线逐年比对。任一不一致 → 退出码 1。
// 用法：tsx tools/hash-compare.ts --years N [--seed S] [--variant full|noPower|noRoad] [--baseline file.json] [--no-replay] [--quiet]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { GoldenMiniCityVariant } from '../src/contracts/testkit';
import { createWiredHost } from '../src/app/wire';
import { replayInto } from '../src/sim/core';
import { DAYS_PER_YEAR, goldenMiniCity, runHeadless } from '../src/testkit';
import type { YearRecord } from '../src/testkit';

interface Args { years: number; seed?: number; variant: GoldenMiniCityVariant; baseline?: string; replay: boolean; quiet: boolean }
interface BaselineYear { year: number; hash: number; hashSc2?: number }

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = { years: 3, variant: 'full', replay: true, quiet: false };
  for (let k = 0; k < argv.length; k++) {
    const key = argv[k]!, next = (): string => { const v = argv[++k]; if (v === undefined) throw new Error(`参数 ${key} 缺少值`); return v; };
    switch (key) {
      case '--years': a.years = Number(next()); break;
      case '--seed': a.seed = Number(next()) >>> 0; break;
      case '--variant': { const v = next(); if (v !== 'full' && v !== 'noPower' && v !== 'noRoad') throw new Error(`未知 variant "${v}"`); a.variant = v; break; }
      case '--baseline': a.baseline = next(); break;
      case '--no-replay': a.replay = false; break;
      case '--quiet': a.quiet = true; break;
      case '--help': case '-h': console.log('用法：tsx tools/hash-compare.ts --years N [--seed S] [--variant v] [--baseline file.json] [--no-replay] [--quiet]'); process.exit(0); break;
      default: throw new Error(`未知参数 "${key}"`);
    }
  }
  if (!Number.isFinite(a.years) || a.years < 0) throw new Error('--years 必须是非负整数');
  return a;
}

const hex = (n: number): string => n.toString(16).padStart(8, '0');

/** 逐年比对两组记录；返回差异描述。 */
export function diffYears(label: string, a: readonly { year: number; hash: number; hashSc2?: number }[], b: readonly { year: number; hash: number; hashSc2?: number }[]): string[] {
  const out: string[] = [];
  if (a.length !== b.length) out.push(`${label}: 年数不同 ${a.length} vs ${b.length}`);
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    const x = a[k]!, y = b[k]!;
    if (x.year !== y.year) out.push(`${label}: 第 ${k} 条年份不同 ${x.year} vs ${y.year}`);
    if (x.hash !== y.hash) out.push(`${label}: 第 ${x.year} 年 hash(full) ${hex(x.hash)} ≠ ${hex(y.hash)}`);
    if (x.hashSc2 !== undefined && y.hashSc2 !== undefined && x.hashSc2 !== y.hashSc2) out.push(`${label}: 第 ${x.year} 年 hash(sc2) ${hex(x.hashSc2)} ≠ ${hex(y.hashSc2)}`);
  }
  return out;
}

function main(): number {
  let args: Args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`hash-compare: ${e instanceof Error ? e.message : String(e)}`); return 2; }
  const script = goldenMiniCity(args.variant);
  const seed = args.seed ?? script.params.seed;
  const run = (): { host: ReturnType<typeof createWiredHost>; years: YearRecord[] } => {
    const host = createWiredHost();
    const years = runHeadless(host, script, { years: args.years, seed, invariants: false, now: () => performance.now() });
    return { host, years };
  };
  const t0 = performance.now();
  const A = run(), B = run();
  const problems = diffYears('双跑 A vs B', A.years, B.years);
  if (args.replay) {
    // 第三跑：A 的命令日志重放（日志里的命令在 A 中已成功派发；重放应逐年复现）
    const log = A.host.commandLog();
    const host = createWiredHost();
    host.newCity({ ...script.params, seed });
    const years: { year: number; hash: number; hashSc2: number }[] = [];
    replayInto(host, log, args.years * DAYS_PER_YEAR, { onDay: (age) => { if (age % DAYS_PER_YEAR === 0) years.push({ year: age / DAYS_PER_YEAR, hash: host.hash('full'), hashSc2: host.hash('sc2') }); } });
    problems.push(...diffYears('重放 vs A', years, A.years));
  }
  if (args.baseline) {
    const raw = JSON.parse(readFileSync(resolve(args.baseline), 'utf8')) as { years?: BaselineYear[]; meta?: { seed?: number; variant?: string } };
    if (!raw.years) problems.push('基线文件没有 years 数组');
    else {
      if (raw.meta?.seed !== undefined && raw.meta.seed !== seed) problems.push(`基线 seed ${raw.meta.seed} ≠ 本次 ${seed}`);
      if (raw.meta?.variant !== undefined && raw.meta.variant !== args.variant) problems.push(`基线 variant ${raw.meta.variant} ≠ 本次 ${args.variant}`);
      problems.push(...diffYears('基线 vs A', raw.years.slice(0, A.years.length), A.years));
    }
  }
  if (!args.quiet) {
    console.log(`hash-compare: variant ${args.variant} seed ${seed} years ${args.years}（${Math.round(performance.now() - t0)} ms）`);
    for (const y of A.years) console.log(`  year ${String(y.year).padStart(3)}  full ${hex(y.hash)}  sc2 ${hex(y.hashSc2)}`);
  }
  if (problems.length > 0) { for (const p of problems) console.error(`hash-compare: ${p}`); return 1; }
  if (!args.quiet) console.log('hash-compare: 全部一致');
  return 0;
}

process.exitCode = main();
