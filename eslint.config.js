import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// packages/sc2k 专用规则辅助（ARCHITECTURE §2.2 / §5.8；WP0 追加，不改上面的段）
// ---------------------------------------------------------------------------
const SC2K = 'packages/sc2k/src';
const SC2K_SIM_IDS = ['terrain', 'placement', 'utilities', 'zones', 'transport', 'services', 'economy', 'events'];
/** 源码一律相对路径 import：`^(\.\./)+(<dirs>)(/|$)` 匹配"向上若干级再进入某目录"的说明符。 */
const upInto = (dirs) => `^(\\.\\./)+(${dirs.join('|')})(/|$)`;
/** 同一文件命中多段配置时 ESLint 以"后者替换"合并规则选项，因此每段都自带全包通用的 @ra2web/* 禁令，避免被覆盖掉。 */
const NO_RA2WEB = { group: ['@ra2web/*'], message: 'packages/sc2k 不依赖仓库内其他包；源码一律相对路径 import' };
/** 依赖方向只约束生产代码：*.test.ts 可以 import testkit（它合法地依赖 io/**）与任何被测目录（裁定 6 的精神）；@ra2web/* 禁令由全包段继续覆盖测试文件。 */
const restrictImports = (files, patterns, ignores = [], paths = []) => ({
  files,
  ignores: [...ignores, `${SC2K}/**/*.test.ts`],
  rules: {
    'no-restricted-imports': ['error', { patterns: [NO_RA2WEB, ...patterns], ...(paths.length ? { paths } : {}) }],
  },
});
const SC2K_UPPER_OF_SIM = ['io', 'art', 'render', 'ui', 'audio', 'app', 'testkit'];
/** io/assets 禁止的网络模块（隐私红线，ARCHITECTURE §9.4）。 */
const SC2K_NET_MODULES = ['http', 'https', 'http2', 'net', 'dgram', 'tls', 'node:http', 'node:https', 'node:http2', 'node:net', 'node:dgram', 'node:tls', 'undici', 'axios', 'node-fetch', 'ws', 'socket.io-client']
  .map((name) => ({ name, message: 'io/assets 禁止网络 I/O（隐私红线，ARCHITECTURE §9.4）' }));
