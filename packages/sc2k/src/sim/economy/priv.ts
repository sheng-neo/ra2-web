// ===== sim/economy/priv.ts =====（ARCHITECTURE §3.3；spec:economy-budget §3.1 BudgetHistory / MonthlyFlow / YearReport、§3.10）
// 持久私有态：12 个月环形账本（与 MISC 27×4B 块一一对应）、本年已结月份 ytd、去年年报摘要、年内计数器与事件去重位。
// 全部用 Int32Array 紧凑编码（PRIV_BUDGET_BYTES.economy = 16 KB，满载 ≈ 5 KB）。运行缓存（预算窗口的取消快照）放闭包。
import type { CityState, PrivState } from '../../contracts/state';

export const ECONOMY_PRIV_VERSION = 1;

// ---- MonthlyFlow 打平布局（Int32Array(FLOW_LEN)）----
export const F_TAX_R = 0, F_TAX_C = 1, F_TAX_I = 2, F_TAX_TOTAL = 3;
export const F_ORD = 4;                 // 20 条法令金额（正收入 / 负成本）
export const F_ORD_NET = 24, F_BOND = 25;
export const F_LINES = 26;              // 11 条经费线支出（正数）
export const F_FIXED = 37, F_INCOME = 38, F_EXPENSE = 39, F_NET = 40;
export const FLOW_LEN = 41;
export const ORDINANCE_COUNT = 20, LINE_COUNT = 11, MONTHS_PER_YEAR = 12;

// ---- 12 个月环形账本布局（Int32Array(HIST_LEN)）----
export const H_TAX = 0;                 // 3 类 × 12 月 × [pop, rate]
export const H_LINES = 72;              // 11 线 × 12 月 × [count, funding]
export const H_BONDS = 336;             // 12 月 × [count, avgRateRaw]
export const H_ORD = 360;               // 12 月 × [enactedCount, net]
export const HIST_LEN = 384;
export const histTax = (z: 0 | 1 | 2, m: number): number => H_TAX + (z * 12 + m) * 2;
export const histLine = (line: number, m: number): number => H_LINES + (line * 12 + m) * 2;
export const histBond = (m: number): number => H_BONDS + m * 2;
export const histOrd = (m: number): number => H_ORD + m * 2;

// ---- 年报摘要布局（Int32Array(YEAR_LEN)；长度 0 = 尚无去年）----
export const Y_YEAR = 0, Y_OPENING = 1, Y_CLOSING = 2, Y_ISSUED = 3, Y_REPAID = 4, Y_MONTHS = 5, Y_TOTALS = 6;
export const YEAR_LEN = Y_TOTALS + FLOW_LEN;

export interface EconomyPriv extends PrivState {
  v: number;
  hist: Int32Array;            // HIST_LEN
  ytd: Int32Array[];           // 已结月份的 MonthlyFlow（≤ 12，各 FLOW_LEN）
  lastYear: Int32Array;        // YEAR_LEN 或空
  issued: number; repaid: number;   // 本年发行 / 偿还张数
  negYears: number;            // 连续年末负资金年数
  underfunded: number;         // 本年已报过 underfunded 的线位掩码
  taxGripe: boolean;           // 本年已报过 taxGripe
}

export function freshPriv(): EconomyPriv {
  return { v: ECONOMY_PRIV_VERSION, hist: new Int32Array(HIST_LEN), ytd: [], lastYear: new Int32Array(0), issued: 0, repaid: 0, negYears: 0, underfunded: 0, taxGripe: false };
}

const isI32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const isI32Array = (v: unknown, len?: number): v is Int32Array => v instanceof Int32Array && (len === undefined || v.length === len);

/** 形状校验：版本、各字段类型与长度；任何不符都视为无效（调用方重建，不抛错）。 */
export function isValidPriv(p: unknown): p is EconomyPriv {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return false;
  const o = p as Record<string, unknown>;
  if (o.v !== ECONOMY_PRIV_VERSION) return false;
  if (!isI32Array(o.hist, HIST_LEN)) return false;
  if (!Array.isArray(o.ytd) || o.ytd.length > 12 || !o.ytd.every((f) => isI32Array(f, FLOW_LEN))) return false;
  if (!isI32Array(o.lastYear) || (o.lastYear.length !== 0 && o.lastYear.length !== YEAR_LEN)) return false;
  if (!isI32(o.issued) || !isI32(o.repaid) || !isI32(o.negYears) || !isI32(o.underfunded)) return false;
  if (typeof o.taxGripe !== 'boolean') return false;
  return true;
}

/** 取当前 priv；缺失 / 版本不符 / 形状损坏 → 丢弃并换成空账本（不抛错，ARCHITECTURE §3.3）。 */
export function ensurePriv(state: CityState): EconomyPriv {
  const p = state.priv.economy;
  if (isValidPriv(p)) return p;
  const fresh = freshPriv();
  state.priv.economy = fresh;
  return fresh;
}

/** 两个 MonthlyFlow 逐项相加（into += add）。 */
export function addFlow(into: Int32Array, add: Int32Array): void {
  for (let k = 0; k < FLOW_LEN; k++) into[k] = into[k]! + add[k]!;
}
export function sumFlows(flows: readonly Int32Array[]): Int32Array {
  const out = new Int32Array(FLOW_LEN);
  for (const f of flows) addFlow(out, f);
  return out;
}

/** 可 JSON 化的 MonthlyFlow 视图（模态 payload / 测试用）。 */
export interface FlowView {
  tax: { r: number; c: number; i: number; total: number };
  ordinances: number[]; ordinanceNet: number; bondInterest: number;
  lines: number[]; fixed: number; income: number; expense: number; net: number;
}
export function flowView(f: Int32Array): FlowView {
  return {
    tax: { r: f[F_TAX_R]!, c: f[F_TAX_C]!, i: f[F_TAX_I]!, total: f[F_TAX_TOTAL]! },
    ordinances: Array.from(f.subarray(F_ORD, F_ORD + ORDINANCE_COUNT)), ordinanceNet: f[F_ORD_NET]!, bondInterest: f[F_BOND]!,
    lines: Array.from(f.subarray(F_LINES, F_LINES + LINE_COUNT)), fixed: f[F_FIXED]!, income: f[F_INCOME]!, expense: f[F_EXPENSE]!, net: f[F_NET]!,
  };
}
export interface YearReportView { year: number; openingFunds: number; closingFunds: number; bondsIssued: number; bondsRepaid: number; months: number; totals: FlowView }
export function yearView(y: Int32Array): YearReportView | null {
  if (y.length !== YEAR_LEN) return null;
  return { year: y[Y_YEAR]!, openingFunds: y[Y_OPENING]!, closingFunds: y[Y_CLOSING]!, bondsIssued: y[Y_ISSUED]!, bondsRepaid: y[Y_REPAID]!, months: y[Y_MONTHS]!, totals: flowView(y.subarray(Y_TOTALS, Y_TOTALS + FLOW_LEN)) };
}
