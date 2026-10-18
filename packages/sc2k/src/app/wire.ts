// ===== app/wire.ts =====（ARCHITECTURE §5.9：唯一接线文件）
// 只 import 各目录的 index.ts（名字与签名按 CONTRACTS §V），把 9 个系统交给 createSim。
// 从冻结起到打标 v1-playable，本文件唯一允许的改动是 WIRE_STUB_ALLOWLIST（随各 WP 合入逐个收缩，打标时为 []）。
// 跨模块修补走 app/patches/<systemId>.ts 适配层（包装 create<Id>System() 的返回值），本文件不变。
import type { SimHost } from '../contracts/host';
import type { SystemId, TuningBag } from '../contracts/system';
import type { SpriteProvider } from '../contracts/render';
import type { RendererApi } from '../contracts/rendererApi';
import type { AudioSink } from '../contracts/audio';
import type { Strings } from '../contracts/strings';
import type { AssetImporter, AssetStore } from '../contracts/assets';
import type { ShellHandle, ShellOptions } from '../contracts/shell';

import { V1_TOOL_IDS } from './v1Tools';
import { createCoreSystem, createSim } from '../sim/core';
import { createTerrainSystem } from '../sim/terrain';
import { createPlacementSystem } from '../sim/placement';
import { createUtilitiesSystem } from '../sim/utilities';
import { createZonesSystem } from '../sim/zones';
import { createTransportSystem } from '../sim/transport';
import { createServicesSystem } from '../sim/services';
import { createEconomySystem } from '../sim/economy';
import { createEventsSystem } from '../sim/events';
import { CATALOGUE, createStrings } from '../data';
import { snapshotCodec } from '../io/snapshot';
import { sc2Codec } from '../io/sc2';
import { createAssetStore, createAssetImporter } from '../io/assets';
import { createRenderer } from '../render';
import { createProceduralProvider } from '../art';
import { createAudioSink } from '../audio';
import { mountShell } from '../ui';

/**
 * 允许为桩的系统（stub: true）。冻结时 = 8 个非 core 系统全集；每个 WP 合入时从这里删掉自己的 id；
 * 打标 v1-playable 时为 []，CI 以 SC2K_STRICT_WIRE=1 断言无桩残留（createSim 在 allowlist 之外发现桩即抛错）。
 */
export const WIRE_STUB_ALLOWLIST: readonly SystemId[] = [
  ];

export interface WiredHostOptions { tuning?: TuningBag; impeachMonthly?: boolean }

/** 装配 SimHost：9 个系统 + 目录表 + 快照编解码器（唯一注入点）+ 桩白名单。 */
export function createWiredHost(opts: WiredHostOptions = {}): SimHost {
  return createSim({
    systems: [
      createCoreSystem(),
      createTerrainSystem(), createPlacementSystem(), createUtilitiesSystem(), createZonesSystem(),
      createTransportSystem(), createServicesSystem(), createEconomySystem(), createEventsSystem(),
    ],
    catalogue: CATALOGUE,
    snapshot: snapshotCodec,
    stubAllowlist: WIRE_STUB_ALLOWLIST,
    // 默认把 v1 工具白名单注入 placement（availability 对白名单外工具返回 notImplemented）；调用方 tuning 可覆盖。
    tuning: { placement: { v1Tools: V1_TOOL_IDS }, ...(opts.tuning ?? {}) },
    impeachMonthly: opts.impeachMonthly,
  });
}

export function createWiredRenderer(): RendererApi { return createRenderer(); }
export function createWiredProvider(): SpriteProvider { return createProceduralProvider(); }
export function createWiredAudio(): AudioSink { return createAudioSink(); }
export function createWiredStrings(lang: 'zh' | 'en' = 'zh'): Strings { return createStrings(lang); }
/** strings 可选：传入后导入面板用玩家语言显示（contract-rfc WP14-3）；不传则面板用自带回退表。 */
export function createWiredAssets(strings?: Strings): { store: AssetStore; importer: AssetImporter } {
  const store = createAssetStore();
  return { store, importer: createAssetImporter(store, sc2Codec, strings ? { strings } : {}) };
}
export function mountWiredShell(opts: ShellOptions): ShellHandle { return mountShell(opts); }

export { CATALOGUE, sc2Codec, snapshotCodec };
