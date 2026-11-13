/**
 * 商店：小地图下方的商店按钮 + 快捷购买气泡 / 自动出装提示条 + 商店面板。
 *
 * 面板(每次打开都回到「推荐」页)：
 *   顶部   页签(推荐 / 攻击 / 法术 / 防御 / 鞋) + 自动出装开关(显示本局实际状态，下面一行小字说明) + 金币
 *   推荐页 这名英雄的 6 张推荐卡(= 6 个装备格；鞋是一张卡、两个阶段)，标出「下一件」
 *   详情   默认就是「下一件」：名字 → 一句大白话 → 属性 → 被动，攒钱进度条，一键购买(键鼠按回车)
 *   底部   我的装备(点选后可出售)
 * 卡片固定四层信息里的前两层(名字、大白话)；属性与被动只在详情与提示浮层里。
 *
 * 商店外：自动出装关着时，金币够了弹「推荐 · 可购买」气泡(一点即买)；开着时不弹气泡，
 * 商店按钮外圈画攒钱进度环，自动买到手时在同一位置出一条不可点的提示条「已自动购买 ××」。
 * 面板开着时小地图下方那个位置被面板挡住：提示条改停在面板上沿的正上方(那里放不下时不显示，面板顶部的小字与卡片标签照常提示)。
 *
 * 「下一件 / 实际花费 / 六张卡」全部取自 core/build.ts(经 rules.ts)，与模拟层的自动出装、Bot 同源。
 * 商店不暂停对局（随时随地可买），所以面板打开时仍在刷新可购买状态。
 */
import { heroFullName } from '../../core/data/heroes';
import { ITEMS, ITEM_LIST, SELL_RATIO } from '../../core/data/items';
import type { GameEvent, HeroUnit, ItemDef, ItemId } from '../../core/types';
import { itemIcon, uiIcon } from '../icons';
import { createButton, createIconButton, createSlot, createTabs, createToggle, h, hasOpenDialog, icon, injectStyle, sfCss } from '../theme';
import { classSlot, clamp01, numSlot, replay, textSlot, varSlot, type HudCtx, type HudPart } from './common';
import { BLOCK_TEXT, buildCards, buildStatus, checkBuy, isBuildItem, nextRecommended, ownedBoots, savingProgress, sellValue, type BuildCard } from './rules';
import { CATEGORY_NAMES, statLines, statSummary, type ShopTab } from './text';

/** 手机上的紧凑卡片(矮横屏与竖屏共用)：图标在左，右边两行(名字 / 价格 + 状态)；竖屏不放大白话，矮横屏另加一行 */
const CARD_COMPACT = `
  .sf-hud__shop-grid { flex: none; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: none; grid-auto-rows: auto; gap: 6u; }
  .sf-hud__card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: auto auto; align-items: center; gap: 3u 8u; min-height: max(50px, 56u); padding: 5u 8u 5u 9u; }
  .sf-hud__card-top { grid-column: 1; grid-row: 1 / span 2; position: relative; margin: 0; gap: 0; }
  .sf-hud__card .sf-slot { --sf-slot: max(36px, 42u); }
  .sf-hud__card-no { position: absolute; left: -6px; top: -5px; z-index: 1; width: 16px; height: 16px; font-size: 10px; }
  .sf-hud__card-dots { position: absolute; left: 50%; bottom: -5px; z-index: 1; transform: translateX(-50%); padding: 2px 4px; border-radius: 99px; background: rgba(4, 8, 22, 0.92); }
  .sf-hud__card-name { grid-column: 2 / span 2; grid-row: 1; font-size: var(--sf-fs-sm); letter-spacing: 0; }
  .sf-hud__card-brief { display: none; }
  .sf-hud__card-price { grid-column: 2; grid-row: 2; margin: 0; padding: 0; font-size: var(--sf-fs-sm); }
  .sf-hud__card-tag { position: static; grid-column: 3; grid-row: 2; justify-self: end; }
  .sf-hud__card.is-done .sf-hud__card-tag { grid-column: 2 / span 2; justify-self: start; }
  .sf-hud__card-tag-more { display: none; }
  .sf-hud__dt-brief { font-size: var(--sf-fs-sm); }
  .sf-hud__dt-stats { flex-direction: row; flex-wrap: wrap; gap: 2u 14u; margin-top: 5u; padding-top: 5u; }
  .sf-hud__dt-stat { justify-content: flex-start; gap: 5u; }
  .sf-hud__dt-nopassive { display: none; }
  .sf-hud__dt-passive { margin-top: 5u; padding: 5u 8u; font-size: var(--sf-fs-xs); line-height: 1.45; }
`;

