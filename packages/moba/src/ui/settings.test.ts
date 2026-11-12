import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './api';
import { loadSettings, saveSettings } from './settings';
import { storageResetMemory } from './storage';

type G = { localStorage?: unknown };
const g = globalThis as G;
const KEY = 'starfall.settings.v1';

function fakeStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: () => null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

/** 沙箱 iframe 里的 Storage：任何访问都抛 SecurityError */
function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error('SecurityError: The operation is insecure.');
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

describe('设置读写：第二阶段新增的对战辅助三项(autoBuy / tutorial / objectiveHints)', () => {
  let saved: PropertyDescriptor | undefined;
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storageResetMemory();
  });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete g.localStorage;
  });

  it('默认值：三项都是开(首次游玩 = 自动出装、新手引导、目标提示全开)', () => {
    expect(DEFAULT_SETTINGS.autoBuy).toBe(true);
    expect(DEFAULT_SETTINGS.tutorial).toBe(true);
    expect(DEFAULT_SETTINGS.objectiveHints).toBe(true);
    g.localStorage = fakeStorage();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('第一阶段的老存档没有这三项：取默认值(开)，原有的值照旧', () => {
    g.localStorage = fakeStorage({ [KEY]: JSON.stringify({ quality: 'medium', masterVolume: 0.3, sfxVolume: 0.9, musicVolume: 0, showFps: true, cameraShake: false }) });
    const s = loadSettings({ quality: 'low' });
    expect(s).toEqual({ quality: 'medium', masterVolume: 0.3, sfxVolume: 0.9, musicVolume: 0, showFps: true, cameraShake: false, autoBuy: true, tutorial: true, objectiveHints: true });
  });

  it('存过的布尔值照读；类型不对的脏数据被忽略', () => {
    g.localStorage = fakeStorage({ [KEY]: JSON.stringify({ autoBuy: false, tutorial: false, objectiveHints: false }) });
    expect(loadSettings()).toMatchObject({ autoBuy: false, tutorial: false, objectiveHints: false });
    storageResetMemory();
    g.localStorage = fakeStorage({ [KEY]: JSON.stringify({ autoBuy: 0, tutorial: 'no', objectiveHints: null }) });
    expect(loadSettings()).toMatchObject({ autoBuy: true, tutorial: true, objectiveHints: true });
  });

  it('saveSettings → loadSettings 往返；宿主给的设备默认值(画质)只在没有存档时生效', () => {
    const store = fakeStorage();
    g.localStorage = store;
    expect(loadSettings({ quality: 'low' }).quality).toBe('low');
    saveSettings({ ...DEFAULT_SETTINGS, quality: 'high', tutorial: false, autoBuy: false });
    expect(JSON.parse(store.data.get(KEY) as string)).toMatchObject({ tutorial: false, autoBuy: false, objectiveHints: true });
    // 换一次会话(清掉内存表)：从本地存储读回
    storageResetMemory();
    expect(loadSettings({ quality: 'low' })).toMatchObject({ quality: 'high', tutorial: false, autoBuy: false, objectiveHints: true });
  });

  it('本地存储不可用(沙箱 iframe)：本次会话内记得住「引导已关」，刷新页面(新会话)后回到默认', () => {
    g.localStorage = throwingStorage();
    expect(loadSettings().tutorial).toBe(true);
    // 打完第一局，宿主写 tutorial: false
    saveSettings({ ...loadSettings(), tutorial: false });
    expect(loadSettings().tutorial).toBe(false);
    expect(loadSettings().autoBuy).toBe(true);
    // 刷新页面 = 内存表清空
    storageResetMemory();
    expect(loadSettings().tutorial).toBe(true);
  });

  it('连读取 localStorage 属性都抛错的宿主同样有内存兜底', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    saveSettings({ ...DEFAULT_SETTINGS, objectiveHints: false });
    expect(loadSettings().objectiveHints).toBe(false);
  });
});
