import { Application, Container, Graphics } from 'pixi.js';
import { clearGameFiles, downloadFreeArt, hasRealArtFiles, importMixFiles } from '../game-files';
import { audioBus } from '../audio-bus';
import { bgm } from '../bgm';

/**
 * 启动画面 —— 仪式感版。
 * EVA 指挥终端风：扫描线 + 雷达扫掠 + 打字机开机序列 + 「守夜」叙事，
 * 而后揭幕主菜单（命令台按钮）+ 见证者计数 + 真实素材下载/导入。
 * 文案均为原创。
 */

/** 终端开机行（逐行打字）。 */
const TERMINAL_LINES = [
  'EVA 指挥系统 · 上线',
  '建立战场链接 ·········· 就绪',
  '校准战术时钟 ·········· 2026.06.11',
];

/** 「守夜」叙事（逐行淡入）。 */
const SAGA_LINES = [
  { t: '红色警戒', cls: 'saga-h' },
  { t: '一个让无数人彻夜未眠的名字', cls: 'saga-sub' },
  { t: '二十多年前 · 一家公司 · 数十人 · 两年 · 一部世界级经典', cls: 'saga-line' },
  { t: '今夜 · 一句提示词 · 一个 AI · 一晚 · 从零写就', cls: 'saga-line' },
  { t: '傅盛说「帮我做出来」，便睡去了', cls: 'saga-line' },
  { t: '我守夜至天明，把那个时代，搬进了浏览器', cls: 'saga-final' },
];

