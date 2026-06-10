/**
 * 占位美术：纯程序生成的等距精灵，让游戏脱离 EA 文件即可运行。
 * 真实 SHP/VXL 管线就绪后按 typeId 替换为真实贴图即可，渲染接口不变。
 */
import { Application, Container, Graphics, Text, Texture } from 'pixi.js';
import type { UnitType } from '@ra2web/game';
import { TILE_H, TILE_W } from './iso';

/** 玩家色（红警2 经典）。 */
export const PLAYER_COLORS = [0xf8d020, 0x3a7fe0, 0x30c040, 0xe04030, 0xd060d0, 0xe08020, 0x40c0c0, 0xc0c0c0];

/** 每种建筑/单位的占位主色与简称。 */
const APPEARANCE: Record<string, { color: number; short: string }> = {
  conyard: { color: 0x8090a0, short: '基' },
  powerplant: { color: 0x4060a0, short: '电' },
  refinery: { color: 0xb08020, short: '矿' },
  barracks: { color: 0x808060, short: '兵' },
  warfactory: { color: 0x606870, short: '厂' },
  pillbox: { color: 0x707860, short: '碉' },
  tesla: { color: 0x6080c0, short: '磁' },
  gi: { color: 0x5088c0, short: '兵' },
  conscript: { color: 0xc05050, short: '动' },
  engineer: { color: 0xc0a040, short: '工' },
  harvester: { color: 0xc09030, short: '矿' },
  grizzly: { color: 0x4a7a9a, short: '灰' },
  rhino: { color: 0x8a5a4a, short: '犀' },
  flaktrak: { color: 0x9a6a8a, short: '防' },
};

export function appearanceOf(typeId: string): { color: number; short: string } {
  return APPEARANCE[typeId] ?? { color: 0x888888, short: '?' };
}

export interface ArtAssets {
  /** 建筑底座纹理（白色，渲染时按玩家色 tint），key=typeId。 */
  buildingTextures: Map<string, { tex: Texture; anchorX: number; anchorY: number }>;
  infantryBody: Texture;
  vehicleBody: Texture;
  vehicleBarrel: Texture;
}

type P = { x: number; y: number };
const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const flat = (...ps: P[]): number[] => ps.flatMap((p) => [p.x, p.y]);

