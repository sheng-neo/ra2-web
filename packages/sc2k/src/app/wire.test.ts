// ===== app/wire.test.ts =====（WORKPLAN §1.1 第 11 条：唯一的 WP0 冒烟）
// 桩装配的 SimHost：新城 → 25 天 → 哈希确定性 → 快照往返 → 桩命令 notImplemented 且日志为空 → 各目录 index.ts 的类型层对账。
import { describe, expect, it } from 'vitest';
import { NOT_IMPLEMENTED_RESULT } from '../contracts/commands';
import { SYSTEM_ORDER } from '../contracts/clock';
import type { ArtEntry, AudioEntry, DataEntry, Sc2Entry, SimCoreEntry, SimEntries, SnapshotEntry } from '../contracts/entrypoints';
import type { AssetsEntry, RenderEntry, UiEntry } from '../contracts/shell';
import type { NewCityParams } from '../contracts/system';
import type { TestkitEntry } from '../contracts/testkit';
import { runDays } from '../testkit';
import { WIRE_STUB_ALLOWLIST, createWiredHost } from './wire';
import { V1_TOOL_COUNT, V1_TOOL_IDS } from './v1Tools';

import * as simCore from '../sim/core';
import * as terrain from '../sim/terrain';
import * as placement from '../sim/placement';
import * as utilities from '../sim/utilities';
import * as zones from '../sim/zones';
import * as transport from '../sim/transport';
import * as services from '../sim/services';
import * as economy from '../sim/economy';
import * as events from '../sim/events';
import * as art from '../art';
import * as render from '../render';
import * as ui from '../ui';
import * as audio from '../audio';
import * as sc2 from '../io/sc2';
import * as snapshot from '../io/snapshot';
import * as assets from '../io/assets';
import * as data from '../data';
import * as testkit from '../testkit';

const PARAMS: NewCityParams = { name: 'Smoketown', mayor: 'Nobody', difficulty: 1, startYear: 2000, seed: 2024, terrainSeed: 11, terrain: { coast: false, river: false, hills: 12, water: 5, trees: 15 } };

