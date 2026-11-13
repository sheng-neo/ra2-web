/**
 * 圆形小头像：击杀播报、横幅、战况面板、阵亡面板共用。
 * 敌我同英雄，全靠外圈颜色区分：蓝 = 我方，红 = 敌方，金绿 = 玩家自己。
 */
import type { HeroUnit, PlayerTeam } from '../../core/types';
import type { HudHost } from '../api';
import { createPortrait } from '../menu/shared';
import { h, icon } from '../theme';

export function teamCls(team: number, myTeam: PlayerTeam, isMe = false): string {
  return isMe ? 'is-me' : team === myTeam ? 'is-blue' : 'is-red';
}

export function heroFace(host: HudHost, hero: HeroUnit, myTeam: PlayerTeam, extra = ''): HTMLElement {
  // 色环按「相对玩家的敌我」上色，而不是按绝对队伍：玩家看的永远是蓝=友、红=敌
  return createPortrait(host, hero.heroId, `sf-hud__face ${teamCls(hero.team, myTeam, hero.isPlayer)}${extra ? ` ${extra}` : ''}`);
}

/** 非英雄(防御塔/小兵/野怪)的占位头像：字形图标 */
export function glyphFace(svg: string, cls = ''): HTMLElement {
  return h('span', `sf-hud__face sf-hud__face--glyph${cls ? ` ${cls}` : ''}`, icon(svg));
}
