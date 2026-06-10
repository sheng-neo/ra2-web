/**
 * 单机遭遇战（#play）：开局设置（难度/资金）→ MatchView + 本地驱动（step + AI）。
 */
import { SIM_TICKS_PER_SECOND } from '@ra2web/game';
import { SimpleAI, type Difficulty } from '../ai';
import { createMatchWorld, localSkirmishConfig } from '../match-setup';
import { MATCH_STYLE, MatchView } from '../match-view';

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
    root.querySelector('#pl-start')!.addEventListener('click', () => {
      localStorage.setItem('ra2.diff', difficulty);
      localStorage.setItem('ra2.cash', String(credits));
      void startMatch();
    });
    sync();
  }

  async function startMatch(): Promise<void> {
    const config = localSkirmishConfig(credits);
    const world = createMatchWorld(config);
    const view = new MatchView(root, world, HUMAN, config.mapWidth, config.mapHeight);
    await view.init();
    view.onRestart = () => void renderPlay(root);

    const ai = new SimpleAI(AI_ID, difficulty);
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
