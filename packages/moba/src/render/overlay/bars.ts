/**
 * 血条层：英雄(队伍色、护盾白段、每 1000 血一格、法力条、等级徽标、名字、头顶状态图标与控制剩余时间)，
 * 小兵/野怪细条(满血隐藏)，塔/水晶宽条。受伤时有延迟追赶的掉血残影与一瞬的闪白。
 * 画在铺满容器的 2D canvas 上(按设备像素比)，在渲染模块 update 里绘制，与本帧镜头严格同步。
 *
 * 团战避让：英雄的血条块(名字 + 血条)在屏幕上互相重叠时，靠上的那个向上让开(最多让一个块高)，
 * 玩家自己的血条不动、最后画；头顶名字只显示名字，不带职业。
 */
import { MONSTERS } from '../../core/data/units';
import type { Buff, HeroUnit, Unit } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import type { UnitAnchor, UnitAnchors } from '../fx/anchors';
import { FONT_NUM, type IconCache, type IconId, type Sprite2D, type TextCache } from './sprites2d';

interface BarState {
  /** 残影当前显示到的血量 */
  trail: number;
  /** 残影开始回落前的停顿 */
  hold: number;
  lastHp: number;
  flash: number;
  seen: number;
  /** 名字/等级的文字精灵(按缩放与等级缓存，避免每帧拼缓存键) */
  name: Sprite2D | null;
  nameKey: number;
  lv: Sprite2D | null;
  lvKey: number;
}

export type Projector = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

interface Palette {
  fill: string;
  name: string;
}

const PAL = {
  self: { fill: '#58d83e', name: '#c4ff9a' },
  ally: { fill: '#3f9cf6', name: '#a8d6ff' },
  enemy: { fill: '#f0483a', name: '#ff9c8c' },
  neutral: { fill: '#f0a630', name: '#ffe2a0' },
} satisfies Record<string, Palette>;

const BG = 'rgba(8,12,24,0.86)';
const GHOST = '#ffe6b0';
const SHIELD = '#f4f8ff';
const MANA = '#4aa8ff';
const TICK = 'rgba(6,10,20,0.72)';
const INVULN = '#8a8f9c';

const HARD_CC = ['stun', 'airborne', 'root', 'silence'] as const;

/** 本帧要画的英雄血条(先收集、再避让、再统一画) */
interface HeroSlot {
  u: HeroUnit;
  bs: BarState;
  x: number;
  y: number;
  fade: number;
  self: boolean;
}

/** 头顶只显示名字：界面别处是「名字 · 职业」，这里去掉职业 */
function shortName(name: string): string {
  const i = name.indexOf(' · ');
  return i > 0 ? name.slice(0, i) : name;
}

/** 屏幕矩形(CSS 像素，相对渲染容器左上角) */
export interface AvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class BarLayer {
  /**
   * 顶部界面占用的矩形(比分条、当前目标 / 引导卡)：宽血条(史诗野怪、建筑)被压到上沿时要落在它们下面，不能被盖住。
   * null = 界面层没给过，按 1280×720 基准的缺省布局估(随界面缩放)。
   */
  avoid: AvoidRect[] | null = null;
  private defaults: AvoidRect[] = [
    { left: 0, top: 0, right: 0, bottom: 0 },
    { left: 0, top: 0, right: 0, bottom: 0 },
  ];
  private states = new Map<number, BarState>();
  private stamp = 0;
  private text: TextCache;
  private icons: IconCache;
  private a: UnitAnchor = { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, opacity: 1, unit: null };
  private p = { x: 0, y: 0 };
  private foot = { x: 0, y: 0 };
  private order: Unit[] = [];
  private heroSlots: HeroSlot[] = [];
  private slotPool: HeroSlot[] = [];

  constructor(text: TextCache, icons: IconCache) {
    this.text = text;
    this.icons = icons;
  }

  private stateOf(u: Unit): BarState {
    let st = this.states.get(u.id);
    if (!st) {
      st = { trail: u.hp, hold: 0, lastHp: u.hp, flash: 0, seen: 0, name: null, nameKey: -1, lv: null, lvKey: -1 };
      this.states.set(u.id, st);
    }
    return st;
  }

