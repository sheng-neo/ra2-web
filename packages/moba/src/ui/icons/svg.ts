/**
 * 程序绘制 SVG 图标的公共工具：颜色运算、渐变、常用形状、徽章底板。
 * 所有图标都是纯字符串，可直接 innerHTML，也可转 data URI 当背景图。
 */

// ───────────── 颜色 ─────────────

function parseHex(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两色线性混合：t=0 得 a，t=1 得 b */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const c = (x: number, y: number): string => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);
export const darken = (c: string, t: number): string => mix(c, '#000000', t);

// ───────────── 渐变 / 包装 ─────────────

/** [offset 0..1, 颜色, 不透明度?] */
export type Stop = [number, string, number?];

const stops = (ss: Stop[]): string =>
  ss.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');

/** 线性渐变（用户坐标）。id 前的 '@' 会在 wrap() 时换成全局唯一前缀 */
export const lg = (id: string, x1: number, y1: number, x2: number, y2: number, ss: Stop[]): string =>
  `<linearGradient id="@${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(ss)}</linearGradient>`;

/** 径向渐变（用户坐标） */
export const rg = (id: string, cx: number, cy: number, r: number, ss: Stop[]): string =>
  `<radialGradient id="@${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops(ss)}</radialGradient>`;

/** 径向渐变（相对被填充图形的包围盒，圆心居中）：可被多个不同位置的图形复用 */
export const rgo = (id: string, ss: Stop[]): string => `<radialGradient id="@${id}">${stops(ss)}</radialGradient>`;

let uid = 0;

/**
 * 包成完整 <svg>。同一页面会内联很多个图标，渐变 id 必须互不相同，
 * 所以把内容里的 '@' 占位统一替换成每次调用唯一的前缀。
 */
export function wrap(size: number, inner: string, cls = 'sf-ico'): string {
  const p = `sfi${(uid++).toString(36)}-`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" class="${cls}" aria-hidden="true" focusable="false">${inner.replace(/@/g, p)}</svg>`;
}

/**
 * 徽章式图标底板(64×64 满幅方形，圆角/圆形由外层 CSS 裁切)：
 * 径向渐变底 + 主体图形 + 暗角 + 顶部弧形高光。主体请画在中心半径 ~27 的安全圆内，
 * 这样无论方形槽还是圆形技能键都不会被裁掉。
 */
export function badge(bg: [string, string, string], defs: string, body: string): string {
  return wrap(
    64,
    `<defs>${rg('bg', 32, 27, 48, [[0, bg[0]], [0.5, bg[1]], [1, bg[2]]])}${rg('vg', 32, 32, 46, [[0.6, '#000', 0], [1, '#000', 0.5]])}${lg('gl', 0, 0, 0, 30, [[0, '#fff', 0.24], [1, '#fff', 0]])}${defs}</defs>` +
      `<rect width="64" height="64" fill="url(#@bg)"/>${body}<rect width="64" height="64" fill="url(#@vg)"/><path d="M0 0H64V19Q32 31 0 19Z" fill="url(#@gl)"/>`,
  );
}

// ───────────── 形状 ─────────────

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** 四芒星路径（凹边）：pinch 越小越尖 */
export function star4(cx: number, cy: number, r: number, pinch = 0.18): string {
  const k = r2(r * pinch);
  return `M${cx} ${r2(cy - r)}Q${r2(cx + k)} ${r2(cy - k)} ${r2(cx + r)} ${cy}Q${r2(cx + k)} ${r2(cy + k)} ${cx} ${r2(cy + r)}Q${r2(cx - k)} ${r2(cy + k)} ${r2(cx - r)} ${cy}Q${r2(cx - k)} ${r2(cy - k)} ${cx} ${r2(cy - r)}Z`;
}

/** n 角星/齿形多边形路径：外半径 R、内半径 r、起始角(度，-90 为正上) */
export function starPoly(cx: number, cy: number, n: number, R: number, r: number, rot = -90): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : r;
    d += `${i === 0 ? 'M' : 'L'}${r2(cx + Math.cos(a) * rad)} ${r2(cy + Math.sin(a) * rad)}`;
  }
  return `${d}Z`;
}

/** 极坐标点（度，0 = 正右，顺时针为正——SVG 的 y 轴朝下） */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r)];
}

/** 圆弧路径：从 a0 顺时针画到 a1（度） */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** 柔光斑：用径向渐变模拟发光，比 SVG 滤镜便宜得多。需要配套 glowDef 定义同名渐变 */
export const glowDef = (id: string, color: string, alpha = 0.85): string =>
  `<radialGradient id="@${id}"><stop offset="0" stop-color="${color}" stop-opacity="${alpha}"/><stop offset="0.45" stop-color="${color}" stop-opacity="${r2(alpha * 0.35)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
export const glow = (id: string, cx: number, cy: number, r: number): string => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#@${id})"/>`;

/** 深色描边颜色：让图形在任何底色上都有清晰轮廓 */
export const INK = '#070b16';
