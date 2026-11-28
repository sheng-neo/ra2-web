/**
 * 地标覆盖表：真实建筑 → 地标摆放（PLAN §1：不放 logo、不复刻雕塑）。
 *
 * 名字：负责人 D6（2026-11-27）起六座地标用建筑的真名（繁中 / 英文），逐字等于 redlines.ts 的 LANDMARK_REAL_NAMES——
 * 红线检查只在「地标名」这一处、只对这 12 个字符串豁免（见 pack.ts），别处出现照样拦截。id 是代码键与资源文件名，不变
 * （id 仍是 R5 之前的描述性代号，与名字无关）。外观见 D5（地政总署带照片纹理的三维模型，R5）。
 *
 * 匹配：以 at（WGS84）为中心、40 m 内质心最近的建筑。at 取自 Overture 快照里该楼轮廓的质心，
 * 已逐个核实；换成 LandsD 建筑层后，六座原型的塔楼块质心离 at 都在 3 m 内。
 * 总高为已核实的结构总高（从地面算起），强制覆盖源数据。
 */

export interface LandmarkSpec {
  /** 地标 id（客户端与烘焙脚本的键、资源文件名的一部分）。 */
  id: string;
  /** 建筑的真名（D6）。 */
  name: { zh: string; en: string };
  /** 原型建筑轮廓质心（WGS84 经度、纬度）。 */
  at: [number, number];
  /** 已核实总高（米）。 */
  heightM: number;
}

export const MATCH_RADIUS_M = 40;

export const LANDMARKS: readonly LandmarkSpec[] = [
  // 金融街 8 號（Overture ddfd0659…）
  { id: 'harbour-spire', name: { zh: '國際金融中心二期', en: 'Two International Finance Centre' }, at: [114.159278, 22.285297], heightM: 412 },
  // 花園道 1 號（Overture 137579ca…；不是德輔道中那座 1950 年代的舊行大廈）
  { id: 'prism-tower', name: { zh: '中銀大廈', en: 'Bank of China Tower' }, at: [114.161569, 22.279268], heightM: 367.4 },
  // 皇后大道中 99 號（Overture f71854ef…）
  { id: 'neon-centre', name: { zh: '中環中心', en: 'The Center' }, at: [114.154728, 22.284614], heightM: 346 },
  // 皇后大道中 2 號（Overture 無名，源高 283 m）
  { id: 'mirror-block', name: { zh: '長江集團中心', en: 'Cheung Kong Center' }, at: [114.160558, 22.279523], heightM: 282.8 },
  // 皇后大道中 1 號（Overture d11fcd1d…）
  { id: 'steel-frame', name: { zh: '滙豐總行大廈', en: 'HSBC Main Building' }, at: [114.159537, 22.280285], heightM: 178.8 },
  // 干諾道中 1 號（Overture e8a949f9…）
  { id: 'porthole-house', name: { zh: '怡和大廈', en: 'Jardine House' }, at: [114.159154, 22.283], heightM: 178.5 },
];