const CSS = sfCss(`
/* ── 商店按钮 + 快捷购买气泡 / 自动出装提示条（小地图下方） ── */
.sf-hud__shopbar { position: absolute; left: calc(var(--hud-l) + 4u); top: calc(var(--hud-t) + var(--hud-mini) + 12u); z-index: 3; display: flex; align-items: center; gap: 14u; }
/* 商店按钮：金色圆钮。金币数在右上角与状态栏里已经有了，这里不再重复 */
.sf-hud__shopbtn {
  --p: 0; position: relative; display: grid; place-items: center; flex: none; width: max(40px, 46u); height: max(40px, 46u); padding: 0; margin: 0; border: 0; border-radius: 50%; cursor: pointer;
  color: #2b1a04; background: var(--sf-grad-gold);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 0 0 1px #6b4614, 0 0 0 max(3px, 4u) rgba(8, 13, 31, 0.82), 0 0 0 max(4px, 5u) rgba(232, 199, 122, 0.55), 0 4u 12u rgba(2, 4, 12, 0.5);
  transition: transform 0.1s var(--sf-ease-out), filter 0.12s linear;
}
@media (hover: hover) { .sf-hud__shopbtn:hover { filter: brightness(1.12); } }
.sf-hud__shopbtn:active { transform: scale(0.93); }
.sf-hud__shopbtn > .sf-i { width: 58%; height: 58%; }
.sf-hud__shopbtn .sf-hud__key { right: -6u; top: -6u; }
.sf-hud__shopbtn.is-open { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 0 0 1px #6b4614, 0 0 0 max(3px, 4u) rgba(8, 13, 31, 0.82), 0 0 0 max(4px, 5u) #fff4d6, 0 0 16u rgba(255, 214, 130, 0.8); }
/* 自动出装关着、有推荐装备可买时：按钮外圈跟着呼吸 */
.sf-hud__shopbtn.is-ready::after { content: ''; position: absolute; inset: -7u; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1.5px rgba(255, 231, 173, 0.85); animation: sf-hud-quick-pulse 1.4s ease-out infinite; }
/* 自动出装开着：外圈画攒钱进度环(当前金币 / 下一件的花费)，快满了就知道要自动买了 */
.sf-hud__shopbtn.is-saving::before {
  content: ''; position: absolute; inset: calc(-1 * max(6px, 7.5u)); border-radius: 50%; pointer-events: none;
  background: conic-gradient(#ffe7ad calc(var(--p) * 360deg), rgba(150, 178, 235, 0.3) 0);
  -webkit-mask: radial-gradient(farthest-side, rgba(0, 0, 0, 0) calc(100% - max(3px, 3.5u)), #000 calc(100% - max(3px, 3.5u) + 0.6px));
  mask: radial-gradient(farthest-side, rgba(0, 0, 0, 0) calc(100% - max(3px, 3.5u)), #000 calc(100% - max(3px, 3.5u) + 0.6px));
  filter: drop-shadow(0 0 3u rgba(2, 4, 12, 0.8));
}

.sf-hud__quick {
  position: relative; display: none; align-items: center; gap: 7u; height: max(40px, 46u); padding: 0 12u 0 4u; margin: 0; border: 0; border-radius: 9u; cursor: pointer;
  background: linear-gradient(180deg, rgba(64, 48, 14, 0.94), rgba(22, 16, 6, 0.95)); color: var(--sf-c-gold-100); text-align: left;
  box-shadow: inset 0 0 0 1px #f3cf85, 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 16u rgba(255, 214, 130, 0.55), 0 4u 12u rgba(2, 4, 12, 0.5);
  animation: sf-hud-quick-in 0.35s var(--sf-ease-spring) both;
}
.sf-hud__quick.is-on { display: inline-flex; }
.sf-hud__quick:active { transform: scale(0.95); }
.sf-hud__quick::before { content: ''; position: absolute; inset: -3u; border-radius: 12u; pointer-events: none; box-shadow: 0 0 0 1.5px rgba(255, 231, 173, 0.8); animation: sf-hud-quick-pulse 1.4s ease-out infinite; }
.sf-hud__quick .sf-slot, .sf-hud__autobuy .sf-slot { --sf-slot: max(32px, 38u); border-radius: 7u; }
.sf-hud__quick-text { display: flex; flex-direction: column; gap: 2u; }
.sf-hud__quick-tag, .sf-hud__autobuy-tag { font-size: max(10px, 11u); font-weight: 800; letter-spacing: 0.08em; color: #2b1a04; background: var(--sf-grad-gold); border-radius: 3u; padding: 0 5u; align-self: flex-start; line-height: 1.5; white-space: nowrap; }
.sf-hud__quick-price { display: inline-flex; align-items: center; gap: 3u; font-size: var(--sf-fs-sm); font-weight: 800; line-height: 1; white-space: nowrap; }
.sf-hud__quick-price .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__quick-name { margin-right: 2u; }
@keyframes sf-hud-quick-in { from { opacity: 0; transform: translateX(-16u) scale(0.8); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-quick-pulse { 0% { opacity: 0.9; transform: scale(0.96); } 100% { opacity: 0; transform: scale(1.12); } }

/* 自动出装提示条：沿用气泡的金色底板与位置，但不可点、没有呼吸光圈，停一会儿自己淡出 */
.sf-hud__autobuy {
  position: relative; display: none; align-items: center; gap: 7u; height: max(40px, 46u); padding: 0 13u 0 4u; border-radius: 9u; pointer-events: none;
  background: linear-gradient(180deg, rgba(64, 48, 14, 0.94), rgba(22, 16, 6, 0.95)); color: var(--sf-c-gold-100);
  box-shadow: inset 0 0 0 1px rgba(243, 207, 133, 0.7), 0 0 0 1px rgba(8, 13, 31, 0.9), 0 4u 12u rgba(2, 4, 12, 0.5);
}
.sf-hud__autobuy.is-on { display: inline-flex; animation: sf-hud-quick-in 0.35s var(--sf-ease-spring) both; }
.sf-hud__autobuy.is-on.is-out { animation: sf-hud-autobuy-out 0.3s linear both; }
.sf-hud__autobuy-ico { display: grid; place-items: center; flex: none; width: max(32px, 38u); height: max(32px, 38u); border-radius: 7u; color: var(--sf-c-gold-200); background: rgba(255, 214, 130, 0.1); box-shadow: inset 0 0 0 1px rgba(243, 207, 133, 0.4); }
.sf-hud__autobuy-ico > .sf-i { width: 60%; height: 60%; }
.sf-hud__autobuy-text { display: flex; flex-direction: column; gap: 3u; }
.sf-hud__autobuy-name { font-size: var(--sf-fs-sm); font-weight: 800; line-height: 1.1; white-space: nowrap; }
.sf-hud__autobuy.is-warn { color: #ffe2b0; box-shadow: inset 0 0 0 1px rgba(255, 184, 77, 0.8), 0 0 0 1px rgba(8, 13, 31, 0.9), 0 4u 12u rgba(2, 4, 12, 0.5); }
.sf-hud__autobuy.is-warn .sf-hud__autobuy-tag { background: linear-gradient(180deg, #ffe0ae, #ffb454); }
.sf-hud__autobuy.is-warn .sf-hud__autobuy-ico { color: var(--sf-c-amber); background: rgba(255, 184, 77, 0.12); box-shadow: inset 0 0 0 1px rgba(255, 184, 77, 0.45); }
@keyframes sf-hud-autobuy-out { to { opacity: 0; transform: translateY(-5u); } }

/* 面板开着时提示条的停靠位：面板上沿的正上方、水平居中(top 由脚本按面板位置写入)；放不下就不显示 */
.sf-hud__shop-dock { position: absolute; left: 0; right: 0; top: 0; z-index: 1; display: flex; justify-content: center; pointer-events: none; }
.sf-hud__shop-dock.is-off { visibility: hidden; }

/* ── 商店面板 ── */
.sf-hud__shop { position: absolute; inset: 0; z-index: 7; display: none; place-items: center; pointer-events: auto;
  padding: max(10u, var(--sf-safe-t)) max(12u, var(--sf-safe-r)) max(10u, var(--sf-safe-b)) max(12u, var(--sf-safe-l)); background: rgba(3, 6, 16, 0.5); }
.sf-hud__shop.is-open { display: grid; animation: sf-fade-in 0.16s linear both; }
.sf-hud__shop-panel { display: flex; flex-direction: column; width: min(100%, 960u); height: min(100%, 540u); min-height: 0; animation: sf-pop-in 0.26s var(--sf-ease-out) both; }
.sf-hud__shop-head { display: flex; align-items: center; gap: 10u; flex: none; padding: 5u 8u 0 20u; box-shadow: inset 0 -1px 0 var(--sf-c-line-strong); }
.sf-hud__shop-title { margin: 0; font-size: var(--sf-fs-xl); font-weight: 800; letter-spacing: 0.2em; line-height: 1.2; white-space: nowrap; }
.sf-hud__shop-head .sf-tabs { flex: 1; box-shadow: none; min-width: 0; }
.sf-hud__shop-head .sf-tab { padding: 0 14u; }
.sf-hud__shop-gold { color: var(--sf-c-gold-200); font-size: var(--sf-fs-md); }
/* 自动出装开关：上行「自动出装 + 开关」，下行一句小字说明当前状态。整块都是点击热区 */
.sf-hud__shop-auto { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2u; padding: 3u 7u; margin: 0; border: 0; border-radius: 7u; background: none; cursor: pointer; }
.sf-hud__shop-auto-row { display: flex; align-items: center; gap: 8u; font-size: var(--sf-fs-sm); font-weight: 700; letter-spacing: 0.06em; color: var(--sf-c-text); white-space: nowrap; }
.sf-hud__shop-auto .sf-toggle { --sf-tg-h: max(22px, 24u); --sf-tg-w: max(40px, 44u); }
.sf-hud__shop-auto-hint { font-size: max(10px, 11u); line-height: 1.25; color: var(--sf-c-text-3); white-space: nowrap; }
.sf-hud__shop-auto.is-on .sf-hud__shop-auto-hint { color: var(--sf-c-cyan-300); }
.sf-hud__shop-auto.is-warn .sf-hud__shop-auto-hint { color: var(--sf-c-amber); }
.sf-hud__shop-auto.is-flash { animation: sf-hud-auto-flash 0.9s ease-out; }
@keyframes sf-hud-auto-flash { 0% { background: rgba(255, 214, 130, 0.4); } 100% { background: rgba(255, 214, 130, 0); } }

.sf-hud__shop-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) max(232px, 268u); }
.sf-hud__shop-list { display: flex; flex-direction: column; min-height: 0; padding: 10u 12u 12u 16u; }
.sf-hud__shop-prog { flex: none; display: flex; align-items: center; gap: 10u; min-width: 0; margin-bottom: 8u; font-size: var(--sf-fs-sm); color: var(--sf-c-text-2); white-space: nowrap; }
.sf-hud__shop-prog-who { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sf-hud__shop-prog-who > b { color: var(--sf-c-text); font-weight: 700; }
.sf-hud__shop-prog-n { flex: none; margin-left: auto; }
.sf-hud__shop-prog-n > b { color: var(--sf-c-gold-200); }
.sf-hud__shop-steps { flex: none; display: flex; align-items: center; gap: 3u; }
.sf-hud__shop-steps > i { width: 18u; height: max(4px, 5u); border-radius: 3u; background: rgba(4, 8, 22, 0.8); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-hud__shop-steps > i.is-done { background: var(--sf-grad-gold); box-shadow: 0 0 6u rgba(255, 214, 130, 0.6); }
/* 鞋那一格：草鞋已有、进阶鞋还没买 = 半格 */
.sf-hud__shop-steps > i.is-half { background: linear-gradient(90deg, #f3cf85 0 50%, rgba(4, 8, 22, 0.8) 50% 100%); }
.sf-hud__shop-prog-n > small { margin-left: 4u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); }
.sf-hud__shop-steps > i.is-next { background: var(--sf-c-cyan-400); box-shadow: 0 0 6u rgba(92, 214, 247, 0.7); animation: sf-hud-blink 1s steps(2, jump-none) infinite; }
/* 桌面：3 列 2 行铺满(每页最多 6 件，不用滚动)；内容实在放不下时整列可滚 */
.sf-hud__shop-grid { flex: 1 0 auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(min-content, 1fr)); gap: 8u; }

/* 卡片：序号 + 图标(+ 鞋的两个阶段点) → 名字 → 一句大白话 → 价格；右上角是状态标签 */
.sf-hud__card {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4u; min-width: 0; padding: 11u 12u 10u; margin: 0; border: 0; border-radius: 9u; cursor: pointer; text-align: left; color: var(--sf-c-text);
  background: linear-gradient(180deg, rgba(34, 54, 110, 0.5), rgba(10, 17, 40, 0.6)); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong);
  transition: box-shadow 0.12s linear, background 0.12s linear, transform 0.1s var(--sf-ease-out), opacity 0.2s linear;
}
@media (hover: hover) { .sf-hud__card:hover { background: linear-gradient(180deg, rgba(48, 74, 146, 0.6), rgba(14, 24, 54, 0.7)); } }
.sf-hud__card:active { transform: scale(0.98); }
.sf-hud__card-top { display: flex; align-items: center; gap: 9u; margin-bottom: 5u; }
.sf-hud__card .sf-slot { --sf-slot: max(44px, 60u); }
.sf-hud__card-no { display: grid; place-items: center; flex: none; width: max(18px, 20u); height: max(18px, 20u); border-radius: 50%; font-size: max(10px, 11.5u); font-weight: 800; line-height: 1; color: var(--sf-c-text-2); background: rgba(4, 8, 22, 0.75); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-hud__card-dots { display: inline-flex; gap: 3u; }
.sf-hud__card-dots > i { width: max(6px, 8u); height: max(6px, 8u); border-radius: 50%; background: rgba(4, 8, 22, 0.8); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.6); }
.sf-hud__card-dots > i.is-on { background: var(--sf-grad-gold); box-shadow: 0 0 5u rgba(255, 214, 130, 0.7); }
.sf-hud__card-name { max-width: 100%; font-size: var(--sf-fs-lg); font-weight: 700; line-height: 1.3; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-hud__card-brief { max-width: 100%; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: var(--sf-fs-sm); line-height: 1.45; color: var(--sf-c-text-2); }
.sf-hud__card-price { display: inline-flex; align-items: center; gap: 4u; flex: none; margin-top: auto; padding-top: 3u; font-size: var(--sf-fs-md); font-weight: 800; line-height: 1.2; color: var(--sf-c-gold-200); }
.sf-hud__card-price .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__card-tag { position: absolute; right: 7u; top: 7u; display: inline-flex; align-items: center; gap: 2u; padding: 1u 6u; border-radius: 3u; font-size: max(10px, 10.5u); font-weight: 800; line-height: 1.4; letter-spacing: 0.04em; white-space: nowrap; }
.sf-hud__card-tag:empty { display: none; }
.sf-hud__card.is-poor .sf-hud__card-price { color: #ff8d8d; }
.sf-hud__card.is-blocked .sf-slot > svg { filter: saturate(0.5) brightness(0.72); }
.sf-hud__card.is-blocked { opacity: 0.62; }
.sf-hud__card.is-afford { box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.55); }
/* 已买：变暗；价格位置空出来 */
.sf-hud__card.is-done { opacity: 0.6; }
.sf-hud__card.is-done .sf-hud__card-price { display: none; }
/* 下一件：金色描边 + 外发光慢呼吸 */
.sf-hud__card.is-next { box-shadow: inset 0 0 0 max(2px, 2u) #f3cf85, 0 0 12u rgba(255, 214, 130, 0.35); }
.sf-hud__card.is-next::after { content: ''; position: absolute; inset: -3u; border-radius: 12u; pointer-events: none; box-shadow: 0 0 0 1.5px rgba(255, 231, 173, 0.85); animation: sf-hud-quick-pulse 1.4s ease-out infinite; }
/* 选中(详情区正在看的那件)：底色提亮 + 浅色描边；与「下一件」叠加时保留金边 */
.sf-hud__card.is-sel { background: linear-gradient(180deg, rgba(86, 124, 210, 0.42), rgba(20, 34, 72, 0.8)); box-shadow: inset 0 0 0 max(1.5px, 2u) #dfe8ff; }
.sf-hud__card.is-sel.is-done, .sf-hud__card.is-sel.is-blocked { opacity: 0.9; }
.sf-hud__card.is-sel.is-next { box-shadow: inset 0 0 0 max(2px, 2.5u) var(--sf-c-gold-100), 0 0 14u rgba(255, 214, 130, 0.5); }
.sf-hud__card-tag.is-own { color: #0f2a1a; background: linear-gradient(180deg, #b8f5cf, #6fe3a1); }
/* 鞋卡：草鞋已经在身上，升级排在后面——淡绿描边的说明标签，不抢「下一件」的风头 */
.sf-hud__card-tag.is-have { color: #b9f5d2; background: rgba(12, 40, 26, 0.75); box-shadow: inset 0 0 0 1px rgba(111, 227, 161, 0.55); }
.sf-hud__card-tag.is-next { color: #06222c; background: linear-gradient(180deg, #c9f6ff, #5cd6f7); }
.sf-hud__card-tag.is-done, .sf-hud__card-tag.is-auto { color: #2b1a04; background: var(--sf-grad-gold); }
.sf-hud__card-tag.is-step { color: var(--sf-c-text-2); background: rgba(4, 8, 22, 0.7); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-hud__card.is-flash { animation: sf-hud-card-buy 0.5s ease-out; }
@keyframes sf-hud-card-buy { 0% { filter: brightness(2.2); } 100% { filter: none; } }

/* 详情：标题(★ 下一件 / 第 N 件) → 图标 + 名字 → 大白话 → 属性 → 被动 → 提示 → 攒钱进度 → 购买 */
.sf-hud__shop-detail { display: flex; flex-direction: column; min-height: 0; padding: 10u 14u 12u; box-shadow: inset 1px 0 0 var(--sf-c-line-strong); background: rgba(4, 8, 22, 0.35); }
.sf-hud__dt-title { flex: none; display: flex; align-items: center; gap: 5u; margin-bottom: 7u; font-size: var(--sf-fs-sm); font-weight: 800; letter-spacing: 0.12em; line-height: 1.2; color: var(--sf-c-text-2); }
.sf-hud__dt-title.is-next { color: var(--sf-c-gold-200); text-shadow: 0 0 8u rgba(255, 214, 130, 0.45); }
.sf-hud__dt-title .sf-i { width: 1.15em; height: 1.15em; vertical-align: 0; }
.sf-hud__dt-head { display: flex; align-items: center; gap: 10u; flex: none; }
.sf-hud__dt-head .sf-slot { --sf-slot: max(46px, 56u); }
.sf-hud__dt-headtext { flex: 1; min-width: 0; }
.sf-hud__dt-name { font-size: var(--sf-fs-lg); font-weight: 800; color: var(--sf-c-gold-200); line-height: 1.25; letter-spacing: 0.04em; }
.sf-hud__dt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5u; margin-top: 3u; }
.sf-hud__dt-price { display: none; align-items: center; gap: 3u; flex: none; align-self: flex-start; font-size: var(--sf-fs-md); font-weight: 800; color: var(--sf-c-gold-200); }
.sf-hud__dt-price .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__dt-body { flex: 1; min-height: 0; margin: 8u -6u 6u 0; padding-right: 6u; }
.sf-hud__dt-brief { font-size: var(--sf-fs-md); font-weight: 600; line-height: 1.45; color: var(--sf-c-text); }
.sf-hud__dt-stats { display: flex; flex-direction: column; gap: 3u; margin-top: 8u; padding-top: 8u; box-shadow: inset 0 1px 0 var(--sf-c-line); font-size: var(--sf-fs-sm); line-height: 1.35; }
.sf-hud__dt-stat { display: flex; justify-content: space-between; gap: 10u; }
.sf-hud__dt-stat > span { color: var(--sf-c-text-2); }
.sf-hud__dt-stat > b { color: var(--sf-c-cyan-300); font-weight: 700; text-align: right; white-space: nowrap; }
.sf-hud__dt-passive { margin-top: 8u; padding: 7u 9u; border-radius: 6u; background: rgba(255, 184, 77, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 184, 77, 0.28); font-size: var(--sf-fs-sm); line-height: 1.5; color: var(--sf-c-text-2); }
.sf-hud__dt-passive b { display: block; color: var(--sf-c-amber); font-weight: 700; }
.sf-hud__dt-nopassive { margin-top: 8u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); }
.sf-hud__dt-note { flex: none; margin-bottom: 5u; font-size: var(--sf-fs-sm); line-height: 1.4; color: var(--sf-c-text-3); }
.sf-hud__dt-note:empty { display: none; }
.sf-hud__dt-note.is-warn { color: #ff9c9c; }
.sf-hud__dt-note.is-good { color: var(--sf-c-green); }
.sf-hud__dt-note b { font-weight: 800; }
/* 攒钱进度：金币 / 花费，满了变绿 */
.sf-hud__dt-save { --p: 0; flex: none; display: flex; align-items: center; gap: 8u; margin-bottom: 7u; font-size: var(--sf-fs-xs); line-height: 1.2; color: var(--sf-c-text-2); white-space: nowrap; }
.sf-hud__dt-save-bar { position: relative; flex: 1; height: max(6px, 7u); border-radius: 99px; overflow: hidden; background: rgba(3, 6, 16, 0.82); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.3); }
.sf-hud__dt-save-bar > i { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(var(--p)); transition: transform 0.3s var(--sf-ease-out); background: linear-gradient(90deg, #c08c3c, #ffe7ad); }
.sf-hud__dt-save.is-full .sf-hud__dt-save-bar > i { background: linear-gradient(90deg, #1f9d58, #6fe3a1); }
.sf-hud__dt-save-text > b { font-weight: 800; color: #ff9c9c; }
.sf-hud__dt-save.is-full .sf-hud__dt-save-text { font-weight: 700; color: var(--sf-c-green); }
.sf-hud__dt-empty { margin: auto; text-align: center; color: var(--sf-c-text-3); font-size: var(--sf-fs-sm); }
.sf-hud__dt-owned { flex: none; display: flex; align-items: center; justify-content: center; gap: 6u; min-height: max(36px, 40u); border-radius: 7u; font-size: var(--sf-fs-sm); font-weight: 700; color: var(--sf-c-gold-200); background: rgba(255, 214, 130, 0.08); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.3); }
.sf-hud__dt-owned .sf-i { width: 1.15em; height: 1.15em; vertical-align: 0; }
.sf-hud__shop-detail .sf-btn { flex: none; padding: 0 12u; letter-spacing: 0.1em; }
.sf-hud__shop-detail .sf-btn .sf-i { width: 1.15em; height: 1.15em; }
.sf-hud__shop-detail .sf-btn > .sf-hud__key { position: absolute; right: 8u; top: 50%; transform: translateY(-50%); }
/* 「还差 N · 攒够自动买」：一句话比较长，收小字号；此时回车买不了，键位角标与金币图标都不放 */
.sf-hud__shop-detail .sf-btn.is-wait { font-size: var(--sf-fs-sm); letter-spacing: 0.04em; }
.sf-hud__shop-detail .sf-btn.is-wait > .sf-hud__key, .sf-hud__shop-detail .sf-btn.is-wait > .sf-i { display: none; }

/* 装备栏 */
.sf-hud__shop-inv { display: flex; align-items: center; gap: 10u; flex: none; padding: 8u 16u 10u; box-shadow: inset 0 1px 0 var(--sf-c-line-strong); }
.sf-hud__shop-inv > .sf-heading { flex: none; width: auto; }
.sf-hud__shop-inv > .sf-heading::after { display: none; }
.sf-hud__shop-slots { display: flex; gap: 6u; }
.sf-hud__shop-slots .sf-slot { --sf-slot: max(36px, 40u); }
.sf-hud__shop-slots button.sf-slot--empty { cursor: default; }
.sf-hud__shop-hint { margin-left: auto; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); text-align: right; }

/* 矮横屏(手机)：面板几乎铺满；卡片 2 列 3 行，图标在左、右边 名字 / 大白话(一行) / 价格 */
@media (orientation: landscape) and (max-height: 460px) {
  .sf-hud__shop { padding-top: max(4px, var(--sf-safe-t)); padding-bottom: max(4px, var(--sf-safe-b)); }
  .sf-hud__shop-head { padding: 0 6u 0 14u; gap: 8u; }
  .sf-hud__shop-title { font-size: var(--sf-fs-lg); letter-spacing: 0.14em; }
  .sf-hud__shop-head .sf-tab { padding: 0 10u; min-height: 40px; }
  .sf-hud__shop-auto { padding: 2u 5u; }
  .sf-hud__shop-list { padding: 6u 10u 6u 12u; }
  .sf-hud__shop-prog { margin-bottom: 6u; }
  .sf-hud__shop-inv { padding: 5u 12u 6u; }
  .sf-hud__shop-slots .sf-slot { --sf-slot: 34px; }
  .sf-hud__shop-detail { padding: 6u 12u 8u; }
  .sf-hud__shop-hint { display: none; }
  .sf-hud__dt-title { margin-bottom: 5u; }
  .sf-hud__dt-head .sf-slot { --sf-slot: 40px; }
  .sf-hud__dt-body { margin: 5u -6u 4u 0; }
  .sf-hud__dt-save { margin-bottom: 5u; }
  .sf-hud__shop-detail .sf-btn { --sf-btn-h: 36px; }
  ${CARD_COMPACT}
  /* 横屏竖向还有余量：卡片中间多放一行大白话(一行，放不下就省略) */
  .sf-hud__card { grid-template-rows: auto auto auto; gap: 1u 8u; min-height: max(62px, 70u); }
  .sf-hud__card-top { grid-row: 1 / span 3; }
  .sf-hud__card .sf-slot { --sf-slot: max(40px, 48u); }
  .sf-hud__card-brief { display: block; grid-column: 2 / span 2; grid-row: 2; font-size: max(10px, 11u); line-height: 1.35; white-space: nowrap; text-overflow: ellipsis; }
  .sf-hud__card-price, .sf-hud__card-tag { grid-row: 3; }
}
/* 竖屏：「下一件」提到最上面做成一张带购买键的大卡，下面是 2 列 3 行的卡片；提示条收窄(两行：标签 / 装备名)，给右侧击杀流让位 */
@media (orientation: portrait) {
  .sf-hud__quick-name { display: none; }
  .sf-hud__quick-tag, .sf-hud__autobuy-tag { letter-spacing: 0; }
  .sf-hud__shopbar { gap: 11u; }
  .sf-hud__autobuy { padding-right: 9u; gap: 6u; }
  .sf-hud__shop-panel { height: min(100%, 860u); }
  .sf-hud__shop-head { flex-wrap: wrap; padding: 8u 8u 0 14u; gap: 2u 10u; }
  .sf-hud__shop-title { flex: 1; }
  .sf-hud__shop-auto { order: 4; flex: 0 0 100%; flex-direction: row; align-items: center; justify-content: flex-start; gap: 10u; padding: 2u 0 3u; }
  .sf-hud__shop-auto-hint { font-size: var(--sf-fs-xs); }
  .sf-hud__shop-head .sf-tabs { order: 5; flex: 0 0 100%; }
  .sf-hud__shop-head .sf-tab { flex: 1; padding: 0 4u; }
  .sf-hud__shop-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .sf-hud__shop-detail { grid-row: 1; max-height: 330u; margin: 10u 10u 0; padding: 9u 12u 11u; border-radius: 10u; background: linear-gradient(180deg, rgba(40, 60, 118, 0.42), rgba(8, 14, 34, 0.55)); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.45), 0 4u 14u rgba(2, 4, 12, 0.35); }
  .sf-hud__shop-list { grid-row: 2; padding: 10u; }
  .sf-hud__dt-title { margin-bottom: 6u; }
  .sf-hud__dt-head .sf-slot { --sf-slot: max(42px, 50u); }
  .sf-hud__dt-price { display: inline-flex; }
  .sf-hud__dt-body { margin: 6u -6u 5u 0; }
  .sf-hud__shop-inv { padding: 8u 12u 10u; }
  .sf-hud__shop-hint { display: none; }
  ${CARD_COMPACT}
}
`);

