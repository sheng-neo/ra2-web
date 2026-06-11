/**
 * 单机遭遇战（#play）：开局设置（难度/资金）→ MatchView + 本地驱动（step + AI）。
 */
import { SIM_TICKS_PER_SECOND } from '@ra2web/game';
import { SimpleAI, type Difficulty } from '../ai';
import { createMatchWorld, localSkirmishConfig, type MapSize } from '../match-setup';
import { MATCH_STYLE, MatchView } from '../match-view';
import { downloadFreeArt, hasRealArtFiles } from '../game-files';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HUMAN = 1;
const AI_ID = 2;

const SETUP_STYLE = `
.pl-setup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #0b0e11; color: #d8e0e6; font: 14px/1.6 system-ui, 'PingFang SC', sans-serif; }
.pl-setup .card { width: min(420px, 92vw); background: #131a21; border: 1px solid #243039; border-radius: 10px; padding: 22px; }
.pl-setup h1 { margin: 0 0 16px; font-size: 20px; }
.pl-setup .label { font-size: 12px; color: #9aa7b0; margin: 12px 0 6px; }
.pl-setup .opts { display: flex; gap: 8px; }
.pl-setup .opts button { flex: 1; padding: 8px; background: #0d1318; color: #c8d2da; border: 1px solid #2a3a48;
  border-radius: 6px; cursor: pointer; }
.pl-setup .opts button.on { background: #2d6fb0; color: #fff; border-color: #2d6fb0; }
.pl-setup .start { margin-top: 18px; width: 100%; padding: 11px; border: none; border-radius: 6px;
  background: #3a9a4a; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
.pl-setup .back { display: block; text-align: center; margin-top: 12px; color: #6db3e8; }
`;

export async function renderPlay(root: HTMLElement): Promise<void> {
  document.title = '遭遇战 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = MATCH_STYLE + SETUP_STYLE;
  document.head.appendChild(style);

  // 记住上次选择
  let difficulty = (localStorage.getItem('ra2.diff') as Difficulty) || 'normal';
  let credits = Number(localStorage.getItem('ra2.cash') ?? 5000);
  let mapSize = (localStorage.getItem('ra2.map') as MapSize) || 'medium';

  function renderSetup(): void {
    root.innerHTML = `
      <div class="pl-setup"><div class="card">
        <h1>遭遇战设置</h1>
        <div class="label">AI 难度</div>
        <div class="opts" id="pl-diff">
          <button data-v="easy">简单</button>
          <button data-v="normal">普通</button>
          <button data-v="hard">困难</button>
        </div>
        <div class="label">起始资金</div>
        <div class="opts" id="pl-cash">
          <button data-v="3000">3000</button>
          <button data-v="5000">5000</button>
          <button data-v="10000">10000</button>
        </div>
        <div class="label">地图大小</div>
        <div class="opts" id="pl-map">
          <button data-v="small">小</button>
          <button data-v="medium">中</button>
          <button data-v="large">大</button>
        </div>
        <button class="start" id="pl-start">▶ 开始</button>
        <a class="back" href="#">← 返回首页</a>
      </div></div>`;
    const sync = (): void => {
      for (const b of root.querySelectorAll('#pl-diff button')) {
        b.classList.toggle('on', (b as HTMLElement).dataset.v === difficulty);
      }
      for (const b of root.querySelectorAll('#pl-cash button')) {
        b.classList.toggle('on', Number((b as HTMLElement).dataset.v) === credits);
      }
      for (const b of root.querySelectorAll('#pl-map button')) {
        b.classList.toggle('on', (b as HTMLElement).dataset.v === mapSize);
      }
    };
    root.querySelector('#pl-diff')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v as Difficulty;
      if (v) {
        difficulty = v;
        sync();
      }
    });
    root.querySelector('#pl-cash')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v;
      if (v) {
        credits = Number(v);
        sync();
      }
    });
    root.querySelector('#pl-map')!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).dataset.v as MapSize;
      if (v) {
        mapSize = v;
        sync();
      }
    });
    root.querySelector('#pl-start')!.addEventListener('click', () => {
      localStorage.setItem('ra2.diff', difficulty);
      localStorage.setItem('ra2.cash', String(credits));
      localStorage.setItem('ra2.map', mapSize);
      void beginWithArtCheck();
    });
    sync();
  }

  /** 首次开打且本机无真实素材时，问一句是否下载（约 30MB）；选下载就下完再开。 */
  async function beginWithArtCheck(): Promise<void> {
    const ready = await hasRealArtFiles();
    if (!ready && localStorage.getItem('ra2.artPrompted') !== '1') {
      localStorage.setItem('ra2.artPrompted', '1');
      const choice = await artChoiceDialog(root);
      if (choice === 'download') {
        const ok = await downloadWithProgress(root);
        if (!ok) return; // 下载失败：留在设置页，可重试
      }
    }
    await startMatch();
  }

  async function startMatch(): Promise<void> {
    const config = localSkirmishConfig(credits, mapSize);
    const world = createMatchWorld(config);
    const view = new MatchView(root, world, HUMAN, config.mapWidth, config.mapHeight);
    await view.init();
    view.onRestart = () => void renderPlay(root);

    // 每局给 AI 一个不同的种子 → 随机抽一套打法人格（同图每局不一样）
    const ai = new SimpleAI(AI_ID, difficulty, (Date.now() ^ (AI_ID * 2654435761)) >>> 0);
    // 敌情简报：开局揭示对手打法人格 + 难度（让 AI 显得有性格）
    const diffName = { easy: '简单', normal: '普通', hard: '困难' }[difficulty];
    view.flashIntel(`⚠ 敌军指挥官：${ai.personaName} · ${diffName}`);
    let aiTimer = 0;
    let acc = 0;
    let prev = performance.now();
    const clock = setInterval(() => {
      const now = performance.now();
      acc += now - prev;
      prev = now;
      let steps = 0;
      while (acc >= TICK_MS && steps < 6) {
        const cmds = view.takeLocalCommands();
        if (++aiTimer >= 15) {
          aiTimer = 0;
          cmds.push(...ai.emit(world));
        }
        view.stepWith(cmds);
        acc -= TICK_MS;
        steps++;
      }
      if (acc > TICK_MS * 6) acc = 0;
    }, TICK_MS);

    view.app.ticker.add(() => {
      try {
        view.render();
      } catch (e) {
        console.error('[render]', e);
      }
    });
    const stop = (): void => clearInterval(clock);
    window.addEventListener('hashchange', stop, { once: true });
    // 重开时清掉旧循环
    view.onRestart = () => {
      stop();
      void renderPlay(root);
    };

    if (import.meta.env.DEV) {
      (window as unknown as { __ra2play?: unknown }).__ra2play = {
        world,
        step: (n = 1) => {
          for (let i = 0; i < n; i++) view.stepWith([...view.takeLocalCommands(), ...ai.emit(world)]);
        },
      };
    }
  }

  renderSetup();
}

