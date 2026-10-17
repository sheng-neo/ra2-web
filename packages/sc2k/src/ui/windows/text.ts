// ===== ui/windows/text.ts =====（WP12b：文案访问 + 缺键回退）
// 规则（wave-common §2.4）：玩家可见文案一律走 strings 键；WP0 表里没有的键在这里给出双语回退（已在 docs/contract-rfc.md 登记，
// 待 Lead 并入 data/strings.*.ts 后本表自动失效：tx() 先查 strings.has(key)）。回退文本全部原创、不含原版专名。
import type { Strings } from '../../contracts/strings';

type Pair = { zh: string; en: string };
const P = (zh: string, en: string): Pair => ({ zh, en });

/** 缺键回退表（键 → 双语文本）。 */
export const FALLBACK_TEXT: Readonly<Record<string, Pair>> = {
  // 图表 16 条序列（spec:economy §2.14 顺序）
  'graph.citySize': P('城市规模', 'City size'), 'graph.residents': P('居民', 'Residents'), 'graph.commerce': P('商业', 'Commerce'), 'graph.industry': P('工业', 'Industry'),
  'graph.traffic': P('交通', 'Traffic'), 'graph.pollution': P('污染', 'Pollution'), 'graph.value': P('地价', 'Land value'), 'graph.crime': P('犯罪', 'Crime'),
  'graph.powerPct': P('供电率', 'Power %'), 'graph.waterPct': P('供水率', 'Water %'), 'graph.health': P('健康', 'Health'), 'graph.education': P('教育', 'Education'),
  'graph.unemployment': P('失业率', 'Unemployment'), 'graph.gnp': P('国民产值', 'GNP'), 'graph.nationalPop': P('全国人口', 'National pop.'), 'graph.fedRate': P('基准利率', 'Base rate'),
  'ui.graphs.range1': P('1 年', '1 yr'), 'ui.graphs.range10': P('10 年', '10 yr'), 'ui.graphs.range100': P('100 年', '100 yr'),
  // 地图
  'ui.map.clickHint': P('点击小地图以居中视图', 'Click the map to centre the view'),
  // 报纸
  'ui.news.none': P('还没有送来报纸', 'No newspaper has been delivered yet'),
  'ui.news.temperature': P('气温 {value}°F', 'Temperature {value}°F'), 'ui.news.wind': P('风力 {value}', 'Wind {value}'), 'ui.news.humidity': P('降水 {value}', 'Precipitation {value}'),
  'news.generic.headline': P('城中要闻', 'Around the city'), 'news.generic.body': P('{city} 的日子照常进行。', 'Life in {city} goes on as usual.'),
  // 查询
  'ui.query.hint': P('在地图上点选一格', 'Click a tile on the map'), 'ui.query.tile': P('地块', 'Tile'), 'ui.query.size': P('占地', 'Footprint'),
  'ui.query.station': P('车站', 'Station'), 'ui.query.plant': P('电厂', 'Power plant'), 'ui.query.lot': P('地块状态', 'Lot'), 'ui.query.empty': P('空地', 'Open land'),
  'ui.station.1': P('公交站', 'Bus depot'), 'ui.station.2': P('火车站', 'Rail depot'), 'ui.station.3': P('地铁站', 'Subway station'), 'ui.station.4': P('地铁换乘站', 'Subway-rail transfer'),
  'ui.query.platforms': P('站台', 'Platforms'),
  // 存档
  'ui.saves.title': P('已存城市', 'Saved cities'), 'ui.saves.empty': P('还没有存档', 'No saved cities yet'), 'ui.saves.name': P('名称', 'Name'),
  'ui.saves.city': P('城市', 'City'), 'ui.saves.year': P('年份', 'Year'), 'ui.saves.savedAt': P('保存时间', 'Saved'), 'ui.saves.kind': P('格式', 'Format'),
  'ui.saves.kind.sc2': P('经典 (.sc2)', 'Classic (.sc2)'), 'ui.saves.kind.sc2kweb': P('无损 (.sc2kweb)', 'Lossless (.sc2kweb)'),
  'ui.saves.saved': P('已保存「{name}」', 'Saved "{name}"'), 'ui.saves.loaded': P('已载入「{name}」', 'Loaded "{name}"'),
  'ui.saves.failed': P('操作失败：{reason}', 'Could not complete: {reason}'), 'ui.saves.confirmDelete': P('确定删除这个存档？', 'Delete this save?'),
  'ui.saves.import': P('打开 .sc2 / .sc2kweb 文件', 'Open a .sc2 / .sc2kweb file'), 'ui.saves.diagnostics': P('载入时有 {value} 条提示', '{value} notes while loading'),
  'ui.saves.exporting': P('导出中…', 'Exporting…'),
  // 邻城
  'ui.neighbors.connections': P('连接', 'Connections'), 'ui.neighbors.road': P('道路', 'Road'), 'ui.neighbors.rail': P('铁路', 'Rail'), 'ui.neighbors.highway': P('高速', 'Highway'),
  'ui.neighbors.unnamed': P('（未命名）', '(unnamed)'), 'ui.neighbors.thisCity': P('本城', 'This city'),
  // 债券
  'ui.bonds.issued': P('发行于', 'Issued'), 'ui.bonds.annual': P('年息', 'Annual interest'), 'ui.bonds.sum': P('利率之和', 'Sum of rates'),
  'ui.bonds.none': P('没有未偿债券', 'No bonds outstanding'), 'ui.bonds.avg': P('平均利率', 'Average rate'),
  // 预算
  'ui.budget.tax': P('财产税', 'Property taxes'), 'ui.budget.ordinances': P('法令…', 'Ordinances…'), 'ui.budget.bonds': P('债券…', 'Bonds…'),
  'ui.budget.ledger': P('账目', 'Ledger'), 'ui.budget.item': P('项目', 'Item'), 'ui.budget.currentFunds': P('当前资金', 'Current funds'), 'ui.budget.advisors': P('顾问', 'Advisors'),
  'ui.budget.year': P('{year} 年度预算', 'Budget for {year}'),
  // 法令
  'ui.ordinances.enacted': P('已启用 {value} / {total}', '{value} of {total} enacted'), 'ui.ordinances.availableFrom': P('{year} 年起可用', 'Available from {year}'),
  // 模态
  'ui.team.pick': P('为新体育场选择一项运动', 'Choose a sport for the new stadium'),
  'ui.bridge.choose': P('选择桥型', 'Choose a bridge type'), 'ui.bridge.length': P('跨度 {value} 格', 'Span: {value} tiles'),
  'ui.disaster.goto': P('前往现场', 'Go to the scene'),
  'ui.import.none': P('此版本尚未提供素材导入', 'Asset import is not available in this build'),
  'ui.newCity.generated': P('地形已生成，可再次生成或点「完成」开始', 'Terrain generated; generate again or press Done to start'),
};

const interpolate = (s: string, args?: Record<string, string | number>): string =>
  args ? s.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : m)) : s;

/** 取文案：strings 有键则用表；否则用 FALLBACK_TEXT 的当前语言；再否则返回键名（与 createStrings 的缺键行为一致）。 */
export function tx(strings: Strings, key: string, args?: Record<string, string | number>): string {
  if (strings.has(key)) return strings.t(key, args);
  const fb = FALLBACK_TEXT[key];
  return interpolate(fb ? fb[strings.lang] : key, args);
}

/** 便捷绑定。 */
export const bindText = (strings: Strings): ((key: string, args?: Record<string, string | number>) => string) => (key, args) => tx(strings, key, args);
