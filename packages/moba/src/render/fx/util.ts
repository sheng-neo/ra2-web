/**
 * 特效层的小工具：确定性随机数(截图可复现)、常用数学、主题色。
 */
import * as THREE from 'three';
import type { HeroId, TeamId } from '../../core/types';
import { PALETTE } from '../materials';

export const TAU = Math.PI * 2;
export const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 回弹缓出(带一点过冲)：岩刺破土、暴击数字弹跳 */
export const backOut = (t: number, s = 1.70158): number => {
  const u = t - 1;
  return 1 + u * u * ((s + 1) * u + s);
};

/** xorshift32：比 Math.random 快，且同一序列可复现 */
export class Rand {
  private s: number;
  constructor(seed = 0x2f6e2b1) {
    this.s = seed >>> 0 || 1;
  }
  seed(v: number): void {
    this.s = v >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** [-1, 1) */
  signed(): number {
    return this.next() * 2 - 1;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** sRGB 十六进制 → 线性色(模块级常量用) */
export const col = (hex: number): THREE.Color => new THREE.Color(hex);

/** 英雄技能的主题色(线性空间) */
export interface Theme {
  /** 主辉光 */
  glow: THREE.Color;
  /** 亮核(接近白) */
  hot: THREE.Color;
  /** 深色(收尾/外缘) */
  deep: THREE.Color;
  /** 点缀 */
  accent: THREE.Color;
  /** 烟尘/遮挡层 */
  dark: THREE.Color;
}

export const THEME: Record<HeroId, Theme> = {
  // 樊哙：琥珀金 —— 盾形冲击弧、夯土尘浪、震裂
  panyue: { glow: col(0xff9218), hot: col(0xffc44e), deep: col(0xd9580a), accent: col(0xf2b75a), dark: col(0x2e2218) },
  // 程咬金：橙红 —— 赤金斧弧、劲风、铁火星
  chijin: { glow: col(0xff5a1e), hot: col(0xffae38), deep: col(0xcc1e12), accent: col(0xff9428), dark: col(0x26100e) },
  // 王昭君：月白青 + 弦金 —— 弦线、音波环、雁影、圆月
  xingli: { glow: col(0x8cc4ff), hot: col(0xf2f8ff), deep: col(0x3a4a9c), accent: col(0xffd98a), dark: col(0x141a3c) },
  // 李广：苍翠 —— 破空白线、白羽、草屑、石屑
  fengling: { glow: col(0x2ee096), hot: col(0x7ef6be), deep: col(0x1f9670), accent: col(0xe9c46a), dark: col(0x0e3428) },
  // 荆轲：墨紫 + 寒白 —— 墨痕笔触、匕首寒光、帛卷(accent = 淬药的寒青，dark = 墨)
  yeque: { glow: col(0x8a5cf0), hot: col(0xe8f0ff), deep: col(0x3a2a78), accent: col(0xbfe9e2), dark: col(0x0e0a16) },
};

export const C = {
  white: col(0xffffff),
  warm: col(0xffcf70),
  spark: col(0xffb432),
  sparkDeep: col(0xff5210),
  magic: col(0x5cc4ff),
  magicDeep: col(0x3a5cff),
  crit: col(0xffd23a),
  critDeep: col(0xff4a10),
  heal: col(0x7dffa0),
  healDeep: col(0x2fd070),
  gold: col(0xffd04a),
  goldDeep: col(0xf09a20),
  goldHot: col(0xffe27a),
  dust: col(0xb8a688),
  dustDark: col(0x7a6a56),
  rock: col(0x8a8076),
  smoke: col(0x4a4650),
  smokeDark: col(0x26242c),
  ember: col(0xff7a3c),
  frost: col(0x8fdcff),
  frostDeep: col(0x4f9cff),
  shadow: col(0x120c20),
  red: col(0xff4030),
  redDeep: col(0xb01818),
  blue: col(0x4aa0ff),
  blueDeep: col(0x2060e0),
  green: col(0x9dff7a),
  poison: col(0xb8f060),
  poisonDeep: col(0x4f9a2c),
  black: col(0x000000),
  greenDeep: col(0x1f6a2c),
  /** 野怪预警边(琥珀)与吐息 / 渊蚀的紫青色系(§5.5) */
  amber: col(0xffc24a),
  violet: col(0xa070ff),
  violetHot: col(0xe0c8ff),
  violetDeep: col(0x2a1658),
  abyssCyan: col(0x7ff0e0),
  /** 霜晶(蓝buff)与余烬(红buff)的增益色 */
  frostHot: col(0xd8f4ff),
  emberHot: col(0xffd27a),
  /** 苔孢、蛾鳞粉 */
  spore: col(0xd8e8a0),
  moth: col(0x8ff0e0),
  /** 英雄特效包：夯土 / 碎土块、青铜、弦金、白羽、沙、草屑、石屑、帛(米白)、朱砂 */
  earth: col(0x9a7c58),
  earthDark: col(0x5e4a36),
  bronze: col(0xe0a848),
  stringGold: col(0xffe2a0),
  plume: col(0xfbfaf4),
  sand: col(0xd8c49a),
  sandDark: col(0xa89472),
  grass: col(0xa8c060),
  grassDark: col(0x6f8a3a),
  stone: col(0xd0ccc4),
  stoneDark: col(0x8a8680),
  silk: col(0xf0e6cc),
  silkDark: col(0xb8a67e),
  cinnabar: col(0xc8322a),
  /** 墨(遮挡层用的近黑墨紫) */
  ink: col(0x0e0a16),
};

export interface TeamTheme {
  glow: THREE.Color;
  hot: THREE.Color;
  deep: THREE.Color;
}

const TEAM_THEMES: TeamTheme[] = [
  { glow: col(PALETTE.blue.glow), hot: col(0x8cc8ff), deep: col(PALETTE.blue.dark) },
  { glow: col(PALETTE.red.glow), hot: col(0xffa070), deep: col(PALETTE.red.dark) },
  { glow: col(PALETTE.neutral.glow), hot: col(0xffe08a), deep: col(PALETTE.neutral.dark) },
];

export function teamTheme(team: TeamId): TeamTheme {
  return TEAM_THEMES[team] ?? TEAM_THEMES[2];
}
