/**
 * 「当前目标」的规则与防抖（纯函数，不碰 DOM、不引用主题模块，可在 Node 里单测）。
 *
 * pickObjective：按优先级从上往下挑一条「现在该做什么」。只读 GameState 里玩家本来就看得到的东西：
 * 涉及敌方英雄 / 小兵位置时只用对我方可见的。
 * ObjectiveTracker：把每 0.5 秒评估一次的原始结果做防抖——新目标确认 1 秒、切换后至少停留 4 秒；
 * 警告类(优先级 1~3)立即切入，条件消失 1.5 秒后切走。
 *
 * 距离类条件都带一点回差(上一次命中同一条规则时门槛放宽)，免得人站在门槛上时来回跳。
 */
import { MONSTERS } from '../../core/data/units';
import type { CampDef, CoreUnit, GameState, HeroUnit, LaneId, MinionUnit, TowerUnit, Unit, Vec2 } from '../../core/types';
import type { InputMode } from './common';
import { LANE_NAME, riverSide, towerName } from './text';

export type ObjectiveTone = 'info' | 'warn' | 'go';
export type ObjectiveId =
  | 'retreat'
  | 'tower_aggro'
  | 'defend'
  | 'heal_up'
  | 'end_it'
  | 'push_now'
  | 'numbers'
  | 'epic_up'
  | 'epic_soon'
  | 'spawn_wait'
  | 'jungle'
  | 'group'
  | 'back_to_lane'
  | 'lane_farm'
  | 'push_lane';

export interface Objective {
  id: ObjectiveId;
  /** 规则的优先级序号(1 最高)。1~3 是警告类 */
  priority: number;
  /** 稳定键：同一条规则下指向同一个对象时不变(不含倒计时数字)。键变了才算「换了目标」 */
  key: string;
  text: string;
  tone: ObjectiveTone;
  /** 目标所在位置：切入时小地图在这里脉冲几秒 */
  pos?: Vec2;
}

/** 规则之间要记的一点点东西(史诗野怪什么时候刷出来的、上一次命中哪条) */
export interface ObjectiveMemory {
  /** 营地 id → 观察到它「活着」的起始时间 */
  epicSince: Map<number, number>;
  lastId: ObjectiveId | null;
  lastKey: string;
  /** 兜底规则上一次说的是哪一路(被别的目标打断后也记着，回来接着说同一路) */
  pushLane: LaneId | null;
  /** 最近一次看到身边有敌方小兵的时间(补兵提示的停留用) */
  farmSeenAt: number;
}

export function createObjectiveMemory(): ObjectiveMemory {
  return { epicSince: new Map(), lastId: null, lastKey: '', pushLane: null, farmSeenAt: -Infinity };
}

/**
 * Bot 队友从对线转游走、再转抱团的两个时间点(秒)。与 core/ai/params.ts 的 TUNE.laneEnd / TUNE.lateStart 同值：
 * 界面层不引用 AI 模块，这里各写一份。
 */
export const LANE_PHASE_END = 270;
export const LATE_PHASE_START = 570;

/** 各条规则的门槛(米 / 秒 / 比例)。第二个数是回差：上一次命中同一条时用它 */
export const OBJECTIVE_TUNE = {
  retreatHp: [0.3, 0.36],
  defendRecent: 3,
  defendRadius: 10,
  pushNowDist: [20, 24],
  /** 史诗野怪刷新后多少秒内一直提示 */
  epicFresh: 20,
  /** 之后只有人在坑边才提示。设计稿写 30 米，实测上路英雄站在自家一塔下就在 30 米内，会从 2:00 一直提示到龙死，收紧到 18 */
  epicNear: [18, 22],
  epicSoon: 15,
  groupDist: [25, 20],
  /** 离本路兵线(折线)多远算跑偏。设计稿按「离最前面的小兵 25 米」算，实测兵线刚被清掉、下一波还在路上时会把站在线上的人也判成跑偏 */
  backDist: [16, 12],
  farmDist: [14, 17],
  farmUntil: 150,
  /** 身边的敌方小兵清光后，补兵提示再留这么久(下一波马上就到，免得和兜底的「推塔」来回换) */
  farmLinger: 8,
  /** 在泉水里血量低于这个比例时提示「补满再走」 */
  fountainHp: 0.85,
} as const;

const d2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const dist = (a: Vec2, b: Vec2): number => Math.sqrt(d2(a, b));

