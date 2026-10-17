// ===== sim/services/commands.ts =====
// COMMAND_OWNER 归 services 的两条命令：sign（告示牌，XTXT 0x01..0x32 + XLAB；> 50 个 → limit；text null / 空 → 删除）、
// rename（微模拟建筑改名：写 XLAB[0x33 + slot]）。spec:file-formats §2.2.7–§2.2.8、WORKPLAN WP7。
import type { Command, CommandResult } from '../../contracts/commands';
import { TILES } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { isExclusiveSlot, isSharedSlot, labelOfSlot, recTileId } from './microsim';
import { SIGN_LABEL_FIRST, SIGN_LABEL_LAST } from './tables';
import type { ServicesTuning } from './tuning';
import { writeLabel } from './xlab';

const ok = (changed: readonly number[] = []): CommandResult => ({ ok: true, cost: 0, changed });
const reject = (reason: CommandResult['reason']): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });
const isSignLabel = (v: number): boolean => v >= SIGN_LABEL_FIRST && v <= SIGN_LABEL_LAST;

/** 第一个未被任何格引用的告示牌标签（1..min(50, signLimit)）；无 → 0。 */
function freeSignLabel(xtxt: Uint8Array, limit: number): number {
  const last = Math.min(SIGN_LABEL_LAST, SIGN_LABEL_FIRST + Math.max(0, limit) - 1);
  const used = new Uint8Array(SIGN_LABEL_LAST + 1);
  for (let i = 0; i < TILES; i++) { const v = xtxt[i]!; if (isSignLabel(v)) used[v] = 1; }
  for (let v = SIGN_LABEL_FIRST; v <= last; v++) if (used[v] === 0) return v;
  return 0;
}

export function handleSign(ctx: SimContext, t: ServicesTuning, cmd: Extract<Command, { type: 'sign' }>): CommandResult {
  const at = cmd.at | 0;
  if (at < 0 || at >= TILES) return reject('outOfBounds');
  const L = ctx.state.layers;
  const cur = L.xtxt[at]!;
  const text = cmd.text === null ? '' : cmd.text.trim();
  if (text === '') {
    if (!isSignLabel(cur)) return reject('noTarget');
    L.xtxt[at] = 0; writeLabel(L.xlab, cur, '');
    ctx.act.layerChanged('xtxt');
    return ok([at]);
  }
  let label = cur;
  if (!isSignLabel(cur)) {
    if (cur !== 0) return reject('occupied');                       // 微模拟标签 / 邻城连接 / 标记占用
    label = freeSignLabel(L.xtxt, t.signLimit);
    if (label === 0) return reject('limit');
    L.xtxt[at] = label;
  }
  writeLabel(L.xlab, label, text);
  ctx.act.layerChanged('xtxt');
  return ok([at]);
}

export function handleRename(ctx: SimContext, cmd: Extract<Command, { type: 'rename' }>): CommandResult {
  const slot = cmd.slot | 0;
  const L = ctx.state.layers;
  const valid = isSharedSlot(slot) || (isExclusiveSlot(slot) && recTileId(L.xmic, slot) !== 0);
  if (!valid) return reject('noTarget');
  writeLabel(L.xlab, labelOfSlot(slot), cmd.text.trim());
  ctx.act.layerChanged('xtxt');
  return ok();
}
