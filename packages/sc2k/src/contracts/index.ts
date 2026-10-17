// ===== index.ts =====
// 契约桶文件：只 re-export 不含 DOM 类型的纯文件，因此可被 tsconfig.sim.json 覆盖的任何目录 import。
// 含 DOM 类型的三个文件不在此列，上层代码直接从它们 import：
//   ./rendererApi.ts（RendererApi：attach(host: HTMLElement)）
//   ./assets.ts（File / Blob / HTMLElement：IdentifiedFile、SaveMeta、AssetStore、AssetImporter …）
//   ./shell.ts（RenderEntry、AssetsEntry、UiEntry、ShellOptions、ShellHandle、WindowId、Sc2kDebugHandle）
export * from './grid';
export * from './rotation';
export * from './footprint';
export * from './net';
export * from './prng';
export * from './state';
export * from './clock';
export * from './system';
export * from './queries';
export * from './actions';
export * from './commands';
export * from './events';
export * from './catalogue';
export * from './io';
export * from './snapshot';
export * from './dirty';
export * from './render';
export * from './host';
export * from './audio';
export * from './strings';
export * from './testkit';
export * from './entrypoints';
