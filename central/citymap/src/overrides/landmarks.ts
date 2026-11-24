/**
 * 地标覆盖表：真实建筑 → 虚构名的代码建模地标（PLAN §1：只用虚构名，不放 logo）。
 *
 * 匹配：以 at（WGS84）为中心、40 m 内质心最近的建筑。at 取自 Overture 快照里该楼轮廓的质心，
 * 已逐个核实；换成 LandsD 建筑层后，六座原型的塔楼块质心离 at 都在 3 m 内。
 * 总高为已核实的结构总高（从地面算起），强制覆盖源数据。
 * 注释里的原型只为可追溯，任何名称都不会进入产物。
 */

export interface LandmarkSpec {
  /** 客户端 builder 的键。 */
  id: string;
  name: { zh: string; en: string };
  /** 原型建筑轮廓质心（WGS84 经度、纬度）。 */
  at: [number, number];
  /** 已核实总高（米）。 */
  heightM: number;
}

export const MATCH_RADIUS_M = 40;

export const LANDMARKS: readonly LandmarkSpec[] = [
  // 原型：金融街 8 號（Overture ddfd0659…）
  { id: 'harbour-spire', name: { zh: '海港塔', en: 'Harbour Spire' }, at: [114.159278, 22.285297], heightM: 412 },
  // 原型：花園道 1 號（Overture 137579ca…；不是德輔道中那座 1950 年代的舊行大廈）
  { id: 'prism-tower', name: { zh: '三稜塔', en: 'Prism Tower' }, at: [114.161569, 22.279268], heightM: 367.4 },
  // 原型：皇后大道中 99 號（Overture f71854ef…）
  { id: 'neon-centre', name: { zh: '霓虹中心', en: 'Neon Centre' }, at: [114.154728, 22.284614], heightM: 346 },
  // 原型：皇后大道中 2 號（Overture 無名，源高 283 m）
  { id: 'mirror-block', name: { zh: '方鏡大廈', en: 'Mirror Block' }, at: [114.160558, 22.279523], heightM: 282.8 },
  // 原型：皇后大道中 1 號（Overture d11fcd1d…）
  { id: 'steel-frame', name: { zh: '鋼骨大廈', en: 'Steel Frame Tower' }, at: [114.159537, 22.280285], heightM: 178.8 },
  // 原型：干諾道中 1 號（Overture e8a949f9…）
  { id: 'porthole-house', name: { zh: '千窗大廈', en: 'Porthole House' }, at: [114.159154, 22.283], heightM: 178.5 },
];
