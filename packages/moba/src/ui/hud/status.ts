/**
 * 底部英雄状态栏：头像(阵亡变灰 + 复活倒计时)、等级、被动、生命/法力(数值、护盾段、千血刻度、掉血残影)、
 * 经验条、属性速览(4 项两字版：物攻或法强 / 护甲 / 魔抗 / 移速)、状态图标行(剩余时间转圈 + 层数，点按/悬停看说明)、
 * 6 格装备(点按看四层说明：名字 → 大白话 → 属性 → 被动；新到手的那一格闪一下)、金币与商店入口。
 */
import { HEROES, heroFullName } from '../../core/data/heroes';
import { ITEMS } from '../../core/data/items';
import type { Buff, BuffId, GameEvent, HeroUnit, ItemId } from '../../core/types';
import { BUFF_META, buffIcon, itemIcon, roleIcon, skillIcon, uiIcon } from '../icons';
import { ROLE_COLOR, createPortrait, escapeHtml } from '../menu/shared';
import { attachTooltip, createSlot, h, icon, injectStyle, sfCss } from '../theme';
import { classSlot, clamp01, numSlot, replay, textSlot, varSlot, type HudCtx, type HudPart } from './common';
import { itemTipHtml } from './itemtip';
import { passiveTipHtml } from './skills';
import { buffDesc } from './text';

