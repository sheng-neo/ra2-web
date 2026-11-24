/**
 * 敏感区里的政府设施（PLAN §1）：只做背景，不可进入、不可交互。
 * 名称/ID 只用于在原始数据里匹配多边形，绝不写进产物。军事用地另由 land_use subtype=military 自动导入。
 */

/**
 * 原始主名称包含其一即算（land_use 优先，建筑其次；已被前者覆盖的建筑跳过）。
 * 不要加「行政長官辦公室」：会误配花园道的「前任行政長官辦公室」；添马那座已在院落里。
 */
export const GOVERNMENT_NAMES: readonly string[] = ['立法會綜合大樓', '律政中心', '終審法院', '禮賓府'];

/** 没有名称、只能按 Overture ID 匹配的多边形。 */
export const GOVERNMENT_IDS: readonly string[] = [
  // 添馬：政府總部東西翼、會議廳、行政長官辦公室與立法會綜合大樓所在院落（land_use institutional，无名）
  'dbec9cee-ad18-3198-9155-566a1d56bd36',
];
