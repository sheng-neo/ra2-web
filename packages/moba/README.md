# 星陨战纪 · Starfall

原创的网页 5v5 MOBA：1 名玩家 + 9 个 AI，三路兵线、防御塔、野区与史诗野怪，摧毁敌方水晶获胜。
three.js 3D 画面，美术与音频全部程序化生成——没有任何外部图片、模型、字体、音频文件，运行时不发任何网络请求。

## 玩法

- 双方各出全部 5 位英雄(樊哙 · 坦克 / 程咬金 · 战士 / 王昭君 · 法师 / 李广 · 射手 / 荆轲 · 刺客)，玩家选 1 位加入蓝方(左下基地)，其余 9 位由 AI 控制。背景一句话：星陨高原的坠星之力召来了不同时代的英杰。
- 每条路的防御塔要由外向内依次摧毁；任意一路高地塔告破后才能攻击水晶。
- 补刀、击杀、推塔、打野获得金币，随时随地打开商店购买装备；技能随等级自动加点。
- 对手难度(简单 / 普通 / 困难)只影响红方 AI。

## 操作

| | 键鼠 | 触控 |
|---|---|---|
| 移动 | `W A S D` / 方向键，或鼠标右键点地 | 左下虚拟摇杆 |
| 普攻 | `空格` / `J`，或左键 / 右键点敌人 | 右下大普攻键(按住连续攻击) |
| 技能 | `Q` `E` `R`：按住瞄准，松开施放；`Esc` / 右键取消 | 轻点 = 智能施法；按住拖动 = 手动瞄准，拖到取消区放弃 |
| 通用技能 | `F` 闪现 · `G` 疗伤 · `B` 回城 | 技能区外弧的三个小键 |
| 商店 / 战况 | `P` 商店 · 按住 `Tab` 记分板 | 小地图下方的商店键、右上角的记分板键 |
| 暂停 / 设置 | `Esc` | 右上角暂停键 |

横屏、竖屏手机与桌面浏览器都能玩；需要支持 WebGL2 的浏览器。

## 开发与构建

在仓库根目录执行：

```bash
pnpm --filter @ra2web/moba dev            # 开发服务器(默认 5183 端口)
pnpm --filter @ra2web/moba typecheck      # 类型检查
pnpm exec eslint packages/moba/src        # 代码检查
pnpm exec vitest run packages/moba        # 单元测试(模拟层 + 主循环)
pnpm --filter @ra2web/moba build          # 多文件构建 → dist/
pnpm --filter @ra2web/moba build:single   # 单文件构建 → dist-single/index.html(JS / CSS 全部内联，可离线打开或嵌入其它页面)
```

自动化的端到端测试请对着构建产物跑(`pnpm --filter @ra2web/moba exec vite preview --port <端口>`)：
开发服务器带热更新，测试途中任何源文件改动都会让被测页面整页重载。

各模块的画廊 / 自测页只在开发服务器下可访问：`/dev/terrain.html`、`/dev/models.html`、`/dev/fx.html`、`/dev/hud.html`、`/dev/menu.html`、`/dev/audio.html`。

## 目录与分层

```
index.html           入口页：纯 CSS 的启动占位 + 应用容器
src/main.ts          入口脚本，只负责调用 app/app.ts
src/app/             集成层：把下面四层接成完整的游戏
  app.ts               启动 → 主菜单 → 加载 → 对局 → 结算 的流程；设置的读写与应用；错误提示；调试钩子
  match.ts             一局对局的会话：分阶段加载、HudHost 接线、主循环回调、生命周期与资源释放
  loop.ts              固定步长(1/30 秒)主循环，纯逻辑、可单测
  perf.ts              帧耗时滑动统计
  params.ts            调试用启动参数
  shell.ts             启动占位淡出、界面内提示层(错误 / 图形中断 / 不支持 WebGL2)
src/core/            模拟层：纯 TypeScript，不依赖 DOM 与 three.js，Node 下可无头跑完整对局；种子随机，完全可复现
src/render/          渲染层：three.js 场景、模型、特效、镜头
src/ui/              界面层：DOM / CSS 的菜单与 HUD、全部输入(键鼠 + 触控)、设计系统与图标
src/audio/           音频层：WebAudio 程序合成的音效与配乐
src/dev/、dev/       各层的画廊与自测页(不进生产构建)
```

层与层之间只通过四份契约交流：`core/types.ts`(状态、事件、命令)、`render/api.ts`、`ui/api.ts`、`audio/api.ts`。
渲染 / 界面 / 音频对对局状态只读，想改变世界只能经 `World.command()`。

每一帧的顺序(见 `app/loop.ts` 与 `app/match.ts`)：

1. 按固定步长推进模拟 0..N 步，每步之后取走事件；
2. 把这一帧累计的事件作为同一批，依次交给渲染 → 界面 → 音频；
3. 渲染(带两个 tick 之间的插值系数) → 界面刷新 → 音频刷新。

暂停时不推进模拟但继续渲染；切到后台再回来不会把离开的时间补算进去。

## 调试

浏览器控制台里的 `window.__moba`：

| 字段 | 说明 |
|---|---|
| `phase` | 当前阶段：`boot` / `menu` / `loading` / `match` / `result` / `unsupported` |
| `world` `state` `renderer` `hud` `loop` `config` `session` | 当前对局的各层对象(不在对局中为 `null`) |
| `audio` `settings` `params` | 音频引擎、当前设置、解析后的启动参数 |
| `perf` | 帧耗时统计，`perf.snapshot()` 给出模拟 / 渲染 / 界面 / 音频各阶段的毫秒数与帧率 |
| `matches` `errors` | 已开始的对局数、提示层显示过的错误 |
| `restart()` | 丢弃当前流程回到标题页 |

启动参数(只用于开发与测试，正式流程不依赖)：

| 参数 | 说明 |
|---|---|
| `skipmenu=1` | 跳过菜单直接开局 |
| `hero=panyue\|chijin\|xingli\|fengling\|yeque` | 直接开局时的玩家英雄(走菜单时以选英雄页为准) |
| `difficulty=easy\|normal\|hard` | 直接开局时的对手难度 |
| `seed=<整数>` | 随机种子(同种子同操作完全可复现) |
| `auto=1` | 玩家英雄也交给 AI(观战 / 无人值守测试) |
| `speed=<1..64>` | 时间倍率，加速跑完整局 |
| `quality=low\|medium\|high` | 本次会话的画质 |
| `fps=1` | 显示帧率 |

例：`/?skipmenu=1&auto=1&speed=32&seed=7`。同样的键也可以写在 hash 里(`#skipmenu=1&auto=1`)，
`#demo` 等于「跳过菜单 + 托管」，`#fps` 等于显示帧率。
