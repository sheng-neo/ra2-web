/**
 * 场景里的指路箭头（DOM 元素，每帧用 host.worldToScreen 对位；不做渲染层的 3D 地面标记）。
 *
 * 目标在屏幕内：目标脚下一个椭圆光圈 + 上方上下弹动的金色箭头 + 小标签(如「我方上路一塔」)。
 * 目标在屏幕外：箭头贴在一个内缩矩形的边上指向目标，标签分两行：名字 / 距离(两行比一长条窄，窄屏上才躲得开玩家头顶的名牌)。
 * 内缩矩形四边：左右 20%、上 22%、下 32%——避开小地图、顶部指引位、技能区与状态栏。
 * 只写 transform / 文字，不读布局；全部不拦截指针。
 */
import type { Vec2 } from '../../core/types';
import { h, injectStyle, sfCss } from '../theme';
import { classSlot, textSlot, type HudCtx, type HudPart } from './common';

const CSS = sfCss(`
.sf-hud__garrow { position: absolute; left: 0; top: 0; z-index: 2; width: 0; height: 0; display: none; pointer-events: none; }
.sf-hud__garrow.is-on { display: block; }
/* 目标脚下的椭圆光圈(只在目标进了屏幕时显示) */
.sf-hud__garrow-ring { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.sf-hud__garrow-ring::before, .sf-hud__garrow-ring::after {
  content: ''; position: absolute; left: calc(var(--w) / -2); top: calc(var(--w) * -0.29); width: var(--w); height: calc(var(--w) * 0.58); border-radius: 50%;
  border: max(2px, 2.5u) solid #ffe7ad; box-shadow: 0 0 10u rgba(255, 214, 130, 0.8), inset 0 0 8u rgba(255, 214, 130, 0.5);
  animation: sf-hud-garrow-ring 1.4s ease-out infinite;
}
.sf-hud__garrow-ring { --w: max(72px, 104u); }
.sf-hud__garrow-ring::after { animation-delay: 0.7s; }
.sf-hud__garrow.is-edge .sf-hud__garrow-ring { display: none; }
/* 箭头本体：外层负责对位，中层负责朝向，内层沿朝向弹动 */
.sf-hud__garrow-mark { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.sf-hud__garrow-rot { position: absolute; left: 0; top: 0; width: 0; height: 0; }
/* 箭头要在亮的石板地、暗的草地上都看得清：饱和的金色实心 + 一圈深色描边(用两层同形裁切叠出来) + 外发光 */
.sf-hud__garrow-tip {
  --s: max(36px, 46u); position: absolute; left: calc(var(--s) * -1); top: calc(var(--s) / -2); width: var(--s); height: var(--s);
  filter: drop-shadow(0 2px 3px rgba(2, 4, 12, 0.7)) drop-shadow(0 0 8u rgba(255, 196, 64, 0.95));
  animation: sf-hud-garrow-bob 0.8s ease-in-out infinite;
}
.sf-hud__garrow-tip::before, .sf-hud__garrow-tip::after { content: ''; position: absolute; inset: 0; clip-path: polygon(0 30%, 44% 30%, 44% 4%, 100% 50%, 44% 96%, 44% 70%, 0 70%); }
.sf-hud__garrow-tip::before { background: #1c1204; }
.sf-hud__garrow-tip::after { inset: 9%; background: linear-gradient(90deg, #d8891a, #ffc93c 45%, #fff3b0); }
.sf-hud__garrow-label {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) translate(var(--lx, 0px), var(--ly, 0px)); display: flex; flex-direction: column; align-items: center; padding: 2u 9u; border-radius: 10u; white-space: nowrap;
  font-size: var(--sf-fs-xs); font-weight: 800; letter-spacing: 0.06em; line-height: 1.5; color: #2b1a04; background: linear-gradient(180deg, #fff4d6, #e0b160);
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.85), 0 3u 8u rgba(2, 4, 12, 0.5);
}
/* 第二行：距离(只在贴边时有) */
.sf-hud__garrow-dist { font-family: var(--sf-font-num); font-weight: 800; line-height: 1.2; letter-spacing: 0.02em; opacity: 0.82; }
.sf-hud__garrow-dist:empty { display: none; }
@keyframes sf-hud-garrow-bob { 0%, 100% { transform: translateX(-28%); } 50% { transform: translateX(0); } }
@keyframes sf-hud-garrow-ring { 0% { transform: scale(0.55); opacity: 1; } 100% { transform: scale(1.15); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .sf-hud__garrow-tip, .sf-hud__garrow-ring::before, .sf-hud__garrow-ring::after { animation: none; } }
`);

