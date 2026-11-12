import { describe, expect, it, vi } from 'vitest';
import type { SimHero } from '../../core/internal';
import { heroOf, place, quietWorld, spawnMinionAt, stepFor } from '../../core/testkit';
import type { BuffId, CoreUnit, GameState, HeroUnit, TowerUnit } from '../../core/types';
import { createWorld, type Sim } from '../../core/world';
import { LANE_PHASE_END, LATE_PHASE_START, OBJECTIVE_DEBOUNCE, ObjectiveTracker, createObjectiveMemory, pickObjective, type Objective } from './objective-rules';

// 这些用例要推进真实模拟层，机器负载高时默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const player = (sim: Sim): SimHero => sim.heroes.find((h) => h.isPlayer) as SimHero;
/** 直接给单位挂一个状态(只填界面读的那几个字段；测试里不再推进模拟层时用) */
function addBuff(u: HeroUnit, id: BuffId, sourceId: number): void {
  u.buffs.push({ id, sourceId, timeLeft: 99, duration: 99, stacks: 1, value: 0 });
}

const tower = (sim: Sim, team: 0 | 1, lane: 'top' | 'mid' | 'bot', tier: 1 | 2 | 3): TowerUnit =>
  sim.units.find((u) => u.kind === 'tower' && u.team === team && u.lane === lane && u.tier === tier) as TowerUnit;
const core = (sim: Sim, team: 0 | 1): CoreUnit => sim.units.find((u) => u.kind === 'core' && u.team === team) as CoreUnit;
const pick = (sim: Sim, mem = createObjectiveMemory(), mode: 'kbm' | 'touch' = 'kbm'): Objective | null => pickObjective(sim.state, player(sim), mode, mem);

/** 把玩家摆到本路一塔下、让第一波兵「已经出过」：多数规则的干净起点 */
function laneStart(hero: 'chijin' | 'yeque' = 'chijin'): Sim {
  const sim = quietWorld(hero);
  const me = player(sim);
  place(sim, me, -48.6, -20);
  stepFor(sim, 0.5);
  (sim.state as GameState).wave = 1;
  return sim;
}

