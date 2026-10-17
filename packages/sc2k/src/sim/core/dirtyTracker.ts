// ===== sim/core/dirtyTracker.ts =====
// 脏追踪（ARCHITECTURE §3.5）：真实现在 contracts/dirty.ts（createDirtyTracker），本文件只做薄转发，
// 让 sim/core 的调用方与测试统一从这里取；WP1 若要扩展（例如按层分桶）在此包装而不改契约。
export { createDirtyTracker, BULK_LAYERS } from '../../contracts/dirty';
export type { DirtyTracker, DirtyChanges, BulkLayer } from '../../contracts/dirty';
