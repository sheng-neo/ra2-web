/// <reference types="node" />
// ===== tools/gen-catalogue.ts =====（WORKPLAN §1 第 4 项；spec:building-catalogue §3.6）
// 解析 docs/spec/building-catalogue.md §2.2–§2.9 的 Markdown 表格 → src/data/buildings.generated.ts（恰 256 条，按 id 升序）。
// 表中缺的字段按 spec §3.1 / §3.2 的派生规则与默认值补齐；zone.weight 取自 spec:zones-growth-demand §2.3 的 w 列。
// 用法：tsx tools/gen-catalogue.ts            生成并写入
//       tsx tools/gen-catalogue.ts --check    只比对（产物漂移 → 退出码 1，供 CI）
// 产物稳定：无时间戳、字段顺序固定；"参考名"只进行尾注释，不进数据。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildingCategory, BuildingDef, BudgetLineKey, OrientMode, TechKey } from '../src/contracts/catalogue';
import type { Footprint } from '../src/contracts/footprint';
import { FOOTPRINT } from '../src/contracts/footprint';
import { TOOLS } from '../src/data/tools';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const SPEC = resolve(PKG, 'docs/spec/building-catalogue.md');
const ZONES_SPEC = resolve(PKG, 'docs/spec/zones-growth-demand.md');
const OUT = resolve(PKG, 'src/data/buildings.generated.ts');

// ---------- Markdown 表格解析 ----------
interface Table { header: string[]; rows: string[][]; line: number }

/** 去掉反引号 / 粗体标记 / 首尾空白。 */
const clean = (s: string): string => s.replace(/`/g, '').replace(/\*\*/g, '').trim();

/** 抽取文中全部 Markdown 表格（从 `## 2.` 到 `## 3.` 之间）。 */
function parseTables(md: string, from: RegExp, to: RegExp): Table[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => from.test(l));
  const endRel = lines.slice(start + 1).findIndex((l) => to.test(l));
  const end = endRel < 0 ? lines.length : start + 1 + endRel;
  const tables: Table[] = [];
  let cur: string[][] | null = null, curLine = 0;
  for (let i = start; i < end; i++) {
    const l = lines[i]!;
    if (l.startsWith('|')) {
      const cells = l.slice(1, l.endsWith('|') ? -1 : undefined).split('|').map(clean);
      if (!cur) { cur = []; curLine = i + 1; }
      cur.push(cells);
    } else if (cur) {
      flush(); cur = null;
    }
  }
  flush();
  return tables;
  function flush(): void {
    if (!cur || cur.length < 2) return;
    const [header, sep, ...rows] = cur;
    if (!header || !sep || !sep.every((c) => /^:?-+:?$/.test(c))) return;
    tables.push({ header, rows: rows.filter((r) => r.length === header.length), line: curLine });
  }
}

const hex = (id: number): string => `0x${id.toString(16).toUpperCase().padStart(2, '0')}`;
const parseHex = (s: string): number => parseInt(s.replace(/^0x/i, ''), 16);
/** "0x0E–0x1C" / "0x5A/0x5B" / "0x49–0x50, 0x61–0x69" → id 列表。 */
function idsOf(cell: string): number[] {
  const out: number[] = [];
  for (const m of cell.matchAll(/0x([0-9A-Fa-f]{2})(?:\s*[–-]\s*0x([0-9A-Fa-f]{2}))?/g)) {
    const lo = parseInt(m[1]!, 16), hi = m[2] ? parseInt(m[2], 16) : lo;
    for (let id = lo; id <= hi; id++) out.push(id);
  }
  return out;
}
/** 第一个 "$1,300" → 1300；无则 undefined。 */
const dollars = (s: string): number | undefined => {
  const m = /\$\s*([\d,]+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]!.replace(/,/g, '')) : undefined;
};
const intOf = (s: string): number => Number(clean(s).replace(/,/g, '').match(/-?\d+/)?.[0] ?? 0);
const sizeOf = (s: string): Footprint => Number(/^(\d)x\d/.exec(clean(s))?.[1] ?? 1) as Footprint;
const col = (t: Table, name: string | RegExp): number => {
  const i = t.header.findIndex((h) => (typeof name === 'string' ? h === name : name.test(h)));
  if (i < 0) throw new Error(`表（第 ${t.line} 行）缺少列 ${String(name)}：${t.header.join(' | ')}`);
  return i;
};

