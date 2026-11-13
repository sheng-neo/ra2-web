/**
 * 英雄技能图标（5 英雄 × 被动 + 三技能）与通用技能(回城 / 疗伤 / 闪现)图标。
 * 每个图标按技能含义手绘，意象取自各人的典故：樊哙 = 双弧漆盾；程咬金 = 宣花大斧与一 / 二 / 三道刻痕(三板斧)；
 * 王昭君 = 弦音、雁、塞外的月；李广 = 角弓、白羽、没石；荆轲 = 匕首、墨痕、图卷。
 * 底色取该英雄 palette 的界面身份色；主体都落在中心安全圆内，方形槽与圆形技能键通用。
 */
import { HEROES } from '../../core/data/heroes';
import type { AbilitySlot, HeroId, SummonerSlot } from '../../core/types';
import { INK, arc, badge, darken, glow, glowDef, lg, lighten, mix, polar, rg, star4 } from './svg';

export type HeroIconSlot = AbilitySlot | 'passive';

type Draw = () => string;

/** 英雄技能底色：以主色为基调压暗，大招更亮更偏辉光色 */
function heroBg(id: HeroId, ult = false): [string, string, string] {
  const p = HEROES[id].palette;
  const base = id === 'yeque' ? lighten(p.primary, 0.12) : p.primary;
  return ult
    ? [mix(base, p.glow, 0.45), darken(base, 0.35), darken(base, 0.82)]
    : [mix(base, p.glow, 0.18), darken(base, 0.5), darken(base, 0.86)];
}

/**
 * 刻痕记号：n 道并排的短斜痕(像刀斧在木头上砍出来的记数)。(x, y) 是第一道的底端。
 * 传了 hot 就把最后一道提亮(「第三下」)。
 */
function notches(x: number, y: number, n: number, color: string, hot?: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const px = Math.round((x + i * 4.8) * 10) / 10;
    const d = `M${px} ${y}L${px + 2.2} ${y - 8.5}`;
    s += `<path d="${d}" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="${d}" stroke="${hot && i === n - 1 ? hot : color}" stroke-width="2.3" stroke-linecap="round"/>`;
  }
  return s;
}

/** 地面裂纹：深色粗线垫底 + 发光细线 */
const crack = (d: string, color: string, w = 1.8): string =>
  `<path d="${d}" fill="none" stroke="#150e05" stroke-width="${w + 2.8}" stroke-linejoin="round" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;

// ════════════════════════ 樊哙 · 坦克 ════════════════════════
// 意象：黑漆朱纹的双弧大盾、青铜盾鼻、夯土尘浪。不再有岩刺与晶簇
const FK = { lacquer: '#2a2327', lacquerL: '#63545a', red: '#d04a32', bronze: '#d9a441', bronzeL: '#ffe6a8', bronzeD: '#7d5518', glow: '#ffcf70', hot: '#fff3cf', dust: '#c2a274', skin: '#dba87e', hair: '#231c1b', dark: '#1a1d25', wood: '#6b5236', steel: '#dfe6ee' };

/** 双弧漆盾(正面)：上缘两道弧在中间起尖，下缘收成一个钝尖。中心在原点，宽 30、高 44，用 transform 摆放 */
const SHIELD = 'M0 -22Q4.2 -15.4 15 -15.8L14.1 4.4Q12 15.4 0 22Q-12 15.4 -14.1 4.4L-15 -15.8Q-4.2 -15.4 0 -22Z';
const SHIELD_DEFS =
  lg('sh', -12, -20, 12, 20, [[0, FK.lacquerL], [0.5, FK.lacquer], [1, '#100d10']]) + rg('boss', -1.4, -3.4, 7, [[0, '#fffbe9'], [0.45, FK.bronze], [1, FK.bronzeD]]);

/** 一面盾：青铜包边 → 黑漆盾面 → 朱红勾边 → 中脊与盾鼻 */
function shield(transform: string): string {
  return (
    `<g transform="${transform}">` +
    `<path d="${SHIELD}" fill="${FK.bronze}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="${SHIELD}" transform="scale(.85)" fill="url(#@sh)"/>` +
    `<path d="${SHIELD}" transform="scale(.66)" fill="none" stroke="${FK.red}" stroke-width="1.9" stroke-linejoin="round"/>` +
    `<path d="M0 -12.5V13.5" stroke="${FK.bronze}" stroke-width="1.3" opacity=".75"/>` +
    `<circle cx="0" cy="-1.5" r="5.2" fill="url(#@boss)" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M-13.4 -14.3Q-5 -14.7 -.8 -19.4" fill="none" stroke="${FK.bronzeL}" stroke-width="1.2" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** 一支长戟：戟尖在 (x, y)，杆身朝下长 len，整体绕戟尖转 rot 度；flip 把小枝换到另一侧 */
function halberd(x: number, y: number, rot: number, len: number, flip = false): string {
  return (
    `<g transform="translate(${x} ${y}) rotate(${rot})${flip ? ' scale(-1 1)' : ''}">` +
    `<path d="M0 7V${len}" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>` +
    `<path d="M0 7V${len}" stroke="${FK.wood}" stroke-width="2.3" stroke-linecap="round"/>` +
    `<path d="M2 12Q10 11 10.500 3Q6.500 7 2 6.500Z" fill="${FK.steel}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="M0 -3L-2.800 7H2.800Z" fill="${FK.steel}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
    `</g>`
  );
}

/** 盾后的那张脸：上指的发束、赭红额带、怒眉怒目。以 (cx, cy) 为脸心，s 为缩放 */
function angryFace(cx: number, cy: number, s: number): string {
  return (
    `<g transform="translate(${cx} ${cy}) scale(${s})">` +
    `<path d="M-11.500 -2L-16 -13L-8.500 -7.500L-6.500 -16L-2.500 -8.500L0 -17.500L2.500 -8.500L6.500 -16L8.500 -7.500L16 -13L11.500 -2Z" fill="${FK.hair}" stroke="${INK}" stroke-width="1.200" stroke-linejoin="round"/>` +
    `<ellipse cx="0" cy="1.500" rx="11.500" ry="8.500" fill="${FK.skin}" stroke="${INK}" stroke-width="1.300"/>` +
    `<path d="M-11 -3.200Q0 -5.800 11 -3.200" fill="none" stroke="${FK.red}" stroke-width="2.600"/>` +
    `<path d="M-10 -1.200L-2.600 2.600M10 -1.200L2.600 2.600" stroke="${FK.hair}" stroke-width="2.700" stroke-linecap="round"/>` +
    `<ellipse cx="-5.600" cy="4" rx="2.900" ry="1.900" fill="#fff"/><circle cx="-4.900" cy="4" r="1.250" fill="${INK}"/>` +
    `<ellipse cx="5.600" cy="4" rx="2.900" ry="1.900" fill="#fff"/><circle cx="4.900" cy="4" r="1.250" fill="${INK}"/>` +
    `</g>`
  );
}

