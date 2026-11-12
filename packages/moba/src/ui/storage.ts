/**
 * 带内存兜底的本地存储。
 *
 * 游戏常被嵌在受限的沙箱 iframe 里：那里访问 localStorage 会直接抛 SecurityError，读写全都落空。
 * 只靠 try/catch 的话，「刚选的英雄」「点掉过的提示」这类偏好在同一次会话里也记不住——
 * 所以每次写入都先落到内存表，读取时内存优先；本地存储能用就顺带持久化，不能用也不影响本次会话。
 */

const memory = new Map<string, string>();

/** 取得可用的 localStorage；宿主禁用存储时连读取这个属性都会抛错 */
function nativeStorage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

/** 读取：本次会话写过的值优先(它一定是最新的)，否则读本地存储；都没有返回 null */
export function storageGet(key: string): string | null {
  const own = memory.get(key);
  if (own !== undefined) return own;
  try {
    return nativeStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 写入：内存一定成功；本地存储写不进去(沙箱、隐私模式、配额满)就算了 */
export function storageSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    nativeStorage()?.setItem(key, value);
  } catch {
    // 存不了不影响本次会话
  }
}

/** 读取并解析 JSON；没有或解析失败返回 null */
export function storageGetJson(key: string): unknown {
  const raw = storageGet(key);
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** 清空内存表(单测用；正式流程不需要) */
export function storageResetMemory(): void {
  memory.clear();
}
