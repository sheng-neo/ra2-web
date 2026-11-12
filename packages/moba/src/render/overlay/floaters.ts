/**
 * 飘字：伤害(物理橙白 / 法术青蓝 / 真实白 / 暴击更大并弹跳带感叹号)、治疗(绿 +N)、金币(金色 +N 带金币)、升级。
 * 同一目标短时间内的多段伤害按「错位槽」散开不重叠；只显示屏幕内、且与英雄有关的(小兵互殴的数字是噪音)。
 * 数字用预渲染的字形条逐个贴图，任何数值都不产生新的文字精灵。
 */
import type { DamageType, GameEvent, GameState } from '../../core/types';
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
}

/** 多段伤害的错位槽(CSS 像素，乘以界面缩放) */
const SLOTS: [number, number][] = [[0, 0], [22, -13], [-22, -15], [36, 5], [-36, 3], [10, -30], [-12, -32], [46, -14]];
const POOL = 72;

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
  private a: UnitAnchor = { x: 0, y: 0, z: 0, height: 2, radius: 0.6, visible: false, unit: null };
  private p = { x: 0, y: 0 };
  private text: TextCache;
  private icons: IconCache;

  constructor(text: TextCache, icons: IconCache, dpr: number) {
    this.text = text;
    this.icons = icons;
    for (let i = 0; i < POOL; i++) {
      this.pool.push({ live: false, style: 0, text: '', sprite: null, wx: 0, wy: 0, wz: 0, ox: 0, oy: 0, dir: 1, t: 0, life: 1, scale: 1, alpha: 1, crit: false, coin: false });
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
      wy = a.y + Math.min(a.height * 0.82, 4.2);
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
    const f = this.take();
    f.live = true;
    f.style = style;
    f.text = text;
    f.sprite = null;
    f.wx = wx;
    f.wy = wy;
    f.wz = wz;
    f.ox = slot[0];
    f.oy = slot[1];
    f.dir = st.n % 2 === 0 ? 1 : -1;
    f.t = 0;
    f.life = crit ? 1.15 : 0.95;
    f.scale = scale;
    f.alpha = alpha;
    f.crit = crit;
    f.coin = false;
    return f;
  }

  handle(events: GameEvent[], state: GameState, anchors: UnitAnchors, playerTeam: number): void {
    const pid = state.playerId;
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          if (e.amount < 1) break;
          const mine = e.sourceId === pid || e.targetId === pid;
          let related = mine;
          if (!related) {
            // 与玩家无关的：至少一方是英雄才显示
            const t = anchors.unit(e.targetId);
            const s = anchors.unit(e.sourceId);
            related = (t !== undefined && t.kind === 'hero') || (s !== undefined && s.kind === 'hero');
            if (related && t && t.team !== playerTeam && !t.visible[playerTeam as 0 | 1]) related = false;
          }
          if (!related) break;
          const style = e.crit ? STYLE.crit : styleOf(e.dtype);
          const n = Math.round(e.amount);
          this.spawn(e.targetId, anchors, e.pos.x, e.pos.y, style, e.crit ? `${n}!` : String(n), mine ? 1 : 0.78, mine ? 1 : 0.85, e.crit);
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
        if (h.sum >= 15 && u && (id === state.playerId || u.kind === 'hero')) {
          const f = this.spawn(id, anchors, u.pos.x, u.pos.y, STYLE.heal, `+${Math.round(h.sum)}`, id === state.playerId ? 1 : 0.8, 1, false);
          if (f) f.oy -= 12;
        }
      }
    }
    if (this.stagger.size > 256) this.stagger.clear();
    const p = this.p;
    for (const f of this.pool) {
      if (!f.live) continue;
      f.t += dt;
      const t = f.t / f.life;
      if (t >= 1) {
        f.live = false;
        continue;
      }
      if (!project(f.wx, f.wy, f.wz, p)) continue;
      if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) continue;
      // 上飘(先快后慢) + 轻微横漂；暴击先放大再回弹
      const rise = 1 - (1 - t) * (1 - t);
      const x = p.x + (f.ox + f.dir * 16 * t) * s;
      const y = p.y + (f.oy - 18 - 44 * rise) * s;
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
    g.globalAlpha = 1;
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