describe('WP0 冒烟：桩装配的 SimHost', () => {
  it('createWiredHost：9 个系统按 SYSTEM_ORDER；仍为桩的系统都在 allowlist 内（真系统逐个合入后不再是桩）', () => {
    const host = createWiredHost();
    expect(host.systems.map((s) => s.id)).toEqual(SYSTEM_ORDER);
    for (const s of host.systems) if (s.id !== 'core') { if (s.stub) expect(WIRE_STUB_ALLOWLIST).toContain(s.id); else expect(WIRE_STUB_ALLOWLIST).not.toContain(s.id); }
    expect(host.catalogue).toBe(data.CATALOGUE);
    expect(host.catalogue.BUILDINGS).toHaveLength(256);
  });
  it('newCity → runDays(25) → hash("full") 两次相同（同一 host 两次调用 + 两个独立 host）', () => {
    const a = createWiredHost(), b = createWiredHost();
    a.newCity(PARAMS); b.newCity(PARAMS);
    runDays(a, 25); runDays(b, 25);
    expect(a.state.clock.age).toBe(25);
    expect(a.hash('full')).toBe(a.hash('full'));
    expect(a.hash('full')).toBe(b.hash('full'));
    expect(a.hash('sc2')).toBe(b.hash('sc2'));
    const c = createWiredHost(); c.newCity({ ...PARAMS, seed: 1 }); runDays(c, 25);
    expect(c.hash('full')).not.toBe(a.hash('full'));                              // 种子进 prngState → 进哈希
  });
  it('saveSnapshot / loadSnapshot 往返哈希不变（两档），载入后继续推进与不中断一致', () => {
    const a = createWiredHost(); a.newCity(PARAMS); runDays(a, 25);
    const bytes = a.saveSnapshot();
    expect(bytes.length).toBeGreaterThan(100000);
    const b = createWiredHost(); b.newCity({ ...PARAMS, name: 'Elsewhere', seed: 7 }); runDays(b, 3);
    expect(b.loadSnapshot(bytes)).toEqual([]);
    expect(b.hash('full')).toBe(a.hash('full')); expect(b.hash('sc2')).toBe(a.hash('sc2'));
    expect(b.state.cityName).toBe('Smoketown'); expect(b.state.clock.age).toBe(25);
    runDays(a, 25); runDays(b, 25);
    expect(b.hash('full')).toBe(a.hash('full'));
    expect(b.commandLog()).toEqual([]);
  });
  it('对桩系统 dispatch placeBuilding → reason notImplemented、NOT_IMPLEMENTED_RESULT 同一对象、commandLog 为空、不消费 PRNG', () => {
    const host = createWiredHost(); host.newCity(PARAMS); runDays(host, 25);
    const prng = host.state.clock.prngState;
    const r = host.dispatch({ type: 'placeBuilding', id: 0xdd, x: 10, y: 10 });
    expect(r.reason).toBe('notImplemented'); expect(r.ok).toBe(false); expect(r).toBe(NOT_IMPLEMENTED_RESULT);
    expect(host.dispatch({ type: 'zoneRect', zone: 1, x0: 0, y0: 0, x1: 3, y1: 3 }).reason).toBe('notImplemented');
    expect(host.dispatch({ type: 'requestDisaster', kind: 1 }).reason).toBe('notImplemented');
    expect(host.commandLog()).toEqual([]);
    expect(host.state.clock.prngState).toBe(prng);
    expect(host.drainEvents().filter((e) => e.type === 'message')).toEqual([]);
  });
  it('core 命令可用：setSpeed 写 clock.speed 并入日志；terrainDone 进入城市模式', () => {
    const host = createWiredHost(); host.newCity(PARAMS);
    expect(host.dispatch({ type: 'setSpeed', speed: 3 }).ok).toBe(true);
    expect(host.state.clock.speed).toBe(3);
    expect(host.dispatch({ type: 'terrainDone' }).ok).toBe(true);
    expect(host.state.clock.mode).toBe(1);
    expect(host.commandLog().map((l) => l.cmd.type)).toEqual(['setSpeed', 'terrainDone']);
  });
  it('V1_TOOL_IDS ⊆ CATALOGUE.TOOLS 的 id 集合，规模 = V1_TOOL_COUNT（ARCHITECTURE §7.6）', () => {
    expect(V1_TOOL_IDS.size).toBe(V1_TOOL_COUNT);
    const all = new Set(data.CATALOGUE.TOOLS.map((t) => t.id));
    for (const id of V1_TOOL_IDS) expect(all.has(id), id).toBe(true);
    for (const id of V1_TOOL_IDS) expect(data.CATALOGUE.toolById(id)?.id).toBe(id);
    expect(data.CATALOGUE.TOOLS.length).toBeGreaterThanOrEqual(V1_TOOL_COUNT);
  });
  it('各目录 index.ts 与 contracts/entrypoints.ts / shell.ts / testkit.ts 对账（类型层）', () => {
    simCore satisfies SimCoreEntry;
    ({ ...terrain, ...placement, ...utilities, ...zones, ...transport, ...services, ...economy, ...events }) satisfies SimEntries;
    art satisfies ArtEntry;
    render satisfies RenderEntry;
    ui satisfies UiEntry;
    audio satisfies AudioEntry;
    sc2 satisfies Sc2Entry;
    snapshot satisfies SnapshotEntry;
    assets satisfies AssetsEntry;
    data satisfies DataEntry;
    testkit satisfies TestkitEntry;
    expect(typeof simCore.createSim).toBe('function');
    expect(typeof sc2.sc2Codec.newDocument).toBe('function');
    const s = createWiredHost().state;
    expect(testkit.hashOf(s)).toBe(snapshot.snapshotCodec.hash(s, 'full'));          // testkit 与 wire 同一注入的编解码器
  });
});
