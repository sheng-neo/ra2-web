/**
 * 商店：小地图下方的商店按钮 + 「推荐装备可购买」快捷气泡 + 商店面板。
 * 面板：分类页签(推荐/攻击/法术/防御/鞋)、装备卡片(买得起/买不起/已有/栏位已满)、详情与购买、
 * 当前装备栏(点选后可出售，显示返还金额)、推荐出装顺序进度。
 * 商店不暂停对局（随时随地可买），所以面板打开时仍在每帧刷新可购买状态。
 */
import { ITEMS, ITEM_LIST, SELL_RATIO } from '../../core/data/items';
import type { GameEvent, HeroUnit, ItemDef, ItemId } from '../../core/types';
import { itemIcon, uiIcon } from '../icons';
import { createButton, createIconButton, createSlot, createTabs, h, icon, injectStyle, sfCss } from '../theme';
import { classSlot, numSlot, replay, type HudCtx, type HudPart } from './common';
import { BLOCK_TEXT, buildSteps, checkBuy, nextRecommended, sellValue, type BuildStep } from './rules';
import { CATEGORY_NAMES, statLines, statSummary, type ShopTab } from './text';

const CSS = sfCss(`
/* ── 商店按钮 + 快捷购买气泡（小地图下方） ── */
.sf-hud__shopbar { position: absolute; left: calc(var(--hud-l) + 4u); top: calc(var(--hud-t) + var(--hud-mini) + 12u); z-index: 3; display: flex; align-items: center; gap: 14u; }
/* 商店按钮：金色圆钮。金币数在右上角与状态栏里已经有了，这里不再重复 */
.sf-hud__shopbtn {
  position: relative; display: grid; place-items: center; flex: none; width: max(40px, 46u); height: max(40px, 46u); padding: 0; margin: 0; border: 0; border-radius: 50%; cursor: pointer;
  color: #2b1a04; background: var(--sf-grad-gold);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 0 0 1px #6b4614, 0 0 0 max(3px, 4u) rgba(8, 13, 31, 0.82), 0 0 0 max(4px, 5u) rgba(232, 199, 122, 0.55), 0 4u 12u rgba(2, 4, 12, 0.5);
  transition: transform 0.1s var(--sf-ease-out), filter 0.12s linear;
}
@media (hover: hover) { .sf-hud__shopbtn:hover { filter: brightness(1.12); } }
.sf-hud__shopbtn:active { transform: scale(0.93); }
.sf-hud__shopbtn > .sf-i { width: 58%; height: 58%; }
.sf-hud__shopbtn .sf-hud__key { right: -6u; top: -6u; }
.sf-hud__shopbtn.is-open { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 0 0 1px #6b4614, 0 0 0 max(3px, 4u) rgba(8, 13, 31, 0.82), 0 0 0 max(4px, 5u) #fff4d6, 0 0 16u rgba(255, 214, 130, 0.8); }
/* 有推荐装备可买时，按钮外圈跟着呼吸 */
.sf-hud__shopbtn.is-ready::after { content: ''; position: absolute; inset: -7u; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1.5px rgba(255, 231, 173, 0.85); animation: sf-hud-quick-pulse 1.4s ease-out infinite; }

.sf-hud__quick {
  position: relative; display: none; align-items: center; gap: 7u; height: max(40px, 46u); padding: 0 12u 0 4u; margin: 0; border: 0; border-radius: 9u; cursor: pointer;
  background: linear-gradient(180deg, rgba(64, 48, 14, 0.94), rgba(22, 16, 6, 0.95)); color: var(--sf-c-gold-100); text-align: left;
  box-shadow: inset 0 0 0 1px #f3cf85, 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 16u rgba(255, 214, 130, 0.55), 0 4u 12u rgba(2, 4, 12, 0.5);
  animation: sf-hud-quick-in 0.35s var(--sf-ease-spring) both;
}
.sf-hud__quick.is-on { display: inline-flex; }
.sf-hud__quick:active { transform: scale(0.95); }
.sf-hud__quick::before { content: ''; position: absolute; inset: -3u; border-radius: 12u; pointer-events: none; box-shadow: 0 0 0 1.5px rgba(255, 231, 173, 0.8); animation: sf-hud-quick-pulse 1.4s ease-out infinite; }
.sf-hud__quick .sf-slot { --sf-slot: max(32px, 38u); border-radius: 7u; }
.sf-hud__quick-text { display: flex; flex-direction: column; gap: 2u; }
.sf-hud__quick-tag { font-size: max(10px, 11u); font-weight: 800; letter-spacing: 0.08em; color: #2b1a04; background: var(--sf-grad-gold); border-radius: 3u; padding: 0 5u; align-self: flex-start; line-height: 1.5; white-space: nowrap; }
.sf-hud__quick-price { display: inline-flex; align-items: center; gap: 3u; font-size: var(--sf-fs-sm); font-weight: 800; line-height: 1; white-space: nowrap; }
.sf-hud__quick-price .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__quick-name { margin-right: 2u; }
@keyframes sf-hud-quick-in { from { opacity: 0; transform: translateX(-16u) scale(0.8); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-quick-pulse { 0% { opacity: 0.9; transform: scale(0.96); } 100% { opacity: 0; transform: scale(1.12); } }

/* ── 商店面板 ── */
.sf-hud__shop { position: absolute; inset: 0; z-index: 7; display: none; place-items: center; pointer-events: auto;
  padding: max(10u, var(--sf-safe-t)) max(12u, var(--sf-safe-r)) max(10u, var(--sf-safe-b)) max(12u, var(--sf-safe-l)); background: rgba(3, 6, 16, 0.5); }
.sf-hud__shop.is-open { display: grid; animation: sf-fade-in 0.16s linear both; }
.sf-hud__shop-panel { display: flex; flex-direction: column; width: min(100%, 960u); height: min(100%, 540u); min-height: 0; animation: sf-pop-in 0.26s var(--sf-ease-out) both; }
.sf-hud__shop-head { display: flex; align-items: center; gap: 12u; flex: none; padding: 6u 8u 0 20u; box-shadow: inset 0 -1px 0 var(--sf-c-line-strong); }
.sf-hud__shop-title { margin: 0; font-size: var(--sf-fs-xl); font-weight: 800; letter-spacing: 0.2em; line-height: 1.2; white-space: nowrap; }
.sf-hud__shop-head .sf-tabs { flex: 1; box-shadow: none; min-width: 0; }
.sf-hud__shop-head .sf-tab { padding: 0 14u; }
.sf-hud__shop-gold { color: var(--sf-c-gold-200); font-size: var(--sf-fs-md); }
.sf-hud__shop-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) max(232px, 268u); }
.sf-hud__shop-list { min-height: 0; padding: 12u 12u 12u 16u; }
.sf-hud__shop-prog { display: flex; align-items: center; gap: 8u; margin-bottom: 10u; font-size: var(--sf-fs-sm); color: var(--sf-c-text-2); }
.sf-hud__shop-prog b { color: var(--sf-c-gold-200); }
.sf-hud__shop-steps { display: flex; align-items: center; gap: 3u; margin-left: auto; }
.sf-hud__shop-steps > i { width: 18u; height: max(4px, 5u); border-radius: 3u; background: rgba(4, 8, 22, 0.8); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-hud__shop-steps > i.is-done { background: var(--sf-grad-gold); box-shadow: 0 0 6u rgba(255, 214, 130, 0.6); }
.sf-hud__shop-steps > i.is-next { background: var(--sf-c-cyan-400); box-shadow: 0 0 6u rgba(92, 214, 247, 0.7); animation: sf-hud-blink 1s steps(2, jump-none) infinite; }
.sf-hud__shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(max(168px, 196u), 1fr)); gap: 8u; }

.sf-hud__card {
  position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2u 9u; min-height: max(52px, 58u); padding: 6u 8u; margin: 0; border: 0; border-radius: 8u; cursor: pointer; text-align: left; color: var(--sf-c-text);
  background: linear-gradient(180deg, rgba(34, 54, 110, 0.5), rgba(10, 17, 40, 0.6)); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong);
  transition: box-shadow 0.12s linear, background 0.12s linear, transform 0.1s var(--sf-ease-out);
}
@media (hover: hover) { .sf-hud__card:hover { background: linear-gradient(180deg, rgba(48, 74, 146, 0.6), rgba(14, 24, 54, 0.7)); } }
.sf-hud__card:active { transform: scale(0.98); }
.sf-hud__card .sf-slot { --sf-slot: max(38px, 44u); grid-row: 1 / span 2; }
.sf-hud__card-name { font-size: var(--sf-fs-md); font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 2.6em; }
.sf-hud__card-sub { display: flex; align-items: center; gap: 8u; min-width: 0; font-size: var(--sf-fs-xs); line-height: 1.2; color: var(--sf-c-text-3); }
.sf-hud__card-price { display: inline-flex; align-items: center; gap: 3u; flex: none; font-size: var(--sf-fs-sm); font-weight: 800; color: var(--sf-c-gold-200); }
.sf-hud__card-price .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__card-stats { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sf-c-cyan-300); }
.sf-hud__card-tag { position: absolute; right: 6u; top: 5u; display: none; padding: 1u 5u; border-radius: 3u; font-size: max(10px, 10.5u); font-weight: 800; line-height: 1.3; letter-spacing: 0.04em; }
.sf-hud__card.is-poor .sf-hud__card-price { color: #ff8d8d; }
.sf-hud__card.is-poor .sf-slot > svg, .sf-hud__card.is-blocked .sf-slot > svg { filter: saturate(0.5) brightness(0.72); }
.sf-hud__card.is-blocked { opacity: 0.62; }
.sf-hud__card.is-afford { box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.55); }
.sf-hud__card.is-sel { background: linear-gradient(180deg, rgba(86, 124, 210, 0.42), rgba(20, 34, 72, 0.8)); box-shadow: inset 0 0 0 max(1.5px, 2u) var(--sf-c-gold-100), 0 0 14u rgba(255, 214, 130, 0.4); opacity: 1; }
.sf-hud__card.has-tag .sf-hud__card-tag { display: block; }
.sf-hud__card-tag.is-own { color: #0f2a1a; background: linear-gradient(180deg, #b8f5cf, #6fe3a1); }
.sf-hud__card-tag.is-next { color: #06222c; background: linear-gradient(180deg, #c9f6ff, #5cd6f7); }
.sf-hud__card-tag.is-done { color: #2b1a04; background: var(--sf-grad-gold); }
.sf-hud__card-tag.is-step { color: var(--sf-c-text-2); background: rgba(4, 8, 22, 0.7); box-shadow: inset 0 0 0 1px var(--sf-c-line-strong); }
.sf-hud__card.is-flash { animation: sf-hud-card-buy 0.5s ease-out; }
@keyframes sf-hud-card-buy { 0% { filter: brightness(2.2); } 100% { filter: none; } }

/* 详情 */
.sf-hud__shop-detail { display: flex; flex-direction: column; min-height: 0; padding: 12u 14u 12u; box-shadow: inset 1px 0 0 var(--sf-c-line-strong); background: rgba(4, 8, 22, 0.35); }
.sf-hud__dt-head { display: flex; align-items: center; gap: 10u; flex: none; }
.sf-hud__dt-head .sf-slot { --sf-slot: max(48px, 58u); }
.sf-hud__dt-name { font-size: var(--sf-fs-lg); font-weight: 800; color: var(--sf-c-gold-200); line-height: 1.25; letter-spacing: 0.04em; }
.sf-hud__dt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5u; margin-top: 3u; }
.sf-hud__dt-body { flex: 1; min-height: 0; margin: 8u -6u 8u 0; padding-right: 6u; }
.sf-hud__dt-stats { display: grid; grid-template-columns: 1fr auto; gap: 3u 10u; font-size: var(--sf-fs-sm); line-height: 1.35; }
.sf-hud__dt-stats > span { color: var(--sf-c-text-2); }
.sf-hud__dt-stats > b { color: var(--sf-c-cyan-300); font-weight: 700; text-align: right; }
.sf-hud__dt-passive { margin-top: 8u; padding: 7u 9u; border-radius: 6u; background: rgba(255, 184, 77, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 184, 77, 0.28); font-size: var(--sf-fs-sm); line-height: 1.5; color: var(--sf-c-text-2); }
.sf-hud__dt-passive b { display: block; color: var(--sf-c-amber); font-weight: 700; }
.sf-hud__dt-note { flex: none; min-height: 1.5em; margin-bottom: 6u; font-size: var(--sf-fs-sm); line-height: 1.4; color: var(--sf-c-text-3); }
.sf-hud__dt-note.is-warn { color: #ff9c9c; }
.sf-hud__dt-note.is-good { color: var(--sf-c-green); }
.sf-hud__dt-note b { font-weight: 800; }
.sf-hud__dt-empty { margin: auto; text-align: center; color: var(--sf-c-text-3); font-size: var(--sf-fs-sm); }
.sf-hud__shop-detail .sf-btn .sf-i { width: 1.15em; height: 1.15em; }

/* 装备栏 */
.sf-hud__shop-inv { display: flex; align-items: center; gap: 10u; flex: none; padding: 8u 16u 10u; box-shadow: inset 0 1px 0 var(--sf-c-line-strong); }
.sf-hud__shop-inv > .sf-heading { flex: none; width: auto; }
.sf-hud__shop-inv > .sf-heading::after { display: none; }
.sf-hud__shop-slots { display: flex; gap: 6u; }
.sf-hud__shop-slots .sf-slot { --sf-slot: max(36px, 40u); }
.sf-hud__shop-slots button.sf-slot--empty { cursor: default; }
.sf-hud__shop-hint { margin-left: auto; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); text-align: right; }

/* 矮横屏(手机)：压缩留白 */
@media (orientation: landscape) and (max-height: 460px) {
  .sf-hud__shop { padding-top: max(4px, var(--sf-safe-t)); padding-bottom: max(4px, var(--sf-safe-b)); }
  .sf-hud__shop-list { padding: 8u 10u 8u 12u; }
  .sf-hud__shop-inv { padding: 5u 12u 6u; }
  .sf-hud__shop-detail { padding: 8u 12u; }
  .sf-hud__shop-hint { display: none; }
}
/* 竖屏：列表在上、详情在下；快捷气泡收窄(不写装备名)，给右侧击杀流让位 */
@media (orientation: portrait) {
  .sf-hud__quick-name { display: none; }
  .sf-hud__quick-tag { letter-spacing: 0; }
  .sf-hud__shop-panel { height: min(100%, 780u); }
  .sf-hud__shop-head { flex-wrap: wrap; padding: 8u 8u 0 14u; gap: 4u 10u; }
  .sf-hud__shop-title { flex: 1; }
  .sf-hud__shop-head .sf-tabs { order: 5; flex: 0 0 100%; }
  .sf-hud__shop-head .sf-tab { flex: 1; padding: 0 4u; }
  .sf-hud__shop-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .sf-hud__shop-list { padding: 10u; }
  .sf-hud__shop-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6u; }
  .sf-hud__shop-detail { box-shadow: inset 0 1px 0 var(--sf-c-line-strong); max-height: 300u; padding: 10u 12u; }
  .sf-hud__shop-inv { padding: 8u 12u 10u; }
  .sf-hud__shop-hint { display: none; }
}
`);

