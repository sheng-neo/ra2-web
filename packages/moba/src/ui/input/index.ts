/**
 * 对局输入（触控 + 键鼠），全部通过 HudHost 下命令，不直接碰模拟层。
 *
 * 触控：左下动态原点的虚拟摇杆(持续发 move，松手归零)；普攻键按住连续攻击；
 *       技能键 轻点 = 智能施法 / 按住拖动 = 手动瞄准(松手施放，拖到「取消」区放弃) / 原地长按 = 看技能详情。
 * 键鼠：WASD/方向键移动；右键点地移动、点敌人攻击；左键点敌人攻击；空格/J 普攻；
 *       Q/E/R 按下瞄准(指示器跟随鼠标)、松开施放、Esc/右键取消；F 闪现(朝鼠标)、G 恢复、B 回城；
 *       Tab 按住看记分板；P 商店；Esc 关面板/暂停。
 * 多点触控按 pointerId 各自追踪：一指摇杆、另一指技能互不干扰。
 * 布局(触控/键鼠)开局按设备特征识别，之后跟着最近一次「按下」的指针类型或游戏按键切换。
 */
import type { PlayerCommand, SkillSlot, Vec2 } from '../../core/types';
import type { AimIndicator } from '../../render/api';
import type { HudCtx, HudPart, InputMode } from '../hud/common';
import { spawnRipple } from '../hud/overlays';
import { SKILL_SLOTS, type ButtonId, type SkillBar } from '../hud/skills';
import { dismissTooltip, h, hasOpenDialog, injectStyle, isTooltipOpenFor, sfCss, showTooltip } from '../theme';
import { castSpecOf, isAimable, previewIndicator, solveByPoint, solveByVector, type AimSolution } from './aim';
import { detectInputMode } from './device';

const CSS = sfCss(`
/* 虚拟摇杆：空闲时半透明停在左下角提示位置；按下后跳到手指处 */
.sf-hud__joy { position: absolute; z-index: 2; left: calc(var(--hud-l) + var(--hud-sk) * 1.85); bottom: calc(var(--hud-b) + var(--hud-lift) + var(--hud-sk) * 1.65); width: 0; height: 0; pointer-events: none; display: none; opacity: 0.55; transition: opacity 0.25s linear; }
.sf-hud--touch .sf-hud__joy { display: block; }
.sf-hud__joy.is-active { opacity: 1; transition: none; }
.sf-hud.is-dead .sf-hud__joy { filter: grayscale(1); opacity: 0.35; }
.sf-hud__joy-base {
  --d: calc(var(--hud-sk) * 2.3); position: absolute; left: calc(var(--d) / -2); top: calc(var(--d) / -2); width: var(--d); height: var(--d); border-radius: 50%;
  background: radial-gradient(circle, rgba(40, 64, 124, 0.16) 0, rgba(8, 13, 31, 0.42) 60%, rgba(8, 13, 31, 0.6) 100%);
  box-shadow: inset 0 0 0 1.5px rgba(232, 199, 122, 0.6), inset 0 0 0 max(5px, 7u) rgba(8, 13, 31, 0.28), inset 0 0 0 max(6px, 8u) rgba(143, 233, 255, 0.22), 0 4u 18u rgba(2, 4, 12, 0.4);
}
/* 四个方向刻度 */
.sf-hud__joy-base::before { content: ''; position: absolute; inset: 9%; border-radius: 50%;
  background: conic-gradient(from -6deg, rgba(255, 231, 173, 0.85) 0 12deg, transparent 12deg 90deg, rgba(255, 231, 173, 0.85) 90deg 102deg, transparent 102deg 180deg, rgba(255, 231, 173, 0.85) 180deg 192deg, transparent 192deg 270deg, rgba(255, 231, 173, 0.85) 270deg 282deg, transparent 282deg 360deg);
  -webkit-mask-image: radial-gradient(circle closest-side, transparent 0, transparent 86%, #000 88%); mask-image: radial-gradient(circle closest-side, transparent 0, transparent 86%, #000 88%); }
.sf-hud__joy-knob {
  --d: calc(var(--hud-sk) * 0.98); position: absolute; left: calc(var(--d) / -2); top: calc(var(--d) / -2); width: var(--d); height: var(--d); border-radius: 50%; will-change: transform;
  background: radial-gradient(circle at 40% 30%, #7fa2ee, #27459a 52%, #0d1a44);
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(2px, 2.5u) rgba(255, 231, 173, 0.9), 0 3u 10u rgba(0, 0, 0, 0.5), inset 0 2px 0 rgba(255, 255, 255, 0.32);
}
.sf-hud__joy.is-active .sf-hud__joy-knob { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(2px, 2.5u) #fff4d6, 0 0 20u rgba(92, 214, 247, 0.75), inset 0 2px 0 rgba(255, 255, 255, 0.4); }
`);