const CSS = sfCss(`
.sf-hud { --hud-lift: 0px; }
.sf-hud__status {
  --w: 458u;
  position: absolute; bottom: 0; z-index: 3; left: min(50%, calc(100% - var(--hud-cw) - var(--w) / 2 - 6u)); transform: translateX(-50%);
  display: flex; align-items: flex-end; gap: 8u; width: var(--w); padding: 7u 10u max(6u, var(--sf-safe-b)); border-radius: 12u 12u 0 0;
  background: var(--hud-plate); box-shadow: 0 -4u 16u rgba(2, 4, 12, 0.5), inset 0 1px 0 rgba(143, 233, 255, 0.12);
}
/* 上沿的金色星轨线：中间亮，向两侧渐隐 */
.sf-hud__status::before { content: ''; position: absolute; left: 10u; right: 10u; top: 0; height: 1.5px; pointer-events: none; background: linear-gradient(90deg, rgba(255, 231, 173, 0), rgba(255, 231, 173, 0.95) 18%, rgba(224, 177, 96, 0.35) 50%, rgba(255, 231, 173, 0.95) 82%, rgba(255, 231, 173, 0)); }
.sf-hud__status.is-dead .sf-hud__st-bars, .sf-hud__status.is-dead .sf-hud__st-items { filter: saturate(0.25) brightness(0.8); }

/* ── 头像 ── */
.sf-hud__st-por { position: relative; flex: none; width: 62u; height: 62u; margin: -18u 2u 2u 2u; }
.sf-hud__st-por > .sf-portrait { width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 0 0 max(2px, 2.5u) #0a1128, 0 0 0 max(3.5px, 4.5u) var(--sf-c-gold-400), 0 0 14u rgba(255, 214, 130, 0.35), 0 4u 10u rgba(0, 0, 0, 0.6); transition: filter 0.4s linear; }
.sf-hud__status.is-dead .sf-hud__st-por > .sf-portrait { filter: grayscale(1) brightness(0.55); }
.sf-hud__st-respawn { position: absolute; inset: 0; display: none; place-items: center; font-size: max(20px, 27u); font-weight: 800; color: #fff; text-shadow: 0 1px 3px #000, 0 0 12u rgba(255, 93, 93, 0.9); }
.sf-hud__status.is-dead .sf-hud__st-respawn { display: grid; }
.sf-hud__st-lv {
  position: absolute; right: -5u; bottom: -3u; display: grid; place-items: center; min-width: max(20px, 23u); height: max(20px, 23u); padding: 0 3u; border-radius: 50%;
  font-size: max(11px, 13u); font-weight: 800; line-height: 1; color: #2b1a04; background: var(--sf-grad-gold); box-shadow: 0 0 0 max(1.5px, 2u) #0a1128, 0 2u 5u rgba(0, 0, 0, 0.6);
}
.sf-hud__st-lv.is-up { animation: sf-hud-lvup 0.9s var(--sf-ease-out); }
@keyframes sf-hud-lvup { 0% { transform: scale(2.2); box-shadow: 0 0 0 2px #0a1128, 0 0 0 0 rgba(255, 244, 214, 0.95); } 60% { transform: scale(0.94); } 100% { transform: none; box-shadow: 0 0 0 2px #0a1128, 0 0 0 22u rgba(255, 244, 214, 0); } }
.sf-hud__st-passive { --sf-slot: max(22px, 25u); position: absolute; left: -6u; bottom: -4u; }
/* 名签：压在头像上沿正中，职业图标(职业色) + 名字 */
.sf-hud__st-name {
  position: absolute; left: 50%; top: -9u; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 2u; height: max(15px, 16u); padding: 0 6u 0 4u; border-radius: 99px; pointer-events: none;
  font-size: max(10px, 11u); font-weight: 800; line-height: 1; letter-spacing: 0.06em; white-space: nowrap; color: var(--sf-c-text);
  background: rgba(6, 10, 24, 0.9); box-shadow: 0 0 0 1px var(--sf-c-gold-line), 0 1px 3px rgba(0, 0, 0, 0.6);
}
.sf-hud__st-name .sf-i { width: 1.15em; height: 1.15em; vertical-align: 0; color: var(--role, var(--sf-c-gold-300)); }

/* ── 生命 / 法力 / 经验 ── */
.sf-hud__st-bars { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3u; }
.sf-hud__st-stats { display: flex; align-items: baseline; justify-content: space-between; gap: 4u; height: max(13px, 14u); padding: 0 2u; font-size: max(10px, 11u); line-height: 1; color: var(--sf-c-text-3); white-space: nowrap; cursor: default; }
.sf-hud__st-stats b { margin-left: 2u; font-weight: 700; color: var(--sf-c-text); }
.sf-hud__bar { --p: 1; --s: 0; --seg: 100%; position: relative; height: 20u; border-radius: 4u; overflow: hidden; background: rgba(3, 6, 16, 0.82); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.3); }
.sf-hud__bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; }
.sf-hud__bar-trail { background: linear-gradient(180deg, #ffd9c9, #ff7a5c); transform: scaleX(var(--p)); transition: transform 0.55s cubic-bezier(0.3, 0, 0.2, 1) 0.2s; }
.sf-hud__bar-fill { transform: scaleX(var(--p)); transition: transform 0.12s linear; }
.is-hp > .sf-hud__bar-fill { background: linear-gradient(180deg, #a6f7c0 0%, #4fd98a 38%, #1f9d58 100%); }
.is-hp.is-mid > .sf-hud__bar-fill { background: linear-gradient(180deg, #ffe7a6 0%, #f3bb48 38%, #c07e16 100%); }
.is-hp.is-low > .sf-hud__bar-fill { background: linear-gradient(180deg, #ffb8a8 0%, #f0584f 38%, #a8222d 100%); }
.is-mp > .sf-hud__bar-fill { background: linear-gradient(180deg, #a9d6ff 0%, #4da3ff 40%, #1e5fc4 100%); }
.sf-hud__bar-shield { transform: translateX(calc(var(--p) * 100%)) scaleX(var(--s)); background: linear-gradient(180deg, #ffffff, #cfe2ff); transition: transform 0.12s linear; }
/* 每 1000 生命一道刻度：血厚的英雄一眼能看出来 */
.sf-hud__bar-ticks { background: repeating-linear-gradient(90deg, rgba(3, 6, 16, 0) 0, rgba(3, 6, 16, 0) calc(var(--seg) - 1px), rgba(3, 6, 16, 0.6) calc(var(--seg) - 1px), rgba(3, 6, 16, 0.6) var(--seg)); }
.sf-hud__bar-gloss { background: linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 48%, rgba(0, 0, 0, 0.16)); }
.sf-hud__bar-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5u; font-size: max(11px, 12.5u); font-weight: 800; line-height: 1; color: #fff; text-shadow: 0 1px 1px rgba(2, 4, 12, 0.95), 0 0 4u rgba(2, 4, 12, 0.9); white-space: nowrap; }
.sf-hud__bar-text em { font-style: normal; color: #dff0ff; }
.sf-hud__bar-text em:empty { display: none; }
.sf-hud__bar.is-mp { height: 13u; }
.sf-hud__bar.is-mp .sf-hud__bar-text { font-size: max(10px, 10.5u); }
.sf-hud__xp { --p: 0; position: relative; height: max(3px, 4u); border-radius: 2u; overflow: hidden; background: rgba(3, 6, 16, 0.82); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.22); }
.sf-hud__xp > i { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(var(--p)); transition: transform 0.3s var(--sf-ease-out); background: linear-gradient(90deg, #c08c3c, #ffe7ad); box-shadow: 0 0 6u rgba(255, 214, 130, 0.8); }

/* ── 装备 ── */
.sf-hud__st-items { flex: none; display: grid; grid-template-columns: repeat(3, auto); gap: 3u; }
.sf-hud__st-items .sf-slot { --sf-slot: 27u; border-radius: 5u; box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(1.5px, 2u) rgba(224, 177, 96, 0.5); }
.sf-hud__st-items .sf-slot--empty { box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
/* 新到手的装备(手动买的、自动出装买的都算)：那一格亮一下再落定 */
.sf-hud__st-items .sf-slot.is-new { animation: sf-hud-item-new 1.1s var(--sf-ease-out); }
@keyframes sf-hud-item-new {
  0% { transform: scale(1.5); filter: brightness(2.4); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(2px, 2.5u) #fff4d6, 0 0 0 0 rgba(255, 231, 173, 0.9); }
  35% { transform: scale(0.94); filter: brightness(1.5); }
  100% { transform: none; filter: none; box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(1.5px, 2u) rgba(224, 177, 96, 0.5), 0 0 0 16u rgba(255, 231, 173, 0); }
}

/* ── 金币 + 商店入口（与小地图下方的商店按钮是同一个入口，放在装备旁边顺手） ── */
.sf-hud__st-shop {
  flex: none; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4u; width: 46u; padding: 0; margin: 0; border: 0; border-radius: 6u; cursor: pointer;
  color: var(--sf-c-gold-200); background: linear-gradient(180deg, rgba(74, 54, 14, 0.7), rgba(22, 16, 6, 0.8)); box-shadow: inset 0 0 0 1px rgba(243, 207, 133, 0.55), inset 0 1px 0 1px rgba(255, 244, 214, 0.12);
  transition: transform 0.1s var(--sf-ease-out), filter 0.12s linear;
}
@media (hover: hover) { .sf-hud__st-shop:hover { filter: brightness(1.25); } }
.sf-hud__st-shop:active { transform: scale(0.95); }
.sf-hud__st-shop-ico { display: grid; place-items: center; width: 24u; height: 24u; border-radius: 50%; color: #2b1a04; background: var(--sf-grad-gold); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 0 1px #6b4614; }
.sf-hud__st-shop-ico > .sf-i { width: 64%; height: 64%; }
.sf-hud__st-shop-gold { font-size: max(11px, 12.5u); font-weight: 800; line-height: 1; }
/* 窄横屏放不下：收起这个入口，状态栏变窄（左侧的商店按钮还在） */
@media (orientation: landscape) and (max-width: 760px) {
  .sf-hud__status { --w: 404u; }
  .sf-hud__st-shop { display: none; }
}

/* ── 状态图标行 ── */
.sf-hud__buffs { position: absolute; left: 80u; right: 6u; bottom: calc(100% + 5u); display: flex; flex-wrap: wrap-reverse; gap: 4u; pointer-events: none; }
.sf-hud__buff {
  --t: 1; position: relative; flex: none; width: max(22px, 25u); height: max(22px, 25u); border-radius: 5u; overflow: hidden; pointer-events: auto;
  box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(1.5px, 2u) rgba(111, 227, 161, 0.75), 0 2u 6u rgba(0, 0, 0, 0.5);
  animation: sf-hud-buff-in 0.22s var(--sf-ease-spring) both;
}
.sf-hud__buff.is-debuff { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(1.5px, 2u) rgba(255, 93, 93, 0.9), 0 2u 6u rgba(0, 0, 0, 0.5); }
.sf-hud__buff.is-neutral { box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.95), 0 0 0 max(1.5px, 2u) rgba(143, 233, 255, 0.75), 0 2u 6u rgba(0, 0, 0, 0.5); }
.sf-hud__buff > svg { display: block; width: 100%; height: 100%; }
/* 已流逝的部分盖上暗色扇形：从 12 点方向顺时针扩大 */
.sf-hud__buff-cd { position: absolute; inset: -30%; background: conic-gradient(rgba(3, 6, 16, 0.72) calc((1 - var(--t)) * 360deg), rgba(3, 6, 16, 0) 0); pointer-events: none; }
.sf-hud__buff-n { position: absolute; right: 1px; bottom: 0; font-size: max(10px, 11u); font-weight: 800; line-height: 1.05; color: #fff; text-shadow: 0 0 2px #000, 0 1px 1px #000, 0 0 3px #000; }
@keyframes sf-hud-buff-in { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }

/* 竖屏：铺满底边的一条；技能区与摇杆整体上移让位 */
@media (orientation: portrait) {
  .sf-hud { --hud-lift: max(58px, 68u); }
  .sf-hud__status { left: 0; right: 0; width: auto; transform: none; border-radius: 0; padding-left: max(10u, var(--sf-safe-l)); padding-right: max(10u, var(--sf-safe-r)); align-items: center; }
  .sf-hud__st-por { width: 48u; height: 48u; margin: -12u 3u 3u 3u; }
  .sf-hud__st-stats { display: none; }
  .sf-hud__st-shop { display: none; }
  .sf-hud__st-items { grid-template-columns: repeat(6, auto); }
  .sf-hud__st-items .sf-slot { --sf-slot: 28u; }
  .sf-hud__st-passive { --sf-slot: max(20px, 22u); left: -7u; top: -9u; bottom: auto; }
  .sf-hud__st-lv { right: -7u; }
  .sf-hud__st-name { top: auto; bottom: -7u; height: max(14px, 15u); padding: 0 5u 0 3u; font-size: max(9px, 10u); }
  /* 状态图标只排到技能区左缘为止，多了向上换行 */
  .sf-hud__buffs { left: 68u; right: calc(var(--hud-sk) * 2.9 + var(--hud-r)); }
}
`);

