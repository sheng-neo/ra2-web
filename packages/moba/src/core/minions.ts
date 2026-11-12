/**
 * 小兵：出兵波次、沿兵线行进、仇恨与攻击。
 *
 * 仇恨（半径 MINION_AGGRO）：正在攻击己方英雄的敌人(呼救) → 最近的敌方小兵 → 敌方英雄 → 敌方建筑。
 * 已有目标时保持不变，直到它死亡/消失/走远；呼救目标可以随时抢占。目标丢失后回到兵线继续前进。
 */
import { engage, tickAttack } from './combat';
import { WAVES } from './data/units';
import { canTarget, createMinion } from './entity';
import { HELP_WINDOW, MINION_AGGRO, type SimMinion, type SimUnit } from './internal';
import { moveToward, stepToward, updateDash } from './movement';
import { recomputeStats } from './stats';
import type { LaneId, MinionType, PlayerTeam, Vec2 } from './types';
import type { Sim } from './world';

const LANE_IDS: LaneId[] = ['top', 'mid', 'bot'];
const THINK_INTERVAL = 0.25;
/** 沿兵线的引导点取前方多远 */
const LOOKAHEAD = 3;
/** 追击英雄时离兵线超过这个距离就放弃 */
const LANE_LEASH = 9;
/** 目标离自己超过这个距离视为丢失 */
const DROP_RANGE = MINION_AGGRO + 3;
/** 同波小兵的横向站位（米） */
const OFFSETS = [-0.9, 0.9, 0, -1.7, 1.7, 0.5];

const tmp: Vec2 = { x: 0, y: 0 };
const near: SimUnit[] = [];

function spawnMinion(sim: Sim, team: PlayerTeam, lane: LaneId, type: MinionType, slot: number): void {
  if (sim.state.over) return;
  const path = sim.lanes[lane];
  const spawn = sim.map.bases[team].minionSpawn[lane];
  const s = path.project(spawn.x, spawn.y);
  path.pointAt(s, tmp);
  const offset = OFFSETS[slot % OFFSETS.length];
  // 法线 = 切向旋转 90°
  const pos = { x: spawn.x - path.ty * offset, y: spawn.y + path.tx * offset };
  sim.nav.nearestFree(pos.x, pos.y, 0.8, pos);
  const m = createMinion(sim, team, lane, type, pos);
  m.m.offset = offset;
  m.facing = Math.atan2(path.ty * m.m.dir, path.tx * m.m.dir);
  // 星陨祝福期间出生的小兵直接带上加成
  if (sim.state.teams[team].blessingLeft > 0) recomputeStats(sim, m);
  sim.addUnit(m);
  minionThink(sim, m);
  m.rt.thinkAt = sim.state.time + THINK_INTERVAL;
}

function spawnWave(sim: Sim, wave: number): void {
  const time = sim.state.time;
  for (const team of [0, 1] as PlayerTeam[]) {
    const enemy = team === 0 ? 1 : 0;
    for (const lane of LANE_IDS) {
      const list: MinionType[] = [];
      for (let i = 0; i < WAVES.melee; i++) list.push('melee');
      // 敌方这一路的高地塔已毁 → 我方该路每波多一个超级兵
      if (sim.towers[enemy][lane][2] === null) {
        list.push('super');
        if (!sim.superAnnounced[team][lane]) {
          sim.superAnnounced[team][lane] = true;
          sim.emit({ type: 'announce', key: 'super_minions', team });
        }
      }
      for (let i = 0; i < WAVES.ranged; i++) list.push('ranged');
      if (wave >= WAVES.siegeEvery && wave % WAVES.siegeEvery === 0) list.push('siege');
      list.forEach((type, i) => {
        sim.scheduler.at(time + i * WAVES.stagger, () => spawnMinion(sim, team, lane, type, i));
      });
    }
  }
}

/** 出兵计时；同步 state.wave / state.nextWaveIn */
export function updateWaves(sim: Sim): void {
  const st = sim.state;
  if (sim.opts.noWaves) {
    st.nextWaveIn = 0;
    return;
  }
  if (st.time + 1e-9 >= sim.nextWaveAt) {
    st.wave++;
    sim.nextWaveAt += WAVES.interval;
    spawnWave(sim, st.wave);
    sim.emit({ type: 'waveSpawn', wave: st.wave });
    if (st.wave === 1) sim.emit({ type: 'announce', key: 'minions_spawn', team: 2 });
  }
  st.nextWaveIn = Math.max(0, sim.nextWaveAt - st.time);
}