const panyue: Record<HeroIconSlot, Draw> = {
  // 覆盾震地：大盾下缘砸进地面，震波与裂纹向两侧散开；角上三道刻痕(第三下提亮)
  passive: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', FK.glow) + SHIELD_DEFS,
      `<ellipse cx="34" cy="51.500" rx="25" ry="6" fill="none" stroke="${FK.bronze}" stroke-width="1.800" opacity=".85"/>` +
        `<ellipse cx="34" cy="51.500" rx="15.500" ry="3.600" fill="none" stroke="${FK.glow}" stroke-width="1.100" opacity=".5"/>` +
        glow('g', 35, 50, 17) +
        crack('M35 50L26 52.500L18 50.500L10 53M35 50L43 54L51 52L58 54.500M35 50L32 57L25 60M35 50L40 59.500', FK.glow) +
        shield('translate(30 28) rotate(-14)') +
        `<path d="M20 46L15.500 39.500L23 42.500Z" fill="${FK.dust}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M48 46.500L53.500 41L52.500 48.500Z" fill="${FK.dust}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="${star4(35.5, 49.5, 5.5, 0.14)}" fill="#fffdf2"/>` +
        notches(41.5, 23, 3, FK.bronze, FK.hot),
    ),

  // 侧盾闯帐：侧起的大盾向右猛撞，把门前交叉的两支长戟撞开，身后拖出速度线
  s1: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', FK.glow) + SHIELD_DEFS + lg('st', 1, 0, 19, 0, [[0, FK.glow, 0], [1, FK.hot, 0.95]]),
      halberd(57, 13.5, 30, 42) +
        halberd(43.5, 8.5, -19, 46, true) +
        `<path d="M3 21H18M0 32H15M4 43H18" fill="none" stroke="url(#@st)" stroke-width="2.800" stroke-linecap="round"/>` +
        glow('g', 42, 32, 16) +
        shield('translate(27.500 32) rotate(11) skewY(-7) scale(.68 1.02)') +
        `<path d="M39.500 12.500Q49 32 39.500 51.500" fill="none" stroke="${FK.hot}" stroke-width="2.300" stroke-linecap="round" opacity=".95"/>` +
        `<path d="M44 20Q49.500 32 44 44" fill="none" stroke="${FK.glow}" stroke-width="1.300" stroke-linecap="round" opacity=".6"/>` +
        `<path d="${star4(44.5, 32, 5.6, 0.14)}" fill="#fffdf2"/>` +
        `<path d="M52 22L56.500 19L55 25ZM53 41L57.500 43.500L52.500 45.500Z" fill="${FK.bronzeL}"/>`,
    ),

  // 拥盾怒目：正面立盾，盾后露出上指的发束与一双怒目，外圈一道震慑波
  s2: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', FK.glow) + SHIELD_DEFS,
      glow('g', 32, 34, 30) +
        `<circle cx="32" cy="34" r="27.500" fill="none" stroke="${FK.glow}" stroke-width="1.500" stroke-dasharray="6 3.500" opacity=".6"/>` +
        `<circle cx="32" cy="34" r="23.500" fill="none" stroke="${FK.bronze}" stroke-width="2.200" opacity=".9"/>` +
        angryFace(32, 16, 0.9) +
        shield('translate(32 39.500) scale(1.02 .92)'),
    ),

  // 跃盾砸阵：连人带盾从天上砸下来，落点炸开放射状的裂纹
  ult: () =>
    badge(
      heroBg('panyue', true),
      glowDef('g', FK.glow, 1) + SHIELD_DEFS + lg('fall', 0, 0, 0, 24, [[0, FK.hot, 0], [1, FK.hot, 0.9]]),
      `<ellipse cx="32" cy="54" rx="27" ry="6.500" fill="none" stroke="${FK.bronze}" stroke-width="1.600" opacity=".7"/>` +
        glow('g', 32, 53, 21) +
        crack('M32 53L22 50L13 54.500L4 51.500M32 53L26.500 59L18 61M32 53L42 56.500L51 52.500L60 55.500M32 53L38 61', FK.glow, 1.9) +
        `<path d="M11 3V23M53 2V22M19.500 0V11M45 0V12" fill="none" stroke="url(#@fall)" stroke-width="2.400" stroke-linecap="round"/>` +
        // 人影：肩臂压在盾后，右手的汉剑斜举
        `<path d="M46 19L55.500 6.500" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M46 19L55.500 6.500" stroke="${FK.steel}" stroke-width="1.900" stroke-linecap="round"/>` +
        `<path d="M17.500 31Q15 19.500 25 17L32 14L39 17Q49.500 19.500 46.500 31Z" fill="${FK.dark}" stroke="${INK}" stroke-width="1.500" stroke-linejoin="round"/>` +
        `<path d="M17.500 31Q15 19.500 25 17" fill="none" stroke="${FK.bronze}" stroke-width="1.200" stroke-linecap="round" opacity=".85"/>` +
        angryFace(32, 11.5, 0.6) +
        shield('translate(32 35) scale(.84)') +
        `<path d="${star4(32, 53.5, 7, 0.14)}" fill="#fffdf2"/>`,
    ),
};

// ════════════════════════ 程咬金 · 战士 ════════════════════════
// 意象：宣花大斧、赤金斧弧、劲风。三板斧的三式各带一 / 二 / 三道刻痕。不再有火舌与火旋风
const CY = { red: '#d2402a', deep: '#7c1f14', dark: '#1e1719', iron: '#4a4447', steel: '#c9ced6', edge: '#fff4e2', gold: '#e2a13a', goldL: '#ffd98a', glow: '#ff7a2a', hot: '#ffe7a3', wood: '#6b4a2e', heal: '#6fe3a1' };

const AXE_DEFS = lg('ax', 1, 0, 23, 0, [[0, CY.iron], [0.45, '#8d9299'], [0.82, CY.steel], [1, CY.edge]]);

/**
 * 宣花大斧。原点在斧头与斧柄相接处，斧柄朝下长 shaft(0 = 只画斧头)，宽刃朝右；用 transform 摆放。
 * 需要配套渐变 AXE_DEFS。
 */
function axe(transform: string, shaft = 26): string {
  const pole =
    shaft > 0
      ? `<path d="M0 -10V${shaft}" stroke="${INK}" stroke-width="5.600" stroke-linecap="round"/>` +
        `<path d="M0 -10V${shaft}" stroke="${CY.wood}" stroke-width="3.200" stroke-linecap="round"/>` +
        `<path d="M-1.600 5.500H1.600M-1.600 ${shaft - 4}H1.600" stroke="${CY.gold}" stroke-width="2.200"/>`
      : '';
  return (
    `<g transform="${transform}">` +
    pole +
    `<path d="M-1.500 -13L-9.500 -8L-1.500 -2Z" fill="${CY.iron}" stroke="${INK}" stroke-width="1.200" stroke-linejoin="round"/>` +
    `<path d="M1 -15Q10 -15 16 -22Q27.500 -6.500 16 9Q10 2 1 1Z" fill="url(#@ax)" stroke="${INK}" stroke-width="1.500" stroke-linejoin="round"/>` +
    `<path d="M16 -22Q27.500 -6.500 16 9" fill="none" stroke="${CY.edge}" stroke-width="1.600" stroke-linecap="round"/>` +
    `<path d="M5.500 -10.500Q13 -7 5.500 -3.500" fill="none" stroke="${CY.gold}" stroke-width="1.400" stroke-linecap="round"/>` +
    `<rect x="-2.800" y="-16" width="5.600" height="18" rx="1.600" fill="${CY.gold}" stroke="${INK}" stroke-width="1.100"/>` +
    `<path d="M0 -23.500L-2.600 -16H2.600Z" fill="${CY.steel}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="M-2.600 2Q-7.500 7 -4.500 13Q-1 8 -.6 2Z" fill="${CY.red}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>` +
    `</g>`
  );
}

