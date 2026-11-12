/**
 * 飘字：伤害(物理橙白 / 法术青蓝 / 真实白 / 暴击更大并弹跳带感叹号)、治疗(绿 +N)、金币(金色 +N 带金币)、升级。
 *
 * 十人团战的可读性规则：
 *   - 分级：与玩家自己相关的(自己打出 / 自己挨打)是一级，全尺寸；其余英雄之间的伤害是二级，缩小、半透明、同屏有上限；
 *     不涉及玩家的小兵 / 野怪 / 建筑挨打不出字(小兵互殴、队友打野的数字都是噪音)。
 *   - 合并：同一来源打同一目标、同一种字样，0.3 秒内的多段伤害并进还在弹出期的那个数字(数值累加、重新弹一下)，不再一段一个。
 *   - 错位：同一目标还没淡出的数字按错位槽散开，并整体向上错开，不叠在一起。
 * 数字用预渲染的字形条逐个贴图，任何数值都不产生新的文字精灵。
 */
import type { DamageType, GameEvent, GameState, Unit } from '../../core/types';
import type { UnitAnchor, UnitAnchors } from '../fx/anchors';
import type { Projector } from './bars';
import { GlyphStrip, type GlyphStyle, type IconCache, type Sprite2D, type TextCache } from './sprites2d';

const STYLE = { physical: 0, magic: 1, true: 2, crit: 3, heal: 4, gold: 5 } as const;

const STYLES: GlyphStyle[] = [
  { size: 21, top: '#fff6e0', bottom: '#ffb45a', stroke: '#8a3a08' },
  { size: 21, top: '#eafcff', bottom: '#6fd0ff', stroke: '#134a94' },
  { size: 21, top: '#ffffff', bottom: '#dfe4f0', stroke: '#4a5068' },
  { size: 31, top: '#fff8b0', bottom: '#ff9a1e', stroke: '#9a2400', italic: true },
  { size: 20, top: '#e6ffe0', bottom: '#5fe87a', stroke: '#0f6a2c' },
  { size: 19, top: '#fff6b8', bottom: '#ffc02a', stroke: '#7a4a00' },
];

interface Floater {
  live: boolean;
  style: number;
  text: string;
  sprite: Sprite2D | null;
  /** 出生时的世界锚点(之后不再跟随单位：数字留在原地更好读) */
  wx: number;
  wy: number;
  wz: number;
  /** 屏幕空间的起始偏移与漂移方向 */
  ox: number;
  oy: number;
  dir: number;
  t: number;
  life: number;
  scale: number;
  alpha: number;
  crit: boolean;
  coin: boolean;
  /** 合并用：来源、目标、数值与优先级(2 = 与玩家相关，1 = 其余英雄之间) */
  src: number;
  dst: number;
  amount: number;
  prio: number;
  /** 被后来的数字顶上去的高度(目标值 / 当前缓动值，CSS 像素，未乘界面缩放) */
  lift: number;
  liftNow: number;
}

/** 多段伤害的错位槽(CSS 像素，乘以界面缩放) */
const SLOTS: [number, number][] = [[0, 0], [16, -4], [-14, -6], [24, -2], [-22, -4], [8, -8], [-8, -8], [0, -10]];
/** 同一目标出新数字时，把还没淡出的旧数字往上顶这么高：数字一行一行往上走，不叠在一起 */
const LIFT = 21;
const POOL = 72;
/** 多段伤害合并的时间窗(秒)：只并进还在这段时间内的数字 */
const MERGE_WINDOW = 0.3;
/** 二级(与玩家无关的英雄间伤害)飘字的同屏上限与单个目标上限 */
const MAX_MINOR = 8;
const MAX_MINOR_PER_TARGET = 2;

const backOut = (t: number): number => {
  const u = t - 1;
  return 1 + u * u * (2.9 * u + 1.9);
};

export class FloaterLayer {
  private pool: Floater[] = [];
  private strips: GlyphStrip[] = [];
  private dpr = 1;
  private stagger = new Map<number, { t: number; n: number }>();
  private heals = new Map<number, { sum: number; t: number }>();
  private now = 0;
  private a: UnitAnchor = { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, opacity: 1, unit: null };
  private p = { x: 0, y: 0 };
  private text: TextCache;
  private icons: IconCache;
  /** 玩家所在队伍(handle 时更新) */
  private team: 0 | 1 = 0;

  constructor(text: TextCache, icons: IconCache, dpr: number) {
    this.text = text;
    this.icons = icons;
    for (let i = 0; i < POOL; i++) {
      this.pool.push({ live: false, style: 0, text: '', sprite: null, wx: 0, wy: 0, wz: 0, ox: 0, oy: 0, dir: 1, t: 0, life: 1, scale: 1, alpha: 1, crit: false, coin: false, src: -1, dst: -1, amount: 0, prio: 2, lift: 0, liftNow: 0 });
    }
    this.setDpr(dpr);
  }

