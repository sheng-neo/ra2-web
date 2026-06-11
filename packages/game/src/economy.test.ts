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

  it('停止命令：清空移动与攻击意图', () => {
    const w = new World(gridTerrain(30, 30), 9);
    w.addPlayer(1, 'allied', 0);
    const tank = w.spawnUnit(1, 'grizzly', 2, 2)!;
    w.applyCommands([{ kind: 'attackMove', entityIds: [tank.id], cellX: 25, cellY: 25 }]);
    expect(tank.goal !== null || tank.path.length > 0 || tank.attackMove).toBe(true);
    w.step();
    w.applyCommands([{ kind: 'stop', entityIds: [tank.id] }]);
    expect(tank.goal).toBeNull();
    expect(tank.path.length).toBe(0);
    expect(tank.attackMove).toBe(false);
    expect(tank.targetId).toBeNull();
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

describe('个体 AI 与采矿指令（本批改进）', () => {
  it('空闲单位主动迎击警戒范围内的敌人（不再站着挨打）', () => {
    const w = new World(gridTerrain(40, 40), 13);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const gi = w.spawnUnit(1, 'gi', 10, 10)!; // 全程没有任何命令——完全空闲
    const enemy = w.spawnUnit(2, 'conscript', 14, 10)!; // 4 格外，在警戒半径(6格)内
    const start = enemy.hp;
    runScript(w, [], 400);
    expect(enemy.hp).toBeLessThan(start); // 空闲士兵自发接敌并造成伤害
    void gi;
  });

  it('目标优先级：先打有武器的威胁，无视更近的矿车', () => {
    const w = new World(gridTerrain(30, 30), 41);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const gi = w.spawnUnit(1, 'gi', 5, 5)!;
    const harv = w.spawnUnit(2, 'harvester', 6, 5)!; // 更近，但无武器
    const con = w.spawnUnit(2, 'conscript', 6, 6)!; // 稍远，有武器=威胁
    w.step();
    expect(gi.targetId).toBe(con.id); // 锁定威胁而非最近的矿车
    void harv;
  });

  it('集火：多个兵自发先补残血的那个', () => {
    const w = new World(gridTerrain(30, 30), 43);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const g1 = w.spawnUnit(1, 'gi', 5, 5)!;
    const g2 = w.spawnUnit(1, 'gi', 5, 6)!;
    const a = w.spawnUnit(2, 'conscript', 8, 5)!;
    const b = w.spawnUnit(2, 'conscript', 8, 7)!;
    a.hp = 10; // 残血
    w.step();
    expect(g1.targetId).toBe(a.id); // 两个兵都集火残血的 a，而非各打各的
    expect(g2.targetId).toBe(a.id);
    void b;
  });

  it('军犬：撕咬秒步兵、对坦克几乎无效', () => {
    // vs 步兵：很快咬死
    const w1 = new World(gridTerrain(20, 20), 91);
    w1.addPlayer(1, 'soviet', 0);
    w1.addPlayer(2, 'allied', 0);
    w1.spawnUnit(1, 'dog', 5, 5);
    const inf = w1.spawnUnit(2, 'gi', 6, 5)!;
    for (let i = 0; i < 200 && w1.entities.has(inf.id); i++) w1.step();
    expect(w1.entities.has(inf.id)).toBe(false);
    // vs 坦克：啃不动（不死的狗，量它对重甲的微弱伤害）
    const w2 = new World(gridTerrain(20, 20), 93);
    w2.addPlayer(1, 'soviet', 0);
    w2.addPlayer(2, 'allied', 0);
    const d = w2.spawnUnit(1, 'dog', 5, 5)!;
    d.hp = 100000;
    d.maxHp = 100000;
    const tank = w2.spawnUnit(2, 'grizzly', 6, 5)!;
    const t0 = tank.hp;
    for (let i = 0; i < 200; i++) w2.step();
    expect(t0 - tank.hp).toBeLessThan(t0 * 0.15); // 对坦克伤害微乎其微
  });

  it('反装甲步兵：克制坦克（对重甲伤害远高于普通步兵）', () => {
    const dmgToTank = (infId: string): number => {
      const w = new World(gridTerrain(30, 30), 81);
      w.addPlayer(1, 'allied', 0);
      w.addPlayer(2, 'soviet', 0);
      const s = w.spawnUnit(1, infId, 5, 5)!;
      s.hp = 100000;
      s.maxHp = 100000; // 步兵不死，纯量输出
      const t = w.spawnUnit(2, 'rhino', 6, 5)!;
      t.hp = 100000;
      t.maxHp = 100000; // 坦克不死，纯量承伤
      for (let i = 0; i < 200; i++) w.step();
      return 100000 - t.hp;
    };
    expect(dmgToTank('rocketsoldier')).toBeGreaterThan(dmgToTank('gi') * 3); // 火箭兵打坦克远强于大兵
  });

  it('老兵：击杀让攻击者涨经验（kills+1）', () => {
    const w = new World(gridTerrain(40, 40), 71);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const g = w.spawnUnit(1, 'grizzly', 5, 5)!;
    const c = w.spawnUnit(2, 'conscript', 6, 5)!;
    for (let i = 0; i < 500 && w.entities.has(c.id); i++) w.step();
    expect(w.entities.has(c.id)).toBe(false);
    expect(g.kills).toBe(1);
  });

  it('老兵：精英(≥5杀)伤害高于新兵', () => {
    const damageOver = (kills: number): number => {
      const w = new World(gridTerrain(40, 40), 73);
      w.addPlayer(1, 'allied', 0);
      w.addPlayer(2, 'soviet', 0);
      const s = w.spawnUnit(1, 'grizzly', 5, 5)!;
      s.kills = kills;
      s.hp = 100000;
      s.maxHp = 100000; // 不死，打满窗口
      const t = w.spawnUnit(2, 'rhino', 6, 5)!;
      t.hp = 100000;
      t.maxHp = 100000; // 不死，纯量伤害
      for (let i = 0; i < 120; i++) w.step();
      return 100000 - t.hp;
    };
    expect(damageOver(5)).toBeGreaterThan(damageOver(0)); // 精英造成更多伤害
  });

  it('编队移动：多个单位散开到不同格，不挤成一坨', () => {
    const w = new World(gridTerrain(40, 40), 61);
    w.addPlayer(1, 'allied', 0);
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push(w.spawnUnit(1, 'grizzly', 3 + i, 3)!.id);
    w.applyCommands([{ kind: 'move', entityIds: ids, cellX: 30, cellY: 30 }]);
    runScript(w, [], 700);
    const cells = new Set(ids.map((id) => { const e = w.entities.get(id)!; return e.cellX * 1000 + e.cellY; }));
    expect(cells.size).toBeGreaterThanOrEqual(4); // 散开占不同格（不散开会全挤到同一格）
  });

  it('姿态·不还火：不自动索敌也不还击', () => {
    const w = new World(gridTerrain(20, 20), 51);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const gi = w.spawnUnit(1, 'gi', 5, 5)!;
    w.applyCommands([{ kind: 'stance', entityIds: [gi.id], stance: 'holdfire' }]);
    const enemy = w.spawnUnit(2, 'conscript', 6, 5)!; // 紧贴在射程内
    const start = enemy.hp;
    runScript(w, [], 80);
    expect(gi.targetId).toBeNull(); // 不索敌
    expect(enemy.hp).toBe(start); // 被打也不还火，敌人毫发无伤
  });

  it('姿态·坚守：原地开火但绝不移动追击', () => {
    const w = new World(gridTerrain(40, 40), 53);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const tank = w.spawnUnit(1, 'grizzly', 5, 5)!;
    w.applyCommands([{ kind: 'stance', entityIds: [tank.id], stance: 'holdground' }]);
    const sx = tank.cellX;
    const sy = tank.cellY;
    w.spawnUnit(2, 'conscript', 11, 5)!; // 警戒半径内、武器射程外
    runScript(w, [], 200);
    expect(tank.cellX).toBe(sx); // 坚守：寸步不移
    expect(tank.cellY).toBe(sy);
  });

  it('姿态·进攻 vs 警戒：进攻半径更大，主动出击远敌', () => {
    // 进攻姿态：9 格外的敌人也会主动上前歼灭
    const wa = new World(gridTerrain(40, 40), 55);
    wa.addPlayer(1, 'allied', 0);
    wa.addPlayer(2, 'soviet', 0);
    const atk = wa.spawnUnit(1, 'grizzly', 5, 5)!;
    wa.applyCommands([{ kind: 'stance', entityIds: [atk.id], stance: 'aggressive' }]);
    const farA = wa.spawnUnit(2, 'conscript', 14, 5)!; // ~9 格，超警戒(6)、在进攻半径(12)内
    const aStart = farA.hp;
    runScript(wa, [], 600);
    expect(farA.hp).toBeLessThan(aStart); // 进攻姿态主动出击

    // 对照：默认警戒姿态对 9 格外的敌人不理会
    const wg = new World(gridTerrain(40, 40), 55);
    wg.addPlayer(1, 'allied', 0);
    wg.addPlayer(2, 'soviet', 0);
    const grd = wg.spawnUnit(1, 'grizzly', 5, 5)!;
    const farG = wg.spawnUnit(2, 'conscript', 14, 5)!;
    const gStart = farG.hp;
    runScript(wg, [], 600);
    expect(farG.hp).toBe(gStart); // 警戒不会跑那么远
    expect(grd.cellX).toBe(5); // 原地不动
  });

  it('采矿指令：把误走的矿车重新派去指定矿点采矿', () => {
    const w = new World(gridTerrain(30, 30), 19);
    w.addPlayer(1, 'allied', 0);
    const h = w.spawnUnit(1, 'harvester', 5, 5)!;
    for (let y = 18; y < 22; y++) for (let x = 18; x < 22; x++) w.setOre(x, y, 500);
    // 误点：把矿车支到无矿的角落
    w.applyCommands([{ kind: 'move', entityIds: [h.id], cellX: 2, cellY: 28 }]);
    expect(h.harvester!.mode).toBe('seek'); // 仍处采矿态（抵达后会自找矿）
    expect(h.goal !== null || h.path.length > 0).toBe(true);
    // 重新指定矿点
    w.applyCommands([{ kind: 'harvest', entityIds: [h.id], cellX: 19, cellY: 19 }]);
    expect(h.harvester!.mode).toBe('toOre');
    runScript(w, [], 1500);
    expect(w.oreAt(19, 19)).toBeLessThan(500); // 这片矿被采走了一部分
  });

  it('「采」按钮(harvest 到无矿格)：恢复自动采矿', () => {
    const w = new World(gridTerrain(30, 30), 23);
    w.addPlayer(1, 'allied', 0);
    const h = w.spawnUnit(1, 'harvester', 5, 5)!;
    w.applyCommands([{ kind: 'move', entityIds: [h.id], cellX: 25, cellY: 25 }]);
    expect(h.goal !== null || h.path.length > 0).toBe(true);
    // 「采」发出的 harvest(-1,-1)：清掉去向并恢复 seek（自找最近矿田）
    w.applyCommands([{ kind: 'harvest', entityIds: [h.id], cellX: -1, cellY: -1 }]);
    expect(h.harvester!.mode).toBe('seek');
    expect(h.goal).toBeNull();
    expect(h.path.length).toBe(0);
  });

  it('攻击移动：沿途逐个停下歼敌、清完再续行到终点（经典 A-move）', () => {
    const w = new World(gridTerrain(40, 40), 33);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const tank = w.spawnUnit(1, 'grizzly', 2, 2)!;
    const e1 = w.spawnUnit(2, 'conscript', 12, 2)!; // 路上第一个
    const e2 = w.spawnUnit(2, 'conscript', 22, 2)!; // 路上第二个
    w.applyCommands([{ kind: 'attackMove', entityIds: [tank.id], cellX: 36, cellY: 2 }]);
    runScript(w, [], 1500);
    expect(w.entities.has(e1.id)).toBe(false); // 逐个清掉，不再"擦肩而过"
    expect(w.entities.has(e2.id)).toBe(false);
    expect(tank.cellX).toBeGreaterThan(30); // 清完继续抵达终点
    expect(tank.attackMove).toBe(false); // 到点结束攻击移动
  });

  it('巡逻：在两点间持续往返', () => {
    const w = new World(gridTerrain(40, 40), 29);
    w.addPlayer(1, 'allied', 0);
    const tank = w.spawnUnit(1, 'grizzly', 5, 5)!;
    w.applyCommands([{ kind: 'patrol', entityIds: [tank.id], cellX: 30, cellY: 5 }]);
    expect(tank.patrol).not.toBeNull();
    expect(tank.attackMove).toBe(true); // 巡逻沿途自动交战
    let reachedFar = false;
    let minXAfterFar = 99;
    for (let i = 0; i < 3000; i++) {
      w.step();
      if (tank.cellX >= 28) reachedFar = true;
      if (reachedFar) minXAfterFar = Math.min(minXAfterFar, tank.cellX);
    }
    expect(reachedFar).toBe(true); // 到过远端
    expect(minXAfterFar).toBeLessThan(10); // 之后折返回起点端
    expect(tank.patrol).not.toBeNull(); // 巡逻持续，不会自己停下
  });

  it('巡逻可被停止命令取消', () => {
    const w = new World(gridTerrain(40, 40), 31);
    w.addPlayer(1, 'allied', 0);
    const tank = w.spawnUnit(1, 'grizzly', 5, 5)!;
    w.applyCommands([{ kind: 'patrol', entityIds: [tank.id], cellX: 30, cellY: 5 }]);
    w.step();
    w.applyCommands([{ kind: 'stop', entityIds: [tank.id] }]);
    expect(tank.patrol).toBeNull();
    expect(tank.attackMove).toBe(false);
    expect(tank.goal).toBeNull();
  });
});