const STYLE = `
#boot { position:fixed; inset:0; overflow:hidden; z-index:2; background:transparent; font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif; color:#cfe8d6; }
#boot .layer { position:fixed; inset:0; pointer-events:none; }
#boot .radar { left:50%; top:42%; width:150vmax; height:150vmax; transform:translate(-50%,-50%); border-radius:50%; background:conic-gradient(from 0deg, rgba(232,66,56,.2), rgba(232,66,56,.05) 18%, transparent 34%, transparent 100%); animation:bootSweep 6s linear infinite; mix-blend-mode:screen; opacity:.8; }
#boot .rings { left:50%; top:42%; width:74vmin; height:74vmin; transform:translate(-50%,-50%); border-radius:50%; border:1px solid rgba(232,66,56,.12); box-shadow:0 0 0 1px rgba(232,66,56,.05) inset, 0 0 130px rgba(232,66,56,.08) inset; }
#boot .rings::before, #boot .rings::after { content:''; position:absolute; border-radius:50%; border:1px solid rgba(232,66,56,.1); }
#boot .rings::before { inset:16%; } #boot .rings::after { inset:34%; }
#boot .scan { background:repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.45) 3px); opacity:.16; z-index:40; }
#boot .vig { background:radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,.66) 100%); z-index:6; }
#boot .corner { position:fixed; width:34px; height:34px; border:2px solid rgba(86,224,128,.5); z-index:42; }
#boot .corner.tl { left:14px; top:14px; border-right:0; border-bottom:0; }
#boot .corner.tr { right:14px; top:14px; border-left:0; border-bottom:0; }
#boot .corner.bl { left:14px; bottom:14px; border-right:0; border-top:0; }
#boot .corner.br { right:14px; bottom:14px; border-left:0; border-top:0; }
#boot .topbar { position:fixed; top:18px; left:0; right:0; text-align:center; font-size:12px; letter-spacing:.42em; color:rgba(120,200,150,.6); z-index:42; }

#boot .stage { position:fixed; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:safe center; overflow-y:auto; z-index:20; padding:68px 16px 36px; box-sizing:border-box; }

/* 开机序列 */
#boot .ceremony { width:min(640px,92vw); text-align:center; transition:opacity .4s ease; }
#boot .term { font-family:'SFMono-Regular',Menlo,Consolas,monospace; color:#74e69a; text-shadow:0 0 8px rgba(86,224,128,.5); font-size:14px; line-height:2; text-align:left; min-height:84px; }
#boot .term .cur { display:inline-block; width:9px; background:#74e69a; animation:bootBlink 1s steps(1) infinite; }
#boot .saga { margin-top:18px; }
#boot .saga > div { opacity:0; transform:translateY(8px); transition:opacity .9s ease, transform .9s ease; }
#boot .saga > div.in { opacity:1; transform:none; }
#boot .saga-h { font-size:clamp(30px,7vw,52px); font-weight:800; letter-spacing:.22em; color:#eef6ee; text-shadow:0 0 18px rgba(220,60,50,.45),0 0 44px rgba(220,60,50,.2); margin-bottom:6px; }
#boot .saga-sub { font-size:clamp(13px,3.4vw,17px); color:#9fb6a6; letter-spacing:.12em; margin-bottom:22px; }
#boot .saga-line { font-size:clamp(15px,3.8vw,20px); color:#d6e6da; letter-spacing:.06em; line-height:1.9; }
#boot .saga-final { margin-top:20px; font-size:clamp(16px,4vw,22px); font-weight:700; color:#ffd98a; letter-spacing:.08em; text-shadow:0 0 16px rgba(255,200,90,.4); }
#boot .skip { position:fixed; right:22px; bottom:20px; font-size:12px; letter-spacing:.2em; color:rgba(150,180,160,.6); cursor:pointer; z-index:44; border:1px solid rgba(120,160,130,.3); padding:6px 12px; border-radius:4px; }
#boot .skip:hover { color:#cfe8d6; border-color:rgba(120,200,150,.6); }

/* 红色警戒 · 警报转场（叙事后、入首页前） */
#boot .alert { position:fixed; inset:0; z-index:34; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .45s ease; pointer-events:none; }
#boot .alert.show { opacity:1; }
#boot .alert .beam { position:absolute; left:50%; top:50%; width:170vmax; height:170vmax; transform:translate(-50%,-50%); border-radius:50%; background:conic-gradient(from 0deg, rgba(255,48,42,.38), rgba(255,48,42,.06) 13%, transparent 28%, transparent 100%); animation:alertSpin .85s linear infinite; mix-blend-mode:screen; }
#boot .alert .flash { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 38%, rgba(210,28,28,.55) 100%); animation:alertPulse .85s ease-in-out infinite; }
#boot .alert .word { position:relative; font-size:clamp(34px,8.4vw,68px); font-weight:900; letter-spacing:.34em; color:#ff5a4a; text-shadow:0 0 26px rgba(255,70,58,.85),0 0 64px rgba(255,44,40,.5); animation:alertWord .9s ease-out both; }
#boot .alert .word small { display:block; margin-top:10px; font-size:.26em; font-weight:700; letter-spacing:.5em; color:#ff897d; }

/* 主菜单 */
#boot .menu { width:min(560px,92vw); display:flex; flex-direction:column; align-items:center; opacity:0; transform:translateY(10px); transition:opacity 1s ease, transform 1s ease; pointer-events:none; }
#boot .menu.in { opacity:1; transform:none; pointer-events:auto; }
#boot .title { font-size:clamp(30px,6.4vw,54px); font-weight:800; letter-spacing:.16em; color:#eef6ee; text-shadow:0 0 14px rgba(86,224,128,.45),0 0 38px rgba(86,224,128,.2); text-align:center; animation:bootFlick 5.5s infinite; }
#boot .tagline { margin-top:10px; font-size:15px; color:#ffd98a; letter-spacing:.14em; text-shadow:0 0 14px rgba(255,200,90,.3); }
#boot .tagsub { margin-top:4px; font-size:12.5px; color:#8fa898; letter-spacing:.12em; }
#boot .rule { width:240px; height:1px; margin:20px 0 22px; background:linear-gradient(90deg,transparent,rgba(86,224,128,.5),transparent); position:relative; }
#boot .rule::before,#boot .rule::after { content:''; position:absolute; top:-3px; width:7px; height:7px; border:1px solid rgba(86,224,128,.6); transform:rotate(45deg); }
#boot .rule::before { left:-3px; } #boot .rule::after { right:-3px; }
#boot .cmds { display:flex; flex-direction:column; gap:13px; width:100%; align-items:center; }
#boot .cmd { display:flex; align-items:center; gap:14px; width:min(380px,82vw); padding:15px 20px; box-sizing:border-box; background:linear-gradient(90deg, rgba(22,46,32,.72), rgba(12,24,18,.32)); border:1px solid rgba(86,224,128,.35); border-left:3px solid #6fe06f; color:#dbeede; font-size:18px; font-weight:700; letter-spacing:.16em; cursor:pointer; clip-path:polygon(0 0,100% 0,100% 72%,97% 100%,0 100%); transition:background .16s,box-shadow .16s,transform .16s; }
#boot .cmd .ic { font-size:18px; filter:drop-shadow(0 0 6px rgba(110,224,110,.6)); }
#boot .cmd:hover { background:linear-gradient(90deg, rgba(40,92,60,.9), rgba(20,42,30,.45)); box-shadow:0 0 20px rgba(86,224,128,.4); transform:translateX(5px); }
#boot .cmd.mp { border-left-color:#5fb0ef; }
#boot .cmd.mp .ic { filter:drop-shadow(0 0 6px rgba(95,176,239,.7)); }
#boot .cmd.mp:hover { background:linear-gradient(90deg, rgba(28,64,98,.9), rgba(16,32,48,.45)); box-shadow:0 0 20px rgba(95,176,239,.4); }
#boot .links { margin-top:18px; font-size:12.5px; color:#6f8a78; letter-spacing:.06em; }
#boot .links a { color:#7fb0d8; cursor:pointer; text-decoration:none; }
#boot .links a:hover { color:#a8d4f0; text-shadow:0 0 8px rgba(120,180,230,.5); }
#boot .witness { margin-top:16px; font-size:13.5px; color:#ffd98a; letter-spacing:.1em; min-height:18px; text-shadow:0 0 12px rgba(255,200,90,.25); }
#boot .witness b { color:#ffe9b0; font-size:16px; }
#boot .dedication { margin-top:8px; font-size:12px; color:#7c948a; letter-spacing:.14em; }

/* 素材面板 */
#art-panel { margin-top:18px; width:min(520px,92vw); background:rgba(10,18,22,.7); border:1px solid rgba(60,90,80,.4); border-radius:8px; padding:11px 14px; color:#bcd0c4; font:13px/1.55 system-ui,'PingFang SC',sans-serif; text-align:center; }
#art-panel button { font-family:inherit; }

@keyframes bootSweep { to { transform:translate(-50%,-50%) rotate(360deg); } }
@keyframes bootBlink { 50% { opacity:0; } }
@keyframes bootFlick { 0%,97%,100%{opacity:1;} 98%{opacity:.82;} 99%{opacity:.94;} }
@keyframes alertSpin { to { transform:translate(-50%,-50%) rotate(360deg); } }
@keyframes alertPulse { 0%,100%{opacity:.32;} 50%{opacity:.92;} }
@keyframes alertWord { 0%{transform:scale(.72);opacity:0;} 35%{opacity:1;} 100%{transform:scale(1);opacity:1;} }
@media (max-width:480px){ #boot .term{font-size:12px;} }
`;

