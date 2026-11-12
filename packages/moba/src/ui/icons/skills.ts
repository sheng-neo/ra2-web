/**
 * 英雄技能图标（5 英雄 × 被动 + 三技能）与召唤师技能图标。
 * 每个图标都按技能含义手绘，并使用该英雄 palette 的主题色；主体都落在中心安全圆内，
 * 方形槽与圆形技能键通用。
 */
import { HEROES } from '../../core/data/heroes';
import type { AbilitySlot, HeroId, SummonerSlot } from '../../core/types';
import { INK, arc, badge, darken, glow, glowDef, lg, lighten, mix, rg, rgo, star4 } from './svg';

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

// ════════════════════════ 磐岳 ════════════════════════
const PY = { l: '#c3cfdb', m: '#7e8e9f', d: '#4c5866', dd: '#2a323d', amber: '#f2b75a', glow: '#ffcf70', hot: '#fff3cf' };

const panyue: Record<HeroIconSlot, Draw> = {
  // 磐石之躯：嵌着星核的岩块，岩缝透出金光，脚下一圈震波
  passive: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', PY.glow) + rg('core', 32, 31, 11, [[0, '#fffbe9'], [0.5, PY.glow], [1, '#d9862b']]),
      `<path d="M8 51Q32 63 56 51" fill="none" stroke="${PY.amber}" stroke-width="1.8" stroke-linecap="round" opacity=".75"/>` +
        `<path d="M15 56Q32 63 49 56" fill="none" stroke="${PY.amber}" stroke-width="1.3" stroke-linecap="round" opacity=".4"/>` +
        `<path d="M32 7L49 14L55 32L46 49L22 51L9 36L14 17Z" fill="${PY.dd}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<path d="M32 7L49 14L39 24L25 22L14 17Z" fill="${PY.l}"/>` +
        `<path d="M14 17L25 22L22 38L9 36Z" fill="${PY.m}"/>` +
        `<path d="M49 14L55 32L46 49L41 36L39 24Z" fill="${PY.d}"/>` +
        `<path d="M22 38L41 36L46 49L22 51L9 36Z" fill="#353f4b"/>` +
        glow('g', 32, 30, 17) +
        `<path d="M25 22L39 24L41 36L22 38Z" fill="url(#@core)"/>` +
        `<path d="M25 22L14 17M39 24L49 14M41 36L46 49M22 38L9 36M25 22L39 24L41 36L22 38Z" fill="none" stroke="${PY.glow}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="${star4(32, 30, 6.5)}" fill="#fffdf2"/>`,
    ),

  // 裂地冲撞：岩铠肩甲化作冲角向前猛撞，身后拖出速度线，脚下大地开裂
  s1: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', PY.glow) +
        lg('st', 2, 0, 26, 0, [[0, PY.glow, 0], [1, PY.hot, 0.95]]) +
        lg('top', 24, 14, 50, 32, [[0, '#dbe5ee'], [1, PY.m]]),
      `<path d="M5 57L15 53L22 58L31 52L39 57L48 53L59 56" fill="none" stroke="#1a1208" stroke-width="4.6" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M5 57L15 53L22 58L31 52L39 57L48 53L59 56" fill="none" stroke="${PY.glow}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M22 58L20 62M39 57L42 62" fill="none" stroke="${PY.amber}" stroke-width="1.3" stroke-linecap="round"/>` +
        `<g transform="rotate(-14 32 30)">` +
        `<path d="M3 19H25M0 30H24M4 41H25" fill="none" stroke="url(#@st)" stroke-width="3" stroke-linecap="round"/>` +
        glow('g', 50, 30, 15) +
        `<path d="M23 13L45 18L59 30L45 42L23 47L32 30Z" fill="${PY.dd}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<path d="M23 13L45 18L59 30L32 30Z" fill="url(#@top)"/>` +
        `<path d="M23 47L45 42L59 30L32 30Z" fill="${PY.d}"/>` +
        `<path d="M45 18L59 30L45 42L40 30Z" fill="${PY.m}"/>` +
        `<path d="M45 18L59 30L45 42" fill="none" stroke="${PY.hot}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M38 23.5L43.5 30L38 36.5L32.5 30Z" fill="${PY.glow}" stroke="#fffdf2" stroke-width="1"/>` +
        `<path d="M61 20Q66 30 61 40" fill="none" stroke="${PY.glow}" stroke-width="2" stroke-linecap="round" opacity=".85"/>` +
        `</g>`,
    ),

  // 不动壁垒：石砌塔盾拔地而起，盾心星核发光，脚下一圈岩环
  s2: () =>
    badge(
      heroBg('panyue'),
      glowDef('g', PY.glow) + lg('sh', 14, 6, 50, 54, [[0, '#d6e0ea'], [0.5, PY.m], [1, PY.dd]]),
      `<ellipse cx="32" cy="53.5" rx="25" ry="6.5" fill="none" stroke="${PY.amber}" stroke-width="2" opacity=".85"/>` +
        `<ellipse cx="32" cy="53.5" rx="18" ry="4.2" fill="none" stroke="${PY.glow}" stroke-width="1.1" opacity=".45"/>` +
        `<path d="M5 53L10 38L16 54Z" fill="${PY.m}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>` +
        `<path d="M59 53L54 38L48 54Z" fill="${PY.d}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>` +
        `<path d="M32 5L51 12V31Q51 46 32 57Q13 46 13 31V12Z" fill="url(#@sh)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<path d="M32 11.5L46 16.5V31Q46 42.5 32 50.5Q18 42.5 18 31V16.5Z" fill="#4a5663" stroke="${PY.amber}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M18 24.5H46M18.6 36H45.4M32 11.5V24.5M25 24.5V36M39 24.5V36M32 36V50.5" fill="none" stroke="#252d38" stroke-width="1.4"/>` +
        glow('g', 32, 30, 14) +
        `<path d="${star4(32, 30, 8.5, 0.2)}" fill="#fffdf2"/>` +
        `<path d="M32 5L13 12V31" fill="none" stroke="#f1f6fb" stroke-width="1.1" stroke-linejoin="round" opacity=".7"/>`,
    ),

  // 山崩地裂：巨锤轰然砸落，地面炸出放射状裂隙与飞石
  ult: () =>
    badge(
      heroBg('panyue', true),
      glowDef('g', PY.glow, 1) + lg('hd', 13, 28, 48, 49, [[0, '#e3ebf2'], [0.45, PY.m], [1, PY.dd]]),
      `<ellipse cx="33" cy="54" rx="27" ry="6.5" fill="none" stroke="${PY.amber}" stroke-width="1.6" opacity=".6"/>` +
        glow('g', 37, 53, 18) +
        `<path d="M37 53L26 50L17 55L5 51M37 53L31 59L22 61M37 53L47 57L55 53L61 56M37 53L43 61" fill="none" stroke="#150e05" stroke-width="4.6" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M37 53L26 50L17 55L5 51M37 53L31 59L22 61M37 53L47 57L55 53L61 56M37 53L43 61" fill="none" stroke="${PY.glow}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="M49 44L55 34L58 46Z" fill="${PY.m}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M47 31L51 25L53 33Z" fill="${PY.l}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M4 41L8 34L11 43Z" fill="${PY.d}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<g transform="rotate(22 30 30)">` +
        `<rect x="27.6" y="-3" width="5" height="33" rx="2" fill="#6b5236" stroke="${INK}" stroke-width="1.3"/>` +
        `<path d="M27.6 5H32.6M27.6 12H32.6" stroke="${PY.amber}" stroke-width="1.8"/>` +
        `<rect x="12.5" y="27.5" width="35.5" height="22" rx="3.2" fill="url(#@hd)" stroke="${INK}" stroke-width="1.6"/>` +
        `<path d="M18 27.5V49.5M42.5 27.5V49.5" stroke="${PY.amber}" stroke-width="3.6"/>` +
        `<path d="M18 27.5V49.5M42.5 27.5V49.5" stroke="#fff3cf" stroke-width="1" opacity=".7"/>` +
        `<path d="M30.2 31L36.6 38.5L30.2 46L23.8 38.5Z" fill="${PY.glow}" stroke="#fffdf2" stroke-width="1.1"/>` +
        `</g>` +
        `<path d="${star4(38, 53, 7, 0.14)}" fill="#fffdf2"/>`,
    ),
};

