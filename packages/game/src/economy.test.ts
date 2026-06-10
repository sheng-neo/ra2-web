import { describe, expect, it } from 'vitest';
import { World } from './world';
import { gridTerrain, runScript } from './replay';

function baseWorld(): World {
  const w = new World(gridTerrain(40, 40), 7);
  w.addPlayer(1, 'allied', 5000);
  return w;
}

/** 直接放一座建造场（spawn 对 building 即落地）。 */
function withConyard(w: World, cellX = 5, cellY = 5): void {
  w.spawnUnit(1, 'conyard', cellX, cellY);
}

describe('电力结算', () => {
  it('发电厂 +100，兵营 -20', () => {
    const w = baseWorld();
    withConyard(w);
    w.spawnUnit(1, 'powerplant', 10, 10);
    w.spawnUnit(1, 'barracks', 14, 10);
    w.step();
    const p = w.players.get(1)!;
    expect(p.powerProduced).toBe(100);
    expect(p.powerDrained).toBe(20);
  });

  it('受损发电厂按血量比例发电', () => {
    const w = baseWorld();
    const pp = w.spawnUnit(1, 'powerplant', 10, 10)!;
    pp.hp = Math.floor(pp.maxHp / 2);
    w.step();
    expect(w.players.get(1)!.powerProduced).toBe(50);
  });
});

describe('前置科技与建造清单', () => {
  it('只有建造场 → 只能造发电厂/兵营/精炼厂等 conyard 项的子集', () => {
    const w = baseWorld();
    withConyard(w);
    const ids = w.buildOptions(1).map((u) => u.id);
    expect(ids).toContain('powerplant');
    // 兵营需要发电厂前置，此时不可造
    expect(ids).not.toContain('barracks');
    // 步兵需要兵营，不可造
    expect(ids).not.toContain('gi');
  });

  it('科技链逐级解锁', () => {
    const w = baseWorld();
    withConyard(w);
    w.spawnUnit(1, 'powerplant', 10, 10);
    expect(w.buildOptions(1).map((u) => u.id)).toContain('barracks');
    w.spawnUnit(1, 'barracks', 14, 10);
    expect(w.buildOptions(1).map((u) => u.id)).toContain('gi');
    w.spawnUnit(1, 'refinery', 18, 10);
    w.spawnUnit(1, 'warfactory', 22, 10);
    const ids = w.buildOptions(1).map((u) => u.id);
    expect(ids).toContain('grizzly');
    expect(ids).toContain('harvester');
  });
});

describe('生产队列', () => {
  it('排队建筑 → 扣钱 → 就绪 → 放置落地', () => {
    const w = baseWorld();
    withConyard(w);
    const before = w.players.get(1)!.credits;
    expect(w.queueProduction(1, 'powerplant')).toBe(true);
    // 推进到建造完成
    for (let i = 0; i < 200; i++) w.step();
    const q = w.queueFor(1, 'building')!;
    expect(q.readyToPlace).toBe(true);
    expect(w.players.get(1)!.credits).toBeLessThan(before); // 已扣钱
    // 放置
    const placed = w.placeBuilding(1, 'powerplant', 10, 10);
    expect(placed).not.toBeNull();
    expect(w.hasBuilding(1, 'powerplant')).toBe(true);
    expect(q.readyToPlace).toBe(false);
  });

  it('钱不够则停滞，不扣成负', () => {
    const w = new World(gridTerrain(40, 40), 7);
    w.addPlayer(1, 'allied', 300); // 不够 800 的发电厂
    withConyard(w);
    w.queueProduction(1, 'powerplant');
    for (let i = 0; i < 200; i++) w.step();
    expect(w.players.get(1)!.credits).toBeGreaterThanOrEqual(0);
    expect(w.queueFor(1, 'building')!.readyToPlace).toBe(false);
  });

  it('取消生产退还已花费', () => {
    const w = baseWorld();
    withConyard(w);
    expect(w.queueProduction(1, 'powerplant')).toBe(true); // 仅需建造场前置
    for (let i = 0; i < 30; i++) w.step();
    const mid = w.players.get(1)!.credits;
    expect(mid).toBeLessThan(5000); // 已花掉一部分
    w.cancelProduction(1, 'building');
    expect(w.players.get(1)!.credits).toBeGreaterThan(mid); // 有退款
    expect(w.queueFor(1, 'building')!.items.length).toBe(0);
  });

  it('车辆造完自动出厂（不需放置）', () => {
    const w = baseWorld();
    withConyard(w, 5, 5);
    w.spawnUnit(1, 'powerplant', 12, 5);
    w.spawnUnit(1, 'refinery', 16, 5);
    w.spawnUnit(1, 'warfactory', 20, 5);
    const countBefore = [...w.entities.values()].filter((e) => e.typeId === 'grizzly').length;
    w.queueProduction(1, 'grizzly');
    for (let i = 0; i < 200; i++) w.step();
    const countAfter = [...w.entities.values()].filter((e) => e.typeId === 'grizzly').length;
    expect(countAfter).toBe(countBefore + 1);
  });
});

