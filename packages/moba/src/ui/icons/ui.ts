/**
 * 通用界面图标（24×24 字形图标）。除金币外全部用 currentColor，可由 CSS 的 color 着色；
 * 尺寸由外层容器决定（配合 theme 的 icon() / .sf-i 使用）。
 */
import type { HeroRole, RoleLane } from '../../core/types';
import { lg, rg, star4, starPoly, wrap } from './svg';

const FILL = 'fill="currentColor"';
const LINE = (w = 2.2): string => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

/** 齿轮外形（带中心孔，evenodd 填充） */
function gear(): string {
  const teeth = 8;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = (i * 360) / teeth;
    const pts: [number, number][] = [[a0 - 13, 7.4], [a0 - 8, 10.2], [a0 + 8, 10.2], [a0 + 13, 7.4]];
    for (const [deg, r] of pts) {
      const a = ((deg - 90) * Math.PI) / 180;
      d += `${d ? 'L' : 'M'}${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
    }
  }
  return `${d}ZM12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2Z`;
}

/** 斜指右上的剑（击杀/战士/普攻共用） */
const SWORD = `<path d="M21.2 2.8l-1 5.6-8.9 8.9-3.6-3.6 8.9-8.9z" ${FILL}/><path d="M4.6 12.6l6.8 6.8M7.2 16.8l-3.6 3.6" ${LINE(2.5)}/>`;
/** 小地图外框 + 双方基地（分路图标共用） */
const MAP_FRAME = `<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="3" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-opacity=".5" stroke-width="1.4"/><rect x="4.6" y="15.6" width="3.8" height="3.8" rx=".8" fill="currentColor" fill-opacity=".55"/><rect x="15.6" y="4.6" width="3.8" height="3.8" rx=".8" fill="currentColor" fill-opacity=".55"/>`;

const GLYPHS = {
  // ── 战绩 / 经济 ──
  kill: SWORD,
  death:
    `<path fill-rule="evenodd" d="M12 2.4c-4.8 0-8.2 3.2-8.2 7.7 0 2.6 1.2 4.6 3 5.9v2.8c0 .9.7 1.6 1.6 1.6h7.2c.9 0 1.6-.7 1.6-1.6V16c1.8-1.3 3-3.3 3-5.9 0-4.5-3.400-7.700-8.200-7.700zM8.700 8.600a2.300 2.300 0 1 0 0 4.600a2.300 2.300 0 1 0 0-4.600zM15.300 8.600a2.300 2.300 0 1 0 0 4.600a2.300 2.300 0 1 0 0-4.600zM12 13.400l-1.300 2.400h2.600zM10 17.600h.9v2.800H10zM13.100 17.600h.9v2.800h-.9z" ${FILL}/>`,
  assist:
    `<g ${FILL}><rect x="6.600" y="10" width="11" height="11.400" rx="3.600"/><rect x="6.600" y="4.800" width="2.300" height="8" rx="1.150"/><rect x="9.500" y="2.800" width="2.300" height="9" rx="1.150"/><rect x="12.400" y="3.200" width="2.300" height="9" rx="1.150"/><rect x="15.300" y="5.200" width="2.300" height="8" rx="1.150"/><rect x="2.900" y="11" width="2.500" height="7.200" rx="1.250" transform="rotate(-32 4.150 14.600)"/></g>`,
  cs: `<path fill-rule="evenodd" d="M5.500 9.500l-2-5.700 5 2.700a8.500 8.500 0 0 1 7 0l5-2.700-2 5.700c1 1.300 1.500 2.800 1.500 4.500 0 4-3.400 7-8 7s-8-3-8-7c0-1.700.5-3.200 1.500-4.500zM6.800 12.800l4 1.400v1.600l-4-.6zM17.200 12.800l-4 1.400v1.600l4-.6z" ${FILL}/>`,
  damage: `<path d="${starPoly(12, 12, 8, 10.4, 4.6)}" ${FILL}/>`,
  shield:
    `<path fill-rule="evenodd" d="M12 2.200l8 3v6.300c0 5-3.400 8.500-8 10.300-4.600-1.800-8-5.300-8-10.300V5.200zM12 5l-5.400 2v4.500c0 3.300 2.200 5.900 5.400 7.300z" ${FILL}/>`,
  tower:
    `<path d="M12 1.800l3.600 6.200-1.700 7.500h-3.800L8.400 8z" ${FILL}/><path d="M5.500 10.500Q12 14 18.500 10.500" ${LINE(1.6)} opacity=".7"/><path d="M7 17.200h10l1.800 4.300H5.200z" ${FILL}/>`,
  core: `<path d="M12 1.800l6 7.200-6 9.200-6-9.200z" ${FILL}/><path d="M4 16.500Q12 22.500 20 16.500" ${LINE(1.800)}/><path d="M7.500 20.800h9" ${LINE(1.800)}/>`,
  monster: `<path d="M5 3.500C7.500 8.500 8 14 6 20.500M11 2.500C13.500 8 14 14.500 12 21.500M17 3.500C19.500 8.500 20 14 18 20.500" ${LINE(2.600)}/>`,
  heart: `<path d="M12 21l-8.200-8.200C1.500 10.300 2 6.300 5 4.600c2.400-1.300 5.200-.5 7 1.900 1.800-2.400 4.600-3.200 7-1.900 3 1.700 3.500 5.700 1.200 8.200z" ${FILL}/>`,
  mana: `<path d="M12 2.200c3.200 4.200 6.500 8 6.500 12a6.500 6.500 0 0 1-13 0c0-4 3.300-7.800 6.500-12z" ${FILL}/>`,
  level: `<path d="M12 3l7.500 8H15v4.500H9V11H4.500zM9 17.500h6v2.800H9z" ${FILL}/>`,
  crown: `<path d="M3.500 17.500L2 7l5.500 4.200L12 3.500l4.500 7.700L22 7l-1.500 10.500zM4 19.300h16v2.200H4z" ${FILL}/>`,
  // ── 系统 ──
  settings: `<path fill-rule="evenodd" d="${gear()}" ${FILL}/>`,
  pause: `<rect x="5.500" y="4" width="4.600" height="16" rx="1.500" ${FILL}/><rect x="13.900" y="4" width="4.600" height="16" rx="1.500" ${FILL}/>`,
  play: `<path d="M7 3.800v16.400c0 .8.900 1.300 1.600.8l12-8.200c.6-.4.6-1.200 0-1.600l-12-8.200c-.7-.5-1.600 0-1.600.8z" ${FILL}/>`,
  close: `<path d="M5.500 5.500l13 13M18.500 5.500l-13 13" ${LINE(2.800)}/>`,
  check: `<path d="M4.500 12.500l5 5L19.500 7" ${LINE(2.900)}/>`,
  plus: `<path d="M12 4.500v15M4.500 12h15" ${LINE(2.800)}/>`,
  minus: `<path d="M4.500 12h15" ${LINE(2.800)}/>`,
  back: `<path d="M10.500 5L3.500 12l7 7M4.500 12H20.500" ${LINE(2.600)}/>`,
  chevron_left: `<path d="M14.500 4.500L7 12l7.500 7.500" ${LINE(2.800)}/>`,
  chevron_right: `<path d="M9.500 4.500L17 12l-7.500 7.500" ${LINE(2.800)}/>`,
  chevron_up: `<path d="M4.500 14.500L12 7l7.500 7.500" ${LINE(2.800)}/>`,
  chevron_down: `<path d="M4.500 9.500L12 17l7.500-7.500" ${LINE(2.800)}/>`,
  home: `<path d="M12 2.800L2.500 11h2.800v9.200h5v-6h3.400v6h5V11h2.800z" ${FILL}/>`,
  again: `<path d="M19.500 12a7.500 7.500 0 1 1-2.400-5.500" ${LINE(2.500)}/><path d="M20.500 2.800v5.400h-5.400z" ${FILL}/>`,
  lock: `<path d="M8 10.200V7.800a4 4 0 0 1 8 0v2.400" ${LINE(2.300)}/><path fill-rule="evenodd" d="M6.500 10h11c1 0 1.800.8 1.800 1.800v7.400c0 1-.8 1.800-1.800 1.800h-11c-1 0-1.800-.8-1.800-1.800v-7.400c0-1 .8-1.800 1.800-1.800zM12 13.200a1.700 1.700 0 0 0-.9 3.100v2h1.800v-2a1.700 1.700 0 0 0-.9-3.100z" ${FILL}/>`,
  info: `<circle cx="12" cy="12" r="9" ${LINE(2)}/><path d="M12 11v6" ${LINE(2.400)}/><circle cx="12" cy="7.600" r="1.400" ${FILL}/>`,
  clock: `<circle cx="12" cy="12" r="9" ${LINE(2)}/><path d="M12 6.800V12l3.600 2.400" ${LINE(2.200)}/>`,
  hourglass: `<path d="M6 3h12M6 21h12M7.500 3v3.500c0 2.500 4.500 4 4.500 5.500s-4.500 3-4.500 5.500V21M16.500 3v3.500c0 2.500-4.500 4-4.500 5.500s4.500 3 4.500 5.500V21" ${LINE(2)}/>`,
  eye: `<path d="M1.800 12C4.500 7.500 8 5.300 12 5.300S19.500 7.500 22.200 12c-2.700 4.500-6.200 6.700-10.200 6.700S4.500 16.500 1.800 12z" ${LINE(2)}/><circle cx="12" cy="12" r="3.200" ${FILL}/>`,
  target: `<circle cx="12" cy="12" r="7" ${LINE(2)}/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" ${LINE(2.200)}/><circle cx="12" cy="12" r="1.800" ${FILL}/>`,
  cancel: `<circle cx="12" cy="12" r="9" ${LINE(2.300)}/><path d="M5.800 5.800l12.400 12.400" ${LINE(2.300)}/>`,
  // ── 商店 / 面板 ──
  shop: `<path fill-rule="evenodd" d="M9 2.800h6l-1.300 3.400c3.600 2.200 6.300 6.200 6.300 9.800 0 3.600-3 5.500-8 5.500s-8-1.900-8-5.500c0-3.600 2.700-7.600 6.300-9.800zM${star4(12, 14, 4.600, 0.2).slice(1)}" ${FILL}/>`,
  scoreboard:
    `<g ${FILL}><rect x="2.800" y="3.600" width="4.400" height="4.400" rx="1.100"/><rect x="9.300" y="4.600" width="12" height="2.400" rx="1.200"/><rect x="2.800" y="9.800" width="4.400" height="4.400" rx="1.100"/><rect x="9.300" y="10.800" width="12" height="2.400" rx="1.200"/><rect x="2.800" y="16" width="4.400" height="4.400" rx="1.100"/><rect x="9.300" y="17" width="12" height="2.400" rx="1.200"/></g>`,
  // ── 音频 / 画面 ──
  volume: `<path d="M3 9.200h3.600L12 4.500v15l-5.400-4.700H3z" ${FILL}/><path d="M15.300 8.500a5 5 0 0 1 0 7M18 5.800a8.800 8.800 0 0 1 0 12.400" ${LINE(2.100)}/>`,
  mute: `<path d="M3 9.200h3.600L12 4.500v15l-5.400-4.700H3z" ${FILL}/><path d="M15.500 9l5.500 6M21 9l-5.500 6" ${LINE(2.300)}/>`,
  sfx: `<path d="M3 9.200h3.600L12 4.500v15l-5.400-4.700H3z" ${FILL}/><path d="M${star4(18, 12, 4.800, 0.2).slice(1)}" ${FILL}/>`,
  music: `<path d="M8.800 18V5.800l10.400-2.300V15.500" ${LINE(2.200)}/><ellipse cx="6.300" cy="18" rx="3" ry="2.500" ${FILL}/><ellipse cx="16.700" cy="15.500" rx="3" ry="2.500" ${FILL}/>`,
  quality: `<path d="M12 2.500l7.500 6.500-7.500 12.500L4.500 9z" ${LINE(2)}/><path d="M4.500 9h15M9 9l3 12.500M15 9l-3 12.500M12 2.500L9 9M12 2.500l3 6.500" ${LINE(1.300)}/>`,
  fps: `<path d="M3.500 17a8.500 8.500 0 1 1 17 0" ${LINE(2.300)}/><path d="M12 17l4.500-7" ${LINE(2.500)}/><circle cx="12" cy="17" r="2" ${FILL}/>`,
  shake: `<rect x="6.500" y="6" width="11" height="12" rx="2.200" ${LINE(2.200)}/><circle cx="12" cy="12" r="2.400" ${FILL}/><path d="M2.500 8.500v7M21.500 8.500v7" ${LINE(2.200)}/>`,
  // ── 操作说明 ──
  keyboard: `<rect x="2" y="5.500" width="20" height="13" rx="2.500" ${LINE(2)}/><path d="M6 9.500h1M10 9.500h1M14 9.500h1M18 9.500h.300M6 12.500h1M10 12.500h1M14 12.500h1M18 12.500h.300M8 15.500h8" ${LINE(1.800)}/>`,
  mouse: `<rect x="6.500" y="2.500" width="11" height="19" rx="5.500" ${LINE(2)}/><path d="M12 2.500v7M6.500 9.500h11" ${LINE(1.800)}/>`,
  touch: `<path d="M9.200 11.500V5.200a1.900 1.900 0 0 1 3.800 0v5.300l4.600 1.200c1.200.3 2 1.500 1.800 2.700l-.8 4.800c-.2 1.200-1.200 2-2.400 2h-4.500c-.8 0-1.500-.4-2-1l-4-5.200c-.6-.8-.4-1.900.4-2.400.7-.4 1.500-.3 2.100.2z" ${FILL}/><path d="M5.500 6.500a5.700 5.700 0 0 1 11.200-1.500" ${LINE(1.700)} opacity=".7"/>`,
  joystick: `<circle cx="12" cy="12" r="9.500" ${LINE(1.800)} opacity=".6"/><circle cx="12" cy="12" r="4.400" ${FILL}/>`,
  // ── 评价 ──
  star: `<path d="${starPoly(12, 12.600, 5, 10.200, 4.300)}" ${FILL}/>`,
  star_empty: `<path d="${starPoly(12, 12.600, 5, 9.400, 4.100)}" ${LINE(1.700)}/>`,
  spark: `<path d="${star4(12, 12, 10.500, 0.180)}" ${FILL}/>`,
} as const;

export type UiIconName = keyof typeof GLYPHS | 'gold';

/** 金币：唯一的彩色通用图标（星纹金币） */
function goldCoin(): string {
  return wrap(
    24,
    `<defs>${lg('c', 4, 2, 20, 22, [[0, '#fff6d8'], [0.45, '#f3cf85'], [1, '#a8742c']])}${rg('h', 9, 8, 9, [[0, '#ffffff', 0.9], [1, '#ffffff', 0]])}</defs>` +
      `<circle cx="12" cy="12" r="10" fill="url(#@c)" stroke="#6b4614" stroke-width="1.200"/>` +
      `<circle cx="12" cy="12" r="7.200" fill="none" stroke="#8d6226" stroke-width="1" opacity=".8"/>` +
      `<path d="${star4(12, 12, 5.600, 0.220)}" fill="#7a5220"/><path d="${star4(12, 11.500, 5.200, 0.220)}" fill="#fff4d6"/>` +
      `<circle cx="9" cy="8" r="6" fill="url(#@h)"/>`,
    'sf-ico sf-ico--color',
  );
}

/** 通用图标。除 'gold' 外均为 currentColor 单色字形 */
export function uiIcon(name: UiIconName): string {
  if (name === 'gold') return goldCoin();
  return wrap(24, GLYPHS[name]);
}

export const UI_ICON_NAMES: UiIconName[] = ['gold', ...(Object.keys(GLYPHS) as (keyof typeof GLYPHS)[])];

// ───────────── 定位徽标 ─────────────

const ROLE_GLYPHS: Record<HeroRole, string> = {
  // 坦克：盾
  tank: `<path fill-rule="evenodd" d="M12 1.800l8.500 3.200v6.500c0 5.200-3.600 8.900-8.500 10.700-4.900-1.800-8.500-5.500-8.500-10.700V5zM12 4.700L6.200 6.900v4.600c0 3.600 2.400 6.300 5.800 7.800 3.400-1.500 5.800-4.200 5.800-7.800V6.900zM12 7.500l3.500 4.300-3.500 4.700-3.500-4.700z" ${FILL}/>`,
  // 战士：交叉双剑
  fighter: `${SWORD}<g transform="matrix(-1 0 0 1 24 0)">${SWORD}</g>`,
  // 法师：大小三颗星芒
  mage: `<path d="${star4(10, 13.500, 8.800, 0.200)}" ${FILL}/><path d="${star4(18.800, 5.600, 4, 0.200)}" ${FILL}/><path d="${star4(19.500, 18.200, 2.600, 0.200)}" ${FILL}/>`,
  // 射手：弓与箭
  marksman: `<path d="M6.500 2.800c8.500 3 8.500 15.400 0 18.400" ${LINE(2.500)}/><path d="M6.500 2.800v18.400" ${LINE(1.300)}/><path d="M2.500 12h14" ${LINE(2.200)}/><path d="M15.500 7.800L22.300 12l-6.800 4.200z" ${FILL}/>`,
  // 刺客：倒持匕首
  assassin: `<path d="M12 22.500l-3.400-12.300L12 7.200l3.400 3-3.400 12.300z" ${FILL}/><path d="M6.800 7h10.400" ${LINE(2.600)}/><path d="M12 1.800v4" ${LINE(3)}/><path d="M4 13.500l2.500 4M20 13.500l-2.500 4" ${LINE(1.700)} opacity=".75"/>`,
};

/** 定位徽标：坦克/战士/法师/射手/刺客（currentColor 单色字形） */
export function roleIcon(role: HeroRole): string {
  return wrap(24, ROLE_GLYPHS[role]);
}

// ───────────── 分路 ─────────────

const LANE_GLYPHS: Record<RoleLane, string> = {
  // 小地图方位：蓝方左下、红方右上。上路贴左边再沿上边，下路贴下边再沿右边，中路走对角
  top: `${MAP_FRAME}<path d="M6.500 14.500V8.500q0-2 2-2h6" ${LINE(2.600)}/>`,
  mid: `${MAP_FRAME}<path d="M8.300 15.700l7.400-7.400" ${LINE(2.600)}/>`,
  bot: `${MAP_FRAME}<path d="M9.500 17.500h6q2 0 2-2v-6" ${LINE(2.600)}/>`,
  jungle: `${MAP_FRAME}<path d="M12.200 6.200c2.800 1.600 3.800 4.400 2.600 7.400-.5 1.300-1.500 2.300-2.800 2.800-2.200-1.600-3-4-2.200-6.600.4-1.400 1.200-2.600 2.400-3.600zM12 11v6.800" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/** 分路图标：上路/中路/下路/打野 */
export function laneIcon(lane: RoleLane): string {
  return wrap(24, LANE_GLYPHS[lane]);
}

export const LANE_NAMES: Record<RoleLane, string> = { top: '上路', mid: '中路', bot: '下路', jungle: '打野' };
