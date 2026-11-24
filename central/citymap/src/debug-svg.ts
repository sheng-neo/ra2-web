/**
 * 俯视调试图：建筑、道路、海面、敏感区、可玩区、地标。北在上（SVG 的 y 向下，故取 -y）。
 */
import type { CityFile, FlatXY, Ring } from '@central/data';

const SCALE = 0.05; // dm → px（1 px = 2 m）

function pts(p: FlatXY, x0: number, y1: number): string {
  const out: string[] = [];
  for (let i = 0; i < p.length; i += 2) {
    out.push(`${((p[i]! - x0) * SCALE).toFixed(1)},${((y1 - p[i + 1]!) * SCALE).toFixed(1)}`);
  }
  return out.join(' ');
}

function ringPath(r: Ring, x0: number, y1: number): string {
  return [r.outer, ...(r.holes ?? [])].map((p) => `M${pts(p, x0, y1)}Z`).join('');
}

const ROAD_STYLE: Partial<Record<string, string>> = {
  motorway: '#e8a33d;2.2', trunk: '#e8a33d;2', primary: '#f2c14e;1.8', secondary: '#f2d27a;1.5',
  tertiary: '#f5e2a8;1.3', footway: '#7a8a99;0.4', steps: '#7a8a99;0.4', pedestrian: '#9aa8b5;0.8',
};

export function cityToSvg(city: CityFile): string {
  const [x0, y0, x1, y1] = city.meta.bbox;
  const w = Math.ceil((x1 - x0) * SCALE);
  const h = Math.ceil((y1 - y0) * SCALE);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#1d2329"/>`,
  ];
  for (const r of city.water) parts.push(`<path d="${ringPath(r, x0, y1)}" fill="#1f4e79" fill-rule="evenodd"/>`);
  for (const b of city.buildings) {
    const t = Math.min(1, b.height / 2000);
    const c = Math.round(90 + 140 * t);
    parts.push(`<path d="${ringPath(b.footprint, x0, y1)}" fill="rgb(${c},${c},${c + 10})" fill-rule="evenodd"/>`);
  }
  for (const r of city.roads) {
    const [color, width] = (ROAD_STYLE[r.cls] ?? '#c9c9c9;0.9').split(';');
    const dash = r.oneway !== 0 ? ' stroke-dasharray="3 1.5"' : '';
    parts.push(`<polyline points="${pts(r.pts, x0, y1)}" fill="none" stroke="${color}" stroke-width="${width}"${dash}/>`);
  }
  for (const r of city.rails) {
    parts.push(`<polyline points="${pts(r.pts, x0, y1)}" fill="none" stroke="#3ad07a" stroke-width="1"/>`);
  }
  for (const z of city.zones.sensitive) {
    const color = z.kind === 'military' ? '#ff3b3b' : '#ff9f1c';
    parts.push(`<path d="${ringPath(z.area, x0, y1)}" fill="${color}" fill-opacity="0.35" stroke="${color}"/>`);
  }
  for (const p of city.zones.playable) {
    parts.push(`<path d="${ringPath(p, x0, y1)}" fill="none" stroke="#4dd2ff" stroke-width="2" stroke-dasharray="8 4"/>`);
  }
  for (const l of city.landmarks) {
    parts.push(`<path d="${ringPath(l.footprint, x0, y1)}" fill="#d14dff"/>`);
    const lx = ((l.x - x0) * SCALE).toFixed(1);
    const ly = ((y1 - l.y) * SCALE).toFixed(1);
    parts.push(`<text x="${lx}" y="${ly}" fill="#fff" font-size="10" font-family="sans-serif">${l.name.en}</text>`);
  }
  parts.push(`<text x="8" y="16" fill="#fff" font-size="12" font-family="sans-serif">N ↑</text>`, '</svg>');
  return parts.join('\n');
}
