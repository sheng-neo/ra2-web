// ===== sim/utilities/priv.test.ts =====（ARCHITECTURE §3.3 / §4.4 / §4.5：priv 只含不可重建部分、预算、快照与 .SC2 两条读档路径、年度更新）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { PRIV_BUDGET_BYTES } from '../../contracts/snapshot';
import type { PrivState } from '../../contracts/state';
import type { StubProfile } from '../../contracts/testkit';
import { privEncodedSize } from '../../io/snapshot';
import { createTestContext, runDays } from '../../testkit';
import { fakePlacementSystem, line, paintWater, place } from './fixtures';
import { createUtilitiesSystem } from './index';
import { PRIV_VERSION, freshPriv, writePlants } from './priv';
import type { UtilitiesPriv } from './priv';

const PROFILES = ['optimistic', 'pessimistic'] as const;
const HOUSE = 0x70, COAL = 0xcf, WIND = 0xc8, PUMP = 0xdc, TOWER = 0xeb;
const mk = (profile: StubProfile = 'realistic', seed = 12345, flat = true) => createTestContext({ profile, seed, flat, systems: [createUtilitiesSystem(), fakePlacementSystem()] });
const privOf = (state: ReturnType<typeof mk>['state']): UtilitiesPriv => state.priv.utilities as UtilitiesPriv;
const utilitiesOf = (host: ReturnType<typeof mk>['host']) => host.systems.find((s) => s.id === 'utilities')!;
/** 煤电 + 电线 + 房子 + 水泵（4 格淡水，湿度 / 水位 0 → 产量 40）+ 水塔，电水都已扫过（age 21）。flat=false 用于 .SC2 往返（桩地形不恢复海拔层）。 */
function town(profile: StubProfile, seed?: number, flat = true) {
  const t = mk(profile, seed, flat);
  place(t.host, COAL, 10, 10); line(t.host, 'power', 14, 10, 20, 10); line(t.host, 'power', 20, 11, 20, 19);
  place(t.host, PUMP, 20, 20); place(t.host, TOWER, 21, 20); place(t.host, HOUSE, 23, 20); place(t.host, HOUSE, 21, 10);
  paintWater(t.state, 19, 19); paintWater(t.state, 19, 21); paintWater(t.state, 21, 19); paintWater(t.state, 20, 19);
  runDays(t.host, 21);
  return t;
}

describe('priv 形状与预算', () => {
  it('priv 只含 v / 两个脏标志 / 电厂三列（锚点、年龄、负载）；满表 1024 座仍在 PRIV_BUDGET_BYTES.utilities 内', () => {
    const t = town('realistic');
    const p = privOf(t.state);
    expect(Object.keys(p).sort()).toEqual(['dirtyPower', 'dirtyWater', 'plantAges', 'plantAnchors', 'plantLoads', 'v']);
    expect(p.v).toBe(PRIV_VERSION); expect(Array.from(p.plantAnchors)).toEqual([tileIndex(10, 10)]); expect(Array.from(p.plantAges)).toEqual([0]);
    expect(privEncodedSize(p, 'utilities')).toBeLessThan(256);
    const full = freshPriv();
    writePlants(full, Array.from({ length: 1024 }, (_, k) => ({ anchor: k * 16, age: 50, load: 99 })));
    expect(privEncodedSize(full, 'utilities')).toBeLessThanOrEqual(PRIV_BUDGET_BYTES.utilities);
  });
  it('风车不进表（永不到期）；拆除煤电后记录移除', () => {
    const t = mk();
    place(t.host, WIND, 3, 3); place(t.host, COAL, 10, 10);
    expect(Array.from(privOf(t.state).plantAnchors)).toEqual([tileIndex(10, 10)]);
    t.host.dispatch({ type: 'bulldoze', tiles: [tileIndex(11, 11)] });
    expect(privOf(t.state).plantAnchors).toHaveLength(0);
  });
  it('快照往返：年龄保留，postLoad("snapshot") 不重扫、不消费 PRNG、不改层，续跑哈希与不中断一致', () => {
    const a = town('realistic', 5);
    place(a.host, WIND, 40, 40); runDays(a.host, 1);
    privOf(a.state).plantAges[0] = 7; privOf(a.state).plantLoads[0] = 42;
    const bytes = a.host.saveSnapshot();
    const b = mk('realistic', 9); runDays(b.host, 3);
    expect(b.host.loadSnapshot(bytes)).toEqual([]);
    expect(b.ctx.prng.state()).toBe(a.ctx.prng.state());
    expect(Array.from(b.state.layers.xbit)).toEqual(Array.from(a.state.layers.xbit));
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
    expect(b.ctx.q.utilities.plantAt(tileIndex(10, 10))).toMatchObject({ ageYears: 7, loadPct: 42 });
    runDays(a.host, 40); runDays(b.host, 40);                                // 含第 1 天电扫描（风车消费 PRNG）与第 20 天水扫描
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
  });
  it('脏标志进 priv：命令之后、日末之前保存的快照载入后仍会在日末重扫', () => {
    const a = town('realistic');
    a.host.dispatch({ type: 'bulldoze', tiles: [tileIndex(17, 10)] });
    expect(privOf(a.state).dirtyPower).toBe(true);
    const b = mk(); expect(b.host.loadSnapshot(a.host.saveSnapshot())).toEqual([]);
    expect(privOf(b.state).dirtyPower).toBe(true);
    runDays(a.host, 1); runDays(b.host, 1);
    expect((b.state.layers.xbit[tileIndex(21, 10)]! & XBit.Powered) !== 0).toBe(false);
    expect(b.host.hash('full')).toBe(a.host.hash('full'));
  });
  it('v=0 旧 priv：postLoad 不抛错，丢弃并从 XBLD 重建（年龄归 0），记 diag', () => {
    const t = town('realistic');
    privOf(t.state).plantAges[0] = 30;
    t.state.priv.utilities = { v: 0, junk: 'x' } as PrivState;
    expect(() => utilitiesOf(t.host).postLoad!(t.ctx, 'snapshot')).not.toThrow();
    const p = privOf(t.state);
    expect(p.v).toBe(PRIV_VERSION); expect(Array.from(p.plantAnchors)).toEqual([tileIndex(10, 10)]); expect(p.plantAges[0]).toBe(0);
    expect(t.ctx.diag.some((d) => d.code === 'utilities.privRebuilt')).toBe(true);
  });
});