// ---------- 常量映射（来源见注释） ----------
const BUDGET_LINE: Record<string, BudgetLineKey> = {
  Roads: 'roads', Tunnel: 'tunnel', Rail: 'rail', Highways: 'highways', Bridges: 'bridges', Subway: 'subway',
  Police: 'police', Fire: 'fire', Health: 'health', 'Education-Schools': 'schools', 'Education-Colleges': 'colleges',
};
const TECH: ReadonlyArray<[RegExp, TechKey]> = [
  [/^Gas/, 'gas'], [/^Nuclear/, 'nuclear'], [/^Solar/, 'solar'], [/^Wind/, 'wind'], [/^Microwave/, 'microwave'], [/^Fusion/, 'fusion'],
  [/^Airport/, 'airport'], [/^Highways|^随高速/, 'highways'], [/^Buses/, 'buses'], [/^Subways|^随地铁/, 'subways'],
  [/^Water treatment/i, 'waterTreatment'], [/^Desalini[sz]ation/, 'desalinization'],
];
const techOf = (s: string): TechKey | undefined => TECH.find(([re]) => re.test(clean(s)))?.[1];
/** 桥对话框各桥型单价（spec §2.3.2）；0x58 同时服务堤道 / 开启桥，取两者中较低者。 */
const BRIDGE_KIND_COST: Record<string, number> = { Causeway: 25, Raising: 50, Suspension: 75, Reinforced: 200 };
/** 树木工具每次点击 $3（spec §2.2 正文）。 */
const TREE_CLICK_COST = 3;
/** 电厂微模拟类型（spec §2.5 通用说明：类型 1，风电 20、水电 21）。 */
const PLANT_MICROSIM = (key: string): number => (key.startsWith('wind') ? 20 : key.startsWith('hydro') ? 21 : 1);
/** 车站"独占"记录的类型号：spec 未给数值，按共享系统 20–25 之前的连续序号推断（公交 17 / 铁路 18 / 地铁 19），待 services 规格确认。 */
const STATION_MICROSIM: Record<string, number> = { busDepot: 17, railDepot: 18, subwayStation: 19 };
/** 奖励位（spec:file-formats MISC 0x0078；spec §2.11 把大穹顶误写为 bit4，此处按 file-formats / economy §2.9 取 bit3）。 */
const REWARD_BIT: Record<string, 0 | 1 | 2 | 3 | 4> = { mayorsHouse: 0, cityHall: 1, statue: 2, greatDome: 3 };
/** 规格表 §2.9 的 key 列沿用原版 Arcology 专名作标识符；本包按裁定 7 改用原创键名（key == TechKey == ToolId 后缀），按 ID 做唯一一次映射（不在代码里写原版标识符）。 */
const ARCO_TECH: Record<number, TechKey> = { 0xfb: 'arcoPioneer', 0xfc: 'arcoCanopy', 0xfd: 'arcoDusk', 0xfe: 'arcoSkyward' };

const warnings: string[] = [];
function warn(msg: string): void { warnings.push(msg); }

// ---------- 工具反查：id → 产生它的工具 ----------
const TOOL_OF = new Map<number, string>();
for (const t of TOOLS) for (const id of t.buildingIds ?? []) {
  if (TOOL_OF.has(id)) warn(`${hex(id)} 同时出现在工具 ${TOOL_OF.get(id)} 与 ${t.id} 的 buildingIds 中，取前者`);
  else TOOL_OF.set(id, t.id);
}

// ---------- 主流程 ----------
interface Draft { def: Partial<BuildingDef> & { id: number; key: string; category: BuildingCategory; size: Footprint }; refName?: string }
const drafts = new Map<number, Draft>();
function put(d: Draft): void {
  if (drafts.has(d.def.id)) throw new Error(`重复 id ${hex(d.def.id)}（${d.def.key} / ${drafts.get(d.def.id)!.def.key}）`);
  drafts.set(d.def.id, d);
}

