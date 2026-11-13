/**
 * 操作说明对话框：键鼠 / 触控 两套操作图示，外加一页「怎么赢」——用一张示意地图讲清最少的规则：
 * 三条路、按顺序推塔、摧毁水晶、蓝buff / 红buff、河道巨龙与星陨巨灵。示意图上的记号与对局里的小地图一致，顺带当图例用。
 */
import { ECONOMY, MONSTERS, MONSTER_RULES } from '../../core/data/units';
import { createMap } from '../../core/map';
import type { MonsterType, Vec2 } from '../../core/types';
import { uiIcon } from '../icons';
import { createTabs, h, injectStyle, openDialog, sfCss, u } from '../theme';
import type { Dialog } from '../theme';
import { fmtClock } from './shared';

type Tone = 'move' | 'atk' | 'skill' | 'sum' | 'ui';

const CSS = sfCss(`
.sf-howto { display: flex; flex-direction: column; gap: 14u; }
.sf-howto__pane { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 22u; align-items: center; animation: sf-fade-in 0.25s linear both; }
.sf-howto__fig { display: flex; align-items: center; justify-content: center; gap: 18u; padding: 16u; min-width: 0; }
.sf-howto__list { display: flex; flex-direction: column; gap: 9u; margin: 0; padding: 0; list-style: none; min-width: 0; }
.sf-howto__list li { display: grid; grid-template-columns: auto 1fr; gap: 3u 10u; align-items: baseline; font-size: var(--sf-fs-sm); line-height: 1.55; color: var(--sf-c-text-2); }
.sf-howto__list b { font-weight: 700; font-size: var(--sf-fs-md); color: var(--sf-c-text); letter-spacing: 0.08em; white-space: nowrap; }
.sf-howto__list em { font-style: normal; color: var(--sf-c-gold-200); }
.sf-howto__dot { display: inline-grid; place-items: center; width: max(18px, 20u); height: max(18px, 20u); border-radius: 50%; transform: translateY(0.2em); font-family: var(--sf-font-num); font-weight: 700; font-size: var(--sf-fs-xs); color: #08101f; background: var(--tone); box-shadow: 0 0 8u var(--tone); }
.sf-howto [data-tone='move'] { --tone: #5cd6f7; }
.sf-howto [data-tone='atk'] { --tone: #ff8a7a; }
.sf-howto [data-tone='skill'] { --tone: #f3cf85; }
.sf-howto [data-tone='sum'] { --tone: #6fe3a1; }
.sf-howto [data-tone='ui'] { --tone: #b9a2ff; }

/* 键盘示意 */
.sf-keys { display: grid; grid-template-columns: repeat(13, max(13px, 15u)); grid-auto-rows: max(26px, 30u); gap: max(3px, 4u); }
.sf-key {
  display: grid; place-items: center; border-radius: 5u; font-family: var(--sf-font-num); font-weight: 700; font-size: var(--sf-fs-xs); line-height: 1; color: var(--sf-c-text-4);
  background: rgba(20, 34, 72, 0.6); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.16), 0 2u 0 rgba(4, 8, 22, 0.8);
}
.sf-key[data-tone] { color: #08101f; background: linear-gradient(180deg, color-mix(in srgb, var(--tone) 70%, #fff), var(--tone)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 2u 0 rgba(4, 8, 22, 0.8), 0 0 10u color-mix(in srgb, var(--tone) 55%, transparent); }
.sf-mouse { width: max(58px, 76u); flex: none; }
.sf-mouse svg { display: block; width: 100%; height: auto; overflow: visible; }
.sf-mouse text, .sf-touchfig text { font-family: var(--sf-font-num); font-weight: 700; }

/* 触控示意 */
.sf-touchfig { width: 100%; max-width: max(300px, 430u); }
.sf-touchfig svg { display: block; width: 100%; height: auto; }

/* 「怎么赢」：示意地图 + 带图例记号的说明 */
.sf-winfig { display: flex; flex-direction: column; align-items: center; gap: 4u; width: 100%; }
.sf-winfig svg { display: block; width: 100%; max-width: max(210px, 300u); height: auto; }
.sf-winfig text { font-family: var(--sf-font); font-weight: 700; }
.sf-winfig p { margin: 0; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); text-align: center; }
.sf-howto__glyph { display: inline-block; width: max(18px, 20u); height: max(18px, 20u); transform: translateY(0.25em); }
.sf-howto__glyph svg { display: block; width: 100%; height: 100%; overflow: visible; }
.sf-howto__pane--win { align-items: start; }
.sf-howto__pane--win .sf-howto__list { gap: 7u; }

@media (orientation: portrait), (max-width: 620px) {
  .sf-howto__pane { grid-template-columns: 1fr; gap: 14u; }
  .sf-winfig svg { max-width: min(62vw, 250px); }
}
@media (max-height: 480px) and (orientation: landscape) {
  .sf-howto { gap: 8u; }
  .sf-howto__fig { padding: 8u; }
  .sf-howto__list { gap: 5u; }
  .sf-howto__pane--win { grid-template-columns: minmax(0, 0.6fr) minmax(0, 1fr); gap: 12u; }
  .sf-howto__pane--win .sf-howto__list { gap: 3u; }
  .sf-howto__pane--win .sf-howto__list li { line-height: 1.4; }
  .sf-winfig svg { max-width: 164px; }
  .sf-winfig p { display: none; }
}
`);