/** 冷却缩减的上限(与 core/stats.ts 的 MAX_CDR 同值；那边没有导出，这里只用于说明文字) */
const CDR_CAP = 0.4;

const BUFF_ORDER: BuffId[] = Object.keys(BUFF_META) as BuffId[];
const BUFF_RANK = new Map<BuffId, number>(BUFF_ORDER.map((id, i) => [id, i]));
const MAX_BUFFS = 10;

interface BuffView {
  el: HTMLElement;
  setT: (v: number) => void;
  setN: (s: string) => void;
  off: () => void;
}

export interface StatusBar extends HudPart {
  el: HTMLElement;
}

export function createStatusBar(ctx: HudCtx): StatusBar {
  injectStyle('sf-hud-status', CSS);
  const { host } = ctx;
  const heroId = ctx.me.heroId;
  const def = HEROES[heroId];
  const disposers: (() => void)[] = [];

  // ── 头像 ──
  const respawn = h('span', 'sf-hud__st-respawn sf-num');
  const lv = h('span', 'sf-hud__st-lv sf-num', '1');
  const passive = createSlot(skillIcon(heroId, 'passive'), { round: true, cls: 'sf-hud__st-passive', label: `被动：${def.passive.name}` });
  passive.setAttribute('data-hud-hit', '');
  disposers.push(
    // 与技能浮层同一套层次：「被动」+ 类型标签 → 一句大白话 → 带数值的完整描述
    attachTooltip(passive, () => passiveTipHtml(def)),
  );
  // 头像上沿的小名签：职业图标 + 名字(全称写在无障碍标签里；属性浮层的标题也用全称)
  const nameTag = h('span', 'sf-hud__st-name', icon(roleIcon(def.role)), def.name);
  nameTag.style.setProperty('--role', ROLE_COLOR[def.role]);
  nameTag.setAttribute('aria-label', heroFullName(def));
  const por = h('div', 'sf-hud__st-por', createPortrait(host, heroId), respawn, nameTag, lv, passive);

  // ── 条 ──
  const hpNow = h('span', 'sf-num');
  const hpShield = h('em', 'sf-num');
  const hpMax = h('span', 'sf-num');
  const hpBar = h(
    'div',
    'sf-hud__bar is-hp',
    h('i', 'sf-hud__bar-trail'),
    h('i', 'sf-hud__bar-fill'),
    h('i', 'sf-hud__bar-shield'),
    h('i', 'sf-hud__bar-ticks'),
    h('i', 'sf-hud__bar-gloss'),
    h('span', 'sf-hud__bar-text', hpNow, hpShield, hpMax),
  );
  const mpText = h('span', 'sf-hud__bar-text sf-num');
  const mpBar = h('div', 'sf-hud__bar is-mp', h('i', 'sf-hud__bar-fill'), h('i', 'sf-hud__bar-gloss'), mpText);
  const xp = h('div', 'sf-hud__xp', h('i'));
  xp.setAttribute('data-hud-hit', '');
  disposers.push(
    attachTooltip(xp, () => {
      const me = ctx.me;
      return me.xpToNext > 0
        ? `<div class="sf-tip__title"><span>等级 ${me.level}</span><span class="sf-tip__meta sf-num">${Math.floor(me.xp)} / ${me.xpToNext}</span></div><div>获得经验可提升等级，技能会自动升级。</div>`
        : `<div class="sf-tip__title"><span>等级 ${me.level}</span><span class="sf-tip__meta">已满级</span></div>`;
    }),
  );

  // 属性速览：4 项两字版。主输出属性按职业取一项(法师看法强，其余看物攻)，五项两字版在状态栏里放不下
  const mainStat: [string, (m: HeroUnit) => number, (v: number) => string] =
    def.role === 'mage' ? ['法强', (m) => Math.round(m.stats.ap), String] : ['物攻', (m) => Math.round(m.stats.ad), String];
  const statDefs: [string, (m: HeroUnit) => number, (v: number) => string][] = [
    mainStat,
    ['护甲', (m) => Math.round(m.stats.armor), String],
    ['魔抗', (m) => Math.round(m.stats.mr), String],
    ['移速', (m) => Math.round(m.stats.moveSpeed * 10) / 10, (v) => v.toFixed(1)],
  ];
  const stats = h('div', 'sf-hud__st-stats');
  stats.setAttribute('data-hud-hit', '');
  const statSetters = statDefs.map(([label, , fmt]) => {
    const b = h('b', 'sf-num');
    stats.appendChild(h('span', null, label, b));
    return numSlot(b, fmt);
  });
  disposers.push(
    attachTooltip(stats, () => {
      const s = ctx.me.stats;
      const pc = (v: number): string => `${Math.round(v * 100)}%`;
      // 叫法与商店、装备说明同一套(见 text.ts 的 STAT_LABELS)
      const rows: [string, string][] = [
        ['物攻', String(Math.round(s.ad))], ['法强', String(Math.round(s.ap))],
        ['护甲', String(Math.round(s.armor))], ['魔抗', String(Math.round(s.mr))],
        ['攻速', s.attackSpeed.toFixed(2)], ['移速', s.moveSpeed.toFixed(1)],
        ['冷却缩减', pc(s.cdr)], ['吸血', pc(s.lifesteal)],
        ['暴击', pc(s.critChance)], ['暴击伤害', pc(s.critDamage)],
        ['物穿', pc(s.armorPen)], ['法穿', pc(s.magicPen)],
        ['回血', `${s.hpRegen.toFixed(1)}/秒`], ['回蓝', `${s.manaRegen.toFixed(1)}/秒`],
        ['射程', s.attackRange.toFixed(1)], ['', ''],
      ];
      return (
        `<div class="sf-tip__title"><span>${escapeHtml(heroFullName(def))}</span><span class="sf-tip__meta">属性</span></div>` +
        `<div style="display:grid;grid-template-columns:auto auto auto auto;gap:1px 10px;margin-top:4px">${rows
          .map(([k, v]) => `<span style="color:var(--sf-c-text-3)">${k}</span><b class="sf-num" style="color:var(--sf-c-text);text-align:right">${v}</b>`)
          .join('')}</div>` +
        `<div style="margin-top:5px;font-size:var(--sf-fs-xs);color:var(--sf-c-text-3)">冷却缩减上限 ${pc(CDR_CAP)}；吸血只对普攻生效。</div>`
      );
    }),
  );
  const bars = h('div', 'sf-hud__st-bars', stats, hpBar, mpBar, xp);

  // ── 装备 ──
  const itemsBox = h('div', 'sf-hud__st-items');
  const itemSlots: { el: HTMLElement; id: ItemId | null; off: (() => void) | null }[] = [];
  for (let i = 0; i < ctx.me.items.length; i++) {
    const el = createSlot(null);
    el.setAttribute('data-hud-hit', '');
    itemsBox.appendChild(el);
    itemSlots.push({ el, id: null, off: null });
  }

  // ── 金币 + 商店入口 ──
  const goldN = h('span', 'sf-hud__st-shop-gold sf-num', '0');
  const shopTile = h('button', 'sf-hud__st-shop', h('span', 'sf-hud__st-shop-ico', icon(uiIcon('shop'))), goldN);
  shopTile.type = 'button';
  shopTile.tabIndex = -1;
  shopTile.dataset.sfSnd = 'click';
  shopTile.setAttribute('aria-label', '金币 / 打开商店');
  shopTile.addEventListener('click', () => ctx.actions.toggleShop());
  const setGold = numSlot(goldN);

  // ── 状态 ──
  const buffsBox = h('div', 'sf-hud__buffs');
  const buffViews = new Map<BuffId, BuffView>();
  const shown: Buff[] = [];

  const el = h('div', 'sf-hud__status', buffsBox, por, bars, itemsBox, shopTile);
  el.setAttribute('data-hud-hit', '');

  const setHpP = varSlot(hpBar, '--p');
  const setHpS = varSlot(hpBar, '--s');
  const setMpP = varSlot(mpBar, '--p');
  const setXpP = varSlot(xp, '--p', 0.005);
  const setHpNow = numSlot(hpNow);
  const setHpMax = numSlot(hpMax, (n) => `/ ${n}`);
  const setShield = numSlot(hpShield, (n) => (n > 0 ? `+${n}` : ''));
  const setMp = textSlot(mpText);
  const setLv = numSlot(lv);
  const setRespawn = numSlot(respawn);
  const setDead = classSlot(el, 'is-dead');
  const setMid = classSlot(hpBar, 'is-mid');
  const setLow = classSlot(hpBar, 'is-low');
  let lastMaxHp = -1;
  let lastMp = -1;
  let lastMaxMp = -1;

  /** 第一次同步是把开局已有的装备摆上去，不算「新到手」 */
  let itemsSynced = false;
  function syncItems(me: HeroUnit): void {
    for (let i = 0; i < itemSlots.length; i++) {
      const slot = itemSlots[i];
      const id = me.items[i] ?? null;
      if (id === slot.id) continue;
      slot.id = id;
      slot.off?.();
      slot.off = null;
      slot.el.classList.toggle('sf-slot--empty', id === null);
      slot.el.innerHTML = id ? itemIcon(id) : '';
      if (id) {
        slot.el.setAttribute('aria-label', ITEMS[id].name);
        slot.off = attachTooltip(slot.el, () => itemTipHtml(ITEMS[id]));
        // 新装备进了这一格(含原地换鞋)：闪一下，自动出装买的东西也能被注意到
        if (itemsSynced) replay(slot.el, 'is-new');
      } else {
        slot.el.removeAttribute('aria-label');
        slot.el.classList.remove('is-new');
      }
    }
    itemsSynced = true;
  }

  function buffTip(id: BuffId): string {
    const b = ctx.me.buffs.find((x) => x.id === id);
    const meta = BUFF_META[id];
    const left = b && Number.isFinite(b.timeLeft) ? `${b.timeLeft >= 10 ? Math.ceil(b.timeLeft) : b.timeLeft.toFixed(1)} 秒` : '持续';
    const stacks = b && b.stacks > 1 ? ` ×${b.stacks}` : '';
    return `<div class="sf-tip__title"><span>${escapeHtml(meta.name)}${stacks}</span><span class="sf-tip__meta sf-num">${left}</span></div><div>${b ? escapeHtml(buffDesc(b)) : ''}</div>`;
  }

  function syncBuffs(me: HeroUnit): void {
    // 同 id 多层合并显示：层数取最大、时间取最长
    shown.length = 0;
    for (const b of me.buffs) {
      let merged = false;
      for (let i = 0; i < shown.length; i++) {
        if (shown[i].id === b.id) {
          if (b.timeLeft > shown[i].timeLeft) shown[i] = b;
          merged = true;
          break;
        }
      }
      if (!merged) shown.push(b);
    }
    if (shown.length > 1) shown.sort((a, b) => (BUFF_RANK.get(a.id) ?? 0) - (BUFF_RANK.get(b.id) ?? 0));
    if (shown.length > MAX_BUFFS) shown.length = MAX_BUFFS;

    // 先删已消失的
    if (buffViews.size > 0) {
      for (const [id, v] of buffViews) {
        let alive = false;
        for (const b of shown) if (b.id === id) alive = true;
        if (!alive) {
          v.off();
          v.el.remove();
          buffViews.delete(id);
        }
      }
    }
    for (let i = 0; i < shown.length; i++) {
      const b = shown[i];
      let v = buffViews.get(b.id);
      if (!v) {
        const meta = BUFF_META[b.id];
        const cd = h('i', 'sf-hud__buff-cd');
        const n = h('b', 'sf-hud__buff-n sf-num');
        const bEl = h('span', `sf-hud__buff is-${meta.kind}`);
        bEl.innerHTML = buffIcon(b.id);
        bEl.append(cd, n);
        bEl.setAttribute('aria-label', meta.name);
        const id = b.id;
        v = { el: bEl, setT: varSlot(bEl, '--t', 1 / 90), setN: textSlot(n), off: attachTooltip(bEl, () => buffTip(id)) };
        buffViews.set(b.id, v);
        // 按固定次序插入，图标不会因为刷新而来回跳
        const next = buffsBox.children[i] ?? null;
        buffsBox.insertBefore(bEl, next);
      }
      v.setT(Number.isFinite(b.timeLeft) && b.duration > 0 && Number.isFinite(b.duration) ? clamp01(b.timeLeft / b.duration) : 1);
      v.setN(b.stacks > 1 ? String(b.stacks) : '');
    }
  }

  return {
    el,
    update(c) {
      const me = c.me;
      const st = me.stats;
      const shield = Math.max(0, me.shield);
      const denom = Math.max(1, st.maxHp, me.hp + shield);
      const hp = me.alive ? Math.max(0, me.hp) : 0;
      setHpP(hp / denom);
      setHpS(shield / denom);
      setHpNow(Math.ceil(hp));
      setHpMax(Math.round(st.maxHp));
      setShield(Math.round(shield));
      const ratio = hp / Math.max(1, st.maxHp);
      setLow(ratio < 0.25);
      setMid(ratio >= 0.25 && ratio < 0.5);
      const mh = Math.round(denom);
      if (mh !== lastMaxHp) {
        lastMaxHp = mh;
        hpBar.style.setProperty('--seg', `${((1000 / denom) * 100).toFixed(3)}%`);
      }
      const maxMp = Math.round(st.maxMana);
      const mp = Math.floor(Math.max(0, me.mana));
      setMpP(maxMp > 0 ? mp / maxMp : 0);
      if (mp !== lastMp || maxMp !== lastMaxMp) {
        lastMp = mp;
        lastMaxMp = maxMp;
        setMp(`${mp} / ${maxMp}`);
      }
      setXpP(me.xpToNext > 0 ? clamp01(me.xp / me.xpToNext) : 1);
      setLv(me.level);
      setGold(Math.floor(me.gold));
      setDead(!me.alive);
      if (!me.alive) setRespawn(Math.ceil(me.respawnIn));
      for (let i = 0; i < statDefs.length; i++) statSetters[i](statDefs[i][1](me));
      syncItems(me);
      syncBuffs(me);
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type === 'levelUp' && ev.unitId === c.state.playerId) replay(lv, 'is-up');
    },
    dispose() {
      for (const off of disposers) off();
      for (const s of itemSlots) s.off?.();
      for (const v of buffViews.values()) v.off();
      buffViews.clear();
    },
  };
}
