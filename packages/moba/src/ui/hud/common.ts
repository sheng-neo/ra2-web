/**
 * HUD 各组件共享的上下文与小工具。
 * 组件之间不直接互相引用：都只认 HudCtx，由 hud/index.ts 组装。
 */
import type { GameEvent, GameState, HeroId, HeroUnit, ItemId, PlayerTeam, Unit } from '../../core/types';
import type { HudHost } from '../api';

/** 输入布局：触控(虚拟摇杆 + 大按键) / 键鼠(键位角标 + 鼠标点地) */
export type InputMode = 'touch' | 'kbm';

export type ToastTone = 'warn' | 'info' | 'good';

/** HUD 面板类操作（按钮与快捷键共用同一套入口） */
export interface HudActions {
  setShop(open: boolean): void;
  toggleShop(): void;
  isShopOpen(): boolean;
  /** pinned = 点按钮打开(再点才关)；非 pinned = 按住 Tab 临时查看 */
  setScoreboard(open: boolean, pinned: boolean): void;
  toggleScoreboard(): void;
  isScoreboardPinned(): boolean;
  openSettings(): void;
  /** 购买：本地先按规则校验，通过才下命令。返回是否已下单 */
  buy(itemId: ItemId): boolean;
  sell(index: number): void;
}

export interface HudCtx {
  /** HUD 根节点(.sf-root.sf-hud) */
  readonly root: HTMLElement;
  readonly host: HudHost;
  /** 最近一帧的对局状态 */
  state: GameState;
  /** 玩家英雄（每帧刷新） */
  me: HeroUnit;
  readonly team: PlayerTeam;
  mode: InputMode;
  /** 设置/暂停面板打开中 */
  paused: boolean;
  /** 墙钟秒数：驱动与模拟时间无关的界面动画 */
  now: number;
  toast(text: string, tone?: ToastTone): void;
  /** 操作类输入(移动/攻击/施法)是否应屏蔽：阵亡、暂停、对局结束 */
  inputBlocked(): boolean;
  hero(id: number): HeroUnit | undefined;
  unit(id: number): Unit | undefined;
  actions: HudActions;
}

/** HUD 组件的统一形状 */
export interface HudPart {
  /** 每帧调用；内部自行做脏检查 */
  update?(ctx: HudCtx, dt: number): void;
  handleEvent?(ev: GameEvent, ctx: HudCtx): void;
  /** 一批事件全部分发完之后调用（需要把同批事件合并处理的组件用） */
  afterEvents?(ctx: HudCtx): void;
  /** 输入布局切换(触控 ↔ 键鼠) */
  onMode?(mode: InputMode): void;
  dispose?(): void;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 只在内容变化时才写 DOM 的文本槽 */
export function textSlot(el: HTMLElement): (s: string) => void {
  let last: string | null = null;
  return (s) => {
    if (s !== last) {
      last = s;
      el.textContent = s;
    }
  };
}

/** 只在数值变化时才格式化并写 DOM（省掉每帧拼字符串） */
export function numSlot(el: HTMLElement, fmt: (n: number) => string = String): (n: number) => void {
  let last = NaN;
  return (n) => {
    if (n !== last) {
      last = n;
      el.textContent = fmt(n);
    }
  };
}

/** 只在变化时才写的 CSS 变量槽；step 为量化步长(避免亚像素级的无意义重绘) */
export function varSlot(el: HTMLElement, name: string, step = 0.002): (v: number) => void {
  let last = NaN;
  return (v) => {
    const q = Math.round(v / step) * step;
    if (q !== last) {
      last = q;
      el.style.setProperty(name, q.toFixed(4));
    }
  };
}

/** 只在变化时才切换的类名槽 */
export function classSlot(el: HTMLElement, cls: string): (on: boolean) => void {
  let last: boolean | null = null;
  return (on) => {
    if (on !== last) {
      last = on;
      el.classList.toggle(cls, on);
    }
  };
}

/** 重新触发一次 CSS 动画（移除类 → 强制回流 → 加回） */
export function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 秒 → m:ss（顶部计时器，不补前导 0 的分钟位更紧凑） */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

export function isHero(u: Unit | undefined): u is HeroUnit {
  return !!u && u.kind === 'hero';
}

/** 英雄头像图（给 canvas 小地图用）：每位英雄只解码一次 */
export function createPortraitImages(host: HudHost): (heroId: HeroId) => HTMLImageElement | null {
  const cache = new Map<HeroId, HTMLImageElement | null>();
  return (heroId) => {
    let img = cache.get(heroId);
    if (img === undefined) {
      img = null;
      try {
        const src = host.portrait(heroId);
        if (src) {
          img = new Image();
          img.decoding = 'async';
          img.src = src;
        }
      } catch {
        img = null;
      }
      cache.set(heroId, img);
    }
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  };
}