// ════════════════════════ 赤烬 ════════════════════════
const CJ = { red: '#c8372d', deep: '#8e1f18', dark: '#1c1517', amber: '#ffb347', glow: '#ff6a2a', hot: '#ffe7a3', white: '#fff6dc' };

const chijin: Record<HeroIconSlot, Draw> = {
  // 余烬之刃：一柄烧红的弯刃，刃背腾起火舌
  passive: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CJ.glow) + lg('bl', 18, 46, 55, 8, [[0, CJ.deep], [0.42, CJ.glow], [0.78, CJ.amber], [1, CJ.white]]),
      `<g transform="translate(1 1)">` +
        glow('g', 40, 24, 20) +
        `<path d="M27 27Q21 19 27 10Q29 17 35 19Q34 25 27 27Z" fill="${CJ.glow}"/>` +
        `<path d="M38 18Q35 10 41 4Q42 10 47 12Q45 17 38 18Z" fill="${CJ.amber}"/>` +
        `<path d="M19 36Q13 31 16 23Q18 29 23 31Z" fill="${CJ.red}"/>` +
        `<path d="M24 47Q47 35 55 7Q33 18 17 40Z" fill="url(#@bl)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M24 47Q47 35 55 7" fill="none" stroke="${CJ.white}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M12.5 35.5L28.5 51.5" stroke="${CJ.dark}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M12.5 35.5L28.5 51.5" stroke="${CJ.amber}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M19 45L9.5 55.5" stroke="${CJ.dark}" stroke-width="5.4" stroke-linecap="round"/>` +
        `<path d="M16.5 46.5L18.5 48.5M13.5 50L15.5 52" stroke="${CJ.red}" stroke-width="1.6" stroke-linecap="round"/>` +
        `<circle cx="8.5" cy="56.5" r="2.7" fill="${CJ.amber}" stroke="${INK}" stroke-width="1"/>` +
        `<circle cx="47" cy="31" r="1.6" fill="${CJ.amber}"/><circle cx="52" cy="23" r="1.1" fill="${CJ.hot}"/><circle cx="41" cy="41" r="1.2" fill="${CJ.glow}"/>` +
        `<path d="${star4(50, 38, 3.4)}" fill="${CJ.white}"/>` +
        `</g>`,
    ),

  // 烈焰斩：扇形展开的烈焰刀气，外缘白热、内侧暗红，边上甩出火舌
  s1: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CJ.glow) + rg('cr', 18, 50, 40, [[0.62, CJ.deep], [0.8, CJ.glow], [0.93, CJ.amber], [1, CJ.white]]),
      glow('g', 42, 28, 24) +
        `<path d="M32 12Q37 5 44 3Q42 10 38 15Z" fill="${CJ.amber}"/>` +
        `<path d="M46 22Q52 15 59 14Q56 21 51 27Z" fill="${CJ.amber}"/>` +
        `<path d="M55 37Q60 33 63 27Q63 36 58 43Z" fill="${CJ.glow}"/>` +
        `<path d="M21.5 10.2A40 40 0 0 1 57.9 53.5Q38 30 21.5 10.2Z" fill="url(#@cr)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M21.5 10.2A40 40 0 0 1 57.9 53.5" fill="none" stroke="${CJ.white}" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M23.6 23.6A27 27 0 0 1 44.7 46.2Q33 36 23.6 23.6Z" fill="${CJ.glow}" opacity=".6"/>` +
        `<path d="M8 60L21 45" stroke="${CJ.dark}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M8 60L21 45" stroke="${CJ.hot}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<path d="M14.5 44.5L22.5 51.5" stroke="${CJ.dark}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<circle cx="14" cy="24" r="1.4" fill="${CJ.amber}"/><circle cx="50" cy="8" r="1.2" fill="${CJ.hot}"/><circle cx="30" cy="52" r="1.3" fill="${CJ.glow}"/>`,
    ),

  // 炎步：三道由暗到亮的火焰箭形残影，表示火影突进
  s2: () =>
    badge(
      heroBg('chijin'),
      glowDef('g', CJ.glow) + lg('c3', 34, 0, 58, 0, [[0, CJ.glow], [0.6, CJ.amber], [1, CJ.white]]),
      `<g transform="rotate(-10 32 32)">` +
        glow('g', 46, 32, 20) +
        `<path d="M0 32H9M3 22H8M3 42H8" stroke="${CJ.amber}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>` +
        `<path d="M7 19Q14 25 18.5 32Q14 39 7 45Q11.5 38.5 12 32Q11.5 25.5 7 19Z" fill="${CJ.deep}"/>` +
        `<path d="M19 14Q30 22 36 32Q30 42 19 50Q25.5 41 26.5 32Q25.5 23 19 14Z" fill="${CJ.glow}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>` +
        `<path d="M19 14Q13 11 9 12Q13 14 16 18ZM19 50Q13 53 9 52Q13 50 16 46Z" fill="${CJ.red}"/>` +
        `<path d="M33 8Q50 19 58 32Q50 45 33 56Q43.5 43 45 32Q43.5 21 33 8Z" fill="url(#@c3)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M33 8Q26 4 20 5Q26 8 29 13ZM33 56Q26 60 20 59Q26 56 29 51Z" fill="${CJ.amber}"/>` +
        `<path d="M33 8Q50 19 58 32Q50 45 33 56" fill="none" stroke="${CJ.white}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="${star4(57.5, 32, 4.5)}" fill="#fffdf2"/>` +
        `</g>`,
    ),

  // 焚天旋舞：双刃首尾相逐，卷成一圈烈焰旋风
  ult: () => {
    const tongue = `<path d="M27 8.5Q33 0 44 3Q38 6 37 11.5Q32 8.5 27 8.5Z"/>`;
    const blade = `<path d="M9.4 23.8A24 24 0 0 1 52.8 20Q32 6.5 15 27Z" fill="url(#@bl)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.4 23.8A24 24 0 0 1 52.8 20" fill="none" stroke="${CJ.white}" stroke-width="1.3" stroke-linecap="round"/>`;
    return badge(
      heroBg('chijin', true),
      glowDef('g', CJ.glow, 1) + lg('bl', 10, 26, 53, 20, [[0, CJ.deep], [0.45, CJ.glow], [1, CJ.white]]) + rg('co', 32, 32, 8, [[0, '#fffdf2'], [0.6, CJ.amber], [1, CJ.glow]]),
      glow('g', 32, 32, 30) +
        `<circle cx="32" cy="32" r="24.5" fill="none" stroke="${CJ.glow}" stroke-width="3.2" opacity=".9"/>` +
        `<circle cx="32" cy="32" r="24.5" fill="none" stroke="${CJ.hot}" stroke-width="1" opacity=".9"/>` +
        `<g fill="${CJ.amber}">${[0, 60, 120, 180, 240, 300].map((a) => `<g transform="rotate(${a} 32 32)">${tongue}</g>`).join('')}</g>` +
        `<g transform="translate(32 32) scale(.84) translate(-32 -32)">${blade}<g transform="rotate(180 32 32)">${blade}</g></g>` +
        `<path d="${arc(32, 32, 10, 200, 330)}" fill="none" stroke="${CJ.hot}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` +
        `<path d="${arc(32, 32, 10, 20, 150)}" fill="none" stroke="${CJ.hot}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` +
        `<circle cx="32" cy="32" r="5.6" fill="url(#@co)"/>`,
    );
  },
};

