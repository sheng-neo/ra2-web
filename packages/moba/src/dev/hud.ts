/**
 * HUD 画廊（仅开发用）：/dev/hud.html?…
 *
 *   hero=chijin|panyue|xingli|fengling|yeque   玩家英雄
 *   touch=1 | kbm=1         强制触控 / 键鼠布局（缺省自动识别）
 *   shop=1 | scoreboard=1 | settings=1 | dead=1     直达对应状态
 *   banner=<AnnounceKey>    每隔几秒重播该播报（如 penta_kill / ace / tower_destroyed / epic_slain）；&foe=1 换成敌方触发
 *   state=lowhp|nomana|cc|fresh|rich|buffs|full      预置玩家状态
 *   events=0                关闭定时注入的演示事件
 *   freeze=1                不推进时间（静态截图）
 *   tips=0                  不显示开局操作提示条
 *   log=0                   隐藏左侧的命令日志浮层
 *   bg=dark                 纯深色背景（缺省画一个 2D 俯视的假战场，亮度接近真实画面，便于检查对比度）
 *   real=1                  用真实渲染层(../render)代替假战场
 *   sim=1                   用真实模拟内核(../core/world)代替假推进器
 *   audio=1                 用真实音频层（缺省为只记日志的桩）
 *
 * 宿主(HudHost)是桩：收到的每条命令 / setAim / 镜头观察 / 暂停 / 音效都记进页面角落的日志浮层，
 * 同时挂在 window.__hud 上（cmds / aims / peeks / calls / perf / state / hud），供脚本验证输入。
 */
import type { AudioEngine } from '../audio/api';
import { HEROES, SUMMONER, heroStatsAt, skillLevelsAt } from '../core/data/heroes';
import { ITEMS, SELL_RATIO } from '../core/data/items';
import { xpToNext } from '../core/data/units';
import { createMockState } from '../core/mock';
import type {
  AnnounceKey, Buff, BuffId, GameEvent, GameState, HeroId, HeroUnit, ItemId, MatchConfig, PlayerCommand, PlayerTeam, Polygon, Vec2, World,
} from '../core/types';
import type { AimIndicator, GameRenderer, RendererOptions } from '../render/api';
import type { HudHost, Settings } from '../ui/api';
import { DEFAULT_SETTINGS } from '../ui/api';
import { createHud } from '../ui/index';
import type { HudHandle } from '../ui/index';

const params = new URLSearchParams(location.search);
const flag = (k: string): boolean => params.get(k) === '1';
const app = document.getElementById('app') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const logEl = document.getElementById('hudlog') as HTMLElement;
const isHero = (v: string | null): v is HeroId => v !== null && v in HEROES;
const heroId: HeroId = isHero(params.get('hero')) ? (params.get('hero') as HeroId) : 'chijin';
const preset = params.get('state') ?? '';
const frozen = flag('freeze');

// ───────────────────────── 测试钩子与日志 ─────────────────────────

interface Hooks {
  cmds: PlayerCommand[];
  aims: (AimIndicator | null)[];
  peeks: (Vec2 | null)[];
  calls: string[];
  perf: { frames: number; updateMs: number; updateMax: number; eventsMs: number; avg(): number };
  state: GameState | null;
  hud: HudHandle | null;
  /** 世界坐标 → 屏幕坐标（脚本用它找单位在屏幕上的位置） */
  w2s: ((p: Vec2) => { x: number; y: number; visible: boolean }) | null;
}
const hooks: Hooks = {
  cmds: [],
  aims: [],
  peeks: [],
  calls: [],
  perf: {
    frames: 0,
    updateMs: 0,
    updateMax: 0,
    eventsMs: 0,
    avg() {
      return this.frames > 0 ? (this.updateMs + this.eventsMs) / this.frames : 0;
    },
  },
  state: null,
  hud: null,
  w2s: null,
};
(window as unknown as { __hud: Hooks }).__hud = hooks;

const logLines: string[] = [];
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const v2 = (v: Vec2): string => `(${f1(v.x)},${f1(v.y)})`;
function log(line: string): void {
  logLines.push(line);
  if (logLines.length > 7) logLines.shift();
}
function describeCmd(c: PlayerCommand): string {
  switch (c.type) {
    case 'move':
      return `move ${v2(c.dir)}`;
    case 'moveTo':
      return `moveTo ${v2(c.pos)}`;
    case 'attack':
      return `attack${c.targetId !== undefined ? ` #${c.targetId}` : ''}`;
    case 'cast':
      return `cast ${c.slot}${c.dir ? ` dir${v2(c.dir)}` : ''}${c.pos ? ` pos${v2(c.pos)}` : ''}${c.targetId !== undefined ? ` #${c.targetId}` : ''}`;
    case 'buy':
      return `buy ${c.itemId}`;
    case 'sell':
      return `sell [${c.index}]`;
    default:
      return 'stop';
  }
}
if (params.get('log') === '0') logEl.style.display = 'none';

// ───────────────────────── 假推进器 ─────────────────────────

interface Driver {
  state: GameState;
  command(cmd: PlayerCommand): void;
  /** 推进 dt 秒，返回这段时间产生的事件 */
  step(dt: number): GameEvent[];
}