describe.each(PROFILES)('.SC2 路径（%s 桩）', (profile) => {
  it('T8 往返：扫描 → exportSc2 → importSc2 → XBIT 逐字节相等、MARK 全 0、报告重算一致、hash("sc2") 相同、postLoad 不消费 PRNG', () => {
    const a = town(profile, undefined, false);
    a.state.layers.xbit[5] = a.state.layers.xbit[5]! | XBit.Mark;            // 模拟泄漏进存档的脏位
    const expected = a.state.layers.xbit.slice(); expected[5] = expected[5]! & ~XBit.Mark;
    const doc = a.host.exportSc2();
    expect(doc.xbit.some((v) => (v & XBit.Mark) !== 0)).toBe(false);
    a.state.layers.xbit[5] = a.state.layers.xbit[5]! & ~XBit.Mark;
    const hashSc2 = a.host.hash('sc2');
    const b = mk(profile, 77, false); runDays(b.host, 9);
    const diag = b.host.importSc2(doc);
    expect(diag.some((d) => d.level === 'error')).toBe(false);
    expect(diag.some((d) => d.code === 'utilities.plantsImported')).toBe(true);
    expect(Array.from(b.state.layers.xbit)).toEqual(Array.from(expected));
    expect(b.state.utilities.power).toEqual(a.state.utilities.power); expect(b.state.utilities.water).toEqual(a.state.utilities.water);
    expect(b.state.utilities.power.generation).toBe(704); expect(b.state.utilities.water.supply).toBe(40);
    expect(b.ctx.prng.state()).toBe(a.ctx.prng.state());
    expect(b.host.hash('sc2')).toBe(hashSc2);
    expect(Array.from(privOf(b.state).plantAnchors)).toEqual([tileIndex(10, 10)]);
    expect(privOf(b.state).dirtyPower).toBe(false); expect(privOf(b.state).dirtyWater).toBe(false);
  });
  it('年龄经 XMIC 往返：XTXT 标签 → 记录 tileId 匹配时 exportTo 写 +1 / +4..5、importFrom 读回；无链接归 0', () => {
    const a = town(profile);
    const anchor = tileIndex(10, 10);
    privOf(a.state).plantAges[0] = 7; privOf(a.state).plantLoads[0] = 300 & 0xff;
    a.state.layers.xtxt[anchor] = 0x3d; a.state.layers.xmic[10 * 8] = COAL;  // 记录 10（0x3D − 0x33）
    const doc = a.host.exportSc2();
    expect(doc.xmic[81]).toBe(7); expect((doc.xmic[84]! << 8) | doc.xmic[85]!).toBe(300 & 0xff);
    const b = mk(profile); b.host.importSc2(doc);
    expect(b.ctx.q.utilities.plantAt(tileIndex(13, 13))).toMatchObject({ kind: 'coal', anchor, ageYears: 7, loadPct: 300 & 0xff });
    doc.xmic[80] = 0xca;                                                      // tileId 不匹配 → 不信任该记录
    const c = mk(profile); c.host.importSc2(doc);
    expect(c.ctx.q.utilities.plantAt(anchor)!.ageYears).toBe(0);
  });
  it('postLoad("sc2") 按规则重算 POWERABLE / PIPED：存档中错置的位被修正', () => {
    const a = town(profile);
    const doc = a.host.exportSc2();
    doc.xbit[tileIndex(21, 10)] = doc.xbit[tileIndex(21, 10)]! & ~XBit.Powerable;   // 房子被错标为不可导电
    doc.xbit[tileIndex(60, 60)] = doc.xbit[tileIndex(60, 60)]! | XBit.Piped;         // 空地被错标为可导水
    const b = mk(profile); b.host.importSc2(doc);
    expect(b.state.layers.xbit[tileIndex(21, 10)]! & XBit.Powerable).toBe(XBit.Powerable);
    expect(b.state.layers.xbit[tileIndex(21, 10)]! & XBit.Powered).toBe(XBit.Powered);
    expect(b.state.layers.xbit[tileIndex(60, 60)]! & XBit.Piped).toBe(0);
  });
});

