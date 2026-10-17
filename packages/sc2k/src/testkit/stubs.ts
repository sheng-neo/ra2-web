// ===== testkit/stubs.ts =====（CONTRACTS §U：三套桩的重导出 + 洋红占位 provider）
// testkit 允许 import app/stubs 与 io/**（sim/** 不可）。
import type { BuiltinProceduralStub, StubActionsFn, StubQueriesFn } from '../contracts/testkit';
import { stubQueries as appStubQueries } from '../app/stubs/stubQueries';
import { stubActions as appStubActions } from '../app/stubs/stubActions';
import { createStubProvider } from '../app/stubs/stubProvider';

export const stubQueries: StubQueriesFn = appStubQueries;
export const stubActions: StubActionsFn = appStubActions;
/** 洋红占位 provider（WP0）：任何 key 返回同一菱形；与 art/index.ts 的 createProceduralProvider 桩同源。 */
export const BUILTIN_PROCEDURAL_STUB: BuiltinProceduralStub = createStubProvider();
export { nullSystem } from '../app/stubs/null';