/** 索敌 + 计算兵线引导点（每 THINK_INTERVAL 一次） */
function minionThink(sim: Sim, m: SimMinion): void {
  const mm = m.m;
  const path = sim.lanes[m.lane];
  const s = path.project(m.pos.x, m.pos.y);
  const lateral = path.lateral;
  mm.offLane = lateral > 4;
  const tooFar = lateral > LANE_LEASH;

  const cur = m.targetId >= 0 ? sim.byId.get(m.targetId) : undefined;
  let curValid = false;
  if (cur && canTarget(m, cur)) {
    const dx = cur.pos.x - m.pos.x;
    const dy = cur.pos.y - m.pos.y;
    curValid = dx * dx + dy * dy <= DROP_RANGE * DROP_RANGE && !(tooFar && cur.kind === 'hero');
  }

  const helpSince = sim.state.time - HELP_WINDOW;
  let help: SimUnit | null = null;
  let helpD = Infinity;
  let minion: SimUnit | null = null;
  let minionD = Infinity;
  let hero: SimUnit | null = null;
  let heroD = Infinity;
  let structure: SimUnit | null = null;
  let structureD = Infinity;
  const n = sim.grid.query(m.pos.x, m.pos.y, MINION_AGGRO, near);
  for (let i = 0; i < n; i++) {
    const c = near[i];
    if (c.kind === 'monster' || !canTarget(m, c)) continue;
    const d = Math.hypot(c.pos.x - m.pos.x, c.pos.y - m.pos.y) - c.radius;
    if (d > MINION_AGGRO) continue;
    if (c.rt.hitHeroTime >= helpSince && d < helpD && !(tooFar && c.kind === 'hero')) {
      help = c;
      helpD = d;
    }
    if (c.kind === 'minion') {
      if (d < minionD) {
        minion = c;
        minionD = d;
      }
    } else if (c.kind === 'hero') {
      if (d < heroD && !tooFar) {
        hero = c;
        heroD = d;
      }
    } else if (d < structureD) {
      structure = c;
      structureD = d;
    }
  }

  let pick: SimUnit | null;
  if (help) {
    // 已经在响应呼救且目标还有效就不换，避免在几个目标之间来回摇摆
    pick = mm.helping && curValid && cur ? cur : help;
    mm.helping = true;
  } else {
    pick = curValid && cur && !mm.helping ? cur : (minion ?? hero ?? structure);
    mm.helping = false;
  }
  m.targetId = pick ? pick.id : -1;
  if (pick) return;

  // 没有目标：沿兵线前进。到了尽头就走向敌方水晶
  const atEnd = mm.dir > 0 ? s >= path.total - 1 : s <= 1;
  if (atEnd) {
    const core = sim.cores[m.team === 0 ? 1 : 0];
    mm.goalX = core.pos.x;
    mm.goalY = core.pos.y;
  } else {
    path.pointAt(s + mm.dir * LOOKAHEAD, tmp);
    mm.goalX = tmp.x - path.ty * mm.offset;
    mm.goalY = tmp.y + path.tx * mm.offset;
  }
}

export function updateMinion(sim: Sim, m: SimMinion, dt: number): void {
  const rt = m.rt;
  const time = sim.state.time;
  tickAttack(sim, m, dt);
  if (rt.dash) {
    updateDash(sim, m, dt);
    return;
  }
  if (rt.stunned) return;
  if (time >= rt.thinkAt) {
    rt.thinkAt = time + THINK_INTERVAL;
    minionThink(sim, m);
  }
  if (m.targetId >= 0) {
    const target = sim.byId.get(m.targetId);
    if (target && canTarget(m, target)) {
      engage(sim, m, target, dt, true);
      return;
    }
    // 目标丢失：下一 tick 立刻重新索敌
    m.targetId = -1;
    rt.thinkAt = time;
  }
  if (rt.windupLeft > 0 || rt.rooted) return;
  if (m.m.offLane) moveToward(sim, m, m.m.goalX, m.m.goalY, dt);
  else stepToward(sim, m, m.m.goalX, m.m.goalY, dt);
}