const md = readFileSync(SPEC, 'utf8');
const tables = parseTables(md, /^## 2\. /, /^## 3\. /);
let shapeNames: string[] = [];
const zoneWeights = parseZoneWeights();                                     // spec:zones §2.3 的 w 列（先于主循环读入）

for (const t of tables) {
  const h = t.header;
  if (h[0] === 'k' && h.length === 16) {                                   // §2.3 形状码表：k 0..14 的形状名
    const shapeRow = t.rows.find((r) => r[0] === '形状');
    if (!shapeRow) throw new Error('形状码表缺少"形状"行');
    shapeNames = shapeRow.slice(1).map((s) => s.replace(/-/g, ''));
  } else if (h[0] === 'ID' && h.includes('可放置') && h.includes('产生方式 / 备注')) {
    parseGroundCover(t);
  } else if (h[0] === 'ID' && h.includes('可放置') && h.includes('朝向 / 备注')) {
    parseNetworkPieces(t);
  } else if (h[0] === '族') {
    parseNetworkFees(t);
  } else if (h[0] === 'ID' && h.includes('tier') && h.includes('popW')) {
    parseZoneBuildings(t);
  } else if (h[0] === 'ID' && h.includes('类别') && h.includes('popW')) {
    parseTransitions(t);
  } else if (h[0] === 'ID' && h.some((x) => x.startsWith('整厂产量'))) {
    parsePowerPlants(t);
  } else if (h[0] === 'ID' && h.includes('解锁')) {
    parseCivic(t);
  } else if (h[0] === 'ID' && h.includes('产 / 蓄水')) {
    parseWaterAndStations(t);
  } else if (h[0] === 'ID' && h.includes('军用')) {
    parseAutoParts(t);
  } else if (h[0] === 'ID' && h.includes('容量')) {
    parseArcologies(t);
  }
}

// ----- §2.2 地表覆盖 -----
function parseGroundCover(t: Table): void {
  const [cId, cKey, cRef, cCat, cSize, cPlace, cNote] = ['ID', 'key', '参考名', '类别', '尺寸', '可放置', '产生方式 / 备注'].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), key = r[cKey!]!, place = r[cPlace!]!, note = r[cNote!] ?? '';
    const placeable = place.includes('树木工具') || dollars(place) !== undefined;
    const cost = place.includes('树木工具') ? TREE_CLICK_COST : (dollars(place) ?? 0);
    put({ refName: r[cRef!], def: {
      id, key, category: r[cCat!] as BuildingCategory, size: sizeOf(r[cSize!]!), placeable, cost,
      pollutionPerTile: /污染源 (\d+)\/格/.exec(note) ? Number(/污染源 (\d+)\/格/.exec(note)![1]) : 0,
      piped: note.includes('导水'), orient: 'none' } });
  }
}

// ----- §2.3.1 网络件 -----
function parseNetworkPieces(t: Table): void {
  const [cId, cKey, cCat, cSize, cPlace, cNote] = ['ID', 'key', '类别', '尺寸', '可放置', '朝向 / 备注'].map((n) => col(t, n)) as number[];
  let prevPlace = '';
  for (const r of t.rows) {
    const ids = idsOf(r[cId!]!), keyCell = r[cKey!]!, category = r[cCat!] as BuildingCategory, size = sizeOf(r[cSize!]!), note = r[cNote!] ?? '';
    let place = r[cPlace!]!;
    if (place === '同上') place = prevPlace; else prevPlace = place;
    const bridgeKinds = Object.keys(BRIDGE_KIND_COST).filter((k) => place.includes(k));
    const placeable = dollars(place) !== undefined || bridgeKinds.length > 0;
    const cost = dollars(place) ?? (bridgeKinds.length ? Math.min(...bridgeKinds.map((k) => BRIDGE_KIND_COST[k]!)) : 0);
    const orient: OrientMode = category === 'onramp' ? 'byIdAndFlip' : note.includes('flipBit') ? 'flipBit' : ids.length === 1 && ids[0] === 0x69 ? 'none' : 'byId';
    ids.forEach((id, k) => {
      let key = keyCell;
      if (keyCell.endsWith('[k]')) {                                        // powerLine[k] → powerLineLR …（形状码表的 15 个形状名）
        if (shapeNames.length !== 15) throw new Error('形状码表须先于网络件表出现且含 15 个形状');
        key = keyCell.slice(0, -3) + shapeNames[k]!;
      } else if (ids.length > 1) throw new Error(`区间行 ${r[cId!]} 的 key 不是 [k] 形式：${keyCell}`);
      put({ def: { id, key, category, size, placeable, cost, orient,
        placement: category === 'subRail' ? { terrain: 'flat', needsAdjacent: 'rail' } : undefined } });
    });
  }
}