const chijin: Record<HeroIconSlot, Draw> = {
  // 越砍越勇：一柄大斧，右下角一个绿色的回血十字
  passive: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CY.glow) + glowDef('gh', CY.heal, 0.9) + AXE_DEFS,
      glow('g', 36, 22, 24) +
        axe('translate(22.500 34) rotate(-30) scale(1.160)', 21) +
        glow('gh', 48, 48, 13) +
        `<path d="M45.400 40H50.600V45.400H56V50.600H50.600V56H45.400V50.600H40V45.400H45.400Z" fill="#effff5" stroke="#12603a" stroke-width="1.400" stroke-linejoin="round"/>` +
        `<path d="M47 41.800H49V47H54.200" fill="none" stroke="${CY.heal}" stroke-width="1.300" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${star4(47.5, 13, 3.4)}" fill="${CY.edge}"/>`,
    ),

  // 拦腰一斧：一道自右向左横扫的宽斧弧，斧头在弧的尽头；一道刻痕
  s1: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CY.glow) + AXE_DEFS + lg('sw', 60, 0, 8, 0, [[0, CY.deep, 0], [0.35, CY.glow, 0.85], [0.8, CY.gold], [1, CY.edge]]),
      glow('g', 22, 30, 22) +
        `<path d="M60 31.500A27.500 27.500 0 0 0 8 34.500L21 37.500A23 23 0 0 1 60 31.500Z" fill="url(#@sw)"/>` +
        `<path d="M48 18.500A27.500 27.500 0 0 0 8 34.500" fill="none" stroke="${CY.edge}" stroke-width="1.700" stroke-linecap="round"/>` +
        `<path d="M55 37Q44 28 30 31" fill="none" stroke="${CY.goldL}" stroke-width="1.200" stroke-linecap="round" opacity=".7"/>` +
        axe('translate(21 31) rotate(8) matrix(0 .8 .8 0 0 0)', 0) +
        notches(38.5, 56, 1, CY.gold),
    ),

  // 半路杀出：大斧像撞角一样向右冲出去，身后是速度线与劲风；两道刻痕
  s2: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CY.glow) + AXE_DEFS + lg('st', 0, 0, 30, 0, [[0, CY.glow, 0], [1, CY.hot, 0.95]]),
      `<g transform="rotate(-9 32 32)">` +
        glow('g', 46, 30, 19) +
        `<path d="M0 17H24M-2 26.500H17M2 39H21" fill="none" stroke="url(#@st)" stroke-width="2.800" stroke-linecap="round"/>` +
        `<path d="M20 12Q34 8 46 13M22 47Q33 50 42 47" fill="none" stroke="${CY.goldL}" stroke-width="1.400" stroke-linecap="round" opacity=".75"/>` +
        axe('translate(37 28.500) rotate(90) scale(.9)', 30) +
        `<path d="${star4(59.5, 28.5, 4)}" fill="#fffdf2"/>` +
        `</g>` +
        notches(15, 55.5, 2, CY.gold),
    ),

  // 抡圆了砍：两把斧头首尾相逐，抡成一整圈的斧影；圈心三道刻痕
  ult: () => {
    const sweep =
      `<path d="M52.500 20A24 24 0 0 0 9.400 23.800L15.500 27A18.500 18.500 0 0 1 52.500 20Z" fill="url(#@sw)"/>` +
      `<path d="M41 9.800A24 24 0 0 0 9.400 23.800" fill="none" stroke="${CY.edge}" stroke-width="1.400" stroke-linecap="round"/>`;
    const head = axe('translate(13 30.500) rotate(-70) matrix(0 .62 .62 0 0 0)', 0);
    return badge(
      heroBg('chijin', true),
      glowDef('g', CY.glow, 1) + AXE_DEFS + lg('sw', 52, 0, 9, 0, [[0, CY.deep, 0], [0.4, CY.glow, 0.9], [0.85, CY.gold], [1, CY.edge]]),
      glow('g', 32, 32, 30) +
        `<circle cx="32" cy="32" r="26.500" fill="none" stroke="${CY.hot}" stroke-width="1.100" stroke-dasharray="9 5" opacity=".65"/>` +
        `<g>${sweep}${head}</g><g transform="rotate(180 32 32)">${sweep}${head}</g>` +
        `<circle cx="32" cy="32" r="10.500" fill="${CY.dark}" fill-opacity=".55" stroke="${CY.gold}" stroke-width="1"/>` +
        notches(26.1, 36.5, 3, CY.gold),
    );
  },
};

// ════════════════════════ 王昭君 · 法师 ════════════════════════
// 意象：弦音、雁、塞外的月。月白青 + 弦金，不用冰晶与雪花
const ZJ = { indigo: '#3d4c9e', deep: '#161c48', moon: '#eef5ff', glow: '#a9d4ff', gold: '#ffd98a', goldD: '#b98a3a', red: '#c8324a', wood: '#7a4a2c', woodL: '#c08a52', sand: '#e0c084', sandD: '#6c5634' };

/** 一只俯冲的雁(俯视)：长颈朝 +x，双翼张开略向后掠，尾羽分叉。(x, y) 为身体中心，rot 为俯冲方向(度)，s 为缩放 */
function goose(x: number, y: number, rot: number, s: number): string {
  return (
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
    `<path d="M-10 0H-30" stroke="${ZJ.glow}" stroke-width="1.800" stroke-linecap="round" opacity=".5"/>` +
    `<path d="M14 0L5 -1.500Q3 -7.500 -4 -13.500Q-1.500 -6.500 -3 -1.700L-10 -2.400L-8 0L-10 2.400L-3 1.700Q-1.500 6.500 -4 13.500Q3 7.500 5 1.500Z" fill="#ffffff" stroke="${ZJ.deep}" stroke-width="1.500" stroke-linejoin="round"/>` +
    `<path d="M14 0L10.500 -.7V.7Z" fill="${ZJ.deep}"/>` +
    `</g>`
  );
}

