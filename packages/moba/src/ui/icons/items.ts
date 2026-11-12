/**
 * 21 件装备图标：按 ItemDef.color 取主色、按品类画出可辨识的造型（刀/弓/书/甲/靴/杖/冠/心…）。
 * 与技能图标同一套徽章底板：深色径向底 + 主体 + 暗角 + 顶部高光。
 */
import { ITEMS } from '../../core/data/items';
import type { ItemId } from '../../core/types';
import { INK, badge, darken, glow, glowDef, lg, lighten, mix, rg, star4, starPoly } from './svg';

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
  // 疾行靴：系带皮靴，靴后带速度线
  boots: (c) =>
    boot(
      c,
      '',
      `<path d="M2 26H10M0 35H9M3 44H10" stroke="${lighten(c, 0.45)}" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>`,
      `<path d="M24 18H30M24 23H30M24 28H30" stroke="${lighten(c, 0.6)}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<path d="M15 33Q23 30 31 33" fill="none" stroke="${darken(c, 0.55)}" stroke-width="3"/>` +
        `<rect x="20.5" y="29.8" width="4.6" height="4.6" rx="1" fill="#f3cf85" ${S(0.9)}/>`,
    ),

  // 磐守之靴：加了胫甲与包头钢板的重靴
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

  // 星辉之靴：靴筒嵌着发光星印，靴底流着星辉
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

  // 疾风之靴：靴踝生出一对小翼
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
  // 陨星战刃：白热的阔刃，护手处嵌一颗坠星
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

  // 逐日长弓：拉满的金色长弓，箭指一轮烈日
  sunchaser_bow: (c) =>
    badge(
      itemBg(c),
      tone('bw', c, 20, 2, 44, 62) + rg('sun', 44, 20, 13, [[0, '#fffdf2'], [0.55, c], [1, darken(c, 0.25)]]) + glowDef('g', c, 0.9),
      glow('g', 44, 20, 22) +
        `<g stroke="${lighten(c, 0.3)}" stroke-width="1.7" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M44 3V6.5" transform="rotate(${a} 44 20)"/>`).join('')}</g>` +
        `<circle cx="44" cy="20" r="10.5" fill="url(#@sun)" stroke="${darken(c, 0.45)}" stroke-width="1"/>` +
        `<g transform="rotate(-38 32 32)">` +
        `<path d="M21 3L11 32L21 61" fill="none" stroke="#fff7da" stroke-width="1.1" stroke-linejoin="round"/>` +
        `<path d="M21 3Q31 5 37.5 16Q44 27 40 32Q44 37 37.5 48Q31 59 21 61" fill="none" stroke="${INK}" stroke-width="6.6" stroke-linecap="round"/>` +
        `<path d="M21 3Q31 5 37.5 16Q44 27 40 32Q44 37 37.5 48Q31 59 21 61" fill="none" stroke="url(#@bw)" stroke-width="4.4" stroke-linecap="round"/>` +
        `<rect x="37.4" y="27" width="5.6" height="10" rx="1.6" fill="#7a4a1c" ${S(1)}/>` +
        `<path d="M11 32H53" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<path d="M11 32H53" stroke="#fff7da" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M50 27L61.5 32L50 37L53.5 32Z" fill="#ffffff" ${S(1)}/>` +
        `<path d="M11 32L8 28H13L16.5 32L13 36H8Z" fill="#ff8a3a" ${S(0.9)}/>` +
        `</g>`,
    ),

  // 饮血镰：猩红的长柄弯镰，刃尖滴血
  blood_scythe: (c) =>
    badge(
      itemBg(c),
      lg('bl', 44, 6, 8, 30, [[0, darken(c, 0.35)], [0.55, c], [1, '#fbeaea']]) + glowDef('g', c, 0.7),
      glow('g', 24, 20, 24) +
        `<path d="M14 59L44 13" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M14 59L44 13" stroke="${WOOD}" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M21.5 47.5L25 50M27.5 38.5L31 41" stroke="#f3cf85" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M47 8Q22 -2 5 24L7 31.5Q22 13.5 43 20Z" fill="url(#@bl)" ${S()}/>` +
        `<path d="M7 31.5Q22 13.5 43 20" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M46 9L53.5 2L50 13Z" fill="${STEEL_M}" ${S(1)}/>` +
        `<circle cx="44.5" cy="13.5" r="4.4" fill="#3a4257" stroke="#f3cf85" stroke-width="1.2"/>` +
        `<path d="M9 36Q13 41.5 9 45Q5 41.5 9 36Z" fill="#ff5a55" ${S(0.8)}/>` +
        `<path d="M15.5 44Q18 47.5 15.5 50Q13 47.5 15.5 44Z" fill="#ff5a55" ${S(0.8)}/>`,
    ),

  // 破阵枪：长枪刺穿一圈碎裂的阵环
  piercing_spear: (c) =>
    badge(
      itemBg(c),
      steel('hd', -6, -15, 6, 3) + glowDef('g', '#ffffff', 0.7),
      `<g fill="none" stroke="${lighten(c, 0.25)}" stroke-width="2.6" stroke-linecap="round" opacity=".8">` +
        `<path d="M22.5 14.5A19 19 0 0 0 11.5 39"/><path d="M19 49.5A19 19 0 0 0 46 46.5"/><path d="M48.5 36A19 19 0 0 0 44 20"/>` +
        `</g>` +
        `<path d="M14 26L20 29M40 51L38 45M51 30L45 31" stroke="${lighten(c, 0.5)}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M9 57L45 19" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/>` +
        `<path d="M9 57L45 19" stroke="${WOOD}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M42 21Q35 21.5 33 30Q38 28 44 27Z" fill="#e0453f" ${S(0.9)}/>` +
        `<circle cx="9" cy="57" r="2.8" fill="${STEEL_M}" ${S(1)}/>` +
        `<g transform="translate(47 17) rotate(45)">` +
        `<path d="M0 -16L6.2 -3L0 3.5L-6.2 -3Z" fill="url(#@hd)" ${S()}/>` +
        `<path d="M0 -14V2" stroke="#ffffff" stroke-width="1" opacity=".8"/>` +
        `<rect x="-3.4" y="2" width="6.8" height="3.6" rx="1" fill="#f3cf85" ${S(0.9)}/>` +
        `</g>` +
        glow('g', 58, 6, 8) +
        `<path d="${star4(58, 6, 4.4, 0.14)}" fill="#ffffff"/>`,
    ),

  // 无影刃：弧形匕首拖着两重渐隐的残影
  phantom_edge: (c) => {
    const blade = 'M32 3Q41 18 37.5 40H26.5Q28.5 20 32 3Z';
    return badge(
      itemBg(c),
      lg('bl', 26, 0, 39, 0, [[0, '#ffffff'], [0.5, lighten(c, 0.5)], [1, c]]) + glowDef('g', c, 0.8),
      `<g transform="translate(3 -2) rotate(38 32 32)">` +
        `<path d="${blade}" transform="translate(-13 4)" fill="${c}" opacity=".18"/>` +
        `<path d="${blade}" transform="translate(-6.5 2)" fill="${c}" opacity=".38"/>` +
        glow('g', 32, 20, 20) +
        `<path d="${blade}" fill="url(#@bl)" ${S()}/>` +
        `<path d="M32 3Q41 18 37.5 40" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>` +
        `<rect x="21.5" y="40" width="21" height="4.4" rx="2" fill="#2a2244" stroke="${c}" stroke-width="1.1"/>` +
        `<rect x="29.4" y="44.4" width="5.2" height="9.6" fill="#15131f" ${S(1)}/>` +
        `<path d="M29.4 47.5H34.6M29.4 50.5H34.6" stroke="${c}" stroke-width="1"/>` +
        `<circle cx="32" cy="57.4" r="3" fill="none" stroke="${c}" stroke-width="1.8"/>` +
        `</g>`,
    );
  },

  // ── 法术 ──
  // 星辰法杖：杖首的弯月托着一颗悬浮的星晶
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

  // 虚空之冠：冠心嵌着一枚吞光的虚空宝石
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

  // 凛冬权杖：杖首凝着一朵六棱冰晶
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

  // 贤者星典：烫金封面的厚典籍，封面是一枚星徽
  sage_codex: (c) =>
    badge(
      itemBg(c),
      lg('cv', 14, 8, 46, 54, [[0, lighten(c, 0.45)], [0.5, c], [1, darken(c, 0.5)]]) + glowDef('g', '#fff6dc', 0.9),
      `<g transform="rotate(-9 32 32)">` +
        `<path d="M19 11H51V56H19Z" fill="#f6efdb" ${S()}/>` +
        `<path d="M48.6 13V54M46.2 13V54M21 53.6H46M21 51.2H46" stroke="#b9aa84" stroke-width=".9"/>` +
        `<path d="M15 8H44Q46 8 46 10V51Q46 53 44 53H15Q13 53 13 51V10Q13 8 15 8Z" fill="url(#@cv)" ${S()}/>` +
        `<path d="M13 10Q13 8 15 8H19V53H15Q13 53 13 51Z" fill="${darken(c, 0.55)}" opacity=".7"/>` +
        `<path d="M38.5 8H44Q46 8 46 10V15.5ZM38.5 53H44Q46 53 46 51V45.5Z" fill="#fff4d6" ${S(0.9)}/>` +
        glow('g', 31.5, 27, 15) +
        `<circle cx="31.5" cy="27" r="10.5" fill="none" stroke="#6b4614" stroke-width="1.3"/>` +
        `<path d="${star4(31.5, 27, 9.5, 0.2)}" fill="#fffbe9" stroke="#6b4614" stroke-width=".8"/>` +
        `<path d="M24 44H39" stroke="#6b4614" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M35 53V62L37.6 59.4L40.2 62V53Z" fill="#d8433f" ${S(0.9)}/>` +
        `</g>` +
        `<path d="${star4(54, 16, 3.2)}" fill="#ffffff"/>`,
    ),

  // ── 防御 ──
  // 守护者重铠：宽肩重型胸甲，胸口一枚护心晶
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

  // 星纹斗篷：缀满星点、连成星图的斗篷
  starweave_cloak: (c) =>
    badge(
      itemBg(c),
      lg('ck', 0, 6, 0, 58, [[0, lighten(c, 0.4)], [0.45, c], [1, mix(c, '#0a1838', 0.75)]]) + glowDef('g', c, 0.7),
      glow('g', 32, 34, 30) +
        `<path d="M24 9Q32 5 40 9L45 16Q56 34 54 58Q43 51.5 32 58Q21 51.5 10 58Q8 34 19 16Z" fill="url(#@ck)" ${S(1.4)}/>` +
        `<path d="M26 23Q24 40 20.5 54.5M38 23Q40 40 43.5 54.5M32 25V57" fill="none" stroke="${darken(c, 0.6)}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>` +
        `<path d="M24 9Q32 5 40 9L42.5 17.5Q32 24 21.5 17.5Z" fill="${darken(c, 0.4)}" ${S(1.1)}/>` +
        `<ellipse cx="32" cy="13.4" rx="6.2" ry="3.3" fill="#061220"/>` +
        `<path d="M22 37L30.5 46.5L41.5 33L46.5 46" fill="none" stroke="#ffffff" stroke-width=".8" opacity=".45"/>` +
        `<path d="${star4(22, 37, 3.6)}" fill="#fffbe9"/><path d="${star4(41.5, 33, 3)}" fill="#fffbe9"/><path d="${star4(30.5, 46.5, 3.2)}" fill="#fffbe9"/><path d="${star4(46.5, 46, 2.3)}" fill="#fffbe9"/><path d="${star4(16.5, 48, 2)}" fill="#fffbe9"/>` +
        `<circle cx="27" cy="30" r=".9" fill="#fff"/><circle cx="37.5" cy="42" r=".9" fill="#fff"/><circle cx="24" cy="50" r=".8" fill="#fff"/>` +
        `<circle cx="32" cy="21" r="3" fill="#f3cf85" ${S(1)}/>` +
        `<path d="M10 58Q21 51.5 32 58Q43 51.5 54 58" fill="none" stroke="#d9fff8" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`,
    ),

  // 不灭之心：晶莹的结晶之心，心核长明
  undying_heart: (c) =>
    badge(
      itemBg(c),
      rg('ht', 27, 24, 34, [[0, lighten(c, 0.6)], [0.45, c], [1, darken(c, 0.55)]]) + glowDef('g', c, 0.9) + glowDef('gc', '#fff0f3', 1),
      glow('g', 32, 32, 31) +
        `<path d="M6 45Q10 54 19 59M58 45Q54 54 45 59" fill="none" stroke="${lighten(c, 0.35)}" stroke-width="1.5" stroke-linecap="round" opacity=".6"/>` +
        `<path d="M32 56L10 32Q4 19 15 12.5Q25 8 32 19Q39 8 49 12.5Q60 19 54 32Z" fill="url(#@ht)" ${S(1.5)}/>` +
        `<path d="M32 19L24 31L32 56L40 31Z" fill="#ffffff" opacity=".2"/>` +
        `<path d="M15 12.5L24 31L10 32M49 12.5L40 31L54 32M24 31H40M32 19L24 31M32 19L40 31" fill="none" stroke="#ffffff" stroke-width=".9" stroke-linejoin="round" opacity=".45"/>` +
        `<ellipse cx="20" cy="19.5" rx="5.2" ry="2.8" transform="rotate(-32 20 19.5)" fill="#ffffff" opacity=".6"/>` +
        glow('gc', 32, 31, 11) +
        `<path d="${star4(32, 31, 7.5)}" fill="#fff6f8"/>`,
    ),

  // 荆棘岩甲：岩质胸甲上生满尖刺
  thorn_mail: (c) => {
    const sp = `fill="url(#@sp)" ${S(1.1)}`;
    return badge(
      itemBg(c),
      lg('bd', 12, 10, 52, 56, [[0, lighten(c, 0.45)], [0.5, c], [1, darken(c, 0.6)]]) + lg('sp', 0, 4, 0, 56, [[0, '#f1f8d8'], [1, darken(c, 0.2)]]),
      `<path d="M19 18L5 5L23 12Z" ${sp}/><path d="M45 18L59 5L41 12Z" ${sp}/>` +
        `<path d="M14 29L1 27L14 36.5Z" ${sp}/><path d="M50 29L63 27L50 36.5Z" ${sp}/>` +
        `<path d="M18 44L6 53L23 50Z" ${sp}/><path d="M46 44L58 53L41 50Z" ${sp}/>` +
        `<path d="M32 9.5L44 12.5Q52 16 51 28V40Q46 52 32 56.5Q18 52 13 40V28Q12 16 20 12.5Z" fill="url(#@bd)" ${S(1.5)}/>` +
        `<path d="M24 11.5Q32 18.5 40 11.5" fill="none" stroke="${darken(c, 0.6)}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M32 19V56M13.5 33Q22 37 32 34Q42 37 50.5 33M18 45Q32 51 46 45" fill="none" stroke="${darken(c, 0.62)}" stroke-width="1.3" stroke-linecap="round" opacity=".65"/>` +
        `<path d="M20 12.5Q12 16 13 28" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".5"/>` +
        `<path d="${starPoly(32, 27, 4, 8, 2.8)}" fill="#f1f8d8" ${S(1)}/>` +
        `<path d="M22 23.5L20 20L24 21ZM42 23.5L44 20L40 21ZM23 42L20.5 39.5L25 40ZM41 42L43.5 39.5L39 40Z" fill="#f1f8d8"/>`,
    );
  },
};

/** 装备图标。返回 SVG 字符串（64×64 满幅方形） */
export function itemIcon(itemId: ItemId): string {
  return DRAW[itemId](ITEMS[itemId].color);
}