function key(label: string, span: number, tone?: Tone): HTMLElement {
  const el = h('span', 'sf-key', label);
  el.style.gridColumn = `span ${span}`;
  if (tone) el.dataset.tone = tone;
  return el;
}

function row(tone: Tone, mark: string, title: string, html: string): HTMLLIElement {
  const dot = h('span', 'sf-howto__dot', mark);
  dot.dataset.tone = tone;
  const text = h('span');
  text.innerHTML = html;
  return h('li', null, dot, h('span', null, h('b', null, title), ' ', text));
}

function keyboardPane(): HTMLElement {
  // 13 列网格：每个字母键占 2 列，方便做出键盘的错位排布
  const keys = h(
    'div',
    'sf-keys',
    key('Esc', 3, 'ui'), key('', 2), key('', 2), key('', 2), key('', 2), key('', 2),
    key('Tab', 3, 'ui'), key('Q', 2, 'skill'), key('W', 2, 'move'), key('E', 2, 'skill'), key('R', 2, 'skill'), key('P', 2, 'ui'),
    key('', 3), key('A', 2, 'move'), key('S', 2, 'move'), key('D', 2, 'move'), key('F', 2, 'sum'), key('G', 2, 'sum'),
    key('', 3), key('', 2), key('', 2), key('', 2), key('B', 2, 'sum'), key('J', 2, 'atk'),
    key('', 3), key('空格', 8, 'atk'), key('', 2),
  );
  const mouse = h('div', 'sf-mouse');
  mouse.innerHTML =
    '<svg viewBox="0 0 80 124" aria-hidden="true">' +
    '<rect x="6" y="6" width="68" height="112" rx="34" fill="rgba(20,34,72,.7)" stroke="rgba(150,178,235,.4)" stroke-width="2"/>' +
    '<path d="M40 6C21.200 6 6 21.200 6 40V52H38V6Z" fill="#ff8a7a"/>' +
    '<path d="M40 6C58.800 6 74 21.200 74 40V52H42V6Z" fill="#5cd6f7"/>' +
    '<rect x="35" y="20" width="10" height="22" rx="5" fill="#0a1128" stroke="rgba(255,255,255,.5)" stroke-width="1.500"/>' +
    '<text x="21" y="38" text-anchor="middle" font-size="13" fill="#08101f">左</text>' +
    '<text x="59" y="38" text-anchor="middle" font-size="13" fill="#08101f">右</text>' +
    '</svg>';
  const list = h(
    'ul',
    'sf-howto__list',
    row('move', '移', '移动', '<em>W A S D</em> 或方向键；<em>鼠标右键</em>点地面寻路移动'),
    row('atk', '攻', '普攻', '<em>空格 / J</em> 自动选择目标；<em>左键或右键</em>点敌人指定攻击'),
    row('skill', '技', '技能', '<em>Q</em> 一技能 · <em>E</em> 二技能 · <em>R</em> 大招：按下显示指示器，松开朝鼠标位置施放；<em>Esc / 右键</em>取消'),
    row('sum', '通', '通用技能', '<em>F</em> 闪现(朝鼠标) · <em>G</em> 疗伤 · <em>B</em> 回城'),
    row('ui', '界', '界面', '<em>Tab</em> 按住看战况 · <em>P</em> 商店 · <em>Esc</em> 设置 / 暂停'),
  );
  return h('div', 'sf-howto__pane', h('div', 'sf-howto__fig sf-inset', keys, mouse), list);
}

