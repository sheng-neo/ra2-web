// ===== art/index.ts =====（WP0 转发桩 → WP9 接手；导出名与签名按 CONTRACTS §V ArtEntry）
// createProceduralProvider = 洋红菱形 stubProvider；createProceduralProviderAsync 可选，WP9 提供 Worker 版本。
import type { ArtEntry } from '../contracts/entrypoints';
import { createStubProvider } from '../app/stubs/stubProvider';

export const createProceduralProvider = createStubProvider satisfies ArtEntry['createProceduralProvider'];