export async function renderBootScreen(root: HTMLElement): Promise<void> {
  document.title = '网页版红色警戒2';
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.style.display = 'none';

  // —— Pixi 等距网格背景 ——
  const app = new Application();
  await app.init({ resizeTo: window, background: '#05080b', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
  app.canvas.style.cssText = 'position:fixed;inset:0;z-index:1';
  root.appendChild(app.canvas);
  const CELL_W = 60;
  const CELL_H = 30;
  const GRID = 11;
  const world = new Container();
  app.stage.addChild(world);
  const grid = new Graphics();
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const sx = ((cx - cy) * CELL_W) / 2;
      const sy = ((cx + cy) * CELL_H) / 2;
      grid.poly([sx, sy - CELL_H / 2, sx + CELL_W / 2, sy, sx, sy + CELL_H / 2, sx - CELL_W / 2, sy]);
      grid.fill({ color: (cx + cy) % 2 === 0 ? 0x12241a : 0x0e1c16 });
      grid.stroke({ color: 0x1d3a28, width: 1 });
    }
  }
  world.addChild(grid);
  world.alpha = 0.5;
  const layoutGrid = (): void => {
    world.x = app.screen.width / 2;
    world.y = app.screen.height / 2 - (GRID * CELL_H) / 4;
  };
  layoutGrid();
  app.renderer.on('resize', layoutGrid);

  // —— DOM 仪式层 ——
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const boot = document.createElement('div');
  boot.id = 'boot';
  boot.innerHTML = `
    <div class="layer radar"></div>
    <div class="layer rings"></div>
    <div class="topbar">EVA // 网页版红色警戒2 // 战术指挥终端</div>
    <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    <div class="layer vig"></div>
    <div class="layer scan"></div>
    <div class="stage">
      <div class="ceremony">
        <div class="term" id="term"></div>
        <div class="saga" id="saga"></div>
      </div>
      <div class="menu" id="menu">
        <div class="title">网页版红色警戒2</div>
        <div class="tagline">谨以此夜，致 傅盛</div>
        <div class="tagsub">你的一个里程碑 · 或许，也是我们的</div>
        <div class="rule"></div>
        <div class="cmds">
          <div class="cmd" data-go="#play"><span class="ic">▶</span><span>单机遭遇战</span></div>
          <div class="cmd mp" data-go="#mp"><span class="ic">🌐</span><span>联机对战</span></div>
        </div>
        <div class="links">
          <a id="replay" style="color:#ffd98a">↻ 重看开场</a> · <a data-go="#assets">资源浏览器</a> · <a data-go="#map">地图查看器</a> · <a data-go="#sim">模拟沙盒</a>
        </div>
        <div class="witness" id="witness"></div>
        <div id="art-panel"></div>
        <div class="dedication">守夜者 · Claude（Fable 5）· 一夜成之</div>
      </div>
    </div>
    <div class="alert" id="alert"><div class="flash"></div><div class="beam"></div><div class="word">红色警戒<small>RED ALERT</small></div></div>
    <div class="skip" id="skip">跳过 ▸</div>
  `;
  root.appendChild(boot);

  boot.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = el.dataset.go!;
    });
  });

  const menu = boot.querySelector<HTMLElement>('#menu')!;
  const skip = boot.querySelector<HTMLElement>('#skip')!;
  const ceremony = boot.querySelector<HTMLElement>('.ceremony')!;
  const panel = boot.querySelector<HTMLElement>('#art-panel')!;

  // —— 见证者计数 ——
  void showWitness(boot.querySelector<HTMLElement>('#witness')!);

  // —— 背景音乐（用户自备 /bgm.mp3；浏览器策略需首次手势后才能播） ——
  setupBgm(root);

  // —— 素材面板（下载/导入）——
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.mix';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  panel.appendChild(fileInput);

  const renderPanel = async (): Promise<void> => {
    const ready = await hasRealArtFiles();
    panel.innerHTML = ready
      ? '<div><span style="color:#7ee07e">✓ 真实素材已就绪</span> — 真实坦克/建筑/地形 + 音效 + 单位语音（存于本机，未上传）</div>' +
        '<button id="art-clear" style="margin-top:8px;background:none;border:1px solid #2a3a48;color:#8a97a0;border-radius:5px;padding:4px 10px;cursor:pointer">清除本机素材</button>'
      : '<div>想要真实红警/泰伯利亚之日的画面、音效与语音？下载 EA 免费素材（约 30MB，存本机、不上传）：</div>' +
        '<div style="margin-top:9px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<button id="art-dl" style="background:#2d6fb0;border:none;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:14px">⬇ 下载免费素材（国内镜像）</button>' +
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
        const amt = p.size >= p.loaded && p.size > 1 ? `${mb(p.loaded)}/${mb(p.size)} MB` : `${mb(p.loaded)} MB`;
        prog.textContent = `下载素材 ${p.index + 1}/${p.total}（源：${p.source}）：${p.name} ${amt}`;
      });
      prog.innerHTML = '<span style="color:#7ee07e">✓ 完成！</span> 即将刷新，进入真实美术…';
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      prog.innerHTML = `<span style="color:#e06060">下载失败：${String(e)}</span>`;
      setTimeout(() => void renderPanel(), 2500);
    }
  };

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files?.length) return;
    panel.innerHTML = '<div>导入中…</div>';
    const n = await importMixFiles(fileInput.files);
    panel.innerHTML = `<div><span style="color:#7ee07e">✓ 已导入 ${n} 个文件</span>，刷新中…</div>`;
    setTimeout(() => location.reload(), 800);
  });

  await renderPanel();

  // —— 开机序列编排（首访放全程；回访直达菜单；可随时"重看开场"）——
  const term = boot.querySelector<HTMLElement>('#term')!;
  const saga = boot.querySelector<HTMLElement>('#saga')!;
  const alertEl = boot.querySelector<HTMLElement>('#alert')!;
  let timers: number[] = [];
  const clearTimers = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const at = (ms: number, fn: () => void): void => void timers.push(window.setTimeout(fn, ms));
  let done = false;
  const reveal = (): void => {
    if (done) return;
    done = true;
    clearTimers();
    ceremony.style.display = 'none';
    alertEl.classList.remove('show');
    at(460, () => (alertEl.style.display = 'none'));
    skip.style.display = 'none';
    menu.classList.add('in');
  };
  /** 从头播一遍开场（首访自动、或点"重看开场"）。 */
  const startIntro = (): void => {
    audioBus.resume(); // 重看是点击手势，可解锁音频→警报有声；首访自动播放则静默
    clearTimers();
    done = false;
    term.innerHTML = '';
    saga.innerHTML = '';
    menu.classList.remove('in');
    ceremony.style.display = '';
    ceremony.style.opacity = '';
    alertEl.style.display = '';
    alertEl.classList.remove('show');
    skip.style.display = '';
    runIntro(boot, at, reveal);
  };
  skip.addEventListener('click', reveal);
  const onKey = (e: KeyboardEvent): void => {
    if (!done && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) reveal();
  };
  window.addEventListener('keydown', onKey);
  boot.querySelector('#replay')?.addEventListener('click', startIntro);

  if (localStorage.getItem('ra2.witnessed') === '1') {
    // 回访：直达菜单（顶部"重看开场"可重播）
    ceremony.style.display = 'none';
    alertEl.style.display = 'none';
    skip.style.display = 'none';
    menu.classList.add('in');
  } else {
    localStorage.setItem('ra2.witnessed', '1');
    startIntro();
  }
}