describe('pickObjective：逐条规则', () => {
  it('0 阵亡或对局结束时不显示', () => {
    const sim = laneStart();
    const me = player(sim);
    me.alive = false;
    expect(pick(sim)).toBeNull();
    me.alive = true;
    sim.state.over = true;
    expect(pick(sim)).toBeNull();
  });

  it('1 残血：提示回城，键鼠与触控措辞不同；在泉水里或回城中不提示', () => {
    const sim = laneStart();
    const me = player(sim);
    me.hp = me.stats.maxHp * 0.2;
    const o = pick(sim);
    expect(o?.id).toBe('retreat');
    expect(o?.tone).toBe('warn');
    expect(o?.text).toContain('按 B 回城');
    expect(pick(sim, createObjectiveMemory(), 'touch')?.text).toContain('点「回城」');
    addBuff(me, 'recall', -1);
    expect(pick(sim)?.id).not.toBe('retreat');
  });

  it('回城中 / 在泉水里没补满：提示补满再走，不催着去推塔', () => {
    const sim = laneStart();
    const me = player(sim);
    me.hp = me.stats.maxHp * 0.2;
    addBuff(me, 'recall', -1);
    const o = pick(sim);
    expect(o?.id).toBe('heal_up');
    expect(o?.tone).toBe('info');
    expect(o?.text).toContain('回城中');
    me.buffs.length = 0;
    addBuff(me, 'fountain', -1);
    expect(pick(sim)?.text).toBe('在泉水里补满状态再出发');
    me.hp = me.stats.maxHp;
    expect(pick(sim)?.id).not.toBe('heal_up');
  });

  it('1 残血带回差：0.3 以下切入，回到 0.36 以上才切走', () => {
    const sim = laneStart();
    const me = player(sim);
    const mem = createObjectiveMemory();
    me.hp = me.stats.maxHp * 0.33;
    expect(pick(sim, mem)?.id).not.toBe('retreat');
    me.hp = me.stats.maxHp * 0.29;
    expect(pick(sim, mem)?.id).toBe('retreat');
    me.hp = me.stats.maxHp * 0.33;
    expect(pick(sim, mem)?.id).toBe('retreat');
    me.hp = me.stats.maxHp * 0.4;
    expect(pick(sim, mem)?.id).not.toBe('retreat');
  });

  it('2 被塔锁定且塔下没有我方小兵：先退出来；塔下有兵就不提示', () => {
    const sim = laneStart();
    const me = player(sim);
    const t = tower(sim, 1, 'top', 1);
    place(sim, me, t.pos.x, t.pos.y + 5);
    addBuff(me, 'tower_focus', t.id);
    const o = pick(sim);
    expect(o?.id).toBe('tower_aggro');
    expect(o?.text).toContain('塔下没有小兵');
    spawnMinionAt(sim, 0, 'melee', t.pos.x + 2, t.pos.y + 3, 'top');
    expect(pick(sim)?.id).not.toBe('tower_aggro');
  });

  it('3 我方高地塔 / 水晶挨打且旁边有看得见的敌方英雄：回防', () => {
    const sim = laneStart();
    const t3 = tower(sim, 0, 'mid', 3);
    t3.lastHitTime = sim.state.time;
    expect(pick(sim)?.id).not.toBe('defend');
    const foe = heroOf(sim, 1, 'chijin');
    place(sim, foe, t3.pos.x + 4, t3.pos.y);
    const o = pick(sim);
    expect(o?.id).toBe('defend');
    expect(o?.text).toBe('敌人在拆我方中路高地塔，回防！');
    expect(o?.pos).toEqual(t3.pos);
    // 水晶
    t3.lastHitTime = -999;
    const c = core(sim, 0);
    c.lastHitTime = sim.state.time;
    place(sim, foe, c.pos.x + 5, c.pos.y);
    expect(pick(sim)?.text).toBe('敌人在打我方水晶，快回防！');
    // 敌人不可见就不提示
    foe.visible[0] = false;
    expect(pick(sim)?.id).not.toBe('defend');
  });

  it('4 敌方水晶打得动了：指出是哪一路的高地破了', () => {
    const sim = laneStart();
    tower(sim, 1, 'bot', 3).alive = false;
    core(sim, 1).invulnerable = false;
    const o = pick(sim);
    expect(o?.id).toBe('end_it');
    expect(o?.tone).toBe('go');
    expect(o?.text).toBe('敌方下路高地已破：跟着小兵去打水晶！');
    expect(o?.pos).toEqual(core(sim, 1).pos);
  });

  it('5 我方小兵进了敌塔射程、人在 20 米内：快打塔', () => {
    const sim = laneStart();
    const me = player(sim);
    const t = tower(sim, 1, 'top', 1);
    spawnMinionAt(sim, 0, 'melee', t.pos.x - 3, t.pos.y, 'top');
    place(sim, me, t.pos.x - 30, t.pos.y);
    expect(pick(sim)?.id).not.toBe('push_now');
    place(sim, me, t.pos.x - 15, t.pos.y);
    const mem = createObjectiveMemory();
    expect(pick(sim, mem)?.id).toBe('push_now');
    // 回差：退到 23 米仍然保持
    place(sim, me, t.pos.x - 23, t.pos.y);
    expect(pick(sim, mem)?.id).toBe('push_now');
    expect(pick(sim)?.id).not.toBe('push_now');
  });

  it('6 敌方只剩一人以内存活：抓紧推塔', () => {
    const sim = laneStart();
    const foes = sim.heroes.filter((h) => h.team === 1);
    for (let i = 0; i < 4; i++) foes[i].alive = false;
    const o = pick(sim);
    expect(o?.id).toBe('numbers');
    foes[3].alive = true;
    expect(pick(sim)?.id).not.toBe('numbers');
  });

  it('7 史诗野怪：刷新后 20 秒内一直提示，之后只有人在坑边才提示', () => {
    const sim = laneStart();
    const me = player(sim);
    const def = sim.state.map.camps.find((c) => c.monsterType === 'abyss_drake');
    if (!def) throw new Error('no drake camp');
    const cs = sim.state.camps.find((c) => c.campId === def.id);
    if (!cs) throw new Error('no drake camp state');
    cs.alive = true;
    cs.respawnIn = 0;
    const mem = createObjectiveMemory();
    place(sim, me, 40, 40);
    const o = pick(sim, mem);
    expect(o?.id).toBe('epic_up');
    expect(o?.text).toBe('河道巨龙已刷新(左上河道)，叫上队友一起打');
    expect(o?.pos).toEqual(def.pos);
    (sim.state as GameState).time += 25;
    expect(pick(sim, mem)?.id).not.toBe('epic_up');
    place(sim, me, def.pos.x + 10, def.pos.y);
    expect(pick(sim, mem)?.id).toBe('epic_up');
    // 死了之后记忆清掉，下次刷新重新计 20 秒
    cs.alive = false;
    pick(sim, mem);
    expect(mem.epicSince.size).toBe(0);
  });

  it('8 史诗野怪 15 秒内要刷新：倒计时，数字变化不换键', () => {
    const sim = laneStart();
    const def = sim.state.map.camps.find((c) => c.monsterType === 'star_colossus');
    if (!def) throw new Error('no colossus camp');
    const cs = sim.state.camps.find((c) => c.campId === def.id);
    if (!cs) throw new Error('no colossus camp state');
    cs.respawnIn = 12.2;
    const a = pick(sim);
    expect(a?.id).toBe('epic_soon');
    expect(a?.text).toBe('远古巨灵 13 秒后刷新(右下河道)');
    cs.respawnIn = 7;
    const b = pick(sim);
    expect(b?.text).toContain('7 秒后刷新');
    expect(b?.key).toBe(a?.key);
    cs.respawnIn = 40;
    expect(pick(sim)?.id).not.toBe('epic_soon');
  });

  it('9 第一波兵出发前：去本路一塔等着；打野去增益怪营地', () => {
    const sim = quietWorld('chijin');
    const o = pick(sim);
    expect(o?.id).toBe('spawn_wait');
    expect(o?.text).toMatch(/^小兵 \d+ 秒后出发，先去上路一塔等着$/);
    expect(o?.pos).toEqual(tower(sim, 0, 'top', 1).pos);
    const jg = quietWorld('yeque');
    const j = pick(jg);
    expect(j?.id).toBe('spawn_wait');
    expect(j?.text).toMatch(/你是打野：先去(蓝|红)buff那儿等着$/);
  });

  it('10 打野前期：去打最近的活营地；都没刷出来就去增益怪营地等', () => {
    const sim = laneStart('yeque');
    const me = player(sim);
    const camps = sim.state.map.camps.filter((c) => c.side === 0);
    const blue = camps.find((c) => c.monsterType === 'frost_golem');
    const small = camps.find((c) => c.monsterType === 'mossback');
    if (!blue || !small) throw new Error('camps missing');
    place(sim, me, blue.pos.x + 6, blue.pos.y);
    // 营地都还没刷：等
    for (const c of camps) {
      const cs = sim.state.camps.find((x) => x.campId === c.id);
      if (!cs) continue;
      cs.alive = false;
      cs.respawnIn = 12;
    }
    const w = pick(sim);
    expect(w?.id).toBe('jungle');
    expect(w?.text).toBe('野怪 12 秒后刷新，先去蓝buff营地等着');
    // 刷出来了：去打
    const set = (id: number, alive: boolean): void => {
      const cs = sim.state.camps.find((c) => c.campId === id);
      if (cs) {
        cs.alive = alive;
        cs.respawnIn = alive ? 0 : 50;
      }
    };
    set(blue.id, true);
    set(small.id, true);
    const o = pick(sim);
    expect(o?.text).toBe('打野怪升级：去打蓝buff');
    expect(o?.pos).toEqual(blue.pos);
    set(blue.id, false);
    expect(pick(sim)?.text).toBe('打野怪升级：去打小野怪');
    // 过了对线期就不再催打野
    (sim.state as GameState).time = LANE_PHASE_END + 1;
    expect(pick(sim)?.id).not.toBe('jungle');
  });

  it('11 后期队友抱团而人离得远：过去一起推', () => {
    const sim = laneStart();
    const me = player(sim);
    (sim.state as GameState).time = LATE_PHASE_START + 5;
    const mates = sim.heroes.filter((h) => h.team === 0 && !h.isPlayer);
    place(sim, mates[0], 2, -2);
    place(sim, mates[1], -2, 2);
    place(sim, me, -50, 0);
    const o = pick(sim);
    expect(o?.id).toBe('group');
    expect(o?.text).toBe('队友在中路集合，过去一起推');
    place(sim, me, 3, 3);
    expect(pick(sim)?.id).not.toBe('group');
  });

  it('12 前期离本路太远：回去；站在本路一塔下等兵不算跑偏', () => {
    const sim = laneStart();
    const me = player(sim);
    expect(pick(sim)?.id).not.toBe('back_to_lane');
    place(sim, me, 0, 0);
    const o = pick(sim);
    expect(o?.id).toBe('back_to_lane');
    expect(o?.text).toBe('回到上路，跟着小兵打');
    expect(o?.pos).toEqual(tower(sim, 0, 'top', 1).pos);
    // 有兵时小地图指向最前面的小兵
    const m = spawnMinionAt(sim, 0, 'melee', 10, -52, 'top');
    expect(pick(sim)?.pos).toEqual(m.pos);
    // 跟着兵压过了一塔、或者兵线被清光时人还站在线上，都不算跑偏
    place(sim, me, m.pos.x - 6, m.pos.y);
    expect(pick(sim)?.id).not.toBe('back_to_lane');
    place(sim, me, -46, -50);
    expect(pick(sim)?.id).not.toBe('back_to_lane');
    // 刚复活站在基地里也不算
    place(sim, me, -54, 54);
    expect(pick(sim)?.id).not.toBe('back_to_lane');
  });

  it('13 开局身边有敌方小兵：补兵', () => {
    const sim = laneStart();
    const me = player(sim);
    spawnMinionAt(sim, 1, 'melee', me.pos.x + 6, me.pos.y, 'top');
    const o = pick(sim);
    expect(o?.id).toBe('lane_farm');
    expect(o?.text).toBe('补兵赚钱：给小兵最后一击');
    // 小兵清光后再留 8 秒(上一次命中的是它才留)
    const mem = createObjectiveMemory();
    expect(pick(sim, mem)?.id).toBe('lane_farm');
    for (const u of sim.units) if (u.kind === 'minion') u.alive = false;
    (sim.state as GameState).time += 5;
    expect(pick(sim, mem)?.id).toBe('lane_farm');
    expect(pick(sim)?.id).not.toBe('lane_farm');
    (sim.state as GameState).time += 5;
    expect(pick(sim, mem)?.id).not.toBe('lane_farm');
    (sim.state as GameState).time = 151;
    expect(pick(sim)?.id).not.toBe('lane_farm');
  });

  it('14 兜底：推本路当前打得动的那座塔；一塔没了就说二塔', () => {
    const sim = laneStart();
    const o = pick(sim);
    expect(o?.id).toBe('push_lane');
    expect(o?.text).toBe('跟着小兵，推掉敌方上路一塔');
    expect(o?.pos).toEqual(tower(sim, 1, 'top', 1).pos);
    tower(sim, 1, 'top', 1).alive = false;
    const b = pick(sim);
    expect(b?.text).toBe('跟着小兵，推掉敌方上路二塔');
    expect(b?.key).not.toBe(o?.key);
    // 打野英雄前期兜底去中路
    const jg = laneStart('yeque');
    for (const cs of jg.state.camps) {
      cs.alive = false;
      cs.respawnIn = 50;
    }
    expect(pick(jg)?.text).toBe('跟着小兵，推掉敌方中路一塔');
  });

  it('14 对线期之后：站在哪条线上推哪一路；穿野区的路上沿用上一次说的；没说过时先说本路', () => {
    const sim = laneStart();
    const me = player(sim);
    (sim.state as GameState).time = LANE_PHASE_END + 10;
    // 刚复活站在泉水里、还没说过：先说本路
    place(sim, me, -54, 54);
    expect(pick(sim)?.text).toBe('跟着小兵，推掉敌方上路一塔');
    // 人在中路线上：推中路
    const mem = createObjectiveMemory();
    place(sim, me, -6, 6);
    expect(pick(sim, mem)?.text).toBe('跟着小兵，推掉敌方中路一塔');
    // 离开中路进了野区(离哪条线都远)：沿用中路，哪怕上路的塔更近
    place(sim, me, -30, -22);
    expect(pick(sim, mem)?.text).toBe('跟着小兵，推掉敌方中路一塔');
    // 中间被别的目标打断过也记得
    mem.lastId = 'push_now';
    mem.lastKey = 'push_now';
    expect(pick(sim, mem)?.text).toBe('跟着小兵，推掉敌方中路一塔');
    // 真走到上路线上了才改口
    place(sim, me, -40, -52);
    expect(pick(sim, mem)?.text).toBe('跟着小兵，推掉敌方上路一塔');
  });
});

