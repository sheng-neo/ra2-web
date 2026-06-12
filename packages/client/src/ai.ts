/**
 * 遭遇战 AI（命令驱动，便于将来移进确定性 sim / 回放）。
 *
 * 2.0 升级：① 多种「打法人格」按种子随机抽取——同一张图每局开局/兵种/节奏不同；
 * ② 反应式生产——按侦察到的敌军构成微调（步兵多则提前出攻城车补刀）；
 * ③ 防僵持升级——随时间推移降低开战门槛，后期必然全力一击（也保证 AI 互殴能分胜负）。
 * 核心仍是「稳经济 → 持续造兵 → 攒成波一起压上、滚雪球不回撤」，避免拉锯僵局。
 * 仅读世界状态 + 发命令（确定性，无随机/时钟；人格由构造期种子决定）。
 */
import type { Command, Entity, Player, World } from '@ra2web/game';

const BUILD_ORDER = ['powerplant', 'refinery', 'barracks', 'warfactory'];

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 打法人格。 */
type Personality = 'tank' | 'rusher' | 'turtle' | 'economy';
const PERSONAS: Personality[] = ['tank', 'rusher', 'turtle', 'economy'];

interface PersonaParams {
  /** 攒够多少「闲置」作战单位发起一波。 */
  waveSize: number;
  /** 维持的矿车数。 */
  harvesters: number;
  /** 防御建筑上限。 */
  defenses: number;
  /** 维持的精炼厂数（经济规模）。 */
  refineries: number;
  /** 多少主战坦克后开始补攻城车。 */
  siegeAt: number;
  /** 是否步兵海（廉价兵力压制）。 */
  infantryHeavy: boolean;
}

const PERSONA: Record<Personality, PersonaParams> = {
  // 标准重装：坦克为主，中等节奏
  tank: { waveSize: 6, harvesters: 3, defenses: 1, refineries: 2, siegeAt: 5, infantryHeavy: false },
  // 速攻：极简经济、早出步兵+坦克，小波快压
  rusher: { waveSize: 3, harvesters: 2, defenses: 0, refineries: 1, siegeAt: 99, infantryHeavy: true },
  // 龟缩反推：先经济+多防御，攒大军一波带走
  turtle: { waveSize: 9, harvesters: 3, defenses: 4, refineries: 2, siegeAt: 4, infantryHeavy: false },
  // 暴经济：多矿车多精炼，后期兵力滚雪球
  economy: { waveSize: 8, harvesters: 5, defenses: 2, refineries: 3, siegeAt: 6, infantryHeavy: false },
};

interface DiffParams {
  waveBias: number; // 开战门槛偏移（负=更激进）
  harvBonus: number;
  defBonus: number;
  refBonus: number; // 额外精炼厂（更强经济 → 更快爆兵）
  reacts: boolean; // 是否按敌情反应
}
const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveBias: 4, harvBonus: 0, defBonus: 0, refBonus: 0, reacts: false },
  normal: { waveBias: 0, harvBonus: 0, defBonus: 1, refBonus: 0, reacts: true },
  hard: { waveBias: -1, harvBonus: 1, defBonus: 1, refBonus: 0, reacts: true },
};

export class SimpleAI {
  private readonly persona: Personality;
  private readonly p: PersonaParams;
  private readonly d: DiffParams;
  private readonly harvesters: number;
  private readonly defenses: number;
  private readonly baseWave: number;
  /** 留守家中的最小防守兵力（基地永不空，杜绝被一波偷家平推）。 */
  private readonly garrison: number;
  private engaged = false;

  constructor(
    private readonly playerId: number,
    difficulty: Difficulty = 'normal',
    seed: number = playerId,
    /** 起始留守兵力（出击只派"超出留守"的部分，基地不空，专治人类一波偷家）。
     *  随时间衰减到 0 → 后期全员压上。**默认 0**：AI 互殴（对称）保持原激进度、必分胜负；
     *  仅遭遇战(play.ts)按难度开启 → 不影响 ai.test 的无僵局保证。 */
    homeGuard = 0,
  ) {
    // 人格由种子决定（同种子可复现；play.ts 每局给不同种子 → 每局打法不同）
    this.persona = PERSONAS[((seed >>> 0) + playerId) % PERSONAS.length]!;
    this.p = PERSONA[this.persona];
    this.d = DIFF[difficulty];
    this.harvesters = this.p.harvesters + this.d.harvBonus;
    this.defenses = this.p.defenses + this.d.defBonus;
    this.baseWave = Math.max(2, this.p.waveSize + this.d.waveBias);
    this.garrison = homeGuard;
  }