function touchPane(): HTMLElement {
  const fig = h('div', 'sf-touchfig');
  const mark = (x: number, y: number, n: string, color: string): string =>
    `<circle cx="${x}" cy="${y}" r="10.5" fill="${color}" stroke="#08101f" stroke-width="1.5"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" fill="#08101f">${n}</text>`;
  const btn = (x: number, y: number, r: number, color: string): string =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity=".22" stroke="${color}" stroke-width="1.600"/>`;
  fig.innerHTML =
    '<svg viewBox="0 0 400 200" aria-hidden="true">' +
    '<rect x="3" y="3" width="394" height="194" rx="22" fill="rgba(10,17,40,.75)" stroke="rgba(232,199,122,.55)" stroke-width="2"/>' +
    '<rect x="12" y="12" width="376" height="176" rx="14" fill="rgba(28,47,96,.35)"/>' +
    // 小地图
    '<rect x="22" y="22" width="54" height="54" rx="5" fill="#b9a2ff" fill-opacity=".2" stroke="#b9a2ff" stroke-width="1.600"/>' +
    '<path d="M30 68L68 30" stroke="#b9a2ff" stroke-width="1.400" opacity=".7"/>' +
    // 比分条
    '<rect x="150" y="18" width="100" height="16" rx="8" fill="rgba(150,178,235,.16)" stroke="rgba(150,178,235,.35)"/>' +
    // 右上角：战况 / 暂停
    '<rect x="330" y="18" width="20" height="16" rx="4" fill="#b9a2ff" fill-opacity=".2" stroke="#b9a2ff" stroke-width="1.400"/>' +
    '<rect x="356" y="18" width="20" height="16" rx="4" fill="#b9a2ff" fill-opacity=".2" stroke="#b9a2ff" stroke-width="1.400"/>' +
    // 取消区：拖动瞄准时出现在技能区左上方
    '<circle cx="196" cy="74" r="19" fill="#ff8a7a" fill-opacity=".14" stroke="#ff8a7a" stroke-width="1.400" stroke-dasharray="4 3"/>' +
    '<text x="196" y="78.500" text-anchor="middle" font-size="12" fill="#ff8a7a">取消</text>' +
    // 摇杆
    '<circle cx="74" cy="140" r="34" fill="#5cd6f7" fill-opacity=".1" stroke="#5cd6f7" stroke-width="1.600"/>' +
    '<circle cx="86" cy="130" r="14" fill="#5cd6f7" fill-opacity=".7"/>' +
    // 普攻 + 三技能 + 通用技能 + 商店
    btn(340, 150, 30, '#ff8a7a') +
    btn(278, 162, 18, '#f3cf85') + btn(292, 112, 18, '#f3cf85') + btn(340, 86, 18, '#f3cf85') +
    btn(232, 174, 11, '#6fe3a1') + btn(246, 140, 11, '#6fe3a1') + btn(264, 80, 11, '#6fe3a1') +
    '<rect x="22" y="88" width="34" height="18" rx="6" fill="#b9a2ff" fill-opacity=".2" stroke="#b9a2ff" stroke-width="1.400"/>' +
    // 拖动瞄准示意
    '<path d="M340 86L306 52" stroke="#f3cf85" stroke-width="1.800" stroke-dasharray="3.500 3"/><path d="M301 47l2.500 10 7.500-7.500z" fill="#f3cf85"/>' +
    mark(74, 140, '1', '#5cd6f7') + mark(340, 150, '2', '#ff8a7a') + mark(340, 86, '3', '#f3cf85') + mark(246, 140, '4', '#6fe3a1') + mark(49, 49, '5', '#b9a2ff') + mark(39, 97, '6', '#b9a2ff') + mark(353, 40, '7', '#b9a2ff') +
    '</svg>';
  const list = h(
    'ul',
    'sf-howto__list',
    row('move', '1', '摇杆', '左下区域按住拖动，控制英雄移动'),
    row('atk', '2', '普攻', '按住连续攻击，自动选择最合适的目标'),
    row('skill', '3', '技能', '<em>轻点</em> = 智能施法；<em>按住拖动</em> = 手动瞄准，松手施放；拖到<em>「取消」</em>区松手则取消；<em>原地长按</em>查看技能说明'),
    row('sum', '4', '通用技能', '闪现(可拖动选方向) · 疗伤 · 回城'),
    row('ui', '5', '小地图', '点按并拖动可观察战场，松手回到英雄'),
    row('ui', '6', '商店', '金币够了会自动买推荐装备；想自己挑就点开商店(关掉自动出装后，钱够时这里会弹出一键购买)'),
    row('ui', '7', '战况 / 暂停', '右上角两个按钮：看双方战况、暂停与设置'),
  );
  return h('div', 'sf-howto__pane', h('div', 'sf-howto__fig sf-inset', fig), list);
}

// ───────────────────────── 怎么赢 ─────────────────────────

/** 图例颜色：与小地图(hud/minimap.ts)同一套——蓝buff 蓝点、红buff 红点、小野怪黄菱形、河道巨龙紫三角、星陨巨灵金菱形 */
const CAMP_COLOR: Record<MonsterType, string> = {
  mossback: '#e2cf7a',
  glimwing: '#e2cf7a',
  frost_golem: '#4da3ff',
  ember_golem: '#ff5d5d',
  abyss_drake: '#c09bff',
  star_colossus: '#ffd76a',
};
const TEAM_FILL = ['#4da3ff', '#ff5d5d'] as const;
const DARK = '#060a16';
const n1 = (v: number): number => Math.round(v * 10) / 10;

/** 营地记号(SVG 片段)：圆点 + 细环 / 三角 + 外环 / 菱形(星陨巨灵是大菱形 + 双外环) */
function campGlyph(type: MonsterType, x: number, y: number, r: number): string {
  const c = CAMP_COLOR[type];
  const ring = (k: number, w: number): string => `<circle cx="${x}" cy="${y}" r="${n1(r * k)}" fill="none" stroke="${c}" stroke-width="${w}" opacity=".8"/>`;
  if (type === 'frost_golem' || type === 'ember_golem') return `${ring(1.7, 1)}<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${DARK}" stroke-width="1"/>`;
  if (type === 'abyss_drake') {
    return `${ring(1.9, 1.2)}<path d="M${x} ${n1(y - r * 1.25)}L${n1(x + r * 1.1)} ${n1(y + r * 0.85)}H${n1(x - r * 1.1)}Z" fill="${c}" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>`;
  }
  const k = type === 'star_colossus' ? 1.25 : 0.8;
  const d = `<path d="M${x} ${n1(y - r * k)}L${n1(x + r * k)} ${y}L${x} ${n1(y + r * k)}L${n1(x - r * k)} ${y}Z" fill="${c}" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>`;
  return type === 'star_colossus' ? `${ring(1.75, 1.1)}${ring(2.4, 0.9)}${d}` : d;
}

