/**
 * 记分板：双方 10 人的头像、等级、K/D/A、补刀、经济(累计金币)、装备与复活倒计时。
 * 按住 Tab 临时查看(不拦截操作)；点右上按钮则固定显示，点任意处或再点按钮关闭。
 * 打开时每秒刷新 4 次，不跟帧。
 */
import type { HeroUnit, ItemId, PlayerTeam } from '../../core/types';
import { itemIcon, uiIcon } from '../icons';
import { fmtK } from '../menu/shared';
import { createIconButton, h, icon, injectStyle, sfCss } from '../theme';
import { classSlot, fmtTime, numSlot, textSlot, type HudCtx, type HudPart } from './common';
import { heroFace } from './face';

const CSS = sfCss(`
.sf-hud__sb { position: absolute; inset: 0; z-index: 6; display: none; place-items: center; pointer-events: none;
  padding: max(8u, var(--sf-safe-t)) max(12u, var(--sf-safe-r)) max(8u, var(--sf-safe-b)) max(12u, var(--sf-safe-l)); }
.sf-hud__sb.is-open { display: grid; }
.sf-hud__sb.is-pinned { pointer-events: auto; background: rgba(3, 6, 16, 0.4); }
.sf-hud__sb-panel { display: flex; flex-direction: column; width: min(100%, 780u); max-height: 100%; min-height: 0; animation: sf-pop-in 0.2s var(--sf-ease-out) both; }
.sf-hud__sb-head { display: flex; align-items: center; gap: 12u; flex: none; padding: 7u 8u 5u 20u; box-shadow: inset 0 -1px 0 var(--sf-c-line-strong); }
.sf-hud__sb-title { margin: 0; font-size: var(--sf-fs-lg); font-weight: 800; letter-spacing: 0.24em; line-height: 1.3; }
.sf-hud__sb-time { display: inline-flex; align-items: center; gap: 4u; font-size: var(--sf-fs-sm); font-weight: 700; color: var(--sf-c-text-2); margin-right: auto; }
.sf-hud__sb-time .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__sb-hint { font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); }
.sf-hud__sb-close { display: none; }
.sf-hud__sb.is-pinned .sf-hud__sb-close { display: inline-grid; }
.sf-hud__sb.is-pinned .sf-hud__sb-hint { display: none; }
.sf-hud__sb-body { flex: 1; min-height: 0; padding: 6u 12u 10u; --cols: minmax(0, 1.5fr) minmax(64u, 0.8fr) minmax(40u, 0.5fr) minmax(52u, 0.6fr) auto; }
.sf-hud__sb-cols, .sf-hud__sb-row { display: grid; grid-template-columns: var(--cols); align-items: center; gap: 0 10u; padding: 0 8u 0 6u; }
.sf-hud__sb-cols { height: 20u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); letter-spacing: 0.08em; }
.sf-hud__sb-cols span { white-space: nowrap; }
.sf-hud__sb-short { display: none; }
.sf-hud__sb-cols > :not(:first-child), .sf-hud__sb-row > :not(:first-child) { text-align: center; justify-self: center; }
.sf-hud__sb-team { display: flex; align-items: center; gap: 12u; height: 25u; margin-top: 3u; padding: 0 10u; border-radius: 5u 5u 0 0; font-size: var(--sf-fs-sm); font-weight: 800; letter-spacing: 0.12em; }
.sf-hud__sb-team.is-blue { color: #9ccfff; background: linear-gradient(90deg, rgba(34, 104, 214, 0.5), rgba(34, 104, 214, 0.06)); box-shadow: inset 3px 0 0 var(--sf-c-blue); }
.sf-hud__sb-team.is-red { color: #ff9c9c; background: linear-gradient(90deg, rgba(196, 44, 58, 0.5), rgba(196, 44, 58, 0.06)); box-shadow: inset 3px 0 0 var(--sf-c-red); }
.sf-hud__sb-team span { display: inline-flex; align-items: center; gap: 4u; font-size: var(--sf-fs-xs); font-weight: 700; letter-spacing: 0.02em; color: var(--sf-c-text-2); }
.sf-hud__sb-team .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__sb-row { height: 36u; background: rgba(20, 34, 72, 0.4); box-shadow: inset 0 -1px 0 var(--sf-c-line); font-size: var(--sf-fs-md); font-weight: 700; }
.sf-hud__sb-row:nth-child(odd) { background: rgba(20, 34, 72, 0.22); }
.sf-hud__sb-row.is-me { background: linear-gradient(90deg, rgba(183, 243, 107, 0.2), rgba(183, 243, 107, 0.04)); box-shadow: inset 0 0 0 1px rgba(183, 243, 107, 0.5); }
.sf-hud__sb-hero { display: flex; align-items: center; gap: 9u; min-width: 0; }
.sf-hud__sb-hero .sf-hud__face { --sz: 28u; }
.sf-hud__sb-facebox { position: relative; flex: none; }
.sf-hud__sb-lv { position: absolute; right: -5u; bottom: -4u; display: grid; place-items: center; min-width: max(14px, 15u); height: max(14px, 15u); padding: 0 2u; border-radius: 99px; font-size: max(10px, 10.5u); font-weight: 800; line-height: 1; color: #2b1a04; background: var(--sf-grad-gold); box-shadow: 0 0 0 1.5px #0a1128; }
.sf-hud__sb-name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-hud__sb-respawn { display: none; align-items: center; gap: 3u; flex: none; font-size: var(--sf-fs-xs); color: #ff9c9c; }
.sf-hud__sb-respawn .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__sb-row.is-dead .sf-hud__sb-respawn { display: inline-flex; }
.sf-hud__sb-row.is-dead .sf-hud__sb-name { color: var(--sf-c-text-3); }
.sf-hud__sb-row.is-dead .sf-hud__face > img { filter: grayscale(1) brightness(0.6); }
.sf-hud__sb-kda i { font-style: normal; color: var(--sf-c-text-4); margin: 0 3u; }
.sf-hud__sb-kda .is-d { color: #ff8d8d; }
.sf-hud__sb-kda .is-a { color: var(--sf-c-text-2); }
.sf-hud__sb-gold { color: var(--sf-c-gold-200); }
.sf-hud__sb-items { display: flex; gap: 3u; }
.sf-hud__sb-items .sf-slot { --sf-slot: 25u; border-radius: 4u; box-shadow: 0 0 0 1px rgba(224, 177, 96, 0.5); }
.sf-hud__sb-items .sf-slot--empty { box-shadow: inset 0 0 0 1px var(--sf-c-line); }

@media (orientation: landscape) and (max-height: 470px) {
  .sf-hud__sb-row { height: 31u; }
  .sf-hud__sb-team { height: 22u; }
  .sf-hud__sb-head { padding-top: 4u; padding-bottom: 3u; }
  .sf-hud__sb-body { padding-bottom: 6u; }
  .sf-hud__sb-hero .sf-hud__face { --sz: 25u; }
  .sf-hud__sb-items .sf-slot { --sf-slot: 23u; }
}
/* 竖屏：装备换到第二行，其余列收窄 */
@media (orientation: portrait) {
  .sf-hud__sb-body { padding: 6u 8u 10u; --cols: minmax(0, 1.5fr) minmax(70u, 0.9fr) minmax(34u, 0.4fr) minmax(46u, 0.5fr); }
  .sf-hud__sb-cols > :last-child { display: none; }
  .sf-hud__sb-long { display: none; }
  .sf-hud__sb-short { display: inline; }
  .sf-hud__sb-row { height: auto; padding-top: 5u; padding-bottom: 5u; row-gap: 4u; }
  .sf-hud__sb-items { grid-column: 1 / -1; justify-self: start !important; padding-left: 37u; }
  .sf-hud__sb-items .sf-slot { --sf-slot: 22u; }
  .sf-hud__sb-hint { display: none; }
}
`);

