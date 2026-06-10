/**
 * 对局视图：渲染 + 输入 + 侧边栏 UI，与「sim 驱动方式」解耦。
 * 单机用 LocalDriver（本地直接 step + AI），联机用锁步 driver（经服务器）。
 * 视图只负责：把玩家操作转成 Command 暂存、被驱动方调用 stepWith 推进、插值渲染。
 */
import { Application, Graphics } from 'pixi.js';
import {
  World,
  categoryOf,
  leptonToCell,
  type Command,
  type ProdCategory,
  type UnitType,
} from '@ra2web/game';
import { Camera } from './camera';
import { audioBus } from './audio-bus';
import { cornerX, cornerY, screenToLepton, TILE_H, TILE_W } from './iso';
import { buildArt, makeCameo } from './placeholder-art';
import { RealArtProvider } from './real-art';
import { WorldRenderer } from './world-renderer';

const CATEGORY_LABEL: Record<ProdCategory, string> = {
  building: '建筑',
  infantry: '步兵',
  vehicle: '车辆',
};

export const MATCH_STYLE = `
.mv-root { position: fixed; inset: 0; overflow: hidden; background: #06090c;
  font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; color: #d8e0e6; touch-action: none; }
.mv-top { position: fixed; top: 0; left: 0; z-index: 20; display: flex; gap: 16px; align-items: center;
  padding: 8px 14px; background: rgba(8,12,16,.8); border-bottom-right-radius: 8px; }
.mv-top b { color: #f0d040; font-variant-numeric: tabular-nums; }
.mv-top .pwr-ok { color: #6fce6f; }
.mv-top .pwr-low { color: #e05050; }
.mv-top a { color: #6db3e8; text-decoration: none; }
.mv-net { color: #8a97a0; font-family: ui-monospace, monospace; font-size: 12px; }
.mv-net.stall { color: #e0b050; }
.mv-side { position: fixed; top: 0; right: 0; bottom: 0; width: 168px; z-index: 20;
  background: rgba(12,16,20,.92); border-left: 1px solid #243039; display: flex; flex-direction: column; }
.mv-mini { width: 168px; height: 130px; background: #000; border-bottom: 1px solid #243039; }
.mv-tabs { display: flex; }
.mv-tabs button { flex: 1; padding: 6px 0; background: #161e25; color: #9aa7b0; border: none;
  border-bottom: 2px solid transparent; cursor: pointer; font-size: 12px; }
.mv-tabs button.on { color: #fff; border-bottom-color: #6db3e8; background: #1d2933; }
.mv-build { flex: 1; overflow-y: auto; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
.mv-cameo { position: relative; cursor: pointer; border: 1px solid #2a3a48; border-radius: 4px; overflow: hidden; user-select: none; }
.mv-cameo.disabled { opacity: .35; cursor: not-allowed; }
.mv-cameo canvas { display: block; width: 100%; }
.mv-cameo .cost { position: absolute; right: 2px; bottom: 14px; font-size: 10px; color: #f0d040; text-shadow: 0 0 3px #000; }
.mv-cameo .prog { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; }
.mv-cameo .ready { position: absolute; inset: 0; border: 2px solid #6fe06f; box-sizing: border-box; display: flex; align-items: flex-start; justify-content: center; color: #6fe06f; font-size: 10px; }
.mv-hint { position: fixed; left: 50%; transform: translateX(-50%); bottom: 10px; z-index: 20; padding: 6px 14px; background: rgba(8,12,16,.8); border-radius: 16px; color: #9aa7b0; font-size: 12px; }
.mv-banner { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; background: rgba(4,6,8,.7); font-size: 44px; font-weight: 800; }
.mv-banner a { font-size: 16px; color: #6db3e8; }
#mv-selbox { position: fixed; border: 1px solid #7fd17f; background: rgba(120,220,120,.12); pointer-events: none; display: none; z-index: 19; }
.mv-bldbar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 44px; z-index: 21; display: none;
  align-items: center; gap: 8px; padding: 6px 10px; background: rgba(12,16,20,.95); border: 1px solid #2a3a48; border-radius: 8px; }
.mv-bldbar b { color: #e8eef2; }
.mv-bldbar button { padding: 5px 12px; border: 1px solid #2a3a48; border-radius: 5px; background: #1d2730; color: #c8d2da; cursor: pointer; font-size: 13px; }
.mv-bldbar button.on { background: #2d6fb0; color: #fff; }
.mv-bldbar .sell { color: #e08080; }
.mv-bldbar .hint { color: #8a97a0; font-size: 12px; }
.mv-tip { position: fixed; left: 50%; top: 80px; transform: translateX(-50%); z-index: 25; max-width: 420px;
  background: rgba(14,20,26,.96); border: 1px solid #2d6fb0; border-radius: 10px; padding: 16px 18px; color: #d8e0e6; }
.mv-tip h3 { margin: 0 0 8px; font-size: 15px; color: #6db3e8; }
.mv-tip ul { margin: 0; padding-left: 18px; line-height: 1.7; font-size: 13px; }
.mv-tip button { margin-top: 12px; width: 100%; padding: 8px; border: none; border-radius: 6px; background: #2d6fb0; color: #fff; cursor: pointer; }
@media (max-width: 760px) {
  .mv-side { top: auto; bottom: 0; left: 0; width: 100%; height: 132px; flex-direction: row; border-left: none; border-top: 1px solid #243039; }
  .mv-mini { display: none; }
  .mv-tabs { flex-direction: column; width: 56px; }
  .mv-build { grid-template-columns: repeat(auto-fill, 56px); }
}
`;