// ----- §2.3.2 网络族费用与维护 -----
function parseNetworkFees(t: Table): void {
  const [cFam, cUpkeep, cLine, cTech] = ['族', '年维护', '预算线', /^科技/].map((n) => col(t, n)) as number[];
  const seen = new Set<number>();
  let prevUpkeep = 0;
  for (const r of t.rows) {
    const fam = r[cFam!]!;
    if (fam.includes('XUND')) continue;
    const upkeep = r[cUpkeep!] === '同上' ? prevUpkeep : (dollars(r[cUpkeep!]!) ?? 0); prevUpkeep = upkeep;
    const lineTxt = r[cLine!]!, budgetLine = lineTxt === '无' ? undefined : BUDGET_LINE[lineTxt];
    if (lineTxt !== '无' && !budgetLine) throw new Error(`未知预算线：${lineTxt}`);
    const tech = techOf(r[cTech!]!);
    for (const id of idsOf(fam)) {
      if (seen.has(id)) continue;                                            // 0x58 出现在堤道与开启桥两行：首行优先
      seen.add(id);
      const d = drafts.get(id);
      if (!d) { warn(`费用表引用了未定义的 ${hex(id)}`); continue; }
      d.def.upkeepPerYear = upkeep; d.def.budgetLine = budgetLine; d.def.tech = tech;
    }
  }
}

// ----- §2.4 分区生长建筑 -----
function parseZoneWeights(): Map<number, { level: number; tier: number; pop: number; w: number }> {
  const out = new Map<number, { level: number; tier: number; pop: number; w: number }>();
  if (!existsSync(ZONES_SPEC)) { warn('缺少 zones-growth-demand.md，zone.weight 全部取默认 10'); return out; }
  for (const t of parseTables(readFileSync(ZONES_SPEC, 'utf8'), /^### 2\.3 /, /^### 2\.4 /)) {
    if (t.header[0] !== 'XBLD' || !t.header.includes('w')) continue;
    const [cId, cL, cT, cP, cW] = ['XBLD', 'level', 'tier', 'pop', 'w'].map((n) => col(t, n)) as number[];
    for (const r of t.rows) out.set(parseHex(r[cId!]!), { level: intOf(r[cL!]!), tier: intOf(r[cT!]!), pop: intOf(r[cP!]!), w: intOf(r[cW!]!) });
  }
  return out;
}
function parseZoneBuildings(t: Table): void {
  const [cId, cKey, cRef, cSize, cTier, cPop, cPoll, cPopW] = ['ID', 'key', '参考名', '尺寸', 'tier', 'pop', 'poll', 'popW'].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), key = r[cKey!]!;
    const type = ({ r: 'R', c: 'C', i: 'I' } as const)[key[0]!];
    if (!type) throw new Error(`分区建筑 key 须以 r/c/i 开头：${key}`);
    const tier = intOf(r[cTier!]!) as 0 | 1 | 2, pop = intOf(r[cPop!]!), popW = intOf(r[cPopW!]!) as 1 | 2 | 3 | 4;
    const z = zoneWeights.get(id);
    if (z && (z.level !== popW || z.tier !== tier || z.pop !== pop)) warn(`${hex(id)} 与 zones 规格不一致：catalogue level/tier/pop=${popW}/${tier}/${pop}，zones=${z.level}/${z.tier}/${z.pop}（以 catalogue 为准）`);
    put({ refName: r[cRef!], def: {
      id, key, category: `zone${type}` as BuildingCategory, size: sizeOf(r[cSize!]!), placeable: false, cost: 0,
      pollutionPerTile: intOf(r[cPoll!]!), popWeight: popW,
      residents: type === 'R' ? pop : 0, jobs: type === 'R' ? 0 : pop,
      zone: { type, tier, weight: z?.w ?? 10, level: popW }, orient: 'none' } });
  }
}
function parseTransitions(t: Table): void {
  const [cId, cKey, cCat, cSize, cPopW] = ['ID', 'key', '类别', '尺寸', 'popW'].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    const category = r[cCat!] as BuildingCategory;
    put({ def: { id: parseHex(r[cId!]!), key: r[cKey!]!, category, size: sizeOf(r[cSize!]!), placeable: false, cost: 0,
      popWeight: intOf(r[cPopW!]!), transition: category as 'construction' | 'abandoned', orient: 'none' } });
  }
}

