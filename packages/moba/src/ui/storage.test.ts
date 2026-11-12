import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storageGet, storageGetJson, storageResetMemory, storageSet } from './storage';

type G = { localStorage?: unknown };
const g = globalThis as G;

/** 一个最小的可用 Storage */
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

describe('ui/storage 带内存兜底的本地存储', () => {
  let saved: PropertyDescriptor | undefined;
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storageResetMemory();
  });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete g.localStorage;
  });

  it('本地存储可用：写入会持久化，读取能读到之前存的值', () => {
    const store = fakeStorage({ old: 'x' });
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
    expect(storageGet('old')).toBe('x');
    storageSet('k', 'v');
    expect(store.data.get('k')).toBe('v');
    expect(storageGet('k')).toBe('v');
    expect(storageGet('missing')).toBeNull();
  });

  it('getItem / setItem 抛 SecurityError：同一次会话里仍然记得住', () => {
    Object.defineProperty(globalThis, 'localStorage', { value: throwingStorage(), configurable: true, writable: true });
    expect(storageGet('k')).toBeNull();
    expect(() => storageSet('k', 'v1')).not.toThrow();
    expect(storageGet('k')).toBe('v1');
    storageSet('k', 'v2');
    expect(storageGet('k')).toBe('v2');
  });

  it('连读取 localStorage 属性本身都抛错(部分沙箱宿主)：照样走内存', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(storageGet('k')).toBeNull();
    storageSet('k', 'v');
    expect(storageGet('k')).toBe('v');
  });

  it('没有 localStorage(非浏览器环境)：走内存', () => {
    delete g.localStorage;
    storageSet('k', 'v');
    expect(storageGet('k')).toBe('v');
  });

  it('配额满写不进去时，读到的是本次会话的新值而不是存储里的旧值', () => {
    const store = fakeStorage({ k: 'stale' });
    store.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
    expect(storageGet('k')).toBe('stale');
    storageSet('k', 'fresh');
    expect(storageGet('k')).toBe('fresh');
  });

  it('storageGetJson：坏数据返回 null 而不是抛错', () => {
    delete g.localStorage;
    storageSet('good', JSON.stringify({ a: 1 }));
    storageSet('bad', '{oops');
    expect(storageGetJson('good')).toEqual({ a: 1 });
    expect(storageGetJson('bad')).toBeNull();
    expect(storageGetJson('none')).toBeNull();
  });
});
