// ===== sim/utilities/scan.ts =====（spec:power-water §2.4 / §2.9 / §3.3：电 / 水的两遍洪水填充）
// 纯函数：只读 XBLD / ALT / 天气标量，只写 XBIT 的 POWERED / WATERED 位；遍历顺序 = 线性索引升序（x 外层、y 内层），
// 邻居顺序 = tune.neighborOrder（默认索引增量 −1, −128, +1, +128）。所有 (x, y) ↔ i 换算经 contracts/grid，禁止自算。
// 与规格伪代码的偏差：①访问标记 scratch.mark 在整次扫描内不清零（它同时充当"已处理网络"标记），
// 因此同一网络绝不会因容量不足导致电厂格未受电而被第二次遍历与重复计数；
// ②风 / 太阳能"每格每月抽一次"（§2.3.2 / §2.3.3）用本月种子 + hash32(种子, 格) 派生：月度扫描在第一遍遇到第一座风 / 太阳能格时
// 恰消费一次 PRNG 取种，月内任何重扫（生长 / 命令触发的日末 flush）复用同一种子，同一格产量不变，断电边界不再每日漂移。
import { DEVELOPED_FIRST, TILES, XBit, inMap, tileIndex, tileX, tileY } from '../../contracts/grid';
import { hash32 } from '../../contracts/prng';
import type { PowerReport, WaterReport } from '../../contracts/state';
import { OUT_FIXED, OUT_NONE, OUT_SOLAR, OUT_WIND, PLANT_CELL_OUTPUT, PLANT_OUTPUT_MODE, XBLD_DESAL, XBLD_PUMP, XBLD_TOWER, XBLD_TREATMENT, isWaterSourceTile } from './defs';
import type { UtilitiesTuning } from './tuning';

/** 扫描临时区（闭包持有，不进存档）：mark 访问标记、order 访问顺序（兼作 BFS 队列）。 */
export interface ScanScratch { mark: Uint8Array; order: Int32Array }
export const createScratch = (): ScanScratch => ({ mark: new Uint8Array(TILES), order: new Int32Array(TILES) });

/**
 * 风 / 太阳能的本月抽样源。seed = 本月种子（0..2³¹−1；−1 = 没有 → 取分布中值 floor((n − 1) / 2)：读档后的无 PRNG 重扫、
 * 本月月度扫描时尚无风 / 太阳能格而月中新建的情形）；drawSeed = 惰性取种（只有月度 powerScan 提供：第一次需要时调用一次，
 * 即恰消费一个 next32）。扫描结束后 seed 为本次实际使用的种子，调用方写回 priv。
 */
export interface FormulaSeed { seed: number; drawSeed: (() => number) | null }
/** 无种子（读档重扫 / 纯函数测试）。 */
export const noFormulaSeed = (): FormulaSeed => ({ seed: -1, drawSeed: null });

/** 均匀整数 [0, n)：有种子时 = hash32(seed, i) mod n（同月同格恒定）；无种子取中值。 */
function formulaInt(f: FormulaSeed, i: number, n: number): number {
  if (f.seed < 0 && f.drawSeed) f.seed = f.drawSeed() >>> 1;                // 31 位非负（priv 只收 i32；−1 留作"无种子"）
  if (n <= 0) return 0;
  return f.seed < 0 ? (n - 1) >> 1 : hash32(f.seed, i) % n;
}

export interface PowerScanInput {
  xbld: Uint8Array; xbit: Uint8Array; alt: Uint8Array;
  wind: number; humid: number;                 // MISC.Wind / MISC.Humid（取低 8 位）
  energyConservation: boolean;                 // Energy Conservation 法令：容量 += floor(容量 / 12)
  formula: FormulaSeed; tune: UtilitiesTuning; scratch: ScanScratch;
}
/** 一张电网的汇总（调试 / 查询窗口 / 测试用）；start = 该网络第一座被遍历到的电厂格（索引最小）。 */
export interface PowerNetwork { start: number; capacity: number; consumers: number; supplied: number; tiles: number }
/** seed = 本次扫描结束时的风 / 太阳能种子（−1 = 未取种）。 */
export interface PowerScanResult { report: PowerReport; networks: PowerNetwork[]; seed: number }

export interface WaterScanInput {
  xbld: Uint8Array; xbit: Uint8Array;
  treatmentCells: number;                      // counts.tile[0xF4]
  humid: number; waterLevel: number;           // MISC.Humid / MISC.WaterLevel
  tune: UtilitiesTuning; scratch: ScanScratch;
}
export interface WaterNetwork { start: number; supply: number; consumers: number; served: number; towerCapacity: number; towersCharged: number; tiles: number }
export interface WaterScanResult { report: WaterReport; networks: WaterNetwork[] }

interface NeighborTable { dx: Int8Array; dy: Int8Array }
function neighborTable(tune: UtilitiesTuning): NeighborTable {
  const n = tune.neighborOrder.length;
  const dx = new Int8Array(n), dy = new Int8Array(n);
  for (let k = 0; k < n; k++) { dx[k] = tune.neighborOrder[k]![0]; dy[k] = tune.neighborOrder[k]![1]; }
  return { dx, dy };
}