// ----- §2.5 电厂 -----
function parsePowerPlants(t: Table): void {
  const [cId, cKey, cSize, cCost, cTech, cOut, cPoll, cNimby, cOrient, cPlace] = ['ID', 'key', '尺寸', '造价', /^科技/, /^整厂产量/, '污染/格', 'NIMBY', '朝向', '放置限制'].map((n) => col(t, n)) as number[];
  let prevCost = 0, prevLimit = '';
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), key = r[cKey!]!;
    const cost = dollars(r[cCost!]!) ?? prevCost; prevCost = cost;
    const kind = key.startsWith('hydro') ? 'hydro' : key.startsWith('wind') ? 'wind' : key.startsWith('solar') ? 'solar' : 'fixed';
    const limit = r[cPlace!] === '同上' ? prevLimit : r[cPlace!]!; prevLimit = limit;
    put({ def: { id, key, category: 'powerPlant', size: sizeOf(r[cSize!]!), placeable: true, cost, tech: techOf(r[cTech!]!),
      powerOutput: kind === 'fixed' ? { kind, tiles: intOf(r[cOut!]!) } : { kind },
      pollutionPerTile: intOf(r[cPoll!]!), nimby: r[cNimby!] === '是', orient: r[cOrient!]!.startsWith('byId') ? 'byId' : 'none',
      lifetimeYears: kind === 'hydro' || kind === 'wind' ? undefined : 50, microsim: { type: PLANT_MICROSIM(key), shared: false },
      placement: { terrain: limit.includes('瀑布') ? 'waterfall' : limit.includes('平地') ? 'flat' : 'any' } } });
  }
}

/** "$50 / Health" / "$100 / Education-Schools" / "$25 固定支出，无滑块" / "0" → 年费与预算线。 */
function upkeepOf(cell: string): { upkeep: number; line: BudgetLineKey | undefined } {
  const upkeep = dollars(cell) ?? 0;
  if (cell.includes('固定支出')) return { upkeep, line: 'busFixed' };
  const m = /\/\s*([A-Za-z-]+)/.exec(cell);
  const line = m ? BUDGET_LINE[m[1]!] : undefined;
  if (m && !line) throw new Error(`未知预算线：${cell}`);
  return { upkeep, line };
}
function microsimOf(cell: string, key: string): BuildingDef['microsim'] {
  const m = /^(\d+)/.exec(cell);
  if (m) return { type: Number(m[1]), shared: cell.includes('共享') };
  if (cell.startsWith('独占')) {
    const type = STATION_MICROSIM[key];
    if (type === undefined) throw new Error(`独占微模拟缺少类型号映射：${key}`);
    return { type, shared: false };
  }
  return undefined;
}

// ----- §2.6 公共服务 / 休闲 / 奖励 -----
function parseCivic(t: Table): void {
  const [cId, cKey, cCat, cSize, cCost, cUp, cUnlock, cPoll, cMic, cFn] = ['ID', 'key', '类别', '尺寸', '造价', '年费 / 预算线', '解锁', '污染/格', '微模拟', /^功能参数/].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), key = r[cKey!]!, size = sizeOf(r[cSize!]!), unlockTxt = r[cUnlock!]!, fn = r[cFn!] ?? '';
    const { upkeep, line } = upkeepOf(r[cUp!]!);
    const pop = /normalPop > ([\d,]+)/.exec(unlockTxt);
    const placeable = !unlockTxt.includes('不可放置');
    const water = /水格数必须 (\d+)\.\.(\d+)/.exec(fn);
    put({ def: { id, key, category: r[cCat!] as BuildingCategory, size, placeable, cost: dollars(r[cCost!]!) ?? 0, upkeepPerYear: upkeep, budgetLine: line,
      unlock: pop ? { rewardBit: REWARD_BIT[key] ?? 4, popOver: Number(pop[1]!.replace(/,/g, '')), once: unlockTxt.includes('一次') } : undefined,
      powerable: !(fn.includes('不受电') || fn.includes('清 POWERABLE')),
      pollutionPerTile: intOf(r[cPoll!]!), microsim: microsimOf(r[cMic!]!, key), nimby: fn.includes('NIMBY'), orient: 'none',
      coverage: key === 'policeStation' ? { layer: 'XPLC', strengthAt100: 250 } : key === 'fireStation' ? { layer: 'XFIR', strengthAt100: 250 } : undefined,
      placement: !placeable ? undefined : water ? { terrain: 'any', waterCellsInFootprint: [Number(water[1]), Number(water[2])] } : { terrain: 'flat' } } });
  }
}

