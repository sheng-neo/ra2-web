// ===== shell.ts =====（含 DOM 类型 HTMLElement，并经 rendererApi.ts / assets.ts 间接含 DOM；从 entrypoints.ts 拆出）
// UI 外壳与依赖 DOM 的模块入口类型（CONTRACTS §V 中 render / io/assets / ui 三个目录的入口 + boot.ts 的调试句柄）。
// 只允许 render/pixi、ui、app、app/stubs 与各目录转发桩 index.ts import；sim 侧代码不得 import 本文件。
import type { SimHost } from './host';
import type { RendererApi } from './rendererApi';
import type { SceneCompiler, CpuCompositor } from './render';
import type { Strings } from './strings';
import type { AudioSink } from './audio';
import type { AssetStore, AssetImporter, SaveStore } from './assets';
import type { Sc2Codec } from './io';
import type { ToolId } from './catalogue';

/** render/index.ts 的出口：createRenderer（WP11）、sceneCompiler / cpuCompositor（WP10，WP11 re-export）。 */
export interface RenderEntry { createRenderer(): RendererApi; sceneCompiler: SceneCompiler; cpuCompositor: CpuCompositor }
/** io/assets/index.ts 的出口（WP14；WP0 为内存 AssetStore + 空面板）。 */
export interface AssetsEntry { createAssetStore(): AssetStore; createAssetImporter(store: AssetStore, sc2: Sc2Codec): AssetImporter }
export type WindowId = 'newCity' | 'budget' | 'ordinances' | 'bonds' | 'map' | 'graphs' | 'neighbors' | 'newspaper' | 'query' | 'saveLoad' | 'population' | 'industries' | 'importAssets';
export interface ShellOptions {
  root: HTMLElement; host: SimHost; renderer: RendererApi; strings: Strings; audio: AudioSink; saves: SaveStore; v1Tools: ReadonlySet<ToolId>;
  importer?: AssetImporter | null;            // Title 页 / File 菜单的"导入素材"入口（WP14 [v1]）；null 时隐藏入口
}
export interface ShellHandle { destroy(): void; openWindow(id: WindowId): void; closeWindow(id: WindowId): void; setTool(tool: ToolId | null): void; showTitle(): void }
/** ui/index.ts 的出口（WP12；WP0 为 stubShell）。 */
export interface UiEntry { mountShell(opts: ShellOptions): ShellHandle }
/** boot.ts 自行 `declare global { interface Window { __sc2k?: Sc2kDebugHandle } }`；e2e/hash.spec 读 host.hash('full')，smoke 读 renderer.stats() 与 shell.openWindow。 */
export interface Sc2kDebugHandle { host: SimHost; renderer: RendererApi; shell: ShellHandle; version: string }
