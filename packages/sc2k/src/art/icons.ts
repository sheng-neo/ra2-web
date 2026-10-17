// ===== art/icons.ts =====（spec:ui-art §3.9.2 UI 图标 24×24：1 px Neutral[1] 轮廓、主体色带 i=5、左上 i=7 高光；WP9）
// 字形用填充原语画主体，finish() 自动描边 + 左上高光。id 用 contracts/render.UiIconId；子工具按 data/tools.TOOLS 下标。
import type { IndexedBitmap } from '../contracts/render';
import { MAP_LAYER_MODES, UiIconId } from '../contracts/render';
import { TOOLS } from '../data/tools';
import { IDX, RAMP_BASE, Ramp, ci } from './palette';
import { fillEllipse, fillPoly, fillRect, line, newBitmap, setPx, strokeEllipse } from './raster';

export const ICON_SIZE = 24;
type B = IndexedBitmap;
const N = (i: number): number => ci(Ramp.Neutral, i);
const c5 = (r: Ramp): number => ci(r, 5);

/** 自动描边（Neutral[1]）与左上高光（同色带 +2 阶）。 */
function finish(b: B): B {
  const src = new Uint8Array(b.data);
  const W = b.w;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < W; x++) {
    const v = src[y * W + x]!;
    if (v === 0) {
      const n = (x > 0 && src[y * W + x - 1]! !== 0) || (x + 1 < W && src[y * W + x + 1]! !== 0) || (y > 0 && src[(y - 1) * W + x]! !== 0) || (y + 1 < b.h && src[(y + 1) * W + x]! !== 0);
      if (n) b.data[y * W + x] = N(1);
    } else if (v >= RAMP_BASE && v < RAMP_BASE + 128 && (v - RAMP_BASE) % 8 <= 5) {
      const up = y > 0 ? src[(y - 1) * W + x]! : 0, left = x > 0 ? src[y * W + x - 1]! : 0;
      if ((up === 0 || up !== v) && (left === 0 || left !== v) && up !== N(1)) b.data[y * W + x] = v + 2;
    }
  }
  return b;
}
const nb = (): B => newBitmap(ICON_SIZE, ICON_SIZE, 0, 0);
const R = (b: B, x: number, y: number, w: number, h: number, c: number): void => fillRect(b, x, y, w, h, c);
const E = (b: B, cx: number, cy: number, rx: number, ry: number, c: number): void => fillEllipse(b, cx, cy, rx, ry, c);
const P = (b: B, pts: number[], c: number): void => fillPoly(b, pts, c);
const L = (b: B, x0: number, y0: number, x1: number, y1: number, c: number, lw = 1): void => line(b, x0, y0, x1, y1, c, lw);

// ---- 基础字形 ----
function house(b: B, x: number, y: number, w: number, h: number, wall: number, roof: number): void { R(b, x, y + h * 0.4, w, h * 0.6, wall); P(b, [x - 1, y + h * 0.42, x + w / 2, y, x + w + 1, y + h * 0.42], roof); R(b, x + w * 0.4, y + h * 0.7, w * 0.2, h * 0.3, N(2)); }
function tree(b: B, cx: number, base: number, s: number): void { R(b, cx - s * 0.12, base - s * 0.35, Math.max(1, s * 0.25), s * 0.35, ci(Ramp.Earth, 2)); E(b, cx, base - s * 0.6, s * 0.45, s * 0.35, ci(Ramp.Forest, 4)); E(b, cx - s * 0.1, base - s * 0.75, s * 0.3, s * 0.25, ci(Ramp.Forest, 5)); }
function drop(b: B, cx: number, cy: number, r: number, c: number): void { E(b, cx, cy + r * 0.3, r, r, c); P(b, [cx - r + 1, cy + r * 0.1, cx + r - 1, cy + r * 0.1, cx, cy - r * 1.4], c); }
function bolt(b: B, cx: number, cy: number, c: number): void { P(b, [cx + 2, cy - 9, cx - 5, cy + 1, cx - 1, cy + 1, cx - 3, cy + 9, cx + 5, cy - 2, cx + 1, cy - 2], c); }
function roadGlyph(b: B, c: number): void { P(b, [1, 17, 16, 2, 22, 8, 7, 23], c); for (let k = 0; k < 4; k++) { setPx(b, 8 + k * 3, 15 - k * 3, N(6)); setPx(b, 9 + k * 3, 14 - k * 3, N(6)); } }
function factory(b: B, x: number, y: number, w: number, c: number): void { R(b, x, y + 8, w, 8, c); P(b, [x, y + 9, x + w * 0.33, y + 4, x + w * 0.33, y + 9], c); P(b, [x + w * 0.33, y + 9, x + w * 0.66, y + 4, x + w * 0.66, y + 9], c); P(b, [x + w * 0.66, y + 9, x + w, y + 4, x + w, y + 9], c); R(b, x + w - 4, y - 2, 3, 8, ci(Ramp.Brick, 4)); }
function shop(b: B, x: number, y: number, w: number, c: number): void { R(b, x, y + 5, w, 11, c); R(b, x - 1, y + 3, w + 2, 3, ci(Ramp.Signal, 5)); for (let k = 0; k < Math.floor(w / 4); k++) R(b, x + 1 + k * 4, y + 8, 2, 4, ci(Ramp.Glass, 6)); }
function magnifier(b: B, sym?: '+' | '-'): void { strokeEllipse(b, 10, 10, 7, 7, N(1)); E(b, 10, 10, 6, 6, ci(Ramp.Glass, 5)); L(b, 15, 15, 21, 21, N(2), 2); if (sym) { R(b, 7, 9.5, 7, 2, N(1)); if (sym === '+') R(b, 9.5, 7, 2, 7, N(1)); } }
function arrowArc(b: B, cw: boolean, c: number): void { strokeEllipse(b, 12, 12, 8, 8, c); strokeEllipse(b, 12, 12, 7, 7, c); R(b, cw ? 12 : 4, 3, 8, 9, 0); if (cw) P(b, [12, 2, 18, 6, 12, 10], c); else P(b, [12, 2, 6, 6, 12, 10], c); }
function person(b: B, cx: number, base: number, c: number): void { E(b, cx, base - 9, 2, 2, c); R(b, cx - 2, base - 7, 5, 7, c); }
function eye(b: B): void { P(b, [2, 12, 8, 6, 16, 6, 22, 12, 16, 18, 8, 18], N(7)); E(b, 12, 12, 3, 3, ci(Ramp.Water, 3)); }
function chimneySmoke(b: B, x: number, y: number): void { R(b, x, y, 3, 10, ci(Ramp.Brick, 4)); E(b, x + 2, y - 3, 3, 2, IDX.SmokeBase + 5); E(b, x + 5, y - 6, 2, 2, IDX.SmokeBase + 6); }
function star(b: B, cx: number, cy: number, r: number, c: number): void { P(b, [cx, cy - r, cx + r * 0.3, cy - r * 0.3, cx + r, cy - r * 0.25, cx + r * 0.45, cy + r * 0.2, cx + r * 0.6, cy + r, cx, cy + r * 0.5, cx - r * 0.6, cy + r, cx - r * 0.45, cy + r * 0.2, cx - r, cy - r * 0.25, cx - r * 0.3, cy - r * 0.3], c); }
function cross(b: B, cx: number, cy: number, s: number, c: number): void { R(b, cx - s * 0.3, cy - s, s * 0.6, s * 2, c); R(b, cx - s, cy - s * 0.3, s * 2, s * 0.6, c); }
function dollar(b: B, c: number): void { R(b, 8, 6, 9, 2, c); R(b, 7, 8, 2, 4, c); R(b, 8, 11, 9, 2, c); R(b, 15, 13, 2, 4, c); R(b, 7, 16, 9, 2, c); R(b, 11, 4, 2, 16, c); }
function barChart(b: B): void { R(b, 3, 20, 18, 1, N(2)); R(b, 4, 12, 3, 8, ci(Ramp.Water, 5)); R(b, 9, 7, 3, 13, ci(Ramp.Signal, 5)); R(b, 14, 10, 3, 10, ci(Ramp.Amber, 5)); L(b, 4, 14, 17, 5, N(7)); }
function signpost(b: B, plate: number): void { R(b, 11, 8, 2, 14, ci(Ramp.Earth, 3)); R(b, 4, 3, 16, 7, plate); R(b, 6, 5, 12, 1, N(2)); R(b, 6, 7, 8, 1, N(2)); }

