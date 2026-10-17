// ===== sim/events/tech.ts =====（spec:disasters §2.9 / §3.6 科技发明时间线）
// 新城：invented[i] = base + int(delay)，低于开局年写 0（开局即有）；每年 1 月：year ≥ invented → 公告（槽位写 0）+ techInvented + toolbar + 报纸。
import { TECH_SLOT_KEYS } from '../../contracts/catalogue';
import type { TechKey } from '../../contracts/catalogue';
import { NewsType } from '../../contracts/events';
import { dateOf } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import type { SimContext } from '../../contracts/system';

/** 参与判定的槽位数（槽 16 为镜像 / 未用，读写保留原值、不参与）。 */
export const TECH_ACTIVE_SLOTS = 16;
/** 槽 0–11 为"发明"、12–15 为"创新"（spec §2.9 报纸组列）。 */
const LAST_INVENTION_SLOT = 11;
/** 随机延迟上限（不含）。 */
export const TECH_DELAY_YEARS = 20;

/** 新城掷发明年（恰消费 TECH_ACTIVE_SLOTS 次 PRNG）。 */
export function rollInventions(ctx: SimContext, startYear: number): void {
  const t = ctx.state.tech;
  t.invented.fill(0); t.announced.fill(0);
  for (let i = 0; i < TECH_ACTIVE_SLOTS; i++) {
    const key = TECH_SLOT_KEYS[i];
    const base = key ? ctx.catalogue.TECH_BASE_YEAR[key] : 0;
    const y = base + ctx.prng.int(TECH_DELAY_YEARS);
    t.invented[i] = y < startYear ? 0 : y;
    t.announced[i] = t.invented[i] === 0 ? 1 : 0;
  }
  t.invented[TECH_ACTIVE_SLOTS] = 0; t.announced[TECH_ACTIVE_SLOTS] = 1;
}

/** 每年 1 月第 0 天（techCheck 阶段，不消费 PRNG）：公告到期槽位。返回是否有新公告。 */
export function announceDue(ctx: SimContext): boolean {
  const s = ctx.state, t = s.tech;
  const year = dateOf(s.clock).year;
  let any = false;
  for (let i = 0; i < TECH_ACTIVE_SLOTS; i++) {
    if (t.announced[i] !== 0) continue;
    if (year < t.invented[i]!) continue;
    t.announced[i] = 1; t.invented[i] = 0;                 // dfloer："发明后为 0"
    any = true;
    ctx.act.emit({ type: 'techInvented', slot: i });
    ctx.act.news(i <= LAST_INVENTION_SLOT ? NewsType.Invention : NewsType.Innovation, i);
  }
  if (any) ctx.act.emit({ type: 'toolbar', reason: 'tech' });
  return any;
}

/** 读档对齐（不发事件）：第三方存档里 year ≥ invented 的槽位视为已公告并写 0。 */
export function silentCatchUp(state: CityState): void {
  const t = state.tech, year = dateOf(state.clock).year;
  for (let i = 0; i < TECH_ACTIVE_SLOTS; i++) {
    if (t.invented[i] === 0 || year >= t.invented[i]!) { t.invented[i] = 0; t.announced[i] = 1; } else t.announced[i] = 0;
  }
  t.announced[TECH_ACTIVE_SLOTS] = 1;
}

/** TechQuery.invented：槽位值 0（已公告 / 开局即有）或当前年 ≥ 发明年。 */
export function isInvented(state: CityState, key: TechKey): boolean {
  const slot = TECH_SLOT_KEYS.indexOf(key);
  if (slot < 0) return false;
  const v = state.tech.invented[slot]!;
  return v === 0 || dateOf(state.clock).year >= v;
}
