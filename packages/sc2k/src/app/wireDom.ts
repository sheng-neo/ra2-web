// ===== app/wireDom.ts =====（ARCHITECTURE §5.9：接线文件的 DOM / 渲染半边）
// 只有浏览器入口（app/boot.ts）import 这里：Pixi 渲染器（../render）、Win95 外壳（../ui，带 CSS）、素材库与导入面板（../io/assets，IndexedDB）。
// Node 侧工具（tools/headless.ts、tools/hash-compare.ts）与 testkit 只认 app/wire.ts（DOM-free），不得 import 本文件。
// 名字与签名按 CONTRACTS §V（RenderEntry / UiEntry / AssetsEntry）；本文件同时转发 wire.ts 的全部导出，boot 只需一处 import。
import type { RendererApi } from '../contracts/rendererApi';
import type { AssetImporter, AssetStore } from '../contracts/assets';
import type { ShellHandle, ShellOptions } from '../contracts/shell';
import type { Strings } from '../contracts/strings';
import { createRenderer } from '../render';
import { createAssetStore, createAssetImporter } from '../io/assets';
import { mountShell } from '../ui';
import { sc2Codec } from './wire';

export * from './wire';

export function createWiredRenderer(): RendererApi { return createRenderer(); }
/** strings 可选：传入后导入面板用玩家语言显示（contract-rfc WP14-3）；不传则面板用自带回退表。 */
export function createWiredAssets(strings?: Strings): { store: AssetStore; importer: AssetImporter } {
  const store = createAssetStore();
  return { store, importer: createAssetImporter(store, sc2Codec, strings ? { strings } : {}) };
}
export function mountWiredShell(opts: ShellOptions): ShellHandle { return mountShell(opts); }