// ----- §2.7 水设施、车站 -----
function parseWaterAndStations(t: Table): void {
  const [cId, cKey, cCat, cSize, cCost, cUp, cTech, cWater, cPoll, cMic, cNote] = ['ID', 'key', '类别', '尺寸', '造价', '年费 / 预算线', /^科技/, '产 / 蓄水', '污染/格', '微模拟', '备注'].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), key = r[cKey!]!, category = r[cCat!] as BuildingCategory, note = r[cNote!] ?? '', waterTxt = r[cWater!]!;
    const { upkeep, line } = upkeepOf(r[cUp!]!);
    const waterOutput: BuildingDef['waterOutput'] =
      key === 'waterPump' ? { kind: 'pump' } : key === 'desalination' ? { kind: 'desal' }
      : key === 'waterTower' ? { kind: 'tower', unitsPerCell: intOf(waterTxt) } : key === 'waterTreatment' ? { kind: 'treatment', tilesPerPlant: intOf(waterTxt) } : undefined;
    const needsAdjacent = /邻.*道路|道路.*邻/.test(note) ? 'road' : /邻.*铁路|铁路.*邻/.test(note) ? 'rail' : undefined;
    put({ def: { id, key, category, size: sizeOf(r[cSize!]!), placeable: true, cost: dollars(r[cCost!]!) ?? 0, upkeepPerYear: upkeep, budgetLine: line,
      tech: techOf(r[cTech!]!), consumesWater: category !== 'waterFacility', waterOutput,
      pollutionPerTile: intOf(r[cPoll!]!), microsim: microsimOf(r[cMic!]!, key), nimby: note.includes('NIMBY'), orient: 'none',
      placement: { terrain: 'flat', ...(needsAdjacent ? { needsAdjacent } : {}) } } });
  }
}

// ----- §2.8 港口 / 机场 / 军事自动部件 -----
function parseAutoParts(t: Table): void {
  const [cId, cKey, cRef, cCat, cSize, cOrient, cPoll] = ['ID', 'key', '参考名', '类别', '尺寸', '朝向', '污染/格'].map((n) => col(t, n)) as number[];
  for (const r of t.rows) {
    put({ refName: r[cRef!], def: { id: parseHex(r[cId!]!), key: r[cKey!]!, category: r[cCat!] as BuildingCategory, size: sizeOf(r[cSize!]!), placeable: false, cost: 0,
      pollutionPerTile: intOf(r[cPoll!]!), orient: r[cOrient!]!.startsWith('flipBit') ? 'flipBit' : 'none' } });
  }
}

// ----- §2.9 Arcology -----
function parseArcologies(t: Table): void {
  const [cId, cKey, cRef, cSize, cCost, cUnlock, cCap, cPoll, cPopW, cMic] = ['ID', 'key', /^参考名/, '尺寸', '造价', '人口门槛', '容量', '污染/格', 'popW', '微模拟'].map((n) => col(t, n)) as number[];
  let prevUnlock = '';
  for (const r of t.rows) {
    const id = parseHex(r[cId!]!), specKey = r[cKey!]!;
    let unlockTxt = r[cUnlock!]!; if (unlockTxt === '同上') unlockTxt = prevUnlock; else prevUnlock = unlockTxt;
    const pop = /normalPop > ([\d,]+)/.exec(unlockTxt);
    if (!pop) throw new Error(`Arcology 人口门槛无法解析：${unlockTxt}`);
    const tech = ARCO_TECH[id]; if (!tech) throw new Error(`未知 Arcology 行：${hex(id)}（key ${specKey}）`);
    put({ refName: r[cRef!], def: { id, key: tech, category: 'arcology', size: sizeOf(r[cSize!]!), placeable: true, cost: dollars(r[cCost!]!) ?? 0, tech,
      unlock: { rewardBit: 4, popOver: Number(pop[1]!.replace(/,/g, '')), once: false },
      residents: intOf(r[cCap!]!), pollutionPerTile: intOf(r[cPoll!]!), popWeight: intOf(r[cPopW!]!),
      microsim: { type: intOf(r[cMic!]!), shared: false }, orient: 'none', placement: { terrain: 'flat' } } });
  }
}