function createMockDriver(): Driver {
  const state = createMockState(heroId);
  const me = state.heroes[0];
  const def = HEROES[heroId];
  const out: GameEvent[] = [];
  const foes = state.heroes.filter((x) => x.team === 1);
  const allies = state.heroes.filter((x) => x.team === 0 && x !== me);
  let moveDir: Vec2 = { x: 0, y: 0 };
  let moveTarget: Vec2 | null = null;
  let hitTimer = 2;
  let cashTimer = 1.5;
  let scriptTimer = 2.2;
  let scriptStep = 0;
  let firstBlood = true;

  const buff = (id: BuffId, duration: number, value = 0, stacks = 1): Buff => ({ id, sourceId: -1, timeLeft: duration, duration, stacks, value });
  const addBuff = (h: HeroUnit, b: Buff): void => {
    h.buffs = h.buffs.filter((x) => x.id !== b.id);
    h.buffs.push(b);
    if (b.id === 'shield') h.shield = b.value;
  };

  function applyLevel(h: HeroUnit, level: number): void {
    const hd = HEROES[h.heroId];
    const ratioHp = h.hp / h.stats.maxHp;
    const ratioMp = h.mana / Math.max(1, h.stats.maxMana);
    h.level = level;
    h.stats = heroStatsAt(hd, level);
    for (const id of h.items) {
      if (!id) continue;
      const s = ITEMS[id].stats;
      h.stats.maxHp += s.hp ?? 0;
      h.stats.maxMana += s.mana ?? 0;
      h.stats.ad += s.ad ?? 0;
      h.stats.ap += s.ap ?? 0;
      h.stats.armor += s.armor ?? 0;
      h.stats.mr += s.mr ?? 0;
      h.stats.moveSpeed += s.moveSpeed ?? 0;
      h.stats.cdr = Math.min(0.4, h.stats.cdr + (s.cdr ?? 0));
      h.stats.lifesteal += s.lifesteal ?? 0;
      h.stats.critChance += s.critChance ?? 0;
      h.stats.armorPen += s.armorPen ?? 0;
      h.stats.magicPen += s.magicPen ?? 0;
      h.stats.attackSpeed *= 1 + (s.attackSpeedPct ?? 0);
    }
    h.hp = h.stats.maxHp * ratioHp;
    h.mana = h.stats.maxMana * ratioMp;
    h.xpToNext = xpToNext(level);
    const sl = skillLevelsAt(level);
    for (const slot of ['s1', 's2', 'ult'] as const) {
      h.skills[slot].level = sl[slot];
      const sd = hd.skills[slot];
      h.skills[slot].cost = sl[slot] > 0 ? sd.manaCost[sl[slot] - 1] : sd.manaCost[0];
    }
  }

  // ── 预置状态 ──
  applyLevel(me, me.level);
  if (preset === 'fresh') {
    me.items = [null, null, null, null, null, null];
    applyLevel(me, 1);
    me.gold = 300;
    me.xp = 0;
    me.kills = me.deaths = me.assists = me.cs = 0;
    state.time = 4;
    state.teams[0].kills = state.teams[1].kills = 0;
    state.teams[0].towersDestroyed = 0;
    for (const s of Object.values(me.skills)) s.cd = 0;
    me.hp = me.stats.maxHp;
    me.mana = me.stats.maxMana;
  } else if (preset === 'rich') {
    me.gold = 6800;
  } else if (preset === 'full') {
    me.items = def.build.filter((id) => id !== 'boots').slice(0, 6);
    applyLevel(me, 15);
    me.gold = 2400;
  } else if (preset === 'lowhp') {
    me.hp = me.stats.maxHp * 0.16;
  } else if (preset === 'nomana') {
    me.mana = 12;
  } else if (preset === 'cc') {
    addBuff(me, buff('stun', 600));
  } else if (preset === 'buffs') {
    const ids: [BuffId, number, number, number][] = [
      ['shield', 4, 480, 1], ['haste', 6, 0.2, 1], ['attack_speed', 5, 0.4, 1], ['frost_insight', 70, 0, 1], ['ember_might', 55, 0, 1], ['star_blessing', 80, 0, 1],
      ['slow', 3, 0.35, 1], ['burn', 4, 26, 1], ['tower_focus', 5, 0, 3], ['xingli_mark', 5, 0, 2],
    ];
    for (const [id, d, v, s] of ids) addBuff(me, buff(id, d * 20, v, s));
  }
  // 给玩家挂一个英雄专属计数状态，便于看层数角标
  if (preset !== 'fresh' && preset !== 'buffs') {
    if (heroId === 'fengling') addBuff(me, buff('fengling_gale', 600, 0, 4));
    else if (heroId === 'panyue') addBuff(me, buff('panyue_passive', 600, 0, 2));
    else if (heroId === 'chijin') addBuff(me, buff('chijin_ember', 600));
  }
  // 两个营地设为已清，展示刷新倒计时
  state.camps[2] = { campId: 2, alive: false, respawnIn: 34 };
  state.camps[12] = { campId: 12, alive: false, respawnIn: 95 };
  state.units = state.units.filter((u) => !(u.kind === 'monster' && (u.campId === 2 || u.campId === 12)));
  state.config = { seed: 1, playerHero: heroId, difficulty: 'normal' } satisfies MatchConfig;

  function kill(killer: HeroUnit | null, victim: HeroUnit, assists: HeroUnit[], key: AnnounceKey | null, multi = 1, streak = 1): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawnIn = 6 + victim.level * 1.5;
    victim.anim = 'dead';
    victim.deaths++;
    victim.buffs = [];
    victim.shield = 0;
    const team: PlayerTeam = victim.team === 0 ? 1 : 0;
    state.teams[team].kills++;
    if (killer) {
      killer.kills++;
      killer.gold += 220;
      killer.goldEarned += 220;
    }
    for (const a of assists) a.assists++;
    const fb = firstBlood && key === 'first_blood';
    if (fb) firstBlood = false;
    out.push({ type: 'heroKill', victimId: victim.id, killerId: killer ? killer.id : pickTower(team), assistIds: assists.map((a) => a.id), multiKill: multi, streak, firstBlood: fb, shutdown: key === 'shutdown', bounty: 220 });
    if (killer && key) out.push({ type: 'announce', key, team: killer.team, unitId: killer.id, victimId: victim.id });
  }
  function pickTower(team: PlayerTeam): number {
    const t = state.units.find((u) => u.kind === 'tower' && u.team === team);
    return t ? t.id : -1;
  }
  function destroyTower(byTeam: PlayerTeam, by: HeroUnit | null): void {
    const t = state.units.find((u) => u.kind === 'tower' && u.team !== byTeam && u.alive && (u.tier === 1 || !state.units.some((o) => o.kind === 'tower' && o.team === u.team && o.lane === u.lane && o.tier === u.tier - 1)));
    if (!t || t.kind !== 'tower') return;
    state.units = state.units.filter((u) => u !== t);
    state.teams[byTeam].towersDestroyed++;
    out.push({ type: 'towerDestroyed', unitId: t.id, team: t.team, lane: t.lane, tier: t.tier, pos: { ...t.pos } });
    out.push({ type: 'announce', key: 'tower_destroyed', team: byTeam, unitId: by ? by.id : undefined });
  }

  /** 按播报键造一组配套事件（?banner= 与定时脚本共用）。foe = 由敌方触发 */
  function emitFor(key: AnnounceKey, foe: boolean): void {
    const mine = foe ? foes[1] : me;
    const victim = (foe ? [me, ...allies] : foes).find((x) => x.alive) ?? (foe ? allies[0] : foes[0]);
    const helpers = foe ? [foes[2]] : [allies[0], allies[2]];
    const team: PlayerTeam = foe ? 1 : 0;
    switch (key) {
      case 'first_blood':
        firstBlood = true;
        kill(mine, victim, helpers, key);
        break;
      case 'double_kill':
        kill(mine, victim, helpers, key, 2, 2);
        break;
      case 'triple_kill':
        kill(mine, victim, helpers, key, 3, 3);
        break;
      case 'quadra_kill':
        kill(mine, victim, helpers, key, 4, 4);
        break;
      case 'penta_kill':
        kill(mine, victim, helpers, key, 5, 5);
        break;
      case 'killing_spree':
        kill(mine, victim, [], key, 1, 3);
        break;
      case 'unstoppable':
        kill(mine, victim, [], key, 1, 5);
        break;
      case 'legendary':
        kill(mine, victim, helpers, key, 1, 8);
        break;
      case 'shutdown':
        kill(mine, victim, helpers, key, 1, 1);
        break;
      case 'ace':
        out.push({ type: 'announce', key, team, unitId: mine.id });
        break;
      case 'tower_destroyed':
        destroyTower(team, mine);
        break;
      case 'epic_spawn':
        out.push({ type: 'monsterSpawn', campId: 12, monsterType: 'abyss_drake', pos: { x: -24, y: -24 } });
        out.push({ type: 'announce', key, team: 2 });
        break;
      case 'epic_slain':
        out.push({ type: 'epicSlain', monsterType: 'star_colossus', team, pos: { x: 24, y: 24 } });
        out.push({ type: 'announce', key, team, unitId: mine.id });
        break;
      case 'victory':
      case 'defeat':
        out.push({ type: 'announce', key, team: key === 'victory' ? 0 : 1 });
        break;
      default:
        out.push({ type: 'announce', key, team: key === 'super_minions' ? team : 2 });
        break;
    }
  }

  const bannerKey = params.get('banner') as AnnounceKey | null;
  const script: (() => void)[] = [
    () => kill(allies[0], foes[1], [me, allies[1]], null),
    () => addBuff(me, buff('haste', 5, 0.2)),
    () => emitFor('first_blood', false),
    () => kill(foes[2], allies[1], [foes[0]], null),
    () => out.push({ type: 'gold', unitId: me.id, amount: 42, pos: { ...me.pos }, reason: 'lasthit' }),
    () => emitFor('tower_destroyed', false),
    () => emitFor('double_kill', false),
    () => addBuff(me, buff('shield', 4, 420)),
    () => emitFor('epic_spawn', false),
    () => emitFor('shutdown', true),
    () => emitFor('triple_kill', false),
    () => addBuff(me, buff('slow', 2.5, 0.3)),
    () => emitFor('epic_slain', true),
    () => emitFor('tower_destroyed', true),
    () => kill(null, allies[2], [], null),
    () => emitFor('ace', false),
    () => emitFor('legendary', false),
    () => emitFor('super_minions', false),
    () => kill(foes[3], me, [foes[0], foes[2]], null),
    () => emitFor('penta_kill', false),
  ];

  if (flag('dead')) {
    kill(foes[4].alive ? foes[4] : foes[0], me, [foes[1], foes[2]], null);
    me.respawnIn = 23;
  }

  const reject = (reason: Extract<GameEvent, { type: 'reject' }>['reason']): void => {
    out.push({ type: 'reject', unitId: me.id, reason });
  };

  function command(cmd: PlayerCommand): void {
    if (!me.alive && cmd.type !== 'buy' && cmd.type !== 'sell') return;
    switch (cmd.type) {
      case 'move':
        moveDir = { ...cmd.dir };
        moveTarget = null;
        if (cmd.dir.x !== 0 || cmd.dir.y !== 0) me.buffs = me.buffs.filter((b) => b.id !== 'recall');
        break;
      case 'moveTo':
        moveTarget = { ...cmd.pos };
        moveDir = { x: 0, y: 0 };
        me.buffs = me.buffs.filter((b) => b.id !== 'recall');
        break;
      case 'stop':
        moveDir = { x: 0, y: 0 };
        moveTarget = null;
        break;
      case 'attack':
        me.anim = 'attack';
        me.animStart = state.time;
        me.animDur = 0.6;
        if (cmd.targetId !== undefined) me.targetId = cmd.targetId;
        break;
      case 'cast': {
        const sk = me.skills[cmd.slot];
        if (me.buffs.some((b) => b.id === 'stun' || b.id === 'airborne' || b.id === 'silence')) return reject('disabled');
        if (sk.cd > 0) return reject('cooldown');
        if (me.mana < sk.cost) return reject('mana');
        if (cmd.slot === 's1' || cmd.slot === 's2' || cmd.slot === 'ult') {
          const sd = def.skills[cmd.slot];
          if (sd.cast.type === 'target' && cmd.targetId === undefined) {
            const range = sd.cast.range;
            const near = foes.find((f) => f.alive && Math.hypot(f.pos.x - me.pos.x, f.pos.y - me.pos.y) <= range + 1);
            if (!near) return reject('no_target');
          }
          sk.cdMax = sd.cooldown[Math.max(0, sk.level - 1)] * (1 - me.stats.cdr);
          sk.cd = sk.cdMax;
          me.mana -= sk.cost;
          me.anim = cmd.slot === 's1' ? 'cast_s1' : cmd.slot === 's2' ? 'cast_s2' : 'cast_ult';
        } else if (cmd.slot === 'flash') {
          const d = cmd.dir ?? { x: Math.cos(me.facing), y: Math.sin(me.facing) };
          me.pos = { x: me.pos.x + d.x * SUMMONER.flash.range, y: me.pos.y + d.y * SUMMONER.flash.range };
          me.prevPos = { ...me.pos };
          sk.cdMax = sk.cd = SUMMONER.flash.cooldown;
        } else if (cmd.slot === 'heal') {
          addBuff(me, buff('restore', SUMMONER.heal.duration));
          sk.cdMax = sk.cd = SUMMONER.heal.cooldown;
        } else {
          addBuff(me, buff('recall', SUMMONER.recall.channel));
          moveDir = { x: 0, y: 0 };
          moveTarget = null;
        }
        break;
      }
      case 'buy': {
        // 与 core/hero.ts 的 buyItem 同一套规则
        const it = ITEMS[cmd.itemId];
        let cost = it.cost;
        let slot = -1;
        if (it.category === 'boots') {
          const owned = me.items.findIndex((id) => id !== null && ITEMS[id].category === 'boots');
          if (owned >= 0) {
            const old = ITEMS[me.items[owned] as ItemId];
            if (it.tier === 1 || old.id === it.id) return reject('full');
            slot = owned;
            cost -= Math.floor(old.cost * SELL_RATIO);
          }
        }
        if (slot < 0) slot = me.items.indexOf(null);
        if (slot < 0) return reject('full');
        if (me.gold < cost) return reject('gold');
        me.gold -= cost;
        me.items[slot] = cmd.itemId;
        applyLevel(me, me.level);
        out.push({ type: 'itemBought', unitId: me.id, itemId: cmd.itemId });
        break;
      }
      case 'sell': {
        const id = me.items[cmd.index];
        if (!id) return;
        me.gold += Math.floor(ITEMS[id].cost * SELL_RATIO);
        me.items[cmd.index] = null;
        applyLevel(me, me.level);
        break;
      }
      default:
        break;
    }
  }

  function step(dt: number): GameEvent[] {
    if (frozen) dt = 0;
    state.time += dt;
    state.tick = Math.floor(state.time * 30);
    state.nextWaveIn -= dt;
    if (state.nextWaveIn <= 0) {
      state.nextWaveIn += 30;
      state.wave++;
      out.push({ type: 'waveSpawn', wave: state.wave });
    }
    for (const c of state.camps) {
      if (!c.alive) {
        c.respawnIn -= dt;
        if (c.respawnIn <= 0) {
          c.alive = true;
          c.respawnIn = 0;
        }
      }
    }
    for (const h of state.heroes) {
      for (const s of Object.values(h.skills)) s.cd = Math.max(0, s.cd - dt);
      if (!h.alive) {
        h.respawnIn -= dt;
        if (h === me && flag('dead') && h.respawnIn < 4) h.respawnIn = 23;
        if (h.respawnIn <= 0) {
          h.alive = true;
          h.respawnIn = 0;
          h.hp = h.stats.maxHp;
          h.mana = h.stats.maxMana;
          h.anim = 'idle';
          out.push({ type: 'respawn', unitId: h.id, pos: { ...h.pos } });
        }
        continue;
      }
      for (let i = h.buffs.length - 1; i >= 0; i--) {
        const b = h.buffs[i];
        b.timeLeft -= dt;
        if (b.timeLeft > 0) continue;
        h.buffs.splice(i, 1);
        if (b.id === 'shield') h.shield = 0;
        if (b.id === 'recall' && h === me) {
          const f = state.map.bases[0].fountain;
          me.pos = { x: f.x, y: f.y };
          me.prevPos = { ...me.pos };
        }
      }
    }
    if (me.alive) {
      // 移动
      const speed = me.stats.moveSpeed;
      me.prevPos = { ...me.pos };
      if (moveTarget) {
        const dx = moveTarget.x - me.pos.x;
        const dy = moveTarget.y - me.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < speed * dt + 0.05) {
          me.pos = { ...moveTarget };
          moveTarget = null;
        } else {
          me.pos = { x: me.pos.x + (dx / d) * speed * dt, y: me.pos.y + (dy / d) * speed * dt };
          me.facing = Math.atan2(dy, dx);
        }
      } else if (moveDir.x !== 0 || moveDir.y !== 0) {
        me.pos = { x: me.pos.x + moveDir.x * speed * dt, y: me.pos.y + moveDir.y * speed * dt };
        me.facing = Math.atan2(moveDir.y, moveDir.x);
      }
      const b = state.map.bound;
      me.pos.x = Math.max(-b, Math.min(b, me.pos.x));
      me.pos.y = Math.max(-b, Math.min(b, me.pos.y));
      me.anim = moveTarget || moveDir.x !== 0 || moveDir.y !== 0 ? 'move' : 'idle';

      // 回复与挨打
      const healing = me.buffs.some((x) => x.id === 'restore');
      me.hp = Math.min(me.stats.maxHp, me.hp + (me.stats.hpRegen + (healing ? me.stats.maxHp * 0.06 : 0)) * dt * 3);
      me.mana = Math.min(me.stats.maxMana, me.mana + (me.stats.manaRegen + (healing ? me.stats.maxMana * 0.06 : 0)) * dt * (preset === 'nomana' ? 0 : 3));
      hitTimer -= dt;
      if (hitTimer <= 0 && preset !== 'lowhp' && params.get('events') !== '0') {
        hitTimer = 2.4 + Math.random() * 1.5;
        let dmg = 120 + Math.random() * 260;
        const absorbed = Math.min(me.shield, dmg);
        me.shield -= absorbed;
        const sb = me.buffs.find((x) => x.id === 'shield');
        if (sb) sb.value = me.shield;
        dmg -= absorbed;
        me.hp = Math.max(me.stats.maxHp * 0.12, me.hp - dmg);
        me.lastHitTime = state.time;
        out.push({ type: 'damage', targetId: me.id, sourceId: foes[0].id, amount: dmg + absorbed, dtype: 'physical', crit: false, pos: { ...me.pos }, skill: false });
      }
      // 经济与成长
      me.gold += 2.6 * dt;
      me.goldEarned += 2.6 * dt;
      cashTimer -= dt;
      if (cashTimer <= 0 && params.get('events') !== '0') {
        cashTimer = 3.1;
        me.gold += 42;
        me.goldEarned += 42;
        me.cs++;
        out.push({ type: 'gold', unitId: me.id, amount: 42, pos: { ...me.pos }, reason: 'lasthit' });
      }
      if (me.level < 15) {
        me.xp += 34 * dt;
        if (me.xp >= me.xpToNext) {
          me.xp -= me.xpToNext;
          applyLevel(me, me.level + 1);
          out.push({ type: 'levelUp', unitId: me.id, level: me.level });
        }
      }
    }
    // 其余英雄原地小范围踱步，让小地图有点动静
    state.heroes.forEach((h, i) => {
      if (h === me || !h.alive) return;
      const a = state.time * 0.5 + i * 1.7;
      h.prevPos = { ...h.pos };
      h.pos = { x: h.pos.x + Math.cos(a) * 0.9 * dt, y: h.pos.y + Math.sin(a * 1.3) * 0.9 * dt };
      h.facing = a;
    });

    if (params.get('events') !== '0' && !frozen) {
      scriptTimer -= dt;
      if (scriptTimer <= 0) {
        if (bannerKey) {
          scriptTimer = 4.2;
          emitFor(bannerKey, flag('foe'));
        } else {
          scriptTimer = 3.4;
          script[scriptStep % script.length]();
          scriptStep++;
        }
      }
    }
    return out.splice(0, out.length);
  }

  if (bannerKey) scriptTimer = 0.4;
  return { state, command, step };
}

