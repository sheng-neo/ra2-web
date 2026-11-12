/**
 * 环境染色贴图的盖印(art-v2 §4 L6)：让基地、泉水、塔、河道、营地与各处发光体把颜色「染」到周围的地面、岩壁和单位身上；
 * 树冠下与高崖背光一侧再盖一层天光遮蔽。全部在场景构建时盖完，最后 bake() 一次。
 */
import type { LightTint } from '../engine/lighttint';
import { SUN_SHADOW_DIR } from '../engine/lighting';
import { PALETTE } from '../materials';
import { CAMP_THEME, type MapField, campRadius } from './field';
import { centroid } from './geo';
import type { ScatterResult } from './scatter';
import * as THREE from 'three';

/** 营地主题色(与 camps.ts 的微粒、贴花同一组) */
const CAMP_TINT: Record<number, number> = {
  1: 0x8fd8ff,
  2: 0xff7a2c,
  3: 0xb8d878,
  4: PALETTE.env.amber,
  5: PALETTE.env.violet,
  6: 0xffcf60,
};

const _c = new THREE.Color();

export function stampLightTint(lt: LightTint, field: MapField, scatter: ScatterResult): void {
  const map = field.map;
  lt.clear();
  // 基地(队伍色的大范围弱光) / 泉水 / 塔
  for (const b of map.bases) {
    const glow = b.team === 0 ? PALETTE.blue.glow : PALETTE.red.glow;
    const c = centroid(b.area);
    lt.stamp(c.x, c.y, 18, glow, 0.18);
    lt.stamp(b.fountain.x, b.fountain.y, 6, glow, 0.35);
  }
  for (const t of map.towers) lt.stamp(t.pos.x, t.pos.y, 5, t.team === 0 ? PALETTE.blue.glow : PALETTE.red.glow, 0.2);
  // 河道：沿中心线每隔 3 米盖一个青色斑(同色取最大，连成一条等强度的色带)
  const rl = map.river;
  for (let s = 0; s < rl.length - 1; s++) {
    const a = rl[s];
    const b = rl[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d <= len; d += 3) lt.stamp(a.x + ((b.x - a.x) * d) / len, a.y + ((b.y - a.y) * d) / len, 5.5, PALETTE.env.waterShallow, 0.12);
  }
  // 营地：主题色
  for (const c of map.camps) {
    const theme = CAMP_THEME[c.monsterType];
    const R = campRadius(c.monsterType);
    lt.stamp(c.pos.x, c.pos.y, theme >= 5 ? 8 : theme <= 2 ? 7 : 6, CAMP_TINT[theme], theme === 3 ? 0.12 : 0.25 * (R > 5 ? 1 : 0.9));
  }
  // 发光体：水晶、灯果、星灯柱、火盆…(1.5 倍自身光晕半径)
  for (const g of scatter.glows) {
    _c.setRGB(g.color[0], g.color[1], g.color[2], THREE.LinearSRGBColorSpace);
    lt.stamp(g.x, g.z, Math.max(1.5, g.r * 1.5), _c.getHex(THREE.SRGBColorSpace), 0.3);
  }
  // 草丛内：一点黄绿
  for (const poly of map.bushes) {
    const c = centroid(poly);
    lt.stamp(c.x, c.y, 3, 0xb8cf5a, 0.1);
  }
  // 天光遮蔽：树冠下
  for (const t of scatter.casters) lt.occlude(t.x, t.z, t.radius * 1.5, 0.25);
  // 高崖背光一侧(影子落下去的那边)的崖脚
  for (const w of field.walls) {
    const poly = w.poly;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 1; d < len; d += 2.2) {
        const x = a.x + ((b.x - a.x) * d) / len + SUN_SHADOW_DIR.x * 1.3;
        const z = a.y + ((b.y - a.y) * d) / len + SUN_SHADOW_DIR.y * 1.3;
        if (field.wallDist(x, z, 3) > 0.2) lt.occlude(x, z, 2.2, 0.25);
      }
    }
  }
  lt.bake();
}