  /** 调试/展示用：当前人格（英文键）。 */
  get personality(): string {
    return this.persona;
  }

  /** 敌情简报用：人格中文名。 */
  get personaName(): string {
    return { tank: '重装集群', rusher: '速攻流', turtle: '龟缩反推', economy: '暴矿滚雪球' }[this.persona];
  }

  /** 每 15 tick（≈1s）调用一次，返回要应用的命令。 */
  emit(world: World): Command[] {
    const cmds: Command[] = [];
    const player = world.players.get(this.playerId);
    if (!player || player.defeated) return cmds;

    this.manageBuildings(world, player, cmds);
    this.manageProduction(world, player, cmds);
    this.manageArmy(world, cmds);
    return cmds;
  }

  // ——— 建筑：放置就绪项 + 决定下一座 ———
  private manageBuildings(world: World, player: Player, cmds: Command[]): void {
    const queue = world.queueFor(this.playerId, 'building');
    if (queue?.readyToPlace) {
      const typeId = queue.items[0]!;
      const spot = this.findBuildSpot(world, typeId);
      if (spot) cmds.push({ kind: 'place', owner: this.playerId, typeId, cellX: spot.x, cellY: spot.y });
    } else if (!queue || queue.items.length === 0) {
      const next = this.nextBuilding(world, player);
      if (next) world.queueProduction(this.playerId, next);
    }
  }

