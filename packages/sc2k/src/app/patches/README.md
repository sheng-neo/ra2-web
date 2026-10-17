# `src/app/patches/` —— 集成期适配层（Lead 独占）

本目录在日内默认为空（只有本 README）。用途见 `docs/ARCHITECTURE.md` §5.9 与 `docs/WORKPLAN.md` §4：

- 跨模块修补**优先**在对方 WP 的分支上提 patch。
- 只有对方不在线时，Lead 才可在此写 `<systemId>.ts` 适配层：包装对方目录 `index.ts` 的 `create<Id>System()` 返回值，覆盖个别 `queries / commands`；
  **不得**改动 `COMMAND_OWNER / ACTION_OWNER` 的归属，不得改 `wire.ts`（除 `WIRE_STUB_ALLOWLIST`），不得改对方目录。
- 每个 patch 文件头部必须写明：修补对象、原因、到期删除条件（例如"WP5 合入 lot 计时器修复后删除"）。
- 合并列车 #3 打标 `v1-playable` 前，本目录应重新为空。

文件模板：

```ts
// patch: zones —— 覆盖 queries.zones.lotAt 的空指针（WP5 分支 fix/lot-null 合入后删除）
import type { System } from '../../contracts/system';
export function patchZones(sys: System): System { return { ...sys, queries: { ...sys.queries, zones: { ...sys.queries?.zones!, lotAt: (i) => sys.queries?.zones?.lotAt(i) ?? null } } }; }
```
