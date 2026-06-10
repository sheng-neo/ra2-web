import { Application, Container, Graphics, Text } from 'pixi.js';
import { SIM_TICKS_PER_SECOND } from '@ra2web/game';

/** M0 启动画面：验证 PixiJS 渲染管线与 game-data 服务通路。 */

const statusBar = document.getElementById('status-bar')!;

async function checkGameData(): Promise<void> {
  try {
    const res = await fetch('/game-data/ra2.mix', { method: 'HEAD' });
    if (res.ok) {
      const size = Number(res.headers.get('content-length') ?? 0);
      statusBar.innerHTML = `<span class="ok">✓ 游戏文件已就绪</span>（ra2.mix ${(size / 1024 / 1024).toFixed(1)} MB）· 模拟频率 ${SIM_TICKS_PER_SECOND} Hz`;
    } else {
      statusBar.innerHTML =
        '<span class="warn">⚠ 未找到游戏文件</span> · 请按 game-data/README.md 准备红警2文件后运行 pnpm check-assets';
    }
  } catch {
    statusBar.innerHTML = '<span class="warn">⚠ 无法访问 /game-data</span>（生产模式下属正常）';
  }
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#0b0e11',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  // 红警2 的屏幕格尺寸：60×30 等距菱形。画一片网格证明渲染就绪。
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

  const subtitle = new Text({
    text: 'M0 脚手架就绪 — 等距渲染管线 OK',
    style: { fill: 0x8a97a0, fontSize: 14 },
  });
  subtitle.anchor.set(0.5);
  subtitle.y = 28;
  world.addChild(subtitle);

  const layout = (): void => {
    world.x = app.screen.width / 2;
    world.y = app.screen.height / 2 - (GRID * CELL_H) / 4;
    title.y = (GRID * CELL_H) / 2 + 40;
    subtitle.y = title.y + 28;
  };
  layout();
  app.renderer.on('resize', layout);

  await checkGameData();
}

void main();
