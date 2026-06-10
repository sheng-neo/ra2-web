/**
 * 地图查看器（M2 验证页，#map）：
 * 等距地形渲染 + 拖拽平移 + 滚轮缩放 + 小地图。
 * 有 game-data → 真实地图（multi.mix + 战区 TMP）；
 * 无 game-data → 程序生成演示地图（验证渲染与相机）。
 */
import { Application, Container, Sprite } from 'pixi.js';
import {
  IniFile,
  Palette,
  TheaterTileTable,
  parseMap,
  theaterByName,
  type RA2Map,
} from '@ra2web/data';
import { Camera } from '../camera';
import { KNOWN_CHILD_MIXES } from '../known-names';
import { LEVEL_H, RealTileArt, SyntheticTileArt, TILE_H, TILE_W, type TileArt } from '../tile-art';
import { ResourceFS } from '../vfs';

const STYLE = `
.mv-top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; gap: 10px; align-items: center;
  padding: 8px 12px; background: rgba(10,14,18,.88); color: #c8d2da; font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; flex-wrap: wrap; }
.mv-top a { color: #6db3e8; text-decoration: none; }
.mv-top select { background: #14202b; color: #c8d2da; border: 1px solid #2a3a48; border-radius: 4px; padding: 2px 6px; max-width: 40vw; }
.mv-status { color: #8a97a0; }
#mv-minimap { position: fixed; right: 10px; top: 46px; z-index: 10; border: 1px solid #2a3a48; background: #000;
  image-rendering: pixelated; max-width: 35vw; }
`;

