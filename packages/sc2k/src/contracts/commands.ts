// ===== commands.ts =====
// 命令、拒绝原因、模态（CONTRACTS §K）。Command 的 type 字面量与 RejectReason / ModalId 的现有成员冻结，只允许加法。
import type { ZoneCode } from './grid';
import type { NetFamily } from './net';
import type { Speed, TaxRates, BudgetLine, OrdinanceId } from './state';
import type { SystemId } from './system';

export type RejectReason =
  | 'funds' | 'occupied' | 'slope' | 'water' | 'needWaterfall' | 'outOfBounds' | 'zoned' | 'notInvented' | 'locked' | 'alreadyBuilt'
  | 'ordinance' | 'adjacency' | 'nimby' | 'microsimFull' | 'waterCells' | 'terrain' | 'obstructed' | 'mode' | 'limit' | 'noTarget'
  | 'needsBridge' | 'tooHigh' | 'tooLow' | 'tooLong' | 'notImplemented' | 'cancelled';
/** 模态对话框标识：阶段挂起型（budget militaryOffer scenarioBrief scenarioResult gameOver newspaper extraPaper disasterAlert rewardOffer）由 SimEvent 'modal' 打开；命令结果型（bridgeType teamPick neighborConnect）由 CommandResult.modal 打开；importAssets 为纯 UI 模态。newspaper = 4 月 / 8 月订阅版，extraPaper = 号外（UI 用同一 Newspaper 组件）。 */
export type ModalId = 'budget' | 'militaryOffer' | 'disasterAlert' | 'scenarioBrief' | 'scenarioResult' | 'gameOver' | 'newspaper' | 'extraPaper' | 'rewardOffer'
  | 'bridgeType' | 'teamPick' | 'neighborConnect' | 'importAssets';

export type Command =
  | { type: 'placeBuilding'; id: number; x: number; y: number }                 // (x,y) = 占地 TL 锚格；体育场成功后 modal teamPick
  | { type: 'zoneRect'; zone: ZoneCode; x0: number; y0: number; x1: number; y1: number }   // 不合格格跳过并按实际格数计费
  | { type: 'dezone'; tiles: number[] } | { type: 'bulldoze'; tiles: number[] }
  | { type: 'terrainTool'; tool: 'raise' | 'lower' | 'level' | 'water' | 'trees' | 'forest' | 'stream' | 'stretch' | 'seaLevel'; path: number[]; arg?: number }
  /**
   * 线性网络：from/to 为格索引，沿位移大的轴约束成直线。kind='highway' 时 from/to 先吸附到偶数 2×2 块（x0 = tileX & ~1，y0 = tileY & ~1），
   * 按块步进；preview 返回全部块格。遇水且未给 bridge → { ok:false, reason:'needsBridge', modal:{ id:'bridgeType', payload:{ from, to, length, options:BridgeKind[] } } }，
   * UI 带 bridge 重新派发。到达边缘格且构成连接 → 正常放置并返回 modal neighborConnect，UI 再派发 neighborConnection。
   */
  | { type: 'network'; kind: NetFamily | 'highway'; from: number; to: number; bridge?: number }
  | { type: 'tunnel'; at: number } | { type: 'neighborConnection'; at: number; accept: boolean }
  | { type: 'setTax'; rates: TaxRates } | { type: 'setIndustryTax'; k: number; rate: number }
  | { type: 'setFunding'; line: BudgetLine; pct: number } | { type: 'setOrdinance'; id: OrdinanceId; on: boolean }
  | { type: 'issueBond' } | { type: 'repayBond' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setOption'; key: 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paperDelivery' | 'extraPaper'; value: boolean }
  | { type: 'requestDisaster'; kind: number /*DisasterKind；不在 DISASTER_MENU 或 v1 未实现 → notImplemented*/; x?: number; y?: number } | { type: 'dispatch'; kind: 0 | 1 | 2 /*警 / 消 / 军*/; x: number; y: number }
  | { type: 'sign'; at: number; text: string | null } | { type: 'rename'; slot: number; text: string }
  | { type: 'cheat'; code: string } | { type: 'terrainDone' }
  | { type: 'setView'; x: number; y: number; zoom: number; rotation: 0 | 1 | 2 | 3 }       // 只写 view/terrain.rotation（不入哈希）
  | { type: 'modalAnswer'; dialog: ModalId; answer: number };                               // 挂起期间允许派发
