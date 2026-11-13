/**
 * 右下技能区：大普攻键 + 弧形排列的 一技能/二技能/大招 + 外圈较小的 回城/疗伤/闪现，以及瞄准时出现的「取消」区。
 * 这里只管外观与状态（冷却扫描、秒数、缺蓝、未学会、被控、升级/就绪闪光、键位角标、类型标签角标、技能详情内容）；
 * 按下/拖动/施放的手势在 ui/input 里，通过 buttons 拿到这些按钮。
 *
 * 「技能一眼能懂」：一技能 / 二技能 / 大招的键右上角有一枚两字角标(该技能最要紧的类型标签，大招写「大招」)；
 * 详情浮层自上而下是 标题 → 标签 + 施法方式 → 一句大白话 → 数值行 → 详细描述，大白话永远排在数值前面。
 */
import { HEROES, SUMMONER, skillLevelsAt, skillValue } from '../../core/data/heroes';
import type { AbilitySlot, HeroDef, SkillDef, SkillSlot, SummonerSlot } from '../../core/types';
import { anySkillIcon, roleIcon, uiIcon } from '../icons';
import { ensureTagStyle, escapeHtml, hexRgb, skillKeyTag, skillTagsHtml } from '../menu/shared';
import { h, icon, injectStyle, sfCss } from '../theme';
import { classSlot, clamp01, replay, textSlot, varSlot, type HudCtx, type HudPart } from './common';
import { SUMMONER_CAST, castKind, castLabel, castReach } from './text';

export type ButtonId = SkillSlot | 'attack';
export const SKILL_SLOTS: SkillSlot[] = ['s1', 's2', 'ult', 'recall', 'heal', 'flash'];
export const KEY_LABEL: Record<ButtonId, string> = { attack: '空格', s1: 'Q', s2: 'E', ult: 'R', flash: 'F', heal: 'G', recall: 'B' };
const SLOT_NAME: Record<AbilitySlot, string> = { s1: '一技能', s2: '二技能', ult: '大招' };

/**
 * 各键圆心相对技能区右下角的位置（单位：技能键直径 --hud-sk）。
 * 三个技能排在以普攻键为圆心的内弧上(左、左上、正上)，三个通用技能排在外弧上：
 * 拇指从普攻键出发，向任何一个键都是一次不换手的滑动。
 */
const ATK = { x: 0.86, y: 0.86 };
const polar = (deg: number, r: number): { x: number; y: number } => ({ x: ATK.x - Math.cos((deg * Math.PI) / 180) * r, y: ATK.y + Math.sin((deg * Math.PI) / 180) * r });
const R_IN = 1.52;
const R_OUT = 2.62;
const LAYOUT: Record<ButtonId, { x: number; y: number }> = {
  attack: ATK,
  s1: polar(187, R_IN),
  s2: polar(138.5, R_IN),
  ult: polar(90, R_IN),
  recall: polar(159.5, R_OUT),
  heal: polar(138.5, R_OUT),
  flash: polar(117.5, R_OUT),
};
/**
 * 竖屏下三个通用技能键的位置：外弧收到大招键的上方(85°~120°，半径略放大，给键下沿的名字留出位置)。
 * 屏幕窄，横屏那组角度会把回城 / 疗伤键放进左半屏的摇杆热区、紧贴摇杆底盘(实测只隔 9px)，拇指稍偏就变成原地回城；
 * 收拢后三个键的左缘都在屏宽 60% 以右(390 宽时最左的回城键左缘约 239px，摇杆热区到 218px 为止)。顺序不变：回城最靠左、闪现最靠上。
 */
const R_OUT_PORTRAIT = 2.75;
const LAYOUT_PORTRAIT: Record<SummonerSlot, { x: number; y: number }> = {
  recall: polar(120, R_OUT_PORTRAIT),
  heal: polar(102.5, R_OUT_PORTRAIT),
  flash: polar(85, R_OUT_PORTRAIT),
};