export async function renderMapViewer(root: HTMLElement): Promise<void> {
  document.title = '地图查看器 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="mv-top">
       <strong>地图查看器</strong>
       <select id="mv-select"><option value="__demo__">演示地图（程序生成）</option></select>
       <span class="mv-status" id="mv-status">初始化…</span>
       <span style="flex:1"></span>
       <a href="#">← 返回首页</a>
     </div>
     <canvas id="mv-minimap" width="1" height="1"></canvas>`,
  );
  const statusEl = root.querySelector('#mv-status') as HTMLElement;
  const selectEl = root.querySelector('#mv-select') as HTMLSelectElement;
  const minimapEl = root.querySelector('#mv-minimap') as HTMLCanvasElement;

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#06090c',
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  const camera = new Camera(app, world);
  camera.attach(app.canvas);

  // —— 尝试真实管线 ——
  const fs = new ResourceFS();
  let haveGameData = false;
  try {
    const ra2 = await fs.mountUrl('/game-data/ra2.mix', 'ra2.mix');
    for (const child of KNOWN_CHILD_MIXES) {
      try {
        if (ra2.hasFile(child)) await fs.mountChild(fs.mounts[0]!, child);
      } catch {
        /* 跳过坏子包 */
      }
    }
    await fs.mountUrl('/game-data/multi.mix', 'multi.mix').catch(() => undefined);
    haveGameData = true;
  } catch {
    haveGameData = false;
  }

  // 枚举官方地图（missions.pkt 列表）
  const mapNames: string[] = [];
  if (haveGameData) {
    try {
      const pkt = IniFile.fromBytes(await fs.readFile('missions.pkt'));
      const multiMaps = pkt.getSection('MultiMaps');
      if (multiMaps) {
        for (const v of multiMaps.values()) {
          const name = v.trim().toLowerCase();
          if (name) mapNames.push(name.endsWith('.map') || name.endsWith('.mpr') ? name : `${name}.map`);
        }
      }
    } catch {
      /* 没有 missions.pkt 时下拉只有演示图 */
    }
    for (const m of mapNames) {
      if (!fs.has(m)) continue;
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      selectEl.appendChild(opt);
    }
  }

  async function loadReal(name: string): Promise<{ map: RA2Map; art: TileArt } | null> {
    try {
      const map = parseMap(IniFile.fromBytes(await fs.readFile(name)));
      const theater = theaterByName(map.theater);
      if (!theater) throw new Error(`未知战区 ${map.theater}`);
      const table = new TheaterTileTable(
        IniFile.fromBytes(await fs.readFile(theater.ini)),
        theater.extension,
      );
      const palette = Palette.parse(await fs.readFile(theater.palette));
      const art = new RealTileArt(fs, table, palette);
      await art.prepare(map);
      return { map, art };
    } catch (err) {
      statusEl.textContent = `加载失败: ${String(err)}`;
      return null;
    }
  }

  /** 程序生成演示地图：菱形地形 + 山丘 + 水域。 */
  function demoMap(): RA2Map {
    const w = 36;
    const h = 36;
    const tiles: RA2Map['tiles'] = [];
    for (let x = 1; x <= w; x++) {
      for (let y = 1; y <= h; y++) {
        const cx = x - w / 2;
        const cy = y - h / 2;
        const dist = Math.hypot(cx, cy);
        const hill = Math.max(0, Math.round(4 - Math.hypot(cx + 8, cy + 8) / 2));
        const water = dist > 8 && Math.hypot(cx - 9, cy - 9) < 5;
        tiles.push({
          x,
          y,
          tileIndex: water ? -1 : (x * 7 + y * 13) % 24,
          subTile: 0,
          level: water ? 0 : hill,
          iceGrowth: 0,
        });
      }
    }
    return {
      width: w,
      height: h,
      theater: 'TEMPERATE',
      localSize: { x: 0, y: 0, width: w, height: h },
      tiles,
      overlay: new Uint8Array(512 * 512).fill(0xff),
      overlayData: new Uint8Array(512 * 512),
      waypoints: new Map(),
    };
  }

  function buildTerrain(map: RA2Map, art: TileArt): void {
    world.removeChildren();
    const layer = new Container();
    layer.sortableChildren = true;
    world.addChild(layer);

    const synthetic = art instanceof SyntheticTileArt ? art : null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const t of map.tiles) {
      const ts = art.get(t.tileIndex, t.subTile);
      if (!ts) continue;
      const sx = ((t.x - t.y) * TILE_W) / 2 + ts.dx;
      const sy = ((t.x + t.y) * TILE_H) / 2 - t.level * LEVEL_H + ts.dy;
      const sp = new Sprite(ts.texture);
      sp.position.set(sx - TILE_W / 2, sy);
      sp.zIndex = (t.x + t.y) * 4 + t.level;
      if (synthetic) {
        sp.tint = synthetic.tintOf(t.tileIndex, t.level);
        if (t.level > 0) {
          // 演示模式补侧壁（真实地图自带斜坡地块，无需此处理）
          const wall = new Sprite(synthetic.side);
          wall.position.set(sx - TILE_W / 2, sy + TILE_H / 2);
          wall.height = t.level * LEVEL_H + TILE_H / 2;
          wall.tint = 0x1c2e1c;
          wall.zIndex = sp.zIndex - 1;
          layer.addChild(wall);
        }
      }
      layer.addChild(sp);
      minX = Math.min(minX, sx - TILE_W / 2);
      maxX = Math.max(maxX, sx + TILE_W / 2);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy + TILE_H);
    }

    camera.x = (minX + maxX) / 2;
    camera.y = (minY + maxY) / 2;
    camera.zoom = Math.min(
      1,
      app.screen.width / (maxX - minX + 80),
      app.screen.height / (maxY - minY + 80),
    );
    camera.apply();
    drawMinimap(map, art);
  }

  function drawMinimap(map: RA2Map, art: TileArt): void {
    const synthetic = art instanceof SyntheticTileArt ? art : null;
    const size = map.width + map.height;
    minimapEl.width = size * 2;
    minimapEl.height = size;
    minimapEl.style.width = `${Math.min(size * 2, 260)}px`;
    const ctx = minimapEl.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, minimapEl.width, minimapEl.height);
    for (const t of map.tiles) {
      const ts = art.get(t.tileIndex, t.subTile);
      if (!ts) continue;
      const color = synthetic ? synthetic.tintOf(t.tileIndex, t.level) : ts.minimapColor;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(t.x - t.y + size, Math.floor((t.x + t.y) / 2), 2, 1);
    }
  }

  async function show(value: string): Promise<void> {
    if (value === '__demo__') {
      const map = demoMap();
      buildTerrain(map, new SyntheticTileArt(app));
      statusEl.textContent = haveGameData
        ? '演示地图（已检测到游戏文件，可在下拉选择官方地图）'
        : '演示地图 — 未检测到游戏文件，放入 game-data/ 后可加载官方地图';
      return;
    }
    statusEl.textContent = `加载 ${value} …`;
    const loaded = await loadReal(value);
    if (loaded) {
      buildTerrain(loaded.map, loaded.art);
      statusEl.textContent = `${value} · ${loaded.map.width}×${loaded.map.height} · ${loaded.map.theater} · ${loaded.map.tiles.length} 块`;
    }
  }

  selectEl.addEventListener('change', () => void show(selectEl.value));
  await show('__demo__');
}