export interface CommandResult { ok: boolean; cost: number; reason?: RejectReason; changed: readonly number[]; modal?: { id: ModalId; payload: unknown } }
export interface PlacementPreview { ok: boolean; cost: number; tiles: ReadonlyArray<{ i: number; ok: boolean; reason?: RejectReason }>; footprint?: { x0: number; y0: number; size: number }; reason?: RejectReason }
/** 命令日志条目：phaseCursor = 派发时 clock.phaseCursor（0 = 两天之间；>0 = 挂起期间），重放据此在同一阶段重新挂起。 */
export interface LoggedCommand { age: number; phaseCursor: number; seq: number; cmd: Command }

/**
 * 每种命令唯一处理者（registry.test：键集合 == Command['type'] 全集；每个真系统的 commands 键集合 == 归自己的集合；createSim 对越权注册抛错）。
 *  core 的四条：setSpeed 写 clock.speed；setView 写 view / terrain.rotation（不入哈希）；terrainDone 把 clock.mode TerrainEdit → City 并 emit modeChanged；modalAnswer 按 MODAL_OWNER 转发 onModalAnswer。
 *  economy 的 cheat：资金类直接处理；带灾害副作用的码（如起火）只写 state.disaster.pending = DisasterKind.Fire，由 events 的状态机（thingsTick / requestDisaster 同一入口）启动。
 */
export const COMMAND_OWNER: Readonly<Record<Command['type'], SystemId>> = {
  setSpeed: 'core', setView: 'core', terrainDone: 'core', modalAnswer: 'core',
  terrainTool: 'terrain',
  placeBuilding: 'placement', zoneRect: 'placement', dezone: 'placement', bulldoze: 'placement', network: 'placement', tunnel: 'placement', neighborConnection: 'placement',
  sign: 'services', rename: 'services',
  setTax: 'economy', setIndustryTax: 'economy', setFunding: 'economy', setOrdinance: 'economy', issueBond: 'economy', repayBond: 'economy', setOption: 'economy', cheat: 'economy',
  requestDisaster: 'events', dispatch: 'events' };
/** 模态回答的归属：core 的 modalAnswer 处理者执行 systems[MODAL_OWNER[dialog]].onModalAnswer?.(ctx, dialog, answer)。bridgeType / neighborConnect 由 UI 重发命令（network+bridge / neighborConnection）而非 modalAnswer，列入只为覆盖全集；importAssets 纯 UI，core 忽略。 */
export const MODAL_OWNER: Readonly<Record<ModalId, SystemId>> = {
  budget: 'economy', scenarioBrief: 'economy', scenarioResult: 'economy', gameOver: 'economy',
  militaryOffer: 'services', rewardOffer: 'services',
  disasterAlert: 'events', newspaper: 'events', extraPaper: 'events',
  bridgeType: 'placement', teamPick: 'placement', neighborConnect: 'placement',
  importAssets: 'core' };
/** 无处理者（COMMAND_OWNER[type] 缺席 / 为桩 / 未实现该命令）时 host.dispatch 的固定返回值：不写 commandLog、不消费 PRNG、不 emit。UI 用 rejectKey('notImplemented') 文案。 */
export const NOT_IMPLEMENTED_RESULT: CommandResult = Object.freeze({ ok: false, cost: 0, reason: 'notImplemented', changed: Object.freeze([]) as readonly number[] });
export type ToolMode = 'Click' | 'Paint' | 'Line' | 'Rect' | 'Place' | 'Query' | 'Sign' | 'Center' | 'Help' | 'Dispatch';