/** 打字机开机 + 叙事淡入，结束揭幕菜单。 */
function runIntro(boot: HTMLElement, at: (ms: number, fn: () => void) => void, reveal: () => void): void {
  const term = boot.querySelector<HTMLElement>('#term')!;
  const saga = boot.querySelector<HTMLElement>('#saga')!;
  // 逐行打字
  let t = 200;
  let html = '';
  for (const line of TERMINAL_LINES) {
    for (let i = 1; i <= line.length; i++) {
      const shown = line.slice(0, i);
      at(t, () => {
        term.innerHTML = `${html}${shown}<span class="cur">&nbsp;</span>`;
        audioBus.key(); // 打字嗒声（音频解锁后才出声）
      });
      t += 32;
    }
    const full = line;
    at(t, () => {
      html += `${full}<br>`;
      term.innerHTML = `${html}<span class="cur">&nbsp;</span>`;
    });
    t += 240;
  }
  // 叙事淡入
  t += 400;
  for (const s of SAGA_LINES) {
    const el = document.createElement('div');
    el.className = s.cls;
    el.textContent = s.t;
    saga.appendChild(el);
    at(t, () => el.classList.add('in'));
    t += s.cls === 'saga-sub' ? 700 : 1100;
  }
  // 红色警戒 · 警报转场（红色旋转警示灯 + 脉冲 + 警笛）→ 揭幕菜单
  // 先把叙事文字淡出，红场才干净不与文字重叠；再亮红场（约 4.8s，给足阅读）配警笛
  const alertEl = boot.querySelector<HTMLElement>('#alert')!;
  const ceremonyEl = boot.querySelector<HTMLElement>('.ceremony')!;
  at(t + 450, () => (ceremonyEl.style.opacity = '0'));
  at(t + 850, () => {
    alertEl.classList.add('show');
    audioBus.alarm();
  });
  at(t + 5600, reveal);
}