/** 防御塔记号：队伍色小方块 */
const towerGlyph = (x: number, y: number, r: number, team: 0 | 1): string =>
  `<rect x="${n1(x - r)}" y="${n1(y - r)}" width="${n1(r * 2)}" height="${n1(r * 2)}" rx="${n1(r * 0.3)}" fill="${TEAM_FILL[team]}" stroke="${DARK}" stroke-width="1"/>`;

/** 水晶记号：队伍色的竖菱形，外面一圈光 */
const coreGlyph = (x: number, y: number, r: number, team: 0 | 1): string =>
  `<circle cx="${x}" cy="${y}" r="${n1(r * 1.55)}" fill="${TEAM_FILL[team]}" fill-opacity=".22" stroke="${TEAM_FILL[team]}" stroke-width="1.2"/>` +
  `<path d="M${x} ${n1(y - r * 1.2)}L${n1(x + r * 0.8)} ${y}L${x} ${n1(y + r * 1.2)}L${n1(x - r * 0.8)} ${y}Z" fill="#f2feff" stroke="${TEAM_FILL[team]}" stroke-width="1.4" stroke-linejoin="round"/>`;

/** 说明行开头的小记号：传 SVG 片段(画在 20×20 的画布上)，或一个完整的 <svg> 图标 */
function glyphBox(inner: string): HTMLElement {
  const el = h('span', 'sf-howto__glyph');
  el.innerHTML = inner.startsWith('<svg') ? inner : `<svg viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  return el;
}

function glyphRow(glyph: HTMLElement, title: string, html: string): HTMLLIElement {
  const text = h('span');
  text.innerHTML = html;
  return h('li', null, glyph, h('span', null, h('b', null, title), ' ', text));
}

function winPane(): HTMLElement {
  const map = createMap();
  // 世界坐标 → 示意图坐标(200×200，四周留边)。方位与小地图一致：蓝方在左下，红方在右上
  const K = 88 / map.bound;
  const P = (v: Vec2): string => `${n1(100 + v.x * K)} ${n1(100 + v.y * K)}`;
  const X = (v: Vec2): number => n1(100 + v.x * K);
  const Y = (v: Vec2): number => n1(100 + v.y * K);
  const line = (pts: Vec2[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${P(p)}`).join('');

  let svg =
    '<svg viewBox="0 -15 200 230" role="img" aria-label="战场示意图：蓝方在左下，红方在右上，三条路，河道从左上到右下">' +
    '<rect x="2" y="2" width="196" height="196" rx="12" fill="#0b1630" stroke="rgba(232,199,122,.55)" stroke-width="2"/>' +
    `<path d="${line(map.river)}" fill="none" stroke="#2f86b8" stroke-width="${n1(map.riverWidth * K)}" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>`;
  for (const lane of ['top', 'mid', 'bot'] as const) {
    svg += `<path d="${line(map.lanes[lane])}" fill="none" stroke="#b9a577" stroke-width="5.500" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
  }
  for (const c of map.camps) svg += campGlyph(c.monsterType, X(c.pos), Y(c.pos), MONSTERS[c.monsterType].epic ? 5 : c.monsterType === 'frost_golem' || c.monsterType === 'ember_golem' ? 3.6 : 3.2);
  for (const t of map.towers) svg += towerGlyph(X(t.pos), Y(t.pos), 3.4, t.team);
  for (const b of map.bases) svg += coreGlyph(X(b.core), Y(b.core), 6.5, b.team);
  // 两个基地的名字写在图框外(框里挤满了记号)：左下角下方、右上角上方
  svg += '<text x="5" y="211.500" font-size="11.500" fill="#9ccfff">◣ 我方水晶</text><text x="195" y="-4" font-size="11.500" fill="#ff9c9c" text-anchor="end">敌方水晶 ◥</text></svg>';
  const fig = h('div', 'sf-winfig');
  fig.innerHTML = `${svg}<p>图上的记号和对局里的小地图是同一套</p>`;

  const camp = (t: MonsterType): { first: string; reward: string } => {
    const def = map.camps.find((c) => c.monsterType === t);
    return { first: fmtClock(def ? def.firstSpawn : 0).replace(/^0/, ''), reward: MONSTERS[t].reward ?? '' };
  };
  const drake = camp('abyss_drake');
  const colossus = camp('star_colossus');
  const near = Math.round(ECONOMY.proximityGoldRatio * 100);
  const list = h(
    'ul',
    'sf-howto__list',
    glyphRow(glyphBox(coreGlyph(10, 10, 5.4, 1)), '怎么赢', '摧毁<em>敌方水晶</em>就赢。你在左下角的蓝色方，敌方水晶在右上角。'),
    glyphRow(glyphBox(towerGlyph(10, 10, 5.5, 1)), '推塔', '上、中、下三条路，每条路按 <em>一塔 → 二塔 → 高地塔</em> 的顺序拆；拆掉任意一路的高地塔，才打得动水晶。塔先打小兵，跟着小兵进塔。'),
    glyphRow(glyphBox(uiIcon('gold')), '补兵', `给小兵<em>最后一击</em>拿全额金币，只站在旁边只有约 ${near}%。金币够了会<em>自动买</em>推荐装备。`),
    glyphRow(glyphBox(campGlyph('frost_golem', 10, 10, 4.6)), MONSTERS.frost_golem.name, `野区的大野怪。${MONSTERS.frost_golem.reward ?? ''}。`),
    glyphRow(glyphBox(campGlyph('ember_golem', 10, 10, 4.6)), MONSTERS.ember_golem.name, `野区的大野怪。${MONSTERS.ember_golem.reward ?? ''}。`),
    glyphRow(glyphBox(campGlyph('abyss_drake', 10, 11, 4.4)), MONSTERS.abyss_drake.name, `左上河道，<em>${drake.first}</em> 刷新。${drake.reward}。它会吐息：看到地上的扇形预警就走出去。`),
    glyphRow(glyphBox(campGlyph('star_colossus', 10, 10, 3.6)), MONSTERS.star_colossus.name, `右下河道，<em>${colossus.first}</em> 刷新。${colossus.reward}(${MONSTER_RULES.blessingDuration} 秒一过就没了，趁这会儿推塔)。`),
  );
  return h('div', 'sf-howto__pane sf-howto__pane--win', h('div', 'sf-howto__fig sf-inset', fig), list);
}

export type HowToTab = 'keys' | 'touch' | 'win';

/** 打开操作说明。不指定页签时，触控设备默认显示触控页，其余显示键鼠页 */
export function openHowToDialog(root: HTMLElement, tab?: HowToTab): Dialog {
  injectStyle('sf-menu-howto', CSS);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const holder = h('div');
  const show = (t: HowToTab): void => {
    holder.textContent = '';
    holder.appendChild(t === 'keys' ? keyboardPane() : t === 'touch' ? touchPane() : winPane());
  };
  const tabs = createTabs<HowToTab>({
    tabs: [
      { id: 'keys', label: '键盘鼠标', icon: uiIcon('keyboard') },
      { id: 'touch', label: '触控', icon: uiIcon('touch') },
      { id: 'win', label: '怎么赢', icon: uiIcon('crown') },
    ],
    value: tab ?? (coarse ? 'touch' : 'keys'),
    onChange: show,
  });
  show(tabs.get());
  return openDialog(root, { title: '操作说明', content: h('div', 'sf-howto', tabs.el, holder), width: u(900) });
}