// ════════════════════════ 星璃 ════════════════════════
const XL = { indigo: '#5a6fe0', deep: '#232a7a', white: '#f1ecff', gold: '#ffd98a', cyan: '#8fd8ff' };

/** 一颗拖尾陨星：头在 (hx,hy)，尾巴朝右上方延伸 len */
function meteor(id: string, hx: number, hy: number, r: number, len: number): string {
  const dx = 0.53;
  const dy = -0.848;
  const px = 0.848;
  const py = 0.53;
  const f = (v: number): number => Math.round(v * 10) / 10;
  return (
    `<path d="M${f(hx + r * px)} ${f(hy + r * py)}L${f(hx + len * dx)} ${f(hy + len * dy)}L${f(hx - r * px)} ${f(hy - r * py)}Z" fill="url(#@${id})"/>` +
    `<circle cx="${hx}" cy="${hy}" r="${f(r * 1.9)}" fill="url(#@g)"/>` +
    `<circle cx="${hx}" cy="${hy}" r="${r}" fill="url(#@hd)"/>`
  );
}

const xingli: Record<HeroIconSlot, Draw> = {
  // 星辉印记：三枚星印连成星图，顶上一枚金色将要引爆
  passive: () =>
    badge(
      heroBg('xingli'),
      glowDef('g', XL.cyan) + glowDef('gg', XL.gold, 1) + lg('st', 0, 30, 0, 52, [[0, '#ffffff'], [1, XL.cyan]]),
      `<circle cx="32" cy="34" r="19" fill="none" stroke="${XL.cyan}" stroke-width="1.2" stroke-dasharray="2 3.2" opacity=".7"/>` +
        `<path d="M32 15L15.5 43.5H48.5Z" fill="${XL.cyan}" fill-opacity=".1" stroke="${XL.white}" stroke-width="1" stroke-linejoin="round" opacity=".55"/>` +
        glow('gg', 32, 16, 17) + glow('g', 15.5, 43.5, 12) + glow('g', 48.5, 43.5, 12) +
        `<path d="${star4(15.5, 43.5, 9, 0.2)}" fill="url(#@st)" stroke="${XL.deep}" stroke-width=".7"/>` +
        `<path d="${star4(48.5, 43.5, 9, 0.2)}" fill="url(#@st)" stroke="${XL.deep}" stroke-width=".7"/>` +
        `<path d="${star4(32, 16, 12.5, 0.2)}" fill="${XL.gold}" stroke="#8a5a14" stroke-width=".8"/>` +
        `<path d="${star4(32, 16, 6)}" fill="#fffdf2"/>` +
        `<circle cx="32" cy="34.5" r="2" fill="#fff"/>` +
        `<circle cx="50" cy="20" r="1.2" fill="${XL.white}"/><circle cx="13" cy="24" r="1" fill="${XL.white}"/><circle cx="32" cy="54" r="1.1" fill="${XL.gold}"/>`,
    ),

  // 流星矢：一道朝右上射出的流星，蓝白彗尾
  s1: () =>
    badge(
      heroBg('xingli'),
      glowDef('g', XL.cyan, 1) + lg('tl', 46, 18, 8, 58, [[0, '#ffffff'], [0.3, XL.cyan], [1, XL.indigo, 0]]) + lg('tc', 46, 18, 20, 46, [[0, '#ffffff'], [1, '#ffffff', 0]]),
      `<path d="M55 31L30 57" stroke="${XL.cyan}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>` +
        `<path d="M35 8L15 30" stroke="${XL.cyan}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>` +
        `<path d="M51.2 22.9L7 59L41 13.2Z" fill="url(#@tl)"/>` +
        `<path d="M48 20L19 47L44 16Z" fill="url(#@tc)"/>` +
        glow('g', 46, 18, 16) +
        `<path d="${star4(46, 18, 13, 0.15)}" fill="#ffffff"/>` +
        `<path d="${star4(46, 18, 8.5, 0.16)}" fill="${XL.gold}" transform="rotate(45 46 18)"/>` +
        `<circle cx="46" cy="18" r="3.4" fill="#ffffff"/>` +
        `<path d="${star4(14, 18, 3.2)}" fill="${XL.gold}"/><path d="${star4(54, 48, 2.8)}" fill="${XL.white}"/>` +
        `<circle cx="27" cy="33" r="1.1" fill="#fff"/><circle cx="20" cy="50" r="1" fill="${XL.cyan}"/>`,
    ),

  // 引力星环：三道旋臂被吸向中心的星核，外圈是金色星轨
  s2: () => {
    const arm = `<path d="M30 6.5Q49 6 53.5 26Q44.5 17 36 24Q40 12 30 6.5Z" fill="url(#@ar)"/>`;
    return badge(
      heroBg('xingli'),
      glowDef('g', XL.cyan, 1) + lg('ar', 30, 6, 44, 26, [[0, XL.indigo, 0.2], [0.6, XL.cyan], [1, '#ffffff']]),
      `<circle cx="32" cy="32" r="26" fill="none" stroke="${XL.gold}" stroke-width="1.3" stroke-dasharray="1.6 4" opacity=".9"/>` +
        `<circle cx="32" cy="32" r="19.5" fill="none" stroke="${XL.cyan}" stroke-width="2.2" opacity=".55"/>` +
        `${arm}<g transform="rotate(120 32 32)">${arm}</g><g transform="rotate(240 32 32)">${arm}</g>` +
        glow('g', 32, 32, 14) +
        `<path d="${star4(32, 32, 10, 0.2)}" fill="#ffffff"/>` +
        `<circle cx="32" cy="32" r="3" fill="${XL.gold}"/>` +
        `<path d="${star4(11.5, 20, 2.8)}" fill="${XL.gold}"/><path d="${star4(52, 47, 2.8)}" fill="${XL.gold}"/><circle cx="17" cy="50" r="1.3" fill="#fff"/>`,
    );
  },

  // 星陨天降：数颗陨星斜坠向地面的星域
  ult: () =>
    badge(
      heroBg('xingli', true),
      glowDef('g', XL.gold, 0.9) +
        glowDef('gc', XL.cyan, 0.7) +
        rgo('hd', [[0, '#ffffff'], [0.55, '#fff1c4'], [1, XL.gold]]) +
        lg('m1', 22, 42, 45, 5, [[0, '#ffffff'], [0.35, XL.cyan, 0.9], [1, XL.indigo, 0]]) +
        lg('m2', 43, 38, 61, 9, [[0, '#ffffff'], [0.35, XL.cyan, 0.9], [1, XL.indigo, 0]]) +
        lg('m3', 11, 26, 23, 7, [[0, '#ffffff'], [0.35, XL.cyan, 0.9], [1, XL.indigo, 0]]),
      `<ellipse cx="30" cy="54" rx="26" ry="6.8" fill="url(#@gc)"/>` +
        `<ellipse cx="30" cy="54" rx="25" ry="6.5" fill="none" stroke="${XL.gold}" stroke-width="1.7"/>` +
        `<ellipse cx="30" cy="54" rx="15" ry="3.6" fill="none" stroke="${XL.cyan}" stroke-width="1.1" opacity=".75"/>` +
        meteor('m3', 11, 26, 3, 22) +
        meteor('m2', 43, 38, 4.5, 34) +
        meteor('m1', 22, 42, 6.5, 44) +
        `<path d="M14 49L10 46M30 50L32 46M18 53L13 54" stroke="#fff6dc" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>` +
        `<path d="${star4(52, 50, 2.6)}" fill="#fff"/><circle cx="55" cy="22" r="1" fill="#fff"/><circle cx="34" cy="10" r="1" fill="${XL.gold}"/>`,
    ),
};