/** 以 i 为中心的 3×3（越界跳过）中 (xbit & (Water|SaltWater)) 恰为淡水 / 咸水的格数（spec §3.3 count3x3）。 */
export function count3x3(xbit: Uint8Array, i: number, salt: boolean): number {
  const cx = tileX(i), cy = tileY(i);
  const want = salt ? XBit.Water | XBit.SaltWater : XBit.Water;
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = cx + dx, y = cy + dy;
    if (!inMap(x, y)) continue;
    if ((xbit[tileIndex(x, y)]! & (XBit.Water | XBit.SaltWater)) === want) n++;
  }
  return n;
}

/** 电厂格 i（XBLD = b）的本月产量：固定表 / 风 / 太阳能抽样（spec §2.3.2 / §2.3.3）；风 / 太阳能按本月种子逐格派生（见 FormulaSeed）。 */
export function plantCellOutput(inp: Pick<PowerScanInput, 'alt' | 'wind' | 'humid' | 'formula' | 'tune'>, b: number, i: number): number {
  const mode = PLANT_OUTPUT_MODE[b]!;
  if (mode === OUT_FIXED) return PLANT_CELL_OUTPUT[b]!;
  if (mode === OUT_WIND) {
    const gust = Math.floor((inp.wind & 0xff) / inp.tune.windGustDiv);
    const r = formulaInt(inp.formula, i, gust + 1);                          // rngInt(0, gust) 闭区间
    return Math.floor((inp.alt[i]! + r) / 2);
  }
  if (mode === OUT_SOLAR) {
    const range = Math.max(1, Math.floor((100 - (inp.humid & 0xff)) / inp.tune.solarRangeDiv));
    return formulaInt(inp.formula, i, range) + inp.tune.solarBase;           // rngInt(0, range − 1) + 5
  }
  return 0;
}

/** 电力扫描：清 POWERED → 按索引升序对每座未处理电厂格做两遍 BFS → 汇总。 */
export function runPowerScan(inp: PowerScanInput): PowerScanResult {
  const { xbld, xbit, tune, scratch } = inp;
  const mark = scratch.mark, order = scratch.order;
  const nb = neighborTable(tune);
  const limit = tune.legacyTraceQueue;
  for (let i = 0; i < TILES; i++) xbit[i] = xbit[i]! & ~XBit.Powered;
  mark.fill(0);
  let generation = 0, consumers = 0, supplied = 0;
  const networks: PowerNetwork[] = [];
  for (let start = 0; start < TILES; start++) {
    if (PLANT_OUTPUT_MODE[xbld[start]!] === OUT_NONE || mark[start] !== 0) continue;
    // 第一遍：发现网络、累加容量与消费者、记录访问顺序
    let head = 0, tail = 0;
    order[tail++] = start; mark[start] = 1;
    let capacity = 0, netConsumers = 0;
    while (head < tail) {
      const i = order[head++]!, b = xbld[i]!;
      if (PLANT_OUTPUT_MODE[b] !== OUT_NONE) capacity += plantCellOutput(inp, b, i);
      else if (b >= DEVELOPED_FIRST) netConsumers++;
      const x = tileX(i), y = tileY(i);
      for (let d = 0; d < nb.dx.length; d++) {
        const nx = x + nb.dx[d]!, ny = y + nb.dy[d]!;
        if (!inMap(nx, ny)) continue;
        const j = tileIndex(nx, ny);
        if (mark[j] === 0 && (xbit[j]! & XBit.Powerable) !== 0) { mark[j] = 1; order[tail++] = j; }
      }
      // 原版 512 项环形队列的近似复现：待扩展项超过容量时最旧的不再扩展（默认关闭）
      if (limit !== 0 && tail - head > limit) head = tail - limit;
    }
    if (inp.energyConservation) capacity += Math.floor(capacity / tune.energyConservationDiv);
    // 第二遍：按访问顺序供电，建筑格（含电厂格）各扣 1，电线不扣
    let budget = capacity;
    for (let k = 0; k < tail; k++) {
      const i = order[k]!;
      if (budget === 0) break;
      xbit[i] = xbit[i]! | XBit.Powered;
      if (xbld[i]! >= DEVELOPED_FIRST) budget--;
    }
    const sup = Math.min(capacity, netConsumers);
    generation += capacity; consumers += netConsumers; supplied += sup;
    networks.push({ start, capacity, consumers: netConsumers, supplied: sup, tiles: tail });
  }
  let unpowered = 0;
  for (let i = 0; i < TILES; i++) {
    const v = xbit[i]!;
    if (xbld[i]! >= DEVELOPED_FIRST && (v & XBit.Powerable) !== 0 && (v & XBit.Powered) === 0) unpowered++;
  }
  const usagePct = generation > 0 ? Math.min(100, Math.floor((supplied * 100) / generation)) : 100;
  return { report: { generation, consumers, supplied, usagePct, unpoweredBuildingTiles: unpowered }, networks, seed: inp.formula.seed };
}