// ───────────────────────── 真实模拟内核（?sim=1） ─────────────────────────

interface WorldModule {
  createWorld?: (config: MatchConfig) => World;
}

async function createSimDriver(): Promise<Driver | null> {
  const loaders = import.meta.glob('../core/world.ts');
  const load = Object.values(loaders)[0];
  if (!load) return null;
  try {
    const mod = (await load()) as WorldModule;
    if (!mod.createWorld) return null;
    const world = mod.createWorld({ seed: Number(params.get('seed') ?? 7), playerHero: heroId, difficulty: 'normal', autoPlay: flag('auto') });
    let acc = 0;
    const TICK = 1 / 30;
    return {
      state: world.state,
      command: (cmd) => world.command(world.state.playerId, cmd),
      step(dt) {
        acc += Math.min(dt, 0.25) * Number(params.get('speed') ?? 1);
        const events: GameEvent[] = [];
        while (acc >= TICK && !world.state.over) {
          acc -= TICK;
          world.step();
          for (const e of world.drainEvents()) events.push(e);
        }
        return events;
      },
    };
  } catch (err) {
    console.info('[hud-gallery] 模拟内核加载失败，改用假推进器：', err);
    return null;
  }
}

// ───────────────────────── 假战场（2D 俯视） ─────────────────────────

