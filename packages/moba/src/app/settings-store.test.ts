import { describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from './settings-store';

interface S {
  quality: 'low' | 'medium' | 'high';
  masterVolume: number;
  showFps: boolean;
  cameraShake: boolean;
}

const LOADED: S = { quality: 'high', masterVolume: 0.8, showFps: false, cameraShake: true };

describe('设置的两层存放(玩家存档 + 调试覆盖)', () => {
  it('没有覆盖值：生效值就是存档值，改动原样持久化', () => {
    const persist = vi.fn();
    const store = createSettingsStore<S>(LOADED, {}, persist);
    expect(store.current).toEqual(LOADED);
    store.update({ masterVolume: 0.3 });
    expect(store.current.masterVolume).toBe(0.3);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toEqual({ ...LOADED, masterVolume: 0.3 });
  });

  it('URL 调试覆盖(quality / fps)对本次会话生效，但不写进存档', () => {
    const persist = vi.fn();
    const store = createSettingsStore<S>(LOADED, { quality: 'low', showFps: true }, persist);
    expect(store.current.quality).toBe('low');
    expect(store.current.showFps).toBe(true);
    // 玩家只拖了一下主音量
    store.update({ masterVolume: 0.7 });
    expect(store.current).toEqual({ quality: 'low', masterVolume: 0.7, showFps: true, cameraShake: true });
    expect(persist.mock.calls[0][0]).toEqual({ quality: 'high', masterVolume: 0.7, showFps: false, cameraShake: true });
  });

  it('玩家亲手改了被覆盖的那一项：以玩家的为准并存档，其余覆盖仍在', () => {
    const persist = vi.fn();
    const store = createSettingsStore<S>(LOADED, { quality: 'low', showFps: true }, persist);
    store.update({ quality: 'medium' });
    expect(store.current.quality).toBe('medium');
    expect(store.current.showFps).toBe(true);
    expect(persist.mock.calls[0][0]).toEqual({ ...LOADED, quality: 'medium' });
    // 之后再改别的，画质不会弹回覆盖值
    store.update({ cameraShake: false });
    expect(store.current.quality).toBe('medium');
    expect(persist.mock.calls[1][0]).toEqual({ quality: 'medium', masterVolume: 0.8, showFps: false, cameraShake: false });
  });

  it('把被覆盖的开关改回与存档相同的值也算玩家的选择(关掉 ?fps=1 的帧率显示)', () => {
    const persist = vi.fn();
    const store = createSettingsStore<S>(LOADED, { showFps: true }, persist);
    store.update({ showFps: false });
    expect(store.current.showFps).toBe(false);
    store.update({ masterVolume: 0.5 });
    expect(store.current.showFps).toBe(false);
  });

  it('current 的对象引用始终不变(界面与调试钩子持有它)', () => {
    const store = createSettingsStore<S>(LOADED, { quality: 'low' }, () => {});
    const ref = store.current;
    store.update({ masterVolume: 0.1 });
    store.update({ quality: 'high' });
    expect(store.current).toBe(ref);
    expect(ref.quality).toBe('high');
  });

  it('不改动传入的 loaded / overrides；值为 undefined 的键被忽略', () => {
    const loaded = { ...LOADED };
    const overrides: Partial<S> = { quality: 'low', showFps: undefined };
    const persist = vi.fn();
    const store = createSettingsStore<S>(loaded, overrides, persist);
    expect(store.current.showFps).toBe(false);
    store.update({ masterVolume: undefined, cameraShake: false });
    expect(loaded).toEqual(LOADED);
    expect(overrides).toEqual({ quality: 'low', showFps: undefined });
    expect(store.saved.masterVolume).toBe(0.8);
    expect(persist.mock.calls[0][0]).toEqual({ ...LOADED, cameraShake: false });
  });
});