  setDpr(dpr: number): void {
    if (dpr === this.dpr && this.strips.length > 0) return;
    this.dpr = dpr;
    this.strips = STYLES.map((st) => new GlyphStrip(st, dpr));
  }

  private take(): Floater {
    let oldest = this.pool[0];
    for (const f of this.pool) {
      if (!f.live) return f;
      if (f.t / f.life > oldest.t / oldest.life) oldest = f;
    }
    return oldest;
  }

  private spawn(targetId: number, anchors: UnitAnchors, x: number, z: number, style: number, text: string, scale: number, alpha: number, crit: boolean): Floater | null {
    const a = this.a;
    let wy = 1.8;
    let wx = x;
    let wz = z;
    if (anchors.get(targetId, a)) {
      wx = a.x;
      wz = a.z;
      // 从胸口偏上出字(不是头顶)：上飘的过程中经过血条右侧，不一出生就压在血条上
      wy = a.y + Math.min(a.height * 0.62, 3.4);
    }
    // 同一目标在上一个数字还没淡出前(0.8 秒内)出的后续数字，换下一个错位槽
    let st = this.stagger.get(targetId);
    if (!st) {
      st = { t: -9, n: 0 };
      this.stagger.set(targetId, st);
    }
    st.n = this.now - st.t < 0.8 ? st.n + 1 : 0;
    st.t = this.now;
    const slot = SLOTS[st.n % SLOTS.length];
    // 同一目标还在飘的数字整体上移一行(暴击字大，多顶一点)
    if (st.n > 0) {
      for (const o of this.pool) if (o.live && o.dst === targetId && o.t < o.life * 0.85) o.lift += crit ? LIFT * 1.4 : LIFT;
    }
    const f = this.take();
    f.live = true;
    f.style = style;
    f.text = text;
    f.sprite = null;
    f.wx = wx;
    f.wy = wy;
    f.wz = wz;
    // 整体偏到单位右侧：血条居中，数字靠右，两者不抢同一块地方
    f.ox = slot[0] + 30;
    f.oy = slot[1];
    f.dir = st.n % 2 === 0 ? 1 : -1;
    f.t = 0;
    f.life = crit ? 1.15 : 0.95;
    f.scale = scale;
    f.alpha = alpha;
    f.crit = crit;
    f.coin = false;
    f.src = -1;
    f.dst = targetId;
    f.amount = 0;
    f.prio = 2;
    f.lift = 0;
    f.liftNow = 0;
    return f;
  }

  /** 找一个还能并进去的同源同目标同字样数字 */
  private mergeable(src: number, dst: number, style: number): Floater | null {
    for (const f of this.pool) {
      if (f.live && f.src === src && f.dst === dst && f.style === style && f.t < MERGE_WINDOW) return f;
    }
    return null;
  }

  /** 二级飘字是否已经太多(全屏 / 同一目标) */
  private minorFull(dst: number): boolean {
    let all = 0;
    let mine = 0;
    for (const f of this.pool) {
      if (!f.live || f.prio !== 1) continue;
      all++;
      if (f.dst === dst) mine++;
    }
    return all >= MAX_MINOR || mine >= MAX_MINOR_PER_TARGET;
  }

  /** 玩家看不见的敌方单位(草丛里/视野外)：身上不出任何飘字，否则数字会把位置漏出来。玩家自己和中立单位不受限 */
  private hidden(u: Unit | undefined, pid: number): boolean {
    return u !== undefined && u.id !== pid && u.team !== this.team && u.team !== 2 && !u.visible[this.team];
  }