/** 字形表：名字 → 画法。 */
const GLYPHS: Readonly<Record<string, (b: B) => void>> = {
  bulldozer: (b) => { R(b, 4, 10, 11, 6, ci(Ramp.Amber, 5)); R(b, 6, 6, 6, 4, ci(Ramp.Amber, 5)); R(b, 16, 6, 3, 12, N(5)); E(b, 7, 18, 3, 3, N(2)); E(b, 13, 18, 3, 3, N(2)); R(b, 17, 4, 2, 2, ci(Ramp.Glass, 6)); },
  level: (b) => { P(b, [2, 18, 8, 10, 14, 14, 20, 8, 22, 12, 22, 20, 2, 20], ci(Ramp.Earth, 4)); R(b, 2, 9, 20, 2, N(7)); },
  raise: (b) => { P(b, [2, 20, 12, 8, 22, 20], ci(Ramp.Earth, 4)); P(b, [12, 2, 8, 7, 16, 7], ci(Ramp.Amber, 6)); R(b, 11, 6, 2, 4, ci(Ramp.Amber, 6)); },
  lower: (b) => { P(b, [2, 12, 22, 12, 22, 20, 2, 20], ci(Ramp.Earth, 4)); P(b, [12, 10, 8, 5, 16, 5], ci(Ramp.Amber, 6)); R(b, 11, 2, 2, 4, ci(Ramp.Amber, 6)); },
  dezone: (b) => { R(b, 4, 4, 16, 16, N(6)); L(b, 7, 7, 17, 17, ci(Ramp.Signal, 5), 2); L(b, 17, 7, 7, 17, ci(Ramp.Signal, 5), 2); },
  tree: (b) => { tree(b, 12, 22, 20); },
  drop: (b) => { drop(b, 12, 12, 7, ci(Ramp.Water, 5)); },
  shield: (b) => { P(b, [5, 4, 19, 4, 19, 12, 12, 21, 5, 12], ci(Ramp.Water, 5)); star(b, 12, 11, 4, N(7)); },
  helmet: (b) => { E(b, 12, 12, 9, 6, ci(Ramp.Signal, 5)); E(b, 12, 9, 6, 6, ci(Ramp.Signal, 5)); R(b, 11, 4, 2, 6, ci(Ramp.Amber, 6)); },
  star: (b) => { star(b, 12, 12, 10, ci(Ramp.Olive, 5)); },
  siren: (b) => { R(b, 6, 14, 12, 5, N(5)); E(b, 12, 12, 6, 6, ci(Ramp.Signal, 5)); L(b, 3, 8, 6, 10, ci(Ramp.Amber, 6)); L(b, 21, 8, 18, 10, ci(Ramp.Amber, 6)); L(b, 12, 2, 12, 5, ci(Ramp.Amber, 6)); },
  pole: (b) => { R(b, 11, 4, 2, 18, ci(Ramp.Rust, 3)); R(b, 6, 6, 12, 2, ci(Ramp.Rust, 3)); L(b, 2, 8, 6, 7, N(2)); L(b, 18, 7, 22, 8, N(2)); setPx(b, 6, 5, ci(Ramp.Glass, 6)); setPx(b, 17, 5, ci(Ramp.Glass, 6)); },
  bolt: (b) => { bolt(b, 12, 12, ci(Ramp.Amber, 6)); },
  coal: (b) => { R(b, 4, 12, 16, 9, c5(Ramp.WarmGray)); chimneySmoke(b, 6, 4); chimneySmoke(b, 12, 6); },
  dam: (b) => { P(b, [3, 8, 21, 8, 18, 20, 6, 20], c5(Ramp.WarmGray)); R(b, 3, 4, 18, 4, ci(Ramp.Water, 4)); R(b, 8, 14, 2, 6, ci(Ramp.Water, 7)); R(b, 14, 14, 2, 6, ci(Ramp.Water, 7)); },
  derrick: (b) => { P(b, [9, 21, 15, 21, 13, 3, 11, 3], ci(Ramp.Rust, 4)); L(b, 9, 10, 15, 10, N(2)); L(b, 9, 15, 15, 15, N(2)); E(b, 6, 19, 3, 2, N(1)); },
  flame: (b) => { E(b, 12, 15, 6, 6, ci(Ramp.Amber, 5)); P(b, [6, 15, 18, 15, 12, 2], ci(Ramp.Amber, 5)); E(b, 12, 16, 3, 3, ci(Ramp.Amber, 7)); },
  trefoil: (b) => { E(b, 12, 12, 9, 9, ci(Ramp.Amber, 6)); E(b, 12, 12, 2, 2, N(1)); E(b, 12, 6, 3, 3, N(1)); E(b, 7, 15, 3, 3, N(1)); E(b, 17, 15, 3, 3, N(1)); },
  turbine: (b) => { R(b, 11, 10, 2, 12, N(6)); L(b, 12, 10, 12, 2, N(7), 2); L(b, 12, 10, 19, 14, N(7), 2); L(b, 12, 10, 5, 14, N(7), 2); E(b, 12, 10, 2, 2, ci(Ramp.Signal, 5)); },
  panel: (b) => { P(b, [3, 16, 9, 6, 21, 6, 15, 16], ci(Ramp.Glass, 5)); L(b, 6, 11, 18, 11, ci(Ramp.Glass, 3)); L(b, 12, 6, 9, 16, ci(Ramp.Glass, 3)); R(b, 11, 16, 2, 5, N(4)); },
  dish: (b) => { E(b, 12, 11, 9, 6, ci(Ramp.Glass, 5)); E(b, 11, 10, 5, 3, ci(Ramp.Glass, 7)); R(b, 11, 14, 2, 7, N(4)); R(b, 7, 20, 10, 2, N(4)); setPx(b, 12, 8, ci(Ramp.Signal, 5)); },
  ring: (b) => { E(b, 12, 12, 9, 6, c5(Ramp.Violet)); E(b, 12, 12, 4, 2, 0); E(b, 12, 8, 3, 3, ci(Ramp.Violet, 7)); },
  pipe: (b) => { R(b, 3, 10, 12, 4, c5(Ramp.Teal)); R(b, 11, 10, 4, 11, c5(Ramp.Teal)); R(b, 9, 8, 8, 2, ci(Ramp.Teal, 3)); R(b, 3, 11, 12, 1, ci(Ramp.Water, 6)); },
  pump: (b) => { R(b, 5, 10, 10, 10, ci(Ramp.Water, 4)); R(b, 15, 13, 6, 3, c5(Ramp.Teal)); E(b, 10, 10, 4, 2, ci(Ramp.Teal, 4)); },
  watertower: (b) => { L(b, 7, 22, 9, 10, N(4)); L(b, 17, 22, 15, 10, N(4)); R(b, 6, 6, 12, 7, N(6)); E(b, 12, 6, 6, 2, N(7)); R(b, 6, 9, 12, 2, ci(Ramp.Water, 6)); },
  basin: (b) => { R(b, 3, 4, 18, 16, c5(Ramp.Teal)); E(b, 8, 10, 3, 3, ci(Ramp.Water, 4)); E(b, 16, 10, 3, 3, ci(Ramp.Water, 4)); E(b, 8, 16, 3, 3, ci(Ramp.Water, 4)); E(b, 16, 16, 3, 3, ci(Ramp.Water, 4)); },
  desal: (b) => { R(b, 8, 4, 10, 10, c5(Ramp.Teal)); for (let k = 0; k < 4; k++) { setPx(b, 3 + k * 5, 18, ci(Ramp.Water, 6)); setPx(b, 4 + k * 5, 17, ci(Ramp.Water, 6)); setPx(b, 5 + k * 5, 18, ci(Ramp.Water, 6)); setPx(b, 6 + k * 5, 19, ci(Ramp.Water, 6)); } R(b, 4, 9, 4, 2, ci(Ramp.Teal, 3)); },
  mansion: (b) => { house(b, 4, 6, 16, 14, c5(Ramp.Neutral), c5(Ramp.Brick)); star(b, 12, 4, 3, ci(Ramp.Amber, 6)); },
  domehall: (b) => { R(b, 3, 12, 18, 9, N(6)); E(b, 12, 12, 6, 5, N(6)); for (let k = 0; k < 4; k++) R(b, 5 + k * 4, 14, 1, 6, N(7)); R(b, 11, 4, 2, 4, N(6)); },
  statue: (b) => { R(b, 6, 17, 12, 4, N(5)); R(b, 10, 7, 4, 10, N(3)); E(b, 12, 5, 2, 2, N(3)); R(b, 14, 3, 1, 8, ci(Ramp.Amber, 6)); },
  bigdome: (b) => { E(b, 12, 16, 10, 9, c5(Ramp.Amber)); R(b, 0, 17, 24, 7, 0); R(b, 2, 16, 20, 4, ci(Ramp.Amber, 3)); for (let k = 0; k < 4; k++) L(b, 12, 7, 4 + k * 5, 16, ci(Ramp.Amber, 3)); },
  pyramid: (b) => { P(b, [2, 20, 22, 20, 18, 14, 6, 14], c5(Ramp.WarmGray)); P(b, [6, 14, 18, 14, 15, 8, 9, 8], ci(Ramp.WarmGray, 4)); P(b, [9, 8, 15, 8, 12, 3], ci(Ramp.WarmGray, 3)); },
  glassdome: (b) => { R(b, 3, 17, 18, 4, N(5)); E(b, 12, 17, 9, 9, ci(Ramp.Glass, 5)); R(b, 0, 18, 24, 6, 0); E(b, 12, 17, 5, 4, ci(Ramp.Forest, 4)); },
  towers: (b) => { R(b, 4, 10, 5, 11, c5(Ramp.Violet)); R(b, 10, 4, 5, 17, ci(Ramp.Violet, 4)); R(b, 16, 8, 5, 13, c5(Ramp.Violet)); E(b, 12, 4, 2, 1, ci(Ramp.Violet, 7)); },
  rocket: (b) => { R(b, 9, 8, 6, 12, N(6)); P(b, [9, 8, 15, 8, 12, 2], N(7)); P(b, [9, 20, 6, 22, 9, 14], N(5)); P(b, [15, 20, 18, 22, 15, 14], N(5)); R(b, 10, 20, 4, 2, ci(Ramp.Amber, 6)); },
  road: (b) => { roadGlyph(b, ci(Ramp.Asphalt, 3)); },
  highway: (b) => { roadGlyph(b, ci(Ramp.Asphalt, 4)); P(b, [1, 17, 4, 14, 10, 20, 7, 23], N(5)); },
  tunnel: (b) => { R(b, 3, 10, 18, 11, ci(Ramp.Earth, 3)); E(b, 12, 12, 6, 6, ci(Ramp.Earth, 3)); E(b, 12, 13, 4, 4, N(1)); R(b, 8, 13, 8, 8, N(1)); R(b, 10, 17, 4, 4, ci(Ramp.Asphalt, 3)); },
  ramp: (b) => { P(b, [2, 20, 22, 20, 22, 6, 14, 20], ci(Ramp.Asphalt, 4)); R(b, 2, 17, 10, 3, ci(Ramp.Asphalt, 3)); },
  bus: (b) => { R(b, 3, 8, 18, 10, ci(Ramp.Amber, 5)); R(b, 5, 10, 14, 3, ci(Ramp.Glass, 6)); E(b, 7, 19, 2, 2, N(1)); E(b, 17, 19, 2, 2, N(1)); },
  rail: (b) => { for (let k = 0; k < 5; k++) R(b, 4 + k * 3, 6, 2, 12, ci(Ramp.Rust, 3)); R(b, 2, 8, 20, 1, N(6)); R(b, 2, 15, 20, 1, N(6)); },
  subway: (b) => { E(b, 12, 12, 9, 9, N(5)); E(b, 12, 12, 7, 7, N(1)); R(b, 7, 11, 10, 2, N(7)); R(b, 7, 9, 10, 1, N(7)); R(b, 7, 14, 10, 1, N(7)); },
  depot: (b) => { house(b, 3, 4, 18, 12, c5(Ramp.Brick), ci(Ramp.Asphalt, 3)); R(b, 2, 18, 20, 1, N(6)); R(b, 2, 21, 20, 1, N(6)); for (let k = 0; k < 5; k++) R(b, 3 + k * 4, 17, 2, 6, ci(Ramp.Rust, 3)); },
  stairs: (b) => { R(b, 3, 4, 18, 16, N(4)); for (let k = 0; k < 4; k++) R(b, 5 + k * 3, 7 + k * 3, 14 - k * 3, 3, N(6 - (k & 1))); },
  subrail: (b) => { R(b, 2, 8, 12, 1, N(6)); R(b, 2, 12, 12, 1, N(6)); for (let k = 0; k < 3; k++) R(b, 3 + k * 4, 7, 2, 7, ci(Ramp.Rust, 3)); P(b, [13, 6, 22, 6, 22, 20, 13, 14], N(2)); },
  anchor: (b) => { E(b, 12, 5, 2, 2, ci(Ramp.Water, 5)); R(b, 11, 7, 2, 12, ci(Ramp.Water, 5)); R(b, 7, 10, 10, 2, ci(Ramp.Water, 5)); strokeEllipse(b, 12, 15, 7, 6, ci(Ramp.Water, 5)); R(b, 4, 5, 16, 10, 0); R(b, 11, 7, 2, 12, ci(Ramp.Water, 5)); R(b, 7, 10, 10, 2, ci(Ramp.Water, 5)); E(b, 12, 5, 2, 2, ci(Ramp.Water, 5)); },
  plane: (b) => { P(b, [12, 2, 15, 8, 22, 12, 22, 14, 14, 12, 14, 18, 17, 20, 17, 21, 12, 20, 7, 21, 7, 20, 10, 18, 10, 12, 2, 14, 2, 12, 9, 8], N(7)); },
  houseL: (b) => { house(b, 5, 6, 14, 14, c5(Ramp.Brick), ci(Ramp.Earth, 3)); setPx(b, 21, 21, IDX.ZoneR); },
  houseD: (b) => { R(b, 3, 8, 8, 13, c5(Ramp.Brick)); R(b, 12, 4, 9, 17, ci(Ramp.Brick, 4)); for (let k = 0; k < 3; k++) { R(b, 14, 6 + k * 4, 2, 2, ci(Ramp.Amber, 6)); R(b, 18, 6 + k * 4, 2, 2, ci(Ramp.Glass, 2)); R(b, 5, 10 + k * 4, 2, 2, ci(Ramp.Amber, 6)); } },
  shopL: (b) => { shop(b, 4, 6, 16, c5(Ramp.WarmGray)); },
  shopD: (b) => { R(b, 3, 3, 9, 18, ci(Ramp.Glass, 4)); R(b, 13, 7, 8, 14, c5(Ramp.WarmGray)); for (let k = 0; k < 4; k++) { R(b, 5, 5 + k * 4, 2, 2, ci(Ramp.Amber, 6)); R(b, 8, 5 + k * 4, 2, 2, ci(Ramp.Glass, 2)); } R(b, 13, 5, 8, 2, ci(Ramp.Signal, 5)); },
  factoryL: (b) => { factory(b, 3, 6, 18, c5(Ramp.Rust)); },
  factoryD: (b) => { factory(b, 2, 8, 20, c5(Ramp.Rust)); chimneySmoke(b, 4, 2); chimneySmoke(b, 9, 4); },
  school: (b) => { R(b, 3, 10, 18, 10, c5(Ramp.Brick)); P(b, [9, 10, 15, 10, 12, 5], ci(Ramp.Brick, 4)); E(b, 12, 8, 1.5, 1.5, ci(Ramp.Amber, 6)); R(b, 6, 13, 3, 3, ci(Ramp.Glass, 6)); R(b, 15, 13, 3, 3, ci(Ramp.Glass, 6)); R(b, 11, 15, 2, 5, N(2)); },
  college: (b) => { P(b, [2, 9, 12, 4, 22, 9, 12, 14], N(2)); R(b, 7, 10, 10, 6, N(2)); R(b, 20, 9, 1, 7, ci(Ramp.Amber, 6)); R(b, 6, 16, 12, 2, ci(Ramp.Brick, 4)); },
  book: (b) => { R(b, 3, 5, 9, 15, c5(Ramp.Brick)); R(b, 12, 5, 9, 15, ci(Ramp.Brick, 4)); R(b, 5, 7, 5, 11, N(7)); R(b, 14, 7, 5, 11, N(7)); for (let k = 0; k < 4; k++) { R(b, 6, 9 + k * 2, 3, 1, N(3)); R(b, 15, 9 + k * 2, 3, 1, N(3)); } },
  columns: (b) => { P(b, [2, 9, 12, 3, 22, 9], c5(Ramp.Sand)); R(b, 3, 9, 18, 2, c5(Ramp.Sand)); for (let k = 0; k < 4; k++) R(b, 4 + k * 5, 11, 2, 8, N(7)); R(b, 2, 19, 20, 2, N(5)); },
  shieldbld: (b) => { R(b, 3, 10, 18, 11, N(5)); P(b, [8, 3, 16, 3, 16, 8, 12, 12, 8, 8], ci(Ramp.Water, 5)); R(b, 10, 16, 4, 5, N(2)); },
  firebld: (b) => { R(b, 3, 8, 18, 13, c5(Ramp.Brick)); R(b, 5, 13, 4, 8, ci(Ramp.Signal, 4)); R(b, 10, 13, 4, 8, ci(Ramp.Signal, 4)); R(b, 15, 13, 4, 8, ci(Ramp.Signal, 4)); R(b, 16, 2, 3, 6, c5(Ramp.Brick)); },
  cross: (b) => { R(b, 3, 6, 18, 15, N(6)); cross(b, 12, 13, 5, ci(Ramp.Signal, 5)); },
  bars: (b) => { R(b, 3, 4, 18, 16, N(4)); for (let k = 0; k < 4; k++) R(b, 5 + k * 4, 5, 2, 14, N(1)); R(b, 4, 11, 16, 1, N(1)); },
  parktree: (b) => { R(b, 2, 20, 20, 2, ci(Ramp.Grass, 5)); tree(b, 10, 20, 18); R(b, 16, 17, 5, 2, ci(Ramp.Rust, 3)); },
  parktrees: (b) => { R(b, 2, 20, 20, 2, ci(Ramp.Grass, 5)); tree(b, 7, 20, 15); tree(b, 17, 21, 17); },
  paw: (b) => { R(b, 2, 20, 20, 2, ci(Ramp.Grass, 5)); for (let k = 0; k < 5; k++) R(b, 3 + k * 4, 8, 1, 12, ci(Ramp.Rust, 3)); R(b, 3, 8, 17, 1, ci(Ramp.Rust, 3)); E(b, 11, 15, 3, 2, ci(Ramp.Earth, 2)); E(b, 10, 13, 1.5, 1.5, ci(Ramp.Earth, 2)); },
  oval: (b) => { E(b, 12, 13, 10, 7, N(5)); E(b, 12, 13, 7, 4, ci(Ramp.Grass, 5)); L(b, 12, 10, 12, 16, N(7)); },
  boat: (b) => { P(b, [3, 14, 21, 14, 18, 19, 6, 19], ci(Ramp.Rust, 4)); R(b, 12, 3, 1, 11, N(2)); P(b, [13, 4, 13, 13, 20, 13], N(7)); P(b, [11, 6, 11, 13, 6, 13], N(7)); },
  signpost: (b) => { signpost(b, N(7)); },
  magnifier: (b) => { magnifier(b); },
  ribbon: (b) => { E(b, 12, 9, 7, 7, ci(Ramp.Amber, 5)); star(b, 12, 9, 4, N(7)); P(b, [8, 14, 11, 15, 9, 22, 6, 19], ci(Ramp.Signal, 5)); P(b, [16, 14, 13, 15, 15, 22, 18, 19], ci(Ramp.Signal, 5)); },
  rotccw: (b) => { arrowArc(b, false, N(6)); },
  rotcw: (b) => { arrowArc(b, true, N(6)); },
  zoomout: (b) => { magnifier(b, '-'); },
  zoomin: (b) => { magnifier(b, '+'); },
  crosshair: (b) => { strokeEllipse(b, 12, 12, 7, 7, N(6)); R(b, 11, 2, 2, 20, N(6)); R(b, 2, 11, 20, 2, N(6)); R(b, 9, 9, 6, 6, 0); E(b, 12, 12, 1.5, 1.5, ci(Ramp.Signal, 5)); },
  question: (b) => { E(b, 12, 8, 6, 6, N(7)); E(b, 12, 8, 3, 3, 0); R(b, 6, 8, 5, 6, 0); R(b, 11, 11, 3, 5, N(7)); R(b, 11, 18, 3, 3, N(7)); },
  map: (b) => { P(b, [2, 5, 9, 3, 15, 5, 22, 3, 22, 19, 15, 21, 9, 19, 2, 21], ci(Ramp.Grass, 5)); L(b, 9, 3, 9, 19, ci(Ramp.Grass, 3)); L(b, 15, 5, 15, 21, ci(Ramp.Grass, 3)); E(b, 6, 12, 2, 2, ci(Ramp.Water, 5)); R(b, 16, 8, 5, 3, ci(Ramp.Asphalt, 3)); },
  graph: (b) => { barChart(b); },
  people: (b) => { person(b, 6, 20, c5(Ramp.Brick)); person(b, 12, 18, c5(Ramp.Teal)); person(b, 18, 20, c5(Ramp.Violet)); },
  pie: (b) => { E(b, 12, 12, 9, 9, ci(Ramp.Amber, 5)); P(b, [12, 12, 12, 3, 21, 12], ci(Ramp.Water, 5)); P(b, [12, 12, 21, 12, 17, 19], ci(Ramp.Signal, 5)); },
  quad: (b) => { R(b, 3, 3, 8, 8, c5(Ramp.Brick)); R(b, 13, 3, 8, 8, c5(Ramp.Teal)); R(b, 3, 13, 8, 8, c5(Ramp.Olive)); R(b, 13, 13, 8, 8, c5(Ramp.Violet)); E(b, 12, 12, 3, 3, N(7)); },
  dollar: (b) => { dollar(b, ci(Ramp.Amber, 6)); },
  eyebld: (b) => { eye(b); R(b, 16, 14, 6, 8, c5(Ramp.WarmGray)); R(b, 18, 10, 3, 4, c5(Ramp.WarmGray)); },
  eyesign: (b) => { eye(b); R(b, 15, 13, 7, 5, N(7)); R(b, 18, 18, 1, 4, ci(Ramp.Earth, 3)); },
  eyeinfra: (b) => { eye(b); bolt(b, 18, 16, ci(Ramp.Amber, 6)); },
  eyezone: (b) => { eye(b); R(b, 14, 15, 3, 3, IDX.ZoneR); R(b, 17, 15, 3, 3, IDX.ZoneC); R(b, 20, 15, 3, 3, IDX.ZoneI); },
  eyeund: (b) => { eye(b); R(b, 2, 19, 20, 3, ci(Ramp.Earth, 3)); R(b, 6, 20, 12, 1, c5(Ramp.Teal)); },
  gotoarrow: (b) => { P(b, [12, 2, 21, 12, 15, 12, 15, 21, 9, 21, 9, 12, 3, 12], ci(Ramp.Signal, 5)); },
  rcibase: (b) => { R(b, 2, 20, 20, 2, N(5)); R(b, 4, 12, 4, 8, IDX.ZoneR); R(b, 10, 8, 4, 12, IDX.ZoneC); R(b, 16, 14, 4, 6, IDX.ZoneI); },
  close: (b) => { L(b, 5, 5, 18, 18, N(7), 2); L(b, 18, 5, 5, 18, N(7), 2); },
  minimize: (b) => { R(b, 5, 15, 14, 3, N(7)); },
  pin: (b) => { E(b, 12, 8, 5, 5, ci(Ramp.Signal, 5)); P(b, [7, 10, 17, 10, 14, 14, 10, 14], ci(Ramp.Signal, 4)); R(b, 11, 14, 2, 8, N(3)); },
  // 速度 1..5（1 = 暂停）
  speed0: (b) => { R(b, 7, 5, 4, 14, N(7)); R(b, 13, 5, 4, 14, N(7)); },
  speed1: (b) => { P(b, [7, 4, 19, 12, 7, 20], N(7)); },
  speed2: (b) => { P(b, [3, 4, 12, 12, 3, 20], N(7)); P(b, [12, 4, 21, 12, 12, 20], N(7)); },
  speed3: (b) => { P(b, [2, 5, 9, 12, 2, 19], N(7)); P(b, [9, 5, 16, 12, 9, 19], N(7)); P(b, [16, 5, 23, 12, 16, 19], N(7)); },
  speed4: (b) => { P(b, [2, 5, 9, 12, 2, 19], ci(Ramp.Amber, 6)); P(b, [9, 5, 16, 12, 9, 19], ci(Ramp.Amber, 6)); P(b, [16, 5, 23, 12, 16, 19], ci(Ramp.Amber, 6)); R(b, 2, 2, 20, 1, ci(Ramp.Amber, 6)); },
  // 天气 12
  wCold: (b) => { R(b, 10, 3, 4, 14, N(7)); E(b, 12, 18, 4, 4, N(7)); R(b, 11, 13, 2, 5, ci(Ramp.Water, 5)); E(b, 12, 18, 2, 2, ci(Ramp.Water, 5)); },
  wClear: (b) => { E(b, 12, 12, 6, 6, ci(Ramp.Amber, 6)); for (const [x0, y0, x1, y1] of [[12, 1, 12, 4], [12, 20, 12, 23], [1, 12, 4, 12], [20, 12, 23, 12], [4, 4, 6, 6], [18, 18, 20, 20], [18, 4, 20, 6], [4, 18, 6, 20]] as const) L(b, x0, y0, x1, y1, ci(Ramp.Amber, 6)); },
  wHot: (b) => { R(b, 10, 3, 4, 14, N(7)); E(b, 12, 18, 4, 4, N(7)); R(b, 11, 5, 2, 13, ci(Ramp.Signal, 5)); E(b, 12, 18, 2, 2, ci(Ramp.Signal, 5)); },
  wFog: (b) => { for (let k = 0; k < 4; k++) R(b, 3 + (k & 1) * 2, 6 + k * 4, 16, 2, N(6)); },
  wChilly: (b) => { for (const [x0, y0, x1, y1] of [[12, 6, 12, 18], [7, 9, 17, 15], [17, 9, 7, 15]] as const) L(b, x0, y0, x1, y1, ci(Ramp.Glass, 7)); },
  wOvercast: (b) => { E(b, 9, 14, 6, 4, N(6)); E(b, 14, 11, 6, 5, N(6)); E(b, 16, 14, 5, 4, N(6)); R(b, 4, 14, 16, 4, N(6)); },
  wSnow: (b) => { E(b, 12, 9, 7, 4, N(6)); R(b, 5, 9, 14, 3, N(6)); for (let k = 0; k < 4; k++) setPx(b, 6 + k * 4, 16 + (k & 1) * 3, N(7)); },
  wRain: (b) => { E(b, 12, 8, 7, 4, N(6)); R(b, 5, 8, 14, 3, N(6)); for (let k = 0; k < 4; k++) L(b, 7 + k * 3, 14, 6 + k * 3, 19, ci(Ramp.Water, 6)); },
  wWindy: (b) => { for (let k = 0; k < 3; k++) { R(b, 3, 7 + k * 5, 12 + k * 2, 2, N(7)); setPx(b, 16 + k * 2, 6 + k * 5, N(7)); } },
  wBlizzard: (b) => { for (let k = 0; k < 3; k++) R(b, 3, 6 + k * 5, 14, 2, N(7)); for (let k = 0; k < 5; k++) setPx(b, 4 + k * 4, 19 - (k & 1) * 2, ci(Ramp.Glass, 7)); },
  wHurricane: (b) => { strokeEllipse(b, 12, 12, 9, 9, N(7)); strokeEllipse(b, 12, 12, 8, 8, N(7)); R(b, 3, 3, 9, 9, 0); R(b, 12, 12, 10, 10, 0); E(b, 12, 12, 3, 3, ci(Ramp.Signal, 5)); P(b, [12, 3, 12, 6, 6, 6], N(7)); P(b, [12, 21, 12, 18, 18, 18], N(7)); },
  wTornado: (b) => { P(b, [3, 3, 21, 3, 15, 10, 14, 16, 12, 21, 10, 16, 9, 10], N(6)); R(b, 6, 5, 12, 2, N(7)); },
  // Map 图层 15
  mStructures: (b) => { R(b, 3, 10, 6, 11, c5(Ramp.Brick)); R(b, 10, 5, 5, 16, c5(Ramp.Glass)); R(b, 16, 12, 5, 9, c5(Ramp.Rust)); },
  mZones: (b) => { R(b, 3, 3, 8, 8, IDX.ZoneR); R(b, 13, 3, 8, 8, IDX.ZoneC); R(b, 3, 13, 8, 8, IDX.ZoneI); R(b, 13, 13, 8, 8, N(5)); },
  mTransport: (b) => { roadGlyph(b, ci(Ramp.Asphalt, 3)); for (let k = 0; k < 3; k++) R(b, 3 + k * 7, 3, 2, 5, ci(Ramp.Rust, 3)); },
  mPower: (b) => { bolt(b, 12, 12, ci(Ramp.Amber, 6)); },
  mWater: (b) => { drop(b, 12, 12, 7, ci(Ramp.Water, 5)); },
  mPop: (b) => { person(b, 6, 20, N(6)); person(b, 12, 18, N(6)); person(b, 18, 20, N(6)); },
  mGrowth: (b) => { P(b, [12, 3, 21, 12, 15, 12, 15, 21, 9, 21, 9, 12, 3, 12], IDX.ZoneR); },
  mTraffic: (b) => { R(b, 3, 10, 9, 5, ci(Ramp.Signal, 5)); R(b, 13, 12, 8, 5, ci(Ramp.Water, 5)); E(b, 5, 16, 1.5, 1.5, N(1)); E(b, 10, 16, 1.5, 1.5, N(1)); E(b, 15, 18, 1.5, 1.5, N(1)); E(b, 19, 18, 1.5, 1.5, N(1)); },
  mPollution: (b) => { R(b, 10, 12, 4, 9, ci(Ramp.Brick, 4)); E(b, 12, 9, 4, 3, IDX.SmokeBase + 4); E(b, 15, 6, 4, 3, IDX.SmokeBase + 5); E(b, 10, 5, 3, 2, IDX.SmokeBase + 6); },
  mCrime: (b) => { E(b, 12, 12, 8, 6, N(2)); E(b, 9, 11, 2, 2, N(7)); E(b, 15, 11, 2, 2, N(7)); R(b, 4, 15, 16, 2, N(2)); },
  mLandValue: (b) => { dollar(b, IDX.ZoneR); },
  mPolice: (b) => { P(b, [5, 4, 19, 4, 19, 12, 12, 21, 5, 12], ci(Ramp.Water, 5)); star(b, 12, 11, 4, N(7)); },
  mFire: (b) => { E(b, 12, 15, 6, 6, ci(Ramp.Signal, 5)); P(b, [6, 15, 18, 15, 12, 2], ci(Ramp.Signal, 5)); E(b, 12, 16, 3, 3, ci(Ramp.Amber, 6)); },
  mHealth: (b) => { cross(b, 12, 12, 7, ci(Ramp.Signal, 5)); },
  mEducation: (b) => { P(b, [2, 9, 12, 4, 22, 9, 12, 14], N(6)); R(b, 7, 10, 10, 6, N(6)); R(b, 20, 9, 1, 7, ci(Ramp.Amber, 6)); },
};