/** 一段向内收拢的回旋线：从 (r0, a0) 转 turns 圈收到 r1 */
function spiral(cx: number, cy: number, r0: number, r1: number, a0: number, turns: number): string {
  const n = 30;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = polar(cx, cy, r0 + (r1 - r0) * t, a0 + turns * 360 * t);
    d += `${i === 0 ? 'M' : 'L'}${x} ${y}`;
  }
  return d;
}

const xingli: Record<HeroIconSlot, Draw> = {
  // 余音三叠：一根被拨动的弦，荡出由小到大三道音波，第三道是金色
  passive: () =>
    badge(
      heroBg('xingli'),
      glowDef('g', ZJ.glow) + glowDef('gg', ZJ.gold, 0.8),
      `<path d="M4 61L27 38" stroke="${ZJ.gold}" stroke-width="1.300" stroke-linecap="round" opacity=".8"/>` +
        glow('g', 15, 50, 13) +
        glow('gg', 42, 23, 17) +
        `<path d="${arc(15, 50, 13, 281, 354)}" fill="none" stroke="${ZJ.moon}" stroke-width="2.800" stroke-linecap="round"/>` +
        `<path d="${arc(15, 50, 24.5, 280, 355)}" fill="none" stroke="${ZJ.glow}" stroke-width="3.300" stroke-linecap="round"/>` +
        `<path d="${arc(15, 50, 37, 279, 356)}" fill="none" stroke="#3a2a08" stroke-width="6.400" stroke-linecap="round" opacity=".55"/>` +
        `<path d="${arc(15, 50, 37, 279, 356)}" fill="none" stroke="${ZJ.gold}" stroke-width="4.200" stroke-linecap="round"/>` +
        `<path d="${arc(15, 50, 37, 290, 345)}" fill="none" stroke="#fffdf2" stroke-width="1.200" stroke-linecap="round" opacity=".9"/>` +
        `<circle cx="15" cy="50" r="3.600" fill="#ffffff" stroke="${ZJ.goldD}" stroke-width="1.200"/>` +
        `<circle cx="50.500" cy="16" r="1.500" fill="${ZJ.gold}"/><circle cx="55" cy="29" r="1.100" fill="#fffdf2"/>`,
    ),

  // 一弦穿云：琵琶琴头上一根弦绷直了弹出去，笔直贯穿画面，把云穿成两半
  s1: () =>
    badge(
      heroBg('xingli'),
      glowDef('g', ZJ.glow, 1) + lg('ln', 22, 0, 66, 0, [[0, ZJ.gold], [0.3, '#ffffff'], [1, ZJ.glow]]) + lg('nk', 0, 28, 0, 36, [[0, ZJ.woodL], [1, ZJ.wood]]),
      `<g transform="rotate(-45 32 32)">` +
        // 被穿开的云
        `<path d="M46 23.500Q46 18 51.500 18.500Q54 13.500 59 17Q64 16 64 22Q66 25.500 62 26.500H48.500Q45.500 26.500 46 23.500Z" fill="${ZJ.moon}" fill-opacity=".42" stroke="${ZJ.glow}" stroke-width="1.100" stroke-linejoin="round"/>` +
        `<path d="M44 40.500Q44 46 49.500 45.500Q52 50.500 57 47Q62 48 62 42Q64 38.500 60 37.500H46.500Q43.500 37.500 44 40.500Z" fill="${ZJ.moon}" fill-opacity=".42" stroke="${ZJ.glow}" stroke-width="1.100" stroke-linejoin="round"/>` +
        // 弦音：光晕 + 亮芯 + 沿途的音波弧
        `<path d="M26 32H70" stroke="${ZJ.glow}" stroke-width="8" stroke-linecap="round" opacity=".32"/>` +
        `<path d="M34 25.500Q38 32 34 38.500M41 27Q44.500 32 41 37" fill="none" stroke="${ZJ.moon}" stroke-width="1.500" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M-6 32H70" stroke="url(#@ln)" stroke-width="3" stroke-linecap="round"/>` +
        glow('g', 54, 32, 10) +
        `<path d="M46 32L54 29.300L66 32L54 34.700Z" fill="#ffffff"/>` +
        // 琴头：琴颈、四个弦轴、如意形的头
        `<path d="M8 28.500L4.500 19.500M17 28.500L13.500 19.500M11 35.500L7.500 44.500M20 35.500L16.500 44.500" stroke="${INK}" stroke-width="4.200" stroke-linecap="round"/>` +
        `<path d="M8 28.500L4.500 19.500M17 28.500L13.500 19.500M11 35.500L7.500 44.500M20 35.500L16.500 44.500" stroke="${ZJ.woodL}" stroke-width="2.200" stroke-linecap="round"/>` +
        `<circle cx="4.200" cy="18.800" r="2.400" fill="${ZJ.gold}" stroke="${INK}" stroke-width=".9"/><circle cx="13.200" cy="18.800" r="2.400" fill="${ZJ.gold}" stroke="${INK}" stroke-width=".9"/>` +
        `<circle cx="7.200" cy="45.200" r="2.400" fill="${ZJ.gold}" stroke="${INK}" stroke-width=".9"/><circle cx="16.200" cy="45.200" r="2.400" fill="${ZJ.gold}" stroke="${INK}" stroke-width=".9"/>` +
        `<path d="M-6 28H22Q30.500 25.500 31 32Q30.500 38.500 22 36H-6Z" fill="url(#@nk)" stroke="${INK}" stroke-width="1.400" stroke-linejoin="round"/>` +
        `<path d="M24 29.200Q28.300 29.500 28.300 32Q28.300 34.500 24 34.800" fill="none" stroke="${ZJ.gold}" stroke-width="1.400" stroke-linecap="round"/>` +
        `<path d="M-6 32H24" stroke="#fffdf2" stroke-width="1.300" stroke-linecap="round"/>` +
        `</g>`,
    ),

  // 回环收弦：一圈曲音向内回旋收拢，环上四个点正被拉向中心
  s2: () => {
    const dot = (a: number): string => {
      const [x0, y0] = polar(32, 32, 27, a - 16);
      const [x, y] = polar(32, 32, 17.5, a);
      return `<path d="M${x0} ${y0}L${x} ${y}" stroke="${ZJ.gold}" stroke-width="1.700" stroke-linecap="round" opacity=".75"/><circle cx="${x}" cy="${y}" r="2.900" fill="${ZJ.gold}" stroke="${INK}" stroke-width=".9"/>`;
    };
    return badge(
      heroBg('xingli'),
      glowDef('g', ZJ.glow, 1) + rg('sp', 32, 32, 26, [[0.15, '#ffffff'], [0.6, ZJ.glow], [1, ZJ.indigo, 0.5]]),
      `<circle cx="32" cy="32" r="26.500" fill="none" stroke="${ZJ.glow}" stroke-width="1.300" stroke-dasharray="2 4" opacity=".7"/>` +
        `<path d="${spiral(32, 32, 24, 6, 200, 1.35)}" fill="none" stroke="url(#@sp)" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${spiral(32, 32, 24, 6, 20, 1.35)}" fill="none" stroke="url(#@sp)" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/>` +
        [50, 140, 230, 320].map(dot).join('') +
        glow('g', 32, 32, 13) +
        `<circle cx="32" cy="32" r="4.200" fill="#ffffff" stroke="${ZJ.goldD}" stroke-width="1.200"/>`,
    );
  },

  // 雁落平沙：一轮圆月下，三只雁影排成斜线向沙丘俯冲
  ult: () =>
    badge(
      heroBg('xingli', true),
      glowDef('g', ZJ.moon, 0.8) +
        rg('mo', 39, 15, 16, [[0, '#ffffff'], [0.7, '#e3eeff'], [1, '#b9cdf5']]) +
        lg('sd', 0, 44, 0, 64, [[0, ZJ.sand], [1, ZJ.sandD]]) +
        lg('sd2', 0, 40, 0, 60, [[0, '#8f7a52'], [1, '#3b3020']]),
      glow('g', 42, 18, 24) +
        `<circle cx="42" cy="18" r="12.500" fill="url(#@mo)" stroke="${ZJ.deep}" stroke-width=".8"/>` +
        `<path d="M0 50Q14 40 30 45Q46 50 64 41V64H0Z" fill="url(#@sd2)"/>` +
        `<path d="M0 58Q18 45 36 52Q50 57 64 49V64H0Z" fill="url(#@sd)"/>` +
        `<path d="M0 58Q18 45 36 52Q50 57 64 49" fill="none" stroke="#fff3cf" stroke-width="1.300" stroke-linecap="round" opacity=".9"/>` +
        `<ellipse cx="22" cy="55.500" rx="12" ry="2.400" fill="${ZJ.moon}" opacity=".3"/>` +
        goose(48.5, 21.5, 142, 0.6) +
        goose(34, 32.5, 142, 0.76) +
        goose(19, 43.5, 142, 0.64),
    ),
};

