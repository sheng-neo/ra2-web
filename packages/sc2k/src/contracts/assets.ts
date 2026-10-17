// ===== assets.ts =====（spec:file-formats §3.9；含 DOM 类型 File / Blob / HTMLElement，sim 侧代码不得 import）
// 本地导入与存档库（CONTRACTS §S；WP14 实现，WP12 的 savesLite 实现 SaveStore 子集）。
import type { Diagnostic } from './system';
import type { SpriteProvider } from './render';
export type AssetKind = 'LARGE' | 'SMALLMED' | 'SPECIAL' | 'PAL_MSTR' | 'PAL_STTC' | 'PAL_MAC' | 'DATA_USA_DAT' | 'DATA_USA_IDX' | 'TEXT_USA_DAT' | 'TEXT_USA_IDX' | 'SC2' | 'SCN' | 'MIF' | 'UNKNOWN';
export interface IdentifiedFile { kind: AssetKind; name: string; size: number; lastModified: number; file: File }
export type SaveKind = 'sc2' | 'sc2kweb';
export interface SaveMeta { id: number; kind: SaveKind; name: string; cityName: string; year: number; population: number; savedAt: number; thumbnail: Blob | null }
export interface SaveRecord extends Omit<SaveMeta, 'id'> { id?: number; bytes: ArrayBuffer }
export interface SaveStore { listSaves(): Promise<SaveMeta[]>; putSave(s: SaveRecord): Promise<number>; getSave(id: number): Promise<SaveRecord | undefined>; deleteSave(id: number): Promise<void> }
/** idLayout：键 = `${SpriteKind}:${id}`（overlay / actor 用 OverlayId / ActorId 的数值，terrain 256+nibble、water 270+shape 等相对号规则见 spec:ui-art §2.9.2），值 = DAT 精灵号；缺项即 DatSpriteProvider.has → false 走回退链。 */
export interface DecodedAssets { atlasPages: Blob[]; frames: Map<number, { page: number; x: number; y: number; w: number; h: number; anchorX: number; anchorY: number }>; idLayout: Record<string, number>; diagnostics: Diagnostic[] }
export interface AssetStore extends SaveStore {
  putFile(f: IdentifiedFile, bytes: ArrayBuffer): Promise<void>; getFile(kind: AssetKind): Promise<{ bytes: ArrayBuffer; sha256: string } | undefined>;
  putDecoded(key: string, v: DecodedAssets): Promise<void>; getDecoded(key: string): Promise<DecodedAssets | undefined>;
  getPrefs(): Promise<{ useOriginalArt: boolean; persistGranted: boolean }>; setPrefs(p: { useOriginalArt?: boolean; persistGranted?: boolean }): Promise<void>;
  clearAll(): Promise<void>; estimate(): Promise<{ usage: number; quota: number }>;
}
export interface AssetImporter { mount(el: HTMLElement): void; unmount(): void; onProviderReady(fn: (p: SpriteProvider | null) => void): () => void }
export const DEFAULT_SAVE_KIND: SaveKind = 'sc2';