/** 首次开打的素材选择弹窗：返回 'download' | 'skip'。 */
function artChoiceDialog(root: HTMLElement): Promise<'download' | 'skip'> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(2,5,8,.72)';
    ov.innerHTML =
      '<div style="width:min(440px,92vw);background:#0e161c;border:1px solid #2a3a48;border-radius:12px;padding:22px;color:#cfe0d6;font:14px/1.6 system-ui,sans-serif;text-align:center">' +
      '<div style="font-size:17px;font-weight:700;margin-bottom:8px;color:#e8f0e8">下载真实美术与音效？</div>' +
      '<div style="color:#9fb3a6">现在是<b>占位画面</b>。下载 EA 免费素材（泰伯利亚之日，约 30MB，存本机、不上传），即可看到真实坦克/建筑/地形 + 音效 + 单位语音；也可先用占位直接开打。</div>' +
      '<div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button id="art-dl-yes" style="background:#2d6fb0;border:none;color:#fff;border-radius:7px;padding:10px 18px;font-size:15px;cursor:pointer">⬇ 下载并开始（约30MB）</button>' +
      '<button id="art-dl-no" style="background:#1d2730;border:1px solid #2a3a48;color:#c8d2da;border-radius:7px;padding:10px 16px;cursor:pointer">先用占位开始</button>' +
      '</div></div>';
    root.appendChild(ov);
    const done = (c: 'download' | 'skip'): void => {
      ov.remove();
      resolve(c);
    };
    ov.querySelector('#art-dl-yes')!.addEventListener('click', () => done('download'));
    ov.querySelector('#art-dl-no')!.addEventListener('click', () => done('skip'));
  });
}

/** 下载素材并显示进度；成功 true、失败 false（失败留在设置页可重试）。 */
function downloadWithProgress(root: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(2,5,8,.8)';
    ov.innerHTML =
      '<div id="dlp" style="width:min(440px,92vw);background:#0e161c;border:1px solid #2a3a48;border-radius:12px;padding:24px;color:#cfe0d6;font:14px/1.6 system-ui,sans-serif;text-align:center">准备下载…</div>';
    root.appendChild(ov);
    const box = ov.querySelector('#dlp') as HTMLElement;
    const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
    downloadFreeArt((p) => {
      const amt = p.size >= p.loaded && p.size > 1 ? `${mb(p.loaded)}/${mb(p.size)} MB` : `${mb(p.loaded)} MB`;
      box.textContent = `下载素材 ${p.index + 1}/${p.total}（源：${p.source}）：${p.name} ${amt}`;
    })
      .then(() => {
        ov.remove();
        resolve(true);
      })
      .catch((e: unknown) => {
        box.innerHTML = `<span style="color:#e06060">下载失败：${String(e)}</span><div style="margin-top:8px;color:#9fb3a6">可稍后在首页重试，或先用占位开打。</div>`;
        setTimeout(() => {
          ov.remove();
          resolve(false);
        }, 2600);
      });
  });
}
