/**
 * 右侧击杀播报流：击杀者 → 被杀者（助攻小头像排在前面），以及推塔、史诗野怪的战报。
 * 条目按击杀方上色：我方得手偏蓝，敌方得手偏红；与玩家有关的条目加金绿描边。
 */
import { MONSTERS } from '../../core/data/units';
import type { GameEvent } from '../../core/types';
import { uiIcon } from '../icons';
import { h, injectStyle, sfCss } from '../theme';
import type { HudCtx, HudPart } from './common';
import { glyphFace, heroFace, teamCls } from './face';

const CSS = sfCss(`
.sf-hud__feed { position: absolute; right: var(--hud-r); top: calc(var(--hud-t) + max(46px, 50u)); z-index: 3; display: flex; flex-direction: column; align-items: flex-end; gap: 5u; }
.sf-hud__kf {
  --tone: 77, 163, 255;
  position: relative; display: flex; align-items: center; gap: 6u; height: 34u; padding: 0 10u 0 30u; border-radius: 0 6u 6u 0;
  background: linear-gradient(90deg, rgba(var(--tone), 0), rgba(var(--tone), 0.3) 26%, rgba(var(--tone), 0.12) 70%), linear-gradient(90deg, rgba(9, 15, 36, 0), rgba(9, 15, 36, 0.88) 14%, rgba(9, 15, 36, 0.93));
  box-shadow: inset -3px 0 0 rgba(var(--tone), 0.95);
  animation: sf-hud-kf-in 0.32s var(--sf-ease-out) both;
}
.sf-hud__kf.is-foe { --tone: 255, 93, 93; }
.sf-hud__kf.is-me { box-shadow: inset -3px 0 0 var(--sf-c-me); }
.sf-hud__kf.is-me::after { content: ''; position: absolute; left: 22%; right: 0; top: 0; bottom: 0; border-radius: 0 6u 6u 0; pointer-events: none; box-shadow: inset 0 1px 0 rgba(183, 243, 107, 0.55), inset 0 -1px 0 rgba(183, 243, 107, 0.55); }
.sf-hud__kf.is-out { animation: sf-hud-kf-out 0.4s var(--sf-ease-in) both; }
.sf-hud__kf .sf-hud__face { --sz: 26u; }
.sf-hud__kf-assists { display: flex; align-items: center; margin-right: 2u; }
.sf-hud__kf-assists .sf-hud__face { --sz: 17u; margin-left: -4u; box-shadow: 0 0 0 1.5px var(--ring); }
.sf-hud__kf-assists .sf-hud__face:first-child { margin-left: 0; }
.sf-hud__kf-plus { font-size: var(--sf-fs-xs); font-weight: 800; color: var(--sf-c-text-2); margin: 0 1u 0 2u; }
.sf-hud__kf-ico { width: 15u; height: 15u; color: #fff; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8)); }
.sf-hud__kf-ico > svg { display: block; width: 100%; height: 100%; }
.sf-hud__kf-text { font-size: var(--sf-fs-xs); font-weight: 700; color: var(--sf-c-text); letter-spacing: 0.04em; white-space: nowrap; text-shadow: var(--hud-shadow-text); }
@keyframes sf-hud-kf-in { from { opacity: 0; transform: translateX(40u); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-kf-out { to { opacity: 0; transform: translateX(24u); } }
@media (orientation: portrait) { .sf-hud__feed { top: calc(var(--hud-t) + max(96px, 106u)); } }
`);

const LIFE = 6.5;
const MAX = 4;
const LANE_NAME = { top: '上路', mid: '中路', bot: '下路' } as const;
const TIER_NAME = { 1: '一塔', 2: '二塔', 3: '高地塔' } as const;

interface Entry {
  el: HTMLElement;
  until: number;
  leaving: boolean;
}

export interface KillFeed extends HudPart {
  el: HTMLElement;
}

export function createKillFeed(ctx: HudCtx): KillFeed {
  injectStyle('sf-hud-feed', CSS);
  const el = h('div', 'sf-hud__feed');
  el.setAttribute('aria-live', 'polite');
  const entries: Entry[] = [];

  function push(row: HTMLElement): void {
    el.appendChild(row);
    entries.push({ el: row, until: ctx.now + LIFE, leaving: false });
    while (entries.length > MAX) {
      const old = entries.shift();
      old?.el.remove();
    }
  }

  const ico = (name: 'kill' | 'tower' | 'monster'): HTMLElement => {
    const e = h('span', 'sf-hud__kf-ico');
    e.innerHTML = uiIcon(name);
    return e;
  };

  return {
    el,
    update(c) {
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (!e.leaving && c.now >= e.until) {
          e.leaving = true;
          e.el.classList.add('is-out');
        } else if (e.leaving && c.now >= e.until + 0.42) {
          e.el.remove();
          entries.splice(i, 1);
        }
      }
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type === 'heroKill') {
        const victim = c.hero(ev.victimId);
        if (!victim) return;
        const killer = c.hero(ev.killerId);
        const killerUnit = killer ?? c.unit(ev.killerId);
        // 击杀方：英雄按其队伍；被塔/小兵/野怪打死算在对面头上
        const killerTeam = killer ? killer.team : victim.team === 0 ? 1 : 0;
        const involvesMe = victim.isPlayer || !!killer?.isPlayer || ev.assistIds.indexOf(c.state.playerId) >= 0;
        const row = h('div', `sf-hud__kf ${killerTeam === c.team ? 'is-ally' : 'is-foe'}${involvesMe ? ' is-me' : ''}`);
        const assists = ev.assistIds.map((id) => c.hero(id)).filter((x): x is NonNullable<typeof x> => !!x);
        if (assists.length > 0) {
          const box = h('span', 'sf-hud__kf-assists');
          for (const a of assists.slice(0, 4)) box.appendChild(heroFace(c.host, a, c.team));
          row.append(box, h('span', 'sf-hud__kf-plus', '+'));
        }
        if (killer) row.appendChild(heroFace(c.host, killer, c.team));
        else {
          const kind = killerUnit?.kind;
          const glyph = kind === 'tower' || kind === 'core' ? uiIcon('tower') : kind === 'monster' ? uiIcon('monster') : uiIcon('cs');
          row.appendChild(glyphFace(glyph, teamCls(killerTeam, c.team)));
        }
        row.append(ico('kill'), heroFace(c.host, victim, c.team, 'is-dead'));
        push(row);
      } else if (ev.type === 'towerDestroyed') {
        const byMine = ev.team !== c.team;
        const row = h('div', `sf-hud__kf ${byMine ? 'is-ally' : 'is-foe'}`);
        row.append(
          h('span', 'sf-hud__kf-text', `${byMine ? '我方摧毁' : '敌方摧毁'}`),
          ico('tower'),
          h('span', 'sf-hud__kf-text', `${LANE_NAME[ev.lane]}${TIER_NAME[ev.tier]}`),
          glyphFace(uiIcon('tower'), `${teamCls(ev.team, c.team)} is-dead`),
        );
        push(row);
      } else if (ev.type === 'epicSlain') {
        const byMine = ev.team === c.team;
        const row = h('div', `sf-hud__kf ${byMine ? 'is-ally' : 'is-foe'}`);
        row.append(h('span', 'sf-hud__kf-text', `${byMine ? '我方击败' : '敌方击败'}`), ico('monster'), h('span', 'sf-hud__kf-text', MONSTERS[ev.monsterType].name));
        push(row);
      }
    },
    dispose() {
      entries.length = 0;
    },
  };
}