interface CameoCell {
  el: HTMLElement;
  prog: HTMLElement;
  ready: HTMLElement;
  type: UnitType;
}

export class MatchView {
  readonly app = new Application();
  private renderer!: WorldRenderer;
  private camera!: Camera;
  private ghost!: Graphics;
  private readonly selected = new Set<number>();
  private selectedBuilding: number | null = null;
  private readonly controlGroups = new Map<number, number[]>();
  private localCommands: Command[] = [];
  private activeTab: ProdCategory = 'building';
  private cameos: CameoCell[] = [];
  private placingType: UnitType | null = null;
  /** 已按 A：下一次点击为攻击移动。 */
  private attackMoveArmed = false;
  private over = false;
  /** 上一帧各分类队列是否就绪（用于「建造完成」提示音的边沿检测）。 */
  private prevReady: Record<string, boolean> = {};
  private lastPointer = { x: 0, y: 0 };
  private dragStart: { x: number; y: number } | null = null;
  private lastStepAt = 0;
  /** 网络状态行文本（联机时由 driver 写）。 */
  netStatus = '';
  /** 设置后，结束横幅显示「再来一局」。 */
  onRestart: (() => void) | null = null;

  // DOM 引用
  private creditsEl!: HTMLElement;
  private powerEl!: HTMLElement;
  private netEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private miniEl!: HTMLCanvasElement;
  private selBox!: HTMLElement;
  private bldBar!: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    readonly world: World,
    readonly localPlayerId: number,
    readonly mapW: number,
    readonly mapH: number,
  ) {}

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: window,
      background: '#06090c',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.root.innerHTML = '';
    this.root.className = 'mv-root';
    this.root.appendChild(this.app.canvas);

    // 加载遮罩（真实素材烘焙可能耗时约 1 秒，避免黑屏）
    const loading = document.createElement('div');
    loading.style.cssText =
      'position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;' +
      'background:#06090c;color:#9aa7b0;font:16px system-ui,sans-serif';
    loading.textContent = '加载素材中…';
    this.root.appendChild(loading);
    await new Promise((r) => setTimeout(r, 0)); // 让遮罩先绘制

    const art = buildArt(this.app, this.world.rules.units.values());
    // 真实素材（有 TS 文件则用，否则回退占位）
    let realArt: RealArtProvider | null = new RealArtProvider(this.app);
    if (await realArt.tryInit()) {
      const typeIds = [...this.world.rules.units.values()].map((u) => u.id);
      // 双方阵营美术都预载（敌方可能是另一阵营）
      await realArt.preload('allied', typeIds);
      await realArt.preload('soviet', typeIds);
    } else {
      realArt = null;
    }
    this.renderer = new WorldRenderer(this.app, this.world, art, this.localPlayerId, realArt);
    this.renderer.onEvent = (kind) => audioBus.play(kind);
    this.app.stage.addChild(this.renderer.stage);
    this.ghost = new Graphics();
    this.renderer.stage.addChild(this.ghost);

    this.camera = new Camera(this.app, this.renderer.stage);
    this.camera.attach(this.app.canvas, [1]);
    const spawn = [...this.world.entities.values()].find(
      (e) => e.owner === this.localPlayerId && this.world.rules.units.get(e.typeId)?.building,
    );
    this.camera.x = cornerX(spawn?.cellX ?? this.mapW / 2, spawn?.cellY ?? this.mapH / 2);
    this.camera.y = cornerY(spawn?.cellX ?? this.mapW / 2, spawn?.cellY ?? this.mapH / 2);
    this.camera.zoom = 1;
    this.camera.apply();

    this.buildDom();
    this.bindInput();
    this.rebuildSidebar();
    this.lastStepAt = performance.now();
    loading.remove();
    this.maybeShowTip();

    if (import.meta.env.DEV) {
      (window as unknown as { __ra2view?: unknown }).__ra2view = {
        view: this,
        selected: this.selected,
        camera: this.camera,
      };
    }
  }

  private buildDom(): void {
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="mv-top">
         <span>资金 <b id="mv-credits">0</b></span>
         <span>电力 <b id="mv-power" class="pwr-ok">0</b></span>
         <span class="mv-net" id="mv-net"></span>
         <span style="flex:1"></span>
         <button id="mv-mute" style="background:none;border:none;color:#9aa7b0;cursor:pointer;font-size:15px">🔊</button>
         <a href="#">退出</a>
       </div>
       <div class="mv-side">
         <canvas class="mv-mini" id="mv-mini" width="336" height="260"></canvas>
         <div class="mv-tabs" id="mv-tabs"></div>
         <div class="mv-build" id="mv-build"></div>
       </div>
       <div class="mv-hint">${
         matchMedia('(pointer: coarse)').matches
           ? '点选单位/建筑 · 拖动框选 · 单指点地移动/攻击 · 双指平移缩放'
           : '左键选/框选 · 右键移动或攻击 · A 攻击移动 · Ctrl+数字编队 · 中键拖动 · 滚轮缩放'
       }</div>
       <div class="mv-bldbar" id="mv-bldbar"></div>
       <div id="mv-selbox"></div>`,
    );
    this.creditsEl = this.root.querySelector('#mv-credits')!;
    this.powerEl = this.root.querySelector('#mv-power')!;
    this.netEl = this.root.querySelector('#mv-net')!;
    this.tabsEl = this.root.querySelector('#mv-tabs')!;
    this.buildEl = this.root.querySelector('#mv-build')!;
    this.miniEl = this.root.querySelector('#mv-mini')!;
    this.selBox = this.root.querySelector('#mv-selbox')!;
    this.bldBar = this.root.querySelector('#mv-bldbar')!;

    const muteBtn = this.root.querySelector('#mv-mute') as HTMLButtonElement;
    muteBtn.addEventListener('click', () => {
      muteBtn.textContent = audioBus.toggleMute() ? '🔇' : '🔊';
    });
    // 首次交互解锁音频（浏览器自动播放策略）
    const unlock = (): void => audioBus.resume();
    this.app.canvas.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    for (const cat of ['building', 'infantry', 'vehicle'] as ProdCategory[]) {
      const btn = document.createElement('button');
      btn.textContent = CATEGORY_LABEL[cat];
      btn.className = cat === this.activeTab ? 'on' : '';
      btn.addEventListener('click', () => {
        this.activeTab = cat;
        for (const b of this.tabsEl.children) b.className = '';
        btn.className = 'on';
        this.rebuildSidebar();
      });
      this.tabsEl.appendChild(btn);
    }
  }

  private rebuildSidebar(): void {
    this.buildEl.innerHTML = '';
    this.cameos = [];
    const localSide = this.world.players.get(this.localPlayerId)?.side;
    const all = [...this.world.rules.units.values()].filter(
      (u) => categoryOf(u) === this.activeTab && (!localSide || u.side === localSide || u.id === 'harvester'),
    );
    for (const type of all) {
      const cell = document.createElement('div');
      cell.className = 'mv-cameo';
      cell.appendChild(makeCameo(type.id, type.name));
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
      cell.addEventListener('click', () => this.onCameoClick(type));
      this.buildEl.appendChild(cell);
      this.cameos.push({ el: cell, prog, ready, type });
    }
    this.refreshSidebar();
  }

  private onCameoClick(type: UnitType): void {
    audioBus.resume();
    const q = this.world.queueFor(this.localPlayerId, categoryOf(type));
    if (type.domain === 'building' && q?.readyToPlace && q.items[0] === type.id) {
      this.placingType = type;
      audioBus.play('select');
      return;
    }
    audioBus.play('select');
    this.emit({ kind: 'produce', owner: this.localPlayerId, typeId: type.id });
  }

  private refreshSidebar(): void {
    for (const c of this.cameos) {
      c.el.classList.toggle('disabled', !this.world.canBuild(this.localPlayerId, c.type));
      const q = this.world.queueFor(this.localPlayerId, categoryOf(c.type));
      const isHead = q && q.items[0] === c.type.id;
      if (isHead && q.readyToPlace) {
        c.ready.style.display = 'flex';
        c.prog.style.display = 'none';
      } else if (isHead && q.items.length > 0) {
        c.prog.style.display = 'flex';
        c.prog.textContent = `${Math.floor((q.progress / c.type.buildTime) * 100)}%`;
        c.ready.style.display = 'none';
      } else {
        const count = q ? q.items.filter((i) => i === c.type.id).length : 0;
        c.prog.style.display = count > 0 ? 'flex' : 'none';
        if (count > 0) c.prog.textContent = `×${count}`;
        c.ready.style.display = 'none';
      }
    }
  }

  private emit(cmd: Command): void {
    this.localCommands.push(cmd);
  }

  /** 驱动方每个本地 tick 取走本地命令（单机直接 apply / 联机送服务器）。 */
  takeLocalCommands(): Command[] {
    if (this.localCommands.length === 0) return [];
    const out = this.localCommands;
    this.localCommands = [];
    return out;
  }

  // —— 输入 ——
  private screenToCell(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(clientX - rect.left, clientY - rect.top);
    const lep = screenToLepton(w.x, w.y);
    return { x: leptonToCell(lep.x), y: leptonToCell(lep.y) };
  }

  private leptonScreenX(e: { x: number; y: number }): number {
    return ((e.x - e.y) * (TILE_W / 2)) / 256;
  }
  private leptonScreenY(e: { x: number; y: number }): number {
    return ((e.x + e.y) * (TILE_H / 2)) / 256;
  }

  private entityAtCell(cx: number, cy: number, enemyOf: number): number | null {
    for (const e of this.world.entities.values()) {
      if (e.owner === enemyOf) continue;
      const type = this.world.rules.units.get(e.typeId);
      if (type?.building) {
        if (cx >= e.cellX && cx < e.cellX + type.building.footprintW && cy >= e.cellY && cy < e.cellY + type.building.footprintH) return e.id;
      } else if (e.cellX === cx && e.cellY === cy) {
        return e.id;
      }
    }
    return null;
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      if (this.dragStart) {
        const x0 = Math.min(this.dragStart.x, e.clientX);
        const y0 = Math.min(this.dragStart.y, e.clientY);
        this.selBox.style.display = 'block';
        this.selBox.style.left = `${x0}px`;
        this.selBox.style.top = `${y0}px`;
        this.selBox.style.width = `${Math.abs(e.clientX - this.dragStart.x)}px`;
        this.selBox.style.height = `${Math.abs(e.clientY - this.dragStart.y)}px`;
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if (this.placingType) {
        const cell = this.screenToCell(e.clientX, e.clientY);
        if (this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
          this.emit({ kind: 'place', owner: this.localPlayerId, typeId: this.placingType.id, cellX: cell.x, cellY: cell.y });
          this.placingType = null;
          audioBus.play('place');
        }
        return;
      }
      if (this.attackMoveArmed && this.selected.size > 0) {
        const cell = this.screenToCell(e.clientX, e.clientY);
        if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
          this.emit({ kind: 'attackMove', entityIds: [...this.selected].sort((a, b) => a - b), cellX: cell.x, cellY: cell.y });
          audioBus.play('select');
        }
        this.attackMoveArmed = false;
        return;
      }
      this.dragStart = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0 && this.dragStart) {
        this.finishSelection(e);
      }
      if (e.button === 2) {
        this.placingType = null;
        this.issueOrder(e);
      }
    });
    this.bindTouch();
    this.bindKeyboard();
  }

  /** 编队（Ctrl+数字 设组，数字 选组）+ A 攻击移动 + Esc 取消放置。 */
  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        this.placingType = null;
        this.attackMoveArmed = false;
        this.selected.clear();
        this.selectBuilding(null);
        return;
      }
      if ((e.key === 'a' || e.key === 'A') && this.selected.size > 0) {
        this.attackMoveArmed = true; // 下次左键点地 = 攻击移动
        this.setNetStatus('攻击移动：点击目标地点');
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        const g = Number(e.key);
        if (e.ctrlKey || e.metaKey) {
          this.controlGroups.set(g, [...this.selected]);
        } else {
          const ids = this.controlGroups.get(g);
          if (ids) {
            this.selected.clear();
            for (const id of ids) if (this.world.entities.has(id)) this.selected.add(id);
          }
        }
        e.preventDefault();
      }
    });
  }

  /**
   * 触控手势：
   * - 单指轻点：点己方单位=选中；已有选择时点空地=移动、点敌人=攻击；放置态=落地
   * - 单指拖动：框选
   * - 双指：平移 + 捏合缩放
   */
  private bindTouch(): void {
    const canvas = this.app.canvas;
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
    let mode: 'idle' | 'box' | 'gesture' = 'idle';
    let prevMid: { x: number; y: number } | null = null;
    let prevDist = 0;
    const TAP_MOVE = 10;
    const TAP_MS = 300;

    const midAndDist = (): { mid: { x: number; y: number }; dist: number } => {
      const pts = [...pointers.values()];
      const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      return { mid, dist };
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      if (pointers.size === 2) {
        mode = 'gesture';
        this.selBox.style.display = 'none';
        const { mid, dist } = midAndDist();
        prevMid = mid;
        prevDist = dist;
      } else if (pointers.size === 1 && !this.placingType) {
        mode = 'idle';
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;

      if (mode === 'gesture' && pointers.size >= 2) {
        const rect = canvas.getBoundingClientRect();
        const { mid, dist } = midAndDist();
        if (prevMid) this.camera.panByScreen(mid.x - prevMid.x, mid.y - prevMid.y);
        if (prevDist > 0) this.camera.zoomAt(mid.x - rect.left, mid.y - rect.top, dist / prevDist);
        prevMid = mid;
        prevDist = dist;
        return;
      }
      if (pointers.size === 1 && !this.placingType) {
        const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
        if (mode === 'idle' && moved > TAP_MOVE) mode = 'box';
        if (mode === 'box') {
          const x0 = Math.min(p.sx, p.x);
          const y0 = Math.min(p.sy, p.y);
          this.selBox.style.display = 'block';
          this.selBox.style.left = `${x0}px`;
          this.selBox.style.top = `${y0}px`;
          this.selBox.style.width = `${Math.abs(p.x - p.sx)}px`;
          this.selBox.style.height = `${Math.abs(p.y - p.sy)}px`;
        }
      }
    });

    const onUp = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return;
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (!p) return;

      if (mode === 'gesture') {
        if (pointers.size < 2) {
          mode = pointers.size === 1 ? 'idle' : 'idle';
          prevMid = null;
        }
        return;
      }
      if (mode === 'box') {
        this.finishSelectionAt(p.sx, p.sy, p.x, p.y);
        mode = 'idle';
        return;
      }
      // 轻点
      const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
      const quick = performance.now() - p.t < TAP_MS;
      if (moved <= TAP_MOVE && quick) this.handleTap(p.x, p.y);
      mode = 'idle';
    };
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  /** 触控轻点：选中己方单位 / 对已选单位下达移动或攻击 / 放置建筑。 */
  private handleTap(clientX: number, clientY: number): void {
    if (this.placingType) {
      const cell = this.screenToCell(clientX, clientY);
      if (this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
        this.emit({ kind: 'place', owner: this.localPlayerId, typeId: this.placingType.id, cellX: cell.x, cellY: cell.y });
        this.placingType = null;
        audioBus.play('place');
      }
      return;
    }
    const rect = this.app.canvas.getBoundingClientRect();
    // 先看是否点中己方可移动单位 → 选中
    let best: { id: number; d: number } | null = null;
    for (const ent of this.world.entities.values()) {
      if (ent.owner !== this.localPlayerId) continue;
      const type = this.world.rules.units.get(ent.typeId);
      if (!type || type.domain === 'building') continue;
      const sx = this.camera.zoom * this.leptonScreenX(ent) + this.renderer.stage.position.x;
      const sy = this.camera.zoom * this.leptonScreenY(ent) + this.renderer.stage.position.y;
      const d = Math.hypot(sx - (clientX - rect.left), sy - (clientY - rect.top));
      if (d < 30 && (!best || d < best.d)) best = { id: ent.id, d };
    }
    if (best) {
      this.selected.clear();
      this.selected.add(best.id);
      this.selectBuilding(null);
      audioBus.play('select');
      return;
    }
    // 点中己方建筑 → 选中建筑（出修理/出售条）
    const cellB = this.screenToCell(clientX, clientY);
    const bld = this.ownBuildingAtCell(cellB.x, cellB.y);
    if (bld !== null && this.selected.size === 0) {
      this.selectBuilding(bld);
      audioBus.play('select');
      return;
    }
    // 否则：对已有选择下令
    if (this.selected.size > 0) {
      const cell = this.screenToCell(clientX, clientY);
      const enemy = this.entityAtCell(cell.x, cell.y, this.localPlayerId);
      const ids = [...this.selected].sort((a, b) => a - b);
      if (enemy !== null) this.emit({ kind: 'attack', entityIds: ids, targetId: enemy });
      else if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
        this.emit({ kind: 'move', entityIds: ids, cellX: cell.x, cellY: cell.y });
      }
      audioBus.play('select');
    }
  }

  private finishSelection(e: PointerEvent): void {
    this.finishSelectionAt(this.dragStart!.x, this.dragStart!.y, e.clientX, e.clientY);
    this.dragStart = null;
  }

  /** 框选：选中范围内本方可移动单位（客户端坐标）。 */
  private finishSelectionAt(startX: number, startY: number, endX: number, endY: number): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    this.selected.clear();
    const screenOf = (ent: { x: number; y: number }): { x: number; y: number } => ({
      x: this.camera.zoom * this.leptonScreenX(ent) + this.renderer.stage.position.x,
      y: this.camera.zoom * this.leptonScreenY(ent) + this.renderer.stage.position.y,
    });
    if (w < 6 && h < 6) {
      let best: { id: number; d: number } | null = null;
      for (const ent of this.world.entities.values()) {
        if (ent.owner !== this.localPlayerId) continue;
        const type = this.world.rules.units.get(ent.typeId);
        if (!type || type.domain === 'building') continue;
        const s = screenOf(ent);
        const d = Math.hypot(s.x - (endX - rect.left), s.y - (endY - rect.top));
        if (d < 26 && (!best || d < best.d)) best = { id: ent.id, d };
      }
      if (best) {
        this.selected.add(best.id);
        this.selectBuilding(null);
      } else {
        // 没点中单位 → 试点中己方建筑
        const cell = this.screenToCell(endX, endY);
        const b = this.ownBuildingAtCell(cell.x, cell.y);
        this.selectBuilding(b);
      }
    } else {
      const x0 = Math.min(startX, endX) - rect.left;
      const y0 = Math.min(startY, endY) - rect.top;
      for (const ent of this.world.entities.values()) {
        if (ent.owner !== this.localPlayerId) continue;
        const type = this.world.rules.units.get(ent.typeId);
        if (!type || type.domain === 'building') continue;
        const s = screenOf(ent);
        if (s.x >= x0 && s.x <= x0 + w && s.y >= y0 && s.y <= y0 + h) this.selected.add(ent.id);
      }
      if (this.selected.size > 0) this.selectBuilding(null);
    }
    this.selBox.style.display = 'none';
  }

  private issueOrder(e: PointerEvent): void {
    const cell = this.screenToCell(e.clientX, e.clientY);
    // 选中了生产建筑 → 右键设集结点
    if (this.selectedBuilding !== null && this.selected.size === 0) {
      const b = this.world.entities.get(this.selectedBuilding);
      const provides = b && this.world.rules.units.get(b.typeId)?.building?.provides;
      if (b && (provides === 'barracks' || provides === 'warfactory' || provides === 'conyard')) {
        if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
          this.emit({ kind: 'setRally', owner: this.localPlayerId, buildingId: b.id, cellX: cell.x, cellY: cell.y });
          audioBus.play('select');
        }
        return;
      }
    }
    if (this.selected.size === 0) return;
    const enemy = this.entityAtCell(cell.x, cell.y, this.localPlayerId);
    const ids = [...this.selected].sort((a, b) => a - b);
    if (enemy !== null) {
      this.emit({ kind: 'attack', entityIds: ids, targetId: enemy });
    } else if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
      this.emit({ kind: 'move', entityIds: ids, cellX: cell.x, cellY: cell.y });
    }
  }

  /** 返回该格上己方建筑 id，否则 null。 */
  private ownBuildingAtCell(cx: number, cy: number): number | null {
    for (const e of this.world.entities.values()) {
      if (e.owner !== this.localPlayerId) continue;
      const type = this.world.rules.units.get(e.typeId);
      if (!type?.building) continue;
      if (cx >= e.cellX && cx < e.cellX + type.building.footprintW && cy >= e.cellY && cy < e.cellY + type.building.footprintH) {
        return e.id;
      }
    }
    return null;
  }

  /** 选中建筑并刷新操作条（修理/出售/集结点）。 */
  private selectBuilding(id: number | null): void {
    this.selectedBuilding = id;
    if (id === null) {
      this.bldBar.style.display = 'none';
      return;
    }
    this.selected.clear();
    this.renderBuildingBar();
  }

  /** 首次进入对局显示一次操作提示。 */
  private maybeShowTip(): void {
    try {
      if (localStorage.getItem('ra2.seenHelp')) return;
    } catch {
      return;
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    const tip = document.createElement('div');
    tip.className = 'mv-tip';
    tip.innerHTML =
      `<h3>怎么玩</h3><ul>` +
      `<li>顺序造：发电厂 → 矿石精炼厂 → 兵营 → 战车工厂</li>` +
      `<li>采矿车自动采矿换钱；右侧栏点图标造单位/建筑</li>` +
      `<li>${touch ? '点选单位、单指点地移动/点敌攻击、双指缩放' : '左键选/框选，右键移动或攻击，A 攻击移动'}</li>` +
      `<li>点己方建筑可修理/出售；摧毁对方全部建筑获胜</li>` +
      `</ul><button id="mv-tip-ok">知道了</button>`;
    this.root.appendChild(tip);
    tip.querySelector('#mv-tip-ok')!.addEventListener('click', () => {
      try {
        localStorage.setItem('ra2.seenHelp', '1');
      } catch {
        /* ignore */
      }
      tip.remove();
    });
  }

  private renderBuildingBar(): void {
    const b = this.selectedBuilding !== null ? this.world.entities.get(this.selectedBuilding) : null;
    const type = b && this.world.rules.units.get(b.typeId);
    if (!b || !type?.building) {
      this.bldBar.style.display = 'none';
      this.selectedBuilding = null;
      return;
    }
    const provides = type.building.provides;
    const canRally = provides === 'barracks' || provides === 'warfactory' || provides === 'conyard';
    this.bldBar.style.display = 'flex';
    this.bldBar.innerHTML =
      `<b>${type.name}</b>` +
      `<button id="mv-repair" class="${b.repairing ? 'on' : ''}">${b.repairing ? '修理中' : '修理'}</button>` +
      `<button class="sell" id="mv-sell">出售</button>` +
      (canRally ? `<span class="hint">右键设集结点</span>` : '');
    this.bldBar.querySelector('#mv-repair')!.addEventListener('click', () => {
      this.emit({ kind: 'repair', owner: this.localPlayerId, entityId: b.id });
      audioBus.play('select');
    });
    this.bldBar.querySelector('#mv-sell')!.addEventListener('click', () => {
      this.emit({ kind: 'sell', owner: this.localPlayerId, entityId: b.id });
      audioBus.play('place');
      this.selectBuilding(null);
    });
  }

  // —— 推进 & 渲染 ——
  /** 由驱动方调用：应用本 tick 合并命令并推进一个 sim tick。 */
  stepWith(cmds: Command[]): void {
    if (this.over) return;
    this.renderer.commitInterpolation();
    if (cmds.length > 0) this.world.applyCommands(cmds);
    this.world.step();
    this.lastStepAt = performance.now();
    this.onAfterStep();
  }

  private onAfterStep(): void {
    const p = this.world.players.get(this.localPlayerId)!;
    this.creditsEl.textContent = String(p.credits);
    const net = p.powerProduced - p.powerDrained;
    this.powerEl.textContent = `${p.powerProduced}/${p.powerDrained}`;
    this.powerEl.className = net >= 0 ? 'pwr-ok' : 'pwr-low';
    if (this.world.tick % 4 === 0) {
      this.refreshSidebar();
      this.drawMinimap();
      if (this.selectedBuilding !== null) {
        if (this.world.entities.has(this.selectedBuilding)) this.renderBuildingBar();
        else this.selectBuilding(null);
      }
    }
    // 建筑建造完成（队列首项变为就绪）→ 提示音
    for (const cat of ['building', 'infantry', 'vehicle'] as const) {
      const q = this.world.queueFor(this.localPlayerId, cat);
      const ready = !!q?.readyToPlace;
      if (ready && !this.prevReady[cat]) audioBus.play('ready');
      this.prevReady[cat] = ready;
    }
    this.checkVictory();
  }

  private checkVictory(): void {
    if (this.over) return;
    const me = this.world.players.get(this.localPlayerId)!;
    const others = [...this.world.players.values()].filter((p) => p.id !== this.localPlayerId);
    const win = others.length > 0 && others.every((p) => p.defeated);
    if (me.defeated || win) {
      this.over = true;
      const banner = document.createElement('div');
      banner.className = 'mv-banner';
      banner.style.color = me.defeated && !win ? '#e05050' : '#6fe06f';
      banner.innerHTML =
        `<div>${me.defeated && !win ? '战败' : '胜利！'}</div>` +
        (this.onRestart ? `<a href="#" id="mv-restart">再来一局</a>` : '') +
        `<a href="#">返回首页</a>`;
      this.root.appendChild(banner);
      const restart = banner.querySelector('#mv-restart');
      restart?.addEventListener('click', (e) => {
        e.preventDefault();
        this.onRestart?.();
      });
    }
  }

  setNetStatus(text: string, stall = false): void {
    this.netStatus = text;
    this.netEl.textContent = text;
    this.netEl.classList.toggle('stall', stall);
  }

  /** rAF 渲染（插值）。返回是否已结束。 */
  render(): void {
    const alpha = Math.min(1, (performance.now() - this.lastStepAt) / (1000 / 15));
    this.renderer.render(alpha, this.selected);
    this.drawGhost();
  }

  private drawGhost(): void {
    this.ghost.clear();
    if (!this.placingType?.building) return;
    const cell = this.screenToCell(this.lastPointer.x, this.lastPointer.y);
    const ok = this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y);
    const b = this.placingType.building;
    const T = this.renderer.cellTopScreen(cell.x, cell.y);
    const R = this.renderer.cellTopScreen(cell.x + b.footprintW, cell.y);
    const B = this.renderer.cellTopScreen(cell.x + b.footprintW, cell.y + b.footprintH);
    const L = this.renderer.cellTopScreen(cell.x, cell.y + b.footprintH);
    this.ghost.poly([T.x, T.y, R.x, R.y, B.x, B.y, L.x, L.y]).fill({ color: ok ? 0x40e040 : 0xe04040, alpha: 0.35 });
    this.ghost.zIndex = 99999;
  }

  private drawMinimap(): void {
    const ctx = this.miniEl.getContext('2d')!;
    const sx = this.miniEl.width / (this.mapW + this.mapH);
    const sy = this.miniEl.height / (this.mapW + this.mapH);
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, this.miniEl.width, this.miniEl.height);
    ctx.fillStyle = '#b8920f';
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        // 仅已探索区域显示矿
        if (this.world.oreAt(x, y) > 0 && this.renderer.cellExplored(x, y)) {
          ctx.fillRect((x - y + this.mapH) * sx, (x + y) * sy, 2, 2);
        }
      }
    }
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      const own = e.owner === this.localPlayerId;
      // 敌方：建筑须已探索、单位须当前可见，才在小地图显示（尊重迷雾）
      if (!own) {
        if (type?.building ? !this.renderer.cellExplored(e.cellX, e.cellY) : !this.renderer.isCellVisible(e.cellX, e.cellY)) {
          continue;
        }
      }
      ctx.fillStyle = own ? '#4f8fdd' : '#d05050';
      const s = type?.building ? 4 : 2;
      ctx.fillRect((e.cellX - e.cellY + this.mapH) * sx, (e.cellX + e.cellY) * sy, s, s);
    }
  }
}