const CSS = sfCss(`
.sf-hud__skills { position: absolute; right: var(--hud-r); bottom: calc(var(--hud-b) + var(--hud-lift)); z-index: 3; width: 0; height: 0; }
.sf-hud__sk {
  --d: var(--hud-sk); --cd: 0; --x: 1; --y: 1;
  position: absolute; right: calc(var(--hud-sk) * var(--x) - var(--d) / 2); bottom: calc(var(--hud-sk) * var(--y) - var(--d) / 2); width: var(--d); height: var(--d);
  padding: 0; margin: 0; border: 0; border-radius: 50%; background: none; color: #fff; cursor: pointer; touch-action: none;
  transition: transform 0.09s var(--sf-ease-out), filter 0.15s linear;
}
/* 设计系统给所有按钮设了 touch-action: manipulation；技能键要自己处理拖动瞄准，必须彻底关掉浏览器手势 */
.sf-hud .sf-hud__sk { touch-action: none; }
.sf-hud__sk:focus-visible { outline: none; }
.sf-hud__sk.is-ult { --d: calc(var(--hud-sk) * 1.07); }
.sf-hud__sk.is-sum { --d: calc(var(--hud-sk) * 0.74); }
.sf-hud__sk.is-atk { --d: calc(var(--hud-sk) * 1.43); }
.sf-hud__sk.is-down { transform: scale(0.93); }
/* 竖屏：通用技能键换到大招键上方那组位置(见 LAYOUT_PORTRAIT)；右下技能区随之高出一截，中下的读条 / 提示条跟着上移 */
@media (orientation: portrait) {
  .sf-hud__sk.is-sum { right: calc(var(--hud-sk) * var(--xp, var(--x)) - var(--d) / 2); bottom: calc(var(--hud-sk) * var(--yp, var(--y)) - var(--d) / 2); }
  .sf-hud { --hud-ch: calc(var(--hud-sk) * 4.1 + var(--hud-b)); }
}

/* 图标面：圆形裁切 + 双层描边（深色隔离线 + 金环） */
.sf-hud__sk-face {
  position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: #0a1128;
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, calc(var(--d) * 0.045)) rgba(224, 177, 96, 0.82), 0 calc(var(--d) * 0.06) calc(var(--d) * 0.18) rgba(0, 0, 0, 0.55);
  transition: box-shadow 0.12s linear;
}
.sf-hud__sk-face > svg { display: block; width: 100%; height: 100%; transition: filter 0.15s linear; }
.sf-hud__sk-face::after { content: ''; position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), inset 0 calc(var(--d) * -0.14) calc(var(--d) * 0.2) rgba(0, 0, 0, 0.32); pointer-events: none; }
/* 大招：金环外再套一圈青色星轨 */
.sf-hud__sk.is-ult .sf-hud__sk-face { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, calc(var(--d) * 0.045)) #ffe7ad, 0 0 0 max(3px, calc(var(--d) * 0.07)) rgba(8, 13, 31, 0.9), 0 0 0 max(4px, calc(var(--d) * 0.09)) rgba(92, 214, 247, 0.75), 0 0 calc(var(--d) * 0.3) rgba(92, 214, 247, 0.4); }
.sf-hud__sk.is-down .sf-hud__sk-face, .sf-hud__sk.is-aim .sf-hud__sk-face { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, calc(var(--d) * 0.055)) #fff4d6, 0 0 calc(var(--d) * 0.36) rgba(255, 214, 130, 0.95); }
.sf-hud__sk.is-active .sf-hud__sk-face { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, calc(var(--d) * 0.055)) var(--sf-c-cyan-300), 0 0 calc(var(--d) * 0.4) rgba(92, 214, 247, 0.9); }

/* 冷却：暗色扇形从 12 点方向顺时针退去，边界带一道亮线 */
.sf-hud__sk-cd {
  --a: calc((1 - var(--cd)) * 360deg);
  position: absolute; inset: 0; border-radius: 50%; display: none; pointer-events: none;
  background: conic-gradient(rgba(3, 6, 16, 0) 0deg, rgba(3, 6, 16, 0) calc(var(--a) - 2.5deg), rgba(190, 236, 255, 0.9) var(--a), rgba(3, 6, 16, 0.74) calc(var(--a) + 0.8deg), rgba(3, 6, 16, 0.74) 360deg);
}
.sf-hud__sk.is-cd .sf-hud__sk-cd { display: block; }
.sf-hud__sk.is-cd .sf-hud__sk-face > svg { filter: saturate(0.55) brightness(0.8); }
.sf-hud__sk-sec { position: absolute; inset: 0; display: grid; place-items: center; font-size: calc(var(--d) * 0.37); font-weight: 800; line-height: 1; color: #fff; text-shadow: 0 1px 2px #000, 0 0 calc(var(--d) * 0.12) rgba(2, 4, 12, 0.95); pointer-events: none; }

/* 状态角标：未学会(锁)/缺蓝(水滴)/被控(禁止) */
.sf-hud__sk-mark { position: absolute; inset: 0; display: none; place-items: center; border-radius: 50%; pointer-events: none; }
.sf-hud__sk-mark > .sf-i { width: 44%; height: 44%; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9)); }
.sf-hud__sk.is-locked .sf-hud__sk-mark.is-lock { display: grid; background: rgba(3, 6, 16, 0.66); color: var(--sf-c-text-2); }
.sf-hud__sk.is-locked .sf-hud__sk-face > svg { filter: grayscale(1) brightness(0.55); }
.sf-hud__sk.is-nomana .sf-hud__sk-face > svg { filter: grayscale(0.9) brightness(0.72); }
.sf-hud__sk.is-nomana .sf-hud__sk-mark.is-mana { display: grid; place-items: end center; background: linear-gradient(180deg, rgba(40, 90, 190, 0.18), rgba(30, 70, 170, 0.55)); color: #9ccfff; }
.sf-hud__sk.is-nomana .sf-hud__sk-mark.is-mana > .sf-i { width: 30%; height: 30%; margin-bottom: 9%; }
.sf-hud__sk.is-forbid .sf-hud__sk-mark.is-ban { display: grid; background: rgba(120, 16, 26, 0.5); color: #ffb3b3; }
.sf-hud__sk.is-forbid .sf-hud__sk-face > svg { filter: grayscale(0.7) brightness(0.65); }
.sf-hud__sk.is-locked .sf-hud__sk-sec, .sf-hud__sk.is-locked .sf-hud__sk-cd { display: none; }

/* 技能等级点 */
.sf-hud__sk-pips { position: absolute; left: 50%; bottom: calc(var(--d) * -0.1); display: flex; gap: max(1.5px, calc(var(--d) * 0.028)); transform: translateX(-50%); pointer-events: none; }
.sf-hud__sk-pips > i { width: max(4px, calc(var(--d) * 0.085)); height: max(4px, calc(var(--d) * 0.085)); border-radius: 50%; background: #0a1128; box-shadow: 0 0 0 1px rgba(150, 178, 235, 0.6); }
.sf-hud__sk-pips > i.is-on { background: #ffe7ad; box-shadow: 0 0 0 1px #6b4614, 0 0 4px rgba(255, 214, 130, 0.9); }
.sf-hud__sk > .sf-hud__key { left: calc(var(--d) * -0.06); top: calc(var(--d) * -0.06); }
.sf-hud__sk.is-atk > .sf-hud__key { left: 6%; top: 6%; }

/* 类型标签角标：右上角两个字(键位角标在左上、等级点在下方，互不重叠)。深色半透明底 + 标签色文字，颜色只是辅助 */
.sf-hud__sk-tag {
  --tag: 243, 207, 133;
  position: absolute; right: calc(var(--d) * -0.07); top: calc(var(--d) * -0.07); z-index: 1; padding: 0.22em 0.42em 0.24em; border-radius: 99px; pointer-events: none;
  font-size: max(10px, calc(var(--d) * 0.175)); font-weight: 800; font-style: normal; line-height: 1; letter-spacing: 0.02em; white-space: nowrap;
  color: rgb(var(--tag)); background: rgba(6, 10, 24, 0.88); box-shadow: 0 0 0 1px rgba(var(--tag), 0.6), 0 1px 3px rgba(0, 0, 0, 0.6);
  transition: color 0.15s linear, box-shadow 0.15s linear, background 0.15s linear;
}
.sf-hud__sk-tag.is-ult { color: #2b1a04; background: var(--sf-grad-gold); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 1px 3px rgba(0, 0, 0, 0.6); }
/* 通用技能键的名字(闪现 / 疗伤 / 回城)：只在触控布局显示——键鼠有 F / G / B 键帽，文案也写「按 B 回城」；
   触控的文案写的是「点『回城』」，键上得有这两个字才对得上。压在键的下沿，不挡图标中心的冷却秒数 */
.sf-hud__sk-name {
  position: absolute; left: 50%; bottom: calc(var(--d) * -0.14); z-index: 1; display: none; transform: translateX(-50%); padding: 0.18em 0.42em 0.2em; border-radius: 99px; pointer-events: none;
  font-size: max(10px, calc(var(--d) * 0.24)); font-weight: 800; font-style: normal; line-height: 1; letter-spacing: 0.04em; white-space: nowrap;
  color: #e9f2ff; background: rgba(6, 10, 24, 0.88); box-shadow: 0 0 0 1px rgba(150, 178, 235, 0.55), 0 1px 3px rgba(0, 0, 0, 0.6);
}
.sf-hud--touch .sf-hud__sk-name { display: block; }
/* 未学会：角标一并变灰 */
.sf-hud__sk.is-locked .sf-hud__sk-tag { color: #8b96b3; background: rgba(6, 10, 24, 0.88); box-shadow: 0 0 0 1px rgba(139, 150, 179, 0.5); }

/* 就绪 / 升级闪光 */
.sf-hud__sk-fx { position: absolute; inset: -18%; border-radius: 50%; opacity: 0; pointer-events: none; }
.sf-hud__sk.is-ready .sf-hud__sk-fx { background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0, rgba(190, 236, 255, 0.7) 38%, rgba(92, 214, 247, 0) 68%); animation: sf-hud-sk-ready 0.5s ease-out; }
.sf-hud__sk.is-lvup .sf-hud__sk-fx { background: radial-gradient(circle, rgba(255, 244, 214, 0) 46%, rgba(255, 231, 173, 0.95) 56%, rgba(255, 214, 130, 0) 70%); animation: sf-hud-sk-lvup 0.9s ease-out; }
.sf-hud__sk.is-lvup .sf-hud__sk-face { animation: sf-hud-sk-glow 0.9s ease-out; }
@keyframes sf-hud-sk-ready { 0% { opacity: 1; transform: scale(0.5); } 100% { opacity: 0; transform: scale(1.15); } }
@keyframes sf-hud-sk-lvup { 0% { opacity: 1; transform: scale(0.6); } 100% { opacity: 0; transform: scale(1.5); } }
@keyframes sf-hud-sk-glow { 0%, 40% { filter: brightness(1.9) saturate(1.2); } 100% { filter: none; } }

/* 普攻键：金属外环 + 深蓝内面 + 大号武器字形 */
.sf-hud__atk-face {
  position: absolute; inset: 0; border-radius: 50%; display: grid; place-items: center; color: #ffe9b8;
  background: radial-gradient(circle at 50% 38%, rgba(60, 96, 180, 0.95), rgba(16, 28, 66, 0.96) 58%, rgba(6, 10, 26, 0.98));
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2.5px, calc(var(--d) * 0.04)) #e0b160, 0 0 0 max(3.5px, calc(var(--d) * 0.055)) rgba(8, 13, 31, 0.9), 0 0 0 max(4.5px, calc(var(--d) * 0.068)) rgba(255, 231, 173, 0.45),
    0 calc(var(--d) * 0.06) calc(var(--d) * 0.2) rgba(0, 0, 0, 0.6), inset 0 0 calc(var(--d) * 0.22) rgba(92, 214, 247, 0.28), inset 0 2px 0 rgba(255, 255, 255, 0.2);
  transition: box-shadow 0.1s linear, background 0.1s linear;
}
.sf-hud__atk-face > .sf-i { width: 50%; height: 50%; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.7)); }
.sf-hud__sk.is-atk.is-down .sf-hud__atk-face { background: radial-gradient(circle at 50% 38%, #ffe7ad, #b17a2c 62%, #4a2f0c); color: #2b1a04; box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2.5px, calc(var(--d) * 0.04)) #fff4d6, 0 0 calc(var(--d) * 0.36) rgba(255, 214, 130, 0.95); }
.sf-hud__sk.is-atk.is-forbid .sf-hud__atk-face { filter: grayscale(0.8) brightness(0.65); }

.sf-hud__skills.is-dead .sf-hud__sk { filter: grayscale(1) brightness(0.55); }

/* 「取消」区：手动瞄准时出现，拖进去松手 = 不放 */
.sf-hud__cancel {
  --d: calc(var(--hud-sk) * 1.16);
  position: absolute; right: calc(var(--hud-sk) * 4.4); bottom: calc(var(--hud-sk) * 2.7); width: var(--d); height: var(--d); border-radius: 50%; display: grid; place-items: center; pointer-events: none;
  color: #ffd0d0; background: radial-gradient(circle at 50% 35%, rgba(90, 22, 34, 0.9), rgba(30, 8, 16, 0.92)); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(2px, 2.5u) rgba(255, 120, 120, 0.75), 0 4u 14u rgba(0, 0, 0, 0.55);
  opacity: 0; transform: scale(0.6); transition: opacity 0.12s linear, transform 0.16s var(--sf-ease-spring), background 0.1s linear;
}
.sf-hud__cancel.is-on { opacity: 1; transform: none; }
.sf-hud__cancel.is-hot { transform: scale(1.14); color: #fff; background: radial-gradient(circle at 50% 35%, #ff7a6e, #c2262f 62%, #6e1019); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(2px, 3u) #fff, 0 0 22u rgba(255, 93, 93, 0.95); }
.sf-hud__cancel > span { display: flex; flex-direction: column; align-items: center; gap: 1u; font-size: max(10px, 11u); font-weight: 800; letter-spacing: 0.1em; line-height: 1.1; }
.sf-hud__cancel .sf-i { width: calc(var(--d) * 0.36); height: calc(var(--d) * 0.36); }
/* 竖屏：屏幕窄，取消区正好落在摇杆正上方——往上抬一点，别和摇杆底盘叠在一起 */
@media (orientation: portrait) { .sf-hud__cancel { bottom: calc(var(--hud-sk) * 3.12); } }

/* 技能详情浮层：标签行 → 大白话(比正文大一号，主文字色) → 分隔线 → 数值行 → 详细描述(次文字色) */
.sf-tip .sf-hud-v { color: var(--sf-c-gold-200); font-weight: 700; }
.sf-tip .sf-hud-tiptags { display: flex; flex-wrap: wrap; align-items: center; gap: 4u 8u; margin: 4u 0 1u; }
.sf-tip .sf-hud-tipcast { font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); letter-spacing: 0.06em; }
.sf-tip .sf-hud-tipbrief { margin: 4u 0 0; font-size: var(--sf-fs-md); font-weight: 700; line-height: 1.45; color: var(--sf-c-text); }
.sf-tip .sf-hud-tipline { display: flex; flex-wrap: wrap; gap: 3u 10u; margin: 2u 0 5u; font-size: var(--sf-fs-xs); color: var(--sf-c-cyan-300); }
.sf-tip .sf-hud-tipline .is-warn { color: #ff9c9c; }
.sf-tip .sf-hud-tipbrief + .sf-hud-tipline, .sf-tip .sf-hud-tipbrief + .sf-hud-tipdesc { margin-top: 7u; padding-top: 6u; box-shadow: inset 0 1px 0 var(--sf-c-line); }
.sf-tip .sf-hud-tipdesc { color: var(--sf-c-text-2); }
/* 手机横屏(屏高很小)：详细描述最多三行，其余完整 */
@media (max-height: 460px) and (orientation: landscape) {
  .sf-tip .sf-hud-tipdesc { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
}
`);

