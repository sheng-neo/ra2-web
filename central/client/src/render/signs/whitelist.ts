/**
 * 招牌文字白名单（PLAN §1 红线）：只用行业通称，绝不出现店名、企业名、人名、数字、电话、网址或拉丁字母品牌字样。
 * 招牌图集（atlas.ts）里的每个字串都必须来自这里，测试逐一检查。
 * 前 20 个是规格列出的词；后面几个同样是行业通称（海味、烧腊、饼家……），规格允许的可选补充。
 */
export const SIGN_WORDS = [
  '藥房',
  '茶餐廳',
  '找換',
  '珠寶',
  '眼鏡',
  '時裝',
  '地產',
  '酒樓',
  '涼茶',
  '押',
  '士多',
  '五金',
  '鐘錶',
  '冰室',
  '麵家',
  '粥店',
  '洗衣',
  '診所',
  '牙科',
  '補習',
  // 可选补充（行业通称）
  '海味',
  '燒臘',
  '餅家',
  '文具',
  '電器',
  '理髮',
  '花店',
  '米舖',
  '茶莊',
  '印刷',
  '車房',
] as const;

export type SignWord = (typeof SIGN_WORDS)[number];

const SET: ReadonlySet<string> = new Set(SIGN_WORDS);

export function isWhitelisted(s: string): s is SignWord {
  return SET.has(s);
}

/** 白名单本身的约束：只含 CJK 汉字、1–3 个字、无数字与拉丁字母。 */
export function isGenericTradeWord(s: string): boolean {
  return /^[一-鿿]{1,3}$/u.test(s);
}
