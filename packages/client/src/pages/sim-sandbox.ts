/**
 * 模拟沙盒（M3 验证页，#sim）：
 * 15Hz 确定性模拟 + 渲染插值；左键点选/框选，右键下移动令。
 * HUD 实时显示 tick 与状态哈希 —— 同样操作序列在任何机器上哈希一致。
 */
import { Application, Container, Graphics, Texture, Sprite } from 'pixi.js';
import {
  SIM_TICKS_PER_SECOND,
  World,
  gridTerrain,
  leptonToCell,
  type Command,
  type Entity,
  type UnitSpec,
} from '@ra2web/game';
import { Camera } from '../camera';
import { TILE_H, TILE_W } from '../tile-art';

const TANK: UnitSpec = { speed: 56, rot: 6 };
const DOG: UnitSpec = { speed: 130, rot: 30 };
const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const GRID_W = 28;
const GRID_H = 28;

const STYLE = `
.sb-top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; gap: 14px; align-items: center;
  padding: 8px 12px; background: rgba(10,14,18,.88); color: #c8d2da; font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; flex-wrap: wrap; }
.sb-top a { color: #6db3e8; text-decoration: none; }
.sb-hud { font-family: ui-monospace, monospace; color: #9fd29f; }
.sb-hint { color: #8a97a0; }
#sb-selbox { position: fixed; border: 1px solid #7fd17f; background: rgba(120,220,120,.12); pointer-events: none; display: none; z-index: 9; }
`;