interface Field {
  draw(state: GameState): void;
  screenToGround(x: number, y: number): Vec2 | null;
  worldToScreen(p: Vec2, height?: number): { x: number; y: number; visible: boolean };
  pickUnit(x: number, y: number, state: GameState): number;
  setPeek(p: Vec2 | null): void;
  setAim(a: AimIndicator | null): void;
}

function createFakeField(getState: () => GameState): Field {
  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const dark = params.get('bg') === 'dark';
  let W = 1;
  let H = 1;
  let dpr = 1;
  let scale = 20;
  let cx = 0;
  let cy = 0;
  let peek: Vec2 | null = null;
  let aim: AimIndicator | null = null;

  function resize(): void {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // 可视纵深约 28 米（竖屏按宽度算，免得两侧太窄）
    scale = Math.max(H / 28, W / 44);
  }
  resize();
  window.addEventListener('resize', resize);

  const sx = (x: number): number => (x - cx) * scale + W / 2;
  const sy = (y: number): number => (y - cy) * scale + H * 0.46;
  const poly = (p: Polygon): void => {
    g.beginPath();
    p.forEach((v, i) => (i === 0 ? g.moveTo(sx(v.x), sy(v.y)) : g.lineTo(sx(v.x), sy(v.y))));
    g.closePath();
  };
  const line = (p: Vec2[]): void => {
    g.beginPath();
    p.forEach((v, i) => (i === 0 ? g.moveTo(sx(v.x), sy(v.y)) : g.lineTo(sx(v.x), sy(v.y))));
  };
  const TEAM = ['#4da3ff', '#ff5d5d', '#e2cf7a'];

  function drawAim(me: HeroUnit): void {
    if (!aim) return;
    const col = aim.cancel ? '255, 80, 80' : '92, 214, 247';
    const ox = sx(me.pos.x);
    const oy = sy(me.pos.y);
    g.lineWidth = 2;
    g.strokeStyle = `rgba(${col}, 0.9)`;
    g.fillStyle = `rgba(${col}, 0.22)`;
    const ring = (x: number, y: number, r: number, fill: boolean): void => {
      g.beginPath();
      g.arc(x, y, r * scale, 0, Math.PI * 2);
      if (fill) g.fill();
      g.stroke();
    };
    switch (aim.kind) {
      case 'direction': {
        const a = Math.atan2(aim.dir.y, aim.dir.x);
        g.save();
        g.translate(ox, oy);
        g.rotate(a);
        g.fillRect(0, (-aim.width / 2) * scale, aim.range * scale, aim.width * scale);
        g.strokeRect(0, (-aim.width / 2) * scale, aim.range * scale, aim.width * scale);
        g.restore();
        break;
      }
      case 'cone': {
        const a = Math.atan2(aim.dir.y, aim.dir.x);
        g.beginPath();
        g.moveTo(ox, oy);
        g.arc(ox, oy, aim.range * scale, a - aim.angle / 2, a + aim.angle / 2);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      case 'position':
        g.setLineDash([6, 6]);
        ring(ox, oy, aim.range, false);
        g.setLineDash([]);
        ring(sx(aim.pos.x), sy(aim.pos.y), aim.radius, true);
        break;
      case 'target': {
        g.setLineDash([6, 6]);
        ring(ox, oy, aim.range, false);
        g.setLineDash([]);
        const t = getState().units.find((u) => u.id === (aim as { targetId: number }).targetId);
        if (t) {
          ring(sx(t.pos.x), sy(t.pos.y), t.radius + 0.5, true);
          g.beginPath();
          g.moveTo(ox, oy);
          g.lineTo(sx(t.pos.x), sy(t.pos.y));
          g.stroke();
        }
        break;
      }
      default:
        if (aim.radius > 0) ring(ox, oy, aim.radius, true);
        break;
    }
  }

  function draw(state: GameState): void {
    const me = state.heroes.find((x) => x.id === state.playerId) ?? state.heroes[0];
    const want = peek ?? me.pos;
    // 镜头缓动
    cx += (want.x - cx) * 0.25;
    cy += (want.y - 1.2 - cy) * 0.25;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dark) {
      g.fillStyle = '#0b1322';
      g.fillRect(0, 0, W, H);
    } else {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#5fb47a');
      sky.addColorStop(1, '#3f9a62');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const map = state.map;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      line(map.river);
      g.strokeStyle = '#3aa7d6';
      g.lineWidth = map.riverWidth * scale;
      g.stroke();
      line(map.river);
      g.strokeStyle = 'rgba(160, 232, 250, 0.55)';
      g.lineWidth = map.riverWidth * scale * 0.5;
      g.stroke();
      for (const lane of Object.values(map.lanes)) {
        line(lane);
        g.strokeStyle = '#cdb98a';
        g.lineWidth = map.laneWidth * scale * 0.8;
        g.stroke();
      }
      for (const b of map.bases) {
        poly(b.area);
        g.fillStyle = b.team === 0 ? 'rgba(230, 240, 255, 0.75)' : 'rgba(70, 50, 56, 0.75)';
        g.fill();
      }
      g.fillStyle = '#b9d24f';
      for (const b of map.bushes) {
        poly(b);
        g.fill();
      }
      for (const w of map.walls) {
        poly(w);
        g.fillStyle = '#8e97a8';
        g.fill();
        g.strokeStyle = '#5c6474';
        g.lineWidth = 3;
        g.stroke();
      }
      // 越界区域
      const b = map.bound;
      g.fillStyle = '#26324a';
      g.fillRect(0, 0, W, Math.max(0, sy(-b)));
      g.fillRect(0, sy(b), W, Math.max(0, H - sy(b)));
      g.fillRect(0, 0, Math.max(0, sx(-b)), H);
      g.fillRect(sx(b), 0, Math.max(0, W - sx(b)), H);
    }

    drawAim(me);

    for (const u of state.units) {
      if (!u.alive) continue;
      if (u.team !== 0 && u.kind !== 'tower' && u.kind !== 'core' && u.kind !== 'monster' && !u.visible[0]) continue;
      const x = sx(u.pos.x);
      const y = sy(u.pos.y);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      const r = Math.max(4, u.radius * scale);
      const col = u.kind === 'hero' && u.isPlayer ? '#b7f36b' : TEAM[u.team];
      g.beginPath();
      if (u.kind === 'tower' || u.kind === 'core') g.rect(x - r, y - r, r * 2, r * 2);
      else g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = u.kind === 'hero' ? HEROES[u.heroId].palette.primary : col;
      g.fill();
      g.lineWidth = u.kind === 'hero' ? 3 : 1.5;
      g.strokeStyle = u.kind === 'hero' ? col : 'rgba(10, 16, 34, 0.7)';
      g.stroke();
      if (u.kind === 'hero') {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(u.facing) * r * 1.6, y + Math.sin(u.facing) * r * 1.6);
        g.stroke();
      }
      if (u.kind !== 'minion') {
        const bw = Math.max(26, r * 2.6);
        const by = y - r - 12;
        g.fillStyle = 'rgba(8, 12, 24, 0.8)';
        g.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 7);
        g.fillStyle = u.team === 0 ? '#5fe08f' : u.team === 1 ? '#ff6b6b' : '#e2cf7a';
        g.fillRect(x - bw / 2, by, bw * Math.max(0, u.hp / u.stats.maxHp), 5);
      }
    }
  }

  return {
    draw,
    screenToGround: (x, y) => ({ x: (x - W / 2) / scale + cx, y: (y - H * 0.46) / scale + cy }),
    worldToScreen: (p) => {
      const x = sx(p.x);
      const y = sy(p.y);
      return { x, y, visible: x >= 0 && x <= W && y >= 0 && y <= H };
    },
    pickUnit(x, y, state) {
      const gx = (x - W / 2) / scale + cx;
      const gy = (y - H * 0.46) / scale + cy;
      let best = -1;
      let bestD = Infinity;
      for (const u of state.units) {
        if (!u.alive || u.id === state.playerId) continue;
        const d = Math.hypot(u.pos.x - gx, u.pos.y - gy);
        if (d <= u.radius + 0.7 && d < bestD) {
          bestD = d;
          best = u.id;
        }
      }
      return best;
    },
    setPeek(p) {
      peek = p;
    },
    setAim(a) {
      aim = a;
    },
  };
}