const TABS: ShopTab[] = ['recommend', 'attack', 'magic', 'defense', 'boots'];
/** 删掉小件之后 tier 只剩一个用途：区分基础鞋与进阶鞋 */
const BOOTS_TIER = { 1: '基础鞋', 2: '进阶鞋' } as const;
/** 分类页详情标题 */
const CATEGORY_TITLE: Record<ItemDef['category'], string> = { attack: '攻击装备', magic: '法术装备', defense: '防御装备', boots: '鞋' };

/** 提示条停留(秒)；后面还排着别的提示时，至少停这么久就换下一条 */
const NOTICE_LIFE = 2.6;
const NOTICE_MIN = 1.2;
const NOTICE_FADE = 0.3;
/** 同一张卡两次点按间隔在这以内 = 直接购买(鼠标双击、触屏双点都走这里，不用 dblclick，免得一次双击买两回) */
const DOUBLE_TAP_MS = 320;

/** 小地图下方那条不可点的提示：上行标签，下行正文(装备名等) */
interface Notice {
  tag: string;
  text: string;
  itemId: ItemId | null;
  warn: boolean;
}

interface CardView {
  el: HTMLButtonElement;
  /** 推荐页：第几张推荐卡(1..6)；分类页：0 */
  order: number;
  /** 这张卡当前展示的装备（推荐页的鞋卡随阶段变化：草鞋 → 进阶鞋） */
  id: ItemId;
  slot: HTMLElement;
  name: HTMLElement;
  brief: HTMLElement;
  price: HTMLElement;
  tag: HTMLElement;
  /** 鞋卡的两个阶段点 */
  dots: HTMLElement[] | null;
  /** 「已自动购买」标签显示到什么时候(墙钟秒)；0 = 不显示 */
  autoUntil: number;
}