interface BtnView {
  el: HTMLButtonElement;
  setCd: (v: number) => void;
  setSec: (s: string) => void;
  setOnCd: (b: boolean) => void;
  setLocked: (b: boolean) => void;
  setNoMana: (b: boolean) => void;
  setForbid: (b: boolean) => void;
  pips: HTMLElement[];
  level: number;
  wasCd: boolean;
}

export interface SkillBar extends HudPart {
  el: HTMLElement;
  buttons: Record<ButtonId, HTMLButtonElement>;
  cancelZone: HTMLElement;
  setDown(id: ButtonId, on: boolean): void;
  /** 正在手动瞄准的技能（描边高亮）与取消区的显隐 */
  setAiming(slot: SkillSlot | null, showCancel: boolean): void;
  setCancelHot(on: boolean): void;
  /** 技能详情（提示浮层内容） */
  tipHtml(slot: SkillSlot): string;
}

/** 英雄升到几级才学会这个技能 */
function unlockLevel(slot: AbilitySlot): number {
  for (let l = 1; l <= 15; l++) if (skillLevelsAt(l)[slot] >= 1) return l;
  return 1;
}

/** 技能描述：占位符换成当前等级数值并高亮（未学会时按 1 级显示） */
function descHtml(def: SkillDef, level: number): string {
  const lv = Math.max(1, level);
  return escapeHtml(def.desc).replace(/\{(\w+)(%?)\}/g, (_m, key: string, pctMark: string) => {
    if (def.values[key] === undefined) return '';
    const v = skillValue(def, key, lv);
    const text = pctMark === '%' ? `${Math.round(v * 100)}%` : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    return `<span class="sf-hud-v sf-num">${text}</span>`;
  });
}

