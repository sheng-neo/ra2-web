/**
 * 《中環急件》Central Rush · M0：夜色白模中环，手机横屏优先。
 *
 * URL 参数（?query 与 #hash 都认，artifact 链接只透传 #hash；见 lighting.ts readParam）：
 * fixture=1 用合成城市；perf 显示性能面板；view=harbour|statue|aerial 初始机位；terrain=1/0 强制加载 / 不加载 terrain.bin；
 * q=low|high 画质档；t=<小时> 当地钟点（18–26，默认 20）；haze=humid|clear 天气；adaptive 自动化测试下也开自适应 DPR；
 * post-0 / bloom-0 后处理调试开关；photo 照片模式（只留地图署名）。例：#q-low&perf、#view-statue,t-21.5、#photo。
 * 调试钩子：window.__central（ready、stats()、setView()），供 Playwright 冒烟脚本读取。
 * 数据路径一律相对页面（index.html 保证 /central 无结尾斜杠时也按 /central/ 解析）。
 */
import './style.css';
import type { CityFile } from '@central/data';
import { attachCameraInput } from './camera/input';
import { PRESETS, presetView } from './camera/presets';
import { DEBUG_CLEARANCE_M, OrbitRig, viewFromEye } from './camera/rig'; // [r4:street] DEBUG_CLEARANCE_M
import { RideLook } from './camera/ride-look'; // [r4:street]
import { simToThreeVec } from './coords';
import { loadCity } from './data/load-city';
import { flatGround, loadTerrain, reliefGrid, reliefHeight, wantsTerrain } from './data/terrain';
import { CityRenderer, type RenderStats } from './render/city-renderer';
import { createHud } from './ui/hud';
import { LoadingScreen } from './ui/loading';
import { Notice } from './ui/notice';
import { PerfHud } from './ui/perf-hud';
import { HAZE, SHARED, SIM_CLOCK, readParam } from './render/materials/lighting'; // [r2:trams] SIM_CLOCK
import type { TramCarDebug } from './render/streets/trams'; // [r2:trams]
import type { FacadeDebug } from './render/facades/streamer'; // [r3:facades]
import type { VehicleDebug } from './render/streets/vehicles'; // [r3:liveries]
import type { BoatDebug } from './render/boats'; // [r3:liveries]
import { AdaptiveDpr, DowngradeWatch, adaptiveLadder } from './render/quality';
import { AudioEngine, initialMute, readStoredMute, writeStoredMute } from './audio/engine'; // [r2:trams]

export interface CentralDebug {
  ready: boolean;
  error?: string;
  stats(): RenderStats;
  setView(id: string, instant?: boolean): void;
  /** 任意机位（模拟坐标，米），立即生效。 */
  lookFrom(eye: [number, number, number], target: [number, number, number]): void;
  summary(): string;
  /** 下一帧按物体名统计 draw call（调试，复审修正时加）。 */
  drawCounts?(): Promise<Record<string, number>>;
  /** 电车（模拟坐标，米；heading 弧度自东逆时针）。 */
  trams?(): { t: number; cars: TramCarDebug[] }; // [r2:trams]
  /** 音频状态：AudioContext 是否已建（只在用户手势后）、状态、是否静音、已播铃声数。 */
  audio?(): { ready: boolean; state: string; muted: boolean; played: number }; // [r2:trams]
  /** R3 真实贴面：视野要的贴面页都到了（远景图集 + 近景页）时兑现。 */
  facadesIdle?(): Promise<void>; // [r3:facades]
  /** R3 真实贴面的流式加载状态（页数、常驻、显存、待办、失败、已下载字节、本帧上传、让出次数、排除的楼数）。 */
  facades?(): (FacadeDebug & { procSuppressed?: number; canopies?: number }) | null; // [r3:facades] [r4:int] procSuppressed / canopies
  /** 车辆（模拟坐标，米）：车型、营运商、路线、速度（R3 LIVERIES）。 */ // [r3:liveries]
  vehicles?(): VehicleDebug[]; // [r3:liveries]
  /** 船（模拟坐标，米）：是否在开、营运商、船名（R3 LIVERIES）。 */ // [r3:liveries]
  boats?(): BoatDebug[]; // [r3:liveries]
  /** R4：搭第 car 辆电车（trams().cars 的下标），游戏自己的「搭電車」机位；车快到终点时返回 false。 */ // [r4:street]
  rideStart?(opts: { car: number }): boolean; // [r4:street]
  /** R4：搭车时转头（相对车头，度；偏航左正、俯仰上正），立即生效且不自动回正。 */ // [r4:street]
  rideLook?(yawDeg: number, pitchDeg: number): void; // [r4:street]
  /** R4：搭车状态（眼点模拟坐标米、轨顶 mPD、眼离轨顶、视线角度）。 */ // [r4:street]
  rideState?(): { riding: boolean; car: number; eye: [number, number, number]; rail: number; eyeAboveRail: number; yawDeg: number; pitchDeg: number }; // [r4:street]
  /** R4：行人各级 LOD 的人数与三角形数。 */ // [r4:street]
  people?(): { near: number; mid: number; far: number; triangles: number; nearTriangles: number }; // [r4:street]
}