// ════════════════════════ 风翎 ════════════════════════
const FL = { teal: '#3fae8c', deep: '#0f4a3a', ink: '#0b2a22', cream: '#f3f0e2', gold: '#e9c46a', mint: '#9dffd8' };

/** 一支朝下坠落的羽箭（原点在箭身中段） */
const fallingArrow =
  `<path d="M0 -22V-12" stroke="${FL.mint}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>` +
  `<path d="M0 -12V5" stroke="${FL.cream}" stroke-width="1.9" stroke-linecap="round"/>` +
  `<path d="M-2.6 -13L0 -10L2.6 -13M-2.6 -10L0 -7L2.6 -10" fill="none" stroke="${FL.gold}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M-3.4 3L0 11.5L3.4 3L0 5.2Z" fill="#ffffff" stroke="${FL.ink}" stroke-width=".7" stroke-linejoin="round"/>`;

const fengling: Record<HeroIconSlot, Draw> = {
  // 风之眷顾：一片翎羽被两股旋风托起
  passive: () =>
    badge(
      heroBg('fengling'),
      glowDef('g', FL.mint) + lg('fe', 52, 9, 13, 53, [[0, '#ffffff'], [0.4, FL.cream], [0.75, FL.mint], [1, FL.teal]]),
      glow('g', 34, 28, 24) +
        `<path d="M3 31Q15 22 25 28Q31 32 27.5 36.5Q23.5 39 22.5 34.5" fill="none" stroke="${FL.mint}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M13 53Q14 32 34 14Q46 5 52 9Q56 15 48 27Q36 46 13 53Z" fill="url(#@fe)" stroke="${FL.ink}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M40 20L47.5 24M34 26L42.5 32M28 33L35.5 40M22 40L27.5 47M38 22L33 14.5M32 28L25 21.5M26 35L18.5 30M20 42L14.5 39" fill="none" stroke="${FL.deep}" stroke-width="1" stroke-linecap="round" opacity=".5"/>` +
        `<path d="M9 57Q28 36 51 10" fill="none" stroke="${FL.deep}" stroke-width="1.7" stroke-linecap="round"/>` +
        `<path d="M13 53Q28 37 50 11" fill="none" stroke="#ffffff" stroke-width=".7" stroke-linecap="round" opacity=".8"/>` +
        `<path d="M29 56Q44 51 54 41Q60.5 34 56.5 30.5Q52.5 29 52 33.5" fill="none" stroke="${FL.mint}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M5 43Q11 40.5 16 43" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>` +
        `<path d="${star4(54, 50, 3.2)}" fill="#ffffff"/><circle cx="11" cy="19" r="1.2" fill="${FL.gold}"/>`,
    ),

  // 贯风矢：一支大箭贯穿而出，箭身缠着气旋
  s1: () => {
    const rings: [number, number, number][] = [[15, 5, 12.5], [27, 4.5, 10.5], [38, 3.6, 8.5]];
    const back = rings.map(([cx, rx, ry]) => `<path d="M${cx} ${32 - ry}A${rx} ${ry} 0 0 0 ${cx} ${32 + ry}" fill="none" stroke="${FL.teal}" stroke-width="2" stroke-linecap="round" opacity=".75"/>`).join('');
    const front = rings.map(([cx, rx, ry]) => `<path d="M${cx} ${32 - ry}A${rx} ${ry} 0 0 1 ${cx} ${32 + ry}" fill="none" stroke="${FL.mint}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
    return badge(
      heroBg('fengling'),
      glowDef('g', FL.mint) + lg('hd', 44, 22, 64, 42, [[0, FL.mint], [1, '#ffffff']]),
      `<g transform="rotate(-42 32 32)">` +
        glow('g', 52, 32, 16) +
        back +
        `<path d="M3 32H50" stroke="${FL.ink}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M3 32H50" stroke="${FL.cream}" stroke-width="2.8" stroke-linecap="round"/>` +
        `<path d="M4 32L-.5 24.5H7.5L12.5 32L7.5 39.5H-.5Z" fill="${FL.gold}" stroke="${FL.ink}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M43 21L64 32L43 43L49 32Z" fill="url(#@hd)" stroke="${FL.ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M49 32H63" stroke="#ffffff" stroke-width="1" stroke-linecap="round"/>` +
        front +
        `</g>` +
        `<path d="${star4(12, 16, 3)}" fill="#ffffff"/><circle cx="50" cy="50" r="1.3" fill="${FL.mint}"/><circle cx="56" cy="40" r="1" fill="#fff"/>`,
    );
  },

  // 逐风步：三道羽翼般的风痕向前掠出，下方一道翻跃的弧线
  s2: () =>
    badge(
      heroBg('fengling'),
      glowDef('g', FL.mint) + lg('sw', 6, 0, 58, 0, [[0, FL.teal, 0.15], [0.55, FL.mint], [1, '#ffffff']]),
      `<g transform="rotate(-9 32 32)">` +
        glow('g', 48, 28, 20) +
        `<path d="M58 21Q36 4 5 15Q30 15 44 31Z" fill="url(#@sw)" stroke="${FL.ink}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M55 32.5Q34 20 7 30Q30 29.5 43 42Z" fill="url(#@sw)" stroke="${FL.ink}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M49 44Q32 34.5 11 44Q30 42.5 39.5 52Z" fill="url(#@sw)" stroke="${FL.ink}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M58 21Q36 4 5 15M55 32.5Q34 20 7 30M49 44Q32 34.5 11 44" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".85"/>` +
        `<path d="${star4(58.5, 20.5, 4.6)}" fill="#ffffff"/>` +
        `</g>` +
        `<path d="M9 57Q30 46 50 55" fill="none" stroke="${FL.gold}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1 3.6"/>` +
        `<path d="M48.5 51.5L54.5 56.5L47 58.5Z" fill="${FL.gold}"/>`,
    ),

  // 千羽天幕：漫天羽箭斜落，覆盖一片圆形区域
  ult: () => {
    const at: [number, number, number][] = [[13, 25, 0.95], [26, 15, 1.1], [39, 28, 1.3], [52, 17, 0.95], [22, 42, 1.1], [48, 43, 1.15], [35, 46, 0.85]];
    return badge(
      heroBg('fengling', true),
      glowDef('g', FL.mint, 0.75),
      `<ellipse cx="32" cy="54" rx="26" ry="6.8" fill="url(#@g)"/>` +
        `<ellipse cx="32" cy="54" rx="25" ry="6.5" fill="none" stroke="${FL.mint}" stroke-width="1.7"/>` +
        `<ellipse cx="32" cy="54" rx="15" ry="3.6" fill="none" stroke="${FL.gold}" stroke-width="1.1" opacity=".8"/>` +
        at.map(([x, y, s]) => `<g transform="translate(${x} ${y}) rotate(16) scale(${s})">${fallingArrow}</g>`).join('') +
        `<path d="M17 55.5H23M43 56H49M31 58H36" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`,
    );
  },
};

// ════════════════════════ 夜阙 ════════════════════════
const YQ = { purple: '#3a2f5b', mid: '#2a2244', dark: '#15131f', black: '#0a0812', accent: '#b48cff', glow: '#a070ff', pale: '#e3d4ff' };

const yeque: Record<HeroIconSlot, Draw> = {
  // 猎影：兜帽阴影里只亮着一双紫瞳
  passive: () =>
    badge(
      heroBg('yeque'),
      glowDef('g', YQ.glow) + glowDef('ge', '#d9c4ff', 1) + lg('hd', 0, 7, 0, 58, [[0, '#5a4a92'], [0.5, YQ.purple], [1, YQ.dark]]),
      glow('g', 32, 30, 30) +
        `<path d="M45 55Q54 51 61 57Q53 57 48 62Z" fill="${YQ.purple}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M32 6Q54 9 53 37Q53 49 45 58H19Q11 49 11 37Q10 9 32 6Z" fill="url(#@hd)" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M32 15Q46 17 46 37Q46 46 40 55H24Q18 46 18 37Q18 17 32 15Z" fill="${YQ.black}"/>` +
        `<path d="M21.5 42.5Q32 38 42.5 42.5Q41.5 50 37.5 56H26.5Q22.5 50 21.5 42.5Z" fill="${YQ.mid}"/>` +
        `<path d="M32 40.5V56M25 46Q32 43.5 39 46" fill="none" stroke="${YQ.dark}" stroke-width="1.1"/>` +
        `<ellipse cx="25" cy="33" rx="8" ry="5.5" fill="url(#@ge)"/><ellipse cx="39" cy="33" rx="8" ry="5.5" fill="url(#@ge)"/>` +
        `<path d="M19.5 32.5Q25 27.5 30.5 34.5Q25 36.5 19.5 32.5Z" fill="#fbf7ff"/>` +
        `<path d="M44.5 32.5Q39 27.5 33.5 34.5Q39 36.5 44.5 32.5Z" fill="#fbf7ff"/>` +
        `<path d="M32 6Q10 9 11 37" fill="none" stroke="${YQ.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>` +
        `<path d="M32 6Q30 11 32 15" fill="none" stroke="${YQ.dark}" stroke-width="1.1"/>`,
    ),

  // 瞬影斩：一道贯穿而过的紫白斩痕，身后留下残影
  s1: () =>
    badge(
      heroBg('yeque'),
      glowDef('g', YQ.glow, 1) + lg('sl', 9, 53, 53, 11, [[0, YQ.glow, 0], [0.5, YQ.accent], [1, '#ffffff']]),
      `<path d="M6 59Q32 43 56 15Q39 46 6 59Z" fill="${YQ.black}" opacity=".7"/>` +
        `<path d="M3 44Q22 33 37 14Q26 35 3 44Z" fill="${YQ.accent}" opacity=".32"/>` +
        `<path d="M20 60Q40 50 57 30Q44 53 20 60Z" fill="${YQ.accent}" opacity=".22"/>` +
        `<path d="M22 19Q36 26 48 42Q34 31 22 19Z" fill="${YQ.accent}" opacity=".85"/>` +
        glow('g', 51, 13, 15) +
        `<path d="M8 54Q33 36 54 10Q39 39 8 54Z" fill="url(#@sl)"/>` +
        `<path d="M24 43Q40 32 54 10Q42 35 24 43Z" fill="#ffffff" opacity=".9"/>` +
        `<path d="${star4(53, 11, 8, 0.14)}" fill="#ffffff"/>` +
        `<circle cx="40" cy="14" r="1.2" fill="${YQ.pale}"/><circle cx="52" cy="31" r="1.2" fill="${YQ.pale}"/><circle cx="14" cy="34" r="1" fill="${YQ.accent}"/>`,
    ),

  // 影刃飞旋：三枚三叶旋刃呈扇形掷出，身后拖着暗紫刃痕
  s2: () => {
    const arm = 'M0-3Q4-10.5 11-8.5Q5.5-6 3.2 1.2Z';
    const blade = (x: number, y: number, rot: number, s: number): string =>
      `<circle cx="${x}" cy="${y}" r="${Math.round(15 * s)}" fill="url(#@g)"/>` +
      `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
      [0, 120, 240].map((a) => `<path d="${arm}" transform="rotate(${a})" fill="url(#@bl)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`).join('') +
      `<circle r="2.6" fill="${YQ.dark}" stroke="${YQ.pale}" stroke-width="1.1"/>` +
      `</g>`;
    return badge(
      heroBg('yeque'),
      glowDef('g', YQ.glow, 0.9) + lg('bl', 0, -3, 11, -8, [[0, YQ.accent], [0.55, YQ.pale], [1, '#ffffff']]) + lg('tr', 11, 55, 46, 22, [[0, YQ.accent, 0.75], [1, YQ.accent, 0]]),
      `<path d="M11 55L17 17L24 20ZM11 55L39 23L44 29ZM11 55L47 44L48 51Z" fill="url(#@tr)"/>` +
        blade(20, 17, -15, 0.74) +
        blade(42, 26, 30, 0.86) +
        blade(49, 47, 75, 0.74) +
        `<circle cx="11" cy="55" r="2.4" fill="${YQ.pale}"/>`,
    );
  },

  // 幽夜处决：残月之下，一柄匕首直刺而落
  ult: () =>
    badge(
      heroBg('yeque', true),
      glowDef('g', YQ.glow, 1) + lg('mo', 10, 8, 44, 46, [[0, '#f6f0ff'], [1, YQ.accent]]) + lg('bl', 28, 0, 40, 0, [[0, '#ffffff'], [0.5, YQ.pale], [1, YQ.accent]]),
      glow('g', 30, 27, 30) +
        `<path d="M29.02 6.03A21 21 0 1 0 48.98 35.97A18 18 0 0 1 29.02 6.03Z" fill="url(#@mo)" stroke="${INK}" stroke-width="1" stroke-linejoin="round" opacity=".95"/>` +
        `<path d="M35 60L28.6 30.5L35 23.5L41.4 30.5Z" fill="url(#@bl)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M35 25V58" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M24 21.5Q35 26 46 21.5L45.5 26Q35 30.5 24.5 26Z" fill="${YQ.mid}" stroke="${YQ.accent}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<rect x="32.8" y="10" width="4.4" height="13" rx="1.4" fill="${YQ.dark}" stroke="${YQ.accent}" stroke-width="1"/>` +
        `<path d="M32.8 14.5H37.2M32.8 18.5H37.2" stroke="${YQ.accent}" stroke-width="1"/>` +
        `<path d="M35 4.5L38.2 8L35 11.5L31.8 8Z" fill="${YQ.pale}" stroke="${INK}" stroke-width=".8"/>` +
        `<path d="M49 44L51.5 48L49 52L46.5 48ZM22 50L23.8 53L22 56L20.2 53Z" fill="${YQ.pale}" opacity=".85"/>` +
        `<path d="${star4(53, 14, 3)}" fill="#ffffff"/>`,
    ),
};

const HERO_ICONS: Record<HeroId, Record<HeroIconSlot, Draw>> = { panyue, chijin, xingli, fengling, yeque };

/** 英雄技能图标。slot：'passive' | 's1' | 's2' | 'ult'。返回 SVG 字符串（64×64 满幅方形） */
export function skillIcon(heroId: HeroId, slot: HeroIconSlot): string {
  return HERO_ICONS[heroId][slot]();
}

// ════════════════════════ 召唤师技能 ════════════════════════

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

  // 恢复：一枚发光的十字，被生命(绿)与法力(蓝)两股回流环绕
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

/** 召唤师技能图标：'recall' | 'heal' | 'flash' */
export function summonerIcon(slot: SummonerSlot): string {
  return SUMMONER_ICONS[slot]();
}