/**
 * 被动技能的详情浮层(状态栏头像旁的被动图标用)：标题 → 「被动」+ 类型标签 → 一句大白话 → 详细描述。
 * 样式类与技能浮层同一套(随 createSkillBar 注入)。
 */
export function passiveTipHtml(def: HeroDef): string {
  const p = def.passive;
  return (
    `<div class="sf-tip__title"><span>${escapeHtml(p.name)}</span><span class="sf-tip__meta">被动</span></div>` +
    `<div class="sf-hud-tiptags">${skillTagsHtml('passive', p.tags)}</div>` +
    (p.brief ? `<div class="sf-hud-tipbrief">${escapeHtml(p.brief)}</div>` : '') +
    `<div class="sf-hud-tipdesc">${escapeHtml(p.desc)}</div>`
  );
}

export function createSkillBar(ctx: HudCtx): SkillBar {
  injectStyle('sf-hud-skills', CSS);
  ensureTagStyle();
  const heroId = ctx.me.heroId;
  const def = HEROES[heroId];
  const el = h('div', 'sf-hud__skills');
  const views = {} as Record<SkillSlot, BtnView>;
  const buttons = {} as Record<ButtonId, HTMLButtonElement>;

  const place = (b: HTMLElement, id: ButtonId): void => {
    b.style.setProperty('--x', LAYOUT[id].x.toFixed(3));
    b.style.setProperty('--y', LAYOUT[id].y.toFixed(3));
    if (id === 'recall' || id === 'heal' || id === 'flash') {
      b.style.setProperty('--xp', LAYOUT_PORTRAIT[id].x.toFixed(3));
      b.style.setProperty('--yp', LAYOUT_PORTRAIT[id].y.toFixed(3));
    }
  };

  // ── 普攻键：字形跟着英雄的攻击方式走(剑 / 弓 / 星芒) ──
  const atkGlyph = def.attackType === 'melee' ? uiIcon('kill') : def.role === 'mage' ? roleIcon('mage') : roleIcon('marksman');
  const atk = h('button', 'sf-hud__sk is-atk', h('span', 'sf-hud__atk-face', icon(atkGlyph)), h('span', 'sf-hud__key', KEY_LABEL.attack));
  atk.type = 'button';
  atk.tabIndex = -1;
  atk.dataset.btn = 'attack';
  atk.setAttribute('aria-label', '普通攻击');
  place(atk, 'attack');
  buttons.attack = atk;

  for (const slot of SKILL_SLOTS) {
    const ability = slot === 's1' || slot === 's2' || slot === 'ult';
    const face = h('span', 'sf-hud__sk-face');
    face.innerHTML = anySkillIcon(heroId, slot);
    const sec = h('b', 'sf-hud__sk-sec sf-num');
    const pipsBox = ability ? h('span', 'sf-hud__sk-pips') : null;
    const pips: HTMLElement[] = [];
    if (pipsBox) {
      const max = def.skills[slot as AbilitySlot].maxLevel;
      for (let i = 0; i < max; i++) {
        const p = h('i');
        pips.push(p);
        pipsBox.appendChild(p);
      }
    }
    // 类型标签角标：只有英雄技能有；数据里没写标签的技能不显示(大招恒有「大招」)
    const keyTag = ability ? skillKeyTag(slot as AbilitySlot, def.skills[slot as AbilitySlot].tags) : null;
    let tagEl: HTMLElement | null = null;
    if (keyTag) {
      tagEl = h('i', `sf-hud__sk-tag${slot === 'ult' ? ' is-ult' : ''}`, keyTag.text);
      tagEl.style.setProperty('--tag', hexRgb(keyTag.color));
    }
    const b = h(
      'button',
      `sf-hud__sk ${slot === 'ult' ? 'is-ult' : ability ? '' : 'is-sum'}`,
      face,
      h('i', 'sf-hud__sk-cd'),
      h('span', 'sf-hud__sk-mark is-mana', icon(uiIcon('mana'))),
      h('span', 'sf-hud__sk-mark is-ban', icon(uiIcon('cancel'))),
      h('span', 'sf-hud__sk-mark is-lock', icon(uiIcon('lock'))),
      sec,
      h('i', 'sf-hud__sk-fx'),
      pipsBox,
      h('span', 'sf-hud__key', KEY_LABEL[slot]),
      tagEl,
      ability ? null : h('i', 'sf-hud__sk-name', SUMMONER[slot as SummonerSlot].name),
    );
    b.type = 'button';
    b.tabIndex = -1;
    b.dataset.btn = slot;
    b.setAttribute('aria-label', ability ? `${SLOT_NAME[slot as AbilitySlot]} ${def.skills[slot as AbilitySlot].name}` : SUMMONER[slot as SummonerSlot].name);
    place(b, slot);
    buttons[slot] = b;
    views[slot] = {
      el: b,
      setCd: varSlot(b, '--cd', 1 / 360),
      setSec: textSlot(sec),
      setOnCd: classSlot(b, 'is-cd'),
      setLocked: classSlot(b, 'is-locked'),
      setNoMana: classSlot(b, 'is-nomana'),
      setForbid: classSlot(b, 'is-forbid'),
      pips,
      level: -1,
      wasCd: false,
    };
  }
  // DOM 顺序 = 叠放顺序：外弧小键在下，技能键在上，普攻键最上
  el.append(buttons.recall, buttons.heal, buttons.flash, buttons.s1, buttons.s2, buttons.ult, atk);

  const cancelZone = h('div', 'sf-hud__cancel', h('span', null, icon(uiIcon('close')), '取消'));
  el.appendChild(cancelZone);

  const setDead = classSlot(el, 'is-dead');
  const setAtkForbid = classSlot(atk, 'is-forbid');
  const setRecalling = classSlot(buttons.recall, 'is-active');
  const setHealing = classSlot(buttons.heal, 'is-active');
  let aiming: SkillSlot | null = null;

  function tipHtml(slot: SkillSlot): string {
    const sk = ctx.me.skills[slot];
    const key = ctx.mode === 'kbm' ? `<span class="sf-kbd">${KEY_LABEL[slot]}</span>` : '';
    const cdLeft = sk.cd > 0.05 ? `<span class="is-warn">剩余 ${sk.cd >= 10 ? Math.ceil(sk.cd) : sk.cd.toFixed(1)} 秒</span>` : '';
    if (slot === 's1' || slot === 's2' || slot === 'ult') {
      const d = def.skills[slot];
      const lv = sk.level;
      const idx = Math.max(0, Math.min(d.maxLevel, Math.max(1, lv)) - 1);
      const cd = lv > 0 && sk.cdMax > 0 && sk.cd > 0 ? sk.cdMax : d.cooldown[idx] * (1 - ctx.me.stats.cdr);
      const cost = lv > 0 ? sk.cost : d.manaCost[idx];
      const lvText = lv > 0 ? `Lv.${lv}/${d.maxLevel}` : `${unlockLevel(slot)} 级解锁`;
      const lack = lv > 0 && ctx.me.mana < cost ? '<span class="is-warn">法力不足</span>' : '';
      // 有大白话的技能：施法方式挪到标签行，数值行只留距离；没有的(向后兼容)退回「标题 → 数值行 → 描述」
      const tagRow = d.brief || d.tags?.length ? `<div class="sf-hud-tiptags">${skillTagsHtml(slot, d.tags)}<span class="sf-hud-tipcast">${castKind(d.cast)}</span></div>` : '';
      const reach = tagRow ? castReach(d.cast) : castLabel(d.cast);
      return (
        `<div class="sf-tip__title"><span>${escapeHtml(d.name)}</span><span class="sf-tip__meta sf-num">${SLOT_NAME[slot]} · ${lvText}</span></div>` +
        tagRow +
        (d.brief ? `<div class="sf-hud-tipbrief">${escapeHtml(d.brief)}</div>` : '') +
        `<div class="sf-hud-tipline"><span>冷却 <b class="sf-num">${Math.round(cd * 10) / 10}</b> 秒</span><span>消耗 <b class="sf-num">${cost}</b> 法力</span>${reach ? `<span>${reach}</span>` : ''}${cdLeft}${lack}${key}</div>` +
        `<div class="sf-hud-tipdesc">${descHtml(d, lv)}</div>`
      );
    }
    // 通用技能：标题 → 大白话 → 数值行 → 描述(没有标签行)
    const s = SUMMONER[slot];
    const reach = castReach(SUMMONER_CAST[slot]);
    return (
      `<div class="sf-tip__title"><span>${escapeHtml(s.name)}</span><span class="sf-tip__meta">通用技能</span></div>` +
      `<div class="sf-hud-tipbrief">${escapeHtml(s.brief)}</div>` +
      `<div class="sf-hud-tipline"><span>冷却 <b class="sf-num">${s.cooldown}</b> 秒</span>${reach ? `<span>${reach}</span>` : ''}${cdLeft}${key}</div>` +
      `<div class="sf-hud-tipdesc">${escapeHtml(s.desc)}</div>`
    );
  }

  return {
    el,
    buttons,
    cancelZone,
    tipHtml,
    setDown(id, on) {
      buttons[id].classList.toggle('is-down', on);
    },
    setAiming(slot, showCancel) {
      if (aiming && aiming !== slot) buttons[aiming].classList.remove('is-aim');
      aiming = slot;
      if (slot) buttons[slot].classList.add('is-aim');
      cancelZone.classList.toggle('is-on', !!slot && showCancel);
      if (!slot || !showCancel) cancelZone.classList.remove('is-hot');
    },
    setCancelHot(on) {
      cancelZone.classList.toggle('is-hot', on);
    },
    update(c) {
      const me = c.me;
      setDead(!me.alive);
      let hardCc = false;
      let silenced = false;
      let recalling = false;
      let healing = false;
      for (const b of me.buffs) {
        if (b.id === 'stun' || b.id === 'airborne') hardCc = true;
        else if (b.id === 'silence') silenced = true;
        else if (b.id === 'recall') recalling = true;
        else if (b.id === 'restore') healing = true;
      }
      setAtkForbid(me.alive && hardCc);
      setRecalling(recalling);
      setHealing(healing);
      for (const slot of SKILL_SLOTS) {
        const v = views[slot];
        const sk = me.skills[slot];
        const onCd = sk.cd > 0.03;
        const locked = sk.level <= 0;
        v.setOnCd(onCd);
        if (onCd) {
          v.setCd(sk.cdMax > 0 ? clamp01(sk.cd / sk.cdMax) : 1);
          v.setSec(sk.cd >= 9.95 ? String(Math.ceil(sk.cd)) : sk.cd.toFixed(1));
        } else {
          v.setSec('');
          if (v.wasCd && me.alive) replay(v.el, 'is-ready');
        }
        v.wasCd = onCd;
        v.setLocked(locked);
        v.setNoMana(!locked && sk.cost > 0 && me.mana < sk.cost);
        v.setForbid(me.alive && !locked && (hardCc || silenced));
        if (sk.level !== v.level) {
          // 等级点：亮到当前等级；从已知等级往上升才闪（首帧同步不闪）
          for (let i = 0; i < v.pips.length; i++) v.pips[i].classList.toggle('is-on', i < sk.level);
          if (v.level >= 0 && sk.level > v.level) replay(v.el, 'is-lvup');
          v.level = sk.level;
        }
      }
    },
  };
}