describe.each(PROFILES)('年度更新 utilitiesAnnual（%s 桩）', (profile) => {
  it('建城当天不计年；1 月年龄 +1 并写负载；> 48 提醒；> 50 到期：禁灾 + 付得起 → 自动重建扣费，否则爆炸移出表并置脏', () => {
    const t = mk(profile);
    place(t.host, COAL, 10, 10); place(t.host, HOUSE, 14, 10);
    runDays(t.host, 2);
    expect(privOf(t.state).plantAges[0]).toBe(0);                            // age 0 的 utilitiesAnnual 不老化
    privOf(t.state).plantAges[0] = 50;
    t.state.disaster.noDisasters = true; t.state.economy.funds = 10000;
    const prng = t.ctx.prng.state();
    runDays(t.host, 299);                                                    // → age 301：跑过第二年 1 月第 0 天
    const ev = t.host.drainEvents();
    const anchor = tileIndex(10, 10);
    expect(ev.filter((e) => e.type === 'plantAging')).toEqual([{ type: 'plantAging', anchor }]);
    expect(t.ctx.prng.state()).not.toBe(prng);
    if (profile === 'optimistic') {
      expect(ev.filter((e) => e.type === 'plantAutoRebuilt')).toEqual([{ type: 'plantAutoRebuilt', anchor, cost: 4000 }]);
      expect(t.state.economy.funds).toBe(6000);
      expect(privOf(t.state).plantAges[0]).toBe(0); expect(t.state.layers.xbld[anchor]).toBe(COAL);
      expect(t.state.utilities.power.generation).toBe(704);
    } else {
      expect(ev.filter((e) => e.type === 'plantExpired')).toEqual([{ type: 'plantExpired', anchor }]);
      expect(t.state.economy.funds).toBe(10000);
      expect(t.state.layers.xbld[anchor]).toBeGreaterThanOrEqual(0x01); expect(t.state.layers.xbld[anchor]).toBeLessThanOrEqual(0x04);
      expect(privOf(t.state).plantAnchors).toHaveLength(0);
      expect(t.state.utilities.power.generation).toBe(0);
      expect((t.state.layers.xbit[tileIndex(14, 10)]! & XBit.Powered) !== 0).toBe(false);
    }
  });
  it('plantAt 在年度更新后显示年龄与负载抖动值（usagePct + 0..7）', () => {
    const t = mk(profile);
    place(t.host, COAL, 10, 10);
    runDays(t.host, 301);
    const info = t.ctx.q.utilities.plantAt(tileIndex(10, 10))!;
    expect(info.ageYears).toBe(1);
    expect(info.loadPct).toBeGreaterThanOrEqual(0); expect(info.loadPct).toBeLessThanOrEqual(7);
    expect(t.host.drainEvents().some((e) => e.type === 'plantAging' || e.type === 'plantExpired')).toBe(false);
  });
});
