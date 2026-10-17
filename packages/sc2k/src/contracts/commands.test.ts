import { describe, expect, it } from 'vitest';
import type { Command, ModalId, RejectReason } from './commands';
import { COMMAND_OWNER, MODAL_OWNER, NOT_IMPLEMENTED_RESULT } from './commands';
import type { Actions } from './actions';
import { ACTION_OWNER } from './actions';
import { END_OF_DAY_IO, PHASE_OWNER, SYSTEM_ORDER } from './clock';
import { REJECT_KEY_PREFIX, rejectKey } from './strings';

// ---- 编译期对账：下面三个对象字面量必须恰好列出各自联合类型的全集（少一个 → 缺属性错误；多一个 → 多余属性错误）。----
const ALL_COMMAND_TYPES: Record<Command['type'], true> = {
  placeBuilding: true, zoneRect: true, dezone: true, bulldoze: true, terrainTool: true, network: true, tunnel: true, neighborConnection: true,
  setTax: true, setIndustryTax: true, setFunding: true, setOrdinance: true, issueBond: true, repayBond: true, setSpeed: true, setOption: true,
  requestDisaster: true, dispatch: true, sign: true, rename: true, cheat: true, terrainDone: true, setView: true, modalAnswer: true };
const ALL_MODAL_IDS: Record<ModalId, true> = {
  budget: true, militaryOffer: true, disasterAlert: true, scenarioBrief: true, scenarioResult: true, gameOver: true, newspaper: true, extraPaper: true, rewardOffer: true,
  bridgeType: true, teamPick: true, neighborConnect: true, importAssets: true };
const ALL_ACTION_KEYS: Record<keyof Actions, true> = {
  setXbld: true, setXzon: true, setXund: true, setXbit: true, setTerrain: true, layerChanged: true, emit: true,
  charge: true, destroyStructure: true, news: true, addTraffic: true, allocMicrosim: true, freeMicrosim: true, requestRescan: true, markAccessDirty: true };
const ALL_REJECT_REASONS: Record<RejectReason, true> = {
  funds: true, occupied: true, slope: true, water: true, needWaterfall: true, outOfBounds: true, zoned: true, notInvented: true, locked: true, alreadyBuilt: true,
  ordinance: true, adjacency: true, nimby: true, microsimFull: true, waterCells: true, terrain: true, obstructed: true, mode: true, limit: true, noTarget: true,
  needsBridge: true, tooHigh: true, tooLow: true, tooLong: true, notImplemented: true, cancelled: true };

const SYSTEM_IDS: ReadonlySet<string> = new Set(SYSTEM_ORDER);
const sortedKeys = (o: object): string[] => Object.keys(o).sort();
const ownedBy = (table: Readonly<Record<string, string>>, owner: string): string[] => Object.entries(table).filter(([, v]) => v === owner).map(([k]) => k).sort();

describe('commands: COMMAND_OWNER', () => {
  it('键集合 == Command[\'type\'] 全集（运行期 24 键，与编译期 Record 对账一致）', () => {
    expect(sortedKeys(COMMAND_OWNER)).toEqual(sortedKeys(ALL_COMMAND_TYPES));
    expect(Object.keys(COMMAND_OWNER)).toHaveLength(24);
  });
  it('每个值都是合法 SystemId', () => {
    for (const [type, owner] of Object.entries(COMMAND_OWNER)) expect(SYSTEM_IDS.has(owner), `${type} → ${owner}`).toBe(true);
  });
  it('core 恰好拥有 setSpeed / setView / terrainDone / modalAnswer；terrain 只有 terrainTool', () => {
    expect(ownedBy(COMMAND_OWNER, 'core')).toEqual(['modalAnswer', 'setSpeed', 'setView', 'terrainDone']);
    expect(ownedBy(COMMAND_OWNER, 'terrain')).toEqual(['terrainTool']);
    expect(ownedBy(COMMAND_OWNER, 'placement')).toEqual(['bulldoze', 'dezone', 'neighborConnection', 'network', 'placeBuilding', 'tunnel', 'zoneRect']);
    expect(ownedBy(COMMAND_OWNER, 'events')).toEqual(['dispatch', 'requestDisaster']);
    expect(ownedBy(COMMAND_OWNER, 'services')).toEqual(['rename', 'sign']);
    expect(ownedBy(COMMAND_OWNER, 'economy')).toHaveLength(8);
    // 没有命令的系统：utilities / zones / transport（它们只经阶段与 Actions 写状态）
    for (const id of ['utilities', 'zones', 'transport']) expect(ownedBy(COMMAND_OWNER, id)).toEqual([]);
  });
});