// ════════════════════════ 李广 · 射手 ════════════════════════
// 意象：黑漆角弓、白羽箭、草中的石头。不再有气旋与风叶
const LG = { teal: '#3fae8c', deep: '#12403f', ink: '#0b2422', cream: '#f6f3e6', gold: '#e9c46a', mint: '#9df5d2', leather: '#8a5a36', skin: '#dba87e', bow: '#2a262c', stoneL: '#c5ccd2', stone: '#8c959d', stoneD: '#555e67', grass: '#4fbf8f', grassD: '#1d6b58' };

/** 一支朝下坠落的羽箭（原点在箭身中段） */
const fallingArrow =
  `<path d="M0 -22V-12" stroke="${LG.mint}" stroke-width="1.100" stroke-linecap="round" opacity=".55"/>` +
  `<path d="M0 -12V5" stroke="${LG.cream}" stroke-width="1.900" stroke-linecap="round"/>` +
  `<path d="M-2.600 -13L0 -10L2.600 -13M-2.600 -10L0 -7L2.600 -10" fill="none" stroke="#ffffff" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M-3.400 3L0 11.500L3.400 3L0 5.200Z" fill="#ffffff" stroke="${LG.ink}" stroke-width=".7" stroke-linejoin="round"/>`;

/** 一丛草：根在 (x, y)，h 为高度 */
function grass(x: number, y: number, h: number): string {
  const b = (dx: number, lean: number, k: number, c: string): string =>
    `<path d="M${x + dx - 1.6} ${y}Q${x + dx + lean * 0.3} ${y - h * k * 0.6} ${x + dx + lean} ${y - h * k}Q${x + dx + lean * 0.5 + 1.4} ${y - h * k * 0.5} ${x + dx + 1.6} ${y}Z" fill="${c}"/>`;
  return b(-4, -5, 0.75, LG.grassD) + b(4.5, 5, 0.85, LG.grassD) + b(0, 1.5, 1, LG.grass) + b(-2, -3, 0.6, LG.grass);
}