interface Row {
  el: HTMLElement;
  setLv: (n: number) => void;
  setK: (n: number) => void;
  setD: (n: number) => void;
  setA: (n: number) => void;
  setCs: (n: number) => void;
  setGold: (n: number) => void;
  setRespawn: (n: number) => void;
  setDead: (b: boolean) => void;
  slots: HTMLElement[];
  items: (ItemId | null)[];
}

export interface Scoreboard extends HudPart {
  el: HTMLElement;
  setOpen(open: boolean, pinned: boolean): void;
  isOpen(): boolean;
  isPinned(): boolean;
}

export function createScoreboard(ctx: HudCtx): Scoreboard {
  injectStyle('sf-hud-sb', CSS);
  let open = false;
  let pinned = false;
  let lastRefresh = -1;

  const timeN = h('span', 'sf-num', '00:00');
  const setTime = numSlot(timeN, fmtTime);
  const closeBtn = createIconButton({ icon: uiIcon('close'), label: '关闭记分板', quiet: true, sound: 'back', cls: 'sf-hud__sb-close', onClick: () => ctx.actions.setScoreboard(false, false) });
  const head = h('header', 'sf-hud__sb-head', h('h2', 'sf-hud__sb-title sf-metal', '战况'), h('span', 'sf-hud__sb-time', icon(uiIcon('clock')), timeN), h('span', 'sf-hud__sb-hint', '松开 Tab 关闭'), closeBtn);
  const body = h('div', 'sf-hud__sb-body sf-scroll', h('div', 'sf-hud__sb-cols', h('span', null, '英雄'), h('span', null, h('span', 'sf-hud__sb-long', '击杀 / 死亡 / 助攻'), h('span', 'sf-hud__sb-short', '杀 / 死 / 助')), h('span', null, '补刀'), h('span', null, '经济'), h('span', null, '装备')));

  const rows = new Map<number, Row>();
  const teamSetters: { kills: (n: number) => void; towers: (n: number) => void; gold: (s: string) => void }[] = [];

  function makeRow(hero: HeroUnit): Row {
    const lv = h('span', 'sf-hud__sb-lv sf-num');
    const respawnN = h('span', 'sf-num');
    const k = h('b', 'sf-num');
    const d = h('b', 'sf-num is-d');
    const a = h('b', 'sf-num is-a');
    const cs = h('span', 'sf-num');
    const gold = h('span', 'sf-hud__sb-gold sf-num');
    const itemsBox = h('span', 'sf-hud__sb-items');
    const slots: HTMLElement[] = [];
    for (let i = 0; i < hero.items.length; i++) {
      const s = h('span', 'sf-slot sf-slot--empty');
      slots.push(s);
      itemsBox.appendChild(s);
    }
    const el = h(
      'div',
      `sf-hud__sb-row${hero.isPlayer ? ' is-me' : ''}`,
      h(
        'span',
        'sf-hud__sb-hero',
        h('span', 'sf-hud__sb-facebox', heroFace(ctx.host, hero, ctx.team), lv),
        h('span', 'sf-hud__sb-name', hero.name),
        hero.isPlayer ? h('span', 'sf-badge sf-badge--me', '你') : null,
        h('span', 'sf-hud__sb-respawn', icon(uiIcon('hourglass')), respawnN),
      ),
      h('span', 'sf-hud__sb-kda', k, h('i', null, '/'), d, h('i', null, '/'), a),
      cs,
      gold,
      itemsBox,
    );
    return {
      el,
      setLv: numSlot(lv),
      setK: numSlot(k),
      setD: numSlot(d),
      setA: numSlot(a),
      setCs: numSlot(cs),
      setGold: numSlot(gold, fmtK),
      setRespawn: numSlot(respawnN, (n) => `${n}秒`),
      setDead: classSlot(el, 'is-dead'),
      slots,
      items: hero.items.map(() => null),
    };
  }

  // 我方在上、敌方在下
  const order: PlayerTeam[] = ctx.team === 0 ? [0, 1] : [1, 0];
  for (const team of order) {
    const mine = team === ctx.team;
    const killsN = h('b', 'sf-num');
    const towersN = h('b', 'sf-num');
    const goldN = h('b', 'sf-num');
    body.appendChild(
      h('div', `sf-hud__sb-team ${mine ? 'is-blue' : 'is-red'}`, mine ? '我方' : '敌方', h('span', null, icon(uiIcon('kill')), killsN), h('span', null, icon(uiIcon('tower')), towersN), h('span', null, icon(uiIcon('gold')), goldN)),
    );
    teamSetters[team] = { kills: numSlot(killsN), towers: numSlot(towersN), gold: textSlot(goldN) };
    const box = h('div');
    for (const hero of ctx.state.heroes) {
      if (hero.team !== team) continue;
      const row = makeRow(hero);
      rows.set(hero.id, row);
      box.appendChild(row.el);
    }
    body.appendChild(box);
  }

  const panel = h('div', 'sf-hud__sb-panel sf-panel', head, body);
  const el = h('div', 'sf-hud__sb', panel);
  el.addEventListener('pointerdown', (ev) => {
    if (pinned && ev.target === el) ctx.actions.setScoreboard(false, false);
  });

  function refresh(): void {
    const st = ctx.state;
    setTime(Math.floor(st.time));
    for (const team of order) {
      const t = st.teams[team];
      teamSetters[team].kills(t.kills);
      teamSetters[team].towers(t.towersDestroyed);
      let gold = 0;
      for (const hero of st.heroes) if (hero.team === team) gold += hero.goldEarned;
      teamSetters[team].gold(fmtK(gold));
    }
    for (const hero of st.heroes) {
      const r = rows.get(hero.id);
      if (!r) continue;
      r.setLv(hero.level);
      r.setK(hero.kills);
      r.setD(hero.deaths);
      r.setA(hero.assists);
      r.setCs(hero.cs);
      r.setGold(Math.floor(hero.goldEarned));
      r.setDead(!hero.alive);
      if (!hero.alive) r.setRespawn(Math.ceil(hero.respawnIn));
      for (let i = 0; i < r.slots.length; i++) {
        const id = hero.items[i] ?? null;
        if (id === r.items[i]) continue;
        r.items[i] = id;
        r.slots[i].innerHTML = id ? itemIcon(id) : '';
        r.slots[i].classList.toggle('sf-slot--empty', !id);
      }
    }
  }

  return {
    el,
    isOpen: () => open,
    isPinned: () => open && pinned,
    setOpen(v, pin) {
      if (v === open && pin === pinned) return;
      open = v;
      pinned = v && pin;
      el.classList.toggle('is-open', open);
      el.classList.toggle('is-pinned', pinned);
      if (open) {
        lastRefresh = ctx.now;
        refresh();
      }
    },
    update(c) {
      if (!open || c.now - lastRefresh < 0.25) return;
      lastRefresh = c.now;
      refresh();
    },
  };
}
