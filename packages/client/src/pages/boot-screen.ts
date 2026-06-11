import { Application, Container, Graphics, Text } from 'pixi.js';
import { clearGameFiles, downloadFreeArt, hasRealArtFiles, importMixFiles } from '../game-files';

/** 启动画面：模式入口 + 真实美术素材的下载/导入。 */
export async function renderBootScreen(root: HTMLElement): Promise<void> {
  document.title = '网页版红色警戒2';
  const statusBar = document.getElementById('status-bar')!;

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#0b0e11',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);

  // 红警2 的屏幕格尺寸：60×30 等距菱形
  const CELL_W = 60;
  const CELL_H = 30;
  const GRID = 9;

  const world = new Container();
  app.stage.addChild(world);

  const grid = new Graphics();
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const sx = ((cx - cy) * CELL_W) / 2;
      const sy = ((cx + cy) * CELL_H) / 2;
      grid.poly([sx, sy - CELL_H / 2, sx + CELL_W / 2, sy, sx, sy + CELL_H / 2, sx - CELL_W / 2, sy]);
      const parity = (cx + cy) % 2 === 0;
      grid.fill({ color: parity ? 0x1d2b1d : 0x182418 });
      grid.stroke({ color: 0x2e4a2e, width: 1 });
    }
  }
  world.addChild(grid);

  const title = new Text({
    text: '网页版红色警戒2',
    style: { fill: 0xd8e0e8, fontSize: 28, fontWeight: '700' },
  });
  title.anchor.set(0.5);
  world.addChild(title);

  const playBtn = new Text({
    text: '▶ 单机遭遇战',
    style: { fill: 0x6fe06f, fontSize: 22, fontWeight: '700' },
  });
  playBtn.anchor.set(0.5);
  playBtn.eventMode = 'static';
  playBtn.cursor = 'pointer';
  playBtn.on('pointertap', () => {
    location.hash = '#play';
  });
  world.addChild(playBtn);

  const mpBtn = new Text({
    text: '🌐 联机对战',
    style: { fill: 0x6db3e8, fontSize: 20, fontWeight: '700' },
  });
  mpBtn.anchor.set(0.5);
  mpBtn.eventMode = 'static';
  mpBtn.cursor = 'pointer';
  mpBtn.on('pointertap', () => {
    location.hash = '#mp';
  });
  world.addChild(mpBtn);

  const subtitle = new Text({
    text: '资源浏览器 (#assets)　·　地图查看器 (#map)　·　模拟沙盒 (#sim)',
    style: { fill: 0x6db3e8, fontSize: 13 },
  });
  subtitle.anchor.set(0.5);
  subtitle.eventMode = 'static';
  subtitle.cursor = 'pointer';
  subtitle.on('pointertap', (e) => {
    const local = subtitle.toLocal(e.global);
    location.hash = local.x < -90 ? '#assets' : local.x > 90 ? '#sim' : '#map';
  });
  world.addChild(subtitle);

  const layout = (): void => {
    world.x = app.screen.width / 2;
    world.y = app.screen.height / 2 - (GRID * CELL_H) / 4;
    title.y = (GRID * CELL_H) / 2 + 40;
    playBtn.y = title.y + 36;
    mpBtn.y = playBtn.y + 34;
    subtitle.y = mpBtn.y + 30;
  };
  layout();
  app.renderer.on('resize', layout);

  // —— 真实美术素材面板（下载免费素材 / 导入本地 .mix） ——
  const panel = document.createElement('div');
  panel.id = 'art-panel';
  panel.style.cssText =
    'position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:20;width:min(520px,92vw);' +
    'background:rgba(14,20,26,.92);border:1px solid #243039;border-radius:10px;padding:12px 14px;' +
    "color:#c8d2da;font:13px/1.5 system-ui,'PingFang SC',sans-serif;text-align:center";
  root.appendChild(panel);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.mix';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  panel.appendChild(fileInput);

  const renderPanel = async (): Promise<void> => {
    const ready = await hasRealArtFiles();
    panel.innerHTML = ready
      ? '<div><span style="color:#6fce6f">✓ 真实美术已就绪</span> — 进入对战即为真实坦克/建筑/地形（素材存于本机，未上传）</div>' +
        '<button id="art-clear" style="margin-top:8px;background:none;border:1px solid #2a3a48;color:#8a97a0;border-radius:5px;padding:4px 10px;cursor:pointer">清除本机素材</button>'
      : '<div>当前为<b>占位美术</b>。想看真实红警/泰伯利亚之日画面？下载 EA 免费素材（约 20MB，存于本机、不上传）：</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<button id="art-dl" style="background:#2d6fb0;border:none;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:14px">⬇ 下载免费美术素材</button>' +
        '<button id="art-imp" style="background:#1d2730;border:1px solid #2a3a48;color:#c8d2da;border-radius:6px;padding:8px 14px;cursor:pointer">📁 导入本地 .mix</button>' +
        '</div>';
    panel.appendChild(fileInput);
    panel.querySelector('#art-dl')?.addEventListener('click', () => void doDownload());
    panel.querySelector('#art-imp')?.addEventListener('click', () => fileInput.click());
    panel.querySelector('#art-clear')?.addEventListener('click', async () => {
      await clearGameFiles();
      await renderPanel();
    });
  };

  const doDownload = async (): Promise<void> => {
    panel.innerHTML = '<div id="art-prog">准备下载…</div>';
    const prog = panel.querySelector('#art-prog') as HTMLElement;
    try {
      await downloadFreeArt((p) => {
        const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
        prog.textContent = `下载素材 ${p.index + 1}/${p.total}：${p.name} ${mb(p.loaded)}/${p.size ? mb(p.size) : '?'} MB`;
      });
      prog.innerHTML = '<span style="color:#6fce6f">✓ 完成！</span> 即将刷新进入真实美术…';
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      prog.innerHTML = `<span style="color:#e05050">下载失败：${String(e)}</span>`;
      setTimeout(() => void renderPanel(), 2500);
    }
  };

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files?.length) return;
    panel.innerHTML = '<div>导入中…</div>';
    const n = await importMixFiles(fileInput.files);
    panel.innerHTML = `<div><span style="color:#6fce6f">✓ 已导入 ${n} 个文件</span>，刷新中…</div>`;
    setTimeout(() => location.reload(), 800);
  });

  await renderPanel();
  statusBar.style.display = 'none';
}