export interface SceneArrow extends HudPart {
  el: HTMLElement;
  /** 指向某处；null = 收起。坐标对象可以复用(内部每帧现读) */
  set(target: { pos: Vec2; label: string } | null): void;
  /** 当前是否贴边(目标在屏幕外)；没在显示时为 null。调试 / 测试用 */
  mode(): 'screen' | 'edge' | null;
}

/** 内缩矩形(相对视口宽高的比例) */
const INSET = { left: 0.2, right: 0.2, top: 0.22, bottom: 0.32 } as const;
/** 目标的屏幕坐标落在这个范围内才算「在屏幕里」(比例)；已经在屏内时放宽一点，免得在边界上来回切 */
const ON_SCREEN = { x: 0.07, top: 0.14, bottom: 0.2, relax: 0.035 } as const;
/** 屏内箭头悬在目标上方多高(米)：比防御塔略高 */
const HOVER_HEIGHT = 8.5;
/** 标签的半高(像素，估值)：单行(屏内，只有名字) / 两行(贴边，名字 + 距离)。半宽按名字的字数现算，见 labelHalfW */
const LABEL_HALF = { h: 14, h2: 20 } as const;

/** 玩家英雄头顶名牌(名字 + 血条)的大致范围：半宽(像素)、名牌顶端比头顶高出多少(像素)；估头顶位置用的身高(米) */
const SELF_PLATE = { halfW: 62, above: 46, height: 3.7 } as const;

/** 贴边箭头要躲开的顶部指引位：多少帧重读一次它的位置(卡片高度会随文案变) */
const AVOID_EVERY = 12;
/** 内缩矩形的上边最多被指引位往下推到视口高度的这个比例 */
const AVOID_MAX_TOP = 0.45;

/**
 * @param avoid 顶部中央的指引位(引导卡 / 目标行)。贴边箭头朝上指时会落在内缩矩形的上边，
 *              竖屏和手机横屏下那里正好被引导卡盖住，所以上边至少要退到它的下沿之下。
 */
