/**
 * 构建期红线词表（PLAN §1、§8）：真实企业/楼宇名与某游戏系列名不得出现在产物任何字符串里。
 * 匹配大小写不敏感。游戏系列名本身也不以明文写进仓库，这里用 base64 存。
 *
 * 词条只收不会误伤街道名的完整写法：例如收「文華東方」不收「文華」（文華里是街），
 * 收「Chater House」不收「Chater」（遮打道是街）。
 */
const ENCODED = ['R1RB', 'R3JhbmQgVGhlZnQ='];

/** 游戏系列名（ENCODED 解码后）。负责人 D2 放开的交通真名不包括它们：站名、目的地里也不得出现。 */
export const SERIES_NAMES: readonly string[] = ENCODED.map((s) => Buffer.from(s, 'base64').toString('utf8'));

export const BLACKLIST: readonly string[] = [
  // 地标原型
  'HSBC', '匯豐', '滙豐', 'Bank of China', '中銀', '中國銀行',
  'IFC', 'International Finance', '國際金融',
  'Jardine', '怡和', 'Cheung Kong', '長江', 'The Center', '中環中心',
  // 中环其他著名楼宇、商场与企业（天桥、行人通道常以它们命名）
  'Exchange Square', '交易廣場', 'The Landmark', '置地', 'Hongkong Land',
  "Prince's Building", '太子大廈', 'Alexandra House', '歷山大廈', 'Chater House', '遮打大廈',
  'Gloucester Tower', '告羅士打大廈', 'Edinburgh Tower', '公爵大廈', 'York House', '約克大廈',
  'Lippo', '力寶', 'Standard Chartered', '渣打', 'Central Plaza', '中環廣場', 'Bank of America', '美國銀行',
  'Citibank', '花旗', 'Hang Seng', '恒生', '恆生', 'Bank of East Asia', '東亞銀行',
  'Mandarin Oriental', '文華東方', 'World-Wide House', '環球大廈', 'Man Yee Building', '萬宜大廈',
  'Wheelock', '會德豐', 'Hutchison', '和記', 'AIA Central', '友邦', 'New World Tower', '新世界',
  'Admiralty Centre', '海富中心', 'Far East Finance', '遠東金融',
  // 以企业/商场命名的街道也一并去名（街道本身保留）
  'Hopewell', '合和', 'Pacific Place', '太古',
  ...SERIES_NAMES,
];

const LOWER = BLACKLIST.map((w) => w.toLowerCase());

/** 命中的第一个红线词；没有命中返回 undefined。 */
export function blacklistHit(s: string): string | undefined {
  const l = s.toLowerCase();
  const i = LOWER.findIndex((w) => l.includes(w));
  return i >= 0 ? BLACKLIST[i] : undefined;
}

/** 楼宇式名称的标志词（行人天桥、通道常借楼名命名，词表收不全，靠它兜底）。 */
const BUILDING_MARKER = /大廈|大樓|中心|商場|building|centre|center|tower|house|mall/i;

/** 街道/地名的结尾：带这些结尾的名称即使含标志词也保留（如雪廠街 Ice House Street）。 */
const STREET_SUFFIX = /(道|街|里|巷|徑|臺|台|坊|路|梯|road|street|lane|terrace|path|steps|drive|avenue)$/i;

/** 行人通道的名称看起来像楼宇名（而不是街道/地名）。 */
export function buildingLikeName(s: string): boolean {
  return BUILDING_MARKER.test(s) && !STREET_SUFFIX.test(s.trim());
}
