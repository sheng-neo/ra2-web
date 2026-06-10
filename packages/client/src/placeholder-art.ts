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

/** 一次性生成全部占位纹理。 */
export function buildArt(app: Application, units: Iterable<UnitType>): ArtAssets {
  const buildingTextures = new Map<string, { tex: Texture; anchorX: number; anchorY: number }>();

  for (const u of units) {
    if (u.domain !== 'building' || !u.building) continue;
    const w = u.building.footprintW;
    const h = u.building.footprintH;
    const lift = u.building.power !== 0 || u.weapon ? 26 : 20;

    // 局部坐标：以上顶点 T 为 (leftSpan, 0)，左顶点 x 最小
    const leftSpan = (h * TILE_W) / 2;
    const g = new Graphics();
    const T = { x: leftSpan, y: 0 };
    const R = { x: leftSpan + (w * TILE_W) / 2, y: (w * TILE_H) / 2 };
    const B = { x: leftSpan + ((w - h) * TILE_W) / 2, y: ((w + h) * TILE_H) / 2 };
    const L = { x: 0, y: (h * TILE_H) / 2 };

    // 侧墙（先画，被顶面压住）
    g.poly([L.x, L.y, B.x, B.y, B.x, B.y + lift, L.x, L.y + lift]).fill({ color: 0x000000, alpha: 0.001 });
    g.poly([L.x, L.y, B.x, B.y, B.x, B.y + lift, L.x, L.y + lift]).fill(0x000000).fill({ color: 0xffffff, alpha: 0.25 });
    g.poly([B.x, B.y, R.x, R.y, R.x, R.y + lift, B.x, B.y + lift]).fill(0xffffff).fill({ color: 0x000000, alpha: 0.18 });
    // 顶面菱形
    g.poly([T.x, T.y, R.x, R.y, B.x, B.y, L.x, L.y]).fill(0xffffff).stroke({ color: 0x000000, alpha: 0.35, width: 1.5 });

    const tex = app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    // 锚点设在顶点 T，对应世界格 (cellX,cellY) 的上角
    buildingTextures.set(u.id, { tex, anchorX: T.x, anchorY: T.y });
  }

  const inf = new Graphics();
  inf.circle(0, 0, 5).fill(0xffffff).stroke({ color: 0x000000, alpha: 0.5, width: 1 });
  const infantryBody = app.renderer.generateTexture({ target: inf, resolution: 2 });
  inf.destroy();

  const veh = new Graphics();
  veh.roundRect(-13, -8, 26, 16, 4).fill(0xffffff).stroke({ color: 0x000000, alpha: 0.5, width: 1 });
  const vehicleBody = app.renderer.generateTexture({ target: veh, resolution: 2 });
  veh.destroy();

  const bar = new Graphics();
  bar.rect(0, -2, 18, 4).fill(0xffffff);
  const vehicleBarrel = app.renderer.generateTexture({ target: bar, resolution: 2 });
  bar.destroy();

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