describe('ObjectiveTracker：防抖', () => {
  const mk = (key: string, priority = 14, text = key): Objective => ({ id: priority <= 3 ? 'retreat' : 'push_lane', key, priority, text, tone: priority <= 3 ? 'warn' : 'info' });

  it('从无到有立即显示；新目标要连续命中 1 秒且旧目标已停留 4 秒才切换', () => {
    const tr = new ObjectiveTracker();
    expect(tr.feed(mk('a'), 0)).toBe(true);
    expect(tr.current?.key).toBe('a');
    // 0.5 秒时出现 b：还没到最短停留
    for (let t = 0.5; t < 4; t += 0.5) {
      expect(tr.feed(mk('b'), t)).toBe(false);
      expect(tr.current?.key).toBe('a');
    }
    expect(tr.feed(mk('b'), 4)).toBe(true);
    expect(tr.current?.key).toBe('b');
  });

  it('只闪一下的候选不会被切上来', () => {
    const tr = new ObjectiveTracker();
    tr.feed(mk('a'), 0);
    tr.feed(mk('a'), 10);
    expect(tr.feed(mk('b'), 10.5)).toBe(false);
    expect(tr.feed(mk('a'), 11)).toBe(false);
    expect(tr.feed(mk('b'), 11.5)).toBe(false);
    expect(tr.feed(mk('b'), 12)).toBe(false);
    expect(tr.current?.key).toBe('a');
    expect(tr.feed(mk('b'), 12.5)).toBe(true);
  });

  it('警告类立即切入；条件消失 1.5 秒后才切走', () => {
    const tr = new ObjectiveTracker();
    tr.feed(mk('a'), 0);
    expect(tr.feed(mk('w', 1), 0.5)).toBe(true);
    expect(tr.current?.key).toBe('w');
    expect(tr.feed(mk('a'), 1)).toBe(false);
    expect(tr.feed(mk('a'), 2)).toBe(false);
    expect(tr.current?.key).toBe('w');
    expect(tr.feed(mk('a'), 2.5)).toBe(true);
    expect(tr.current?.key).toBe('a');
  });

  it('警告中途又命中：重新计 1.5 秒', () => {
    const tr = new ObjectiveTracker();
    tr.feed(mk('w', 1), 0);
    tr.feed(mk('a'), 0.5);
    tr.feed(mk('w', 1), 1);
    expect(tr.feed(mk('a'), 1.5)).toBe(false);
    expect(tr.feed(mk('a'), 2.5)).toBe(false);
    expect(tr.feed(mk('a'), 3)).toBe(true);
  });

  it('同一个键只换文字(倒计时)不算切换；候选为空立即清掉', () => {
    const tr = new ObjectiveTracker();
    tr.feed(mk('soon', 8, '12 秒'), 0);
    expect(tr.feed(mk('soon', 8, '11 秒'), 0.5)).toBe(false);
    expect(tr.current?.text).toBe('11 秒');
    expect(tr.feed(null, 1)).toBe(true);
    expect(tr.current).toBeNull();
    expect(tr.feed(mk('a'), 1.5)).toBe(true);
  });
});

