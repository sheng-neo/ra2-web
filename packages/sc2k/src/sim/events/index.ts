// ===== sim/events/index.ts =====（WP0 转发桩 → 对应 WP 接手后整目录重写；导出名与签名按 CONTRACTS §V SimEntries）
// 桩：nullSystem('events')（stub: true、无阶段 / 命令，queries / actions 为 realistic 桩）。ESLint 对本文件 import app/stubs 开例外（裁定 5），接手后删除。
import type { System } from '../../contracts/system';
import type { SimEntries } from '../../contracts/entrypoints';
import { nullSystem } from '../../app/stubs/null';

export const createEventsSystem = ((): System => nullSystem('events')) satisfies SimEntries['createEventsSystem'];
