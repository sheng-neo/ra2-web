// ===== io/assets/index.ts =====（WP14；导出名与签名按 CONTRACTS §V AssetsEntry（contracts/shell.ts））
// createAssetStore：IndexedDB `sc2k-assets`（files / decoded / handles / saves / meta），无 indexedDB 时回退内存实现；
// createAssetImporter：最小导入面板（文件多选 → 识别 → 入库 → Worker 解码 → DatSpriteProvider → onProviderReady）。
// 本目录经 ESLint 禁止 import 网络模块与网络全局（隐私红线，ARCHITECTURE §9.4；import/privacy.test 另做 grep 断言）。
import type { AssetsEntry } from '../../contracts/shell';
import { createAssetStore } from './import/store';
import { createAssetImporter } from './import/panel';

export { createAssetStore, createMemoryAssetStore, createIndexedDbAssetStore, decodedCacheKey, bundleToDecodedAssets, decodedAssetsToSource, DB_NAME, DB_VERSION, AssetStoreError } from './import/store';
export type { AssetStoreExt } from './import/store';
export { createAssetImporter, STORED_KINDS } from './import/panel';
export type { AssetImporterExt, ImporterOptions, ImporterState, ImportRow, ArtStatus } from './import/panel';
export { identify, identifyBytes, identifyFile, kindByName, sniffMagic, HEAD_BYTES } from './import/identify';
export type { IdentifyResult } from './import/identify';
export { sha256Hex } from './import/sha256';
export { createDecodeClient, defaultSpawnWorker } from './import/decodeClient';
export { parseSpriteArchive, decodeSprite, decodeAll } from './sprites/archive';
export type { SpriteArchive, SpriteEntry, DuplicateEntry, DecodedSprite, ParseSpriteOptions, DecodeSpriteOptions } from './sprites/archive';
export { decodeBundle, DECODER_VERSION } from './sprites/bundle';
export type { DatBundle, DecodeBundleInput } from './sprites/bundle';
export { createDatSpriteProvider, DAT_NATIVE_SCALES } from './sprites/provider';
export type { DatSpriteProvider, DatProviderSource } from './sprites/provider';
export { buildIdLayout, layoutKey, relativeIdOf, absoluteIdOf, ZOOM_BASE, DAT_TILE, DAT_ZOOM_OF_SCALE, REL, datAnchor } from './sprites/ids';
export type { IdLayout, DatZoom } from './sprites/ids';
export { readPaletteBmp, writePaletteBmp } from './palette/bmp';
export { AssetFormatError } from './sprites/bytes';

({ createAssetStore, createAssetImporter }) satisfies AssetsEntry;
