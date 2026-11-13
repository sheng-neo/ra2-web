/**
 * 新手引导的界面部分：提示卡(顶部中央指引位里的一张不拦截操作的卡片) 与 控件光圈。
 * 脚本与判定在 guide-script.ts(纯逻辑)，这里只把 GuideView 画出来。
 *
 * 卡片：第几课 / 课名 / 六个进度点 /「跳过引导」(卡上唯一可点的东西) + 一两行正文。
 * 做到时打勾闪一下；小贴士用同一张卡，换成青色(警告类琥珀色)。
 * 控件光圈：给摇杆底盘、普攻键、一技能键、回城键、商店按钮套一圈向外扩散的青色脉冲(同时加 is-guide 类)。
 */
import { uiIcon } from '../icons';
import { h, icon, injectStyle, sfCss } from '../theme';
import type { HudCtx } from './common';
import { GUIDE_LESSONS, parseGuideText, plainGuideText, type GuideCard, type GuideControl, type GuideView } from './guide-script';

const CSS = sfCss(`
/* ── 提示卡 ── */
.sf-hud__gcard {
  --edge: 232, 199, 122;
  display: none; width: 100%; box-sizing: border-box; padding: 6u 8u 7u 11u; border-radius: 10u; background: var(--hud-plate);
  box-shadow: inset 0 0 0 1px rgba(var(--edge), 0.55), inset 0 1px 0 1px rgba(143, 233, 255, 0.12), 0 6u 18u rgba(2, 4, 12, 0.5);
}
.sf-hud__gcard.is-on { display: block; }
.sf-hud__gcard.is-in { animation: sf-hud-gcard-in 0.26s var(--sf-ease-out) both; }
.sf-hud__gcard-head { display: flex; align-items: center; gap: 7u; min-height: max(22px, 24u); }
.sf-hud__gcard-badge {
  flex: none; display: inline-grid; place-items: center; min-width: max(30px, 34u); height: max(17px, 19u); padding: 0 5u; border-radius: 99px;
  font-family: var(--sf-font-num); font-weight: 800; font-size: max(10px, 11u); line-height: 1; letter-spacing: 0.04em; color: #06202c; background: linear-gradient(180deg, #c9f6ff, #5cd6f7);
}
.sf-hud__gcard-badge .sf-i { width: 1.2em; height: 1.2em; vertical-align: 0; }
.sf-hud__gcard-title { font-size: var(--sf-fs-sm); font-weight: 800; letter-spacing: 0.08em; line-height: 1.2; color: var(--sf-c-gold-200); white-space: nowrap; text-shadow: var(--hud-shadow-text); }
.sf-hud__gcard-dots { display: flex; align-items: center; gap: max(3px, 4u); margin-left: auto; }
.sf-hud__gcard-dots > i { width: max(6px, 7u); height: max(6px, 7u); border-radius: 50%; background: rgba(150, 178, 235, 0.22); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.55); }
.sf-hud__gcard-dots > i.is-done { background: #ffe7ad; box-shadow: 0 0 0 1px #6b4614, 0 0 5u rgba(255, 214, 130, 0.85); }
.sf-hud__gcard-dots > i.is-cur { background: #5cd6f7; box-shadow: 0 0 0 max(2px, 2u) rgba(92, 214, 247, 0.32); }
.sf-hud__gcard-skip {
  position: relative; flex: none; margin: 0 0 0 4u; padding: 0 9u; height: max(22px, 24u); border: 0; border-radius: 99px; cursor: pointer;
  font: inherit; font-size: var(--sf-fs-xs); font-weight: 700; line-height: 1; color: var(--sf-c-text-2); background: rgba(150, 178, 235, 0.16); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.3);
}
/* 手指的落点比字大一圈 */
.sf-hud__gcard-skip::after { content: ''; position: absolute; inset: -9px -6px; }
@media (hover: hover) { .sf-hud__gcard-skip:hover { color: var(--sf-c-text); background: rgba(150, 178, 235, 0.28); } }
.sf-hud__gcard-skip:active { transform: scale(0.94); }
.sf-hud__gcard-body { margin-top: 3u; font-size: var(--sf-fs-sm); font-weight: 600; line-height: 1.55; color: var(--sf-c-text); text-shadow: var(--hud-shadow-text); }
.sf-hud__gcard-body b { color: var(--sf-c-gold-200); font-weight: 800; }
.sf-hud__gcard-body .sf-kbd { min-width: max(19px, 21u); height: max(19px, 21u); padding: 0 5u; margin: 0 1u; vertical-align: -0.28em; font-size: max(11px, 11.5u); color: var(--sf-c-gold-100); }
/* 做到了：徽标变绿打勾，卡片亮一下 */
.sf-hud__gcard.is-done { --edge: 111, 227, 161; animation: sf-hud-gcard-done 0.6s ease-out both; }
.sf-hud__gcard.is-done .sf-hud__gcard-badge { color: #052414; background: linear-gradient(180deg, #c8ffe0, #6fe3a1); }
.sf-hud__gcard.is-done .sf-hud__gcard-title { color: #b9f5d2; }
/* 小贴士 / 结束语 */
.sf-hud__gcard.is-tip { --edge: 92, 214, 247; }
.sf-hud__gcard.is-tip .sf-hud__gcard-title { color: var(--sf-c-cyan-300); }
.sf-hud__gcard.is-warn { --edge: 255, 184, 77; }
.sf-hud__gcard.is-warn .sf-hud__gcard-badge { color: #2b1a04; background: linear-gradient(180deg, #ffe2a6, #ffb84d); }
.sf-hud__gcard.is-warn .sf-hud__gcard-title { color: #ffd08a; }
.sf-hud__gcard.is-outro .sf-hud__gcard-skip { display: none; }
@keyframes sf-hud-gcard-in { from { opacity: 0; transform: translateY(-8u); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-gcard-done { 0% { filter: brightness(1.9); } 100% { filter: none; } }

/* ── 控件光圈 ── */
.sf-hud__gglow { position: absolute; inset: -9%; z-index: 4; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 max(2px, 2.5u) #5cd6f7, 0 0 14u rgba(92, 214, 247, 0.85), inset 0 0 10u rgba(92, 214, 247, 0.4); }
.sf-hud__gglow::before, .sf-hud__gglow::after { content: ''; position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 max(2px, 2u) rgba(143, 233, 255, 0.95); animation: sf-hud-gglow 1.2s ease-out infinite; }
.sf-hud__gglow::after { animation-delay: 0.6s; }
/* 摇杆空闲时是半透明的：被点名时提到全亮 */
.sf-hud__joy.is-guide-host { opacity: 1; }
@keyframes sf-hud-gglow { from { transform: scale(1); opacity: 0.95; } to { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .sf-hud__gglow::before, .sf-hud__gglow::after { animation: none; opacity: 0; } }
/* 竖屏 / 小屏：卡片内边距收一点 */
@media (max-width: 480px) { .sf-hud__gcard { padding: 5px 6px 6px 9px; } .sf-hud__gcard-head { gap: 6px; } }
/* 手机横屏(屏高不足 460px)：卡片正下方就是玩家英雄头顶的血条，再往北是正在交手的敌人，三行的卡片会把它们盖住。
   压成一行：徽标(第几课) + 正文 + 跳过；课名与进度点收起。正文短的一行放下，长的折成两行，都比原来矮一行 */
@media (orientation: landscape) and (max-height: 460px) {
  .sf-hud__gcard { padding: 4px 6px 4px 8px; }
  .sf-hud__gcard.is-on { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 7px; }
  .sf-hud__gcard-head { display: contents; }
  .sf-hud__gcard-title, .sf-hud__gcard-dots { display: none; }
  .sf-hud__gcard-badge { grid-column: 1; grid-row: 1; align-self: start; margin-top: 2px; }
  .sf-hud__gcard-body { grid-column: 2; grid-row: 1; margin-top: 0; line-height: 1.4; }
  .sf-hud__gcard-skip { grid-column: 3; grid-row: 1; align-self: start; height: 20px; margin: 1px 0 0; }
}
`);