  /** 推进残影/闪白(不在屏幕内的单位也要跟，免得进屏时残影乱跳) */
  private advance(u: Unit, st: BarState, dt: number): void {
    if (u.hp < st.lastHp - 0.5) {
      // 掉血：残影原地停一下再追
      st.hold = 0.32;
      st.flash = 0.14;
    } else if (u.hp > st.trail) st.trail = u.hp;
    st.lastHp = u.hp;
    if (st.flash > 0) st.flash -= dt;
    if (st.trail > u.hp) {
      if (st.hold > 0) st.hold -= dt;
      else st.trail = Math.max(u.hp, st.trail - u.stats.maxHp * 0.9 * dt - (st.trail - u.hp) * 4 * dt);
    }
  }

  draw(g: CanvasRenderingContext2D, frame: FrameInfo, anchors: UnitAnchors, project: Projector, W: number, H: number, s: number): void {
    const stamp = ++this.stamp;
    const dt = frame.dt;
    const st = frame.state;
    const order = this.order;
    order.length = 0;
    // 绘制顺序：小兵 → 野怪 → 建筑 → 英雄 → 玩家(后画的压在上面)
    for (const u of st.units) if (u.kind === 'minion') order.push(u);
    for (const u of st.units) if (u.kind === 'monster') order.push(u);
    for (const u of st.units) if (u.kind === 'tower' || u.kind === 'core') order.push(u);
    for (const u of st.units) if (u.kind === 'hero' && u.id !== st.playerId) order.push(u);
    for (const u of st.units) if (u.id === st.playerId) order.push(u);

    const a = this.a;
    const p = this.p;
    const slots = this.heroSlots;
    slots.length = 0;
    // 缺省的顶部避让区：比分条(居中，宽约 380、高约 52)与它下面的当前目标 / 引导卡(宽约 340，到约 98)
    let avoid = this.avoid;
    if (!avoid) {
      avoid = this.defaults;
      const d0 = avoid[0];
      const d1 = avoid[1];
      d0.left = W / 2 - 190 * s;
      d0.right = W / 2 + 190 * s;
      d0.bottom = 52 * s;
      d1.left = W / 2 - 170 * s;
      d1.right = W / 2 + 170 * s;
      d1.top = 58 * s;
      d1.bottom = 98 * s;
    }
    for (const u of order) {
      if (!u.alive) continue;
      const bs = this.stateOf(u);
      bs.seen = stamp;
      this.advance(u, bs, dt);
      if (!anchors.get(u.id, a) || !a.visible) continue;
      if (!project(a.x, a.y + a.height + 0.22, a.z, p)) continue;
      if (p.x < -70 || p.x > W + 70 || p.y > H + 60) continue;
      const building = u.kind === 'tower' || u.kind === 'core';
      // 高个子：建筑(八九米)与史诗野怪(巨龙近 6 米、巨灵 8 米多)。玩家从南面打它们时头顶在屏幕上沿之外
      const epic = u.kind === 'monster' && MONSTERS[u.monsterType].epic;
      const tall = building || epic;
      if (p.y < -30) {
        // 头顶出屏：只要身子还有一截在屏内，就把血条压在上沿(落在顶部界面的下面)，否则打龙 / 推塔时看不到它的血量
        if (!tall || !project(a.x, a.y + (building ? 2.4 : 1.2), a.z, this.foot) || this.foot.y < 30 * s) continue;
      }
      const x = Math.round(p.x);
      let y = Math.max((building ? 20 : 16) * s, p.y);
      if (tall && p.y < 150 * s) {
        // 血条块(史诗野怪连名牌)不能与顶部界面的矩形相交：相交就整块挪到那个矩形的下沿之下
        const half = (u.kind === 'core' ? 64 : epic ? 52 : 54) * s;
        const blockH = (epic ? 34 : 14) * s;
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (const r of avoid) {
            if (x + half <= r.left || x - half >= r.right || y - blockH >= r.bottom || y <= r.top) continue;
            y = r.bottom + blockH + 4 * s;
            moved = true;
          }
          if (!moved) break;
        }
      }
      // 跟着模型一起淡入淡出(刚进视野/丢失视野)；草丛里、不可选中的半透明不影响血条
      const fade = a.opacity >= 0.4 ? 1 : a.opacity / 0.4;
      if (fade <= 0.02) continue;
      g.globalAlpha = fade;
      switch (u.kind) {
        case 'hero': {
          const hs = this.slotPool[slots.length] ?? (this.slotPool[slots.length] = { u, bs, x: 0, y: 0, fade: 1, self: false });
          hs.u = u;
          hs.bs = bs;
          hs.x = x;
          hs.y = y;
          hs.fade = fade;
          hs.self = u.id === st.playerId;
          slots.push(hs);
          break;
        }
        case 'minion':
          if (u.hp < u.stats.maxHp - 0.5) this.simple(g, u, bs, x, y, 34 * s, 4 * s, u.team === frame.playerTeam ? PAL.ally.fill : PAL.enemy.fill, false);
          break;
        case 'monster': {
          if (!epic && u.hp >= u.stats.maxHp - 0.5) break;
          const w = (epic ? 96 : 40 + u.radius * 24) * s;
          this.simple(g, u, bs, x, y, w, (epic ? 8 : 5) * s, PAL.neutral.fill, epic);
          if (epic) {
            const name = this.text.get(MONSTERS[u.monsterType].name, Math.round(12 * s), PAL.neutral.name, 'rgba(10,8,2,0.9)');
            g.drawImage(name.canvas, x - name.w / 2, y - 10 * s - name.h, name.w, name.h);
          }
          break;
        }
        case 'tower':
        case 'core': {
          const mine = u.team === frame.playerTeam;
          const w = (u.kind === 'core' ? 128 : 100) * s;
          const h = (u.kind === 'core' ? 9 : 8) * s;
          this.simple(g, u, bs, x, y, w, h, u.invulnerable ? INVULN : mine ? PAL.ally.fill : PAL.enemy.fill, true);
          if (u.invulnerable) this.icons.draw(g, 'lock', x - w / 2 - 9 * s, y - h / 2, 13 * s);
          break;
        }
      }
    }
    // 英雄血条：避让后再画(其余英雄在前，玩家自己最后)
    this.declutter(slots, s);
    for (const hs of slots) {
      g.globalAlpha = hs.fade;
      this.hero(g, hs.u, hs.bs, hs.x, hs.y, s, frame);
    }
    g.globalAlpha = 1;
    // 清理已经不在场的单位
    if ((stamp & 63) === 0) {
      for (const [id, bs] of this.states) if (bs.seen < stamp - 60) this.states.delete(id);
    }
  }

  /**
   * 英雄血条块的避让：块 = 名字 + 血条(宽约 100、高约 30 CSS 像素)。按屏幕 y 从下往上放，
   * 与已放好的块重叠就把它抬到那个块的上方；最多抬两个块高(三四个人挤成一团时也能一层层码开)，再多就不抬了(血条不能离头顶太远)。
   * 玩家自己的块最先放、位置不动。
   */
  private declutter(slots: HeroSlot[], s: number): void {
    if (slots.length < 2) return;
    const W = 104 * s;
    const H = 31 * s;
    slots.sort((a, b) => (a.self ? -1 : b.self ? 1 : b.y - a.y));
    for (let i = 1; i < slots.length; i++) {
      const c = slots[i];
      const y0 = c.y;
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const o = slots[j];
          if (Math.abs(o.x - c.x) >= W || Math.abs(o.y - c.y) >= H) continue;
          const ny = o.y - H;
          if (y0 - ny > H * 2.1) continue;
          c.y = ny;
          moved = true;
        }
        if (!moved) break;
      }
    }
    // 画的顺序：其余英雄在前，玩家自己最后(压在最上面)
    slots.sort((a, b) => (a.self ? 1 : b.self ? -1 : 0));
  }

  /** 细条/宽条：底框 + 血量 + 残影(+ 刻度) */
  private simple(g: CanvasRenderingContext2D, u: Unit, bs: BarState, cx: number, yb: number, w: number, h: number, color: string, ticks: boolean): void {
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(yb - h);
    const max = u.stats.maxHp;
    g.fillStyle = BG;
    g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    const hw = (w * Math.max(0, u.hp)) / max;
    if (bs.trail > u.hp) {
      g.fillStyle = GHOST;
      g.fillRect(x0 + hw, y0, (w * (bs.trail - u.hp)) / max, h);
    }
    g.fillStyle = color;
    g.fillRect(x0, y0, hw, h);
    g.fillStyle = 'rgba(255,255,255,0.24)';
    g.fillRect(x0, y0, hw, h * 0.4);
    if (ticks) {
      g.fillStyle = TICK;
      const step = max > 9000 ? 2000 : 1000;
      for (let k = step; k < max; k += step) g.fillRect(x0 + Math.round((w * k) / max), y0, 1, h * 0.6);
    }
    if (bs.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.75, bs.flash * 6)})`;
      g.fillRect(x0, y0, hw, h);
    }
  }

  private hero(g: CanvasRenderingContext2D, u: HeroUnit, bs: BarState, cx: number, yb: number, s: number, frame: FrameInfo): void {
    const self = u.id === frame.state.playerId;
    const pal = self ? PAL.self : u.team === frame.playerTeam ? PAL.ally : PAL.enemy;
    const k = self ? 1.08 : 1;
    const w = Math.round(92 * s * k);
    const h = Math.round(9 * s * k);
    const mh = Math.max(2, Math.round(3 * s));
    const badge = 8.5 * s * k;
    // 等级徽标占左边一点位置：整体右移半个徽标保持视觉居中
    const x0 = Math.round(cx - w / 2 + badge * 0.5);
    const y0 = Math.round(yb - h - mh - 1);
    const max = u.stats.maxHp;
    const total = Math.max(max, u.hp + u.shield);
    g.fillStyle = BG;
    g.fillRect(x0 - 2, y0 - 2, w + 4, h + mh + 5);
    const hw = (w * Math.max(0, u.hp)) / total;
    const sw = (w * u.shield) / total;
    if (bs.trail > u.hp) {
      g.fillStyle = GHOST;
      g.fillRect(x0 + hw + sw, y0, Math.min(w - hw - sw, (w * (bs.trail - u.hp)) / total), h);
    }
    g.fillStyle = pal.fill;
    g.fillRect(x0, y0, hw, h);
    if (sw > 0) {
      g.fillStyle = SHIELD;
      g.fillRect(x0 + hw, y0, sw, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.26)';
    g.fillRect(x0, y0, hw + sw, h * 0.42);
    // 每 1000 血一格：通高的细分隔线(每 5000 一根加粗)，一眼数得出「还剩几格」
    g.fillStyle = TICK;
    for (let v = 1000; v < total; v += 1000) {
      const big = v % 5000 === 0;
      g.fillRect(x0 + Math.round((w * v) / total) - (big ? 1 : 0), y0, big ? 2 : 1, big ? h : h * 0.8);
    }
    if (bs.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.8, bs.flash * 6)})`;
      g.fillRect(x0, y0, hw, h);
    }
    if (u.stats.maxMana > 0) {
      g.fillStyle = 'rgba(20,34,60,0.9)';
      g.fillRect(x0, y0 + h + 1, w, mh);
      g.fillStyle = MANA;
      g.fillRect(x0, y0 + h + 1, (w * Math.max(0, u.mana)) / u.stats.maxMana, mh);
    }
    // 等级徽标
    const bx = x0 - badge * 0.9;
    const by = y0 + (h + mh) / 2;
    g.beginPath();
    g.arc(bx, by, badge, 0, Math.PI * 2);
    g.fillStyle = '#0c1428';
    g.fill();
    g.lineWidth = Math.max(1, 1.4 * s);
    g.strokeStyle = self ? '#d8ff7a' : '#f0c860';
    g.stroke();
    // 文字精灵：缩放/等级/敌我没变就复用上一帧的
    const dprKey = this.text.dprKey;
    const lvKey = u.level * 4096 + Math.round(s * k * 100) + dprKey;
    if (!bs.lv || bs.lvKey !== lvKey) {
      bs.lv = this.text.get(String(u.level), Math.round(10.5 * s * k), '#ffffff', 'rgba(8,12,24,0.9)', 800, FONT_NUM);
      bs.lvKey = lvKey;
    }
    const lv = bs.lv;
    g.drawImage(lv.canvas, bx - lv.w / 2, by - lv.h / 2, lv.w, lv.h);
    // 名字(只显示名字)：自己的略大略亮，其余的小一号、半透明，层级落在血条之下
    const nameKey = (self ? 1 : u.team === frame.playerTeam ? 2 : 3) * 4096 + Math.round(s * k * 100) + dprKey;
    if (!bs.name || bs.nameKey !== nameKey) {
      bs.name = this.text.get(shortName(u.name), Math.round((self ? 12 : 11) * s * k), pal.name, 'rgba(6,10,20,0.92)', self ? 800 : 600);
      bs.nameKey = nameKey;
    }
    const name = bs.name;
    const ny = y0 - 3 * s - name.h;
    const ga = g.globalAlpha;
    g.globalAlpha = ga * (self ? 1 : 0.85);
    g.drawImage(name.canvas, cx - name.w / 2, ny, name.w, name.h);
    g.globalAlpha = ga;
    this.statusRow(g, u.buffs, cx, ny - 7 * s, s);
  }

  /** 头顶状态图标一行 + 硬控剩余时间条 */
  private statusRow(g: CanvasRenderingContext2D, buffs: Buff[], cx: number, cy: number, s: number): void {
    if (buffs.length === 0) return;
    const list = ROW;
    list.length = 0;
    let cc: Buff | null = null;
    let mark = 0;
    let focus = 0;
    let gale = 0;
    for (const b of buffs) {
      switch (b.id) {
        case 'stun':
        case 'airborne':
        case 'root':
        case 'silence':
          if (!list.includes(b.id)) list.push(b.id);
          if (!cc || HARD_CC.indexOf(b.id) < HARD_CC.indexOf(cc.id as (typeof HARD_CC)[number]) || (b.id === cc.id && b.timeLeft > cc.timeLeft)) cc = b;
          break;
        case 'slow':
        case 'burn':
          if (!list.includes(b.id)) list.push(b.id);
          break;
        case 'untargetable':
          if (!list.includes('ghost')) list.push('ghost');
          break;
        case 'xingli_mark':
          mark = Math.max(mark, b.stacks);
          break;
        case 'tower_focus':
          focus = Math.max(focus, b.stacks);
          break;
        case 'fengling_gale':
          gale = Math.max(gale, b.stacks);
          break;
        default:
          break;
      }
    }
    const size = 15 * s;
    const gap = 2 * s;
    // 层数类：印记直接画 N 颗，其余画图标 + 数字
    const count = list.length + Math.min(3, mark) + (focus > 0 ? 1 : 0) + (gale > 0 ? 1 : 0);
    if (count === 0) return;
    let x = cx - ((size + gap) * count - gap) / 2 + size / 2;
    const y = cy - size / 2;
    for (const id of list) {
      this.icons.draw(g, id, x, y, size);
      x += size + gap;
    }
    for (let i = 0; i < Math.min(3, mark); i++) {
      this.icons.draw(g, 'mark', x, y, size);
      x += size + gap;
    }
    if (focus > 0) {
      this.icons.draw(g, 'focus', x, y, size);
      this.stackNum(g, focus, x, y, s, '#ff8a78');
      x += size + gap;
    }
    if (gale > 0) {
      this.icons.draw(g, 'gale', x, y, size);
      this.stackNum(g, gale, x, y, s, '#c8ffe8');
    }
    if (cc && cc.duration > 0 && Number.isFinite(cc.duration)) {
      const w = 44 * s;
      const h = Math.max(2, 3 * s);
      const x0 = Math.round(cx - w / 2);
      const y0 = Math.round(cy - size - 5 * s);
      g.fillStyle = BG;
      g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
      g.fillStyle = '#ffd84a';
      g.fillRect(x0, y0, w * Math.max(0, Math.min(1, cc.timeLeft / cc.duration)), h);
    }
  }

  private stackNum(g: CanvasRenderingContext2D, n: number, x: number, y: number, s: number, color: string): void {
    const t = this.text.get(String(n), Math.round(10 * s), color, 'rgba(6,10,20,0.95)', 800, FONT_NUM);
    g.drawImage(t.canvas, x + 2 * s, y + 1 * s, t.w, t.h);
  }

  reset(): void {
    this.states.clear();
  }
}

const ROW: IconId[] = [];
