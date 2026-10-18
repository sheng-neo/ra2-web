// ===== ui/windows/text.ts =====（WP12b：文案访问；INT-B：缺键回退表已并入 data/strings.*.ts，本文件只保留访问器）
// 规则（wave-common §2.4）：玩家可见文案一律走 strings 键。tx() 有键则取表；缺键时返回键名（与 createStrings 的缺键行为一致，便于一眼看出漏译），
// 仍对 {name} 占位做替换以免把 args 丢掉。
import type { Strings } from '../../contracts/strings';

const interpolate = (s: string, args?: Record<string, string | number>): string =>
  args ? s.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : m)) : s;

/** 取文案：strings 有键则用表；否则返回键名。 */
export function tx(strings: Strings, key: string, args?: Record<string, string | number>): string {
  if (strings.has(key)) return strings.t(key, args);
  return interpolate(key, args);
}

/** 便捷绑定。 */
export const bindText = (strings: Strings): ((key: string, args?: Record<string, string | number>) => string) => (key, args) => tx(strings, key, args);