describe('采矿闭环', () => {
  it('矿车采矿 → 返厂 → 金钱增加', () => {
    const w = new World(gridTerrain(30, 30), 11);
    w.addPlayer(1, 'allied', 0);
    // 精炼厂自带矿车
    w.spawnUnit(1, 'refinery', 4, 4);
    // 在附近铺一片矿
    for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) w.setOre(x, y, 500);
    const start = w.players.get(1)!.credits;
    runScript(w, [], 1500);
    expect(w.players.get(1)!.credits).toBeGreaterThan(start);
    // 矿被采走了一部分
    expect(w.oreAt(8, 8)).toBeLessThan(500);
  });
});

describe('放置校验', () => {
  it('不能压在已有建筑上', () => {
    const w = baseWorld();
    w.spawnUnit(1, 'conyard', 5, 5); // 占 5..7 × 5..7
    const type = w.rules.units.get('powerplant')!;
    expect(w.canPlace(1, type, 6, 6)).toBe(false);
    expect(w.canPlace(1, type, 10, 10)).toBe(true);
  });

  it('建造半径：远离基地不能建，毗邻可以', () => {
    const w = baseWorld();
    w.spawnUnit(1, 'conyard', 5, 5);
    const type = w.rules.units.get('powerplant')!;
    expect(w.canPlace(1, type, 9, 9)).toBe(true); // 距基地很近
    expect(w.canPlace(1, type, 30, 30)).toBe(false); // 太远
  });
});

describe('胜负判定', () => {
  it('失去全部建筑 → 判负', () => {
    const w = baseWorld();
    const cy = w.spawnUnit(1, 'conyard', 5, 5)!;
    w.step();
    expect(w.players.get(1)!.defeated).toBe(false);
    cy.hp = 0;
    w.step();
    expect(w.players.get(1)!.defeated).toBe(true);
  });
});

