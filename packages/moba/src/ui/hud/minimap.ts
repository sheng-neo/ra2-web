/**
 * 小地图（canvas 2D）。方位与主镜头一致：蓝方基地在左下、红方在右上。
 * 静态地形只画一次到离屏画布；动态层(单位/野怪/视野框/信号)按 12~30Hz 重画，不跟渲染帧率。
 */
import { HEROES } from '../../core/data/heroes';
import { MONSTERS } from '../../core/data/units';
import type { GameEvent, HeroUnit, MonsterType, Polygon, Unit, Vec2 } from '../../core/types';
import { COLORS, h, injectStyle, sfCss, svgDataUri } from '../theme';
import { clamp, createPortraitImages, type HudCtx, type HudPart } from './common';

const STAR = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 0Q8.8 7.2 16 8Q8.8 8.8 8 16Q7.2 8.8 0 8Q7.2 7.2 8 0Z" fill="#ffe7ad"/></svg>',
);

const CSS =
  sfCss(`
.sf-hud__mini {
  position: absolute; left: var(--hud-l); top: var(--hud-t); z-index: 3; width: var(--hud-mini); height: var(--hud-mini); padding: max(2px, 3u); border-radius: 9u;
  background: linear-gradient(180deg, rgba(20, 33, 72, 0.94), rgba(7, 12, 30, 0.96)); box-shadow: 0 6u 18u rgba(2, 4, 12, 0.55);
  touch-action: none; cursor: crosshair;
}
/* 金色星轨描边：与面板同一手法，左上/右下两角最亮 */
.sf-hud__mini::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
  background: conic-gradient(from 315deg at 50% 50%, rgba(255, 231, 173, 0.95) 0deg, rgba(224, 177, 96, 0.4) 40deg, rgba(160, 180, 230, 0.22) 110deg,
    rgba(224, 177, 96, 0.36) 150deg, rgba(255, 231, 173, 0.85) 180deg, rgba(224, 177, 96, 0.36) 212deg, rgba(160, 180, 230, 0.22) 250deg, rgba(224, 177, 96, 0.4) 322deg, rgba(255, 231, 173, 0.95) 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
.sf-hud__mini::after { content: ''; position: absolute; left: -6u; top: -6u; width: 14u; height: 14u; pointer-events: none; background-repeat: no-repeat; background-size: contain; }
.sf-hud__mini > canvas { display: block; width: 100%; height: 100%; border-radius: 6u; }
.sf-hud__mini.is-peek { box-shadow: 0 6u 18u rgba(2, 4, 12, 0.55), 0 0 0 1px rgba(143, 233, 255, 0.7), 0 0 14u rgba(92, 214, 247, 0.45); }
@media (orientation: portrait) { .sf-hud { --hud-mini: 136u; } }
`) + `.sf-hud__mini::after { background-image: ${STAR}; }`;

const TEAM_COLOR = [COLORS.blue, COLORS.red] as const;
const CAMP_COLOR: Record<MonsterType, string> = {
  mossback: '#e2cf7a',
  glimwing: '#e2cf7a',
  frost_golem: '#74c8ff',
  ember_golem: '#ff8f5e',
  abyss_drake: '#c09bff',
  star_colossus: '#ffd76a',
};

type PingKind = 'kill' | 'alert' | 'tower' | 'epic';
interface Ping {
  x: number;
  y: number;
  t0: number;
  kind: PingKind;
  color: string;
}
const PING_LIFE: Record<PingKind, number> = { kill: 1.8, alert: 2.4, tower: 2.6, epic: 2.6 };

export interface Minimap extends HudPart {
  el: HTMLElement;
}

