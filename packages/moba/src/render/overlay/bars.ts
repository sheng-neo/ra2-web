/**
 * 血条层：英雄(队伍色、护盾白段、每 1000 血刻度、法力条、等级徽标、名字、头顶状态图标与控制剩余时间)，
 * 小兵/野怪细条(满血隐藏)，塔/水晶宽条。受伤时有延迟追赶的掉血残影与一瞬的闪白。
 * 画在铺满容器的 2D canvas 上(按设备像素比)，在渲染模块 update 里绘制，与本帧镜头严格同步。
 */
import { MONSTERS } from '../../core/data/units';
import type { Buff, HeroUnit, Unit } from '../../core/types';
import type { FrameInfo } from '../engine/context';
import type { UnitAnchor, UnitAnchors } from '../fx/anchors';
import { FONT_NUM, type IconCache, type IconId, type TextCache } from './sprites2d';

interface BarState {
  /** 残影当前显示到的血量 */
  trail: number;
  /** 残影开始回落前的停顿 */
  hold: number;
  lastHp: number;
  flash: number;
  seen: number;
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

export class BarLayer {
  private states = new Map<number, BarState>();
  private stamp = 0;
  private text: TextCache;
  private icons: IconCache;
  private a: UnitAnchor = { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, unit: null };
  private p = { x: 0, y: 0 };
  private order: Unit[] = [];

  constructor(text: TextCache, icons: IconCache) {
    this.text = text;
    this.icons = icons;
  }

  private stateOf(u: Unit): BarState {
    let st = this.states.get(u.id);
    if (!st) {
      st = { trail: u.hp, hold: 0, lastHp: u.hp, flash: 0, seen: 0 };
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
    for (const u of order) {
      if (!u.alive) continue;
      const bs = this.stateOf(u);
      bs.seen = stamp;
      this.advance(u, bs, dt);
      if (!anchors.get(u.id, a) || !a.visible) continue;
      if (!project(a.x, a.y + a.height + 0.22, a.z, p)) continue;
      if (p.x < -70 || p.x > W + 70 || p.y < -30 || p.y > H + 60) continue;
      const x = Math.round(p.x);
      // 很高的建筑在屏幕上沿时把血条压回屏内
      const y = Math.max(16 * s, p.y);
      switch (u.kind) {
        case 'hero':
          this.hero(g, u, bs, x, y, s, frame);
          break;
        case 'minion':
          if (u.hp < u.stats.maxHp - 0.5) this.simple(g, u, bs, x, y, 34 * s, 4 * s, u.team === frame.playerTeam ? PAL.ally.fill : PAL.enemy.fill, false);
          break;
        case 'monster': {
          const epic = MONSTERS[u.monsterType].epic;
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
    // 清理已经不在场的单位
    if ((stamp & 63) === 0) {
      for (const [id, bs] of this.states) if (bs.seen < stamp - 60) this.states.delete(id);
    }
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
    // 每 1000 血一格刻度(每 5000 一根通高的)
    g.fillStyle = TICK;
    for (let v = 1000; v < total; v += 1000) g.fillRect(x0 + Math.round((w * v) / total), y0, 1, v % 5000 === 0 ? h : h * 0.55);
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
    const lv = this.text.get(String(u.level), Math.round(10.5 * s * k), '#ffffff', 'rgba(8,12,24,0.9)', 800, FONT_NUM);
    g.drawImage(lv.canvas, bx - lv.w / 2, by - lv.h / 2, lv.w, lv.h);
    // 名字
    const name = this.text.get(u.name, Math.round(12 * s * k), pal.name, 'rgba(6,10,20,0.92)');
    const ny = y0 - 3 * s - name.h;
    g.drawImage(name.canvas, cx - name.w / 2, ny, name.w, name.h);
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
