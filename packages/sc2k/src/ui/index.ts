// ===== ui/index.ts =====（WP0 转发桩 → WP12 接手；导出名与签名按 CONTRACTS §V UiEntry）
import type { UiEntry } from '../contracts/shell';
import { mountShell as stubMountShell } from '../app/stubs/stubShell';

export const mountShell = stubMountShell satisfies UiEntry['mountShell'];