const FIXED: readonly string[] = ['bulldozer', 'tree', 'siren', 'road', 'bolt', 'drop', 'rail', 'anchor', 'houseL', 'shopL', 'factoryL', 'book', 'shieldbld', 'parktree', 'signpost', 'magnifier', 'ribbon',
  'rotccw', 'rotcw', 'zoomout', 'zoomin', 'crosshair', 'question', 'map', 'graph', 'people', 'pie', 'quad', 'dollar',
  'eyebld', 'eyesign', 'eyeinfra', 'eyezone', 'eyeund', 'gotoarrow', 'rcibase', 'close', 'minimize', 'pin'];
const WEATHER: readonly string[] = ['wCold', 'wClear', 'wHot', 'wFog', 'wChilly', 'wOvercast', 'wSnow', 'wRain', 'wWindy', 'wBlizzard', 'wHurricane', 'wTornado'];
const MAP_GLYPH: Readonly<Record<string, string>> = { structures: 'mStructures', zones: 'mZones', transport: 'mTransport', power: 'mPower', water: 'mWater', pop: 'mPop', growth: 'mGrowth', traffic: 'mTraffic', pollution: 'mPollution', crime: 'mCrime', landValue: 'mLandValue', police: 'mPolice', fire: 'mFire', health: 'mHealth', education: 'mEducation' };
const TOOL_GLYPH: Readonly<Record<string, string>> = {
  'bulldozer.demolish': 'bulldozer', 'bulldozer.level': 'level', 'bulldozer.raise': 'raise', 'bulldozer.lower': 'lower', 'bulldozer.dezone': 'dezone',
  'nature.trees': 'tree', 'nature.water': 'drop', 'dispatch.police': 'shield', 'dispatch.fire': 'helmet', 'dispatch.military': 'star',
  'power.wires': 'pole', 'power.coal': 'coal', 'power.hydro': 'dam', 'power.oil': 'derrick', 'power.gas': 'flame', 'power.nuclear': 'trefoil', 'power.wind': 'turbine', 'power.solar': 'panel', 'power.microwave': 'dish', 'power.fusion': 'ring',
  'water.pipes': 'pipe', 'water.pump': 'pump', 'water.tower': 'watertower', 'water.treatment': 'basin', 'water.desalination': 'desal',
  'rewards.mayorsHouse': 'mansion', 'rewards.cityHall': 'domehall', 'rewards.statue': 'statue', 'rewards.greatDome': 'bigdome', 'rewards.arcoPioneer': 'pyramid', 'rewards.arcoCanopy': 'glassdome', 'rewards.arcoDusk': 'towers', 'rewards.arcoSkyward': 'rocket',
  'roads.road': 'road', 'roads.highway': 'highway', 'roads.tunnel': 'tunnel', 'roads.onramp': 'ramp', 'roads.busDepot': 'bus',
  'rail.rail': 'rail', 'rail.subway': 'subway', 'rail.depot': 'depot', 'rail.subStation': 'stairs', 'rail.subToRail': 'subrail',
  'ports.seaport': 'anchor', 'ports.airport': 'plane',
  'zone.rLight': 'houseL', 'zone.rDense': 'houseD', 'zone.cLight': 'shopL', 'zone.cDense': 'shopD', 'zone.iLight': 'factoryL', 'zone.iDense': 'factoryD',
  'education.school': 'school', 'education.college': 'college', 'education.library': 'book', 'education.museum': 'columns',
  'services.police': 'shieldbld', 'services.fire': 'firebld', 'services.hospital': 'cross', 'services.prison': 'bars',
  'parks.small': 'parktree', 'parks.big': 'parktrees', 'parks.zoo': 'paw', 'parks.stadium': 'oval', 'parks.marina': 'boat',
  'signs.place': 'signpost', 'query': 'magnifier', 'center': 'crosshair',
};
/** id → 字形名；不支持返回 null。 */
export function iconGlyphName(id: number): string | null {
  if (id >= 0 && id < FIXED.length) return FIXED[id]!;
  if (id >= UiIconId.SpeedBase && id < UiIconId.SpeedBase + 5) return `speed${id - UiIconId.SpeedBase}`;
  if (id >= UiIconId.WeatherBase && id < UiIconId.WeatherBase + 12) return WEATHER[id - UiIconId.WeatherBase]!;
  if (id >= UiIconId.MapLayerBase && id < UiIconId.MapLayerBase + MAP_LAYER_MODES.length) return MAP_GLYPH[MAP_LAYER_MODES[id - UiIconId.MapLayerBase]!]!;
  if (id >= UiIconId.SubToolBase && id < UiIconId.SubToolBase + TOOLS.length) return TOOL_GLYPH[TOOLS[id - UiIconId.SubToolBase]!.id] ?? 'question';
  return null;
}
/** 全部受支持的 ui id（固定 39 + 速度 5 + 天气 12 + Map 图层 15 + 子工具 TOOLS.length）。 */
export function allIconIds(): number[] {
  const out: number[] = [];
  for (let k = 0; k < FIXED.length; k++) out.push(k);
  for (let k = 0; k < 5; k++) out.push(UiIconId.SpeedBase + k);
  for (let k = 0; k < 12; k++) out.push(UiIconId.WeatherBase + k);
  for (let k = 0; k < MAP_LAYER_MODES.length; k++) out.push(UiIconId.MapLayerBase + k);
  for (let k = 0; k < TOOLS.length; k++) out.push(UiIconId.SubToolBase + k);
  return out;
}
/** genIcon(id)：24×24，锚点 (0,0)；所有档共用同一张。 */
export function genIcon(id: number): IndexedBitmap | null {
  const name = iconGlyphName(id);
  if (!name) return null;
  const draw = GLYPHS[name];
  if (!draw) return null;
  const b = nb();
  draw(b);
  return finish(b);
}
/** 禁用态：主体整体换 Neutral[4]。 */
export function disabledIcon(src: IndexedBitmap): IndexedBitmap {
  const out = newBitmap(src.w, src.h, src.anchorX, src.anchorY);
  for (let k = 0; k < src.data.length; k++) { const v = src.data[k]!; out.data[k] = v === 0 ? 0 : v === N(1) ? N(2) : N(4); }
  return out;
}