export function createMinimap(ctx: HudCtx): Minimap {
  injectStyle('sf-hud-mini', CSS);
  const { host } = ctx;
  const map = ctx.state.map;
  /** 展示范围半边长：可走区域外留一圈，建筑图标不贴边 */
  const R = map.bound + 3;

  const canvas = document.createElement('canvas');
  const el = h('div', 'sf-hud__mini', canvas);
  el.setAttribute('data-hud-hit', '');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', '小地图：按住拖动可观察战场');
  const g = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const portraitImg = createPortraitImages(host);

  let px = 0;
  /** 画布像素 / 米 */
  let k = 1;
  /** 相对设计尺寸(172 CSS 像素 @1x)的缩放：图标大小跟着走 */
  let s = 1;
  let sizeDirty = true;
  let lastMeasure = -1;
  let lastDraw = -1;
  const pings: Ping[] = [];
  const lastAlert = new Map<number, number>();
  /** 己方建筑 id：受击时在小地图上报警。查表比每条伤害事件都去搜单位便宜得多 */
  const allyStructures = new Set<number>();
  for (const u of ctx.state.units) if ((u.kind === 'tower' || u.kind === 'core') && u.team === ctx.team) allyStructures.add(u.id);
  const heroBuf: HeroUnit[] = [];
  const structBuf: Unit[] = [];

  const mx = (x: number): number => (x + R) * k;
  const my = (y: number): number => (y + R) * k;

  function poly(c: CanvasRenderingContext2D, p: Polygon): void {
    c.beginPath();
    for (let i = 0; i < p.length; i++) {
      if (i === 0) c.moveTo(mx(p[i].x), my(p[i].y));
      else c.lineTo(mx(p[i].x), my(p[i].y));
    }
    c.closePath();
  }
  function line(c: CanvasRenderingContext2D, p: Vec2[]): void {
    c.beginPath();
    for (let i = 0; i < p.length; i++) {
      if (i === 0) c.moveTo(mx(p[i].x), my(p[i].y));
      else c.lineTo(mx(p[i].x), my(p[i].y));
    }
  }

  function buildStatic(): void {
    base.width = base.height = px;
    const c = base.getContext('2d');
    if (!c) return;
    const b = map.bound;
    c.fillStyle = '#070d1a';
    c.fillRect(0, 0, px, px);

    // 可走区域：圆角方形的草地，中心略亮
    const x0 = mx(-b);
    const y0 = my(-b);
    const w = 2 * b * k;
    const rad = 4 * k;
    c.save();
    c.beginPath();
    c.moveTo(x0 + rad, y0);
    c.arcTo(x0 + w, y0, x0 + w, y0 + w, rad);
    c.arcTo(x0 + w, y0 + w, x0, y0 + w, rad);
    c.arcTo(x0, y0 + w, x0, y0, rad);
    c.arcTo(x0, y0, x0 + w, y0, rad);
    c.closePath();
    c.clip();
    const grass = c.createRadialGradient(px / 2, px / 2, px * 0.05, px / 2, px / 2, px * 0.72);
    grass.addColorStop(0, '#2c6a50');
    grass.addColorStop(1, '#1b4238');
    c.fillStyle = grass;
    c.fillRect(0, 0, px, px);

    // 河道
    c.lineCap = 'round';
    c.lineJoin = 'round';
    line(c, map.river);
    c.strokeStyle = '#236f95';
    c.lineWidth = map.riverWidth * k;
    c.stroke();
    line(c, map.river);
    c.strokeStyle = 'rgba(110, 205, 235, 0.55)';
    c.lineWidth = map.riverWidth * k * 0.5;
    c.stroke();

    // 兵线：暖色石板路
    for (const lane of [map.lanes.top, map.lanes.bot, map.lanes.mid]) {
      line(c, lane);
      c.strokeStyle = '#8f7d55';
      c.lineWidth = map.laneWidth * k * 0.78;
      c.stroke();
      line(c, lane);
      c.strokeStyle = '#b9a577';
      c.lineWidth = map.laneWidth * k * 0.5;
      c.stroke();
    }

    // 基地与泉水
    for (const bs of map.bases) {
      const col = bs.team === 0 ? '77, 163, 255' : '255, 93, 93';
      poly(c, bs.area);
      c.fillStyle = `rgba(${col}, 0.32)`;
      c.fill();
      c.strokeStyle = `rgba(${col}, 0.75)`;
      c.lineWidth = Math.max(1, 1.2 * s);
      c.stroke();
      c.beginPath();
      c.arc(mx(bs.fountain.x), my(bs.fountain.y), bs.fountainRadius * k, 0, Math.PI * 2);
      c.fillStyle = `rgba(${col}, 0.55)`;
      c.fill();
    }

    // 草丛
    c.fillStyle = 'rgba(132, 178, 74, 0.9)';
    for (const bush of map.bushes) {
      poly(c, bush);
      c.fill();
    }

    // 墙体：深岩色块 + 亮边，俯视时像凸起的石台
    for (const wall of map.walls) {
      poly(c, wall);
      c.fillStyle = '#131d30';
      c.fill();
      c.strokeStyle = '#42557a';
      c.lineWidth = Math.max(1, 1.1 * s);
      c.stroke();
    }
    c.restore();

    // 四周暗角，让中间的单位图标更突出
    const vg = c.createRadialGradient(px / 2, px / 2, px * 0.42, px / 2, px / 2, px * 0.74);
    vg.addColorStop(0, 'rgba(4, 8, 22, 0)');
    vg.addColorStop(1, 'rgba(4, 8, 22, 0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, px, px);
  }

  function measure(): void {
    const css = canvas.clientWidth;
    if (css <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const n = Math.max(64, Math.round(css * dpr));
    sizeDirty = false;
    if (n === px) return;
    px = n;
    canvas.width = canvas.height = n;
    k = px / (2 * R);
    s = px / 172;
    buildStatic();
    lastDraw = -1;
  }

  function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
  }

  function drawCamps(c: CanvasRenderingContext2D): void {
    const camps = ctx.state.camps;
    for (const def of map.camps) {
      const st = camps[def.id] && camps[def.id].campId === def.id ? camps[def.id] : camps.find((x) => x.campId === def.id);
      const epic = MONSTERS[def.monsterType].epic;
      const buff = def.monsterType === 'frost_golem' || def.monsterType === 'ember_golem';
      const r = (epic ? 5.2 : buff ? 3.6 : 2.6) * s;
      const x = mx(def.pos.x);
      const y = my(def.pos.y);
      const col = CAMP_COLOR[def.monsterType];
      if (!st || st.alive) {
        diamond(c, x, y, r);
        c.fillStyle = col;
        c.fill();
        c.lineWidth = Math.max(1, 1.2 * s);
        c.strokeStyle = 'rgba(6, 10, 22, 0.9)';
        c.stroke();
        if (epic) {
          diamond(c, x, y, r + 2.4 * s);
          c.strokeStyle = col;
          c.lineWidth = Math.max(1, s);
          c.stroke();
        }
        continue;
      }
      // 未刷新：空心菱形 + 一圈进度弧；史诗野怪直接写秒数
      diamond(c, x, y, r);
      c.fillStyle = 'rgba(6, 10, 22, 0.6)';
      c.fill();
      c.strokeStyle = col;
      c.globalAlpha = 0.55;
      c.lineWidth = Math.max(1, s);
      c.stroke();
      c.globalAlpha = 1;
      const total = Math.max(def.respawn, def.firstSpawn, 1);
      const p = clamp(1 - st.respawnIn / total, 0, 1);
      c.beginPath();
      c.arc(x, y, r + 1.8 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      c.strokeStyle = col;
      c.lineWidth = Math.max(1, 1.3 * s);
      c.stroke();
      if (epic) {
        const sec = Math.ceil(st.respawnIn);
        c.font = `700 ${Math.round(8.5 * s)}px "DIN Alternate", "Roboto Condensed", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const label = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
        c.lineWidth = Math.max(2, 2.4 * s);
        c.strokeStyle = 'rgba(6, 10, 22, 0.9)';
        c.strokeText(label, x, y + r + 8 * s);
        c.fillStyle = '#f4ecff';
        c.fillText(label, x, y + r + 8 * s);
      }
    }
  }

  function drawStructures(c: CanvasRenderingContext2D): void {
    for (const u of structBuf) {
      const x = mx(u.pos.x);
      const y = my(u.pos.y);
      const col = TEAM_COLOR[u.team === 1 ? 1 : 0];
      if (u.kind === 'core') {
        const r = 6.4 * s;
        diamond(c, x, y, r + 2 * s);
        c.fillStyle = 'rgba(6, 10, 22, 0.85)';
        c.fill();
        diamond(c, x, y, r);
        c.fillStyle = col;
        c.fill();
        diamond(c, x, y, r * 0.45);
        c.fillStyle = '#ffffff';
        c.fill();
      } else {
        const r = 3.3 * s;
        c.fillStyle = 'rgba(6, 10, 22, 0.9)';
        c.fillRect(x - r - s, y - r - s, (r + s) * 2, (r + s) * 2);
        c.fillStyle = col;
        c.fillRect(x - r, y - r, r * 2, r * 2);
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.fillRect(x - r * 0.38, y - r * 0.38, r * 0.76, r * 0.76);
      }
    }
  }

  function drawHero(c: CanvasRenderingContext2D, hero: HeroUnit, now: number): void {
    const x = mx(hero.pos.x);
    const y = my(hero.pos.y);
    const me = hero.id === ctx.state.playerId;
    const r = (me ? 7.4 : 6.2) * s;
    const ring = me ? COLORS.me : TEAM_COLOR[hero.team];
    if (me) {
      // 自己：呼吸光圈 + 朝向指针
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      c.beginPath();
      c.arc(x, y, r + (3 + pulse * 2.5) * s, 0, Math.PI * 2);
      c.strokeStyle = `rgba(183, 243, 107, ${0.55 - pulse * 0.3})`;
      c.lineWidth = Math.max(1, 1.4 * s);
      c.stroke();
      const fx = Math.cos(hero.facing);
      const fy = Math.sin(hero.facing);
      const tip = r + 5.5 * s;
      const back = r + 1.2 * s;
      const half = 3.2 * s;
      c.beginPath();
      c.moveTo(x + fx * tip, y + fy * tip);
      c.lineTo(x + fx * back - fy * half, y + fy * back + fx * half);
      c.lineTo(x + fx * back + fy * half, y + fy * back - fx * half);
      c.closePath();
      c.fillStyle = COLORS.me;
      c.fill();
    }
    c.beginPath();
    c.arc(x, y, r + 1.4 * s, 0, Math.PI * 2);
    c.fillStyle = 'rgba(6, 10, 22, 0.92)';
    c.fill();
    const img = portraitImg(hero.heroId);
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.clip();
    if (img) c.drawImage(img, x - r, y - r, r * 2, r * 2);
    else {
      c.fillStyle = HEROES[hero.heroId].palette.primary;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.restore();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = ring;
    c.lineWidth = Math.max(1.2, 1.7 * s);
    c.stroke();
  }

  function drawView(c: CanvasRenderingContext2D): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = host.screenToGround(0, 0);
    const b = host.screenToGround(W, 0);
    const d = host.screenToGround(W, H);
    const e = host.screenToGround(0, H);
    if (!a || !b || !d || !e) return;
    c.beginPath();
    c.moveTo(mx(a.x), my(a.y));
    c.lineTo(mx(b.x), my(b.y));
    c.lineTo(mx(d.x), my(d.y));
    c.lineTo(mx(e.x), my(e.y));
    c.closePath();
    c.fillStyle = 'rgba(255, 255, 255, 0.07)';
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = Math.max(1, 1.1 * s);
    c.stroke();
  }

  function drawPings(c: CanvasRenderingContext2D, now: number): void {
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i];
      const life = PING_LIFE[p.kind];
      const t = (now - p.t0) / life;
      if (t >= 1) {
        pings.splice(i, 1);
        continue;
      }
      const x = mx(p.x);
      const y = my(p.y);
      // 连续几圈向外扩散的波纹：报警类多响几次
      const waves = p.kind === 'kill' ? 2 : 3;
      for (let wv = 0; wv < waves; wv++) {
        const local = t * waves - wv;
        if (local <= 0 || local >= 1) continue;
        c.beginPath();
        c.arc(x, y, (3 + local * (p.kind === 'kill' ? 13 : 18)) * s, 0, Math.PI * 2);
        c.strokeStyle = p.color;
        c.globalAlpha = (1 - local) * 0.95;
        c.lineWidth = Math.max(1.2, (2.4 - local * 1.4) * s);
        c.stroke();
      }
      c.globalAlpha = Math.min(1, (1 - t) * 2.5);
      if (p.kind === 'kill') {
        // 阵亡处打一个叉
        const r = 3.6 * s;
        c.beginPath();
        c.moveTo(x - r, y - r);
        c.lineTo(x + r, y + r);
        c.moveTo(x + r, y - r);
        c.lineTo(x - r, y + r);
        c.lineWidth = Math.max(2.4, 3.4 * s);
        c.strokeStyle = 'rgba(6, 10, 22, 0.9)';
        c.stroke();
        c.lineWidth = Math.max(1.4, 1.9 * s);
        c.strokeStyle = p.color;
        c.stroke();
      } else if (p.kind === 'alert') {
        // 己方建筑受击：闪烁的感叹号
        if (Math.floor((now - p.t0) * 6) % 2 === 0) {
          c.fillStyle = '#fff1f1';
          c.fillRect(x - s, y - 11 * s, 2 * s, 6 * s);
          c.fillRect(x - s, y - 4 * s, 2 * s, 2 * s);
        }
      }
      c.globalAlpha = 1;
    }
  }

  function draw(now: number): void {
    if (!g || px === 0) return;
    const state = ctx.state;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(base, 0, 0);
    drawCamps(g);

    heroBuf.length = 0;
    structBuf.length = 0;
    const team = ctx.team;
    const dot = Math.max(1.6, 2 * s);
    for (const u of state.units) {
      if (!u.alive) continue;
      if (u.kind === 'tower' || u.kind === 'core') {
        structBuf.push(u);
        continue;
      }
      if (u.kind === 'monster') continue;
      if (u.team !== team && !u.visible[team]) continue;
      if (u.kind === 'hero') heroBuf.push(u);
      else {
        g.fillStyle = u.team === 0 ? '#7fc0ff' : '#ff8a8a';
        g.fillRect(mx(u.pos.x) - dot / 2, my(u.pos.y) - dot / 2, dot, dot);
      }
    }
    drawStructures(g);
    drawView(g);
    // 敌方在下、友方在上、自己最上
    let meHero: HeroUnit | null = null;
    for (const hero of heroBuf) if (hero.team !== team) drawHero(g, hero, now);
    for (const hero of heroBuf) {
      if (hero.team !== team) continue;
      if (hero.id === state.playerId) meHero = hero;
      else drawHero(g, hero, now);
    }
    if (meHero) drawHero(g, meHero, now);
    drawPings(g, now);
  }

  function ping(pos: Vec2, kind: PingKind, color: string): void {
    if (pings.length > 12) pings.shift();
    pings.push({ x: pos.x, y: pos.y, t0: ctx.now, kind, color });
  }

  // ── 交互：按住/拖动 = 临时观察；鼠标右键 = 走过去 ──
  let peekId: number | null = null;
  const toWorld = (ev: PointerEvent): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    const b = map.bound;
    return {
      x: clamp(((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 * R - R, -b, b),
      y: clamp(((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 * R - R, -b, b),
    };
  };
  const endPeek = (): void => {
    if (peekId === null) return;
    peekId = null;
    el.classList.remove('is-peek');
    host.setCameraPeek(null);
  };
  const onDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    if (ev.pointerType === 'mouse' && ev.button === 2) {
      if (!ctx.inputBlocked()) host.command({ type: 'moveTo', pos: toWorld(ev) });
      return;
    }
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (peekId !== null) return;
    peekId = ev.pointerId;
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // 合成事件没有活动指针，拿不到捕获也不影响
    }
    el.classList.add('is-peek');
    host.setCameraPeek(toWorld(ev));
  };
  const onMove = (ev: PointerEvent): void => {
    if (ev.pointerId === peekId) host.setCameraPeek(toWorld(ev));
  };
  const onUp = (ev: PointerEvent): void => {
    if (ev.pointerId === peekId) endPeek();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', (ev) => {
    if (ev.target === el) onUp(ev);
  });
  const onResize = (): void => {
    sizeDirty = true;
  };
  window.addEventListener('resize', onResize);

  return {
    el,
    update(c) {
      const now = c.now;
      // 尺寸由 CSS 变量决定(横竖屏切换会变)：除了 resize，再每秒兜底量一次
      if (sizeDirty || now - lastMeasure > 1) {
        lastMeasure = now;
        measure();
      }
      const interval = pings.length > 0 || peekId !== null ? 1 / 30 : 1 / 12;
      if (now - lastDraw >= interval) {
        lastDraw = now;
        draw(now);
      }
    },
    handleEvent(ev: GameEvent, c) {
      switch (ev.type) {
        case 'heroKill': {
          const victim = c.hero(ev.victimId);
          if (victim) ping(victim.pos, 'kill', victim.team === c.team ? COLORS.red : COLORS.gold200);
          break;
        }
        case 'damage': {
          if (!allyStructures.has(ev.targetId)) break;
          const last = lastAlert.get(ev.targetId) ?? -99;
          if (c.now - last < 5) break;
          // 只有被英雄打才报警：小兵蹭塔是常态，不值得打扰
          const src = c.unit(ev.sourceId);
          if (!src || src.kind !== 'hero') break;
          lastAlert.set(ev.targetId, c.now);
          ping(ev.pos, 'alert', COLORS.red);
          break;
        }
        case 'towerDestroyed':
          allyStructures.delete(ev.unitId);
          ping(ev.pos, 'tower', ev.team === c.team ? COLORS.red : COLORS.gold200);
          break;
        case 'monsterSpawn':
          if (MONSTERS[ev.monsterType].epic) ping(ev.pos, 'epic', CAMP_COLOR[ev.monsterType]);
          break;
        case 'epicSlain':
          ping(ev.pos, 'epic', ev.team === c.team ? COLORS.gold200 : COLORS.red);
          break;
        default:
          break;
      }
    },
    dispose() {
      endPeek();
      window.removeEventListener('resize', onResize);
    },
  };
}