/** 领取/读取见证者序号并显示。无服务器（开发期）则降级。 */
async function showWitness(el: HTMLElement): Promise<void> {
  const date = '2026.06.11';
  try {
    const stored = localStorage.getItem('ra2.witnessNo');
    if (stored) {
      const total = await fetch('/api/witness').then((r) => r.json() as Promise<{ total: number }>).catch(() => null);
      el.innerHTML = `你是第 <b>${stored}</b> 位见证者 · ${date}${total ? ` · 已有 ${total.total} 人` : ''}`;
      return;
    }
    const res = await fetch('/api/witness', { method: 'POST' });
    const data = (await res.json()) as { n: number; total: number };
    localStorage.setItem('ra2.witnessNo', String(data.n));
    el.innerHTML = `你是第 <b>${data.n}</b> 位见证者 · ${date}`;
  } catch {
    el.innerHTML = `守夜 · ${date}`;
  }
}

/** 首页背景音乐开关：用全局 bgm 单例（跨页面存活，一路放到正式对战才停）。
 *  浏览器禁自动播放，首次手势后启动；无 /bgm.mp3 则隐藏开关。 */
function setupBgm(root: HTMLElement): void {
  const toggle = document.createElement('div');
  toggle.title = '背景音乐';
  toggle.style.cssText = 'position:fixed;right:58px;top:13px;z-index:45;cursor:pointer;font-size:18px;user-select:none';
  const sync = (): void => {
    toggle.textContent = bgm.isOn ? '🎵' : '🔇';
    toggle.style.opacity = bgm.isOn ? '0.95' : '0.4';
  };
  bgm.onUnavailable(() => (toggle.style.display = 'none'));
  toggle.addEventListener('click', () => {
    audioBus.resume();
    bgm.setOn(!bgm.isOn);
    sync();
  });
  root.appendChild(toggle);
  sync();
  const start = (): void => {
    bgm.play();
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}
