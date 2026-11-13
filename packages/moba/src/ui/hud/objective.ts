/**
 * 「当前目标」行：顶部中央指引位里的一条低调的单行胶囊——「◎ 当前目标  跟着小兵，推掉敌方上路一塔」。
 * 规则与防抖在 objective-rules.ts(纯逻辑)；这里只负责画。不拦截指针。
 * 换目标(键变了)时文字淡入一下；只变数字(倒计时)或同一目标换个说法(键不变)不触发动画。warn 琥珀色，go 金色。
 */
import { uiIcon } from '../icons';
import { h, icon, injectStyle, sfCss } from '../theme';
import type { Objective } from './objective-rules';

const CSS = sfCss(`
.sf-hud__obj {
  --tone: 143, 233, 255;
  display: none; align-items: center; gap: 6u; max-width: 100%; box-sizing: border-box; height: max(22px, 26u); padding: 0 12u 0 7u; border-radius: 99px;
  background: linear-gradient(180deg, rgba(20, 33, 72, 0.7), rgba(7, 12, 30, 0.74)); box-shadow: inset 0 0 0 1px rgba(var(--tone), 0.4), 0 3u 10u rgba(2, 4, 12, 0.4);
  font-size: var(--sf-fs-sm); line-height: 1; color: var(--sf-c-text); white-space: nowrap; pointer-events: none;
}
.sf-hud__obj.is-on { display: inline-flex; }
.sf-hud__obj.is-in { animation: sf-hud-obj-in 0.22s var(--sf-ease-out) both; }
.sf-hud__obj > .sf-i { flex: none; width: 1.2em; height: 1.2em; color: rgb(var(--tone)); vertical-align: 0; }
.sf-hud__obj-tag { flex: none; font-size: var(--sf-fs-xs); font-weight: 800; letter-spacing: 0.08em; color: rgb(var(--tone)); }
.sf-hud__obj-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 600; letter-spacing: 0.02em; text-shadow: var(--hud-shadow-text); }
.sf-hud__obj.is-swap .sf-hud__obj-text { animation: sf-hud-obj-swap 0.2s linear both; }
.sf-hud__obj.is-warn { --tone: 255, 184, 77; box-shadow: inset 0 0 0 max(1px, 1.5u) rgba(var(--tone), 0.75), 0 0 12u rgba(255, 184, 77, 0.28), 0 3u 10u rgba(2, 4, 12, 0.4); }
.sf-hud__obj.is-warn .sf-hud__obj-text { color: #ffe9c4; }
.sf-hud__obj.is-go { --tone: 255, 231, 173; box-shadow: inset 0 0 0 1px rgba(var(--tone), 0.65), 0 3u 10u rgba(2, 4, 12, 0.4); }
.sf-hud__obj.is-go .sf-hud__obj-text { color: var(--sf-c-gold-100); }
@keyframes sf-hud-obj-in { from { opacity: 0; transform: translateY(-5u); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-obj-swap { from { opacity: 0; } to { opacity: 1; } }
/* 窄屏放不下「当前目标」四个字：只留图标 */
@media (max-width: 460px) { .sf-hud__obj-tag { display: none; } .sf-hud__obj { padding: 0 10px 0 6px; } }
`);

export interface ObjectiveRow {
  el: HTMLElement;
  /** 画出这条目标；null = 收起 */
  render(o: Objective | null): void;
  visible(): boolean;
}

export function createObjectiveRow(): ObjectiveRow {
  injectStyle('sf-hud-objective', CSS);
  const text = h('span', 'sf-hud__obj-text');
  const el = h('div', 'sf-hud__obj', icon(uiIcon('target')), h('span', 'sf-hud__obj-tag', '当前目标'), text);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  let on = false;
  let lastKey = '';
  let lastText = '';
  let lastTone = '';

  return {
    el,
    visible: () => on,
    render(o) {
      if (!o) {
        if (on) {
          on = false;
          el.classList.remove('is-on', 'is-in', 'is-swap');
          lastKey = '';
          delete el.dataset.key;
        }
        return;
      }
      if (!on) {
        on = true;
        el.classList.add('is-on');
        void el.offsetWidth;
        el.classList.add('is-in');
      } else if (o.key !== lastKey) {
        // 换了目标：文字淡入一下
        el.classList.remove('is-swap');
        void el.offsetWidth;
        el.classList.add('is-swap');
      }
      if (o.key !== lastKey) {
        lastKey = o.key;
        el.dataset.key = o.key;
      }
      // 规则 id 单独记：「小兵进塔了，快打塔」与「推掉这座塔」共用一个键，只换文字与规则 id
      if (el.dataset.id !== o.id) el.dataset.id = o.id;
      if (o.tone !== lastTone) {
        lastTone = o.tone;
        el.classList.toggle('is-warn', o.tone === 'warn');
        el.classList.toggle('is-go', o.tone === 'go');
      }
      if (o.text !== lastText) {
        lastText = o.text;
        text.textContent = o.text;
      }
    },
  };
}
