// ===== ui/windowTypes.ts =====（WP0/Lead 预置：外壳框架（WP12a）与窗口组件（WP12b）之间的内部契约）
// 外壳框架按 WINDOW_FACTORIES[id] 创建窗口、按 MODAL_FACTORIES[id] 创建模态内容；窗口组件只依赖 WindowDeps，不直接碰外壳内部。
// 含 DOM 类型，仅 ui/ 与 app/ 可 import。
import type { SimHost } from '../contracts/host';
import type { RendererApi } from '../contracts/rendererApi';
import type { Strings } from '../contracts/strings';
import type { AudioSink } from '../contracts/audio';
import type { SaveStore, AssetImporter } from '../contracts/assets';
import type { ToolId } from '../contracts/catalogue';
import type { Command, CommandResult, ModalId } from '../contracts/commands';
import type { WindowId } from '../contracts/shell';

/** 窗口 / 模态组件能拿到的全部依赖（由外壳框架构造，一次创建、长期持有）。 */
export interface WindowDeps {
  host: SimHost;
  renderer: RendererApi;
  strings: Strings;
  audio: AudioSink;
  saves: SaveStore;
  v1Tools: ReadonlySet<ToolId>;
  importer: AssetImporter | null;
  dispatch(cmd: Command): CommandResult;      // 经外壳统一派发（会播放拒绝音效、刷新状态栏）
  openWindow(id: WindowId): void;
  closeWindow(id: WindowId): void;
  /** 玩家在地图上点选一格（Query / 居中）时由外壳调用；窗口可注册监听，返回取消函数。 */
  onTilePicked(fn: (x: number, y: number) => void): () => void;
}
/** 一个窗口实例：el 由组件创建并自管内容；refresh 在 uiRefresh 事件与打开时被调用。 */
export interface WindowSpec {
  id: WindowId;
  title: string;
  el: HTMLElement;
  width?: number;
  height?: number;
  refresh?(): void;
  onShow?(): void;
  onHide?(): void;
  destroy?(): void;
}
export type WindowFactory = (deps: WindowDeps) => WindowSpec;
/** 模态内容：answer(n) 由组件在玩家做出选择时调用；外壳负责关闭并按模态类型调用 host.modalClosed() 或重发命令。 */
export interface ModalContent { title: string; el: HTMLElement; refresh?(): void; destroy?(): void }
export type ModalFactory = (deps: WindowDeps, payload: unknown, answer: (n: number) => void) => ModalContent;
export type WindowFactories = Partial<Record<WindowId, WindowFactory>>;
export type ModalFactories = Partial<Record<ModalId, ModalFactory>>;