type Selection =
  | { kind: 'card'; order: number } // 推荐页的第几张卡
  | { kind: 'shop'; id: ItemId } // 分类页里的一件
  | { kind: 'inv'; index: number } // 装备栏第几格
  | null;

/** 详情区此刻展示的东西 */
interface DetailModel {
  id: ItemId;
  /** buy = 能买(有购买键)；own = 推荐页里已买的卡(只看)；inv = 装备栏里的(可出售) */
  kind: 'buy' | 'own' | 'inv';
  title: string;
  /** 是「下一件」(标题带星标) */
  star: boolean;
  invIndex: number;
}

export interface Shop extends HudPart {
  els: HTMLElement[];
  setOpen(open: boolean): void;
  isOpen(): boolean;
}

const statText = (def: ItemDef): string => def.brief ?? statSummary(def.stats, 2);
/** 装备名去掉前面的功能词，只留器物名(「移速草鞋」→「草鞋」)：标签里地方小，玩家口头也这么叫 */
const shortName = (id: ItemId): string => ITEMS[id].name.slice(-2);

export function createShop(ctx: HudCtx): Shop {
  injectStyle('sf-hud-shop', CSS);
  const { host } = ctx;
  const itemDef = (id: ItemId): ItemDef => ITEMS[id];
  let open = false;
  let tab: ShopTab = 'recommend';
  let sel: Selection = null;
  /** 选中推荐卡时它「点了会买什么」：之后发现变了(买到手 / 鞋进了下一阶段)，选择就跳到新的下一件 */
  let selBuyId: ItemId | null = null;
  let cards: CardView[] = [];
  let detailKey = '';
  let quickId: ItemId | null = null;

  // ── 商店按钮 ──
  const shopBtn = h('button', 'sf-hud__shopbtn', icon(uiIcon('shop')), h('span', 'sf-hud__key', 'P'));
  shopBtn.type = 'button';
  shopBtn.tabIndex = -1;
  shopBtn.dataset.sfSnd = 'click';
  shopBtn.setAttribute('aria-label', '商店');
  shopBtn.addEventListener('click', () => ctx.actions.toggleShop());
  const setBtnOpen = classSlot(shopBtn, 'is-open');
  const setBtnReady = classSlot(shopBtn, 'is-ready');
  const setBtnSaving = classSlot(shopBtn, 'is-saving');
  const setBtnP = varSlot(shopBtn, '--p', 0.01);

  // ── 快捷购买气泡(自动出装关着时) ──
  const quickSlot = createSlot(null);
  const quickName = h('span', 'sf-hud__quick-name');
  const quickPriceN = h('span', 'sf-num');
  const quick = h('button', 'sf-hud__quick', quickSlot, h('span', 'sf-hud__quick-text', h('span', 'sf-hud__quick-tag', '推荐 · 可购买'), h('span', 'sf-hud__quick-price', icon(uiIcon('gold')), quickName, quickPriceN)));
  quick.type = 'button';
  quick.tabIndex = -1;
  quick.addEventListener('click', () => {
    if (quickId) ctx.actions.buy(quickId);
  });
  const setQuickOn = classSlot(quick, 'is-on');

  // ── 自动出装提示条(与气泡同一位置，不可点) ──
  const noticeSlot = createSlot(null);
  const noticeIco = h('span', 'sf-hud__autobuy-ico', icon(uiIcon('info')));
  const noticeTag = h('span', 'sf-hud__autobuy-tag');
  const noticeText = h('span', 'sf-hud__autobuy-name');
  const notice = h('div', 'sf-hud__autobuy', noticeSlot, noticeIco, h('span', 'sf-hud__autobuy-text', noticeTag, noticeText));
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const noticeQueue: Notice[] = [];
  let noticeCur: Notice | null = null;
  let noticeAt = 0;
  /** > 0：正在淡出，到这个时刻彻底收起 */
  let noticeGoneAt = 0;

  function showNotice(n: Notice, now: number): void {
    noticeCur = n;
    noticeAt = now;
    noticeGoneAt = 0;
    noticeSlot.hidden = n.itemId === null;
    noticeIco.hidden = n.itemId !== null;
    if (n.itemId) {
      noticeSlot.innerHTML = itemIcon(n.itemId);
      noticeSlot.classList.remove('sf-slot--empty');
    }
    noticeTag.textContent = n.tag;
    noticeText.textContent = n.text;
    noticeText.hidden = n.text === '';
    notice.classList.toggle('is-warn', n.warn);
    notice.classList.remove('is-out');
    replay(notice, 'is-on');
    dockNotice();
    syncQuickVisible();
  }
  /**
   * 提示条停在哪：面板关着 = 小地图下方(商店按钮右边)；面板开着 = 面板上沿的正上方。
   * 面板几乎铺满屏幕(手机)时上面没有地方，就不显示——半截压在面板底下比不显示更糟，面板顶部的小字与卡片标签会说同一件事。
   */
  function dockNotice(): void {
    if (!open) {
      if (notice.parentElement !== shopbar) shopbar.appendChild(notice);
      return;
    }
    if (notice.parentElement !== noticeDock) noticeDock.appendChild(notice);
    // 面板上方的空带高度。用布局位置(offsetTop，相对遮罩层)：面板刚弹出时带缩放动画，量包围盒会偏大
    const band = panel.offsetTop;
    const height = notice.offsetHeight || 46;
    noticeDock.style.top = `${Math.max(0, Math.round(band - height - 8))}px`;
    noticeDock.classList.toggle('is-off', band < height + 12);
  }
  function pushNotice(n: Notice): void {
    noticeQueue.push(n);
    // 积压太多(加速调试时一口气买好几件)：只留最近的几条
    while (noticeQueue.length > 3) noticeQueue.shift();
  }
  function tickNotice(now: number): void {
    if (!noticeCur) {
      const n = noticeQueue.shift();
      if (n) showNotice(n, now);
      return;
    }
    if (noticeGoneAt > 0) {
      if (now >= noticeGoneAt) {
        noticeGoneAt = 0;
        noticeCur = null;
        notice.classList.remove('is-on', 'is-out');
        syncQuickVisible();
      }
      return;
    }
    const age = now - noticeAt;
    const next = noticeQueue.length > 0 && age >= NOTICE_MIN ? noticeQueue.shift() : undefined;
    if (next) showNotice(next, now);
    else if (age >= NOTICE_LIFE) {
      notice.classList.add('is-out');
      noticeGoneAt = now + NOTICE_FADE;
    }
  }
  /** 气泡与提示条共用一个位置：提示条在的时候气泡先让一让 */
  function syncQuickVisible(): void {
    setQuickOn(quickId !== null && noticeCur === null);
  }

  const shopbar = h('div', 'sf-hud__shopbar', shopBtn, quick, notice);
  /** 面板开着时提示条挪到这里(面板上沿的正上方)，关掉再挪回小地图下面 */
  const noticeDock = h('div', 'sf-hud__shop-dock');

  // ── 面板：顶部 ──
  const tabs = createTabs<ShopTab>({
    tabs: TABS.map((id) => ({ id, label: CATEGORY_NAMES[id] })),
    value: tab,
    onChange: (id) => {
      tab = id;
      // 换页：选择回到这一页的默认项(推荐页 = 下一件；分类页 = 第一件)
      sel = null;
      rebuildList();
    },
  });
  const autoToggle = createToggle({
    value: ctx.me.autoBuy === true,
    label: '自动出装',
    onChange: (v) => {
      if (ctx.state.over) return;
      // 一边改本局状态(命令立即生效)，一边记成玩家的偏好(下一局沿用)
      host.command({ type: 'autoBuy', enabled: v });
      host.updateSettings({ autoBuy: v });
      refresh();
    },
  });
  const autoHint = h('span', 'sf-hud__shop-auto-hint');
  const setAutoHint = textSlot(autoHint);
  const autoBox = h('div', 'sf-hud__shop-auto', h('span', 'sf-hud__shop-auto-row', '自动出装', autoToggle.el), autoHint);
  autoBox.dataset.sfSnd = 'click';
  autoBox.addEventListener('click', () => autoToggle.flip());
  const setAutoOn = classSlot(autoBox, 'is-on');
  const setAutoWarn = classSlot(autoBox, 'is-warn');
  /** 顶部小字临时改写(「已自动购买 ××」等)：面板开着时小地图下的提示条被遮住，在这里再说一遍 */
  let hintFlash: { text: string; warn: boolean; until: number } | null = null;
  /** 本局自动出装是因为卖了推荐装才关的(不是玩家手动关的) */
  let soldOff = false;
  /** 刚刚的出售把自动出装关掉了：等下一帧 trackAuto 看到变化时给出对应提示 */
  let soldJustNow = false;

  const panelGoldN = h('b', 'sf-num', '0');
  const setPanelGold = numSlot(panelGoldN);
  const closeBtn = createIconButton({ icon: uiIcon('close'), label: '关闭商店', quiet: true, sound: 'back', onClick: () => ctx.actions.setShop(false) });
  const head = h('header', 'sf-hud__shop-head', h('h2', 'sf-hud__shop-title sf-metal', '商店'), tabs.el, autoBox, h('span', 'sf-hud__chip sf-hud__shop-gold', icon(uiIcon('gold')), panelGoldN), closeBtn);

  // ── 面板：列表 / 详情 / 装备栏 ──
  const progN = h('b', 'sf-num');
  const progSteps = h('span', 'sf-hud__shop-steps');
  const progNote = h('small');
  const prog = h('div', 'sf-hud__shop-prog', h('span', 'sf-hud__shop-prog-who', h('b', null, heroFullName(ctx.me.heroId)), ' 的推荐出装'), h('span', 'sf-hud__shop-prog-n', '已买 ', progN, progNote), progSteps);
  const grid = h('div', 'sf-hud__shop-grid');
  const list = h('div', 'sf-hud__shop-list sf-scroll', prog, grid);
  const detail = h('aside', 'sf-hud__shop-detail');
  const invSlots: HTMLButtonElement[] = [];
  const invBox = h('div', 'sf-hud__shop-slots');
  for (let i = 0; i < ctx.me.items.length; i++) {
    const s = createSlot(null, { button: true }) as HTMLButtonElement;
    s.dataset.sfSnd = 'select';
    s.addEventListener('click', () => {
      if (!ctx.me.items[i]) return;
      sel = { kind: 'inv', index: i };
      refresh();
    });
    invSlots.push(s);
    invBox.appendChild(s);
  }
  const inv = h('footer', 'sf-hud__shop-inv', h('h3', 'sf-heading', '我的装备'), invBox, h('span', 'sf-hud__shop-hint', `点选装备可出售，返还 ${Math.round(SELL_RATIO * 100)}%`));
  const panel = h('div', 'sf-hud__shop-panel sf-panel', head, h('div', 'sf-hud__shop-body', list, detail), inv);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '商店');
  const scrim = h('div', 'sf-hud__shop', panel, noticeDock);
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target === scrim) ctx.actions.setShop(false);
  });

  /** 推荐卡此刻展示哪件：没买完 = 点了会买的那件；买完 = 最终那件(鞋卡：身上实际穿的那双) */
  function shownId(bc: BuildCard, me: HeroUnit): ItemId {
    if (bc.buyId) return bc.buyId;
    return ITEMS[bc.finalId].category === 'boots' ? (ownedBoots(me) ?? bc.finalId) : bc.finalId;
  }

  let lastTapCard: CardView | null = null;
  let lastTapAt = 0;

  function makeCard(order: number, id: ItemId, isBoots: boolean): CardView {
    const def = itemDef(id);
    const slot = createSlot(itemIcon(id));
    const name = h('span', 'sf-hud__card-name', def.name);
    const brief = h('span', 'sf-hud__card-brief', statText(def));
    const price = h('b', 'sf-num');
    const tag = h('span', 'sf-hud__card-tag');
    const dots = isBoots ? [h('i'), h('i')] : null;
    const el = h(
      'button',
      'sf-hud__card',
      h('span', 'sf-hud__card-top', order > 0 ? h('span', 'sf-hud__card-no sf-num', String(order)) : null, slot, dots ? h('span', 'sf-hud__card-dots', ...dots) : null),
      name,
      brief,
      h('span', 'sf-hud__card-price', icon(uiIcon('gold')), price),
      tag,
    );
    el.type = 'button';
    el.dataset.sfSnd = 'select';
    el.dataset.item = id;
    const view: CardView = { el, order, id, slot, name, brief, price, tag, dots, autoUntil: 0 };
    el.addEventListener('click', () => {
      const now = performance.now();
      const again = lastTapCard === view && now - lastTapAt < DOUBLE_TAP_MS;
      lastTapCard = view;
      lastTapAt = again ? 0 : now;
      if (again) {
        // 双击 / 双点：直接买这张卡此刻对应的那件
        const buyId = view.order > 0 ? (buildCards(ctx.me)[view.order - 1]?.buyId ?? null) : view.id;
        if (buyId) ctx.actions.buy(buyId);
        return;
      }
      sel = view.order > 0 ? { kind: 'card', order: view.order } : { kind: 'shop', id: view.id };
      refresh();
    });
    grid.appendChild(el);
    return view;
  }

  function rebuildList(): void {
    const me = ctx.me;
    grid.textContent = '';
    cards = [];
    lastTapCard = null;
    if (tab === 'recommend') {
      for (const bc of buildCards(me)) cards.push(makeCard(bc.order, shownId(bc, me), ITEMS[bc.finalId].category === 'boots'));
    } else {
      // 分类页：按价格从低到高(鞋页签里基础鞋自然排第一)
      const items = ITEM_LIST.filter((it) => it.category === tab).sort((a, b) => a.cost - b.cost);
      for (const it of items) cards.push(makeCard(0, it.id, false));
    }
    if (!sel || sel.kind !== 'inv') sel = defaultSelection(me);
    list.scrollTop = 0;
    refresh();
  }

  /** 默认选中：推荐页 = 下一件(栏位满时没有「下一件」，就选第一张还没买的；都买齐了选第一张)；分类页 = 第一件 */
  function defaultSelection(me: HeroUnit): Selection {
    if (tab === 'recommend') {
      const bcs = buildCards(me);
      const pick = bcs.find((c) => c.next) ?? bcs.find((c) => c.stage !== 'done') ?? bcs[0];
      return pick ? { kind: 'card', order: pick.order } : null;
    }
    return cards[0] ? { kind: 'shop', id: cards[0].id } : null;
  }

  function detailModel(me: HeroUnit, bcs: BuildCard[] | null): DetailModel | null {
    if (!sel) return null;
    if (sel.kind === 'inv') {
      const id = me.items[sel.index];
      return id ? { id, kind: 'inv', title: '我的装备', star: false, invIndex: sel.index } : null;
    }
    if (sel.kind === 'card') {
      const bc = bcs?.[sel.order - 1];
      if (!bc) return null;
      if (!bc.buyId) return { id: shownId(bc, me), kind: 'own', title: '已买', star: false, invIndex: -1 };
      const later = bc.stage === 'base' && bc.baseId ? `已有${shortName(bc.baseId)} · 稍后升级` : `第 ${bc.order} 件`;
      return { id: bc.buyId, kind: 'buy', title: bc.next ? (bc.stage === 'base' ? '下一件 · 升级' : '下一件') : later, star: bc.next, invIndex: -1 };
    }
    const isNext = nextRecommended(me) === sel.id;
    return { id: sel.id, kind: 'buy', title: isNext ? '下一件' : CATEGORY_TITLE[itemDef(sel.id).category], star: isNext, invIndex: -1 };
  }

  // 详情区：结构只在「展示的东西」变化时重建；金币变化只改提示文字、进度条与按钮状态。
  // 金币每秒都在涨，如果每次都整块重建，玩家按下购买键的瞬间按钮可能刚好被换掉，点击就丢了。
  let cur: DetailModel | null = null;
  let dtNote: HTMLElement | null = null;
  let dtSave: HTMLElement | null = null;
  let dtSaveText: HTMLElement | null = null;
  let dtPrice: HTMLElement | null = null;
  let dtAction: HTMLButtonElement | null = null;
  let dtActionLabel: HTMLElement | null = null;

  function renderDetail(m: DetailModel | null): void {
    detail.textContent = '';
    dtNote = dtSave = dtSaveText = dtPrice = dtAction = dtActionLabel = null;
    cur = m;
    if (!m) {
      detail.appendChild(h('div', 'sf-hud__dt-empty', '选择一件装备查看详情'));
      return;
    }
    const def = itemDef(m.id);
    const id = m.id;
    const title = h('div', `sf-hud__dt-title${m.star ? ' is-next' : ''}`, m.star ? icon(uiIcon('star')) : m.kind === 'own' ? icon(uiIcon('check')) : null, m.title);
    const meta = h('div', 'sf-hud__dt-meta', h('span', 'sf-badge sf-badge--mute', CATEGORY_NAMES[def.category]), def.category === 'boots' ? h('span', `sf-badge${def.tier === 2 ? '' : ' sf-badge--mute'}`, BOOTS_TIER[def.tier]) : null);
    const priceN = h('b', 'sf-num');
    dtPrice = priceN;
    const headEl = h('div', 'sf-hud__dt-head', createSlot(itemIcon(id)), h('div', 'sf-hud__dt-headtext', h('div', 'sf-hud__dt-name', def.name), meta), m.kind === 'buy' ? h('span', 'sf-hud__dt-price', icon(uiIcon('gold')), priceN) : null);
    // 四层信息的后三层：大白话 → 属性 → 被动
    const stats = h('div', 'sf-hud__dt-stats');
    for (const row of statLines(def.stats)) stats.appendChild(h('span', 'sf-hud__dt-stat', h('span', null, row.label), h('b', 'sf-num', row.value)));
    const body = h('div', 'sf-hud__dt-body sf-scroll', def.brief ? h('div', 'sf-hud__dt-brief', def.brief) : null, stats);
    if (def.passive) body.appendChild(h('div', 'sf-hud__dt-passive', h('b', null, `被动 · ${def.passive.name}`), def.passive.desc));
    else body.appendChild(h('div', 'sf-hud__dt-nopassive', '(无被动)'));
    dtNote = h('div', 'sf-hud__dt-note');
    detail.append(title, headEl, body, dtNote);
    if (m.kind === 'own') {
      detail.appendChild(h('div', 'sf-hud__dt-owned', icon(uiIcon('check')), '已经在装备栏里了'));
      return;
    }
    if (m.kind === 'inv') {
      const index = m.invIndex;
      dtAction = createButton({
        label: '出售',
        icon: uiIcon('gold'),
        variant: 'danger',
        block: true,
        sound: 'none',
        onClick: () => {
          const wasAuto = ctx.me.autoBuy === true;
          ctx.actions.sell(index);
          // 出售命令立即生效：卖的是推荐装时模拟层会把本局的自动出装关掉(见 core/hero.ts 的 sellItem)，记下这次是「卖关的」
          if (wasAuto && ctx.me.autoBuy !== true) soldJustNow = true;
        },
      });
    } else {
      dtSaveText = h('span', 'sf-hud__dt-save-text sf-num');
      dtSave = h('div', 'sf-hud__dt-save', '金币', h('span', 'sf-hud__dt-save-bar', h('i')), dtSaveText);
      detail.appendChild(dtSave);
      dtAction = createButton({ label: '购买', icon: uiIcon('gold'), variant: 'primary', block: true, sound: 'none', onClick: () => ctx.actions.buy(id) });
      // 买不起也要能点：点了给出提示音与原因，而不是没反应
      dtAction.style.pointerEvents = 'auto';
      // 键鼠：回车 = 购买详情区这一件
      dtAction.appendChild(h('span', 'sf-hud__key', '回车'));
    }
    dtActionLabel = dtAction.querySelector<HTMLElement>('.sf-btn__label');
    detail.appendChild(dtAction);
  }

  /** 详情区里随金币变化的部分：提示行、攒钱进度、按钮文字与可用态 */
  function updateDetail(me: HeroUnit): void {
    const m = cur;
    if (!m || !dtNote) return;
    const note = dtNote;
    note.textContent = '';
    note.className = 'sf-hud__dt-note';
    if (m.kind === 'own') return;
    if (!dtAction || !dtActionLabel) return;
    if (m.kind === 'inv') {
      const back = sellValue(m.id);
      // 卖推荐装会让本局的自动出装关闭(否则马上又原价买回来)：卖之前先说清楚
      if (me.autoBuy && isBuildItem(me.heroId, m.id)) {
        note.classList.add('is-warn');
        note.append('这是推荐装备：卖掉后本局自动出装会关闭');
      } else note.append('出售后返还 ', h('b', 'sf-num sf-gold', String(back)), ' 金币');
      dtActionLabel.textContent = `出售 +${back}`;
      return;
    }
    const def = itemDef(m.id);
    const chk = checkBuy(me, m.id);
    const gold = Math.floor(me.gold);
    const short = Math.max(1, Math.ceil(chk.cost - me.gold));
    if (chk.replaces) {
      note.classList.add('is-good');
      note.append(`替换${ITEMS[chk.replaces].name}，已抵 `, h('b', 'sf-num', String(def.cost - chk.cost)));
    } else if (chk.block === 'full') {
      note.classList.add('is-warn');
      note.append('装备栏已满，先卖掉一件再买');
    } else if (chk.block === 'boots_owned') {
      note.classList.add('is-warn');
      note.append('已经有鞋了，可以直接买进阶鞋替换');
    } else if (chk.block === 'boots_same') {
      note.classList.add('is-warn');
      note.append('已经穿着这双鞋了');
    }
    if (dtPrice) dtPrice.textContent = String(chk.cost);
    if (dtSave && dtSaveText) {
      // 只有「差的是钱」才画攒钱进度；栏位满、鞋规则挡着的时候钱再多也没用
      const saving = chk.block === 'ok' || chk.block === 'gold';
      dtSave.hidden = !saving;
      if (saving) {
        dtSave.style.setProperty('--p', clamp01(chk.cost > 0 ? me.gold / chk.cost : 1).toFixed(3));
        dtSave.classList.toggle('is-full', chk.ok);
        dtSaveText.textContent = '';
        if (chk.ok) dtSaveText.append(`✓ ${gold}/${chk.cost}`);
        else dtSaveText.append('还差 ', h('b', null, String(short)));
      }
    }
    // 自动出装开着、差的只是钱、而且正轮到这一件：不用点，攒够了会自动买
    const willAuto = chk.block === 'gold' && me.autoBuy === true && nextRecommended(me) === m.id;
    dtActionLabel.textContent = willAuto ? `还差 ${short} · 攒够自动买` : `购买 ${chk.cost}`;
    dtAction.classList.toggle('is-wait', willAuto);
    dtAction.classList.toggle('is-disabled', !chk.ok);
  }

  let progKey = '';
  let lastItemsKey = '';
  /** 卡片上的「已自动购买」标签要在这个时刻换回常态(墙钟秒)；0 = 没有待办 */
  let tagRevertAt = 0;

  /** 顶部自动出装开关与它下面的小字 */
  function refreshAuto(me: HeroUnit): void {
    const auto = me.autoBuy === true;
    if (autoToggle.get() !== auto) autoToggle.set(auto);
    setAutoOn(auto);
    if (hintFlash && ctx.now >= hintFlash.until) hintFlash = null;
    let text: string;
    let warn = false;
    if (hintFlash) {
      text = hintFlash.text;
      warn = hintFlash.warn;
    } else if (!auto) {
      text = soldOff ? '卖了推荐装，本局已关闭' : '已关闭，自己点购买';
      warn = soldOff;
    } else {
      const status = buildStatus(me);
      if (status === 'paused') {
        text = '装备栏已满，已暂停';
        warn = true;
      } else if (status === 'done') text = '推荐出装已买齐';
      else text = '钱够自动买下一件';
    }
    setAutoHint(text);
    setAutoWarn(warn);
  }

  /** 刷新卡片状态/装备栏/详情（调用方保证：金币/装备栏/选择/列表/自动出装至少有一样变了） */
  function refresh(): void {
    const me = ctx.me;
    const now = ctx.now;
    const itemsKey = me.items.join(',');
    setPanelGold(Math.floor(me.gold));
    refreshAuto(me);

    const bcs = tab === 'recommend' ? buildCards(me) : null;
    // 推荐页里选中的那张卡买到手了(这一步完成，或鞋卡进了下一阶段)：选择自动跳到新的「下一件」，可以连着买
    if (bcs && sel?.kind === 'card' && itemsKey !== lastItemsKey) {
      const mine = bcs[sel.order - 1];
      const next = bcs.find((c) => c.next);
      if (mine && next && mine.buyId !== selBuyId) sel = { kind: 'card', order: next.order };
    }
    lastItemsKey = itemsKey;
    // 选中的装备栏格子被卖空了：退回这一页的默认项
    if (sel?.kind === 'inv' && !me.items[sel.index]) sel = defaultSelection(me);

    const owned = new Map<ItemId, number>();
    for (const id of me.items) if (id) owned.set(id, (owned.get(id) ?? 0) + 1);
    let pendingTag = 0;
    for (const card of cards) {
      const bc = bcs ? bcs[card.order - 1] : null;
      let buyId: ItemId | null = card.id;
      if (bc) {
        buyId = bc.buyId;
        const show = shownId(bc, me);
        if (show !== card.id) {
          // 鞋卡换阶段：草鞋买到了，卡面换成该升级的那双
          card.id = show;
          const def = itemDef(show);
          card.slot.innerHTML = itemIcon(show);
          card.name.textContent = def.name;
          card.brief.textContent = statText(def);
          card.el.dataset.item = show;
        }
        if (card.dots) {
          card.dots[0].classList.toggle('is-on', bc.stage !== 'todo');
          card.dots[1].classList.toggle('is-on', bc.stage === 'done');
        }
      }
      const chk = buyId ? checkBuy(me, buyId) : null;
      const done = !!bc && bc.stage === 'done';
      const blocked = !!chk && (chk.block === 'full' || chk.block === 'boots_owned' || chk.block === 'boots_same');
      const isSel = sel?.kind === 'card' ? sel.order === card.order && card.order > 0 : sel?.kind === 'shop' && card.order === 0 && sel.id === card.id;
      const cl = card.el.classList;
      cl.toggle('is-afford', !!chk && chk.ok);
      // 鞋卡的草鞋已经在身上、升级还没轮到：只是「以后的事」，价格不标成买不起的红色
      const bootsLater = !!bc && bc.stage === 'base' && !bc.next;
      cl.toggle('is-poor', !!chk && chk.block === 'gold' && !bootsLater);
      cl.toggle('is-blocked', blocked);
      cl.toggle('is-done', done);
      cl.toggle('is-next', !!bc && bc.next);
      cl.toggle('is-sel', isSel);
      const price = chk ? String(chk.cost) : '';
      if (card.price.textContent !== price) card.price.textContent = price;

      let tagText = '';
      let tagCls = '';
      /** 标签的后半句(紧凑卡片里收起) */
      let tagMore = '';
      const n = owned.get(card.id) ?? 0;
      if (card.autoUntil > 0 && (now >= card.autoUntil || !done)) card.autoUntil = 0;
      if (card.autoUntil > 0) {
        [tagText, tagCls] = ['已自动购买', 'is-auto'];
        pendingTag = pendingTag > 0 ? Math.min(pendingTag, card.autoUntil) : card.autoUntil;
      } else if (bc) {
        if (done) [tagText, tagCls] = ['✓ 已买', 'is-done'];
        else if (bc.next) [tagText, tagCls, tagMore] = ['下一件', 'is-next', bc.stage === 'base' ? ' · 升级' : ''];
        // 鞋卡：开局自动买的草鞋已经在身上，这张卡现在是「以后升级」——写明白，免得「第 1 件没买却先买第 2 件」看不懂
        else if (bc.stage === 'base' && bc.baseId) [tagText, tagCls, tagMore] = [`已有${shortName(bc.baseId)}`, 'is-have', ' · 稍后升级'];
        else if (blocked) [tagText, tagCls] = ['栏位已满', 'is-step'];
        else [tagText, tagCls] = [`第 ${bc.order} 件`, 'is-step'];
      } else if (n > 0) [tagText, tagCls] = [n > 1 ? `已有 ×${n}` : '已有', 'is-own'];
      else if (blocked && chk) [tagText, tagCls] = [BLOCK_TEXT[chk.block as 'full' | 'boots_owned' | 'boots_same'], 'is-step'];
      if (card.tag.textContent !== tagText + tagMore) {
        card.tag.textContent = tagText;
        if (tagMore) card.tag.appendChild(h('span', 'sf-hud__card-tag-more', tagMore));
      }
      const cls = `sf-hud__card-tag ${tagCls}`;
      if (card.tag.className !== cls) card.tag.className = cls;
    }
    tagRevertAt = pendingTag;

    // 推荐进度只跟装备栏有关
    const pk = bcs ? itemsKey : '-';
    if (pk !== progKey) {
      progKey = pk;
      prog.hidden = !bcs;
      if (bcs) {
        progN.textContent = `${bcs.filter((c) => c.stage === 'done').length}/${bcs.length}`;
        // 草鞋已经在身上但鞋这一件还没算买完：补一句，对得上开局那条「已自动购买 移速草鞋」
        const half = bcs.find((c) => c.stage === 'base' && c.baseId);
        progNote.textContent = half?.baseId ? `(${shortName(half.baseId)}已有)` : '';
        progSteps.textContent = '';
        for (const c of bcs) progSteps.appendChild(h('i', c.stage === 'done' ? 'is-done' : c.next ? 'is-next' : c.stage === 'base' ? 'is-half' : ''));
      }
    }

    for (let i = 0; i < invSlots.length; i++) {
      const id = me.items[i];
      const slot = invSlots[i];
      if (slot.dataset.item !== (id ?? '')) {
        slot.dataset.item = id ?? '';
        slot.innerHTML = id ? itemIcon(id) : '';
        slot.classList.toggle('sf-slot--empty', !id);
        slot.setAttribute('aria-label', id ? `${ITEMS[id].name}（点选可出售）` : '空装备栏');
      }
      slot.classList.toggle('is-active', sel?.kind === 'inv' && sel.index === i);
    }

    selBuyId = sel?.kind === 'card' ? (bcs?.[sel.order - 1]?.buyId ?? null) : null;
    const m = detailModel(me, bcs);
    const dKey = m ? `${m.kind}|${m.id}|${m.title}|${m.invIndex}` : '';
    if (dKey !== detailKey) {
      detailKey = dKey;
      renderDetail(m);
    }
    updateDetail(me);
  }

  // ── 商店外：进度环 / 气泡 / 自动出装状态的提示 ──
  let lastAuto: boolean | null = null;
  let pausedTold = false;
  let doneTold = false;

  /** 跟踪 me.autoBuy 的变化并给出对应提示；返回这一帧有没有变 */
  function trackAuto(me: HeroUnit): boolean {
    const auto = me.autoBuy === true;
    if (lastAuto === null) {
      lastAuto = auto;
      // 开局(或中途接手)时就已经买齐的不再报喜
      doneTold = buildStatus(me) === 'done';
      return true;
    }
    const sold = soldJustNow;
    soldJustNow = false;
    if (auto === lastAuto) return false;
    lastAuto = auto;
    if (auto) {
      soldOff = false;
      ctx.toast('自动出装：已开启', 'good');
    } else if (sold) {
      // 卖出推荐装导致的关闭：只关本局，玩家的偏好没变；说清楚在哪能重新打开
      soldOff = true;
      pushNotice({ tag: '自动出装已关闭', text: '商店顶部可重新打开', itemId: null, warn: true });
      hintFlash = null;
      if (open) replay(autoBox, 'is-flash');
    } else {
      // 玩家自己关的(商店顶部开关 / 暂停面板)
      soldOff = false;
      ctx.toast('自动出装：已关闭', 'info');
    }
    return true;
  }

  function syncOutside(me: HeroUnit): void {
    const auto = me.autoBuy === true;
    // 自动出装开着：不弹气泡，按钮外圈画攒钱进度；关着：金币够下一件时弹气泡(面板开着时不弹，玩家正在面板里挑)
    const p = auto ? savingProgress(me) : -1;
    setBtnSaving(p >= 0);
    if (p >= 0) setBtnP(p);
    const next = auto ? null : nextRecommended(me);
    const chk = next ? checkBuy(me, next) : null;
    const id = next && chk && chk.ok && !open ? next : null;
    if (id !== quickId) {
      quickId = id;
      setBtnReady(!!id);
      if (id) {
        quickSlot.innerHTML = itemIcon(id);
        quickSlot.classList.remove('sf-slot--empty');
        quick.setAttribute('aria-label', `快捷购买 ${ITEMS[id].name}`);
      }
      syncQuickVisible();
    }
    if (id && chk) {
      quickName.textContent = ITEMS[id].name;
      quickPriceN.textContent = String(chk.cost);
    }
    if (auto) {
      const status = buildStatus(me);
      // 栏位满而推荐装没买齐：自动出装不会代卖，说一次(每局一次)
      if (status === 'paused' && !pausedTold) {
        pausedTold = true;
        pushNotice({ tag: '自动出装暂停', text: '装备栏满了', itemId: null, warn: true });
      }
      if (status === 'done' && !doneTold) {
        doneTold = true;
        pushNotice({ tag: '推荐出装已买齐', text: '', itemId: null, warn: false });
      }
    }
  }

  // 金币(取整)与装备栏的快照：没变就什么都不用重算
  let seenGold = -1;
  const seenItems: (ItemId | null)[] = [];
  function inventoryChanged(me: HeroUnit): boolean {
    const gold = Math.floor(me.gold);
    let changed = gold !== seenGold || seenItems.length !== me.items.length;
    for (let i = 0; i < me.items.length && !changed; i++) changed = seenItems[i] !== me.items[i];
    if (changed) {
      seenGold = gold;
      seenItems.length = me.items.length;
      for (let i = 0; i < me.items.length; i++) seenItems[i] = me.items[i];
    }
    return changed;
  }

  // 键鼠：商店开着时按回车 = 购买详情区当前这一件。先拦下默认行为，免得同时触发「焦点所在按钮」的点击
  const onKey = (ev: KeyboardEvent): void => {
    if (!open || (ev.code !== 'Enter' && ev.code !== 'NumpadEnter')) return;
    if (!ctx.enabled || ctx.paused || hasOpenDialog() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    if (ev.repeat || !cur || cur.kind !== 'buy') return;
    ctx.actions.buy(cur.id);
  };
  window.addEventListener('keydown', onKey);

  return {
    els: [shopbar, scrim],
    isOpen: () => open,
    setOpen(v) {
      if (v === open) return;
      open = v;
      scrim.classList.toggle('is-open', v);
      setBtnOpen(v);
      if (v) {
        // 每次打开都回到「推荐」，详情默认就是下一件：打开 → 直接点购买
        tab = 'recommend';
        tabs.set(tab);
        sel = null;
        detailKey = '';
        progKey = '';
        hintFlash = null;
        lastItemsKey = ctx.me.items.join(',');
        rebuildList();
      }
      dockNotice();
      syncOutside(ctx.me);
    },
    update(c) {
      const me = c.me;
      const autoChanged = trackAuto(me);
      const invChanged = inventoryChanged(me);
      if (invChanged || autoChanged) {
        syncOutside(me);
        if (open) refresh();
      } else if (open && ((tagRevertAt > 0 && c.now >= tagRevertAt) || (hintFlash !== null && c.now >= hintFlash.until))) {
        // 临时标签 / 临时小字到点了：换回常态
        refresh();
      }
      tickNotice(c.now);
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type !== 'itemBought' || ev.unitId !== c.state.playerId) return;
      const def = ITEMS[ev.itemId];
      if (ev.auto) {
        // 自动出装买到手：小地图下方出一条不打扰的提示(音效由音频层按事件播，这里不再响一次)
        const upgrade = def.category === 'boots' && def.tier === 2;
        const tag = upgrade ? '已自动升级' : '已自动购买';
        pushNotice({ tag, text: def.name, itemId: ev.itemId, warn: false });
        if (open) hintFlash = { text: `${tag} ${def.name}`, warn: false, until: c.now + NOTICE_LIFE };
      }
      if (!open) return;
      for (const card of cards) {
        if (card.id !== ev.itemId) continue;
        replay(card.el, 'is-flash');
        if (ev.auto) card.autoUntil = c.now + NOTICE_LIFE;
      }
      if (ev.auto) replay(autoBox, 'is-flash');
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