const fengling: Record<HeroIconSlot, Draw> = {
  // 猿臂连射：一条长臂把角弓拉满，下面由短到长五道箭痕(最后一道金色)
  passive: () => {
    let marks = '';
    for (let i = 0; i < 5; i++) {
      const x = 17.5 + i * 6.6;
      const h = 4.5 + i * 2.1;
      const d = `M${x} 58L${Math.round((x + h * 0.42) * 10) / 10} ${58 - h}`;
      marks += `<path d="${d}" stroke="${INK}" stroke-width="4.200" stroke-linecap="round"/><path d="${d}" stroke="${i === 4 ? LG.gold : LG.cream}" stroke-width="2.200" stroke-linecap="round"/>`;
    }
    return badge(
      heroBg('fengling'),
      glowDef('g', LG.mint),
      `<g transform="rotate(-10 32 26)">` +
        glow('g', 46, 25, 17) +
        // 前臂与护臂
        `<path d="M-2 39.500L14.500 27.500L18.500 32.500L1 46.500Z" fill="${LG.skin}" stroke="${INK}" stroke-width="1.300" stroke-linejoin="round"/>` +
        `<path d="M3.500 36L9.500 31.500L13.500 36.500L7.500 41Z" fill="${LG.leather}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        // 弦、弓
        `<path d="M40 6.500L17.500 25L40 43.500" fill="none" stroke="${LG.cream}" stroke-width="1.200" stroke-linejoin="round"/>` +
        `<path d="M40 6.500Q50.500 13.500 47.500 25Q50.500 36.500 40 43.500" fill="none" stroke="${INK}" stroke-width="5.800" stroke-linecap="round"/>` +
        `<path d="M40 6.500Q50.500 13.500 47.500 25Q50.500 36.500 40 43.500" fill="none" stroke="${LG.bow}" stroke-width="3.400" stroke-linecap="round"/>` +
        `<path d="M41.500 8.500Q49.500 15 46.800 24" fill="none" stroke="${LG.mint}" stroke-width=".9" stroke-linecap="round" opacity=".8"/>` +
        `<path d="M47.300 21.500V28.500" stroke="${LG.gold}" stroke-width="4.600"/>` +
        `<circle cx="40" cy="6.500" r="1.900" fill="${LG.gold}"/><circle cx="40" cy="43.500" r="1.900" fill="${LG.gold}"/>` +
        // 箭
        `<path d="M17.500 25H56" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/>` +
        `<path d="M17.500 25H56" stroke="${LG.cream}" stroke-width="1.700" stroke-linecap="round"/>` +
        `<path d="M54 21.200L62.500 25L54 28.800L56 25Z" fill="#ffffff" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M21.500 24.300L24 20.800H30.500L28 24.300ZM21.500 25.700L24 29.200H30.500L28 25.700Z" fill="#ffffff" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>` +
        `<circle cx="17" cy="26.500" r="3.900" fill="${LG.skin}" stroke="${INK}" stroke-width="1.300"/>` +
        `</g>` +
        marks,
    );
  },

  // 白羽没石：一支白羽箭射进草中的巨石，箭头没入，石面裂开
  s1: () =>
    badge(
      heroBg('fengling'),
      glowDef('g', LG.mint) + lg('rk', 28, 20, 58, 56, [[0, LG.stoneL], [0.5, LG.stone], [1, LG.stoneD]]),
      grass(9, 60, 15) +
        grass(22, 62, 11) +
        // 巨石
        `<path d="M29 56L26 39L34 25.500L49.500 20.500L60 30L62 48L53 57.500Z" fill="url(#@rk)" stroke="${INK}" stroke-width="1.600" stroke-linejoin="round"/>` +
        `<path d="M26 39L34 25.500L49.500 20.500L44.500 32L33 37Z" fill="#dfe5ea" opacity=".85"/>` +
        `<path d="M49.500 20.500L60 30L62 48L48 45L44.500 32Z" fill="${LG.stoneD}" opacity=".55"/>` +
        // 裂纹：自箭入处放射
        glow('g', 38.5, 36, 12) +
        `<path d="M38.500 36L45 31.500L50.500 33.500M38.500 36L44 42L43 49.500M38.500 36L47.500 39.500L54.500 45.500M38.500 36L34.500 44.500L37 51M38.500 36L37 29.500" fill="none" stroke="#0b1210" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M38.500 36L45 31.500L50.500 33.500M38.500 36L44 42L43 49.500M38.500 36L47.500 39.500L54.500 45.500M38.500 36L34.500 44.500L37 51M38.500 36L37 29.500" fill="none" stroke="${LG.mint}" stroke-width="1.100" stroke-linejoin="round" stroke-linecap="round"/>` +
        // 箭：自左上射入，箭头没进石头里，只露出箭杆与白羽
        `<g transform="translate(38.500 36) rotate(40)">` +
        `<path d="M-37 0H-1" stroke="${INK}" stroke-width="3.800" stroke-linecap="round"/>` +
        `<path d="M-37 0H-1" stroke="${LG.cream}" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M-39 -.6L-37.500 -6.200L-32.500 -4.200L-31.500 -7L-23.500 -5L-18.500 -.6Z" fill="#ffffff" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M-39 .6L-37.500 6.200L-32.500 4.200L-31.500 7L-23.500 5L-18.500 .6Z" fill="#e3ede6" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M-35 -4.500L-33 0L-35 4.500M-28.500 -5L-26.500 0L-28.500 5M-24.500 -4L-22.500 0L-24.500 4" fill="none" stroke="${LG.deep}" stroke-width=".8" opacity=".55"/>` +
        `<path d="M-17 0H-13" stroke="${LG.gold}" stroke-width="2.200"/>` +
        `</g>` +
        // 崩出来的石屑
        `<path d="M30 27L26.500 22L32.500 23.500ZM43 26.500L44.500 21L47.500 26ZM28.500 45L23.500 46.500L27 50Z" fill="${LG.stoneL}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>` +
        `<path d="${star4(38.5, 36, 4.2)}" fill="#ffffff"/>`,
    ),

  // 飞将腾身：持弓的人影腾空侧翻，身下一道跃起的弧线，箭镞上一点金光
  s2: () => {
    const limbs = 'M37 23Q33.500 29 26.500 31M26.500 31L17.500 27L11.500 32.500M26.500 31L20 37.500L12 37M36 24L45.500 21.500M36 24L39.500 27.500';
    return badge(
      heroBg('fengling'),
      glowDef('g', LG.mint) + glowDef('gg', LG.gold, 1),
      `<path d="M7 53.500Q31 37 56 52" fill="none" stroke="${LG.gold}" stroke-width="1.800" stroke-linecap="round" stroke-dasharray="1 4"/>` +
        `<path d="M53.500 47.500L59.500 53.500L51.500 54.500Z" fill="${LG.gold}"/>` +
        `<g transform="rotate(-14 32 28)">` +
        glow('g', 30, 26, 22) +
        `<path d="M2 20H12M0 28H9M4 36H11" fill="none" stroke="${LG.mint}" stroke-width="1.600" stroke-linecap="round" opacity=".6"/>` +
        // 短披风
        `<path d="M35 21.500Q25 14 14 17.500Q22 21.500 28 28.500Z" fill="${LG.teal}" stroke="${INK}" stroke-width="1.100" stroke-linejoin="round"/>` +
        // 人影
        `<path d="${limbs}" fill="none" stroke="${LG.mint}" stroke-width="6.400" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="39" cy="18.500" r="5" fill="${LG.mint}"/>` +
        `<path d="${limbs}" fill="none" stroke="${LG.ink}" stroke-width="4.200" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="39" cy="18.500" r="3.900" fill="${LG.ink}"/>` +
        `<path d="M40.500 14.800L45.500 9M38.500 14.600L41 8" stroke="${LG.cream}" stroke-width="1.300" stroke-linecap="round"/>` +
        // 弓与搭着的箭
        `<path d="M46 8.500L41.500 21.500L46 35" fill="none" stroke="${LG.cream}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M46 8.500Q54 15 51.500 21.500Q54 28.500 46 35" fill="none" stroke="${INK}" stroke-width="4.600" stroke-linecap="round"/>` +
        `<path d="M46 8.500Q54 15 51.500 21.500Q54 28.500 46 35" fill="none" stroke="${LG.bow}" stroke-width="2.600" stroke-linecap="round"/>` +
        `<path d="M41.500 21.500H58" stroke="${LG.cream}" stroke-width="1.600" stroke-linecap="round"/>` +
        glow('gg', 59.5, 21.5, 8) +
        `<path d="${star4(59.5, 21.5, 5.4, 0.14)}" fill="#fff6dc"/>` +
        `</g>`,
    );
  },

  // 箭锁阴山：山脊线上空，密密的羽箭斜落下来，罩住一片圆形的落区
  ult: () => {
    const at: [number, number, number][] = [[12, 22, 0.8], [25, 13, 0.95], [38.5, 24, 1.1], [52, 15, 0.8], [21, 40, 0.95], [49, 40.5, 1], [35, 45, 0.75]];
    return badge(
      heroBg('fengling', true),
      glowDef('g', LG.mint, 0.75) + lg('mt', 0, 24, 0, 50, [[0, '#1d5e5a'], [1, '#0a2624']]),
      `<path d="M0 41L8 33.500L14.500 38L25 26.500L33 35.500L41 30L50 37.500L57 32.500L64 38V64H0Z" fill="url(#@mt)"/>` +
        `<path d="M0 41L8 33.500L14.500 38L25 26.500L33 35.500L41 30L50 37.500L57 32.500L64 38" fill="none" stroke="${LG.mint}" stroke-width="1.400" stroke-linejoin="round" opacity=".9"/>` +
        `<ellipse cx="32" cy="54" rx="26" ry="6.800" fill="url(#@g)"/>` +
        `<ellipse cx="32" cy="54" rx="25" ry="6.500" fill="none" stroke="${LG.mint}" stroke-width="1.700"/>` +
        `<ellipse cx="32" cy="54" rx="15" ry="3.600" fill="none" stroke="${LG.gold}" stroke-width="1.100" opacity=".8"/>` +
        at.map(([x, y, s]) => `<g transform="translate(${x} ${y}) rotate(18) scale(${s})">${fallingArrow}</g>`).join('') +
        `<path d="M17 55.500H23M43 56H49M31 58H36" stroke="#ffffff" stroke-width="1.200" stroke-linecap="round" opacity=".8"/>`,
    );
  },
};