function hasBuff(u: Unit, id: string): boolean {
  for (const b of u.buffs) if (b.id === id) return true;
  return false;
}

/** 点到折线的最近距离 */
function distToPath(p: Vec2, path: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - p.x;
    const dy = a.y + aby * t - p.y;
    const dd = dx * dx + dy * dy;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
}

const LANES: LaneId[] = ['top', 'mid', 'bot'];

export function nearestLane(state: GameState, p: Vec2): LaneId {
  let best: LaneId = 'mid';
  let bd = Infinity;
  for (const lane of LANES) {
    const d = distToPath(p, state.map.lanes[lane]);
    if (d < bd) {
      bd = d;
      best = lane;
    }
  }
  return best;
}

/** 营地的叫法：增益怪与史诗野怪用通用叫法，小野怪统称「小野怪」 */
export function campLabel(def: CampDef): string {
  const m = MONSTERS[def.monsterType];
  return m.alias ? m.name : '小野怪';
}

/** 一趟扫描收集到的局面(各条规则共用) */
interface Scan {
  foeTowers: TowerUnit[];
  myTowers: TowerUnit[];
  foeCore: CoreUnit | null;
  myCore: CoreUnit | null;
  myMinions: MinionUnit[];
  /** 对我方可见的敌方小兵 */
  foeMinions: MinionUnit[];
}

const scanBuf: Scan = { foeTowers: [], myTowers: [], foeCore: null, myCore: null, myMinions: [], foeMinions: [] };

function scan(state: GameState, me: HeroUnit): Scan {
  const s = scanBuf;
  s.foeTowers.length = 0;
  s.myTowers.length = 0;
  s.myMinions.length = 0;
  s.foeMinions.length = 0;
  s.foeCore = null;
  s.myCore = null;
  const team = me.team;
  for (const u of state.units) {
    if (!u.alive) continue;
    if (u.kind === 'tower') (u.team === team ? s.myTowers : s.foeTowers).push(u);
    else if (u.kind === 'core') {
      if (u.team === team) s.myCore = u;
      else s.foeCore = u;
    } else if (u.kind === 'minion') {
      if (u.team === team) s.myMinions.push(u);
      else if (u.visible[team]) s.foeMinions.push(u);
    }
  }
  return s;
}

/** 这座敌塔的射程内有没有我方小兵(pad：回差用的额外距离) */
export function minionsUnder(tower: Unit, myMinions: readonly MinionUnit[], pad = 0): boolean {
  const r = tower.stats.attackRange + pad;
  const r2 = r * r;
  for (const m of myMinions) if (d2(m.pos, tower.pos) <= r2) return true;
  return false;
}

/** 路 L 上存活的敌方塔里 tier 最小的那座(就是当前打得动的那座) */
function frontFoeTower(s: Scan, lane: LaneId): TowerUnit | null {
  let best: TowerUnit | null = null;
  for (const t of s.foeTowers) if (t.lane === lane && (!best || t.tier < best.tier)) best = t;
  return best;
}

