/**
 * 中餐蛋白速查（PRD v2.0 附录 D）。数值为近似值，【上线前按《中国食物成分表》核对】。
 * 本地解析器用它处理"俩鸡蛋一杯豆浆"这类简单输入，不需要联网、不花 AI 成本。
 */

export interface FoodItem {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  proteinG: number;
  /** 估算范围（± 克），用于提示不确定性。 */
  spreadG: number;
}

export const FOODS: FoodItem[] = [
  { id: 'egg', name: '鸡蛋', aliases: ['鸡蛋', '雞蛋', '水煮蛋', '煮蛋', '茶叶蛋', '茶葉蛋', '荷包蛋', 'egg', 'eggs'], unit: '个', proteinG: 6, spreadG: 1 },
  { id: 'milk', name: '牛奶', aliases: ['牛奶', '纯牛奶', '純牛奶', 'milk'], unit: '盒', proteinG: 8, spreadG: 1 },
  { id: 'soymilk', name: '无糖豆浆', aliases: ['豆浆', '豆漿', 'soy milk'], unit: '杯', proteinG: 7, spreadG: 2 },
  { id: 'lean_meat', name: '瘦肉或鸡胸（一掌心）', aliases: ['鸡胸', '雞胸', '鸡胸肉', '雞胸肉', '瘦肉', '牛肉', '猪里脊', '豬里脊', 'chicken breast'], unit: '份', proteinG: 27, spreadG: 5 },
  { id: 'fish', name: '鱼或虾（约 100 克）', aliases: ['鱼', '魚', '虾', '蝦', '三文鱼', '三文魚', '鳕鱼', '鱈魚', 'fish', 'shrimp'], unit: '份', proteinG: 19, spreadG: 3 },
  { id: 'tofu', name: '北豆腐（半块）', aliases: ['豆腐', '北豆腐', 'tofu'], unit: '份', proteinG: 20, spreadG: 4 },
  { id: 'greek_yogurt', name: '希腊酸奶', aliases: ['希腊酸奶', '希臘優格', '希腊优格', 'greek yogurt'], unit: '杯', proteinG: 13, spreadG: 3 },
  { id: 'whey', name: '蛋白粉', aliases: ['蛋白粉', '乳清', '乳清蛋白', 'protein powder', 'whey'], unit: '勺', proteinG: 22, spreadG: 3 },
  { id: 'beef_noodles', name: '牛肉面', aliases: ['牛肉面', '牛肉麵', 'beef noodle', 'beef noodles'], unit: '碗', proteinG: 22, spreadG: 6 },
  { id: 'dumplings', name: '猪肉白菜饺子（10 个）', aliases: ['饺子', '餃子', '水饺', '水餃', 'dumplings'], unit: '份', proteinG: 17, spreadG: 4 },
  { id: 'congee', name: '白粥', aliases: ['白粥', '稀饭', '稀飯', '粥', 'congee'], unit: '碗', proteinG: 2.5, spreadG: 1 },
  { id: 'mantou', name: '馒头', aliases: ['馒头', '饅頭', 'mantou'], unit: '个', proteinG: 7, spreadG: 1 },
];

/** 用户常吃的快捷按钮初始值。 */
export const DEFAULT_QUICK = ['egg', 'soymilk', 'milk', 'whey'];

export function foodById(id: string): FoodItem | undefined {
  return FOODS.find((f) => f.id === id);
}

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 兩: 2, 俩: 2, 倆: 2, 二: 2, 三: 3, 仨: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3 };

function parseQty(s: string | undefined): number {
  if (!s) return 1;
  const t = s.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return CN_NUM[t] ?? 1;
}

export interface LocalFoodHit {
  foodId: string;
  qty: number;
  proteinG: number;
  lowG: number;
  highG: number;
  label: string;
}

const QTY = '(\\d+(?:\\.\\d+)?|[一两兩俩倆二三仨四五六七八九十半]|a|an|one|two|three)?\\s*(?:个|個|杯|盒|碗|勺|份|块|塊|片|只|隻|瓶)?\\s*';

/**
 * 只认速查表里有的食物。识别不了的部分返回 rest，交给 AI 或手动处理。
 * 同一段文字里，较长的别名优先（"希腊酸奶"先于"酸奶"）。
 */
export function parseFoodsLocal(text: string): { hits: LocalFoodHit[]; rest: string } {
  let rest = text;
  const hits: LocalFoodHit[] = [];
  const aliasList = FOODS.flatMap((f) => f.aliases.map((a) => ({ f, a }))).sort((x, y) => y.a.length - x.a.length);
  for (const { f, a } of aliasList) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(QTY + esc, 'i');
    const m = re.exec(rest);
    if (!m) continue;
    const qty = parseQty(m[1]);
    hits.push({
      foodId: f.id,
      qty,
      proteinG: Math.round(f.proteinG * qty * 10) / 10,
      lowG: Math.round((f.proteinG - f.spreadG) * qty * 10) / 10,
      highG: Math.round((f.proteinG + f.spreadG) * qty * 10) / 10,
      label: `${f.name} × ${qty}`,
    });
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
  }
  return { hits, rest: rest.replace(/[，,、和加跟还有還有再\s。.;；]+/g, ' ').trim() };
}
