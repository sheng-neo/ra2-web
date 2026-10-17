// ===== sim/services/tables.ts =====
// 服务模块静态表（spec:services §2.2 / §2.3.1 / §2.3.5 / §2.6.1 / §2.8.1 / spec:file-formats §2.2.7–§2.2.9）：
// 污染源表、人口权重表、废弃建筑判定、微模拟记录 / 标签区间、共享记录号、评分等级。全部为事实表，不含可调参数（可调参数在 tuning.ts）。

/** 本模块关心的 XBLD 值（只列用到的；全表见 data/buildings.generated.ts）。 */
export const enum Xbld {
  Radioactive = 0x05, SmallPark = 0x0d,
  CityHall = 0xd0, Hospital = 0xd1, Police = 0xd2, Fire = 0xd3, Museum = 0xd4, BigPark = 0xd5, School = 0xd6, Stadium = 0xd7,
  Prison = 0xd8, College = 0xd9, Zoo = 0xda, Statue = 0xdb, Runway = 0xdd, RunwayCross = 0xde, Crane = 0xe0,
  SubwayStation = 0xe9, BusDepot = 0xec, RailDepot = 0xed, MayorHouse = 0xf3, WaterTreatment = 0xf4, Library = 0xf5,
  Marina = 0xf8, Desalination = 0xfa, ArcoFirst = 0xfb, ArcoLast = 0xfe, GreatDome = 0xff,
}

/** 微模拟类型号（XMIC 记录按建筑类型解释字段；与 data/buildings.generated.ts 的 microsim.type 一致）。 */
export const enum MicrosimType {
  CityHall = 2, Hospital = 3, Police = 4, Fire = 5, School = 6, Stadium = 7, Prison = 8, College = 9, Zoo = 10, Statue = 11,
  MayorHouse = 12, WaterTreatment = 13, Desalination = 14, Arcology = 15, GreatDome = 16, BusDepot = 17, RailDepot = 18, SubwayStation = 19,
  Parks = 22, Museum = 23, Library = 24, Marina = 25,
}

const fill = (t: Uint8Array, lo: number, hi: number, v: number): void => { for (let id = lo; id <= hi; id++) t[id] = v; };

/** 每格污染源（spec:services §2.3.1 的 256 项表，非零项）。放射性废料 0x05 不在表内（< 0x70），由 tuning.radioactivePollution 单独加。 */
function buildPollution(): Uint8Array {
  const t = new Uint8Array(256);
  fill(t, 0x84, 0x87, 6); fill(t, 0x9e, 0xa1, 12); fill(t, 0xa2, 0xa5, 18); fill(t, 0xbc, 0xc1, 24);
  t[0xc9] = 10; t[0xca] = 25; t[0xcb] = 2; t[0xce] = 2; t[0xcf] = 50;
  t[0xd7] = 4; t[0xd8] = 10; t[0xdc] = 2;
  fill(t, 0xdd, 0xdf, 10); t[0xe0] = 5; t[0xe3] = 5; t[0xe4] = 5; t[0xe5] = 5; t[0xe6] = 10; t[0xe7] = 10;
  t[0xe9] = 5; t[0xec] = 3; t[0xed] = 4; fill(t, 0xee, 0xf1, 2); t[0xf2] = 10; t[0xf4] = 10; t[0xf6] = 5;
  t[0xfb] = 25; t[0xfc] = 10; t[0xfd] = 12; t[0xfe] = 15;
  return t;
}
export const POLLUTION: Uint8Array = buildPollution();

/** 每格人口权重（spec:services §2.3.5 POPWEIGHT）：1×1 → 1；2×2 低档 → 2、高档 → 3；3×3 → 4；废弃 → 0。 */
function buildPopWeight(): Uint8Array {
  const t = new Uint8Array(256);
  fill(t, 0x70, 0x89, 1);
  fill(t, 0x8c, 0x8f, 2); fill(t, 0x90, 0x93, 3); fill(t, 0x94, 0x98, 2); fill(t, 0x99, 0x9d, 3);
  fill(t, 0x9e, 0xa1, 2); fill(t, 0xa2, 0xa5, 3); fill(t, 0xa6, 0xa7, 2); fill(t, 0xa8, 0xa9, 3);
  fill(t, 0xae, 0xc3, 4);
  return t;
}
export const POP_WEIGHT: Uint8Array = buildPopWeight();

/** 废弃建筑（地价减半、人口权重 0）：0x8A 0x8B 0xAA–0xAD 0xC4 0xC5。 */
export const isAbandoned = (id: number): boolean => id === 0x8a || id === 0x8b || (id >= 0xaa && id <= 0xad) || id === 0xc4 || id === 0xc5;
export const isArcology = (id: number): boolean => id >= Xbld.ArcoFirst && id <= Xbld.ArcoLast;

// ---- 微模拟记录（XMIC 150 × 8 B）与 XTXT / XLAB 标签区间（spec:file-formats §2.2.7–§2.2.9） ----
export const MICROSIM_RECORDS = 150, MICROSIM_RECORD_BYTES = 8;
/** 记录 10..149 为独占记录（140 条）；1..9 为共享系统记录；0 未用。 */
export const MICROSIM_FIRST_EXCLUSIVE = 10;
/** 记录 r 对应标签号 0x33 + r。 */
export const MICROSIM_LABEL_BASE = 0x33;
export const SHARED_LABEL_FIRST = 0x34, EXCLUSIVE_LABEL_FIRST = 0x3d, MICROSIM_LABEL_LAST = 0xc8;
/** 玩家告示牌标签 0x01..0x32（50 个）。 */
export const SIGN_LABEL_FIRST = 0x01, SIGN_LABEL_LAST = 0x32;
/** 共享记录号（1..9：公交 / 铁路 / 地铁 / 风电 / 水电 / 公园 / 博物馆 / 图书馆 / 码头）；本模块只分配后四种。 */
export const SHARED_SLOT_BY_TYPE: Readonly<Record<number, number>> = {
  [MicrosimType.Parks]: 6, [MicrosimType.Museum]: 7, [MicrosimType.Library]: 8, [MicrosimType.Marina]: 9 };
export const XLAB_STRIDE = 25, XLAB_TEXT_MAX = 23, XLAB_SLOTS = 256;

/** 评分 0..12 → 等级字母（查询窗口显示；不是原版专有文本）。 */
export const GRADES: readonly string[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
export const gradeOf = (score: number): string => GRADES[Math.max(0, Math.min(GRADES.length - 1, score | 0))]!;

/** 里程碑进度 → MISC 0x0078 奖励位（spec:services §2.8.1；进度 4 为军事基地提案、6 为巨型住区且另需科技）。 */
export const MILESTONE_REWARD_BIT: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 2, 5: 3, 6: 4 };
export const MILESTONE_MILITARY_LEVEL = 4, MILESTONE_ARCO_LEVEL = 6, ARCO_REWARD_BIT = 4;