// ---------- 补默认值、校验 ----------
const WATER_FACILITY = new Set([0xdc, 0xeb, 0xf4, 0xfa]);
const defs: BuildingDef[] = [];
const refNames = new Map<number, string>();
for (let id = 0; id < 256; id++) {
  const d = drafts.get(id);
  if (!d) throw new Error(`缺少 ${hex(id)} 的表格行`);
  const p = d.def;
  if (d.refName && d.refName !== '—' && d.refName !== '') refNames.set(id, d.refName);
  if (p.size !== FOOTPRINT[id]) { warn(`${hex(id)} 表中尺寸 ${p.size} 与 contracts FOOTPRINT ${FOOTPRINT[id]} 不一致，以 FOOTPRINT 为准`); p.size = FOOTPRINT[id] as Footprint; }
  const developed = id >= 0x70;
  const tool = TOOL_OF.get(id);
  if (p.placeable && !tool) warn(`${hex(id)} 可放置但没有工具的 buildingIds 含它`);
  const def: BuildingDef = {
    id, key: p.key, name: `bld.${hex(id)}`, category: p.category, size: p.size, placeable: p.placeable ?? false,
    ...(tool ? { tool } : {}),
    cost: p.cost ?? 0, upkeepPerYear: p.upkeepPerYear ?? 0,
    ...(p.budgetLine ? { budgetLine: p.budgetLine } : {}), ...(p.tech ? { tech: p.tech } : {}), ...(p.unlock ? { unlock: p.unlock } : {}),
    powerable: p.powerable ?? developed, consumesPower: developed, piped: p.piped ?? developed,
    consumesWater: p.consumesWater ?? (developed && !WATER_FACILITY.has(id)),
    ...(p.powerOutput ? { powerOutput: p.powerOutput } : {}), ...(p.waterOutput ? { waterOutput: p.waterOutput } : {}),
    pollutionPerTile: p.pollutionPerTile ?? 0,
    popWeight: p.popWeight ?? (id >= 0xc6 ? 2 : 0),                        // services §2.3.5：≥0xC6 一律 2（arco 12 已由表给出），地表覆盖 0
    residents: p.residents ?? 0, jobs: p.jobs ?? 0,
    ...(p.zone ? { zone: p.zone } : {}), ...(p.transition ? { transition: p.transition } : {}), ...(p.coverage ? { coverage: p.coverage } : {}),
    ...(p.microsim ? { microsim: p.microsim } : {}),
    nimby: p.nimby ?? false, orient: p.orient ?? 'none',
    ...(p.lifetimeYears !== undefined ? { lifetimeYears: p.lifetimeYears } : {}), ...(p.placement ? { placement: p.placement } : {}),
  };
  defs.push(def);
}
if (new Set(defs.map((d) => d.key)).size !== 256) throw new Error('key 不唯一');

// ---------- 序列化 ----------
function lit(v: unknown): string {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}: ${lit(x)}`).join(', ')} }`;
  throw new Error(`无法序列化 ${String(v)}`);
}
function serialize(d: BuildingDef): string {
  const { id, ...rest } = d;
  const body = Object.entries(rest).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}: ${lit(x)}`).join(', ');
  const ref = refNames.get(id);
  return `  { id: ${hex(id)}, ${body} },${ref ? ` // 参考名: ${ref}` : ''}`;
}
const output = [
  '// ===== data/buildings.generated.ts =====',
  '// 本文件由 tools/gen-catalogue.ts 从 docs/spec/building-catalogue.md §2.2–§2.9 生成，请勿手改（pnpm gen:catalogue 重新生成）。',
  '// 行尾"参考名"只是社区文档的识别名，仅作注释，不得进入 name / UI / 存档默认名。name 为 strings 键 bld.0xNN。',
  "import type { BuildingDef } from '../contracts/catalogue';",
  '',
  '/** 恰好 256 条，按 id 升序；BUILDINGS[id].id === id。 */',
  'export const BUILDINGS: readonly BuildingDef[] = [',
  ...defs.map(serialize),
  '];',
  '',
].join('\n');

const check = process.argv.includes('--check');
for (const w of warnings) console.warn(`[gen-catalogue] 警告：${w}`);
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== output) { console.error(`[gen-catalogue] ${OUT} 与生成结果不一致，请运行 pnpm gen:catalogue`); process.exit(1); }
  console.log('[gen-catalogue] 产物一致');
} else {
  writeFileSync(OUT, output);
  console.log(`[gen-catalogue] 已写入 ${OUT}（${defs.length} 条）`);
}
