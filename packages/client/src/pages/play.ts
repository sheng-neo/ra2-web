/**
 * 遭遇战页面（#play）：完整可玩的垂直切片，脱离 EA 文件运行。
 * 玩家造基地/采矿/造兵/放置/作战，对抗占位 AI；建筑全灭判胜负。
 * 用占位美术，真实素材就绪后替换 placeholder-art 即可。
 */
import { Application, Graphics } from 'pixi.js';
import {
  SIM_TICKS_PER_SECOND,
  World,
  categoryOf,
  gridTerrain,
  leptonToCell,
  type Command,
  type ProdCategory,
  type UnitType,
} from '@ra2web/game';
import { Camera } from '../camera';
import { SimpleAI } from '../ai';
import { cornerX, cornerY, screenToLepton, TILE_H, TILE_W } from '../iso';
import { buildArt, makeCameo } from '../placeholder-art';
import { WorldRenderer } from '../world-renderer';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HUMAN = 1;
const AI = 2;
const MAP_W = 44;
const MAP_H = 44;

const CATEGORY_LABEL: Record<ProdCategory, string> = {
  building: '建筑',
  infantry: '步兵',
  vehicle: '车辆',
};

const STYLE = `
.pl-root { position: fixed; inset: 0; overflow: hidden; background: #06090c;
  font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; color: #d8e0e6; touch-action: none; }
.pl-top { position: fixed; top: 0; left: 0; z-index: 20; display: flex; gap: 16px; align-items: center;
  padding: 8px 14px; background: rgba(8,12,16,.8); border-bottom-right-radius: 8px; }
.pl-top b { color: #f0d040; font-variant-numeric: tabular-nums; }
.pl-top .pwr-ok { color: #6fce6f; }
.pl-top .pwr-low { color: #e05050; }
.pl-top a { color: #6db3e8; text-decoration: none; }
.pl-side { position: fixed; top: 0; right: 0; bottom: 0; width: 168px; z-index: 20;
  background: rgba(12,16,20,.92); border-left: 1px solid #243039; display: flex; flex-direction: column; }
.pl-mini { width: 168px; height: 130px; background: #000; border-bottom: 1px solid #243039; }
.pl-tabs { display: flex; }
.pl-tabs button { flex: 1; padding: 6px 0; background: #161e25; color: #9aa7b0; border: none;
  border-bottom: 2px solid transparent; cursor: pointer; font-size: 12px; }
.pl-tabs button.on { color: #fff; border-bottom-color: #6db3e8; background: #1d2933; }
.pl-build { flex: 1; overflow-y: auto; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
.pl-cameo { position: relative; cursor: pointer; border: 1px solid #2a3a48; border-radius: 4px; overflow: hidden; user-select: none; }
.pl-cameo.disabled { opacity: .35; cursor: not-allowed; }
.pl-cameo canvas { display: block; width: 100%; }
.pl-cameo .cost { position: absolute; right: 2px; bottom: 14px; font-size: 10px; color: #f0d040; text-shadow: 0 0 3px #000; }
.pl-cameo .prog { position: absolute; inset: 0; background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; }
.pl-cameo .ready { position: absolute; inset: 0; border: 2px solid #6fe06f; box-sizing: border-box;
  display: flex; align-items: flex-start; justify-content: center; color: #6fe06f; font-size: 10px; }
.pl-hint { position: fixed; left: 50%; transform: translateX(-50%); bottom: 10px; z-index: 20;
  padding: 6px 14px; background: rgba(8,12,16,.8); border-radius: 16px; color: #9aa7b0; font-size: 12px; }
.pl-banner { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  background: rgba(4,6,8,.7); font-size: 44px; font-weight: 800; }
#pl-selbox { position: fixed; border: 1px solid #7fd17f; background: rgba(120,220,120,.12); pointer-events: none; display: none; z-index: 19; }
@media (max-width: 760px) {
  .pl-side { top: auto; bottom: 0; left: 0; width: 100%; height: 132px; flex-direction: row; border-left: none; border-top: 1px solid #243039; }
  .pl-mini { display: none; }
  .pl-tabs { flex-direction: column; width: 56px; }
  .pl-build { grid-template-columns: repeat(auto-fill, 56px); }
}
`;

