/**
 * 17 件装备图标：按 ItemDef.color 取主色、按器物画出可辨识的造型（草鞋/靴/斩马剑/角弓/环首刀/戟/吴钩/杖/冠/竹简/铠/狐裘/护心镜/钉盾）。
 * 名字是「功能词 + 古器物」，图标画的就是那件器物，功能用小记号点出来(速度线、血滴、裂甲、暴击星芒……)。
 * 与技能图标同一套徽章底板：深色径向底 + 主体 + 暗角 + 顶部高光。
 */
import { ITEMS } from '../../core/data/items';
import type { ItemId } from '../../core/types';
import { INK, badge, darken, glow, glowDef, lg, lighten, mix, polar, rg, star4, starPoly } from './svg';

type Draw = (c: string) => string;

/** 装备底色：主色压进深海军蓝里，保证各色装备放在一起仍然和谐 */
const itemBg = (c: string): [string, string, string] => [mix(c, '#182246', 0.55), mix(c, '#0b1128', 0.8), '#050914'];

const STEEL_L = '#f4f7fb';
const STEEL_M = '#aeb8c6';
const STEEL_D = '#56627a';
const WOOD = '#8a5a34';
const WOOD_D = '#3d2817';

const steel = (id: string, x1: number, y1: number, x2: number, y2: number): string => lg(id, x1, y1, x2, y2, [[0, STEEL_L], [0.5, STEEL_M], [1, STEEL_D]]);
/** 主色三段渐变：亮 → 主色 → 暗 */
const tone = (id: string, c: string, x1: number, y1: number, x2: number, y2: number): string =>
  lg(id, x1, y1, x2, y2, [[0, lighten(c, 0.55)], [0.5, c], [1, darken(c, 0.5)]]);
const S = (w = 1.3): string => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;

// ───────────── 靴子通用轮廓（朝右，已居中） ─────────────
const BOOT = 'M15 7H30V28Q30 33 35 35.5L44 40Q49 42.5 49 48V51H15Z';
const BOOT_SOLE = 'M14 51H50V55Q50 57 48 57H16Q14 57 14 55Z';
const BOOT_CUFF = 'M13.5 6H31.5V13H13.5Z';

function boot(c: string, extraDefs: string, under: string, over: string): string {
  return badge(
    itemBg(c),
    tone('bt', c, 14, 6, 46, 54) + glowDef('g', lighten(c, 0.3), 0.6) + extraDefs,
    glow('g', 32, 32, 28) +
      under +
      `<path d="${BOOT}" fill="url(#@bt)" ${S()}/>` +
      `<path d="M30 28Q30 33 35 35.5L44 40" fill="none" stroke="${darken(c, 0.45)}" stroke-width="1.1" opacity=".7"/>` +
      `<path d="M17.5 13V49" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity=".35"/>` +
      `<path d="${BOOT_SOLE}" fill="${darken(c, 0.72)}" ${S(1.2)}/>` +
      `<path d="${BOOT_CUFF}" fill="${lighten(c, 0.35)}" ${S(1.2)}/>` +
      over,
  );
}