describe('commands: MODAL_OWNER', () => {
  it('覆盖全部 ModalId（13 个）且值为合法 SystemId', () => {
    expect(sortedKeys(MODAL_OWNER)).toEqual(sortedKeys(ALL_MODAL_IDS));
    expect(Object.keys(MODAL_OWNER)).toHaveLength(13);
    for (const [id, owner] of Object.entries(MODAL_OWNER)) expect(SYSTEM_IDS.has(owner), `${id} → ${owner}`).toBe(true);
  });
  it('命令结果型模态归 placement，纯 UI 模态 importAssets 归 core', () => {
    expect(ownedBy(MODAL_OWNER, 'placement')).toEqual(['bridgeType', 'neighborConnect', 'teamPick']);
    expect(MODAL_OWNER.importAssets).toBe('core');
  });
});

describe('actions: ACTION_OWNER', () => {
  it('键集合 == keyof Actions（15 键）且值为合法 SystemId', () => {
    expect(sortedKeys(ACTION_OWNER)).toEqual(sortedKeys(ALL_ACTION_KEYS));
    expect(Object.keys(ACTION_OWNER)).toHaveLength(15);
    for (const [k, owner] of Object.entries(ACTION_OWNER)) expect(SYSTEM_IDS.has(owner), `${k} → ${owner}`).toBe(true);
  });
  it('TileWriter 族（set* / layerChanged / emit）全部归 core', () => {
    expect(ownedBy(ACTION_OWNER, 'core')).toEqual(['emit', 'layerChanged', 'setXbit', 'setXbld', 'setXund', 'setXzon', 'setTerrain'].sort());
  });
});

describe('clock: END_OF_DAY_IO / PHASE_OWNER 的 SystemId 约束', () => {
  it('END_OF_DAY_IO 键 ⊆ SystemId，且恰为 utilities 与 zones', () => {
    for (const k of Object.keys(END_OF_DAY_IO)) expect(SYSTEM_IDS.has(k), k).toBe(true);
    expect(sortedKeys(END_OF_DAY_IO)).toEqual(['utilities', 'zones']);
  });
  it('PHASE_OWNER 的值全部是合法 SystemId', () => {
    for (const [phase, owner] of Object.entries(PHASE_OWNER)) expect(SYSTEM_IDS.has(owner), `${phase} → ${owner}`).toBe(true);
  });
});

describe('commands: NOT_IMPLEMENTED_RESULT', () => {
  it('固定形状：ok=false、cost=0、reason=notImplemented、changed 为空，且不可变', () => {
    expect(NOT_IMPLEMENTED_RESULT).toEqual({ ok: false, cost: 0, reason: 'notImplemented', changed: [] });
    expect(Object.isFrozen(NOT_IMPLEMENTED_RESULT)).toBe(true);
    expect(Object.isFrozen(NOT_IMPLEMENTED_RESULT.changed)).toBe(true);
    expect(NOT_IMPLEMENTED_RESULT.modal).toBeUndefined();
  });
});

describe('strings: rejectKey', () => {
  it('rejectKey(reason) === \'reject.\' + reason，26 个原因两两不同', () => {
    const reasons = Object.keys(ALL_REJECT_REASONS) as RejectReason[];
    expect(reasons).toHaveLength(26);
    expect(rejectKey('funds')).toBe('reject.funds');
    expect(rejectKey('notImplemented')).toBe(`${REJECT_KEY_PREFIX}notImplemented`);
    const keys = reasons.map(rejectKey);
    expect(new Set(keys).size).toBe(reasons.length);
    for (const k of keys) expect(k.startsWith('reject.')).toBe(true);
  });
});