/** 世界 lepton → 屏幕（等距投影）。 */
function isoX(x: number, y: number): number {
  return ((x - y) * (TILE_W / 2)) / 256;
}
function isoY(x: number, y: number): number {
  return ((x + y) * (TILE_H / 2)) / 256;
}
/** 屏幕世界点 → lepton（逆投影）。 */
function unproject(wx: number, wy: number): { x: number; y: number } {
  const a = (wx * 256) / (TILE_W / 2);
  const b = (wy * 256) / (TILE_H / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}

export async function renderSimSandbox(root: HTMLElement): Promise<void> {
  document.title = '模拟沙盒 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  root.insertAdjacentHTML(
    'beforeend',
    `<div class="sb-top">
       <strong>模拟沙盒</strong>
       <span class="sb-hud" id="sb-hud">tick 0</span>
       <span class="sb-hint">左键点选/框选 · 右键移动 · 拖中键/空白平移 · 滚轮缩放</span>
       <span style="flex:1"></span>
       <a href="#">← 返回首页</a>
     </div>
     <div id="sb-selbox"></div>`,
  );
  const hud = root.querySelector('#sb-hud') as HTMLElement;
  const selBox = root.querySelector('#sb-selbox') as HTMLElement;

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#06090c',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);

  // —— 地形 ——
  const blocked = new Set<number>();
  for (let y = 8; y <= 19; y++) blocked.add(y * GRID_W + 13); // 中央一道墙
  for (let x = 4; x <= 8; x++) blocked.add(22 * GRID_W + x); // 南侧短墙
  const terrain = gridTerrain(GRID_W, GRID_H, blocked);
  const world = new World(terrain, 20260610);

  const stage = new Container();
  app.stage.addChild(stage);
  const camera = new Camera(app, stage);

  const terrainLayer = new Graphics();
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const sx = ((cx - cy) * TILE_W) / 2;
      const sy = ((cx + cy) * TILE_H) / 2;
      terrainLayer.poly([sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2]);
      const isBlocked = blocked.has(cy * GRID_W + cx);
      const parity = (cx + cy) % 2 === 0;
      terrainLayer.fill(isBlocked ? 0x3a2a22 : parity ? 0x20301f : 0x1b2a1b);
      terrainLayer.stroke({ color: 0x000000, alpha: 0.15, width: 1 });
    }
  }
  stage.addChild(terrainLayer);

  const unitLayer = new Container();
  unitLayer.sortableChildren = true;
  stage.addChild(unitLayer);
  const fxLayer = new Graphics();
  stage.addChild(fxLayer);

  // —— 初始部队 ——
  const initial: Command[] = [];
  for (let i = 0; i < 6; i++) {
    initial.push({ kind: 'spawn', owner: 1, cellX: 3 + (i % 3), cellY: 4 + Math.floor(i / 3) * 2, spec: TANK });
  }
  for (let i = 0; i < 3; i++) {
    initial.push({ kind: 'spawn', owner: 1, cellX: 2, cellY: 10 + i, spec: DOG });
  }
  for (let i = 0; i < 4; i++) {
    initial.push({ kind: 'spawn', owner: 2, cellX: 23 + (i % 2), cellY: 8 + Math.floor(i / 2), spec: TANK });
  }
  world.applyCommands(initial);

  // —— 单位渲染 ——
  const bodyTex = ((): Texture => {
    const g = new Graphics();
    g.ellipse(0, 0, 14, 8).fill(0xffffff).stroke({ color: 0x000000, alpha: 0.4, width: 1 });
    const t = app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return t;
  })();
  const barrelTex = ((): Texture => {
    const g = new Graphics();
    g.rect(0, -1.5, 16, 3).fill(0xffffff);
    const t = app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return t;
  })();

  interface UnitView {
    body: Sprite;
    barrel: Sprite;
    ring: Graphics;
    prevX: number;
    prevY: number;
    prevFacing: number;
  }
  const views = new Map<number, UnitView>();
  const selected = new Set<number>();

  function ensureView(e: Entity): UnitView {
    let v = views.get(e.id);
    if (!v) {
      const body = new Sprite(bodyTex);
      body.anchor.set(0.5);
      body.tint = e.owner === 1 ? 0x4f8fdd : 0xd05050;
      const barrel = new Sprite(barrelTex);
      barrel.anchor.set(0, 0.5);
      barrel.tint = e.owner === 1 ? 0x9fc3ee : 0xeaa0a0;
      const ring = new Graphics();
      ring.ellipse(0, 0, 18, 11).stroke({ color: 0x88ee88, width: 1.5 });
      ring.visible = false;
      unitLayer.addChild(ring, body, barrel);
      v = { body, barrel, ring, prevX: e.x, prevY: e.y, prevFacing: e.facing };
      views.set(e.id, v);
    }
    return v;
  }

  // —— 指令输入 ——
  const pending: Command[] = [];
  let dragStart: { x: number; y: number } | null = null;

  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  app.canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      dragStart = { x: e.clientX, y: e.clientY };
    }
  });
  app.canvas.addEventListener('pointermove', (e) => {
    if (dragStart) {
      const x0 = Math.min(dragStart.x, e.clientX);
      const y0 = Math.min(dragStart.y, e.clientY);
      selBox.style.display = 'block';
      selBox.style.left = `${x0}px`;
      selBox.style.top = `${y0}px`;
      selBox.style.width = `${Math.abs(e.clientX - dragStart.x)}px`;
      selBox.style.height = `${Math.abs(e.clientY - dragStart.y)}px`;
    }
  });
  app.canvas.addEventListener('pointerup', (e) => {
    if (e.button === 0 && dragStart) {
      const rect = app.canvas.getBoundingClientRect();
      const w = Math.abs(e.clientX - dragStart.x);
      const h = Math.abs(e.clientY - dragStart.y);
      selected.clear();
      if (w < 6 && h < 6) {
        // 点选：找屏幕距离最近的己方单位
        let best: { id: number; d: number } | null = null;
        for (const ent of world.entities.values()) {
          if (ent.owner !== 1) continue;
          const v = views.get(ent.id);
          if (!v) continue;
          const gp = v.body.getGlobalPosition();
          const d = Math.hypot(gp.x - (e.clientX - rect.left), gp.y - (e.clientY - rect.top));
          if (d < 24 && (!best || d < best.d)) best = { id: ent.id, d };
        }
        if (best) selected.add(best.id);
      } else {
        const x0 = Math.min(dragStart.x, e.clientX) - rect.left;
        const y0 = Math.min(dragStart.y, e.clientY) - rect.top;
        const x1 = x0 + w;
        const y1 = y0 + h;
        for (const ent of world.entities.values()) {
          if (ent.owner !== 1) continue;
          const v = views.get(ent.id);
          if (!v) continue;
          const gp = v.body.getGlobalPosition();
          if (gp.x >= x0 && gp.x <= x1 && gp.y >= y0 && gp.y <= y1) selected.add(ent.id);
        }
      }
      dragStart = null;
      selBox.style.display = 'none';
    }
    if (e.button === 2 && selected.size > 0) {
      const rect = app.canvas.getBoundingClientRect();
      const wpt = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const lep = unproject(wpt.x, wpt.y - TILE_H / 2);
      const cell = { x: leptonToCell(lep.x), y: leptonToCell(lep.y) };
      if (cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H) {
        pending.push({ kind: 'move', entityIds: [...selected].sort((a, b) => a - b), cellX: cell.x, cellY: cell.y });
        flag = { x: isoX(cell.x * 256 + 128, cell.y * 256 + 128), y: isoY(cell.x * 256 + 128, cell.y * 256 + 128), ttl: 20 };
      }
    }
  });
  // 中键平移 + 滚轮缩放交给 Camera，左键留给选择
  camera.attach(app.canvas, [1]);

  // —— 主循环：固定步进 + 插值 ——
  let acc = 0;
  let flag: { x: number; y: number; ttl: number } | null = null;

  camera.x = isoX(14 * 256, 14 * 256);
  camera.y = isoY(14 * 256, 14 * 256);
  camera.zoom = 0.9;
  camera.apply();

  app.ticker.add((ticker) => {
    acc += ticker.deltaMS;
    while (acc >= TICK_MS) {
      // 快照上一 tick 位置供插值
      for (const ent of world.entities.values()) {
        const v = ensureView(ent);
        v.prevX = ent.x;
        v.prevY = ent.y;
        v.prevFacing = ent.facing;
      }
      if (pending.length > 0) {
        world.applyCommands(pending.splice(0));
      }
      world.step();
      acc -= TICK_MS;
      if (world.tick % 15 === 0) {
        hud.textContent = `tick ${world.tick} · hash ${world.hash().toString(16).padStart(8, '0')} · 单位 ${world.entities.size}`;
      }
    }
    const alpha = acc / TICK_MS;

    for (const ent of world.entities.values()) {
      const v = ensureView(ent);
      const x = v.prevX + (ent.x - v.prevX) * alpha;
      const y = v.prevY + (ent.y - v.prevY) * alpha;
      const sx = isoX(x, y);
      const sy = isoY(x, y);
      v.body.position.set(sx, sy);
      v.body.zIndex = sy;
      v.barrel.position.set(sx, sy);
      v.barrel.zIndex = sy + 0.1;
      // 朝向插值（最短弧）；屏幕角 = 等距空间角
      const fd = (((ent.facing - v.prevFacing + 128) & 0xff) - 128) * alpha;
      const facing = (v.prevFacing + fd + 256) % 256;
      const rad = (facing / 256) * Math.PI * 2;
      // 等距压扁：世界角 → 屏幕角
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      v.barrel.rotation = Math.atan2(((dx + dy) * TILE_H) / 2, ((dx - dy) * TILE_W) / 2);
      v.ring.position.set(sx, sy + 2);
      v.ring.zIndex = sy - 0.1;
      v.ring.visible = selected.has(ent.id);
    }

    fxLayer.clear();
    if (flag) {
      fxLayer.circle(flag.x, flag.y, 6 + (flag.ttl % 5)).stroke({ color: 0x7fd17f, width: 2 });
      if (--flag.ttl <= 0) flag = null;
    }
  });
}
