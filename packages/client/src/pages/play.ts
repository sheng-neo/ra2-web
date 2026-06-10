/**
 * 单机遭遇战（#play）：MatchView + 本地驱动（直接 step + AI 发命令）。
 */
import { SIM_TICKS_PER_SECOND } from '@ra2web/game';
import { SimpleAI } from '../ai';
import { createMatchWorld, localSkirmishConfig } from '../match-setup';
import { MATCH_STYLE, MatchView } from '../match-view';

const TICK_MS = 1000 / SIM_TICKS_PER_SECOND;
const HUMAN = 1;
const AI_ID = 2;

export async function renderPlay(root: HTMLElement): Promise<void> {
  document.title = '遭遇战 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = MATCH_STYLE;
  document.head.appendChild(style);

  const config = localSkirmishConfig();
  const world = createMatchWorld(config);
  const view = new MatchView(root, world, HUMAN, config.mapWidth, config.mapHeight);
  await view.init();

  const ai = new SimpleAI(AI_ID);

  // 本地驱动：定时器推进 sim（后台标签也持续）；rAF 仅插值渲染
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

  view.app.ticker.add(() => view.render());
  window.addEventListener('hashchange', () => clearInterval(clock), { once: true });

  if (import.meta.env.DEV) {
    (window as unknown as { __ra2play?: unknown }).__ra2play = {
      world,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) view.stepWith([...view.takeLocalCommands(), ...ai.emit(world)]);
      },
    };
  }
}