// ───────────────────────── 真实渲染层（?real=1） ─────────────────────────

interface RenderModuleShape {
  createGameRenderer?: (container: HTMLElement, state: GameState, opts: RendererOptions) => GameRenderer;
  getHeroPortrait?: (heroId: HeroId) => string;
}

async function loadRender(): Promise<RenderModuleShape | null> {
  if (!flag('real') && params.get('portrait') !== 'real') return null;
  const loaders = import.meta.glob('../render/index.ts');
  const load = Object.values(loaders)[0];
  if (!load) return null;
  try {
    return (await load()) as RenderModuleShape;
  } catch (err) {
    console.info('[hud-gallery] 渲染层加载失败，改用假战场：', err);
    return null;
  }
}

// ───────────────────────── 桩：头像 / 音频 ─────────────────────────

const portraitCache = new Map<HeroId, string>();
function placeholderPortrait(id: HeroId): string {
  const cached = portraitCache.get(id);
  if (cached) return cached;
  const p = HEROES[id].palette;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  if (!g) return '';
  const lightSecondary = p.secondary === '#f1ecff' || p.secondary === '#f3f0e2';
  const bg = g.createRadialGradient(48, 30, 4, 48, 48, 72);
  bg.addColorStop(0, p.glow);
  bg.addColorStop(0.4, p.primary);
  bg.addColorStop(1, lightSecondary ? '#1a2440' : p.secondary);
  g.fillStyle = bg;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = 'rgba(8, 12, 26, 0.85)';
  g.beginPath();
  g.ellipse(48, 100, 42, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(48, 45, 19, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p.accent;
  g.lineWidth = 2.5;
  g.beginPath();
  g.ellipse(48, 100, 42, 34, 0, Math.PI * 1.12, Math.PI * 1.88);
  g.stroke();
  g.fillStyle = p.glow;
  g.fillRect(38, 43, 7, 3);
  g.fillRect(51, 43, 7, 3);
  g.font = '700 20px "PingFang SC","Microsoft YaHei",sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.fillText(HEROES[id].name.slice(0, 1), 48, 88);
  const url = c.toDataURL('image/png');
  portraitCache.set(id, url);
  return url;
}

function stubAudio(): AudioEngine {
  const say = (s: string): void => {
    hooks.calls.push(`audio.${s}`);
    if (s.startsWith('ui') && !s.includes('hover')) log(`<b>audio</b> ${s}`);
  };
  return {
    unlock: () => undefined,
    handleEvents: () => undefined,
    update: () => undefined,
    ui: (s) => say(`ui ${s}`),
    setMusic: (t) => say(`music ${t}`),
    setVolumes: () => undefined,
    dispose: () => undefined,
  };
}

async function loadAudio(): Promise<AudioEngine> {
  if (!flag('audio')) return stubAudio();
  const loaders = import.meta.glob('../audio/index.ts');
  const load = Object.values(loaders)[0];
  try {
    const mod = load ? ((await load()) as { createAudio?: () => AudioEngine }) : null;
    if (mod?.createAudio) {
      const a = mod.createAudio();
      a.setMusic('battle');
      return a;
    }
  } catch (err) {
    console.info('[hud-gallery] 音频层加载失败，改用桩：', err);
  }
  return stubAudio();
}

// ───────────────────────── 组装 ─────────────────────────

async function main(): Promise<void> {
  const driver = (flag('sim') ? await createSimDriver() : null) ?? createMockDriver();
  const state = driver.state;
  hooks.state = state;
  const settings: Settings = { ...DEFAULT_SETTINGS, showFps: params.get('fps') !== '0' };
  const audio = await loadAudio();
  const render = await loadRender();
  let paused = false;
  let fps = 60;

  let renderer: GameRenderer | null = null;
  let field: Field | null = null;
  if (flag('real') && render?.createGameRenderer) {
    try {
      renderer = render.createGameRenderer(stage, state, { quality: 'medium' });
    } catch (err) {
      console.info('[hud-gallery] 渲染器创建失败，改用假战场：', err);
    }
  }
  if (!renderer) field = createFakeField(() => driver.state);

  const host: HudHost = {
    command(cmd) {
      hooks.cmds.push(cmd);
      log(`<b>cmd</b> ${describeCmd(cmd)}`);
      driver.command(cmd);
    },
    setAim(aim) {
      hooks.aims.push(aim);
      if (renderer) renderer.setAim(aim);
      else field?.setAim(aim);
    },
    screenToGround: (x, y) => (renderer ? renderer.screenToGround(x, y) : (field as Field).screenToGround(x, y)),
    worldToScreen: (p, hgt) => (renderer ? renderer.worldToScreen(p, hgt) : (field as Field).worldToScreen(p, hgt)),
    pickUnit: (x, y) => (renderer ? renderer.pickUnit(x, y, driver.state) : (field as Field).pickUnit(x, y, driver.state)),
    setCameraPeek(p) {
      hooks.peeks.push(p);
      if (renderer) renderer.setCameraPeek(p);
      else field?.setPeek(p);
    },
    setPaused(p) {
      paused = p;
      hooks.calls.push(`setPaused ${p}`);
      log(`<b>host</b> setPaused(${p})`);
    },
    quit() {
      hooks.calls.push('quit');
      log('<b>host</b> quit()');
    },
    getSettings: () => settings,
    updateSettings(patch) {
      Object.assign(settings, patch);
      hooks.calls.push(`updateSettings ${JSON.stringify(patch)}`);
    },
    getFps: () => fps,
    audio,
    portrait: (id) => render?.getHeroPortrait?.(id) ?? placeholderPortrait(id),
  };

  const forced = flag('touch') ? 'touch' : flag('kbm') ? 'kbm' : 'auto';
  const hud = createHud(app, host, state, { input: forced, dimTarget: params.get('dim') === 'host' ? stage : null, tipsSeconds: params.get('tips') === '0' ? 0 : undefined });
  hooks.hud = hud;
  hooks.w2s = (p) => host.worldToScreen(p);

  if (flag('shop')) hud.setShopOpen(true);
  if (flag('scoreboard')) hud.setScoreboardOpen(true);
  if (flag('settings')) hud.openSettings();

  let last = performance.now();
  let fpsAcc = 0;
  let fpsN = 0;
  let lastAimSig = '';
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc >= 0.5) {
      fps = fpsN / fpsAcc;
      fpsAcc = 0;
      fpsN = 0;
    }
    const events = paused ? [] : driver.step(dt);
    const t0 = performance.now();
    if (events.length > 0) hud.handleEvents(events, driver.state);
    const t1 = performance.now();
    hud.update(driver.state, dt);
    const t2 = performance.now();
    hooks.perf.frames++;
    hooks.perf.eventsMs += t1 - t0;
    hooks.perf.updateMs += t2 - t1;
    hooks.perf.updateMax = Math.max(hooks.perf.updateMax, t2 - t1);
    if (renderer) {
      if (events.length > 0) renderer.handleEvents(events, driver.state);
      renderer.render(driver.state, 1, dt);
    } else field?.draw(driver.state);

    // 指示器在瞄准期间每帧都可能微调：日志里只在「类型 / 取消态」变化时记一行
    const aim = hooks.aims.length > 0 ? hooks.aims[hooks.aims.length - 1] : null;
    const aimSig = aim ? `${aim.kind}${aim.cancel ? ' [取消]' : ''}` : hooks.aims.length > 0 ? 'null' : '';
    if (aimSig !== lastAimSig) {
      lastAimSig = aimSig;
      log(`<b>aim</b> ${aimSig}`);
    }
    if (hooks.perf.frames % 6 === 0 && logEl.style.display !== 'none') {
      logEl.innerHTML = `<b>HUD ${hud.getInputMode()}</b>  update 均 ${hooks.perf.avg().toFixed(3)}ms / 峰 ${hooks.perf.updateMax.toFixed(2)}ms\n${logLines.join('\n')}`;
    }
  }
  requestAnimationFrame(frame);
}

void main();