/** 裁定 4：含 DOM 类型的三个契约文件（HTMLElement / File / Blob）只许 app / ui / audio / render/pixi / io/assets 顶层 import；tsconfig.sim.json 覆盖的目录一律禁止。 */
const NO_DOM_CONTRACTS = { regex: '^(\\.\\./)+contracts/(rendererApi|assets|shell)(\\.ts)?$', message: 'contracts/{rendererApi,assets,shell}.ts 含 DOM 类型，sim 侧（tsconfig.sim.json 覆盖的目录）不得 import（裁定 4）' };

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'game-data/**', '**/*.d.ts', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // 模拟内核必须确定性：禁止真实时间、内建随机数与浮点三角函数。
    // 锁步联机要求所有客户端逐 tick 算出完全相同的世界状态。
    files: ['packages/game/src/**/*.ts'],
    ignores: ['packages/game/src/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '模拟层禁用 Math.random，使用 sim 内的种子 PRNG' },
        { object: 'Date', property: 'now', message: '模拟层禁止读取真实时间' },
        { object: 'performance', property: 'now', message: '模拟层禁止读取真实时间' },
        { object: 'Math', property: 'sin', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'cos', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'tan', message: '使用查表三角（fixed.ts），保证跨平台确定性' },
        { object: 'Math', property: 'atan2', message: '使用整数方向计算（fixed.ts）' },
        { object: 'Math', property: 'sqrt', message: '使用整数距离计算（fixed.ts）' },
        { object: 'Math', property: 'hypot', message: '使用整数距离计算（fixed.ts）' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '模拟层禁止读取真实时间' },
      ],
    },
  },
  // =========================================================================
  // packages/sc2k（a）确定性规则：模拟内核 / 契约 / 数据 / 编解码 / 程序化美术 / 场景编译 / CPU 合成
  // 禁止真实时间、内建随机数、浮点超越函数（Math.pow/exp/log 亦在列，§5.8：pow 用多项式近似）。测试文件豁免。
  // =========================================================================
  {
    files: [`${SC2K}/{contracts,data,sim,art,io/sc2,io/snapshot,render/scene,render/cpu}/**/*.ts`],
    ignores: [`${SC2K}/**/*.test.ts`],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '模拟层禁用 Math.random，使用 contracts/prng 的种子 PRNG（art 用 hashNoise）' },
        { object: 'Date', property: 'now', message: '模拟层禁止读取真实时间（now 由 app 注入 host.advance）' },
        { object: 'performance', property: 'now', message: '模拟层禁止读取真实时间（now 由 app 注入 host.advance）' },
        { object: 'Math', property: 'sin', message: '禁用浮点三角函数，保证跨引擎确定性' },
        { object: 'Math', property: 'cos', message: '禁用浮点三角函数，保证跨引擎确定性' },
        { object: 'Math', property: 'tan', message: '禁用浮点三角函数，保证跨引擎确定性' },
        { object: 'Math', property: 'atan2', message: '使用整数方向计算' },
        { object: 'Math', property: 'sqrt', message: '使用整数距离计算（Chebyshev / 平方比较）' },
        { object: 'Math', property: 'hypot', message: '使用整数距离计算（Chebyshev / 平方比较）' },
        { object: 'Math', property: 'pow', message: '禁用 Math.pow：spec:terrain §3.6 的 pow(n,1.15) 改为 n*(0.85+0.15*n) 之类的多项式' },
        { object: 'Math', property: 'exp', message: '禁用 Math.exp（浮点超越函数跨引擎不一致）' },
        { object: 'Math', property: 'log', message: '禁用 Math.log（浮点超越函数跨引擎不一致）' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '模拟层禁止读取真实时间' },
      ],
    },
  },
  // =========================================================================
  // packages/sc2k（b）依赖方向（ARCHITECTURE §2.2）：
  //   contracts ← data ← sim/core ← sim/<x> ← io/snapshot, io/sc2 ← art ← render/scene, render/cpu ← render/pixi ← ui, audio ← app
  // 源码一律相对路径，故用 regex 匹配 `../..../<dir>/`。转发桩 index.ts 对 app/stubs 开例外（裁定 5）。
  // =========================================================================
  // 全包（含测试）：不得 import @ra2web/*（新包独立；下面每段 restrictImports 也都自带该禁令）。
  {
    files: [`packages/sc2k/**/*.ts`],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_RA2WEB] }] },
  },
  // contracts：只允许 ./ 同目录；不得向上 import。
  restrictImports([`${SC2K}/contracts/**/*.ts`], [
    { regex: '^\\.\\./', message: 'contracts 是依赖图的根，不得 import 上层目录' },
  ]),
  // data：只允许 contracts。
  restrictImports([`${SC2K}/data/**/*.ts`], [
    { regex: upInto(['sim', ...SC2K_UPPER_OF_SIM]), message: 'data 只能依赖 contracts' },
    NO_DOM_CONTRACTS,
  ]),
  // sim/core：不得 import sim/<x>，也不得 import 上层目录。
  restrictImports([`${SC2K}/sim/core/**/*.ts`], [
    { regex: upInto(SC2K_SIM_IDS), message: 'sim/core 不得 import 具体系统目录（系统经 createSim 注入）' },
    { regex: upInto(SC2K_UPPER_OF_SIM), message: 'sim/** 不得 import io/art/render/ui/audio/app（快照编解码器经 CreateSimOptions.snapshot 注入）' },
    NO_DOM_CONTRACTS,
  ]),
  // sim/<a>：不得 import sim/<b>（只能经 ctx.q / ctx.act），不得 import 上层目录；转发桩 index.ts 例外（裁定 5）。
  ...SC2K_SIM_IDS.map((id) =>
    restrictImports([`${SC2K}/sim/${id}/**/*.ts`], [
      { regex: upInto(SC2K_SIM_IDS.filter((o) => o !== id)), message: `sim/${id} 不得 import 其他系统目录，只能经 ctx.q / ctx.act 交互` },
      { regex: upInto(SC2K_UPPER_OF_SIM), message: 'sim/** 不得 import io/art/render/ui/audio/app' },
      NO_DOM_CONTRACTS,
    ], [`${SC2K}/sim/${id}/index.ts`]),
  ),
  // io/**：不得 import art/render/ui/audio/app（io/sc2 更是纯编解码，不认识 CityState）；转发桩例外。
  restrictImports([`${SC2K}/io/**/*.ts`], [
    { regex: upInto(['art', 'render', 'ui', 'audio', 'app']), message: 'io/** 不得 import art/render/ui/audio/app' },
  ], [`${SC2K}/io/sc2/index.ts`, `${SC2K}/io/assets/index.ts`]),
  // io/sc2、io/snapshot（tsconfig.sim.json 覆盖）：另禁 DOM 契约文件（重申 io/** 的方向限制：后段替换前段）。
  restrictImports([`${SC2K}/io/sc2/**/*.ts`, `${SC2K}/io/snapshot/**/*.ts`], [
    { regex: upInto(['art', 'render', 'ui', 'audio', 'app']), message: 'io/** 不得 import art/render/ui/audio/app' },
    NO_DOM_CONTRACTS,
  ], [`${SC2K}/io/sc2/index.ts`]),
  // io/assets：隐私红线——不得 import 任何网络模块（字节流只在页面内存 / Worker / IndexedDB）。同时重申 io/** 的方向限制（后段替换前段的规则选项）。
  restrictImports([`${SC2K}/io/assets/**/*.ts`], [
    { regex: upInto(['art', 'render', 'ui', 'audio', 'app']), message: 'io/** 不得 import art/render/ui/audio/app' },
  ], [`${SC2K}/io/assets/index.ts`], SC2K_NET_MODULES),
  // io/assets 的纯编解码子目录（sprites / palette / text，tsconfig.sim.json 覆盖）：网络禁令 + 方向限制 + DOM 契约文件禁令（后段替换前段，故三者并列重申）。
  restrictImports([`${SC2K}/io/assets/{sprites,palette,text}/**/*.ts`], [
    { regex: upInto(['art', 'render', 'ui', 'audio', 'app']), message: 'io/** 不得 import art/render/ui/audio/app' },
    NO_DOM_CONTRACTS,
  ], [], SC2K_NET_MODULES),
  {
    files: [`${SC2K}/io/assets/**/*.ts`],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { name: 'XMLHttpRequest', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { name: 'WebSocket', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { name: 'EventSource', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { name: 'RTCPeerConnection', message: 'io/assets 禁止网络 I/O（隐私红线）' },
      ],
      'no-restricted-properties': ['error',
        { object: 'navigator', property: 'sendBeacon', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { object: 'window', property: 'fetch', message: 'io/assets 禁止网络 I/O（隐私红线）' },
        { object: 'globalThis', property: 'fetch', message: 'io/assets 禁止网络 I/O（隐私红线）' },
      ],
    },
  },
  // art：不得 import sim / io / render / ui / audio / app；转发桩 index.ts 例外。
  restrictImports([`${SC2K}/art/**/*.ts`], [
    { regex: upInto(['sim', 'io', 'render', 'ui', 'audio', 'app', 'testkit']), message: 'art 只能依赖 contracts / data（旋转置换表在 contracts/rotation.ts，没有白名单）' },
    NO_DOM_CONTRACTS,
  ], [`${SC2K}/art/index.ts`]),
  // render/scene、render/cpu：纯函数，不得 import sim / ui / audio / app / pixi.js / render/pixi。
  restrictImports([`${SC2K}/render/scene/**/*.ts`, `${SC2K}/render/cpu/**/*.ts`], [
    { regex: upInto(['sim', 'io', 'ui', 'audio', 'app', 'testkit']), message: 'render/scene、render/cpu 只能依赖 contracts / data / art' },
    { regex: '^(\\.\\./)+pixi(/|$)', message: 'render/scene、render/cpu 不得依赖 Pixi 后端' },
    { group: ['pixi.js', 'pixi.js/*'], message: 'render/scene、render/cpu 不得 import pixi.js（受 tsconfig.sim.json 约束的纯函数层）' },
    NO_DOM_CONTRACTS,
  ]),
  // render/pixi 与 render/index.ts：不得 import sim / ui / audio / app；转发桩 index.ts 例外。
  restrictImports([`${SC2K}/render/pixi/**/*.ts`, `${SC2K}/render/*.ts`], [
    { regex: upInto(['sim', 'ui', 'audio', 'app', 'testkit']), message: 'render 不得 import sim/ui/audio/app（只读 CityState 类型与 Queries）' },
  ], [`${SC2K}/render/index.ts`]),
  // ui、audio：不得 import sim / app；转发桩 index.ts 例外。
  restrictImports([`${SC2K}/ui/**/*.ts`, `${SC2K}/audio/**/*.ts`], [
    { regex: upInto(['sim', 'app', 'testkit']), message: 'ui/audio 不得 import sim/app（只经 SimHost / Queries / 事件交互）' },
  ], [`${SC2K}/ui/index.ts`, `${SC2K}/audio/index.ts`]),
  // app/stubs：不得 import sim/** 之外的上层实现（只认 contracts / data / sim / 自身；桩不得反向依赖 io/art/render/ui/audio 的真实现）。
  restrictImports([`${SC2K}/app/stubs/**/*.ts`], [
    { regex: upInto(['io', 'art', 'render', 'ui', 'audio', 'testkit']), message: 'app/stubs 只能依赖 contracts / data / sim 与自身（桩不得反向依赖真实现）' },
  ]),
  // 测试文件豁免确定性规则（裁定 6）。
  {
    files: [`${SC2K}/**/*.test.ts`, `packages/sc2k/e2e/**/*.ts`],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-globals': 'off',
    },
  },
);
