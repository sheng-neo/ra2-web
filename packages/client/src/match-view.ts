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
  type Stance,
  type UnitType,
} from '@ra2web/game';
import { Camera } from './camera';
import { audioBus } from './audio-bus';
import { bgm } from './bgm';
import { cornerX, cornerY, screenToLepton, TILE_H, TILE_W } from './iso';
import { buildArt, makeCameo } from './placeholder-art';
import { RealArtProvider } from './real-art';
import { WorldRenderer } from './world-renderer';

const CATEGORY_LABEL: Record<ProdCategory, string> = {
  building: '建筑',
  infantry: '步兵',
  vehicle: '车辆',
};

/** 单位语音应答池（事件→泰伯利亚之日步兵语音文件，详见 audio-bus VOICE_FILES）。 */
const VOICE_POOL: Record<'select' | 'move' | 'attack', string[]> = {
  select: ['15-i012', '15-i006', '15-i042', '15-i000', '15-i002'],
  move: ['15-i018', '15-i022', '15-i024', '15-i016'],
  attack: ['15-i046', '15-i022'],
};

/** 作战姿态循环顺序与中文/单字显示（点击循环切换）。 */
const STANCE_ORDER: Stance[] = ['guard', 'aggressive', 'holdground', 'holdfire'];
const STANCE_GLYPH: Record<Stance, string> = { guard: '戒', aggressive: '猛', holdground: '守', holdfire: '禁' };
const STANCE_NAME: Record<Stance, string> = { guard: '警戒', aggressive: '进攻', holdground: '坚守', holdfire: '不还火' };

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
.mv-cameo .cancel { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background: rgba(180,40,40,.92); color: #fff; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; line-height: 1; box-shadow: 0 0 0 1px #000; }
.mv-cameo .qcount { position: absolute; top: 2px; left: 2px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 8px; background: rgba(8,12,16,.85); color: #f0d040; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; line-height: 1; box-shadow: 0 0 0 1px #000; }
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
.mv-unitbar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 44px; z-index: 21; display: none;
  gap: 8px; padding: 6px; background: rgba(12,16,20,.95); border: 1px solid #2a3a48; border-radius: 9px; }
.mv-unitbar.show { display: flex; }
.mv-unitbar button { min-width: 46px; min-height: 46px; padding: 6px; border: 1px solid #2a3a48; border-radius: 8px; background: #1d2730; color: #d6e2ea; cursor: pointer; font-size: 20px; font-weight: 600; }
.mv-unitbar button.on { background: #2d6fb0; color: #fff; border-color: #3d8fd0; }
.mv-unitbar button.stop { color: #e0a860; }
.mv-unitbar button.harv { color: #f0d040; }
.mv-unitbar button.stance { color: #9ad0e0; }
.mv-unitbar button[hidden] { display: none; }
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
  /* 底部抽屉占 132px，把建筑/单位操作条与提示上移避免遮挡 */
  .mv-bldbar, .mv-unitbar { bottom: 142px; }
  .mv-hint { display: none; }
}
`;

interface CameoCell {
  el: HTMLElement;
  prog: HTMLElement;
  ready: HTMLElement;
  cancel: HTMLElement;
  count: HTMLElement;
  type: UnitType;
}

export class MatchView {
  readonly app = new Application();
  private renderer!: WorldRenderer;
  private camera!: Camera;
  private ghost!: Graphics;
  private pingG!: Graphics;
  /** 指令反馈光标（纯客户端表现，不入模拟）：下令时在目标格闪一下收缩环。 */
  private pings: { x: number; y: number; kind: 'move' | 'attack'; born: number }[] = [];
  private readonly selected = new Set<number>();
  private selectedBuilding: number | null = null;
  private readonly controlGroups = new Map<number, number[]>();
  /** 触控双击检测（选同类）。 */
  private lastTapAt = 0;
  private lastTapPos = { x: 0, y: 0 };
  private localCommands: Command[] = [];
  private activeTab: ProdCategory = 'building';
  private cameos: CameoCell[] = [];
  private placingType: UnitType | null = null;
  /** 已按 A：下一次点击为攻击移动。 */
  private attackMoveArmed = false;
  /** 已按 P：下一次点击为巡逻终点。 */
  private patrolArmed = false;
  private over = false;
  /** 上一帧各分类队列是否就绪（用于「建造完成」提示音的边沿检测）。 */
  private prevReady: Record<string, boolean> = {};
  private lastPointer = { x: -1, y: -1 };
  private overCanvas = false;
  private midDrag: { x: number; y: number } | null = null;
  private readonly panKeys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private lastStepAt = 0;
  private voiceSeq = 0;
  private readonly isTouch = matchMedia('(pointer: coarse)').matches;
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
  private unitBar!: HTMLElement;
  /** 触控：选中单位后下方操作条选定的待执行命令（下次点地/点目标执行）。
   *  攻=点敌锁定/点地攻击移动；巡=巡逻；移=普通移动。 */
  private pendingAction: 'move' | 'attack' | 'patrol' | null = null;
  /** 触控：点了「集结点」按钮后待设集结点的生产建筑 id（下次点地执行）。 */
  private pendingRally: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    readonly world: World,
    readonly localPlayerId: number,
    readonly mapW: number,
    readonly mapH: number,
  ) {}

  async init(): Promise<void> {
    bgm.stop(); // 正式对战开始：停掉首页/设置阶段的背景音乐
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
    void audioBus.loadRealSounds(); // 本机有 Sounds.mix 则用真实 TS 音效（无则合成音）
    this.app.stage.addChild(this.renderer.stage);
    this.ghost = new Graphics();
    this.renderer.stage.addChild(this.ghost);
    this.pingG = new Graphics();
    this.renderer.stage.addChild(this.pingG);

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
        audio: audioBus,
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
           : '左键选/框选 · 双击选同类 · 右键移动或攻击 · A 攻击移动 · S 停止 · Ctrl+数字编队 · 中键/方向键平移 · 滚轮缩放'
       }</div>
       <div class="mv-bldbar" id="mv-bldbar"></div>
       <div class="mv-unitbar" id="mv-unitbar">
         <button data-act="move" title="移动（无视沿途敌人直达）">移</button>
         <button data-act="attack" title="攻击：点敌锁定歼灭，点空地=攻击移动（沿途逐个交战）">攻</button>
         <button data-act="patrol" title="巡逻（两点间往返警戒）">巡</button>
         <button class="stance" data-act="stance" title="作战姿态（点击循环：警戒→进攻→坚守→不还火）">戒</button>
         <button class="harv" data-act="harvest" title="采矿 / 恢复采矿">采</button>
         <button class="stop" data-act="stop" title="停止">停</button>
       </div>
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
    this.unitBar = this.root.querySelector('#mv-unitbar')!;
    this.unitBar.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const act = (b as HTMLElement).dataset.act!;
        if (act === 'stop') {
          if (this.selected.size > 0) this.emit({ kind: 'stop', entityIds: [...this.selected].sort((a, c) => a - c) });
          this.pendingAction = null;
        } else if (act === 'harvest') {
          // 采矿车「采」：立即恢复自动采矿（自找最近矿田）。要指定矿点直接点矿即可。
          const hv = this.selectedHarvesterIds();
          if (hv.length > 0) {
            this.emit({ kind: 'harvest', entityIds: hv, cellX: -1, cellY: -1 });
            this.playUnitVoice('move', hv[0]!);
          }
          this.pendingAction = null;
        } else if (act === 'stance') {
          this.cycleStance(); // 立即循环切换作战姿态
          this.pendingAction = null;
        } else {
          this.pendingAction = this.pendingAction === act ? null : (act as 'move' | 'attack' | 'patrol');
        }
        audioBus.play('select');
        this.updateUnitBar();
      }),
    );

    // 点击小地图 → 相机跳转
    this.miniEl.addEventListener('pointerdown', (e) => {
      const rect = this.miniEl.getBoundingClientRect();
      const sx = this.miniEl.width / (this.mapW + this.mapH);
      const sy = this.miniEl.height / (this.mapW + this.mapH);
      const mx = ((e.clientX - rect.left) / rect.width) * this.miniEl.width;
      const my = ((e.clientY - rect.top) / rect.height) * this.miniEl.height;
      const a = mx / sx - this.mapH; // cx - cy
      const b = my / sy; // cx + cy
      const cx = (a + b) / 2;
      const cy = (b - a) / 2;
      this.camera.x = cornerX(cx, cy);
      this.camera.y = cornerY(cx, cy);
      this.camera.apply();
    });

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
      // 触控取消角标（手机没有右键）：有队列时显示，点它退掉该分类队首
      const cancel = document.createElement('div');
      cancel.className = 'cancel';
      cancel.textContent = '✕';
      cancel.style.display = 'none';
      cell.appendChild(cancel);
      const cancelHead = (): void => {
        const q = this.world.queueFor(this.localPlayerId, categoryOf(type));
        if (q && q.items.length > 0) {
          this.emit({ kind: 'cancel', owner: this.localPlayerId, category: categoryOf(type) });
          audioBus.play('select');
        }
      };
      cancel.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelHead();
      });
      // 队列数量角标（×N）：本类型排了几个就显示几个，多点几下一目了然
      const count = document.createElement('div');
      count.className = 'qcount';
      count.style.display = 'none';
      cell.appendChild(count);
      cell.addEventListener('click', () => this.onCameoClick(type));
      // 右键取消该分类队首（退款）
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cancelHead();
      });
      this.buildEl.appendChild(cell);
      this.cameos.push({ el: cell, prog, ready, cancel, count, type });
    }
    this.refreshSidebar();
  }

  private onCameoClick(type: UnitType): void {
    audioBus.resume();
    // 再点一次正在放置的建筑 → 取消放置（手机没有右键/Esc，避免卡在放置态）
    if (this.placingType === type) {
      this.placingType = null;
      audioBus.play('select');
      return;
    }
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
      // 触控取消角标：本分类有在造/排队/就绪项时显示（手机靠它取消，避免卡死）
      c.cancel.style.display = this.isTouch && q && q.items.length > 0 ? 'flex' : 'none';
      // 队列数量：本类型一共排了几个（含在造的那个）。≥2 才显示，让"多点几下"看得见排队
      const queued = q ? q.items.filter((i) => i === c.type.id).length : 0;
      c.count.style.display = queued >= 2 ? 'flex' : 'none';
      if (queued >= 2) c.count.textContent = `×${queued}`;
      if (isHead && q.readyToPlace) {
        c.ready.style.display = 'flex';
        c.prog.style.display = 'none';
      } else if (isHead && q.items.length > 0) {
        c.prog.style.display = 'flex';
        c.prog.textContent = `${Math.floor((q.progress / c.type.buildTime) * 100)}%`;
        c.ready.style.display = 'none';
      } else {
        c.prog.style.display = queued > 0 ? 'flex' : 'none';
        if (queued > 0) c.prog.textContent = `×${queued}`;
        c.ready.style.display = 'none';
      }
    }
  }

  private emit(cmd: Command): void {
    this.localCommands.push(cmd);
    // 指令反馈光标（纯客户端表现）：所有下令都经此函数，集中在此打一个目标格闪标
    if (cmd.kind === 'move' || cmd.kind === 'harvest') this.addPing(cmd.cellX, cmd.cellY, 'move');
    else if (cmd.kind === 'attackMove' || cmd.kind === 'patrol') this.addPing(cmd.cellX, cmd.cellY, 'attack');
    else if (cmd.kind === 'setRally') this.addPing(cmd.cellX, cmd.cellY, 'move');
    else if (cmd.kind === 'attack') {
      const t = this.world.entities.get(cmd.targetId);
      if (t) this.addPing(t.cellX, t.cellY, 'attack');
    }
  }

  /** 在目标格记录一次指令反馈闪标（越界忽略；限量防溢出）。 */
  private addPing(cellX: number, cellY: number, kind: 'move' | 'attack'): void {
    if (cellX < 0 || cellY < 0 || cellX >= this.mapW || cellY >= this.mapH) return;
    this.pings.push({ x: cellX, y: cellY, kind, born: performance.now() });
    if (this.pings.length > 24) this.pings.shift();
  }

  /** 画指令反馈：目标格上一个 ~500ms 收缩淡出的环（移动绿/攻击红）。纯表现，不入模拟。 */
  private drawPings(): void {
    this.pingG.clear();
    if (this.pings.length === 0) return;
    const now = performance.now();
    const LIFE = 520;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]!;
      const age = now - p.born;
      if (age >= LIFE) {
        this.pings.splice(i, 1);
        continue;
      }
      const t = age / LIFE; // 0→1
      const c = this.renderer.cellTopScreen(p.x, p.y);
      const cy = c.y + TILE_H / 2; // 落到格中心
      const radius = 26 - 18 * t; // 收缩
      const alpha = 0.9 * (1 - t);
      const color = p.kind === 'attack' ? 0xe05454 : 0x54e066;
      this.pingG.circle(c.x, cy, radius).stroke({ color, width: 2, alpha });
    }
    this.pingG.zIndex = 99998;
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
    canvas.addEventListener('pointerleave', () => {
      this.overCanvas = false; // 光标离开画布（移到侧栏/HUD/窗外）即停边缘滚屏
      this.midDrag = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.overCanvas = true;
      if (this.midDrag) {
        // 中键拖动平移地图
        this.camera.panByScreen(e.clientX - this.midDrag.x, e.clientY - this.midDrag.y);
        this.midDrag = { x: e.clientX, y: e.clientY };
      }
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
      if (e.pointerType === 'touch') return;
      if (e.button === 1) {
        e.preventDefault();
        this.midDrag = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      if (this.placingType) {
        const cell = this.screenToCell(e.clientX, e.clientY);
        if (this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
          this.emit({ kind: 'place', owner: this.localPlayerId, typeId: this.placingType.id, cellX: cell.x, cellY: cell.y });
          this.placingType = null;
          audioBus.play('place');
        }
        return;
      }
      if ((this.attackMoveArmed || this.patrolArmed) && this.selected.size > 0) {
        const cell = this.screenToCell(e.clientX, e.clientY);
        if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
          const ids = [...this.selected].sort((a, b) => a - b);
          this.emit({ kind: this.patrolArmed ? 'patrol' : 'attackMove', entityIds: ids, cellX: cell.x, cellY: cell.y });
          audioBus.play('select');
        }
        this.attackMoveArmed = false;
        this.patrolArmed = false;
        return;
      }
      this.dragStart = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 1) {
        this.midDrag = null;
        return;
      }
      if (e.button === 0 && this.dragStart) {
        this.finishSelection(e);
      }
      if (e.button === 2) {
        this.placingType = null;
        this.issueOrder(e);
      }
    });
    // 双击：选中屏内同类型己方单位
    canvas.addEventListener('dblclick', (e) => {
      this.selectSameTypeOnScreen(this.unitAtScreen(e.clientX, e.clientY));
    });
    this.bindTouch();
    this.bindKeyboard();
  }

  /** 编队（Ctrl+数字 设组，数字 选组）+ A 攻击移动 + Esc 取消放置。 */
  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.startsWith('Arrow')) {
        this.panKeys.add(e.key);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        this.placingType = null;
        this.attackMoveArmed = false;
        this.patrolArmed = false;
        this.selected.clear();
        this.selectBuilding(null);
        return;
      }
      if ((e.key === 'a' || e.key === 'A') && this.selected.size > 0) {
        this.attackMoveArmed = true; // 下次左键点地 = 攻击移动
        this.patrolArmed = false;
        this.setNetStatus('攻击移动：点击目标地点');
        return;
      }
      if ((e.key === 'p' || e.key === 'P') && this.selected.size > 0) {
        this.patrolArmed = true; // 下次左键点地 = 巡逻终点
        this.attackMoveArmed = false;
        this.setNetStatus('巡逻：点击折返终点');
        return;
      }
      if ((e.key === 's' || e.key === 'S') && this.selected.size > 0) {
        this.emit({ kind: 'stop', entityIds: [...this.selected].sort((a, b) => a - b) });
        return;
      }
      if ((e.key === 'g' || e.key === 'G') && this.selected.size > 0) {
        this.cycleStance(); // G：循环切换作战姿态（警戒/进攻/坚守/不还火）
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
    window.addEventListener('keyup', (e) => this.panKeys.delete(e.key));
    window.addEventListener('blur', () => this.panKeys.clear());
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
      if (moved <= TAP_MOVE && quick) {
        const now = performance.now();
        const dbl = now - this.lastTapAt < 320 && Math.hypot(p.x - this.lastTapPos.x, p.y - this.lastTapPos.y) < 28;
        const hit = this.unitAtScreen(p.x, p.y);
        if (dbl && hit !== null) {
          this.selectSameTypeOnScreen(hit); // 双击：选屏内所有同类型单位
          this.lastTapAt = 0;
        } else {
          this.handleTap(p.x, p.y);
          this.lastTapAt = now;
          this.lastTapPos = { x: p.x, y: p.y };
        }
      }
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
    // 触控：已选「集结点」→ 本次点地设为该生产建筑的集结点
    if (this.pendingRally !== null) {
      const cell = this.screenToCell(clientX, clientY);
      if (cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH) {
        this.emit({ kind: 'setRally', owner: this.localPlayerId, buildingId: this.pendingRally, cellX: cell.x, cellY: cell.y });
        audioBus.play('select');
      }
      this.pendingRally = null;
      this.renderBuildingBar();
      return;
    }
    // 触控操作条选了命令：本次点击执行该命令（取代右键），随后归位
    if (this.pendingAction && this.selected.size > 0) {
      const ids = [...this.selected].sort((a, b) => a - b);
      const cell = this.screenToCell(clientX, clientY);
      const inBounds = cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH;
      if (this.pendingAction === 'patrol') {
        if (inBounds) {
          this.emit({ kind: 'patrol', entityIds: ids, cellX: cell.x, cellY: cell.y });
          this.playUnitVoice('attack', ids[0]!);
        }
      } else if (this.pendingAction === 'attack') {
        // 攻：点中敌人=锁定歼灭该目标；点空地=攻击移动（沿途逐个停下交战），不再是普通移动
        const target = this.targetAt(clientX, clientY);
        if (target !== null) {
          this.emit({ kind: 'attack', entityIds: ids, targetId: target });
          this.playUnitVoice('attack', ids[0]!);
        } else if (inBounds) {
          this.emit({ kind: 'attackMove', entityIds: ids, cellX: cell.x, cellY: cell.y });
          this.playUnitVoice('attack', ids[0]!);
        }
      } else if (inBounds) {
        // 移：普通移动，无视沿途敌人直达
        this.emit({ kind: 'move', entityIds: ids, cellX: cell.x, cellY: cell.y });
        this.playUnitVoice('move', ids[0]!);
      }
      this.pendingAction = null;
      this.updateUnitBar();
      return;
    }
    // 先看是否点中己方可移动单位 → 选中（精灵框，单位优先于身后建筑）
    const hitUnit = this.unitAtScreen(clientX, clientY);
    if (hitUnit !== null) {
      this.selected.clear();
      this.selected.add(hitUnit);
      this.selectBuilding(null);
      this.playUnitVoice('select', hitUnit);
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
    // 否则：对已有选择下令（敌方单位优先于其身后建筑；点矿田则采矿车去采）
    if (this.selected.size > 0) {
      this.orderTo(clientX, clientY, [...this.selected].sort((a, b) => a - b));
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
      const hit = this.unitAtScreen(endX, endY);
      if (hit !== null) {
        this.selected.add(hit);
        this.selectBuilding(null);
        this.playUnitVoice('select', hit);
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
    this.orderTo(e.clientX, e.clientY, [...this.selected].sort((a, b) => a - b));
  }

  /** 屏幕坐标 → 命中的可移动单位 id。enemy=false 取己方、true 取敌方
   *  （敌方须在可见格内，受迷雾约束）。用精灵框而非脚底半径——单位精灵
   *  高、以脚底为锚，只按脚底半径会点不中本体（尤其被建筑遮挡时）；命中
   *  多个取最前者（屏幕最下方），使单位优先于其身后/上方的目标。 */
  private unitAtScreen(clientX: number, clientY: number, enemy = false): number | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const z = this.camera.zoom;
    let best: { id: number; sy: number } | null = null;
    for (const ent of this.world.entities.values()) {
      if (enemy !== (ent.owner !== this.localPlayerId)) continue;
      const type = this.world.rules.units.get(ent.typeId);
      if (!type || type.domain === 'building') continue;
      if (enemy && !this.renderer.isCellVisible(ent.cellX, ent.cellY)) continue;
      const sx = z * this.leptonScreenX(ent) + this.renderer.stage.position.x;
      const sy = z * this.leptonScreenY(ent) + this.renderer.stage.position.y;
      const dx = px - sx;
      const dy = py - sy;
      // 脚底为原点：本体向上 ~46px、向下 ~12px、左右 ~24px（随缩放）
      if (dx >= -24 * z && dx <= 24 * z && dy >= -46 * z && dy <= 12 * z && (!best || sy > best.sy)) {
        best = { id: ent.id, sy };
      }
    }
    return best ? best.id : null;
  }

  /** 屏幕坐标命中的攻击目标 id：敌方单位优先（精灵框，受迷雾约束），
   *  否则敌方建筑（足迹）。修复"单位被建筑遮挡点不中/打不到"。 */
  private targetAt(clientX: number, clientY: number): number | null {
    const u = this.unitAtScreen(clientX, clientY, true);
    if (u !== null) return u;
    const cell = this.screenToCell(clientX, clientY);
    return this.entityAtCell(cell.x, cell.y, this.localPlayerId);
  }

  /** 当前选中里的采矿车 id（升序）。 */
  private selectedHarvesterIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      if (e && this.world.rules.units.get(e.typeId)?.id === 'harvester') out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  /** 当前选中里的武装单位 id（有武器、非建筑；升序）。 */
  private selectedCombatIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      const t = e && this.world.rules.units.get(e.typeId);
      if (t && t.domain !== 'building' && t.weapon) out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  /** 循环切换选中武装单位的作战姿态（以首个单位的当前姿态为基准 +1）。 */
  private cycleStance(): void {
    const ids = this.selectedCombatIds();
    if (ids.length === 0) return;
    const cur = this.world.entities.get(ids[0]!)?.stance ?? 'guard';
    const next = STANCE_ORDER[(STANCE_ORDER.indexOf(cur) + 1) % STANCE_ORDER.length]!;
    this.emit({ kind: 'stance', entityIds: ids, stance: next });
    this.setNetStatus(`姿态：${STANCE_NAME[next]}`);
  }

  /** 对一组单位向屏幕点下令：命中敌方→攻击；点到矿田且选中含采矿车→采矿车去采、
   *  其余移动；否则全体移动。统一供触控轻点与桌面右键调用。 */
  private orderTo(clientX: number, clientY: number, ids: number[]): void {
    const target = this.targetAt(clientX, clientY);
    if (target !== null) {
      this.emit({ kind: 'attack', entityIds: ids, targetId: target });
      this.playUnitVoice('attack', ids[0]!);
      return;
    }
    const cell = this.screenToCell(clientX, clientY);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.mapW || cell.y >= this.mapH) return;
    const harv = ids.filter((id) => this.world.rules.units.get(this.world.entities.get(id)?.typeId ?? '')?.id === 'harvester');
    if (harv.length > 0 && this.world.oreAt(cell.x, cell.y) > 0) {
      this.emit({ kind: 'harvest', entityIds: harv, cellX: cell.x, cellY: cell.y });
      const others = ids.filter((id) => !harv.includes(id));
      if (others.length > 0) this.emit({ kind: 'move', entityIds: others, cellX: cell.x, cellY: cell.y });
      this.playUnitVoice('move', ids[0]!);
      return;
    }
    this.emit({ kind: 'move', entityIds: ids, cellX: cell.x, cellY: cell.y });
    this.playUnitVoice('move', ids[0]!);
  }

  /** 选中本方单位 / 下令时播放语音应答（真实 TS 步兵语音；无素材回退合成提示音）。
   *  轮换取用增加变化（音频纯表现层，不入模拟，无需确定性）。 */
  private playUnitVoice(kind: 'select' | 'move' | 'attack', _unitId: number): void {
    const pool = VOICE_POOL[kind];
    const name = pool[this.voiceSeq++ % pool.length]!;
    if (!audioBus.playVoice(name) && kind === 'select') audioBus.play('select');
  }

  /** 单位是否在当前可视区域内（用于双击选同类）。 */
  private onScreen(ent: { x: number; y: number }): boolean {
    const sx = this.camera.zoom * this.leptonScreenX(ent) + this.renderer.stage.position.x;
    const sy = this.camera.zoom * this.leptonScreenY(ent) + this.renderer.stage.position.y;
    return sx >= 0 && sx <= window.innerWidth && sy >= 0 && sy <= window.innerHeight;
  }

  /** 选中屏内所有同类型己方单位（桌面双击 / 手机双击共用）。 */
  private selectSameTypeOnScreen(id: number | null): void {
    if (id === null) return;
    const type = this.world.entities.get(id)?.typeId;
    if (!type) return;
    this.selected.clear();
    this.selectBuilding(null);
    for (const ent of this.world.entities.values()) {
      if (ent.owner === this.localPlayerId && ent.typeId === type && this.onScreen(ent)) this.selected.add(ent.id);
    }
    audioBus.play('select');
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
    if (id !== this.selectedBuilding) this.pendingRally = null;
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
      (canRally
        ? this.isTouch
          ? `<button id="mv-rally" class="${this.pendingRally === b.id ? 'on' : ''}">${this.pendingRally === b.id ? '点地图…' : '集结点'}</button>`
          : `<span class="hint">右键设集结点</span>`
        : '');
    this.bldBar.querySelector('#mv-repair')!.addEventListener('click', () => {
      this.emit({ kind: 'repair', owner: this.localPlayerId, entityId: b.id });
      audioBus.play('select');
    });
    this.bldBar.querySelector('#mv-sell')!.addEventListener('click', () => {
      this.emit({ kind: 'sell', owner: this.localPlayerId, entityId: b.id });
      audioBus.play('place');
      this.selectBuilding(null);
    });
    this.bldBar.querySelector('#mv-rally')?.addEventListener('click', () => {
      this.pendingRally = this.pendingRally === b.id ? null : b.id;
      audioBus.play('select');
      this.renderBuildingBar();
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
    this.edgeScroll();
    this.updateUnitBar();
    this.renderer.render(alpha, this.selected);
    this.drawGhost();
    this.drawPings();
  }

  /** 触控：选中己方单位时显示下方操作条（移/攻/进/采/停），高亮待执行命令；
   *  「采」仅在选中采矿车时出现。 */
  private updateUnitBar(): void {
    if (!this.isTouch) return;
    let hasUnit = false;
    let hasCombat = false; // 选中里是否有带武器的单位（决定显示 攻/进/巡）
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      const t = e && this.world.rules.units.get(e.typeId);
      if (!t || t.domain === 'building') continue;
      hasUnit = true;
      if (t.weapon) hasCombat = true;
    }
    if (!hasUnit) this.pendingAction = null;
    this.unitBar.classList.toggle('show', hasUnit);
    const hasHarv = this.selectedHarvesterIds().length > 0;
    const combat = this.selectedCombatIds();
    const stance = combat.length > 0 ? (this.world.entities.get(combat[0]!)?.stance ?? 'guard') : 'guard';
    this.unitBar.querySelectorAll('button').forEach((b) => {
      const el = b as HTMLButtonElement;
      const act = el.dataset.act;
      if (act === 'harvest') el.hidden = !hasHarv;
      else if (act === 'attack' || act === 'patrol') el.hidden = !hasCombat;
      else if (act === 'stance') {
        el.hidden = combat.length === 0;
        el.textContent = STANCE_GLYPH[stance]; // 显示当前姿态单字
      }
      el.classList.toggle('on', act === this.pendingAction);
    });
  }

  /** 桌面平移：方向键 + 光标贴边滚屏（仅画布内、非放置/拖动态；右缘留给侧栏）。 */
  private edgeScroll(): void {
    // 方向键平移（随时可用）
    const K = 13;
    let kx = 0;
    let ky = 0;
    if (this.panKeys.has('ArrowLeft')) kx += K;
    if (this.panKeys.has('ArrowRight')) kx -= K;
    if (this.panKeys.has('ArrowUp')) ky += K;
    if (this.panKeys.has('ArrowDown')) ky -= K;
    if (kx || ky) this.camera.panByScreen(kx, ky);

    // 贴边滚屏：仅光标在画布内、未放置建筑、未中键拖动时（避免移向侧栏/建造时乱跑）
    if (!this.isTouch && this.overCanvas && !this.placingType && !this.midDrag) {
      const EDGE = 14;
      const SPD = 7;
      const x = this.lastPointer.x;
      const y = this.lastPointer.y;
      let dx = 0;
      let dy = 0;
      if (x >= 0 && x < EDGE) dx = -SPD; // 左缘
      if (y >= 0 && y < EDGE) dy = -SPD; // 上缘
      else if (y > window.innerHeight - EDGE && y <= window.innerHeight) dy = SPD; // 下缘
      // 右缘是建造栏，不滚屏
      if (dx || dy) this.camera.panByScreen(-dx, -dy);
    }
    this.clampCamera();
  }

  /** 把相机中心限制在地图范围内（留余量），避免移出地图找不到基地。 */
  private clampCamera(): void {
    const halfW = TILE_W / 2;
    const halfH = TILE_H / 2;
    const m = 80;
    this.camera.x = Math.max(-this.mapH * halfW - m, Math.min(this.mapW * halfW + m, this.camera.x));
    this.camera.y = Math.max(-m, Math.min((this.mapW + this.mapH) * halfH + m, this.camera.y));
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