export interface GuideCardEl {
  el: HTMLElement;
  /** 画出这一刻的卡片；card 为 null 时收起。返回值：这一次是否刚刚变成「打勾」 */
  render(view: GuideView): boolean;
  visible(): boolean;
}

/** 提示卡。onSkip：玩家点了「跳过引导」 */
export function createGuideCard(onSkip: () => void): GuideCardEl {
  injectStyle('sf-hud-guide', CSS);
  const badge = h('span', 'sf-hud__gcard-badge sf-num');
  const title = h('b', 'sf-hud__gcard-title');
  const dots = h('span', 'sf-hud__gcard-dots');
  const dotEls: HTMLElement[] = [];
  for (let i = 0; i < GUIDE_LESSONS.length; i++) {
    const d = h('i');
    dotEls.push(d);
    dots.appendChild(d);
  }
  dots.setAttribute('aria-hidden', 'true');
  const skip = h('button', 'sf-hud__gcard-skip', '跳过引导');
  skip.type = 'button';
  skip.tabIndex = -1;
  skip.dataset.sfSnd = 'back';
  skip.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onSkip();
  });
  const body = h('div', 'sf-hud__gcard-body');
  const el = h('div', 'sf-hud__gcard', h('div', 'sf-hud__gcard-head', badge, title, dots, skip), body);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  let on = false;
  let lastId = '';
  let lastText = '';
  let lastDone = false;
  let lastBadge = '';
  let lastDots = '';

  function fillBody(text: string): void {
    body.textContent = '';
    for (const seg of parseGuideText(text)) {
      if (seg.t === 'key') body.appendChild(h('span', 'sf-kbd', seg.s));
      else if (seg.t === 'bold') body.appendChild(h('b', null, seg.s));
      else body.appendChild(document.createTextNode(seg.s));
    }
    el.setAttribute('aria-label', plainGuideText(text));
  }

  function setBadge(card: GuideCard): void {
    const key = card.done ? 'check' : card.kind === 'tip' ? 'info' : `${card.lesson}/${GUIDE_LESSONS.length}`;
    if (key === lastBadge) return;
    lastBadge = key;
    badge.textContent = '';
    if (key === 'check') badge.appendChild(icon(uiIcon('check')));
    else if (key === 'info') badge.appendChild(icon(uiIcon('info')));
    else badge.textContent = key;
  }

  return {
    el,
    visible: () => on,
    render(view) {
      const card = view.card;
      if (!card) {
        if (on) {
          on = false;
          el.classList.remove('is-on', 'is-in');
          lastId = '';
          delete el.dataset.step;
        }
        return false;
      }
      let justDone = false;
      const fresh = !on || card.id !== lastId;
      if (fresh) {
        on = true;
        lastId = card.id;
        el.className = `sf-hud__gcard is-on${card.kind === 'tip' ? ' is-tip' : ''}${card.kind === 'outro' ? ' is-outro' : ''}${card.warn ? ' is-warn' : ''}`;
        // 换卡时重播入场动画
        void el.offsetWidth;
        el.classList.add('is-in');
        el.dataset.step = card.id;
        el.dataset.kind = card.kind;
        title.textContent = card.title;
        lastText = '';
        lastDone = false;
        lastBadge = '';
      }
      if (card.text !== lastText) {
        lastText = card.text;
        fillBody(card.text);
      }
      if (card.done !== lastDone) {
        lastDone = card.done;
        el.classList.toggle('is-done', card.done);
        // 结束语本来就是「完成」的样子，不算一次新的打勾
        justDone = card.done && card.kind === 'step';
      }
      el.dataset.done = card.done ? '1' : '0';
      setBadge(card);
      let dk = '';
      for (let i = 0; i < dotEls.length; i++) dk += view.lessonsDone[i] ? 'd' : i === view.lesson - 1 ? 'c' : '.';
      if (dk !== lastDots) {
        lastDots = dk;
        for (let i = 0; i < dotEls.length; i++) dotEls[i].className = dk[i] === 'd' ? 'is-done' : dk[i] === 'c' ? 'is-cur' : '';
      }
      return justDone;
    },
  };
}