/** 建筑顶面上画分类型屋顶细节（白底+暗部，随玩家色 tint）。 */
function drawAccent(g: Graphics, id: string, c: P, lift: number): void {
  const dark = (alpha: number): { color: number; alpha: number } => ({ color: 0x10141a, alpha });
  const box = (cx: number, cy: number, w: number, h: number, up: number): void => {
    g.poly(flat({ x: cx - w, y: cy }, { x: cx, y: cy + h }, { x: cx + w, y: cy }, { x: cx, y: cy - h })).fill(0xffffff);
    g.poly(flat({ x: cx - w, y: cy }, { x: cx, y: cy + h }, { x: cx, y: cy + h - up }, { x: cx - w, y: cy - up })).fill(dark(0.3));
    g.poly(flat({ x: cx, y: cy + h }, { x: cx + w, y: cy }, { x: cx + w, y: cy - up }, { x: cx, y: cy + h - up })).fill(dark(0.16));
  };
  switch (id) {
    case 'conyard': // 中央指挥塔
      box(c.x, c.y, 10, 5, lift * 0.7);
      g.circle(c.x, c.y - lift * 0.7 - 2, 3).fill({ color: 0xff5050, alpha: 0.9 });
      break;
    case 'powerplant': // 双冷却塔
      g.ellipse(c.x - 7, c.y - 12, 5, 3).fill(0xffffff).stroke(dark(0.5));
      g.ellipse(c.x + 6, c.y - 9, 4, 2.4).fill(0xffffff).stroke(dark(0.5));
      g.rect(c.x - 11, c.y - 12, 8, 12).fill(0xffffff).fill(dark(0.12));
      g.rect(c.x + 2, c.y - 9, 7, 9).fill(0xffffff).fill(dark(0.12));
      break;
    case 'refinery': // 储矿罐 + 卸矿口
      g.ellipse(c.x + 6, c.y - 13, 6, 3).fill(0xffffff).stroke(dark(0.5));
      g.rect(c.x, c.y - 13, 12, 13).fill(0xffffff).fill(dark(0.14));
      g.poly(flat({ x: c.x - 14, y: c.y + 2 }, { x: c.x - 4, y: c.y + 7 }, { x: c.x - 4, y: c.y + 2 }, { x: c.x - 14, y: c.y - 3 })).fill(dark(0.4));
      break;
    case 'warfactory': // 锯齿屋顶
      for (let i = -1; i <= 1; i++) {
        g.poly(flat({ x: c.x + i * 8 - 4, y: c.y }, { x: c.x + i * 8 + 4, y: c.y - 6 }, { x: c.x + i * 8 + 4, y: c.y })).fill(0xffffff).fill(dark(0.2));
      }
      break;
    case 'barracks': // 人字屋顶 + 旗
      box(c.x, c.y, 12, 6, lift * 0.4);
      g.moveTo(c.x + 6, c.y - lift * 0.4 - 2).lineTo(c.x + 6, c.y - lift * 0.4 - 12).stroke({ color: 0x10141a, width: 1.5 });
      g.poly(flat({ x: c.x + 6, y: c.y - lift * 0.4 - 12 }, { x: c.x + 13, y: c.y - lift * 0.4 - 10 }, { x: c.x + 6, y: c.y - lift * 0.4 - 8 })).fill({ color: 0xff5050, alpha: 0.95 });
      break;
    case 'tesla': // 磁暴线圈
      g.moveTo(c.x, c.y).lineTo(c.x, c.y - 16).stroke({ color: 0xdfe8ff, width: 2.5 });
      g.circle(c.x, c.y - 18, 4).fill({ color: 0x9fc8ff, alpha: 0.95 }).stroke({ color: 0xffffff, width: 1 });
      break;
    case 'pillbox': // 碉堡圆顶 + 枪眼
      g.ellipse(c.x, c.y - 2, 9, 5).fill(0xffffff).fill(dark(0.1)).stroke(dark(0.5));
      g.rect(c.x - 2, c.y - 4, 8, 2).fill(dark(0.7));
      break;
    default:
      box(c.x, c.y, 8, 4, lift * 0.5);
  }
}

