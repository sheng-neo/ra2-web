/**
 * 操作说明对话框：键鼠 / 触控 两套图示。
 */
import { uiIcon } from '../icons';
import { createTabs, h, injectStyle, openDialog, sfCss, u } from '../theme';
import type { Dialog } from '../theme';

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

@media (orientation: portrait), (max-width: 620px) {
  .sf-howto__pane { grid-template-columns: 1fr; gap: 14u; }
}
@media (max-height: 480px) and (orientation: landscape) {
  .sf-howto { gap: 8u; }
  .sf-howto__fig { padding: 8u; }
  .sf-howto__list { gap: 5u; }
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
    row('ui', '界', '界面', '<em>Tab</em> 按住看记分板 · <em>P</em> 商店 · <em>Esc</em> 设置 / 暂停'),
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
    // 右上角：记分板 / 暂停
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
    row('ui', '6', '商店', '随时购买装备；金币足够时会弹出推荐装备的快捷购买'),
    row('ui', '7', '战况 / 暂停', '右上角按钮：记分板、暂停与设置'),
  );
  return h('div', 'sf-howto__pane', h('div', 'sf-howto__fig sf-inset', fig), list);
}

/** 打开操作说明。触控设备默认显示触控页 */
export function openHowToDialog(root: HTMLElement): Dialog {
  injectStyle('sf-menu-howto', CSS);
  type Tab = 'keys' | 'touch';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const holder = h('div');
  const show = (t: Tab): void => {
    holder.textContent = '';
    holder.appendChild(t === 'keys' ? keyboardPane() : touchPane());
  };
  const tabs = createTabs<Tab>({
    tabs: [
      { id: 'keys', label: '键盘鼠标', icon: uiIcon('keyboard') },
      { id: 'touch', label: '触控', icon: uiIcon('touch') },
    ],
    value: coarse ? 'touch' : 'keys',
    onChange: show,
  });
  show(tabs.get());
  return openDialog(root, { title: '操作说明', content: h('div', 'sf-howto', tabs.el, holder), width: u(900) });
}