/** 供水扫描：在电力扫描之后运行（水源需要本月 POWERED）；水塔格保留蓄水位，其余格清 WATERED。 */
export function runWaterScan(inp: WaterScanInput): WaterScanResult {
  const { xbld, xbit, tune, scratch } = inp;
  const mark = scratch.mark, order = scratch.order;
  const nb = neighborTable(tune);
  const limit = tune.legacyTraceQueue;
  const units = tune.towerUnitsPerCell;
  for (let i = 0; i < TILES; i++) if (xbld[i] !== XBLD_TOWER) xbit[i] = xbit[i]! & ~XBit.Watered;
  mark.fill(0);
  const base = Math.floor((inp.humid & 0xff) / tune.pumpRainDiv) + inp.waterLevel * tune.pumpWaterLevelMul;
  let supply = 0, consumers = 0, watered = 0, towerCapacity = 0, towerCharged = 0;
  const networks: WaterNetwork[] = [];
  for (let start = 0; start < TILES; start++) {
    if (!isWaterSourceTile(xbld[start]!) || mark[start] !== 0 || (xbit[start]! & XBit.Powered) === 0) continue;
    // 第一遍：沿 PIPED 发现网络；水泵 / 淡化产水、水塔放水、其余建筑计为消费者
    let head = 0, tail = 0;
    order[tail++] = start; mark[start] = 1;
    let netSupply = 0, netConsumers = 0, towerCap = 0;
    while (head < tail) {
      const i = order[head++]!, b = xbld[i]!;
      if (b >= DEVELOPED_FIRST) {
        if (b === XBLD_PUMP) { if ((xbit[i]! & XBit.Powered) !== 0) netSupply += base + tune.pumpFreshBonus * count3x3(xbit, i, false); }
        else if (b === XBLD_TOWER) {
          towerCap += units;
          if ((xbit[i]! & XBit.Watered) !== 0) { netSupply += units; xbit[i] = xbit[i]! & ~XBit.Watered; }
        } else if (b === XBLD_DESAL) { if ((xbit[i]! & XBit.Powered) !== 0) netSupply += tune.desalSaltBonus * count3x3(xbit, i, true); }
        else if (b !== XBLD_TREATMENT) netConsumers++;
      }
      const x = tileX(i), y = tileY(i);
      for (let d = 0; d < nb.dx.length; d++) {
        const nx = x + nb.dx[d]!, ny = y + nb.dy[d]!;
        if (!inMap(nx, ny)) continue;
        const j = tileIndex(nx, ny);
        if (mark[j] === 0 && (xbit[j]! & XBit.Piped) !== 0) { mark[j] = 1; order[tail++] = j; }
      }
      if (limit !== 0 && tail - head > limit) head = tail - limit;
    }
    const served = Math.min(netSupply, netConsumers);
    let towersToFill = Math.floor((Math.min(netSupply - served, towerCap) + tune.towerRoundHalf) / units);
    let left = served, charged = 0;
    // 第二遍：按同一顺序重放
    for (let k = 0; k < tail; k++) {
      const i = order[k]!, b = xbld[i]!;
      if (b < DEVELOPED_FIRST) { if (left !== 0) xbit[i] = xbit[i]! | XBit.Watered; }
      else if (b === XBLD_PUMP || b === XBLD_TREATMENT || b === XBLD_DESAL) { if ((xbit[i]! & XBit.Powered) !== 0) xbit[i] = xbit[i]! | XBit.Watered; }
      else if (b === XBLD_TOWER) {
        if ((xbit[i]! & XBit.Powered) !== 0 && towersToFill > 0) { xbit[i] = xbit[i]! | XBit.Watered; towersToFill--; charged++; }
      } else if (left !== 0) { xbit[i] = xbit[i]! | XBit.Watered; left--; }
    }
    supply += netSupply; consumers += netConsumers; watered += served; towerCapacity += towerCap; towerCharged += charged;
    networks.push({ start, supply: netSupply, consumers: netConsumers, served, towerCapacity: towerCap, towersCharged: charged, tiles: tail });
  }
  const usagePct = supply > 0 ? Math.floor((watered * 100) / supply) : 100;
  const treatmentCapacity = Math.floor(inp.treatmentCells / tune.treatmentCellsPerPlant) * tune.treatmentTilesPerPlant;
  const treatmentSufficient = watered <= treatmentCapacity;
  let unwatered = 0;
  for (let i = 0; i < TILES; i++) if (xbld[i]! >= DEVELOPED_FIRST && (xbit[i]! & XBit.Watered) === 0) unwatered++;
  return {
    report: { supply, consumers, watered, usagePct, towerCapacity, towerCharged, treatmentCapacity, treatmentSufficient, unwateredBuildingTiles: unwatered },
    networks,
  };
}
