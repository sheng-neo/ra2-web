// ===== sim/events/commands.ts =====（CONTRACTS §K：requestDisaster / dispatch 归 events；MODAL_OWNER：disasterAlert / newspaper / extraPaper）
// requestDisaster 只写 state.disaster.pending（+ 可选原点进 priv.pendingAt），由 thingsTick 的状态机启动；V1_DISASTERS 之外 → notImplemented。
import type { Command, CommandResult, ModalId } from '../../contracts/commands';
import { NOT_IMPLEMENTED_RESULT } from '../../contracts/commands';
import { CityMode, DISASTER_MENU, V1_DISASTERS, inMap, tileIndex } from '../../contracts/grid';
import type { DisasterKind } from '../../contracts/grid';
import type { SimContext } from '../../contracts/system';
import { privOf } from './common';
import { dispatchCommand } from './dispatch';
import type { EventsTuning } from './tuning';

const reject = (reason: CommandResult['reason']): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });

export function requestDisaster(ctx: SimContext, cmd: Extract<Command, { type: 'requestDisaster' }>): CommandResult {
  const kind = cmd.kind as DisasterKind;
  if (!DISASTER_MENU.includes(kind) || !V1_DISASTERS.has(kind)) return NOT_IMPLEMENTED_RESULT;
  const s = ctx.state;
  if (s.clock.mode === CityMode.TerrainEdit) return reject('mode');
  const P = privOf(s);
  s.disaster.pending = kind;
  P.pendingAt = cmd.x !== undefined && cmd.y !== undefined && inMap(cmd.x | 0, cmd.y | 0) ? tileIndex(cmd.x | 0, cmd.y | 0) : -1;
  return { ok: true, cost: 0, changed: [] };
}

export function dispatch(ctx: SimContext, T: EventsTuning, cmd: Extract<Command, { type: 'dispatch' }>): CommandResult {
  return dispatchCommand(ctx, T, cmd.kind, cmd.x | 0, cmd.y | 0);
}

/** 模态回答：disasterAlert 的 answer 1 = 跳到灾害原点；报纸模态只需关闭（core 已处理 modalPause）。 */
export function onModalAnswer(ctx: SimContext, dialog: ModalId, answer: number): void {
  if (dialog === 'disasterAlert' && answer === 1) {
    const D = ctx.state.disaster;
    ctx.act.emit({ type: 'goto', x: D.pointX, y: D.pointY, smooth: true });
  }
}