  // ——— 生产：保矿车 → 持续造兵（按人格/敌情调兵种），步兵与载具并行 ———
  private manageProduction(world: World, player: Player, cmds: Command[]): void {
    const side = player.side;
    if (world.hasBuilding(this.playerId, 'warfactory')) {
      const vq = world.queueFor(this.playerId, 'vehicle');
      if (!vq || vq.items.length === 0) {
        const tank = side === 'soviet' ? 'rhino' : 'grizzly';
        const siege = side === 'soviet' ? 'v3' : 'arty';
        const tanks = this.countUnits(world, tank);
        // 反应式：敌步兵海则提前出攻城车（溅射克步兵）
        let siegeAt = this.p.siegeAt;
        if (this.d.reacts) {
          const comp = this.enemyComposition(world);
          if (comp.infantry > comp.vehicle * 2 + 1) siegeAt = Math.min(siegeAt, 3);
        }
        if (this.countUnits(world, 'harvester') < this.harvesters) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'harvester' });
        } else if (tanks >= siegeAt && this.countUnits(world, siege) < 3) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: siege });
        } else if (tanks >= 3 && this.countUnits(world, 'flaktrak') < 2) {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: 'flaktrak' });
        } else {
          cmds.push({ kind: 'produce', owner: this.playerId, typeId: tank });
        }
      }
    }
    // 步兵与载具并行造（不同队列）。步兵海人格连续补兵，其余兵营空了才补。
    if (world.hasBuilding(this.playerId, 'barracks')) {
      const iq = world.queueFor(this.playerId, 'infantry');
      const inf = side === 'soviet' ? 'conscript' : 'gi';
      const antiArmor = side === 'soviet' ? 'tankbuster' : 'rocketsoldier';
      // 反应式：敌载具多于步兵 → 出反装甲步兵克制坦克
      let pick = inf;
      if (this.d.reacts) {
        const comp = this.enemyComposition(world);
        if (comp.vehicle > comp.infantry) pick = antiArmor;
      }
      if (!iq || iq.items.length === 0) {
        cmds.push({ kind: 'produce', owner: this.playerId, typeId: pick });
        if (this.p.infantryHeavy) cmds.push({ kind: 'produce', owner: this.playerId, typeId: inf });
      }
    }
  }

  // ——— 军队：成军「全军压上」；老家被攻击则全军御敌（不再裸奔被平推）；
  //      兵力被打残则脱离重整、不添油送死；开战门槛随时间衰减保证后期必出击、能分胜负 ———
  private manageArmy(world: World, cmds: Command[]): void {
    const army: Entity[] = [];
    const enemies: Entity[] = [];
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      if (!type) continue;
      if (e.owner === this.playerId) {
        if (type.domain !== 'building' && type.weapon) army.push(e);
      } else if (world.players.has(e.owner)) {
        enemies.push(e);
      }
    }
    if (army.length === 0 || enemies.length === 0) return;

    // 门槛随时间衰减：每 ~45s 降 1，最低 2 —— 后期必然成军出击
    const decay = Math.floor(world.tick / (15 * 45));
    const effWave = Math.max(2, this.baseWave - decay);
    if (army.length >= effWave) this.engaged = true;
    else if (army.length < Math.max(2, effWave >> 1)) this.engaged = false; // 被打残：撤下来重整，不添油

    // 留守兵力（默认 0；遭遇战按难度开启）。基地永远留这么多防守，其余出击。
    const effGarrison = this.garrison;
    const ids = army.map((e) => e.id);
    const home = this.baseCentroid(world);
    const threat = this.nearestThreatToBase(world, enemies); // 老家是否被敌方单位逼近
    if (threat !== null) {
      // 老家受袭：离家最近的约 1/3 回防迎敌（响应最快），2/3 继续推进
      // （保持攻势，避免双方全员回防→僵局）；兵少则全员御敌保命。
      if (this.engaged && home && army.length >= 6) {
        const sorted = this.byDistToHome(army, home);
        const d = Math.max(1, Math.floor(sorted.length / 3));
        cmds.push({ kind: 'attack', entityIds: sorted.slice(0, d).map((e) => e.id), targetId: threat });
        const t = this.pickTarget(world, enemies, this.centroid(army));
        if (t !== null) cmds.push({ kind: 'attack', entityIds: sorted.slice(d).map((e) => e.id), targetId: t });
      } else {
        cmds.push({ kind: 'attack', entityIds: ids, targetId: threat });
      }
      return;
    }

    if (!this.engaged) return; // 重整/攒兵中：留在家（个体警戒自卫）
    const target = this.pickTarget(world, enemies, this.centroid(army));
    if (target === null) return;
    // 出击：离家最近的 effGarrison 个留守（基地不空，杜绝被偷家平推），其余压上
    if (army.length <= effGarrison) return;
    const attackers = home && effGarrison > 0 ? this.byDistToHome(army, home).slice(effGarrison).map((e) => e.id) : ids;
    if (attackers.length > 0) cmds.push({ kind: 'attack', entityIds: attackers, targetId: target });
  }

  /** 按到家距离升序（近家在前；整数距离平方，确定性）。 */
  private byDistToHome(army: Entity[], home: { x: number; y: number }): Entity[] {
    return [...army].sort((a, b) => {
      const da = (a.cellX - home.x) * (a.cellX - home.x) + (a.cellY - home.y) * (a.cellY - home.y);
      const db = (b.cellX - home.x) * (b.cellX - home.x) + (b.cellY - home.y) * (b.cellY - home.y);
      return da - db;
    });
  }

  /** 我方建筑质心（出击留守判定的「家」）。 */
  private baseCentroid(world: World): { x: number; y: number } | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        sx += e.cellX;
        sy += e.cellY;
        n++;
      }
    }
    return n === 0 ? null : { x: Math.round(sx / n), y: Math.round(sy / n) };
  }

  /** 老家威胁：返回最逼近我方建筑（≤12 格）的敌方非建筑单位 id，否则 null。 */
  private nearestThreatToBase(world: World, enemies: Entity[]): number | null {
    const buildings: Entity[] = [];
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') buildings.push(e);
    }
    if (buildings.length === 0) return null;
    let best: number | null = null;
    let bestD = 12 * 12;
    for (const e of enemies) {
      if (world.rules.units.get(e.typeId)?.domain === 'building') continue;
      for (const b of buildings) {
        const dx = e.cellX - b.cellX;
        const dy = e.cellY - b.cellY;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = e.id;
        }
      }
    }
    return best;
  }

  /** 选攻击目标：离主力最近的敌方建筑（逐步推平到老家），无建筑则打最近敌方单位。 */
  private pickTarget(world: World, enemies: Entity[], from: { x: number; y: number }): number | null {
    const buildings = enemies.filter((e) => world.rules.units.get(e.typeId)?.domain === 'building');
    const nb = this.nearest(buildings, from);
    if (nb) return nb.id;
    const nu = this.nearest(enemies, from);
    return nu ? nu.id : null;
  }

  /** 侦察敌军构成（步兵 / 载具数量；仅非建筑）。casual 取全局，反应更明显。 */
  private enemyComposition(world: World): { infantry: number; vehicle: number } {
    let infantry = 0;
    let vehicle = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId || !world.players.has(e.owner)) continue;
      const dom = world.rules.units.get(e.typeId)?.domain;
      if (dom === 'infantry') infantry++;
      else if (dom === 'vehicle') vehicle++;
    }
    return { infantry, vehicle };
  }

  private nearest(list: Entity[], from: { x: number; y: number }): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of list) {
      const dx = e.cellX - from.x;
      const dy = e.cellY - from.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private centroid(list: Entity[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const e of list) {
      sx += e.cellX;
      sy += e.cellY;
    }
    return { x: Math.round(sx / list.length), y: Math.round(sy / list.length) };
  }

  private countUnits(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) if (e.owner === this.playerId && e.typeId === typeId) n++;
    return n;
  }

  private countBuildings(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && e.typeId === typeId && world.rules.units.get(e.typeId)?.domain === 'building') n++;
    }
    return n;
  }

  /** 决定下一座建筑：保电 → 科技链 → 扩经济（按人格精炼厂数）→ 防御（按人格上限）→ 多电托底。 */
  private nextBuilding(world: World, player: Player): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    if (player.powerDrained > player.powerProduced - 20 && has('powerplant')) return 'powerplant';
    for (const id of BUILD_ORDER) if (!has(id)) return id;
    if (this.countBuildings(world, 'refinery') < this.p.refineries + this.d.refBonus) return 'refinery';
    // 注：AI 暂不自建作战实验室/高级单位——实测会拖慢节奏致某些人格对阵僵持；
    // 高级单位作为玩家科技奖励先开放，AI 用法待平衡调好再开（见 prism/apocalypse）。
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < this.defenses) {
      return player.powerProduced > player.powerDrained + 150 ? 'tesla' : 'pillbox';
    }
    // 反应式加固：基地被攻击时超出常规上限再补 1–2 座防御（靠建筑顶住，不退兵 → 不破坏滚雪球）
    if (this.d.reacts && this.baseUnderAttack(world)) {
      const def = this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox');
      if (def < this.defenses + 2) return player.powerProduced > player.powerDrained + 120 ? 'tesla' : 'pillbox';
    }
    if (player.powerDrained > player.powerProduced - 50) return 'powerplant';
    return null;
  }

  /** 是否有敌方非建筑单位逼近我方任一建筑（~8 格内）——用于反应式加固。 */
  private baseUnderAttack(world: World): boolean {
    const buildings: Entity[] = [];
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') buildings.push(e);
    }
    if (buildings.length === 0) return false;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId || !world.players.has(e.owner)) continue;
      if (world.rules.units.get(e.typeId)?.domain === 'building') continue;
      for (const b of buildings) {
        const dx = e.cellX - b.cellX;
        const dy = e.cellY - b.cellY;
        if (dx * dx + dy * dy <= 64) return true;
      }
    }
    return false;
  }

  private findBuildSpot(world: World, typeId: string): { x: number; y: number } | null {
    const type = world.rules.units.get(typeId);
    if (!type) return null;
    let anchor: { x: number; y: number } | null = null;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        anchor = { x: e.cellX, y: e.cellY };
        break;
      }
    }
    if (!anchor) return null;
    for (let r = 2; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = anchor.x + dx;
          const y = anchor.y + dy;
          if (world.canPlace(this.playerId, type, x, y)) return { x, y };
        }
      }
    }
    return null;
  }
}