declare global {
  interface Window {
    __central?: CentralDebug;
  }
}

/** 生产构建下载 gzip 版（见 vite.config.ts），开发服务器直接给原文件。 */
const DATA_SUFFIX = import.meta.env.PROD ? '.gz' : '';
const CITY_URL = `city/central.json${DATA_SUFFIX}`;
/** 贴面贴图（city/facades/*.webp）的文件名后缀：artifact 副本若不收 .webp，可把文件改名并只改这里。 */
export const FACADE_SUFFIX = ''; // [r3:facades]
const TERRAIN_URL = `city/terrain.bin${DATA_SUFFIX}`;
/** WebGL 上下文丢失后等系统归还的时间；超时才请玩家重新整理。 */
const CONTEXT_RESTORE_WAIT_MS = 5000;
/** 镜头可游走范围：数据范围外放 300 m。 */
const ROAM_MARGIN_M = 300;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function getCity(loading: LoadingScreen): Promise<CityFile> {
  if (readParam('fixture') === '1') {
    const { makeFixtureCity } = await import('./dev/fixture');
    return makeFixtureCity();
  }
  return loadCity(CITY_URL, (loaded, total) => {
    const kb = `${(loaded / 1024).toFixed(0)} KB`;
    loading.progress(total ? (loaded / total) * 0.65 : null, `下載地圖數據 ${kb}`);
  });
}

/** 钟点与天气预设（#t-21.5、#haze-humid / #haze-clear）。 */
function applyAtmosphereParams(): void {
  const t = Number(readParam('t'));
  if (Number.isFinite(t) && t >= 18 && t <= 26) SHARED.uClock.value = t;
  const haze = readParam('haze');
  if (haze === 'humid') {
    SHARED.uHazeDensity.value = 1 / 2500;
    SHARED.uCloudBase.value = 300;
    SHARED.uCloudDensity.value = 1 / 250;
  } else if (haze === 'clear') {
    SHARED.uHazeDensity.value = 1 / 8000;
  } else {
    SHARED.uHazeDensity.value = 1 / HAZE.extinctionM;
  }
}