const TABS: ShopTab[] = ['recommend', 'attack', 'magic', 'defense', 'boots'];
const TIER_NAME = { 1: '基础', 2: '成装' } as const;

interface Card {
  id: ItemId;
  el: HTMLButtonElement;
  price: HTMLElement;
  tag: HTMLElement;
  step: BuildStep | null;
  stepIndex: number;
}

type Selection = { kind: 'shop'; id: ItemId } | { kind: 'inv'; index: number } | null;

export interface Shop extends HudPart {
  els: HTMLElement[];
  setOpen(open: boolean): void;
  isOpen(): boolean;
}

export function createShop(ctx: HudCtx): Shop {
  injectStyle('sf-hud-shop', CSS);
  let open = false;
  let tab: ShopTab = 'recommend';
  let sel: Selection = null;
  let cards: Card[] = [];
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

  // ── 快捷购买气泡 ──
  const quickSlot = createSlot(null);
  const quickName = h('span', 'sf-hud__quick-name');
  const quickPriceN = h('span', 'sf-num');
  const quick = h('button', 'sf-hud__quick', quickSlot, h('span', 'sf-hud__quick-text', h('span', 'sf-hud__quick-tag', '推荐 · 可购买'), h('span', 'sf-hud__quick-price', icon(uiIcon('gold')), quickName, quickPriceN)));
  quick.type = 'button';
  quick.tabIndex = -1;
  quick.addEventListener('click', () => {
    if (quickId) ctx.actions.buy(quickId);
  });
  const shopbar = h('div', 'sf-hud__shopbar', shopBtn, quick);

  // ── 面板 ──
  const tabs = createTabs<ShopTab>({
    tabs: TABS.map((id) => ({ id, label: CATEGORY_NAMES[id] })),
    value: tab,
    onChange: (id) => {
      tab = id;
      rebuildList();
    },
  });
  const panelGoldN = h('b', 'sf-num', '0');
  const setPanelGold = numSlot(panelGoldN);
  const closeBtn = createIconButton({ icon: uiIcon('close'), label: '关闭商店', quiet: true, sound: 'back', onClick: () => ctx.actions.setShop(false) });
  const head = h('header', 'sf-hud__shop-head', h('h2', 'sf-hud__shop-title sf-metal', '星陨商店'), tabs.el, h('span', 'sf-hud__chip sf-hud__shop-gold', icon(uiIcon('gold')), panelGoldN), closeBtn);
  const prog = h('div', 'sf-hud__shop-prog');
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
  const inv = h('footer', 'sf-hud__shop-inv', h('h3', 'sf-heading', '我的装备'), invBox, h('span', 'sf-hud__shop-hint', `点选装备可出售，返还 ${Math.round(SELL_RATIO * 100)}% 金币`));
  const panel = h('div', 'sf-hud__shop-panel sf-panel', head, h('div', 'sf-hud__shop-body', list, detail), inv);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '商店');
  const scrim = h('div', 'sf-hud__shop', panel);
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target === scrim) ctx.actions.setShop(false);
  });

  function itemsOfTab(me: HeroUnit): { id: ItemId; step: BuildStep | null; index: number }[] {
    if (tab === 'recommend') return buildSteps(me).map((s, i) => ({ id: s.itemId, step: s, index: i }));
    return ITEM_LIST.filter((it) => it.category === tab)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost)
      .map((it) => ({ id: it.id, step: null, index: -1 }));
  }

  function rebuildList(): void {
    const me = ctx.me;
    grid.textContent = '';
    cards = [];
    for (const it of itemsOfTab(me)) {
      const def = ITEMS[it.id];
      const price = h('span', 'sf-num');
      const tag = h('span', 'sf-hud__card-tag');
      const el = h(
        'button',
        'sf-hud__card',
        createSlot(itemIcon(it.id)),
        h('span', 'sf-hud__card-name', def.name),
        h('span', 'sf-hud__card-sub', h('span', 'sf-hud__card-price', icon(uiIcon('gold')), price), h('span', 'sf-hud__card-stats', statSummary(def.stats, 2))),
        tag,
      );
      el.type = 'button';
      el.dataset.sfSnd = 'select';
      el.dataset.item = it.id;
      el.addEventListener('click', () => {
        sel = { kind: 'shop', id: it.id };
        refresh();
      });
      el.addEventListener('dblclick', () => ctx.actions.buy(it.id));
      grid.appendChild(el);
      cards.push({ id: it.id, el, price, tag, step: it.step, stepIndex: it.index });
    }
    // 默认选中：推荐页 = 下一件该买的；其它页 = 第一件
    if (!sel || sel.kind === 'shop') {
      const next = tab === 'recommend' ? nextRecommended(me) : null;
      const first = next ?? cards[0]?.id ?? null;
      sel = first ? { kind: 'shop', id: first } : null;
    }
    list.scrollTop = 0;
    refresh();
  }

  // 详情区：结构只在「选中项 / 装备栏」变化时重建；金币变化只改提示文字与按钮状态。
  // 金币每秒都在涨，如果每次都整块重建，玩家按下购买键的瞬间按钮可能刚好被换掉，点击就丢了。
  let dtNote: HTMLElement | null = null;
  let dtAction: HTMLButtonElement | null = null;
  let dtActionLabel: HTMLElement | null = null;

  function renderDetail(me: HeroUnit): void {
    detail.textContent = '';
    dtNote = dtAction = dtActionLabel = null;
    const id = sel ? (sel.kind === 'inv' ? me.items[sel.index] : sel.id) : null;
    if (!sel || !id) {
      detail.appendChild(h('div', 'sf-hud__dt-empty', '选择一件装备查看详情'));
      return;
    }
    const def: ItemDef = ITEMS[id];
    const meta = h('div', 'sf-hud__dt-meta', h('span', 'sf-badge sf-badge--mute', CATEGORY_NAMES[def.category]), h('span', `sf-badge${def.tier === 2 ? '' : ' sf-badge--mute'}`, TIER_NAME[def.tier]));
    const stats = h('div', 'sf-hud__dt-stats');
    for (const row of statLines(def.stats)) stats.append(h('span', null, row.label), h('b', 'sf-num', row.value));
    const body = h('div', 'sf-hud__dt-body sf-scroll', stats);
    if (def.passive) body.appendChild(h('div', 'sf-hud__dt-passive', h('b', null, `被动 · ${def.passive.name}`), def.passive.desc));
    dtNote = h('div', 'sf-hud__dt-note');
    if (sel.kind === 'inv') {
      const index = sel.index;
      dtAction = createButton({ label: '出售', icon: uiIcon('gold'), variant: 'danger', block: true, sound: 'none', onClick: () => ctx.actions.sell(index) });
    } else {
      dtAction = createButton({ label: '购买', icon: uiIcon('gold'), variant: 'primary', block: true, sound: 'none', onClick: () => ctx.actions.buy(id) });
      // 买不起也要能点：点了给出提示音与原因，而不是没反应
      dtAction.style.pointerEvents = 'auto';
    }
    dtActionLabel = dtAction.querySelector<HTMLElement>('.sf-btn__label');
    detail.append(h('div', 'sf-hud__dt-head', createSlot(itemIcon(id)), h('div', null, h('div', 'sf-hud__dt-name', def.name), meta)), body, dtNote, dtAction);
  }

  /** 详情区里随金币变化的部分：提示行与按钮文字/可用态 */
  function updateDetail(me: HeroUnit): void {
    if (!sel || !dtNote || !dtAction || !dtActionLabel) return;
    const id = sel.kind === 'inv' ? me.items[sel.index] : sel.id;
    if (!id) return;
    const note = dtNote;
    note.textContent = '';
    note.className = 'sf-hud__dt-note';
    if (sel.kind === 'inv') {
      const back = sellValue(id);
      note.append('出售后返还 ', h('b', 'sf-num sf-gold', String(back)), ' 金币');
      dtActionLabel.textContent = `出售 +${back}`;
      return;
    }
    const def = ITEMS[id];
    const chk = checkBuy(me, id);
    if (chk.ok) {
      note.classList.add('is-good');
      if (chk.replaces) note.append(`替换${ITEMS[chk.replaces].name}，已抵扣 `, h('b', 'sf-num', String(def.cost - chk.cost)), ' 金币');
      else note.append('购买后剩余 ', h('b', 'sf-num', String(Math.floor(me.gold - chk.cost))), ' 金币');
    } else {
      note.classList.add('is-warn');
      if (chk.block === 'gold') note.append('金币不足，还差 ', h('b', 'sf-num', String(Math.ceil(chk.cost - me.gold))));
      else if (chk.block === 'full') note.append('装备栏已满，请先出售一件装备');
      else if (chk.block === 'boots_owned') note.append('已有鞋子，可直接购买进阶鞋替换');
      else note.append('已拥有这双鞋');
    }
    dtActionLabel.textContent = `购买 ${chk.cost}`;
    dtAction.classList.toggle('is-disabled', !chk.ok);
  }

  let progKey = '';
  let lastItemsKey = '';

  /** 刷新卡片状态/装备栏/详情（调用方保证：金币/装备栏/选择/列表至少有一样变了） */
  function refresh(): void {
    const me = ctx.me;
    const itemsKey = me.items.join(',');
    setPanelGold(Math.floor(me.gold));

    const steps = tab === 'recommend' ? buildSteps(me) : null;
    // 推荐页里选中的那件刚买到手(这一步已完成)：选择自动跳到新的「下一件」，可以连着买
    if (steps && itemsKey !== lastItemsKey && sel?.kind === 'shop') {
      const cur = sel.id;
      const pending = steps.some((x) => x.itemId === cur && !x.done);
      const next = steps.find((x) => x.next);
      if (!pending && next) sel = { kind: 'shop', id: next.itemId };
    }
    lastItemsKey = itemsKey;
    const owned = new Map<ItemId, number>();
    for (const id of me.items) if (id) owned.set(id, (owned.get(id) ?? 0) + 1);
    for (const card of cards) {
      const chk = checkBuy(me, card.id);
      const step = steps ? steps[card.stepIndex] : null;
      const n = owned.get(card.id) ?? 0;
      const blocked = chk.block === 'full' || chk.block === 'boots_owned' || chk.block === 'boots_same';
      card.el.classList.toggle('is-afford', chk.ok);
      card.el.classList.toggle('is-poor', chk.block === 'gold');
      card.el.classList.toggle('is-blocked', blocked || (!!step && step.done));
      card.el.classList.toggle('is-sel', sel?.kind === 'shop' && sel.id === card.id);
      const price = String(chk.cost);
      if (card.price.textContent !== price) card.price.textContent = price;
      let tagText = '';
      let tagCls = '';
      if (step) {
        if (step.done) [tagText, tagCls] = ['已完成', 'is-done'];
        else if (step.next) [tagText, tagCls] = ['下一件', 'is-next'];
        else [tagText, tagCls] = [`第 ${card.stepIndex + 1} 件`, 'is-step'];
      } else if (n > 0) [tagText, tagCls] = [n > 1 ? `已有 ×${n}` : '已有', 'is-own'];
      else if (blocked) [tagText, tagCls] = [BLOCK_TEXT[chk.block as 'full' | 'boots_owned' | 'boots_same'], 'is-step'];
      if (card.tag.textContent !== tagText) card.tag.textContent = tagText;
      card.tag.className = `sf-hud__card-tag ${tagCls}`;
      card.el.classList.toggle('has-tag', tagText !== '');
    }

    // 推荐进度只跟装备栏有关
    const pk = steps ? itemsKey : '-';
    if (pk !== progKey) {
      progKey = pk;
      prog.textContent = '';
      prog.hidden = !steps;
      if (steps) {
        const done = steps.filter((x) => x.done).length;
        const pipBox = h('span', 'sf-hud__shop-steps');
        for (const x of steps) pipBox.appendChild(h('i', x.done ? 'is-done' : x.next ? 'is-next' : ''));
        prog.append('推荐出装顺序', h('b', 'sf-num', `${done} / ${steps.length}`), pipBox);
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
    // 选中的装备栏格子被卖空了：退回商店选择
    if (sel?.kind === 'inv' && !me.items[sel.index]) {
      const next = nextRecommended(me);
      sel = next && tab === 'recommend' ? { kind: 'shop', id: next } : cards[0] ? { kind: 'shop', id: cards[0].id } : null;
      for (const card of cards) card.el.classList.toggle('is-sel', sel?.kind === 'shop' && sel.id === card.id);
    }
    const dKey = `${itemsKey}|${sel ? (sel.kind === 'shop' ? sel.id : `inv${sel.index}`) : ''}`;
    if (dKey !== detailKey) {
      detailKey = dKey;
      renderDetail(me);
    }
    updateDetail(me);
  }

  function syncQuick(me: HeroUnit): void {
    const next = nextRecommended(me);
    const chk = next ? checkBuy(me, next) : null;
    // 面板开着时不弹：此刻玩家正在面板里挑
    const show = !!next && !!chk && chk.ok && !open;
    const id = show ? next : null;
    if (id !== quickId) {
      quickId = id;
      quick.classList.toggle('is-on', !!id);
      setBtnReady(!!id);
      if (id) {
        quickSlot.innerHTML = itemIcon(id);
        quickSlot.classList.remove('sf-slot--empty');
        quick.setAttribute('aria-label', `快捷购买 ${ITEMS[id].name}`);
      }
    }
    if (id && chk) {
      quickName.textContent = ITEMS[id].name;
      quickPriceN.textContent = String(chk.cost);
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

  return {
    els: [shopbar, scrim],
    isOpen: () => open,
    setOpen(v) {
      if (v === open) return;
      open = v;
      scrim.classList.toggle('is-open', v);
      setBtnOpen(v);
      if (v) {
        sel = null;
        detailKey = '';
        progKey = '';
        lastItemsKey = ctx.me.items.join(',');
        rebuildList();
      }
      syncQuick(ctx.me);
    },
    update(c) {
      const me = c.me;
      if (!inventoryChanged(me)) return;
      syncQuick(me);
      if (open) refresh();
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type === 'itemBought' && ev.unitId === c.state.playerId && open) {
        for (const card of cards) if (card.id === ev.itemId) replay(card.el, 'is-flash');
      }
    },
  };
}