// ───────────────────────── 控件光圈 ─────────────────────────

const CONTROL_SELECTOR: Record<GuideControl, string> = {
  joystick: '.sf-hud__joy-base',
  attack: '.sf-hud__sk[data-btn="attack"]',
  s1: '.sf-hud__sk[data-btn="s1"]',
  recall: '.sf-hud__sk[data-btn="recall"]',
  shop: '.sf-hud__shopbtn',
};

export interface ControlGlow {
  /** 给某个控件套光圈；null = 取消 */
  set(control: GuideControl | null): void;
  current(): GuideControl | null;
  dispose(): void;
}

/** 光圈是挂在目标控件里的一个子元素：跟着控件走，不用每帧对位 */
export function createControlGlow(ctx: HudCtx): ControlGlow {
  injectStyle('sf-hud-guide', CSS);
  const ring = h('i', 'sf-hud__gglow');
  ring.setAttribute('aria-hidden', 'true');
  let cur: GuideControl | null = null;
  let host: HTMLElement | null = null;

  function detach(): void {
    if (host) {
      host.classList.remove('is-guide');
      host.parentElement?.classList.remove('is-guide-host');
    }
    ring.remove();
    host = null;
  }

  return {
    current: () => cur,
    set(control) {
      // 目标没变、光圈也还挂着：什么都不用做
      if (control === cur && (control === null || (host && host.isConnected && ring.parentElement === host))) return;
      detach();
      cur = control;
      if (!control) return;
      const target = ctx.root.querySelector<HTMLElement>(CONTROL_SELECTOR[control]);
      // 找不到(布局里没有这个控件)：记着目标，下次再试
      if (!target) return;
      host = target;
      target.classList.add('is-guide');
      target.parentElement?.classList.add('is-guide-host');
      target.appendChild(ring);
    },
    dispose() {
      detach();
      cur = null;
    },
  };
}