export async function renderPlay(root: HTMLElement): Promise<void> {
  document.title = '遭遇战 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  // —— 世界初始化 ——
  const terrain = gridTerrain(MAP_W, MAP_H);
  const world = new World(terrain, 20260610);
  world.addPlayer(HUMAN, 'allied', 5000);
  world.addPlayer(AI, 'soviet', 5000);

  // 玩家基地（左上）
  world.spawnUnit(HUMAN, 'conyard', 4, 5);
  world.spawnUnit(HUMAN, 'powerplant', 8, 5);
  world.spawnUnit(HUMAN, 'refinery', 4, 9); // 附带矿车
  // AI 基地（右下）
  world.spawnUnit(AI, 'conyard', MAP_W - 7, MAP_H - 8);
  world.spawnUnit(AI, 'powerplant', MAP_W - 11, MAP_H - 8);
  world.spawnUnit(AI, 'refinery', MAP_W - 7, MAP_H - 4);

  // 矿田：两处
  const orePatches = [
    { cx: 10, cy: 12 },
    { cx: MAP_W - 13, cy: MAP_H - 15 },
    { cx: 20, cy: 22 },
  ];
  for (const patch of orePatches) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 3) world.setOre(patch.cx + dx, patch.cy + dy, 600);
      }
    }
  }

  const ai = new SimpleAI(AI);

  // —— Pixi ——
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#06090c',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.innerHTML = '';
  root.appendChild(app.canvas);

  const art = buildArt(app, world.rules.units.values());
  const renderer = new WorldRenderer(app, world, art);
  app.stage.addChild(renderer.stage);
  const ghost = new Graphics();
  renderer.stage.addChild(ghost);

  const camera = new Camera(app, renderer.stage);
  camera.attach(app.canvas, [1]); // 中键平移 + 滚轮缩放
  camera.x = cornerX(6, 7);
  camera.y = cornerY(6, 7);
  camera.zoom = 1;
  camera.apply();

  // —— UI ——
  root.insertAdjacentHTML(
    'beforeend',
    `<div class="pl-top">
       <span>资金 <b id="pl-credits">0</b></span>
       <span>电力 <b id="pl-power" class="pwr-ok">0</b></span>
       <span id="pl-hud" style="color:#5f6c76;font-family:ui-monospace,monospace"></span>
       <a href="#">退出</a>
     </div>
     <div class="pl-side">
       <canvas class="pl-mini" id="pl-mini" width="336" height="260"></canvas>
       <div class="pl-tabs" id="pl-tabs"></div>
       <div class="pl-build" id="pl-build"></div>
     </div>
     <div class="pl-hint">左键选/框选 · 右键移动或攻击 · 中键拖动 · 滚轮缩放</div>
     <div id="pl-selbox"></div>`,
  );
  const creditsEl = root.querySelector('#pl-credits') as HTMLElement;
  const powerEl = root.querySelector('#pl-power') as HTMLElement;
  const hudEl = root.querySelector('#pl-hud') as HTMLElement;
  const tabsEl = root.querySelector('#pl-tabs') as HTMLElement;
  const buildEl = root.querySelector('#pl-build') as HTMLElement;
  const miniEl = root.querySelector('#pl-mini') as HTMLCanvasElement;
  const selBox = root.querySelector('#pl-selbox') as HTMLElement;

  let activeTab: ProdCategory = 'building';
  for (const cat of ['building', 'infantry', 'vehicle'] as ProdCategory[]) {
    const btn = document.createElement('button');
    btn.textContent = CATEGORY_LABEL[cat];
    btn.className = cat === activeTab ? 'on' : '';
    btn.addEventListener('click', () => {
      activeTab = cat;
      for (const b of tabsEl.children) b.className = '';
      btn.className = 'on';
      rebuildSidebar();
    });
    tabsEl.appendChild(btn);
  }

  // 建造按钮缓存
  interface CameoCell {
    el: HTMLElement;
    prog: HTMLElement;
    ready: HTMLElement;
    type: UnitType;
  }
  let cameos: CameoCell[] = [];
  let placingType: UnitType | null = null;

  function rebuildSidebar(): void {
    buildEl.innerHTML = '';
    cameos = [];
    const all = [...world.rules.units.values()].filter((u) => categoryOf(u) === activeTab);
    for (const type of all) {
      const cell = document.createElement('div');
      cell.className = 'pl-cameo';
      const cv = makeCameo(type.id, type.name);
      cell.appendChild(cv);
      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.textContent = `$${type.cost}`;
      cell.appendChild(cost);
      const prog = document.createElement('div');
      prog.className = 'prog';
      prog.style.display = 'none';
      cell.appendChild(prog);
      const ready = document.createElement('div');
      ready.className = 'ready';
      ready.textContent = '就绪';
      ready.style.display = 'none';
      cell.appendChild(ready);
      cell.addEventListener('click', () => onCameoClick(type));
      buildEl.appendChild(cell);
      cameos.push({ el: cell, prog, ready, type });
    }
    refreshSidebar();
  }

  function onCameoClick(type: UnitType): void {
    const q = world.queueFor(HUMAN, categoryOf(type));
    if (type.domain === 'building' && q?.readyToPlace && q.items[0] === type.id) {
      placingType = type; // 进入放置模式
      return;
    }
    queueCmd({ kind: 'produce', owner: HUMAN, typeId: type.id });
  }

  function refreshSidebar(): void {
    for (const c of cameos) {
      const buildable = world.canBuild(HUMAN, c.type);
      c.el.classList.toggle('disabled', !buildable);
      const q = world.queueFor(HUMAN, categoryOf(c.type));
      const isHead = q && q.items[0] === c.type.id;
      if (isHead && q.readyToPlace) {
        c.ready.style.display = 'flex';
        c.prog.style.display = 'none';
      } else if (isHead && q.items.length > 0) {
        const pct = Math.floor((q.progress / c.type.buildTime) * 100);
        c.prog.style.display = 'flex';
        c.prog.textContent = `${pct}%`;
        c.ready.style.display = 'none';
      } else {
        const count = q ? q.items.filter((i) => i === c.type.id).length : 0;
        c.prog.style.display = count > 0 ? 'flex' : 'none';
        if (count > 0) c.prog.textContent = `×${count}`;
        c.ready.style.display = 'none';
      }
    }
  }

  // —— 命令缓冲（本地直接 apply；M7 改为经服务器锁步） ——
  const pending: Command[] = [];
  function queueCmd(cmd: Command): void {
    pending.push(cmd);
  }

  // —— 输入 ——
  const selected = new Set<number>();
  let dragStart: { x: number; y: number } | null = null;

  function screenToCell(clientX: number, clientY: number): { x: number; y: number } {
    const rect = app.canvas.getBoundingClientRect();
    const w = camera.screenToWorld(clientX - rect.left, clientY - rect.top);
    const lep = screenToLepton(w.x, w.y);
    return { x: leptonToCell(lep.x), y: leptonToCell(lep.y) };
  }

  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  app.canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      if (placingType) {
        const cell = screenToCell(e.clientX, e.clientY);
        if (world.canPlace(HUMAN, placingType, cell.x, cell.y)) {
          queueCmd({ kind: 'place', owner: HUMAN, typeId: placingType.id, cellX: cell.x, cellY: cell.y });
          placingType = null;
        }
        return;
      }
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
        let best: { id: number; d: number } | null = null;
        for (const ent of world.entities.values()) {
          if (ent.owner !== HUMAN) continue;
          const type = world.rules.units.get(ent.typeId);
          if (!type || type.domain === 'building') continue;
          const gx = camera.zoom * leptonScreenX(ent) + renderer.stage.position.x;
          const gy = camera.zoom * leptonScreenY(ent) + renderer.stage.position.y;
          const d = Math.hypot(gx - (e.clientX - rect.left), gy - (e.clientY - rect.top));
          if (d < 26 && (!best || d < best.d)) best = { id: ent.id, d };
        }
        if (best) selected.add(best.id);
      } else {
        const x0 = Math.min(dragStart.x, e.clientX) - rect.left;
        const y0 = Math.min(dragStart.y, e.clientY) - rect.top;
        const x1 = x0 + w;
        const y1 = y0 + h;
        for (const ent of world.entities.values()) {
          if (ent.owner !== HUMAN) continue;
          const type = world.rules.units.get(ent.typeId);
          if (!type || type.domain === 'building') continue;
          const gx = camera.zoom * leptonScreenX(ent) + renderer.stage.position.x;
          const gy = camera.zoom * leptonScreenY(ent) + renderer.stage.position.y;
          if (gx >= x0 && gx <= x1 && gy >= y0 && gy <= y1) selected.add(ent.id);
        }
      }
      dragStart = null;
      selBox.style.display = 'none';
    }
    if (e.button === 2) {
      placingType = null;
      if (selected.size === 0) return;
      // 右键目标：敌方单位/建筑 → 攻击；否则移动
      const cell = screenToCell(e.clientX, e.clientY);
      const enemy = entityAtCell(cell.x, cell.y, AI);
      const ids = [...selected].sort((a, b) => a - b);
      if (enemy) {
        queueCmd({ kind: 'attack', entityIds: ids, targetId: enemy });
      } else if (cell.x >= 0 && cell.y >= 0 && cell.x < MAP_W && cell.y < MAP_H) {
        queueCmd({ kind: 'move', entityIds: ids, cellX: cell.x, cellY: cell.y });
      }
    }
  });

  function leptonScreenX(e: { x: number; y: number }): number {
    return ((e.x - e.y) * (TILE_W / 2)) / 256;
  }
  function leptonScreenY(e: { x: number; y: number }): number {
    return ((e.x + e.y) * (TILE_H / 2)) / 256;
  }
  function entityAtCell(cx: number, cy: number, owner: number): number | null {
    for (const e of world.entities.values()) {
      if (e.owner !== owner) continue;
      const type = world.rules.units.get(e.typeId);
      if (type?.building) {
        if (cx >= e.cellX && cx < e.cellX + type.building.footprintW && cy >= e.cellY && cy < e.cellY + type.building.footprintH) {
          return e.id;
        }
      } else if (e.cellX === cx && e.cellY === cy) {
        return e.id;
      }
    }
    return null;
  }

  // —— 小地图 ——
  function drawMinimap(): void {
    const ctx = miniEl.getContext('2d')!;
    const sx = miniEl.width / (MAP_W + MAP_H);
    const sy = miniEl.height / (MAP_W + MAP_H);
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, miniEl.width, miniEl.height);
    // 矿
    ctx.fillStyle = '#b8920f';
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (world.oreAt(x, y) > 0) ctx.fillRect((x - y + MAP_H) * sx, (x + y) * sy, 2, 2);
      }
    }
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      ctx.fillStyle = e.owner === HUMAN ? '#4f8fdd' : '#d05050';
      const cx = (e.cellX - e.cellY + MAP_H) * sx;
      const cy = (e.cellX + e.cellY) * sy;
      const s = type?.building ? 4 : 2;
      ctx.fillRect(cx, cy, s, s);
    }
  }

  // —— 放置预览 ——
  function drawGhost(): void {
    ghost.clear();
    if (!placingType?.building) return;
    const rect = app.canvas.getBoundingClientRect();
    const cell = screenToCell(lastPointer.x, lastPointer.y);
    void rect;
    const ok = world.canPlace(HUMAN, placingType, cell.x, cell.y);
    const b = placingType.building;
    const T = renderer.cellTopScreen(cell.x, cell.y);
    const R = renderer.cellTopScreen(cell.x + b.footprintW, cell.y);
    const B = renderer.cellTopScreen(cell.x + b.footprintW, cell.y + b.footprintH);
    const L = renderer.cellTopScreen(cell.x, cell.y + b.footprintH);
    ghost.poly([T.x, T.y, R.x, R.y, B.x, B.y, L.x, L.y]).fill({ color: ok ? 0x40e040 : 0xe04040, alpha: 0.35 });
    ghost.zIndex = 99999;
  }
  const lastPointer = { x: 0, y: 0 };
  app.canvas.addEventListener('pointermove', (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
  });

  // —— 主循环 ——
  // 模拟与渲染解耦：sim 由 setInterval 定时驱动（后台标签也持续推进，
  // 是 M7 锁步联机的正确形态：sim 节拍独立于显示刷新）；rAF 只做插值渲染。
  let aiTimer = 0;
  let over = false;
  let lastStepAt = performance.now();
  rebuildSidebar();

  function simTick(): void {
    if (over) return;
    renderer.commitInterpolation();
    if (++aiTimer >= 15) {
      aiTimer = 0;
      for (const c of ai.emit(world)) pending.push(c);
    }
    if (pending.length > 0) world.applyCommands(pending.splice(0));
    world.step();
    lastStepAt = performance.now();

    const p = world.players.get(HUMAN)!;
    creditsEl.textContent = String(p.credits);
    const net = p.powerProduced - p.powerDrained;
    powerEl.textContent = `${p.powerProduced}/${p.powerDrained}`;
    powerEl.className = net >= 0 ? 'pwr-ok' : 'pwr-low';
    hudEl.textContent = `t${world.tick} ${world.hash().toString(16).padStart(8, '0')}`;
    if (world.tick % 4 === 0) {
      refreshSidebar();
      drawMinimap();
    }
    if (world.players.get(AI)!.defeated || world.players.get(HUMAN)!.defeated) {
      over = true;
      const win = world.players.get(AI)!.defeated;
      const banner = document.createElement('div');
      banner.className = 'pl-banner';
      banner.style.color = win ? '#6fe06f' : '#e05050';
      banner.textContent = win ? '胜利！' : '战败';
      root.appendChild(banner);
    }
  }

  // 多步追赶：定时器在后台被限流时，醒来一次补跑积压的 tick（封顶防雪崩）
  let acc = 0;
  let prev = performance.now();
  const clock = setInterval(() => {
    const now = performance.now();
    acc += now - prev;
    prev = now;
    let steps = 0;
    while (acc >= TICK_MS && steps < 6 && !over) {
      simTick();
      acc -= TICK_MS;
      steps++;
    }
    if (acc > TICK_MS * 6) acc = 0; // 丢弃过量积压
  }, TICK_MS);

  app.ticker.add(() => {
    const alpha = Math.min(1, (performance.now() - lastStepAt) / TICK_MS);
    renderer.render(alpha, selected);
    drawGhost();
  });

  // 离开页面时停表（hashchange 会整页重载，这里多一层保险）
  window.addEventListener('hashchange', () => clearInterval(clock), { once: true });

  // 开发调试钩子：便于在被浏览器冻结的后台标签里手动驱动/检视
  if (import.meta.env.DEV) {
    (window as unknown as { __ra2play?: unknown }).__ra2play = {
      world,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) simTick();
      },
      queue: (typeId: string) => queueCmd({ kind: 'produce', owner: HUMAN, typeId }),
      place: (typeId: string, x: number, y: number) =>
        queueCmd({ kind: 'place', owner: HUMAN, typeId, cellX: x, cellY: y }),
    };
  }
}