async function main(app: HTMLElement, loading: LoadingScreen): Promise<void> {
  // 调试钩子先挂上（读参数、下载数据出错时冒烟脚本也能读到 __central.error）
  const debug: CentralDebug = {
    ready: false,
    stats: () => ({
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      tier: 'high',
      dpr: 1,
      bufferPx: 0,
      msaa: 0,
      bloom: false,
      reflection: false,
      passesFull: 0,
      texMB: 0,
    }),
    setView: () => {},
    lookFrom: () => {},
    summary: () => '',
  };
  window.__central = debug;
  // 参数一律经 readParam（?query 或 #hash）；data/terrain 的 wantsTerrain 仍收 URLSearchParams
  const params = new URLSearchParams();
  const terrainFlag = readParam('terrain');
  if (terrainFlag !== null) params.set('terrain', terrainFlag);
  applyAtmosphereParams();

  const city = await getCity(loading);
  const grid = wantsTerrain(city.meta, params)
    ? await loadTerrain(TERRAIN_URL, (loaded, total) =>
        loading.progress(total ? 0.65 + (loaded / total) * 0.05 : null, `下載地形數據 ${(loaded / 1024).toFixed(0)} KB`),
      )
    : null;
  const relief = grid ? reliefGrid(grid) : null;
  const ground = relief ? reliefHeight(relief) : flatGround;

  const canvas = document.createElement('canvas');
  app.prepend(canvas);
  const view = new CityRenderer(canvas);
  watchContext(canvas, new Notice(app));

  // 每帧对齐窗口尺寸（不靠 resize 事件）：建场景、编译着色器期间转屏，或 iOS 转屏后 innerWidth 延迟更新，
  // 都不会留下被拉伸的画布
  let size = '';
  const fitSize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (`${w}x${h}` === size) return;
    size = `${w}x${h}`;
    view.resize(w, h);
  };
  fitSize();
  await view.build(
    city,
    ground,
    relief,
    async (label, fraction) => {
      loading.progress(fraction, label);
      await nextFrame();
    },
    { base: 'city/', suffix: FACADE_SUFFIX }, // [r3:facades]
  );

  const [x0, y0, x1, y1] = city.meta.bbox;
  const [ax, , az] = simToThreeVec(x0, y0, 0);
  const [bx, , bz] = simToThreeVec(x1, y1, 0);
  const viewParam = readParam('view');
  const startId = PRESETS.some((p) => p.id === viewParam) ? viewParam! : PRESETS[0]!.id;
  const rig = new OrbitRig(
    presetView(PRESETS.find((p) => p.id === startId)!),
    {
      minX: Math.min(ax, bx) - ROAM_MARGIN_M,
      maxX: Math.max(ax, bx) + ROAM_MARGIN_M,
      minZ: Math.min(az, bz) - ROAM_MARGIN_M,
      maxZ: Math.max(az, bz) + ROAM_MARGIN_M,
    },
    ground,
  );
  const input = attachCameraInput(canvas, rig, () => view.camera.fov);

  const setView = (id: string, instant = false) => {
    const p = PRESETS.find((q) => q.id === id);
    if (!p) return;
    // [r2:fix] 「電車」：一按就要看见叮叮——找预设机位 250 m 内停站中（或正驶向机位）的西行车，站到它前方站岛一侧
    const v = (id === 'tram' && tramFrame(p)) || presetView(p);
    if (instant) rig.flyTo(v, 1e-3);
    else rig.flyTo(v);
    hud.setActive(id);
  };
  /** 跟某辆西行车的「站岛前方」机位：车前 13 m、车左（车门 / 站岛一侧）2.6 m（站岛延长线上）、离轨顶 1.8 m，看车身中部（离轨顶 2.3 m）。 */
  const tramFrame = (p: (typeof PRESETS)[number]) => {
    const cars = view.trams?.debugCars(SIM_CLOCK.t) ?? [];
    let best: TramCarDebug | null = null;
    let score = Infinity;
    for (const c of cars) {
      if (c.track !== 0) continue;
      const d = Math.hypot(c.x - p.eye[0], c.y - p.eye[1]);
      if (d > 250) continue;
      // 停站中的优先；其次是朝预设机位方向开来的
      const toward = (p.eye[0] - c.x) * Math.cos(c.heading) + (p.eye[1] - c.y) * Math.sin(c.heading) > 0;
      const sc = d + (c.atStop ? 0 : toward ? 120 : 400);
      if (sc < score) {
        score = sc;
        best = c;
      }
    }
    if (!best) return null;
    const fx = Math.cos(best.heading);
    const fy = Math.sin(best.heading);
    const at = (f: number, l: number, u: number): [number, number, number] => [best.x + fx * f - fy * l, best.y + fy * f + fx * l, best.z + u];
    return viewFromEye(at(13, 2.6, 1.8), at(0, 0, 2.3));
  };
  // [r2:trams] 叮叮铃（第一次点按 / 按键后才建 AudioContext）、「聲音」开关、「搭電車」跟车
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const audio = new AudioEngine(initialMute(readParam('mute') !== null, readStoredMute(storage)));
  const look = new RideLook(); // [r4:street] 搭電車时转头看（拖动 / 方向键），停手 6 s 或按「向前」回正
  const follow = () => rig.setFollow((eye, target, up) => view.trams?.ridePose(eye, target, up, look) ?? false, look); // [r4:street]
  const rideFrom = () => {
    if (rig.following) { // [r4:street] 再按「搭電車」下车
      rig.stopFollow(); // [r4:street]
      return false; // [r4:street]
    } // [r4:street]
    const ok = view.trams?.ride({ x: view.camera.position.x, z: view.camera.position.z }) ?? false;
    look.reset(); // [r4:street]
    if (ok) follow(); // [r4:street]
    return ok;
  };
  rig.onFollowEnd = () => {
    view.trams?.ride(null);
    hud.setRide(false);
  };
  const hud = createHud(app, {
    presets: PRESETS,
    active: startId,
    onPreset: (id) => setView(id),
    meta: city.meta,
    sound: {
      muted: audio.isMuted,
      onToggle: (m) => {
        audio.setMuted(m);
        writeStoredMute(storage, m);
      },
    },
    ride: { onRide: rideFrom, onFront: () => look.front() }, // [r4:street] 「向前」
  });
  // 照片模式：隐藏标题牌、机位按钮、鸣谢按钮与提示，只留地图署名（与实拍照片并排比较用）
  if (readParam('photo') !== null) app.classList.add('photo');
  const perfFlag = readParam('perf');
  const perf = perfFlag !== null && perfFlag !== '0' ? new PerfHud(app, () => view.stats(), () => view.layerSummary()) : null;
  // 自适应 DPR（自动化测试下默认关闭，#adaptive 打开）与 A11 自动降档
  const adaptiveOn = !navigator.webdriver || readParam('adaptive') !== null;
  const adaptive = adaptiveOn ? new AdaptiveDpr(adaptiveLadder(view.quality.tier, view.stats().dpr), view.stats().dpr) : null;
  const downgrade = adaptiveOn && view.quality.tier === 'high' ? new DowngradeWatch() : null;

  // iOS Safari：阻止页面级双指缩放手势
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  let last = performance.now();
  let frames = 0;
  view.renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    fitSize();
    input.tick(dt);
    rig.update(dt);
    rig.apply(view.camera);
    view.frame(dt, rig.current.distance);
    for (const b of view.trams?.drainBells() ?? []) audio.bell(b.pos, view.camera, b.seed); // [r2:trams]
    if (audio.ready) audio.motors(view.trams?.nearest(view.camera.position, 2, 80) ?? [], view.camera); // [r2:trams]
    perf?.tick(dt);
    if (adaptive && frames > 30) {
      const next = adaptive.sample(dt * 1000, now);
      if (next !== null) view.setPixelRatio(next);
      if (downgrade?.sample(dt * 1000, now, adaptive.atBottom)) view.downgrade();
    }
    if (++frames === 2) {
      debug.ready = true;
      view.facadesBegin(); // [r3:facades]
      loading.done();
    }
  });

  debug.stats = () => view.stats();
  debug.setView = setView;
  debug.lookFrom = (eye, target) => rig.flyTo(viewFromEye(eye, target), 1e-3, DEBUG_CLEARANCE_M); // [r4:street] 行人路机位可到 1.5 m 眼高
  debug.summary = () => view.layerSummary();
  debug.drawCounts = () => view.drawCounts();
  debug.trams = () => ({ t: SIM_CLOCK.t, cars: view.trams?.debugCars(SIM_CLOCK.t) ?? [] }); // [r2:trams]
  debug.audio = () => ({ ready: audio.ready, state: audio.state, muted: audio.isMuted, played: audio.played }); // [r2:trams]
  debug.facadesIdle = () => view.facadesIdle(); // [r3:facades]
  debug.facades = () => view.facadesDebug(); // [r3:facades]
  debug.vehicles = () => view.vehicles(); // [r3:liveries]
  debug.boats = () => view.boatList(); // [r3:liveries]
  debug.rideStart = ({ car }) => { // [r4:street]
    if (!view.trams?.rideIndex(car)) return false; // [r4:street]
    look.reset(); // [r4:street]
    follow(); // [r4:street]
    hud.setRide(true); // [r4:street]
    return true; // [r4:street]
  }; // [r4:street]
  debug.rideLook = (yawDeg, pitchDeg) => look.set((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180, true, true); // [r4:street]
  debug.rideState = () => { // [r4:street]
    const e = view.trams?.rideEye() ?? { eye: [0, 0, 0] as [number, number, number], rail: 0 }; // [r4:street]
    return { riding: rig.lookMode, car: view.trams?.riddenIndex ?? -1, eye: e.eye, rail: e.rail, eyeAboveRail: e.eye[2] - e.rail, yawDeg: (look.yaw * 180) / Math.PI, pitchDeg: (look.pitch * 180) / Math.PI }; // [r4:street]
  }; // [r4:street]
  debug.people = () => view.people(); // [r4:street]
}

/**
 * WebGL 上下文丢失（iOS 把标签页切到后台时常见）：three 会在 restored 后自行重建资源，
 * 期间显示「恢復中」；等不到归还才请玩家重新整理。
 */
function watchContext(canvas: HTMLCanvasElement, notice: Notice): void {
  let timer = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    notice.show('畫面恢復中…');
    timer = window.setTimeout(
      () => notice.show('畫面資源被系統回收，點此重新整理', () => location.reload()),
      CONTEXT_RESTORE_WAIT_MS,
    );
  });
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(timer);
    notice.hide();
  });
}

const app = document.getElementById('app')!;
const loading = new LoadingScreen(app);
main(app, loading).catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[central] 啟動失敗', e);
  if (window.__central) window.__central.error = msg;
  loading.fail(`載入失敗：${msg}`);
});