/** 己方半区离我最近的增益怪营地(蓝buff / 红buff)。打野英雄开局去的地方 */
export function nearestBuffCamp(state: GameState, me: HeroUnit): CampDef | null {
  let best: CampDef | null = null;
  let bd = Infinity;
  for (const c of state.map.camps) {
    if (c.side !== me.team) continue;
    if (c.monsterType !== 'frost_golem' && c.monsterType !== 'ember_golem') continue;
    const d = d2(c.pos, me.pos);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** 本路我方一塔的位置(塔没了也还是那个位置：开局集合点) */
export function laneTowerSpot(state: GameState, team: 0 | 1, lane: LaneId, tier: 1 | 2 | 3 = 1): Vec2 | null {
  for (const t of state.map.towers) if (t.team === team && t.lane === lane && t.tier === tier) return t.pos;
  return null;
}

const campState = (state: GameState, id: number): { alive: boolean; respawnIn: number } | undefined => {
  const c = state.camps[id];
  return c && c.campId === id ? c : state.camps.find((x) => x.campId === id);
};

/**
 * 挑出当前目标。mem 会被更新(史诗野怪的刷新时刻、上一次命中的规则)；每次评估都要调用，哪怕结果不显示。
 * 返回 null = 什么都不显示(阵亡 / 对局结束)。
 */
export function pickObjective(state: GameState, me: HeroUnit, mode: InputMode, mem: ObjectiveMemory): Objective | null {
  const T = OBJECTIVE_TUNE;
  const now = state.time;
  const map = state.map;

  // 史诗野怪的刷新时刻：不管显示不显示都要记
  for (const def of map.camps) {
    if (!MONSTERS[def.monsterType].epic) continue;
    const cs = campState(state, def.id);
    if (cs && cs.alive) {
      if (!mem.epicSince.has(def.id)) mem.epicSince.set(def.id, now);
    } else mem.epicSince.delete(def.id);
  }

  const res = pick();
  mem.lastId = res ? res.id : null;
  mem.lastKey = res ? res.key : '';
  return res;

  function pick(): Objective | null {
    // 0. 阵亡 / 终局：交给阵亡面板与终局演出
    if (!me.alive || state.over) return null;
    const was = mem.lastId;
    const s = scan(state, me);
    const team = me.team;
    const foe = team === 0 ? 1 : 0;

    // 1. 残血
    const hpRatio = me.hp / Math.max(1, me.stats.maxHp);
    if (hpRatio < T.retreatHp[was === 'retreat' ? 1 : 0] && !hasBuff(me, 'fountain') && !hasBuff(me, 'recall')) {
      return { id: 'retreat', priority: 1, key: 'retreat', tone: 'warn', text: mode === 'kbm' ? '血量危险：先后撤，按 B 回城' : '血量危险：先后撤，点「回城」' };
    }

    // 2. 被塔打，而且塔下没有我方小兵
    if (hasBuff(me, 'tower_focus')) {
      let near: Unit | null = null;
      let nd = Infinity;
      for (const t of s.foeTowers) {
        const d = d2(t.pos, me.pos);
        if (d < nd) {
          nd = d;
          near = t;
        }
      }
      if (s.foeCore && d2(s.foeCore.pos, me.pos) < nd) near = s.foeCore;
      if (near && !minionsUnder(near, s.myMinions)) return { id: 'tower_aggro', priority: 2, key: 'tower_aggro', tone: 'warn', text: '塔在打你，塔下没有小兵，先退出来' };
    }

    // 3. 我方高地塔 / 水晶正在挨打，旁边有看得见的敌方英雄
    {
      let hit: TowerUnit | CoreUnit | null = null;
      const check = (u: TowerUnit | CoreUnit): void => {
        if (hit || now - u.lastHitTime >= T.defendRecent) return;
        const r2 = T.defendRadius * T.defendRadius;
        for (const h of state.heroes) {
          if (h.team === team || !h.alive || !h.visible[team]) continue;
          if (d2(h.pos, u.pos) <= r2) {
            hit = u;
            return;
          }
        }
      };
      if (s.myCore) check(s.myCore);
      for (const t of s.myTowers) if (t.tier === 3) check(t);
      const h = hit as TowerUnit | CoreUnit | null;
      if (h) {
        if (h.kind === 'core') return { id: 'defend', priority: 3, key: 'defend:core', tone: 'warn', text: '敌人在打我方水晶，快回防！', pos: h.pos };
        return { id: 'defend', priority: 3, key: `defend:${h.lane}`, tone: 'warn', text: `敌人在拆我方${towerName(h.lane, 3)}，回防！`, pos: h.pos };
      }
    }

    // 3.5 正在回城 / 在泉水里还没补满：别急着走(设计稿 14 条之外加的一条：残血回城的那几秒不该提示去推塔)
    if (hasBuff(me, 'recall')) return { id: 'heal_up', priority: 3.5, key: 'heal_up', tone: 'info', text: '回城中：原地别动，回泉水补满再出发' };
    if (hasBuff(me, 'fountain') && hpRatio < T.fountainHp) return { id: 'heal_up', priority: 3.5, key: 'heal_up', tone: 'info', text: '在泉水里补满状态再出发' };

    // 4. 敌方水晶已经打得动
    if (s.foeCore && !s.foeCore.invulnerable) {
      let lane: LaneId | null = null;
      let bd = Infinity;
      for (const l of LANES) {
        if (s.foeTowers.some((t) => t.lane === l && t.tier === 3)) continue;
        const spot = laneTowerSpot(state, foe, l, 3);
        const d = spot ? d2(spot, me.pos) : Infinity;
        if (d < bd || lane === null) {
          bd = d;
          lane = l;
        }
      }
      // 同一局面下保持上一次说的那一路，免得人走两步就换
      if (was === 'end_it' && mem.lastKey.startsWith('end_it:')) {
        const prev = mem.lastKey.slice(7) as LaneId;
        if (LANES.indexOf(prev) >= 0 && !s.foeTowers.some((t) => t.lane === prev && t.tier === 3)) lane = prev;
      }
      const where = lane ? `敌方${LANE_NAME[lane]}高地已破` : '敌方高地已破';
      return { id: 'end_it', priority: 4, key: `end_it:${lane ?? ''}`, tone: 'go', text: `${where}：跟着小兵去打水晶！`, pos: s.foeCore.pos };
    }

    // 5. 小兵进塔了，人也在附近
    {
      const r = T.pushNowDist[was === 'push_now' ? 1 : 0];
      const pad = was === 'push_now' ? 2 : 0;
      for (const t of s.foeTowers) {
        if (t.invulnerable || d2(t.pos, me.pos) > r * r) continue;
        if (minionsUnder(t, s.myMinions, pad)) return { id: 'push_now', priority: 5, key: 'push_now', tone: 'go', text: '小兵进塔了，快打塔！' };
      }
    }

    // 6. 敌方只剩一个人以内还活着
    {
      let alive = 0;
      for (const h of state.heroes) if (h.team !== team && h.alive) alive++;
      if (alive <= 1) return { id: 'numbers', priority: 6, key: 'numbers', tone: 'go', text: '敌方大部分阵亡，抓紧推塔！' };
    }

    // 7. 史诗野怪在场：刚刷新，或者人就在坑边
    {
      let best: CampDef | null = null;
      let bd = Infinity;
      for (const def of map.camps) {
        const since = mem.epicSince.get(def.id);
        if (since === undefined) continue;
        const d = dist(def.pos, me.pos);
        const nearR = T.epicNear[was === 'epic_up' && mem.lastKey === `epic_up:${def.id}` ? 1 : 0];
        if (now - since < T.epicFresh || d <= nearR) {
          if (d < bd) {
            bd = d;
            best = def;
          }
        }
      }
      if (best) return { id: 'epic_up', priority: 7, key: `epic_up:${best.id}`, tone: 'info', text: `${MONSTERS[best.monsterType].name}已刷新(${riverSide(best.pos)})，叫上队友一起打`, pos: best.pos };
    }

    // 8. 史诗野怪快刷新了
    {
      let best: CampDef | null = null;
      let left = Infinity;
      for (const def of map.camps) {
        if (!MONSTERS[def.monsterType].epic) continue;
        const cs = campState(state, def.id);
        if (!cs || cs.alive || cs.respawnIn <= 0 || cs.respawnIn > T.epicSoon) continue;
        if (cs.respawnIn < left) {
          left = cs.respawnIn;
          best = def;
        }
      }
      if (best) return { id: 'epic_soon', priority: 8, key: `epic_soon:${best.id}`, tone: 'info', text: `${MONSTERS[best.monsterType].name} ${Math.ceil(left)} 秒后刷新(${riverSide(best.pos)})`, pos: best.pos };
    }

    const jungler = me.lane === 'jungle';
    const myLane: LaneId = me.lane === 'jungle' ? 'mid' : me.lane;

    // 9. 第一波兵还没出
    if (state.wave === 0) {
      const sec = Math.max(1, Math.ceil(state.nextWaveIn));
      if (jungler) {
        const camp = nearestBuffCamp(state, me);
        if (camp) return { id: 'spawn_wait', priority: 9, key: 'spawn_wait', tone: 'info', text: `小兵 ${sec} 秒后出发，你是打野：先去${MONSTERS[camp.monsterType].name}那儿等着`, pos: camp.pos };
      }
      const spot = laneTowerSpot(state, team, myLane);
      return { id: 'spawn_wait', priority: 9, key: 'spawn_wait', tone: 'info', text: `小兵 ${sec} 秒后出发，先去${towerName(myLane, 1)}等着`, pos: spot ?? undefined };
    }

    // 10. 打野英雄的前期：去打己方半区最近的活营地(还没刷出来就去最先刷的那个等)
    if (jungler && now < LANE_PHASE_END) {
      let best: CampDef | null = null;
      let bd = Infinity;
      let wait: CampDef | null = null;
      let wd = Infinity;
      for (const def of map.camps) {
        if (def.side !== team) continue;
        const cs = campState(state, def.id);
        if (!cs) continue;
        // 上一次指的那个营地多给 6 米的优先，免得两个营地差不多远时来回换
        if (cs.alive) {
          const d = dist(def.pos, me.pos) - (mem.lastKey === `jungle:${def.id}` ? 6 : 0);
          if (d < bd) {
            bd = d;
            best = def;
          }
        } else if (cs.respawnIn > 0 && cs.respawnIn <= 30 && MONSTERS[def.monsterType].alias) {
          // 都还没刷：去最近的增益怪营地等(和引导箭头指的是同一个地方)
          const d = dist(def.pos, me.pos) - (mem.lastKey === `jungle_wait:${def.id}` ? 6 : 0);
          if (d < wd) {
            wd = d;
            wait = def;
          }
        }
      }
      if (best) return { id: 'jungle', priority: 10, key: `jungle:${best.id}`, tone: 'info', text: `打野怪升级：去打${campLabel(best)}`, pos: best.pos };
      if (wait) {
        const cs = campState(state, wait.id);
        return { id: 'jungle', priority: 10, key: `jungle_wait:${wait.id}`, tone: 'info', text: `野怪 ${Math.max(1, Math.ceil(cs ? cs.respawnIn : 1))} 秒后刷新，先去${campLabel(wait)}营地等着`, pos: wait.pos };
      }
    }

    // 11. 后期：队友抱团了，人离得远
    if (now >= LATE_PHASE_START) {
      let a: HeroUnit | null = null;
      let b: HeroUnit | null = null;
      let da = Infinity;
      let db = Infinity;
      for (const h of state.heroes) {
        if (h.team !== team || h.id === me.id || !h.alive) continue;
        const d = d2(h.pos, me.pos);
        if (d < da) {
          b = a;
          db = da;
          a = h;
          da = d;
        } else if (d < db) {
          b = h;
          db = d;
        }
      }
      if (a && b) {
        const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
        if (dist(mid, me.pos) > T.groupDist[was === 'group' ? 1 : 0]) {
          let lane = nearestLane(state, mid);
          // 两条路差不多近时沿用上一次说的那条
          if (was === 'group') {
            const prev = mem.lastKey.slice(6) as LaneId;
            if (LANES.indexOf(prev) >= 0 && prev !== lane && distToPath(mid, map.lanes[prev]) - distToPath(mid, map.lanes[lane]) < 6) lane = prev;
          }
          return { id: 'group', priority: 11, key: `group:${lane}`, tone: 'info', text: `队友在${LANE_NAME[lane]}集合，过去一起推`, pos: mid };
        }
      }
    }

    // 12. 前期：人离自己那一路太远
    if (now < LANE_PHASE_END && !jungler) {
      // 「跑偏」按离兵线的距离算：人先到一塔下等兵、跟着兵压过了一塔、刚复活从基地出门，都还在线上
      const off = distToPath(me.pos, map.lanes[myLane]);
      if (off > T.backDist[was === 'back_to_lane' ? 1 : 0]) {
        // 小地图上指向本路我方最前面的小兵；没有兵就指最靠前的塔
        const foeCorePos = map.bases[foe].core;
        let ref: Vec2 | null = null;
        let rd = Infinity;
        for (const m of s.myMinions) {
          if (m.lane !== myLane) continue;
          const d = d2(m.pos, foeCorePos);
          if (d < rd) {
            rd = d;
            ref = m.pos;
          }
        }
        if (!ref) {
          for (const t of s.myTowers) {
            if (t.lane !== myLane) continue;
            const d = d2(t.pos, foeCorePos);
            if (d < rd) {
              rd = d;
              ref = t.pos;
            }
          }
        }
        return { id: 'back_to_lane', priority: 12, key: 'back_to_lane', tone: 'info', text: `回到${LANE_NAME[myLane]}，跟着小兵打`, pos: ref ?? undefined };
      }
    }

    // 13. 开局两分半：身边有敌方小兵(清光后再留几秒，下一波马上就到)
    if (now < T.farmUntil) {
      const r = T.farmDist[was === 'lane_farm' ? 1 : 0];
      for (const m of s.foeMinions) {
        if (d2(m.pos, me.pos) <= r * r) {
          mem.farmSeenAt = now;
          break;
        }
      }
      if (now - mem.farmSeenAt <= (was === 'lane_farm' ? T.farmLinger : 0)) return { id: 'lane_farm', priority: 13, key: 'lane_farm', tone: 'info', text: '补兵赚钱：给小兵最后一击' };
    }

    // 14. 兜底：推塔
    {
      let lane: LaneId | null = null;
      if (now < LANE_PHASE_END && frontFoeTower(s, myLane)) lane = myLane;
      else {
        const prev = mem.pushLane && frontFoeTower(s, mem.pushLane) ? mem.pushLane : null;
        // 人站在哪条兵线上就推哪一路(上一次说的那一路优先：三路在基地门口挨得很近)
        let bd = 10;
        for (const l of LANES) {
          if (!frontFoeTower(s, l)) continue;
          const d = distToPath(me.pos, map.lanes[l]) - (l === prev ? 4 : 0);
          if (d < bd) {
            bd = d;
            lane = l;
          }
        }
        // 不在任何一条线上(野区、河道、泉水)：沿用上一次说的那一路，穿野区换线的路上不来回改口
        if (!lane) lane = prev;
        // 还没说过：取最近的那座，自己那一路多给 20 米的优先
        if (!lane) {
          bd = Infinity;
          for (const l of LANES) {
            const t = frontFoeTower(s, l);
            if (!t) continue;
            const d = dist(t.pos, me.pos) - (l === myLane ? 20 : 0);
            if (d < bd) {
              bd = d;
              lane = l;
            }
          }
        }
      }
      const t = lane ? frontFoeTower(s, lane) : null;
      if (lane && t) {
        mem.pushLane = lane;
        return { id: 'push_lane', priority: 14, key: `push_lane:${lane}:${t.tier}`, tone: 'info', text: `跟着小兵，推掉敌方${towerName(lane, t.tier)}`, pos: t.pos };
      }
      // 塔都没了：水晶此时一定打得动，正常走不到这里
      return { id: 'push_lane', priority: 14, key: 'push_lane:core', tone: 'info', text: '跟着小兵，去打敌方水晶', pos: map.bases[foe].core };
    }
  }
}

// ───────────────────────── 防抖 ─────────────────────────

export const OBJECTIVE_DEBOUNCE = {
  /** 多久评估一次(秒) */
  interval: 0.5,
  /** 新目标要连续命中这么久才切换 */
  confirm: 1,
  /** 切换后至少停留 */
  minHold: 4,
  /** 警告类条件消失后多久切走 */
  warnLinger: 1.5,
} as const;

const isWarn = (o: Objective): boolean => o.priority <= 3;

/**
 * 把逐次评估的原始结果变成「屏幕上实际显示的那条」。时间用模拟时间(暂停时不走，加速调试时与对局同步)。
 */
export class ObjectiveTracker {
  /** 当前显示的目标 */
  current: Objective | null = null;
  /** 当前目标是什么时候换上来的 */
  private since = -Infinity;
  private pendingKey = '';
  private pendingSince = 0;
  /** 警告条件从什么时候起不再命中；-1 = 仍在命中 */
  private warnGoneAt = -1;

  reset(): void {
    this.current = null;
    this.since = -Infinity;
    this.pendingKey = '';
    this.warnGoneAt = -1;
  }

  /** 喂入一次评估结果；返回这一次是否换了目标(键变了)。只变文字(倒计时)不算换 */
  feed(cand: Objective | null, now: number): boolean {
    const D = OBJECTIVE_DEBOUNCE;
    const cur = this.current;
    if (!cand) {
      const changed = cur !== null;
      this.reset();
      return changed;
    }
    if (!cur) return this.adopt(cand, now);
    if (cand.key === cur.key) {
      // 同一个目标：只刷新文字
      this.current = cand;
      this.pendingKey = '';
      this.warnGoneAt = -1;
      return false;
    }
    if (isWarn(cand)) return this.adopt(cand, now);
    if (isWarn(cur)) {
      if (this.warnGoneAt < 0) this.warnGoneAt = now;
      if (now - this.warnGoneAt >= D.warnLinger - 1e-6) return this.adopt(cand, now);
      return false;
    }
    if (this.pendingKey !== cand.key) {
      this.pendingKey = cand.key;
      this.pendingSince = now;
    }
    if (now - this.pendingSince >= D.confirm - 1e-6 && now - this.since >= D.minHold - 1e-6) return this.adopt(cand, now);
    return false;
  }

  private adopt(o: Objective, now: number): boolean {
    this.current = o;
    this.since = now;
    this.pendingKey = '';
    this.warnGoneAt = -1;
    return true;
  }
}