export function createSceneArrow(ctx: HudCtx, avoid?: () => HTMLElement | null): SceneArrow {
  injectStyle('sf-hud-garrow', CSS);
  const ring = h('i', 'sf-hud__garrow-ring');
  const tip = h('i', 'sf-hud__garrow-tip');
  const rot = h('i', 'sf-hud__garrow-rot', tip);
  const labelName = h('span');
  const labelDist = h('span', 'sf-hud__garrow-dist');
  const label = h('span', 'sf-hud__garrow-label', labelName, labelDist);
  const mark = h('div', 'sf-hud__garrow-mark', rot, label);
  const el = h('div', 'sf-hud__garrow', ring, mark);
  el.setAttribute('aria-hidden', 'true');

  const setOn = classSlot(el, 'is-on');
  const setEdge = classSlot(el, 'is-edge');
  const setName = textSlot(labelName);
  const setDist = textSlot(labelDist);
  /** 标签字号(像素)：尺寸变化时重读一次，估标签宽度用 */
  let labelFs = 12;
  /** 标签的半宽(像素，估值)：全角字按 1.06 个字宽(含字距)，两侧内边距各约 10 像素 */
  const labelHalfW = (name: string): number => (name.length * labelFs * 1.06) / 2 + 11;
  let target: { pos: Vec2; label: string } | null = null;
  let edge = false;
  let shown = false;
  /** HUD 根节点在视口里的位置与尺寸：只在尺寸变化时重读 */
  let rect = { left: 0, top: 0, w: 0, h: 0 };
  let rectDirty = true;
  const onResize = (): void => {
    rectDirty = true;
  };
  window.addEventListener('resize', onResize);
  let lastRot = NaN;
  let lastLx = NaN;
  let lastLy = NaN;
  const probe: Vec2 = { x: 0, y: 0 };
  /** 指引位下沿(相对 HUD 根节点，像素)；0 = 不用躲 */
  let avoidBottom = 0;
  let avoidAge = AVOID_EVERY;
  /** 朝上指的贴边箭头躲开玩家名牌时往哪一侧挪(1 = 右)；带迟滞，目标方向明显偏到另一侧才换边 */
  let dodge = 1;

  function place(c: HudCtx): void {
    if (!target) return;
    if (rectDirty || rect.w === 0) {
      const r = ctx.root.getBoundingClientRect();
      rect = { left: r.left, top: r.top, w: r.width, h: r.height };
      rectDirty = false;
      labelFs = parseFloat(getComputedStyle(label).fontSize) || 12;
      avoidAge = AVOID_EVERY;
      if (rect.w === 0) return;
    }
    if (++avoidAge >= AVOID_EVERY) {
      avoidAge = 0;
      // 量里面实际显示的卡片 / 目标行的布局位置(offset*，不受淡入时 translateY 的影响，免得量到滑入途中偏上的位置)
      const a = avoid?.();
      let bottom = 0;
      if (a) {
        const top = a.getBoundingClientRect().top;
        for (const child of Array.from(a.children)) {
          if (child instanceof HTMLElement && child.offsetHeight > 0) bottom = Math.max(bottom, top + child.offsetTop + child.offsetHeight);
        }
      }
      avoidBottom = bottom > 0 ? bottom - rect.top : 0;
    }
    const { host } = c;
    const W = rect.w;
    const H = rect.h;
    // 箭头的像素长度(与样式里的 max(36px, 46u) 同值；u 是随视口缩放的设计单位)
    const size = Math.max(36, 46 * Math.min(3.2, Math.max(0.78, Math.min(W / 1280, H / 720))));
    const foot = host.worldToScreen(target.pos, 0);
    const fx = foot.x - rect.left;
    const fy = foot.y - rect.top;
    const relax = edge ? 0 : ON_SCREEN.relax;
    const inside = foot.visible && fx >= W * (ON_SCREEN.x - relax) && fx <= W * (1 - ON_SCREEN.x + relax) && fy >= H * (ON_SCREEN.top - relax) && fy <= H * (1 - ON_SCREEN.bottom + relax);
    edge = !inside;
    setEdge(edge);
    let x: number;
    let y: number;
    let deg: number;
    let lx: number;
    let ly: number;
    if (inside) {
      ring.style.transform = `translate3d(${fx.toFixed(1)}px, ${fy.toFixed(1)}px, 0)`;
      const top = host.worldToScreen(target.pos, HOVER_HEIGHT);
      x = top.x - rect.left;
      // 塔很高、镜头又近时头顶可能出了屏幕：箭头至少留在屏内；
      // 头顶上方的标签也别钻到指引位下面(最多压到脚下光圈处为止)
      y = Math.max(H * 0.16, top.y - rect.top, Math.min(avoidBottom + size + 8 + 2 * LABEL_HALF.h + 4, fy - 4));
      deg = 90;
      lx = 0;
      ly = -(size + 8 + LABEL_HALF.h);
      setName(target.label);
      setDist('');
    } else {
      // 朝向：从玩家出发往目标方向走几米，看这一小段在屏幕上往哪偏(镜头有俯角，不能直接拿世界坐标的角度)
      const me = c.me.pos;
      let dx = target.pos.x - me.x;
      let dy = target.pos.y - me.y;
      const dist = Math.hypot(dx, dy);
      const inv = dist > 1e-3 ? 1 / dist : 0;
      dx *= inv;
      dy *= inv;
      const a = host.worldToScreen(me, 0);
      probe.x = me.x + dx * 4;
      probe.y = me.y + dy * 4;
      const b = host.worldToScreen(probe, 0);
      let sx = b.x - a.x;
      let sy = b.y - a.y;
      const sl = Math.hypot(sx, sy);
      if (sl < 1e-3) {
        // 镜头没准备好(或人就站在目标上)：退回世界方向
        sx = dx;
        sy = dy;
      } else {
        sx /= sl;
        sy /= sl;
      }
      if (sx === 0 && sy === 0) sy = -1;
      // 从内缩矩形的中心沿这个方向射到矩形的边
      const x0 = W * INSET.left;
      const x1 = W * (1 - INSET.right);
      // 上边让出指引位(下沿再留 8 像素)：朝上指的箭头整支落在上边之下
      const y0 = Math.min(H * AVOID_MAX_TOP, Math.max(H * INSET.top, avoidBottom + 8));
      const y1 = H * (1 - INSET.bottom);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const tx = sx !== 0 ? (sx > 0 ? x1 - cx : x0 - cx) / sx : Infinity;
      const ty = sy !== 0 ? (sy > 0 ? y1 - cy : y0 - cy) / sy : Infinity;
      const t = Math.min(tx, ty);
      x = cx + sx * t;
      y = cy + sy * t;
      // 标签放在箭头靠屏幕中心的一侧，退到箭尾之后(横着指时要让出标签的半个宽度，竖着指时只要半个高度)
      const halfW = labelHalfW(target.label);
      const back = size + 8 + Math.abs(sx) * halfW + Math.abs(sy) * LABEL_HALF.h2;
      lx = -sx * back;
      ly = -sy * back;
      if (ty <= tx && sy < 0) {
        // 目标在北边：朝上指的箭头连同它后面的标签会正好压在玩家自己的名字和血条上(指引位又把它往下推了一截)。
        // 这时沿上边横移到名牌的一侧，箭头方向不变。斜着指时标签是往屏幕中心一侧偏的(lx)，箭头与标签各算各的间距，两个都要让开
        const head = host.worldToScreen(me, SELF_PLATE.height);
        const hx = head.x - rect.left;
        const plateTop = head.y - rect.top - SELF_PLATE.above;
        const labelBottom = y + ly + LABEL_HALF.h2;
        const needArrow = SELF_PLATE.halfW + size * 0.5 + 6;
        const needLabel = SELF_PLATE.halfW + halfW + 6;
        if (plateTop < labelBottom + 4 && (Math.abs(x - hx) < needArrow || Math.abs(x + lx - hx) < needLabel)) {
          if (sx > 0.1) dodge = 1;
          else if (sx < -0.1) dodge = -1;
          x = hx + dodge * Math.max(needArrow, needLabel - dodge * lx);
          // 可以越过内缩矩形的左右边(那一带只有战场)，但标签要留在屏幕里
          x = Math.min(W - halfW - 8 - lx, Math.max(halfW + 8 - lx, x));
        }
      }
      deg = (Math.atan2(sy, sx) * 180) / Math.PI;
      setName(target.label);
      setDist(`${Math.max(1, Math.round(dist))} 米`);
    }
    mark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    const qd = Math.round(deg);
    if (qd !== lastRot) {
      lastRot = qd;
      rot.style.transform = `rotate(${qd}deg)`;
    }
    const qx = Math.round(lx);
    const qy = Math.round(ly);
    if (qx !== lastLx || qy !== lastLy) {
      lastLx = qx;
      lastLy = qy;
      label.style.setProperty('--lx', `${qx}px`);
      label.style.setProperty('--ly', `${qy}px`);
    }
  }

  return {
    el,
    set(t) {
      target = t;
      if (!t) {
        shown = false;
        setOn(false);
      }
    },
    mode: () => (shown ? (edge ? 'edge' : 'screen') : null),
    update(c) {
      // 阵亡、终局时不指路
      const on = !!target && c.me.alive && !c.state.over;
      if (on) place(c);
      shown = on && rect.w > 0;
      setOn(shown);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      target = null;
    },
  };
}