  handle(events: GameEvent[], state: GameState, anchors: UnitAnchors, playerTeam: number): void {
    const pid = state.playerId;
    this.team = playerTeam === 1 ? 1 : 0;
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          if (e.amount < 1) break;
          const mine = e.sourceId === pid || e.targetId === pid;
          const t = anchors.unit(e.targetId);
          // 技能蒙中了藏在草里/视野外的敌人：模拟层照样发 damage，但不能出字(哪怕是玩家自己打的)
          if (this.hidden(t, pid)) break;
          // 与玩家无关的：只显示英雄挨打(小兵 / 野怪 / 建筑挨别人的打不出字)
          if (!mine && (t === undefined || t.kind !== 'hero')) break;
          const style = e.crit ? STYLE.crit : styleOf(e.dtype);
          const m = this.mergeable(e.sourceId, e.targetId, style);
          if (m) {
            m.amount += e.amount;
            const n = Math.round(m.amount);
            m.text = e.crit ? `${n}!` : String(n);
            break;
          }
          if (!mine && this.minorFull(e.targetId)) break;
          const n = Math.round(e.amount);
          const f = this.spawn(e.targetId, anchors, e.pos.x, e.pos.y, style, e.crit ? `${n}!` : String(n), mine ? 1 : 0.7, mine ? 1 : 0.72, e.crit);
          if (f) {
            f.src = e.sourceId;
            f.amount = e.amount;
            f.prio = mine ? 2 : 1;
            // 玩家自己挨打的数字放在身体左侧，和自己打出去的(右侧)分开
            if (e.targetId === pid && e.sourceId !== pid) {
              f.ox -= 60;
              f.dir = -1;
            }
          }
          break;
        }
        case 'heal': {
          // 持续回复是一跳一跳的小数字：按目标攒 0.45 秒再出
          const h = this.heals.get(e.targetId);
          if (h) h.sum += e.amount;
          else this.heals.set(e.targetId, { sum: e.amount, t: this.now });
          break;
        }
        case 'gold': {
          if (e.unitId !== pid || e.amount < 1) break;
          const f = this.spawn(pid, anchors, e.pos.x, e.pos.y, STYLE.gold, `+${Math.round(e.amount)}`, e.reason === 'passive' ? 0.8 : 1, 1, false);
          if (f) {
            f.coin = true;
            f.life = 1.2;
            f.oy -= 26;
          }
          break;
        }
        case 'levelUp': {
          if (this.hidden(anchors.unit(e.unitId), pid)) break;
          const f = this.spawn(e.unitId, anchors, 0, 0, STYLE.gold, '', 1, 1, false);
          if (f) {
            f.sprite = this.text.get(`升级 Lv.${e.level}`, 17, '#ffe58a', 'rgba(60,34,0,0.95)', 800);
            f.life = 1.5;
            f.oy -= 34;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  draw(g: CanvasRenderingContext2D, dt: number, state: GameState, anchors: UnitAnchors, project: Projector, W: number, H: number, s: number): void {
    this.now += dt;
    // 到点的治疗合计出字
    if (this.heals.size > 0) {
      for (const [id, h] of this.heals) {
        if (this.now - h.t < 0.45) continue;
        this.heals.delete(id);
        const u = anchors.unit(id);
        if (h.sum >= 15 && u && (id === state.playerId || u.kind === 'hero') && !this.hidden(u, state.playerId)) {
          const f = this.spawn(id, anchors, u.pos.x, u.pos.y, STYLE.heal, `+${Math.round(h.sum)}`, id === state.playerId ? 1 : 0.8, 1, false);
          // 治疗数字偏左上，和偏右的伤害数字错开
          if (f) {
            f.ox -= 58;
            f.oy -= 14;
            f.dir = -1;
          }
        }
      }
    }
    if (this.stagger.size > 256) this.stagger.clear();
    const p = this.p;
    const ease = Math.min(1, dt * 14);
    for (const f of this.pool) {
      if (!f.live) continue;
      f.t += dt;
      f.liftNow += (f.lift - f.liftNow) * ease;
      if (f.t >= f.life) f.live = false;
    }
    // 两遍：先画二级(其余英雄之间)，再画一级(与玩家相关)，玩家自己的数字永远压在最上面
    for (let pass = 1; pass <= 2; pass++) this.drawPass(g, pass, project, W, H, s, p);
    g.globalAlpha = 1;
  }

  private drawPass(g: CanvasRenderingContext2D, pass: number, project: Projector, W: number, H: number, s: number, p: { x: number; y: number }): void {
    for (const f of this.pool) {
      if (!f.live || (pass === 1) !== (f.prio === 1)) continue;
      const t = f.t / f.life;
      if (!project(f.wx, f.wy, f.wz, p)) continue;
      if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) continue;
      // 上飘(先快后慢) + 轻微横漂；暴击先放大再回弹
      const rise = 1 - (1 - t) * (1 - t);
      const x = p.x + (f.ox + f.dir * 16 * t) * s;
      const y = p.y + (f.oy - 18 - 40 * rise - f.liftNow) * s;
      const pop = f.crit ? 2.0 - 1.0 * backOut(Math.min(1, f.t / 0.26)) : 1.4 - 0.4 * Math.min(1, f.t / 0.12);
      const sc = f.scale * pop * s;
      const alpha = f.alpha * (t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38);
      g.globalAlpha = alpha;
      if (f.sprite) {
        const w = f.sprite.w * sc;
        const h = f.sprite.h * sc;
        g.drawImage(f.sprite.canvas, x - w / 2, y - h / 2, w, h);
      } else {
        const strip = this.strips[f.style];
        if (f.coin) {
          const tw = strip.measure(f.text) * sc;
          this.icons.draw(g, 'coin', x - tw / 2 - 9 * sc, y, 15 * sc);
        }
        strip.draw(g, f.text, x, y, sc);
      }
    }
  }

  reset(): void {
    for (const f of this.pool) f.live = false;
    this.stagger.clear();
    this.heals.clear();
  }
}

function styleOf(d: DamageType): number {
  return d === 'magic' ? STYLE.magic : d === 'true' ? STYLE.true : STYLE.physical;
}