/** 「瞄准所有权」的持有者：某个指针(pointerId) / 键盘 / 无。pointerId 的取值各浏览器不一(可能为 0 或负数)，所以不用数字当哨兵 */
type AimOwner = number | 'key' | null;
/** 方向变化超过这个角度立即补发 move */
const COS_STEP = Math.cos((7 * Math.PI) / 180);
const MOVE_RESEND = 0.08;
const ATTACK_RESEND = 0.15;
const LONG_PRESS_MS = 350;
const DRAG_START_TOUCH = 12;
const DRAG_START_MOUSE = 8;
const MOVETO_RESEND = 0.09;

const KEY_SKILL: Record<string, SkillSlot> = { KeyQ: 's1', KeyE: 's2', KeyR: 'ult' };
/** 按下这些键才算「在用键盘玩」（据此切到键鼠布局）；音量键、修饰键之类不算 */
const GAME_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyB', 'KeyP', 'Tab']);

interface Press {
  id: number;
  btn: ButtonId;
  x0: number;
  y0: number;
  /** press 刚按下 / info 原地长按看详情 / aim 手动瞄准中 / void 已作废(被取消或被打断)：松手什么都不做 */
  state: 'press' | 'info' | 'aim' | 'void';
  timer: number;
  touch: boolean;
  /** 最近一次拖动向量(单位方向 + 幅度比例)：英雄在动时要按它每帧重算落点 */
  nx: number;
  ny: number;
  mag: number;
  sol: AimSolution | null;
  cancel: boolean;
}

export interface InputDeps {
  /** 铺满全屏的输入层：摇杆与战场点击都落在它上面 */
  field: HTMLElement;
  skills: SkillBar;
  /** 强制布局；null = 自动识别，并在首次 touch/mouse 事件时切换 */
  forced: InputMode | null;
  setMode(mode: InputMode): void;
}

export interface Input extends HudPart {
  joystick: HTMLElement;
  /** 清空一切按住中的输入与瞄准（暂停/失焦/销毁时） */
  reset(): void;
  /** 当前是否正在瞄准（Esc 优先取消瞄准） */
  isAiming(): boolean;
  cancelAim(): void;
}

const sameVec = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4;

function sameAim(a: AimIndicator | null, b: AimIndicator | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || !!a.cancel !== !!b.cancel) return false;
  switch (a.kind) {
    case 'direction':
      return b.kind === 'direction' && a.range === b.range && a.width === b.width && sameVec(a.dir, b.dir);
    case 'cone':
      return b.kind === 'cone' && a.range === b.range && a.angle === b.angle && sameVec(a.dir, b.dir);
    case 'position':
      return b.kind === 'position' && a.range === b.range && a.radius === b.radius && sameVec(a.pos, b.pos);
    case 'target':
      return b.kind === 'target' && a.range === b.range && a.targetId === b.targetId;
    default:
      return b.kind === 'self' && a.radius === b.radius;
  }
}

export function initialInputMode(forced: InputMode | null): InputMode {
  return forced ?? detectInputMode();
}