/** 一次性生成全部占位纹理（原创 CC0 等距美术）。 */
export function buildArt(app: Application, units: Iterable<UnitType>): ArtAssets {
  const buildingTextures = new Map<string, { tex: Texture; anchorX: number; anchorY: number }>();

  for (const u of units) {
    if (u.domain !== 'building' || !u.building) continue;
    const w = u.building.footprintW;
    const h = u.building.footprintH;
    const lift = (u.building.power !== 0 || u.weapon ? 24 : 18) + Math.max(w, h) * 4;
    const leftSpan = (h * TILE_W) / 2;
    const g = new Graphics();
    // 地基四角（下移 lift，让立体结构落在 y>=0）
    const T = { x: leftSpan, y: lift };
    const R = { x: leftSpan + (w * TILE_W) / 2, y: lift + (w * TILE_H) / 2 };
    const B = { x: leftSpan + ((w - h) * TILE_W) / 2, y: lift + ((w + h) * TILE_H) / 2 };
    const L = { x: 0, y: lift + (h * TILE_H) / 2 };
    const C = { x: (T.x + B.x) / 2, y: (T.y + B.y) / 2 };
    // 地基阴影
    g.poly(flat(T, R, B, L)).fill({ color: 0x000000, alpha: 0.3 });
    // 主体内缩菱形 + 抬升
    const s = 0.82;
    const bT = lerp(T, C, 1 - s);
    const bR = lerp(R, C, 1 - s);
    const bB = lerp(B, C, 1 - s);
    const bL = lerp(L, C, 1 - s);
    const up = (p: P): P => ({ x: p.x, y: p.y - lift });
    // 两面侧墙（暗部）
    g.poly(flat(bL, bB, up(bB), up(bL))).fill(0xffffff);
    g.poly(flat(bL, bB, up(bB), up(bL))).fill({ color: 0x10141a, alpha: 0.34 });
    g.poly(flat(bB, bR, up(bR), up(bB))).fill(0xffffff);
    g.poly(flat(bB, bR, up(bR), up(bB))).fill({ color: 0x10141a, alpha: 0.16 });
    // 顶面
    g.poly(flat(up(bT), up(bR), up(bB), up(bL))).fill(0xffffff).stroke({ color: 0x10141a, alpha: 0.55, width: 1.5 });
    // 屋顶细节
    drawAccent(g, u.id, up(C), lift);

    const lb = g.getLocalBounds();
    const tex = app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    buildingTextures.set(u.id, { tex, anchorX: T.x - lb.minX, anchorY: T.y - lb.minY });
  }

  // 步兵：小人（头+身，白底+暗部描边）
  const inf = new Graphics();
  inf.ellipse(0, 8, 6, 2.5).fill({ color: 0x000000, alpha: 0.3 });
  inf.roundRect(-3.5, -2, 7, 10, 3).fill(0xffffff).stroke({ color: 0x10141a, alpha: 0.55, width: 1 });
  inf.circle(0, -5, 3.4).fill(0xffffff).stroke({ color: 0x10141a, alpha: 0.55, width: 1 });
  const infantryBody = app.renderer.generateTexture({ target: inf, resolution: 2 });
  inf.destroy();

  // 车体：履带 + 装甲车体（固定朝向，炮塔单独旋转）
  const veh = new Graphics();
  veh.ellipse(0, 7, 17, 6).fill({ color: 0x000000, alpha: 0.28 });
  // 两条履带（暗）
  veh.roundRect(-16, -7, 9, 14, 3).fill({ color: 0x20242a, alpha: 1 });
  veh.roundRect(7, -7, 9, 14, 3).fill({ color: 0x20242a, alpha: 1 });
  // 车体（白，受 tint）
  veh.poly(flat({ x: -9, y: -6 }, { x: 9, y: -6 }, { x: 12, y: 0 }, { x: 9, y: 6 }, { x: -9, y: 6 }, { x: -12, y: 0 })).fill(0xffffff).stroke({ color: 0x10141a, alpha: 0.6, width: 1.5 });
  veh.poly(flat({ x: -9, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 6 }, { x: -9, y: 6 })).fill({ color: 0x10141a, alpha: 0.18 });
  const vehicleBody = app.renderer.generateTexture({ target: veh, resolution: 2 });
  veh.destroy();

  // 炮塔（含炮管，朝 +x；渲染端按朝向旋转、暗色 tint）
  const tur = new Graphics();
  tur.rect(0, -2, 17, 4).fill(0xffffff); // 炮管
  tur.circle(0, 0, 6).fill(0xffffff).stroke({ color: 0x10141a, alpha: 0.6, width: 1 }); // 炮塔
  const vehicleBarrel = app.renderer.generateTexture({ target: tur, resolution: 2 });
  tur.destroy();

  return { buildingTextures, infantryBody, vehicleBody, vehicleBarrel };
}

/** 生成单位/建筑的 cameo 图标（侧边栏建造按钮用）。 */
export function makeCameo(typeId: string, name: string): HTMLCanvasElement {
  const { color, short } = appearanceOf(typeId);
  const cv = document.createElement('canvas');
  cv.width = 60;
  cv.height = 48;
  const ctx = cv.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const grad = ctx.createLinearGradient(0, 0, 0, 48);
  grad.addColorStop(0, hex);
  grad.addColorStop(1, '#1a1f24');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 60, 48);
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.strokeRect(0.5, 0.5, 59, 47);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(short, 30, 20);
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillText(name.slice(0, 5), 30, 40);
  return cv;
}

/** 等距小旗（移动指示）。 */
export function makeFlag(app: Application): Texture {
  const g = new Graphics();
  g.moveTo(0, 0).lineTo(0, -18).stroke({ color: 0xffffff, width: 2 });
  g.poly([0, -18, 12, -14, 0, -10]).fill(0x6fe06f);
  const t = app.renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return t;
}

export function makeContainer(): Container {
  const c = new Container();
  c.sortableChildren = true;
  return c;
}

export function makeLabel(text: string, size = 11): Text {
  return new Text({ text, style: { fill: 0xffffff, fontSize: size, fontWeight: '600' } });
}

export { TILE_W, TILE_H };
