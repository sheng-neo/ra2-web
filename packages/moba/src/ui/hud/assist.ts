/**
 * 「对战辅助」两项设置(新手引导 / 当前目标提示)的读写小工具。
 *
 * 这两项由设置模块定义并持久化(Settings.tutorial / Settings.objectiveHints，缺省都算开)。
 * 这里按字段名读写而不直接依赖 Settings 的类型声明：老存档、测试用的宿主里可能没有这两个字段，一律按「开」处理。
 * 不碰 DOM，也不自己开存储键。
 */
import type { Settings } from '../api';

export type AssistKey = 'tutorial' | 'objectiveHints';

/** 读一项辅助开关；字段缺失或不是布尔值时按开处理 */
export function assistOn(settings: Settings, key: AssistKey): boolean {
  const v = (settings as unknown as Record<string, unknown>)[key];
  return typeof v === 'boolean' ? v : true;
}

/** 写回一项辅助开关(宿主负责持久化与内存兜底) */
export function setAssist(host: { updateSettings(patch: Partial<Settings>): void }, key: AssistKey, value: boolean): void {
  const patch: Record<string, boolean> = { [key]: value };
  host.updateSettings(patch as unknown as Partial<Settings>);
}