export function createInput(ctx: HudCtx, deps: InputDeps): Input {
  injectStyle('sf-hud-input', CSS);
  const { host, root } = ctx;
  const { field, skills } = deps;
  const clock = (): number => performance.now() / 1000;
  const off: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (ev: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
    el.addEventListener(type, fn, opts);
    off.push(() => el.removeEventListener(type, fn, opts));
  };
  const onWin = <K extends keyof WindowEventMap>(type: K, fn: (ev: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
    window.addEventListener(type, fn, opts);
    off.push(() => window.removeEventListener(type, fn, opts));
  };

  const send = (cmd: PlayerCommand): void => host.command(cmd);
  const noteDevice = (pointerType: string): void => {
    if (deps.forced) return;
    if (pointerType === 'touch' || pointerType === 'pen') deps.setMode('touch');
    else if (pointerType === 'mouse') deps.setMode('kbm');
  };
  /** 强制触控布局时，鼠标也当手指用（桌面上调试触控布局） */
  const actsAsTouch = (ev: PointerEvent): boolean => ev.pointerType !== 'mouse' || deps.forced === 'touch';

  // ═════════════════════ 移动（摇杆 + 方向键） ═════════════════════
  const keys = { up: false, down: false, left: false, right: false };
  let joyId: number | null = null;
  let joyOx = 0;
  let joyOy = 0;
  let joyX = 0;
  let joyY = 0;
  let sentX = 0;
  let sentY = 0;
  let sentAt = -1;

  const knob = h('div', 'sf-hud__joy-knob');
  const joystick = h('div', 'sf-hud__joy', h('div', 'sf-hud__joy-base'), knob);

  function syncMove(): void {
    if (ctx.inputBlocked()) return;
    let dx = joyX;
    let dy = joyY;
    if (joyId === null) {
      dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
    }
    const zero = dx === 0 && dy === 0;
    const sentZero = sentX === 0 && sentY === 0;
    if (zero) {
      if (!sentZero) {
        sentX = sentY = 0;
        send({ type: 'move', dir: { x: 0, y: 0 } });
      }
      return;
    }
    const now = clock();
    if (sentZero || dx * sentX + dy * sentY < COS_STEP || now - sentAt >= MOVE_RESEND) {
      sentX = dx;
      sentY = dy;
      sentAt = now;
      send({ type: 'move', dir: { x: dx, y: dy } });
    }
  }

  const skPx = (): number => skills.buttons.s1.offsetWidth || 56;

  function joyStart(ev: PointerEvent): void {
    joyId = ev.pointerId;
    const rr = root.getBoundingClientRect();
    joyOx = ev.clientX;
    joyOy = ev.clientY;
    joyX = joyY = 0;
    joystick.style.left = `${joyOx - rr.left}px`;
    joystick.style.top = `${joyOy - rr.top}px`;
    joystick.style.bottom = 'auto';
    knob.style.transform = '';
    joystick.classList.add('is-active');
    try {
      field.setPointerCapture(ev.pointerId);
    } catch {
      // 合成事件没有活动指针
    }
  }
  function joyMove(ev: PointerEvent): void {
    const R = skPx() * 1.05;
    let dx = ev.clientX - joyOx;
    let dy = ev.clientY - joyOy;
    let dist = Math.hypot(dx, dy);
    if (dist > R) {
      // 手指拖出底盘：底盘跟着走，摇杆不会「拖丢」
      const k = (dist - R) / dist;
      joyOx += dx * k;
      joyOy += dy * k;
      const rr = root.getBoundingClientRect();
      joystick.style.left = `${joyOx - rr.left}px`;
      joystick.style.top = `${joyOy - rr.top}px`;
      dx = ev.clientX - joyOx;
      dy = ev.clientY - joyOy;
      dist = R;
    }
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    if (dist < R * 0.14) joyX = joyY = 0;
    else {
      joyX = dx / dist;
      joyY = dy / dist;
    }
    syncMove();
  }
  function joyEnd(): void {
    if (joyId === null) return;
    joyId = null;
    joyX = joyY = 0;
    joystick.classList.remove('is-active');
    joystick.style.left = '';
    joystick.style.top = '';
    joystick.style.bottom = '';
    knob.style.transform = '';
    syncMove();
  }
  /** 摇杆热区：屏幕左半的下部（竖屏时下半屏的左侧） */
  function inJoyZone(ev: PointerEvent): boolean {
    const rr = root.getBoundingClientRect();
    const x = (ev.clientX - rr.left) / Math.max(1, rr.width);
    const y = (ev.clientY - rr.top) / Math.max(1, rr.height);
    return rr.height >= rr.width ? x < 0.56 && y > 0.45 : x < 0.5 && y > 0.3;
  }

  // ═════════════════════ 瞄准 ═════════════════════
  let aimOwner: AimOwner = null;
  // 瞄准期间每帧都会重算指示器：内容没变就不重复通知渲染层
  let shownAim: AimIndicator | null = null;
  const setAim = (aim: AimIndicator | null): void => {
    if (sameAim(aim, shownAim)) return;
    shownAim = aim;
    host.setAim(aim);
  };

  function releaseAim(owner: AimOwner): void {
    if (owner === null || aimOwner !== owner) return;
    aimOwner = null;
    setAim(null);
    skills.setAiming(null, false);
  }

  /** 施放：sol 为空 = 智能施法（交给模拟层自动瞄准） */
  function fire(slot: SkillSlot, sol: AimSolution | null): void {
    if (ctx.inputBlocked()) return;
    if (ctx.me.skills[slot].level <= 0) {
      ctx.toast('技能尚未学会', 'warn');
      host.audio.ui('error');
      return;
    }
    const cmd: PlayerCommand = { type: 'cast', slot };
    if (sol) {
      if (sol.dir) cmd.dir = sol.dir;
      if (sol.pos) cmd.pos = sol.pos;
      if (sol.targetId !== undefined) cmd.targetId = sol.targetId;
    }
    send(cmd);
  }

  // ═════════════════════ 普攻（按住连发） ═════════════════════
  const attackHolds = new Set<number | string>();
  let attackAt = -1;
  function attackNow(): void {
    if (ctx.inputBlocked()) return;
    attackAt = clock();
    send({ type: 'attack' });
  }

  // ═════════════════════ 技能键手势 ═════════════════════
  const presses = new Map<number, Press>();
  let cancelRect: DOMRect | null = null;

  function overCancel(x: number, y: number): boolean {
    if (!cancelRect) return false;
    const cx = cancelRect.left + cancelRect.width / 2;
    const cy = cancelRect.top + cancelRect.height / 2;
    return Math.hypot(x - cx, y - cy) <= (cancelRect.width / 2) * 1.2;
  }

  /** 按最近的拖动向量重算指示器（拖动时、以及瞄准期间每帧：英雄和目标都可能在动） */
  function refreshPressAim(p: Press): void {
    if (p.btn === 'attack' || p.state !== 'aim') return;
    const sol = solveByVector(ctx, castSpecOf(ctx.me, p.btn), p.nx, p.ny, p.mag);
    if (p.cancel) sol.indicator.cancel = true;
    p.sol = sol;
    setAim(sol.indicator);
  }

  function endPress(p: Press, cast: boolean): void {
    window.clearTimeout(p.timer);
    presses.delete(p.id);
    skills.setDown(p.btn, false);
    if (p.btn === 'attack') {
      attackHolds.delete(p.id);
      return;
    }
    const slot = p.btn;
    if (p.state === 'aim') {
      const sol = p.sol;
      const cancelled = p.cancel;
      releaseAim(p.id);
      if (cast && !cancelled) fire(slot, sol);
    } else if (p.state === 'info' || p.state === 'void') {
      // 原地长按只是看说明、或这次按压已被取消：不施放（说明浮层自己到时收起）
      releaseAim(p.id);
    } else if (cast) {
      fire(slot, null);
    }
  }

  function bindButton(id: ButtonId): void {
    const el = skills.buttons[id];
    on(el, 'pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      if (presses.has(ev.pointerId)) return;
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        // 合成事件没有活动指针
      }
      const touch = ev.pointerType !== 'mouse';
      const p: Press = { id: ev.pointerId, btn: id, x0: ev.clientX, y0: ev.clientY, state: 'press', timer: 0, touch, nx: 0, ny: -1, mag: 0, sol: null, cancel: false };
      presses.set(ev.pointerId, p);
      skills.setDown(id, true);
      if (id === 'attack') {
        attackHolds.add(ev.pointerId);
        attackNow();
        return;
      }
      if (touch) {
        p.timer = window.setTimeout(() => {
          if (p.state !== 'press' || !presses.has(p.id)) return;
          p.state = 'info';
          showTooltip(el, skills.tipHtml(id), 4200);
          // 顺便亮出射程圈，方便对照说明看范围
          const spec = castSpecOf(ctx.me, id);
          const preview = previewIndicator(spec);
          if (preview && aimOwner === null && !ctx.inputBlocked() && ctx.me.skills[id].level > 0) {
            aimOwner = p.id;
            setAim(preview);
          }
        }, LONG_PRESS_MS);
      }
    });
    on(el, 'pointermove', (ev) => {
      const p = presses.get(ev.pointerId);
      if (!p || p.btn === 'attack') return;
      const slot = p.btn;
      const dx = ev.clientX - p.x0;
      const dy = ev.clientY - p.y0;
      const dist = Math.hypot(dx, dy);
      if (p.state === 'void') return;
      if (p.state !== 'aim') {
        if (dist < (p.touch ? DRAG_START_TOUCH : DRAG_START_MOUSE)) return;
        const spec = castSpecOf(ctx.me, slot);
        const free = aimOwner === null || aimOwner === p.id;
        if (!free || !isAimable(spec) || ctx.inputBlocked() || ctx.me.skills[slot].level <= 0) return;
        window.clearTimeout(p.timer);
        if (isTooltipOpenFor(el)) dismissTooltip();
        p.state = 'aim';
        aimOwner = p.id;
        skills.setAiming(slot, true);
        cancelRect = skills.cancelZone.getBoundingClientRect();
      }
      // 拖满 1.15 个键径 = 最大射程；手指回到原点附近时保留上一次的方向
      if (dist > 0.5) {
        p.nx = dx / dist;
        p.ny = dy / dist;
      }
      p.mag = dist / (skPx() * 1.15);
      p.cancel = overCancel(ev.clientX, ev.clientY);
      skills.setCancelHot(p.cancel);
      refreshPressAim(p);
    });
    const up = (ev: PointerEvent, cast: boolean): void => {
      const p = presses.get(ev.pointerId);
      if (p) endPress(p, cast);
    };
    on(el, 'pointerup', (ev) => up(ev, true));
    on(el, 'pointercancel', (ev) => up(ev, false));
    // 只认按钮自己丢失捕获（子元素冒泡上来的不算）
    on(el, 'lostpointercapture', (ev) => {
      if (ev.target === el) up(ev, false);
    });
    // 鼠标悬停看详情
    on(el, 'pointerenter', (ev) => {
      if (ev.pointerType !== 'mouse' || presses.size > 0) return;
      showTooltip(el, id === 'attack' ? '<div class="sf-tip__title"><span>普通攻击</span></div><div>自动选择目标：优先射程内的敌方英雄，其次残血小兵、防御塔与野怪。按住可连续攻击。</div>' : skills.tipHtml(id));
    });
    on(el, 'pointerleave', (ev) => {
      if (ev.pointerType === 'mouse' && isTooltipOpenFor(el)) dismissTooltip();
    });
  }
  bindButton('attack');
  for (const slot of SKILL_SLOTS) bindButton(slot);

  // ═════════════════════ 键盘瞄准（Q/E/R） ═════════════════════
  let keyAim: { slot: SkillSlot; code: string } | null = null;
  const mouse = { x: 0, y: 0, known: false };

  function solveKeyAim(): AimSolution | null {
    if (!keyAim) return null;
    const spec = castSpecOf(ctx.me, keyAim.slot);
    const ground = mouse.known ? host.screenToGround(mouse.x, mouse.y) : null;
    if (!ground) return null;
    const picked = spec.type === 'target' ? host.pickUnit(mouse.x, mouse.y) : -1;
    return solveByPoint(ctx, spec, ground, picked);
  }
  function refreshKeyAim(): void {
    if (!keyAim) return;
    const sol = solveKeyAim();
    setAim(sol ? sol.indicator : previewIndicator(castSpecOf(ctx.me, keyAim.slot)));
  }
  function cancelKeyAim(): void {
    if (!keyAim) return;
    skills.setDown(keyAim.slot, false);
    keyAim = null;
    releaseAim('key');
  }
  function startKeyAim(slot: SkillSlot, code: string): void {
    if (ctx.inputBlocked()) return;
    if (ctx.me.skills[slot].level <= 0) {
      ctx.toast('技能尚未学会', 'warn');
      host.audio.ui('error');
      return;
    }
    // 另一个技能正在用手指/鼠标拖着瞄：键盘不抢
    if (aimOwner !== null && aimOwner !== 'key') return;
    if (keyAim) skills.setDown(keyAim.slot, false);
    keyAim = { slot, code };
    aimOwner = 'key';
    skills.setDown(slot, true);
    skills.setAiming(slot, false);
    refreshKeyAim();
  }

  function cancelAim(): void {
    cancelKeyAim();
    for (const p of presses.values()) {
      if (p.btn === 'attack' || (p.state !== 'aim' && p.state !== 'info')) continue;
      // 手指还没抬，但这次按压作废：继续拖不会重新进入瞄准，松手也不施放
      window.clearTimeout(p.timer);
      releaseAim(p.id);
      p.state = 'void';
    }
  }

  /** 朝鼠标方向的单位向量；鼠标位置未知时返回 null（让模拟层按面向处理） */
  function mouseDir(): Vec2 | null {
    if (!mouse.known) return null;
    const g = host.screenToGround(mouse.x, mouse.y);
    if (!g) return null;
    const dx = g.x - ctx.me.pos.x;
    const dy = g.y - ctx.me.pos.y;
    const d = Math.hypot(dx, dy);
    return d > 1e-3 ? { x: dx / d, y: dy / d } : null;
  }

  // ═════════════════════ 战场上的鼠标 / 手指 ═════════════════════
  let rightHeld: number | null = null;
  let moveToAt = -1;

  function isEnemy(id: number): boolean {
    if (id < 0) return false;
    const u = ctx.unit(id);
    return !!u && u.alive && u.team !== ctx.team;
  }

  // 设备识别：任何一次「按下」都算数（手指 → 触控布局，鼠标键 → 键鼠布局）。
  // 只看按下、不看鼠标移动：模拟器/调试工具会在触控设备上产生游离的鼠标移动事件，按移动切换会让布局来回跳。
  on(root, 'pointerdown', (ev) => noteDevice(ev.pointerType), { capture: true });

  on(field, 'pointerdown', (ev) => {
    if (actsAsTouch(ev)) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (joyId === null && inJoyZone(ev)) {
        ev.preventDefault();
        joyStart(ev);
      }
      return;
    }
    ev.preventDefault();
    if (ev.button === 2) {
      // 瞄准中右键 = 取消，不移动
      if (aimOwner !== null) {
        cancelAim();
        return;
      }
      if (ctx.inputBlocked()) return;
      const id = host.pickUnit(ev.clientX, ev.clientY);
      if (isEnemy(id)) {
        send({ type: 'attack', targetId: id });
        spawnRipple(root, ev.clientX, ev.clientY, true);
        return;
      }
      const g = host.screenToGround(ev.clientX, ev.clientY);
      if (!g) return;
      send({ type: 'moveTo', pos: g });
      spawnRipple(root, ev.clientX, ev.clientY, false);
      rightHeld = ev.pointerId;
      moveToAt = clock();
      try {
        field.setPointerCapture(ev.pointerId);
      } catch {
        // 合成事件没有活动指针
      }
    } else if (ev.button === 0) {
      if (ctx.inputBlocked()) return;
      const id = host.pickUnit(ev.clientX, ev.clientY);
      if (isEnemy(id)) {
        send({ type: 'attack', targetId: id });
        spawnRipple(root, ev.clientX, ev.clientY, true);
      }
    }
  });
  on(field, 'pointermove', (ev) => {
    if (ev.pointerId === joyId) {
      joyMove(ev);
      return;
    }
    // 按住右键拖动：持续修正移动目标
    if (ev.pointerId === rightHeld && !ctx.inputBlocked()) {
      const now = clock();
      if (now - moveToAt < MOVETO_RESEND) return;
      const g = host.screenToGround(ev.clientX, ev.clientY);
      if (!g) return;
      moveToAt = now;
      send({ type: 'moveTo', pos: g });
    }
  });
  const fieldUp = (ev: PointerEvent): void => {
    if (ev.pointerId === joyId) joyEnd();
    if (ev.pointerId === rightHeld) rightHeld = null;
  };
  on(field, 'pointerup', fieldUp);
  on(field, 'pointercancel', fieldUp);
  on(field, 'lostpointercapture', fieldUp);

  // 记录鼠标位置（在 window 上记：鼠标压在 HUD 控件上时也要跟得上）
  onWin('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    mouse.x = ev.clientX;
    mouse.y = ev.clientY;
    mouse.known = true;
    if (keyAim) refreshKeyAim();
  });

  // ═════════════════════ 键盘 ═════════════════════
  function setDirKey(code: string, down: boolean): boolean {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.up = down;
        return true;
      case 'KeyS':
      case 'ArrowDown':
        keys.down = down;
        return true;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = down;
        return true;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = down;
        return true;
      default:
        return false;
    }
  }
  const typing = (ev: KeyboardEvent): boolean => {
    const t = ev.target;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
  };

  onWin('keydown', (ev) => {
    if (hasOpenDialog() || typing(ev) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const code = ev.code;
    if (!deps.forced && GAME_KEYS.has(code)) deps.setMode('kbm');
    if (setDirKey(code, true)) {
      ev.preventDefault();
      syncMove();
      return;
    }
    switch (code) {
      case 'Space':
      case 'KeyJ':
        ev.preventDefault();
        if (ev.repeat) return;
        attackHolds.add(code);
        skills.setDown('attack', true);
        attackNow();
        break;
      case 'KeyQ':
      case 'KeyE':
      case 'KeyR':
        if (ev.repeat) return;
        startKeyAim(KEY_SKILL[code], code);
        break;
      case 'KeyF': {
        if (ev.repeat || ctx.inputBlocked()) return;
        const dir = mouseDir();
        fire('flash', dir ? { indicator: { kind: 'self', radius: 0 }, dir } : null);
        break;
      }
      case 'KeyG':
        if (!ev.repeat) fire('heal', null);
        break;
      case 'KeyB':
        if (!ev.repeat) fire('recall', null);
        break;
      case 'Tab':
        ev.preventDefault();
        if (!ev.repeat && !ctx.actions.isScoreboardPinned()) ctx.actions.setScoreboard(true, false);
        break;
      case 'KeyP':
        if (!ev.repeat) {
          host.audio.ui('click');
          ctx.actions.toggleShop();
        }
        break;
      case 'Escape':
        ev.preventDefault();
        if (ev.repeat) return;
        if (aimOwner !== null) cancelAim();
        else if (ctx.actions.isShopOpen()) {
          host.audio.ui('back');
          ctx.actions.setShop(false);
        } else if (ctx.actions.isScoreboardPinned()) ctx.actions.setScoreboard(false, false);
        else ctx.actions.openSettings();
        break;
      default:
        break;
    }
  });
  onWin('keyup', (ev) => {
    const code = ev.code;
    if (setDirKey(code, false)) {
      syncMove();
      return;
    }
    if (code === 'Space' || code === 'KeyJ') {
      attackHolds.delete(code);
      if (!attackHolds.has('Space') && !attackHolds.has('KeyJ')) skills.setDown('attack', false);
    } else if (keyAim && keyAim.code === code) {
      const slot = keyAim.slot;
      const sol = solveKeyAim();
      cancelKeyAim();
      // 对话框是在按住期间弹出的话，这次松键不算施放
      if (!hasOpenDialog()) fire(slot, sol);
    } else if (code === 'Tab') {
      if (!ctx.actions.isScoreboardPinned()) ctx.actions.setScoreboard(false, false);
    }
  });

  function reset(): void {
    keys.up = keys.down = keys.left = keys.right = false;
    for (const p of Array.from(presses.values())) endPress(p, false);
    attackHolds.clear();
    skills.setDown('attack', false);
    cancelKeyAim();
    releaseAim(aimOwner);
    rightHeld = null;
    const wasJoy = joyId !== null;
    joyEnd();
    if (!wasJoy) syncMove();
    if (!ctx.actions.isScoreboardPinned()) ctx.actions.setScoreboard(false, false);
  }
  // 失焦时浏览器不会再送 keyup：不清的话角色会一直朝一个方向跑
  onWin('blur', reset);
  const onVis = (): void => {
    if (document.hidden) reset();
  };
  document.addEventListener('visibilitychange', onVis);
  off.push(() => document.removeEventListener('visibilitychange', onVis));

  // ═════════════════════ 屏蔽浏览器手势 ═════════════════════
  on(root, 'contextmenu', (ev) => ev.preventDefault());
  // 旧版 iOS 不认 touch-action：手动拦掉滚动/橡皮筋，滚动区(商店列表等)放行
  on(
    root,
    'touchmove',
    (ev) => {
      if (ev.target instanceof Element && ev.target.closest('.sf-scroll, input')) return;
      if (ev.cancelable) ev.preventDefault();
    },
    { passive: false },
  );
  const stop = (ev: Event): void => ev.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
    root.addEventListener(type, stop);
    off.push(() => root.removeEventListener(type, stop));
  }
  on(root, 'dblclick', (ev) => {
    // 双击缩放；商店卡片的双击购买自己处理，不受影响
    if (!(ev.target instanceof Element && ev.target.closest('.sf-hud__card'))) ev.preventDefault();
  });
  on(root, 'selectstart', (ev) => ev.preventDefault());

  let wasBlocked = ctx.inputBlocked();

  return {
    joystick,
    reset,
    isAiming: () => aimOwner !== null,
    cancelAim,
    update(c) {
      const blocked = c.inputBlocked();
      if (blocked !== wasBlocked) {
        wasBlocked = blocked;
        if (blocked) {
          // 阵亡/暂停：正在瞄的作废；已发出的移动状态清零，这样恢复后仍按住的方向会重新发出
          cancelAim();
          sentX = sentY = 0;
        }
      }
      if (blocked) return;
      syncMove();
      if (attackHolds.size > 0 && clock() - attackAt >= ATTACK_RESEND) attackNow();
      // 英雄和目标都在动：瞄准中的指示器每帧重算（键盘按鼠标位置，触控按最近的拖动向量）
      if (keyAim) refreshKeyAim();
      else if (typeof aimOwner === 'number') {
        const p = presses.get(aimOwner);
        if (p) refreshPressAim(p);
      }
    },
    onMode() {
      // 布局切换时按住中的东西全部作废，避免两套输入的状态串台
      if (joyId !== null) joyEnd();
    },
    dispose() {
      reset();
      for (const fn of off) fn();
      off.length = 0;
      dismissTooltip();
    },
  };
}