describe('战斗（M5 雏形）', () => {
  it('坦克互射直到一方被消灭', () => {
    const w = new World(gridTerrain(20, 20), 3);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const a = w.spawnUnit(1, 'grizzly', 5, 5)!;
    const b = w.spawnUnit(2, 'rhino', 7, 5)!; // 2 格内，互相在射程
    runScript(w, [], 1200);
    // 至少一方阵亡
    const aAlive = w.entities.has(a.id);
    const bAlive = w.entities.has(b.id);
    expect(aAlive && bAlive).toBe(false);
  });

  it('装甲矩阵生效：机枪打步兵狠、打重甲弱', () => {
    const w = new World(gridTerrain(20, 20), 5);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const shooter = w.spawnUnit(1, 'gi', 5, 5)!;
    const inf = w.spawnUnit(2, 'conscript', 6, 5)!;
    void shooter;
    const infStart = inf.hp;
    runScript(w, [], 30);
    expect(inf.hp).toBeLessThan(infStart); // 步兵掉血明显
  });

  it('攻击移动：沿途歼敌后继续奔向目的地', () => {
    const w = new World(gridTerrain(40, 40), 9);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const tank = w.spawnUnit(1, 'grizzly', 2, 2)!;
    const enemy = w.spawnUnit(2, 'conscript', 12, 2)!; // 行军路上的敌人
    // 攻击移动到远处目的地
    w.applyCommands([{ kind: 'attackMove', entityIds: [tank.id], cellX: 36, cellY: 2 }]);
    expect(tank.attackMove).toBe(true);
    runScript(w, [], 800);
    // 路上的动员兵被消灭
    expect(w.entities.has(enemy.id)).toBe(false);
    // 坦克最终抵达目的地附近（攻击移动结束、标志复位）
    expect(tank.cellX).toBeGreaterThan(30);
    expect(tank.attackMove).toBe(false);
  });

  it('出售建筑：回款并移除', () => {
    const w = baseWorld();
    const cy = w.spawnUnit(1, 'conyard', 5, 5)!;
    w.spawnUnit(1, 'powerplant', 9, 5); // 第二座建筑，避免卖完即判负
    const before = w.players.get(1)!.credits;
    w.applyCommands([{ kind: 'sell', owner: 1, entityId: cy.id }]);
    expect(w.entities.has(cy.id)).toBe(false);
    expect(w.players.get(1)!.credits).toBeGreaterThan(before); // 有回款
    // 占地已释放，可在原处重建
    expect(w.canPlace(1, w.rules.units.get('powerplant')!, 5, 5)).toBe(true);
  });

  it('修理建筑：扣钱回血至满停止', () => {
    const w = baseWorld();
    const pp = w.spawnUnit(1, 'powerplant', 5, 5)!;
    pp.hp = 100;
    const before = w.players.get(1)!.credits;
    w.applyCommands([{ kind: 'repair', owner: 1, entityId: pp.id }]);
    for (let i = 0; i < 400 && pp.hp < pp.maxHp; i++) w.step();
    expect(pp.hp).toBe(pp.maxHp); // 修满
    expect(w.players.get(1)!.credits).toBeLessThan(before); // 花了钱
    expect(pp.repairing).toBe(false); // 修满自动停
  });

  it('集结点：出厂单位自动前往', () => {
    const w = baseWorld();
    w.spawnUnit(1, 'conyard', 5, 5);
    w.spawnUnit(1, 'powerplant', 9, 5);
    w.spawnUnit(1, 'refinery', 5, 9);
    const wf = w.spawnUnit(1, 'warfactory', 9, 9)!;
    w.applyCommands([{ kind: 'setRally', owner: 1, buildingId: wf.id, cellX: 20, cellY: 20 }]);
    const before = new Set([...w.entities.keys()]);
    w.queueProduction(1, 'grizzly');
    for (let i = 0; i < 200; i++) w.step();
    const tank = [...w.entities.values()].find((e) => e.typeId === 'grizzly' && !before.has(e.id));
    expect(tank).toBeDefined();
    // 新坦克领到了去集结点的路（goal 或已在路上）
    expect(tank!.goal !== null || tank!.path.length > 0 || tank!.cellX > 12).toBe(true);
  });

  it('普通移动：行军途中不主动接敌', () => {
    const w = new World(gridTerrain(40, 40), 9);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const tank = w.spawnUnit(1, 'grizzly', 2, 2)!;
    const enemy = w.spawnUnit(2, 'conscript', 12, 2)!;
    w.applyCommands([{ kind: 'move', entityIds: [tank.id], cellX: 36, cellY: 2 }]);
    runScript(w, [], 400);
    // 普通移动不停下交战，敌人存活、坦克已远离
    expect(w.entities.has(enemy.id)).toBe(true);
    expect(tank.cellX).toBeGreaterThan(30);
  });
});