describe('全 Bot 对局里的目标提示', () => {
  it('每 0.5 秒评估一次：不抛错，原始切换每分钟不超过 12 次，防抖后更少', { timeout: 120_000 }, () => {
    const sim = createWorld({ seed: 7, playerHero: 'chijin', difficulty: 'normal', autoPlay: true });
    const mem = createObjectiveMemory();
    const tr = new ObjectiveTracker();
    const every = Math.round(OBJECTIVE_DEBOUNCE.interval * 30);
    const rawPerMin: number[] = [];
    const shownPerMin: number[] = [];
    const seen = new Set<string>();
    let lastKey = '';
    const minutes = 6;
    for (let tick = 0; tick < minutes * 60 * 30 && !sim.state.over; tick++) {
      sim.step();
      sim.drainEvents();
      if (tick % every !== 0) continue;
      const me = player(sim);
      const o = pickObjective(sim.state, me, 'kbm', mem);
      const minute = Math.floor(sim.state.time / 60);
      rawPerMin[minute] = rawPerMin[minute] ?? 0;
      shownPerMin[minute] = shownPerMin[minute] ?? 0;
      const key = o ? o.key : '';
      // 阵亡 / 复活造成的有无切换不算抖动
      if (key !== lastKey && key !== '' && lastKey !== '') rawPerMin[minute]++;
      lastKey = key;
      const before = tr.current;
      if (tr.feed(o, sim.state.time) && before && tr.current) shownPerMin[minute]++;
      if (o) {
        seen.add(o.id);
        expect(o.text.length).toBeGreaterThan(3);
        expect(o.text).not.toMatch(/undefined|NaN/);
      }
    }
    expect(Math.max(...rawPerMin)).toBeLessThanOrEqual(12);
    expect(Math.max(...shownPerMin)).toBeLessThanOrEqual(10);
    // 一局下来至少见过开局等兵、对线、推塔这几类
    expect(seen.has('spawn_wait')).toBe(true);
    expect(seen.has('push_lane')).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