// ════════════════════════ 荆轲 · 刺客 ════════════════════════
// 意象：淬过药的匕首、墨痕笔触、督亢图卷。墨紫 + 寒白，不再有影烟与能量刃
const JK = { ink: '#0e0a16', dark: '#1c1630', mid: '#4d3f86', accent: '#b48cff', glow: '#a886ff', steel: '#e8f0ff', cyan: '#bfe9e2', pale: '#e3d4ff', hp: '#f0584f', paper: '#e6d6a8', paperD: '#a58c56', map: '#5a4630' };

const DAGGER_DEFS = lg('dg', 0, -4, 0, 4, [[0, '#ffffff'], [0.5, JK.steel], [0.5, '#b4c2e4'], [1, '#8794c8']]);

/**
 * 一柄柳叶匕首。原点在刃根，刃尖朝 +x(长 22)，柄与环首在 -x 一侧；handle = false 时只画刃。
 * 需要配套渐变 DAGGER_DEFS。
 */
function dagger(transform: string, handle = true): string {
  const grip = handle
    ? `<path d="M-3 -1.900H-12.500V1.900H-3Z" fill="${JK.dark}" stroke="${INK}" stroke-width="1"/>` +
      `<path d="M-5.300 -1.900V1.900M-7.800 -1.900V1.900M-10.300 -1.900V1.900" stroke="${JK.accent}" stroke-width=".9"/>` +
      `<circle cx="-15.300" cy="0" r="2.700" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="-15.300" cy="0" r="2.700" fill="none" stroke="${JK.cyan}" stroke-width="1.400"/>` +
      `<path d="M-.5 -6.500Q-2.600 0 -.5 6.500L-3.200 6.500Q-5.300 0 -3.200 -6.500Z" fill="${JK.accent}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`
    : '';
  return (
    `<g transform="${transform}">` +
    `<path d="M22 0Q10 -5.200 -.5 -3.700V3.700Q10 5.200 22 0Z" fill="url(#@dg)" stroke="${INK}" stroke-width="1.200" stroke-linejoin="round"/>` +
    `<path d="M1 0H20" stroke="#ffffff" stroke-width=".8" stroke-linecap="round" opacity=".9"/>` +
    grip +
    `</g>`
  );
}

const yeque: Record<HeroIconSlot, Draw> = {
  // 一去不还：一柄匕首指着一条只剩小半截的生命条
  passive: () =>
    badge(
      heroBg('yeque'),
      glowDef('g', JK.glow) + glowDef('gr', JK.hp, 0.9) + DAGGER_DEFS + lg('hp', 0, 45, 0, 54, [[0, '#ffb8a8'], [0.4, JK.hp], [1, '#a8222d']]),
      glow('g', 38, 24, 22) +
        glow('gr', 18, 49.5, 13) +
        `<rect x="8.500" y="44.500" width="47" height="10" rx="3.200" fill="#07050c" stroke="${INK}" stroke-width="1.400"/>` +
        `<rect x="8.500" y="44.500" width="47" height="10" rx="3.200" fill="none" stroke="${JK.pale}" stroke-width="1" opacity=".55"/>` +
        `<rect x="10.200" y="46.200" width="14.500" height="6.600" rx="1.800" fill="url(#@hp)"/>` +
        `<path d="M27.400 45.500V53.500" stroke="${JK.pale}" stroke-width="1.100" stroke-dasharray="1.600 1.400"/>` +
        dagger('translate(38.500 26.500) rotate(135) scale(1.080)') +
        `<path d="${star4(21.5, 43, 4, 0.14)}" fill="#ffffff"/>`,
    ),

  // 风萧易水：横贯画面的一笔浓墨，笔锋处是匕首尖，两旁各一道风线
  s1: () =>
    badge(
      heroBg('yeque'),
      glowDef('g', JK.glow, 1) + DAGGER_DEFS,
      `<path d="M5 31Q21 24 33 11.500" fill="none" stroke="${JK.steel}" stroke-width="1.500" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M24 59Q42 51 57 36" fill="none" stroke="${JK.steel}" stroke-width="1.500" stroke-linecap="round" opacity=".7"/>` +
        // 一笔浓墨：起笔粗重带飞白，收笔渐细
        `<path d="M2.500 55.500Q5 47.500 13.500 44.500Q29 38 41.500 23L47 28.500Q34 45 17 55Q8 60.500 2.500 55.500Z" fill="${JK.ink}" stroke="${JK.accent}" stroke-width="1.100" stroke-linejoin="round"/>` +
        `<path d="M6 53.500Q14 50 22 44.500M9.500 57Q19 53 28 46" fill="none" stroke="${JK.mid}" stroke-width="1.100" stroke-linecap="round"/>` +
        `<circle cx="7" cy="44" r="1.700" fill="${JK.ink}" stroke="${JK.accent}" stroke-width=".6"/><circle cx="25" cy="57.500" r="1.300" fill="${JK.ink}" stroke="${JK.accent}" stroke-width=".6"/><circle cx="33" cy="48" r="1" fill="${JK.ink}"/>` +
        glow('g', 54, 14, 13) +
        dagger('translate(41 27.500) rotate(-44) scale(.98 1.150)', false) +
        `<path d="${star4(56.5, 12, 5.5, 0.14)}" fill="#ffffff"/>`,
    ),

  // 引匕一掷：三把匕首呈扇形掷出，各拖一道墨痕
  s2: () => {
    const one = (deg: number, dist: number, s: number): string => {
      const [x, y] = polar(9, 56, dist, deg);
      const [ax, ay] = polar(9, 56, dist - 14, deg - 7);
      const [bx, by] = polar(9, 56, dist - 14, deg + 7);
      return `<path d="M9 56L${ax} ${ay}L${bx} ${by}Z" fill="url(#@tr)"/>` + dagger(`translate(${x} ${y}) rotate(${deg}) scale(${s})`);
    };
    return badge(
      heroBg('yeque'),
      glowDef('g', JK.glow, 0.9) + DAGGER_DEFS + rg('tr', 9, 56, 34, [[0, JK.accent, 0.85], [1, JK.accent, 0]]),
      glow('g', 36, 30, 26) + one(-70, 32, 0.8) + one(-16, 32, 0.8) + one(-43, 36, 0.95) + `<circle cx="9" cy="56" r="2.600" fill="${JK.pale}"/>`,
    );
  },

  // 卷尽匕现：半展开的督亢图卷，卷尾露出一柄匕首
  ult: () =>
    badge(
      heroBg('yeque', true),
      glowDef('g', JK.steel, 0.9) + DAGGER_DEFS + lg('pp', 0, 24, 0, 48, [[0, '#f6ecc8'], [0.6, JK.paper], [1, JK.paperD]]) + lg('rl', 0, 20, 0, 52, [[0, '#f3e6bd'], [0.5, JK.paperD], [1, '#6b5630']]),
      `<g transform="rotate(-13 32 36)">` +
        // 展开的帛图与图上的山川
        `<path d="M10 25H47V48H10Z" fill="url(#@pp)" stroke="${INK}" stroke-width="1.400" stroke-linejoin="round"/>` +
        `<path d="M15 39L20 31.500L24 36.500L29.500 29.500L34.500 37.500" fill="none" stroke="${JK.map}" stroke-width="1.400" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M14.500 43.500Q21 40 27 43.500T39.500 42.500" fill="none" stroke="#3f6f96" stroke-width="1.300" stroke-linecap="round"/>` +
        `<rect x="37.500" y="28.500" width="5" height="5" rx=".8" fill="#b8323a"/>` +
        // 左端卷着的一段
        `<rect x="4" y="21" width="9" height="31" rx="4.500" fill="url(#@rl)" stroke="${INK}" stroke-width="1.400"/>` +
        `<path d="M8.500 17.500V21M8.500 52V55.500" stroke="${JK.dark}" stroke-width="4.200" stroke-linecap="round"/>` +
        `<path d="M8.500 17.500V21M8.500 52V55.500" stroke="${JK.accent}" stroke-width="1.600" stroke-linecap="round"/>` +
        `</g>` +
        // 匕首：从卷尾露出来
        glow('g', 50, 24, 17) +
        dagger('translate(39.500 35) rotate(-40) scale(1.060)') +
        // 卷尾翘起的一角，压住刀柄
        `<g transform="rotate(-13 32 36)">` +
        `<path d="M41 24.500Q52 22 51.500 34Q51 46 41 48.500Q45.500 42 45.500 36.500Q45.500 30.500 41 24.500Z" fill="url(#@rl)" stroke="${INK}" stroke-width="1.400" stroke-linejoin="round"/>` +
        `</g>` +
        `<path d="${star4(56.5, 20.5, 5, 0.14)}" fill="#ffffff"/>`,
    ),
};

