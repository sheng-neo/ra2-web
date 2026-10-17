// ===== strings.ts =====（全部玩家可见文案在 src/data/strings.<lang>.ts；CI 黑名单扫描）
// 文案表接口（CONTRACTS §T）：UI 不得写死文案；RejectReason / ModalId / QueryStat.key / BuildingDef.name / ToolDef.label 都是 strings 键。
import type { RejectReason } from './commands';
export type StringTable = Readonly<Record<string, string>>;
export interface Strings { t(key: string, args?: Record<string, string | number>): string; has(key: string): boolean; lang: 'zh' | 'en' }
/** 拒绝原因的 strings 键前缀：rejectKey('funds') === 'reject.funds'。 */
export const REJECT_KEY_PREFIX = 'reject.';
/** RejectReason → strings 键（'reject.funds' …）；UI 用 t(rejectKey(reason)) 取文案。 */
export const rejectKey = (reason: RejectReason): string => REJECT_KEY_PREFIX + reason;
