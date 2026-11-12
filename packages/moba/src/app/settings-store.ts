/**
 * 设置的两层存放：玩家自己的设置(会写进存档) + 本次会话的调试覆盖值(URL 的 quality / fps 参数，不进存档)。
 *
 *   current   = saved 叠上 overrides，是各层实际读到的「生效值」；对象引用始终不变(界面、调试钩子都持有它)
 *   update()  只把玩家改过的键写进 saved 并持久化；某个键被玩家亲手改了，它的覆盖值随之失效(以玩家的为准)
 *
 * 这样 ?quality=low&fps=1 打开页面后，玩家只是拖了一下音量，存档里的画质和帧率开关也不会被调试值污染。
 */
export interface SettingsStore<T extends object> {
  /** 生效值(活对象，原地更新) */
  readonly current: T;
  /** 会被持久化的那一份(玩家自己的设置)；只读用途 */
  readonly saved: Readonly<T>;
  /** 应用一次改动：写入 saved、解除同名覆盖、刷新 current、调用 persist(saved) */
  update(patch: Partial<T>): void;
}

export function createSettingsStore<T extends object>(loaded: T, overrides: Partial<T>, persist: (saved: T) => void): SettingsStore<T> {
  const saved: T = { ...loaded };
  const over: Partial<T> = {};
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const v = overrides[key];
    if (v !== undefined) over[key] = v;
  }
  const current: T = { ...saved, ...over };

  return {
    current,
    saved,
    update(patch) {
      for (const key of Object.keys(patch) as (keyof T)[]) {
        const v = patch[key];
        if (v === undefined) continue;
        saved[key] = v as T[keyof T];
        delete over[key];
      }
      Object.assign(current, saved, over);
      persist({ ...saved });
    },
  };
}
