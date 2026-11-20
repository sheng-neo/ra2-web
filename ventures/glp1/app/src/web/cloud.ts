/**
 * 发布成 claude.ai 私有网页时的云端保存（artifact 的 db 能力）。
 * - 本地 IndexedDB 仍是工作库，读写都快、断网可用；
 * - 每次写入同时镜像到 data/users/<我的 id>/ 下（只有本人能读）；
 * - 打开页面时先从云端拉回全部记录，换手机也能看到。
 * 不在 claude.ai 里打开时（本地开发、自己的服务器），这里什么都不做。
 */
import { db, RECORD_TABLES } from './db';

type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
type ColRef = { doc(id: string): DocRef; get(): Promise<{ docs: DocSnap[] }> };
type DbNs = { collection(path: string): ColRef };
type UserNs = { id(): Promise<string | null> };
type DownloadsNs = { save(o: { filename: string; data: string | Blob }): Promise<unknown> };
type ClaudeGlobal = { use(name: string): Promise<unknown> };

const TABLES = ['profile', ...RECORD_TABLES] as const;
type TableName = (typeof TABLES)[number];

let col: ColRef | null = null;
let applyingRemote = false;
const chains = new Map<string, Promise<unknown>>();
export type CloudState = 'on' | 'off' | 'failed';
let state: CloudState = 'off';

function claudeGlobal(): ClaudeGlobal | null {
  const c = (window as unknown as { claude?: ClaudeGlobal }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export function inClaude(): boolean {
  return claudeGlobal() !== null;
}

export function cloudState(): CloudState {
  return state;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const key = (table: TableName, id: string) => `${table}~${id}`;
const clean = (o: unknown) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

/** 同一条记录一次只写一个请求，按顺序排队。 */
function push(table: TableName, row: { id: string }): void {
  if (!col || applyingRemote) return;
  const k = key(table, row.id);
  const body = clean({ ...row, _table: table });
  const prev = chains.get(k) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => col!.doc(k).set(body))
    .catch(async (e: { code?: string }) => {
      if (e?.code === 'unavailable') {
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));
        return col!.doc(k).set(body);
      }
      console.warn('cloud save failed', e);
    });
  chains.set(k, next);
}

function installHooks(): void {
  for (const t of TABLES) {
    const table = db.table(t);
    table.hook('creating', (_pk, obj) => {
      push(t, obj as { id: string });
    });
    table.hook('updating', (mods, _pk, obj) => {
      push(t, { ...(obj as object), ...(mods as object) } as { id: string });
    });
  }
}

/** 打开时调用：等 claude.ai 提供 db 和 user（最多 10 秒），拉回云端记录，再装写入钩子。 */
export async function initCloud(): Promise<CloudState> {
  const claude = claudeGlobal();
  if (!claude) return (state = 'off');
  try {
    const [dbNs, userNs] = await Promise.all([withTimeout(claude.use('db') as Promise<DbNs | null>, 10000), withTimeout(claude.use('user') as Promise<UserNs | null>, 10000)]);
    if (!dbNs || !userNs) return (state = 'failed');
    const uid = await withTimeout(userNs.id(), 10000);
    if (!uid) return (state = 'failed');
    const c = dbNs.collection(`data/users/${uid}`);
    const snap = await withTimeout(c.get(), 10000);
    if (!snap) return (state = 'failed');
    const remoteKeys = new Set<string>();
    applyingRemote = true;
    try {
      for (const d of snap.docs) {
        const body = d.data();
        if (!d.exists || !body) continue;
        const t = body._table as TableName | undefined;
        if (!t || !TABLES.includes(t)) continue;
        remoteKeys.add(d.id);
        const row = { ...body };
        delete row._table;
        const local = (await db.table(t).get(row.id as string)) as { updatedAt?: number } | undefined;
        if (!local || (local.updatedAt ?? 0) <= ((row.updatedAt as number) ?? 0)) await db.table(t).put(row);
      }
    } finally {
      applyingRemote = false;
    }
    col = c;
    installHooks();
    // 本机有、云端没有的（比如之前离线记的），补传上去。
    for (const t of TABLES) {
      for (const row of (await db.table(t).toArray()) as { id: string }[]) {
        if (!remoteKeys.has(key(t, row.id))) push(t, row);
      }
    }
    return (state = 'on');
  } catch (e) {
    console.warn('cloud init failed', e);
    applyingRemote = false;
    return (state = 'failed');
  }
}

/** "删除全部数据"：云端也一起删。 */
export async function wipeCloud(): Promise<void> {
  if (!col) return;
  const snap = await col.get();
  for (const d of snap.docs) await col.doc(d.id).delete().catch(() => undefined);
}

/** 在 claude.ai 里，普通下载链接无效，要走 downloads 能力。返回 false 表示应该用普通下载。 */
export async function saveViaClaude(filename: string, content: string, type: string): Promise<boolean> {
  const claude = claudeGlobal();
  if (!claude) return false;
  const dl = (await withTimeout(claude.use('downloads') as Promise<DownloadsNs | null>, 5000)) ?? null;
  if (!dl) return false;
  await dl.save({ filename, data: new Blob([content], { type }) });
  return true;
}