const DRAW: Record<ItemId, Draw> = {
  // ── 鞋 ──
  // 移速草鞋：稻草编的鞋底 + 麻绳系带，鞋后带速度线(最基础的一双，所以不是靴子的样子)
  boots: (c) => {
    const straw = mix(c, '#e9c873', 0.6);
    const rope = (d: string): string =>
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="${lighten(straw, 0.35)}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    let weave = '';
    for (let x = 13; x <= 49; x += 4.5) weave += `M${x} 43.5L${x + 3} 51.5`;
    return badge(
      itemBg(c),
      lg('sl', 0, 40, 0, 54, [[0, lighten(straw, 0.45)], [0.5, straw], [1, darken(straw, 0.5)]]) + glowDef('g', lighten(c, 0.3), 0.55),
      glow('g', 32, 36, 28) +
        `<path d="M1 24H9M0 33H7M2 42H6" stroke="${lighten(c, 0.45)}" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>` +
        // 后跟的绳圈在鞋底后面
        rope('M14 42Q10 25 21 22Q30 20.5 31.5 31') +
        `<path d="M8 46Q8 42 12 42H46Q52 42 56.5 37.5Q60 41 58 47Q55.5 53.5 48 53.5H13Q8 53.5 8 49.5Z" fill="url(#@sl)" ${S(1.4)}/>` +
        `<path d="${weave}" stroke="${darken(straw, 0.55)}" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M10.5 44H47Q52 44 55.5 41" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>` +
        rope('M23 42Q25 31 31.5 31Q39 33 45 42') +
        rope('M41 42Q45 33.5 51.5 39') +
        `<circle cx="31.5" cy="31" r="3.2" fill="${lighten(straw, 0.5)}" ${S(1.1)}/>`,
    );
  },

  // 护甲铁靴：加了胫甲与包头钢板的重靴
  boots_guard: (c) =>
    boot(
      c,
      steel('pl', 16, 10, 30, 36),
      '',
      `<path d="M17 13H28V28.5L22.5 34L17 28.5Z" fill="url(#@pl)" ${S(1.1)}/>` +
        `<path d="M22.5 15V31" stroke="#ffffff" stroke-width="1" opacity=".7"/>` +
        `<path d="M37 36.5L44 40Q49 42.5 49 48V51H35.5Z" fill="url(#@pl)" ${S(1.1)}/>` +
        `<circle cx="19.5" cy="15.5" r="1" fill="${INK}"/><circle cx="25.5" cy="15.5" r="1" fill="${INK}"/><circle cx="39" cy="48" r="1" fill="${INK}"/><circle cx="45.5" cy="48" r="1" fill="${INK}"/>` +
        `<path d="M11.5 3.5H33.5L31.5 9.5H13.5Z" fill="${lighten(c, 0.45)}" ${S(1.1)}/>`,
    ),

  // 减冷却布靴：靴筒绣着发光的星印(技能转得更快)，靴底流着微光
  boots_arcane: (c) =>
    boot(
      c,
      glowDef('gs', '#ffe7ad', 1),
      '',
      `<path d="M13.5 6H31.5V9.2H13.5Z" fill="#f3cf85"/>` +
        glow('gs', 23, 25, 12) +
        `<path d="${star4(23, 25, 7.5, 0.2)}" fill="#fff4d6" stroke="#8a5a14" stroke-width=".7"/>` +
        `<path d="M14.5 54H49.5" stroke="#8fe9ff" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="${star4(45, 22, 3.4)}" fill="#ffffff"/><path d="${star4(52, 33, 2.4)}" fill="#c9f6ff"/><circle cx="40" cy="12" r="1.2" fill="#c9f6ff"/>`,
    ),

  // 攻速皮靴：靴踝生出一对小翼
  boots_fury: (c) =>
    boot(
      c,
      lg('wg', 2, 10, 24, 38, [[0, '#ffffff'], [1, lighten(c, 0.55)]]),
      `<path d="M0 50H9M3 44H9" stroke="${lighten(c, 0.5)}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
      `<path d="M25 27Q9 23 2 9Q13 14 25 18Z" fill="url(#@wg)" ${S(1.1)}/>` +
        `<path d="M25 32Q11 31 3 21Q13 24.5 25 25.5Z" fill="url(#@wg)" ${S(1.1)}/>` +
        `<path d="M25 37Q14 38.5 7 32.5Q15 33.5 25 32Z" fill="url(#@wg)" ${S(1.1)}/>` +
        `<circle cx="25.5" cy="27.5" r="3" fill="#f3cf85" ${S(1)}/>`,
    ),

  // ── 攻击 ──
  // 收割斩马剑：白热的阔刃长剑，护手处嵌一颗星芒
  starfall_blade: (c) =>
    badge(
      itemBg(c),
      lg('bl', 0, 2, 0, 42, [[0, '#fffbe9'], [0.45, c], [1, darken(c, 0.4)]]) + glowDef('g', c, 0.85) + glowDef('gs', '#fff6dc', 1),
      `<path d="M60 22L42 40M52 8L40 20" stroke="${lighten(c, 0.4)}" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>` +
        `<g transform="rotate(40 32 32)">` +
        glow('g', 32, 20, 24) +
        `<path d="M32 1L40 13L38.4 42H25.6L24 13Z" fill="url(#@bl)" ${S()}/>` +
        `<path d="M32 1L40 13L38.4 42H32Z" fill="#6a2f00" opacity=".26"/>` +
        `<path d="M32 7V40" stroke="#fffdf2" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>` +
        `<path d="M16.5 39.5Q24 44 32 41.5Q40 44 47.5 39.5L45.5 47Q38 46 32 48.5Q26 46 18.5 47Z" fill="#3a4257" stroke="#f3cf85" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<rect x="29.4" y="47.6" width="5.2" height="8" fill="${WOOD_D}" ${S(1)}/>` +
        `<path d="M32 55L35.4 58.6L32 62.2L28.6 58.6Z" fill="${c}" ${S(1)}/>` +
        glow('gs', 32, 44.5, 7) +
        `<path d="${star4(32, 44.5, 4.6)}" fill="#fffdf2"/>` +
        glow('gs', 32, 3, 9) +
        `<path d="${star4(32, 3, 5.5, 0.14)}" fill="#ffffff"/>` +
        `</g>`,
    ),

  // 攻速角弓：两梢反曲的角弓拉满，一箭在弦、两道残影紧随其后(连珠快射)
  sunchaser_bow: (c) => {
    const limb = 'M25.5 2.5Q19.5 5 22 9.5Q31 13 36.5 21Q42 29 39.5 32Q42 35 36.5 43Q31 51 22 54.5Q19.5 59 25.5 61.5';
    const arrow = (dy: number, op: number): string =>
      `<g transform="translate(0 ${dy})" opacity="${op}">` +
      `<path d="M13 32H52" stroke="#fff7da" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M50 27.5L60 32L50 36.5L53 32Z" fill="#ffffff"/>` +
      `</g>`;
    return badge(
      itemBg(c),
      lg('bw', 0, 2, 0, 62, [[0, '#4a3018'], [0.16, c], [0.5, lighten(c, 0.5)], [0.84, c], [1, '#4a3018']]) + glowDef('g', c, 0.8),
      glow('g', 36, 30, 26) +
        `<g transform="rotate(-38 32 32)">` +
        arrow(-10, 0.22) +
        arrow(10, 0.38) +
        `<path d="M22.5 6.5L11 32L22.5 57.5" fill="none" stroke="#fff7da" stroke-width="1.1" stroke-linejoin="round"/>` +
        `<path d="${limb}" fill="none" stroke="${INK}" stroke-width="6.6" stroke-linecap="round"/>` +
        `<path d="${limb}" fill="none" stroke="url(#@bw)" stroke-width="4.4" stroke-linecap="round"/>` +
        `<path d="M30 13.5Q35 17.5 38 23M30 50.5Q35 46.5 38 41" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".55"/>` +
        `<rect x="37" y="27" width="5.6" height="10" rx="1.6" fill="#7a4a1c" ${S(1)}/>` +
        `<path d="M37 30.3H42.6M37 33.7H42.6" stroke="#f3cf85" stroke-width=".9"/>` +
        `<path d="M11 32H53" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<path d="M11 32H53" stroke="#fff7da" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M50 27L61.5 32L50 37L53.5 32Z" fill="#ffffff" ${S(1)}/>` +
        `<path d="M11 32L8 28H13L16.5 32L13 36H8Z" fill="#ff8a3a" ${S(0.9)}/>` +
        `</g>`,
    );
  },

  // 吸血环首刀：直背直刃的汉刀，柄尾一个圆环；刃口染血、刀下滴着两滴血
  blood_scythe: (c) =>
    badge(
      itemBg(c),
      lg('bl', 27.5, 0, 36.5, 0, [[0, STEEL_D], [0.28, STEEL_L], [0.62, '#d9dee6'], [1, c]]) + glowDef('g', c, 0.7),
      `<g transform="rotate(42 32 32)">` +
        glow('g', 32, 22, 22) +
        // 刀身：左边是直的刀背，右边是刃，刀尖斜切
        `<path d="M28 1.5L36 10V43H28Z" fill="url(#@bl)" ${S()}/>` +
        `<path d="M30.3 7V41" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M36 10V43" stroke="${c}" stroke-width="1.6" opacity=".9"/>` +
        `<path d="M26.5 43H37.5V46.6H26.5Z" fill="#f3cf85" ${S(1)}/>` +
        `<rect x="29.2" y="46.6" width="5.6" height="8.4" fill="${darken(c, 0.55)}" ${S(1)}/>` +
        `<path d="M29.2 49.3H34.8M29.2 52.1H34.8" stroke="#f3cf85" stroke-width=".9"/>` +
        // 环首：先垫一圈深色描边，再画金环
        `<circle cx="32" cy="59" r="4" fill="none" stroke="${INK}" stroke-width="4.6"/>` +
        `<circle cx="32" cy="59" r="4" fill="none" stroke="#f3cf85" stroke-width="2.4"/>` +
        `</g>` +
        `<path d="M45 30Q48.5 35 45 38.2Q41.5 35 45 30Z" fill="#ff5a55" ${S(0.8)}/>` +
        `<path d="M38 41Q40.3 44.4 38 46.6Q35.7 44.4 38 41Z" fill="#ff5a55" ${S(0.8)}/>`,
    ),

  // 破甲长戟：矛尖旁横出一道戟枝，刺穿一圈裂开的甲环
  piercing_spear: (c) =>
    badge(
      itemBg(c),
      steel('hd', -8, -16, 8, 8) + glowDef('g', '#ffffff', 0.7),
      `<g fill="none" stroke="${lighten(c, 0.25)}" stroke-width="2.6" stroke-linecap="round" opacity=".8">` +
        `<path d="M21 17A19 19 0 0 0 11.5 39"/><path d="M19 49.5A19 19 0 0 0 46 46.5"/><path d="M49.5 38A19 19 0 0 0 49 27"/>` +
        `</g>` +
        `<path d="M14 26L20 29M40 51L38 45M52.5 33L46.5 33" stroke="${lighten(c, 0.5)}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M9 57L42 22" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/>` +
        `<path d="M9 57L42 22" stroke="${WOOD}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M38.5 25Q31.5 25.5 29.5 34Q34.5 32 40.5 31Z" fill="#e0453f" ${S(0.9)}/>` +
        `<circle cx="9" cy="57" r="2.8" fill="${STEEL_M}" ${S(1)}/>` +
        `<g transform="translate(44 20) rotate(45)">` +
        // 戟枝：从矛头根部横着伸出去，末端上翘成钩
        `<path d="M0 2L-9.5 1.5L-15 -5L-13.5 4.5L-9 8.5H0Z" fill="url(#@hd)" ${S()}/>` +
        `<path d="M-1 5H-9.5L-13 0" fill="none" stroke="#ffffff" stroke-width=".9" stroke-linejoin="round" opacity=".7"/>` +
        `<path d="M0 -16L6.2 -3L0 3.5L-6.2 -3Z" fill="url(#@hd)" ${S()}/>` +
        `<path d="M0 -14V2" stroke="#ffffff" stroke-width="1" opacity=".8"/>` +
        `<rect x="-3.4" y="7.5" width="6.8" height="3.6" rx="1" fill="#f3cf85" ${S(0.9)}/>` +
        `</g>` +
        glow('g', 56.5, 8.5, 8) +
        `<path d="${star4(56.5, 8.5, 4.2, 0.14)}" fill="#ffffff"/>`,
    ),

  // 暴击吴钩：弯如新月、刀尖回钩的弯刀，拖着一重残影；钩尖一点暴击的星芒
  phantom_edge: (c) => {
    const blade = 'M27 42Q20.5 21 32.5 7Q40 -1.5 48.5 7.5Q41.5 5.5 38 12Q30.5 24 35.5 42Z';
    return badge(
      itemBg(c),
      lg('bl', 22, 0, 46, 0, [[0, '#ffffff'], [0.45, lighten(c, 0.55)], [1, c]]) + glowDef('g', c, 0.8) + glowDef('gs', '#ffffff', 1),
      `<g transform="translate(-1 2) rotate(30 32 32)">` +
        `<path d="${blade}" transform="translate(-8 3)" fill="${c}" opacity=".26"/>` +
        glow('g', 34, 20, 22) +
        `<path d="${blade}" fill="url(#@bl)" ${S()}/>` +
        `<path d="M29.5 40Q24 22 34 9.5Q39.5 3 45 6" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>` +
        `<path d="M22 42H40.5Q42.5 42 42.5 44.2Q42.5 46.4 40.5 46.4H22Q20 46.4 20 44.2Q20 42 22 42Z" fill="#2a2244" stroke="${lighten(c, 0.2)}" stroke-width="1.1"/>` +
        `<rect x="28.6" y="46.4" width="5.4" height="9.2" fill="#15131f" ${S(1)}/>` +
        `<path d="M28.6 49.4H34M28.6 52.4H34" stroke="${c}" stroke-width="1"/>` +
        `<path d="M31.3 55.6L35 59.3L31.3 63L27.6 59.3Z" fill="${lighten(c, 0.2)}" ${S(1)}/>` +
        glow('gs', 48, 7, 9) +
        `<path d="${star4(48, 7, 6.5, 0.12)}" fill="#ffffff"/>` +
        `</g>`,
    );
  },

  // ── 法术 ──
  // 减冷却法杖：杖首的弯月托着一颗悬浮的星晶
  astral_staff: (c) =>
    badge(
      itemBg(c),
      lg('st', 35, 5, 55, 25, [[0, '#ffffff'], [1, c]]) + glowDef('g', c, 1),
      `<path d="M16 59L38 26" stroke="${INK}" stroke-width="5.8" stroke-linecap="round"/>` +
        `<path d="M16 59L38 26" stroke="#9fb7e8" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M22 46.5L26 49.2M29.5 35.5L33.5 38.2" stroke="#f3cf85" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M38 26Q28 20 33 8M38 26Q46 32 57 26" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M38 26Q28 20 33 8M38 26Q46 32 57 26" fill="none" stroke="#f3cf85" stroke-width="2.6" stroke-linecap="round"/>` +
        `<circle cx="38" cy="26" r="3.2" fill="#fff4d6" ${S(1)}/>` +
        glow('g', 45, 15, 17) +
        `<ellipse cx="45" cy="15" rx="14" ry="4.6" transform="rotate(-25 45 15)" fill="none" stroke="#c9f6ff" stroke-width="1.1" opacity=".8"/>` +
        `<path d="${star4(45, 15, 11, 0.22)}" fill="url(#@st)" stroke="${darken(c, 0.5)}" stroke-width=".8"/>` +
        `<path d="${star4(45, 15, 5)}" fill="#ffffff"/>` +
        `<circle cx="16" cy="59" r="2.6" fill="#f3cf85" ${S(1)}/>` +
        `<circle cx="14" cy="22" r="1.3" fill="#c9f6ff"/><path d="${star4(20, 13, 2.8)}" fill="#ffffff"/>`,
    ),

  // 法穿玉冠：冠心嵌着一枚吞光的暗玉(专破魔抗)
  void_crown: (c) =>
    badge(
      itemBg(c),
      tone('cr', c, 8, 10, 56, 52) + rg('vo', 32, 34, 8.5, [[0, '#000000'], [0.55, '#1c0845'], [1, c]]) + glowDef('g', c, 0.85),
      glow('g', 32, 32, 28) +
        `<path d="M11 44L7.5 19L21 30L32 10.5L43 30L56.5 19L53 44Z" fill="url(#@cr)" ${S()}/>` +
        `<path d="M21 30L22.5 44M43 30L41.5 44" stroke="${darken(c, 0.55)}" stroke-width="1.1" opacity=".55"/>` +
        `<path d="M7.5 19L21 30L32 10.5" fill="none" stroke="#ffffff" stroke-width="1" stroke-linejoin="round" opacity=".55"/>` +
        `<path d="M10.5 44H53.5V51Q53.5 53.5 51 53.5H13Q10.5 53.5 10.5 51Z" fill="#241c42" stroke="${lighten(c, 0.4)}" stroke-width="1.2"/>` +
        `<path d="M20 46L22.6 48.8L20 51.6L17.4 48.8ZM44 46L46.6 48.8L44 51.6L41.4 48.8ZM32 46L34.6 48.8L32 51.6L29.4 48.8Z" fill="${lighten(c, 0.6)}"/>` +
        `<circle cx="7.5" cy="19" r="2.8" fill="#ece2ff" ${S(1)}/><circle cx="56.5" cy="19" r="2.8" fill="#ece2ff" ${S(1)}/><circle cx="32" cy="10.5" r="3.2" fill="#ece2ff" ${S(1)}/>` +
        `<circle cx="32" cy="34" r="7.8" fill="url(#@vo)" stroke="#ece2ff" stroke-width="1.3"/>` +
        `<path d="M27.5 32Q29.5 28.5 33.5 29" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>`,
    ),

  // 减速权杖：杖首凝着一朵六棱冰晶(打中就减速)
  winter_scepter: (c) =>
    badge(
      itemBg(c),
      lg('ic', 30, 6, 56, 32, [[0, '#ffffff'], [1, c]]) + glowDef('g', c, 0.9),
      `<path d="M14 59L37 27" stroke="${INK}" stroke-width="5.8" stroke-linecap="round"/>` +
        `<path d="M14 59L37 27" stroke="#c4d8e8" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M20 47.5L24 50.5M27 37.5L31 40.5" stroke="#5c7fa6" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M35 33L27 27L36 27.5Z" fill="#e8fbff" ${S(1)}/><path d="M39 33L47 36L40.5 29Z" fill="${c}" ${S(1)}/>` +
        glow('g', 43, 19, 20) +
        `<path d="${starPoly(43, 19, 6, 14.5, 5.2)}" fill="url(#@ic)" stroke="#1b4a66" stroke-width="1.1" stroke-linejoin="round"/>` +
        `<path d="M43 4.5V33.5M30.4 11.8L55.6 26.2M30.4 26.2L55.6 11.8" stroke="#ffffff" stroke-width=".9" opacity=".75"/>` +
        `<path d="${starPoly(43, 19, 6, 5.6, 3.4)}" fill="#ffffff"/>` +
        `<circle cx="14" cy="59" r="2.6" fill="#c4d8e8" ${S(1)}/>` +
        `<g stroke="#e8fbff" stroke-width="1.2" stroke-linecap="round"><path d="M14 14V22M10.5 16L17.5 20M10.5 20L17.5 16"/><path d="M53 42V48M50.4 43.5L55.6 46.5M50.4 46.5L55.6 43.5"/></g>`,
    ),

  // 法强竹简：半卷半展的一册竹简，两道编绳，简上的字迹泛着金光
  sage_codex: (c) => {
    let slips = '';
    let marks = '';
    for (let i = 0; i < 7; i++) {
      const x = 9.5 + i * 5.2;
      const y = 13 + (i % 2) * 1.2;
      slips += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="4.8" height="38" rx="1" fill="url(#@bm)" ${S(0.9)}/>`;
      if (i > 0) marks += `M${(x + 1.3).toFixed(1)} 27h2.2M${(x + 1.3).toFixed(1)} 31h2.2M${(x + 1.3).toFixed(1)} 35h2.2M${(x + 1.3).toFixed(1)} 39h2.2`;
    }
    return badge(
      itemBg(c),
      lg('bm', 0, 12, 0, 52, [[0, lighten(c, 0.5)], [0.5, c], [1, darken(c, 0.45)]]) + lg('rl', 45, 0, 56, 0, [[0, darken(c, 0.35)], [0.45, lighten(c, 0.35)], [1, darken(c, 0.6)]]) + glowDef('g', '#fff6dc', 0.85),
      `<g transform="rotate(-8 32 32)">` +
        glow('g', 28, 33, 24) +
        slips +
        `<path d="${marks}" stroke="#5a3a12" stroke-width="1.3" stroke-linecap="round"/>` +
        // 两道编绳
        `<path d="M8.5 20.5H47M8.5 45H47" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M8.5 20.5H47M8.5 45H47" stroke="#c8523c" stroke-width="1.7" stroke-linecap="round"/>` +
        // 右端卷起来的那一卷
        `<rect x="45.5" y="10" width="10" height="44" rx="5" fill="url(#@rl)" ${S(1.2)}/>` +
        `<ellipse cx="50.5" cy="13" rx="3.6" ry="1.8" fill="${darken(c, 0.62)}"/>` +
        `<path d="M45.5 20.5H55.5M45.5 45H55.5" stroke="#c8523c" stroke-width="1.7"/>` +
        `<path d="M48 17V50" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".5"/>` +
        `<path d="M50.5 54V60" stroke="#c8523c" stroke-width="1.5" stroke-linecap="round"/><path d="M48.8 59.5H52.2L51.3 63H49.7Z" fill="#c8523c"/>` +
        `</g>` +
        `<path d="${star4(51, 9, 3.6)}" fill="#ffffff"/><path d="${star4(8, 54, 2.4)}" fill="#fff6dc"/>`,
    );
  },

  // ── 防御 ──
  // 护甲重铠：宽肩重型胸甲，胸口一枚护心晶
  guardian_plate: (c) =>
    badge(
      itemBg(c),
      lg('pl', 10, 8, 54, 56, [[0, lighten(c, 0.6)], [0.45, c], [1, darken(c, 0.55)]]) + glowDef('g', '#ffcf70', 1),
      `<path d="M32 13L41 9Q48 7.5 54 12.5L57.5 25L48 30V44Q42 54 32 57.5Q22 54 16 44V30L6.5 25L10 12.5Q16 7.5 23 9Z" fill="url(#@pl)" ${S(1.5)}/>` +
        `<path d="M6.5 25L10 12.5Q16 7.5 23 9L20.5 22Q13.5 22 6.5 25Z" fill="${lighten(c, 0.5)}" ${S(1.1)}/>` +
        `<path d="M57.5 25L54 12.5Q48 7.5 41 9L43.5 22Q50.5 22 57.5 25Z" fill="${c}" ${S(1.1)}/>` +
        `<path d="M23 9L32 13L41 9L38.5 17.5Q32 20.5 25.5 17.5Z" fill="${darken(c, 0.5)}" ${S(1.1)}/>` +
        `<path d="M32 20V57" stroke="#ffffff" stroke-width="1.2" opacity=".4"/>` +
        `<path d="M19.5 30.5Q26 36.5 32 33.5Q38 36.5 44.5 30.5M18 40Q32 46.5 46 40M21.5 47.5Q32 52.5 42.5 47.5" fill="none" stroke="${darken(c, 0.6)}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>` +
        `<circle cx="13" cy="17" r="1.2" fill="${INK}"/><circle cx="51" cy="17" r="1.2" fill="${INK}"/>` +
        glow('g', 32, 27, 9) +
        `<path d="M32 22L36.2 27L32 32L27.8 27Z" fill="#ffcf70" stroke="#fffdf2" stroke-width="1"/>`,
    ),

  // 魔抗狐裘：厚实的裘衣，肩上一圈蓬松的白狐毛领，下摆也滚着毛边
  starweave_cloak: (c) => {
    const fur = 'M17.5 21Q13.5 16.5 18.5 13.5Q18.5 8.5 24.5 9.5Q27.5 5 32 8Q36.5 5 39.5 9.5Q45.5 8.5 45.5 13.5Q50.5 16.5 46.5 21Q48.5 26.5 42.5 26Q39.5 30 36 26.5Q32 30.5 28 26.5Q24.5 30 21.5 26Q15.5 26.5 17.5 21Z';
    const hem = 'M11 57Q21.5 50.5 32 57Q42.5 50.5 53 57';
    return badge(
      itemBg(c),
      lg('ck', 0, 10, 0, 58, [[0, lighten(c, 0.35)], [0.45, c], [1, mix(c, '#0a1838', 0.72)]]) + lg('fr', 0, 5, 0, 30, [[0, '#ffffff'], [1, '#e2d3b4']]) + glowDef('g', c, 0.7),
      glow('g', 32, 36, 30) +
        `<path d="M22 15L45 15.5Q56 34 54 58Q43 51.5 32 58Q21 51.5 10 58Q8 34 19 15.5Z" fill="url(#@ck)" ${S(1.4)}/>` +
        `<path d="M26 27Q24 41 21 53M38 27Q40 41 43 53M32 29V56" fill="none" stroke="${darken(c, 0.6)}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>` +
        `<path d="M19 15.5Q11 30 10.5 50" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".35"/>` +
        // 下摆的毛边
        `<path d="${hem}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="${hem}" fill="none" stroke="#efe3c8" stroke-width="4.8" stroke-linecap="round"/>` +
        `<path d="M15 53.5V57M20 51.5V55M25.5 52.5V56M32 55V58.5M38.5 52.5V56M44 51.5V55M49 53.5V57" stroke="#b9a57e" stroke-width=".9" stroke-linecap="round"/>` +
        // 毛领
        `<path d="${fur}" fill="url(#@fr)" ${S(1.3)}/>` +
        `<path d="M21 17.5L23 20.5M26 13L27.5 16M37 13L36 16M43 17.5L41 20.5M25 22.5L26.5 24.5M39 22.5L37.5 24.5M32 22.5V25.5" stroke="#b9a57e" stroke-width="1" stroke-linecap="round"/>` +
        `<ellipse cx="32" cy="14.5" rx="5.4" ry="2.7" fill="#061220"/>` +
        `<circle cx="32" cy="27.5" r="2.8" fill="#f3cf85" ${S(1)}/>`,
    );
  },

  // 回血护心镜：系在胸前的圆铜镜，镜心一枚心形纹(血厚、脱战回血)
  undying_heart: (c) => {
    let studs = '';
    for (let i = 0; i < 8; i++) {
      const [x, y] = polar(32, 32, 20.2, i * 45 + 22.5);
      studs += `<circle cx="${x}" cy="${y}" r="1.3" fill="#fff4d6" stroke="#6b4614" stroke-width=".5"/>`;
    }
    const strap = (d: string): string =>
      `<path d="${d}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="${d}" stroke="${WOOD}" stroke-width="3.6" stroke-linecap="round"/>`;
    return badge(
      itemBg(c),
      lg('rm', 10, 10, 54, 54, [[0, '#fff1c4'], [0.45, '#d9a548'], [1, '#6b4614']]) + rg('ht', 27, 25, 26, [[0, lighten(c, 0.62)], [0.5, c], [1, darken(c, 0.55)]]) + glowDef('g', c, 0.85) + glowDef('gc', '#fff0f3', 0.9),
      glow('g', 32, 32, 31) +
        strap('M7 7L17 17') +
        strap('M57 7L47 17') +
        strap('M7 57L17 47') +
        strap('M57 57L47 47') +
        `<circle cx="32" cy="32" r="23" fill="url(#@rm)" ${S(1.5)}/>` +
        `<circle cx="32" cy="32" r="17.2" fill="url(#@ht)" stroke="#6b4614" stroke-width="1.2"/>` +
        studs +
        `<path d="M19.5 25A14.5 14.5 0 0 1 30 17.7" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>` +
        glow('gc', 32, 32, 12) +
        `<path d="M32 42L23.3 33Q20 27.5 24.7 24.7Q29.2 22.8 32 27.4Q34.8 22.8 39.3 24.7Q44 27.5 40.7 33Z" fill="#fff3f5" stroke="${darken(c, 0.5)}" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M26 28.5Q27.2 26.3 29.3 26.6" fill="none" stroke="${c}" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`,
    );
  },

  // 反伤钉盾：一面圆盾，盾沿一圈尖钉，盾心也是一枚钉(谁打你谁挨扎)
  thorn_mail: (c) => {
    let rivets = '';
    for (let i = 0; i < 8; i++) {
      const [x, y] = polar(32, 33, 14.5, i * 45 - 90);
      rivets += `<circle cx="${x}" cy="${y}" r="1.3" fill="#f1f8d8" stroke="${darken(c, 0.6)}" stroke-width=".5"/>`;
    }
    return badge(
      itemBg(c),
      rg('bd', 26, 26, 30, [[0, lighten(c, 0.5)], [0.5, c], [1, darken(c, 0.6)]]) + lg('sp', 0, 4, 0, 62, [[0, '#f8fbe6'], [1, darken(c, 0.15)]]),
      // 八枚尖钉垫在盾面后面，只露出盾沿以外的尖
      `<path d="${starPoly(32, 33, 8, 28.5, 15, -67.5)}" fill="url(#@sp)" ${S(1.2)}/>` +
        `<circle cx="32" cy="33" r="20" fill="url(#@bd)" ${S(1.5)}/>` +
        `<circle cx="32" cy="33" r="17.3" fill="none" stroke="${darken(c, 0.55)}" stroke-width="1.2" opacity=".6"/>` +
        `<circle cx="32" cy="33" r="10.5" fill="none" stroke="${darken(c, 0.6)}" stroke-width="1.3" opacity=".65"/>` +
        `<path d="M32 13V22.5M32 43.5V53M12 33H21.5M42.5 33H52" stroke="${darken(c, 0.6)}" stroke-width="1.1" opacity=".5"/>` +
        rivets +
        `<path d="M17.5 25.5A16.5 16.5 0 0 1 28.5 16.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>` +
        `<circle cx="32" cy="33" r="7" fill="${darken(c, 0.35)}" ${S(1.2)}/>` +
        `<path d="${starPoly(32, 33, 4, 9, 3, -90)}" fill="url(#@sp)" ${S(1)}/>` +
        `<circle cx="32" cy="33" r="1.6" fill="#ffffff"/>`,
    );
  },
};

/** 装备图标。返回 SVG 字符串（64×64 满幅方形） */
export function itemIcon(itemId: ItemId): string {
  return DRAW[itemId](ITEMS[itemId].color);
}
