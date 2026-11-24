/**
 * 《中環急件》Central Rush · M0：夜色白模中环，手机横屏优先。
 *
 * URL 参数：?fixture=1 用合成城市；?perf=1 显示性能面板；?view=harbour|statue|aerial 初始机位；
 * ?terrain=1/0 强制加载 / 不加载 terrain.bin。
 * 调试钩子：window.__central（ready、stats()、setView()），供 Playwright 冒烟脚本读取。
 * 数据路径一律相对页面（index.html 保证 /central 无结尾斜杠时也按 /central/ 解析）。
 */
import './style.css';
import type { CityFile } from '@central/data';
import { attachCameraInput } from './camera/input';
import { PRESETS, presetView } from './camera/presets';
import { OrbitRig, viewFromEye } from './camera/rig';
import { simToThreeVec } from './coords';
import { loadCity } from './data/load-city';
import { flatGround, loadTerrain, reliefGrid, reliefHeight, wantsTerrain } from './data/terrain';
import { CityRenderer, type RenderStats } from './render/city-renderer';
import { createHud } from './ui/hud';
import { LoadingScreen } from './ui/loading';
import { Notice } from './ui/notice';
import { PerfHud } from './ui/perf-hud';

export interface CentralDebug {
  ready: boolean;
  error?: string;
  stats(): RenderStats;
  setView(id: string, instant?: boolean): void;
  /** 任意机位（模拟坐标，米），立即生效。 */
  lookFrom(eye: [number, number, number], target: [number, number, number]): void;
  summary(): string;
}

declare global {
  interface Window {
    __central?: CentralDebug;
  }
}

/** 生产构建下载 gzip 版（见 vite.config.ts），开发服务器直接给原文件。 */
const DATA_SUFFIX = import.meta.env.PROD ? '.gz' : '';
const CITY_URL = `city/central.json${DATA_SUFFIX}`;
const TERRAIN_URL = `city/terrain.bin${DATA_SUFFIX}`;
/** WebGL 上下文丢失后等系统归还的时间；超时才请玩家重新整理。 */
const CONTEXT_RESTORE_WAIT_MS = 5000;
/** 镜头可游走范围：数据范围外放 300 m。 */
const ROAM_MARGIN_M = 300;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function getCity(params: URLSearchParams, loading: LoadingScreen): Promise<CityFile> {
  if (params.get('fixture') === '1') {
    const { makeFixtureCity } = await import('./dev/fixture');
    return makeFixtureCity();
  }
  return loadCity(CITY_URL, (loaded, total) => {
    const kb = `${(loaded / 1024).toFixed(0)} KB`;
    loading.progress(total ? (loaded / total) * 0.65 : null, `下載地圖數據 ${kb}`);
  });
}

async function main(app: HTMLElement, loading: LoadingScreen): Promise<void> {
  const params = new URLSearchParams(location.search);
  const debug: CentralDebug = {
    ready: false,
    stats: () => ({ calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 }),
    setView: () => {},
    lookFrom: () => {},
    summary: () => '',
  };
  window.__central = debug;

  const city = await getCity(params, loading);
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
  await view.build(city, ground, relief, async (label, fraction) => {
    loading.progress(fraction, label);
    await nextFrame();
  });

  const [x0, y0, x1, y1] = city.meta.bbox;
  const [ax, , az] = simToThreeVec(x0, y0, 0);
  const [bx, , bz] = simToThreeVec(x1, y1, 0);
  const startId = PRESETS.some((p) => p.id === params.get('view')) ? params.get('view')! : PRESETS[0]!.id;
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
    if (instant) rig.flyTo(presetView(p), 1e-3);
    else rig.flyTo(presetView(p));
    hud.setActive(id);
  };
  const hud = createHud(app, { presets: PRESETS, active: startId, onPreset: (id) => setView(id), meta: city.meta });
  const perf = params.get('perf') === '1' ? new PerfHud(app, () => view.stats(), () => view.layerSummary()) : null;

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
    perf?.tick(dt);
    if (++frames === 2) {
      debug.ready = true;
      loading.done();
    }
  });

  debug.stats = () => view.stats();
  debug.setView = setView;
  debug.lookFrom = (eye, target) => rig.flyTo(viewFromEye(eye, target), 1e-3);
  debug.summary = () => view.layerSummary();
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