const HERO_ICONS: Record<HeroId, Record<HeroIconSlot, Draw>> = { panyue, chijin, xingli, fengling, yeque };

/** 英雄技能图标。slot：'passive' | 's1' | 's2' | 'ult'。返回 SVG 字符串（64×64 满幅方形） */
export function skillIcon(heroId: HeroId, slot: HeroIconSlot): string {
  return HERO_ICONS[heroId][slot]();
}

// ════════════════════════ 通用技能 ════════════════════════

const SUMMONER_ICONS: Record<SummonerSlot, Draw> = {
  // 回城：一枚水晶在层层收拢的光环中升起
  recall: () =>
    badge(
      ['#3c86e6', '#143a86', '#050d26'],
      glowDef('g', '#8fe9ff', 0.9) + lg('bm', 0, 4, 0, 52, [[0, '#c9f6ff', 0], [1, '#5cd6f7', 0.55]]),
      `<path d="M21 51L26.5 4H37.5L43 51Z" fill="url(#@bm)"/>` +
        `<ellipse cx="32" cy="51" rx="23" ry="6.6" fill="url(#@g)"/>` +
        `<ellipse cx="32" cy="51" rx="22" ry="6.3" fill="none" stroke="#8fe9ff" stroke-width="2"/>` +
        `<ellipse cx="32" cy="42" rx="15.5" ry="4.5" fill="none" stroke="#8fe9ff" stroke-width="1.6" opacity=".8"/>` +
        `<ellipse cx="32" cy="34" rx="10.5" ry="3" fill="none" stroke="#c9f6ff" stroke-width="1.3" opacity=".6"/>` +
        glow('g', 32, 24, 18) +
        `<path d="M32 5L40.5 24L32 46L23.5 24Z" fill="#2f8fd8" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M32 5L23.5 24L32 28.5Z" fill="#f2feff"/><path d="M32 5L40.5 24L32 28.5Z" fill="#9aeaff"/><path d="M23.5 24L32 28.5V46Z" fill="#5cd6f7"/>` +
        `<path d="M11 31L15.5 25.5L20 31M11 38.5L15.5 33L20 38.5M44 31L48.5 25.5L53 31M44 38.5L48.5 33L53 38.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,
    ),

  // 疗伤：一枚发光的十字，被生命(绿)与法力(蓝)两股回流环绕
  heal: () =>
    badge(
      ['#46c98a', '#14744a', '#04241a'],
      glowDef('g', '#c9ffe0', 0.9) + lg('pl', 0, 14, 0, 50, [[0, '#ffffff'], [1, '#9dffc8']]),
      glow('g', 32, 32, 28) +
        `<path d="${arc(32, 32, 24, 205, 335)}" fill="none" stroke="#c9ffe0" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M57.5 20.5L55.5 30.5L47.5 24Z" fill="#c9ffe0"/>` +
        `<path d="${arc(32, 32, 24, 25, 155)}" fill="none" stroke="#8fd8ff" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M6.5 43.5L8.5 33.5L16.5 40Z" fill="#8fd8ff"/>` +
        `<path d="M27 16H37V27H48V37H37V48H27V37H16V27H27Z" fill="url(#@pl)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M29.5 18.5H34.5V29.5H45.5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>` +
        `<path d="M51 9V15M48 12H54M12 49V55M9 52H15" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>`,
    ),

  // 闪现：原地只剩虚影，身形已在光痕尽头的星芒处出现
  flash: () =>
    badge(
      ['#f5b84a', '#a25f17', '#2a1405'],
      glowDef('g', '#fff6dc', 1) + lg('st', 14, 48, 46, 18, [[0, '#ffffff', 0], [1, '#ffffff', 0.95]]),
      `<path d="M16 37L24.5 48L16 59L7.5 48Z" fill="#ffffff" fill-opacity=".1" stroke="#fff6dc" stroke-width="1.5" stroke-dasharray="2.6 2.4" stroke-linejoin="round" opacity=".8"/>` +
        `<path d="M13 43.5L44 15.5L48 20L19.5 50Z" fill="url(#@st)"/>` +
        `<path d="M9 36L33 14M24 54L51 30" stroke="#fff6dc" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>` +
        glow('g', 45, 19, 19) +
        `<path d="${star4(45, 19, 16, 0.13)}" fill="#ffffff"/>` +
        `<path d="${star4(45, 19, 10, 0.16)}" transform="rotate(45 45 19)" fill="#fff3cf"/>` +
        `<circle cx="45" cy="19" r="3.8" fill="#ffffff"/>` +
        `<path d="${star4(52, 46, 3)}" fill="#fff6dc"/><circle cx="24" cy="14" r="1.2" fill="#fff6dc"/>`,
    ),
};

/** 通用技能图标：'recall' | 'heal' | 'flash' */
export function summonerIcon(slot: SummonerSlot): string {
  return SUMMONER_ICONS[slot]();
}
