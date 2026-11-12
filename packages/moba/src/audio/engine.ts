/**
 * AudioEngine 实现：AudioContext 生命周期、模拟事件 → 音效的映射(去重 / 分级 / 空间化 / 可见性)、
 * 以及根据战况驱动配乐强度。未 unlock 之前所有调用都静默丢弃。
 */
import { MONSTERS, VISION } from '../core/data/units';
import type { AnnounceKey, AreaVisual, GameEvent, GameState, HeroId, HeroUnit, MonsterType, ProjectileVisual, Unit, Vec2 } from '../core/types';
import type { AudioEngine, AudioVolumes, MusicTrack, UiSound } from './api';
import { Mixer } from './mixer';
import type { PlayOpts, VoiceHandle } from './mixer';
import { MusicEngine } from './music';
import { SFX } from './sfx';
import type { SfxKey } from './sfx';

type FxEvent = Extract<GameEvent, { type: 'fx' }>;

const ATK_SWING: Record<HeroId, SfxKey> = {
  panyue: 'atk_panyue_swing',
  chijin: 'atk_chijin_swing',
  xingli: 'atk_xingli_charge',
  fengling: 'atk_fengling_draw',
  yeque: 'atk_yeque_swing',
};
/** 近战英雄的普攻命中声(远程英雄的命中声由弹道事件触发) */
const ATK_HIT: Partial<Record<HeroId, SfxKey>> = {
  panyue: 'atk_panyue_hit',
  chijin: 'atk_chijin_hit',
  yeque: 'atk_yeque_hit',
};
const PROJ_SPAWN: Record<ProjectileVisual, SfxKey> = {
  xingli_basic: 'atk_xingli_launch',
  fengling_basic: 'atk_fengling_launch',
  xingli_s1: 'xingli_s1_fly',
  fengling_s1: 'fengling_s1_fly',
  yeque_s2: 'yeque_s2_fly',
  minion_ranged: 'minion_ranged_launch',
  minion_siege: 'minion_siege_launch',
  tower_bolt: 'tower_launch',
  core_bolt: 'tower_launch',
  monster_spit: 'monster_spit_launch',
};
const PROJ_HIT: Record<ProjectileVisual, SfxKey> = {
  xingli_basic: 'atk_xingli_hit',
  fengling_basic: 'atk_fengling_hit',
  xingli_s1: 'xingli_s1_hit',
  fengling_s1: 'fengling_s1_hit',
  yeque_s2: 'yeque_s2_hit',
  minion_ranged: 'minion_ranged_hit',
  minion_siege: 'minion_siege_hit',
  tower_bolt: 'tower_hit',
  core_bolt: 'tower_hit',
  monster_spit: 'monster_spit_hit',
};
const AREA_KEY: Partial<Record<AreaVisual, SfxKey>> = {
  telegraph: 'area_telegraph',
  panyue_s2_aura: 'area_panyue_aura',
  panyue_ult_fissure: 'area_panyue_fissure',
  chijin_ult_spin: 'area_chijin_spin',
  xingli_s2_well: 'area_xingli_well',
  xingli_ult_storm: 'area_xingli_storm',
  fengling_ult_rain: 'area_fengling_rain',
};
/** 野怪音色变体：monster_swing / monster_hit / death_monster / monster_spawn 的 v(各配方里按这个编号分支) */
const MON_VAR: Record<MonsterType, number> = {
  mossback: 0,
  frost_golem: 1,
  ember_golem: 2,
  abyss_drake: 3,
  star_colossus: 4,
  glimwing: 5,
};
/** 史诗野怪的变体(epic_roar / epic_hit / epic_fall 的 v)：0 = 河道巨龙，1 = 远古巨灵 */
const epicVar = (t: MonsterType): number => (t === 'star_colossus' ? 1 : 0);
/** 同一批事件里多个播报只播最重要的，其余排队 */
const ANN_RANK: Record<AnnounceKey, number> = {
  victory: 100, defeat: 100, ace: 90, penta_kill: 85, quadra_kill: 80, legendary: 78, triple_kill: 75, unstoppable: 72,
  double_kill: 70, first_blood: 68, shutdown: 60, killing_spree: 58, epic_slain: 50, tower_destroyed: 45, epic_spawn: 40,
  match_start: 35, super_minions: 30, minions_spawn: 20,
};
/** 这些播报已经自带击杀提示音，heroKill 不再另外响 */
const KILL_ANN = new Set<AnnounceKey>(['first_blood', 'double_kill', 'triple_kill', 'quadra_kill', 'penta_kill', 'killing_spree', 'unstoppable', 'legendary', 'shutdown', 'ace']);
/** 敌方达成时用暗变体的播报 */
const DARKABLE = new Set<AnnounceKey>([...KILL_ANN, 'tower_destroyed', 'epic_slain', 'super_minions']);

interface AtOpts {
  pitch?: number;
  v?: number;
  dur?: number;
  prio?: number;
  /** 距离衰减的下限(全图都该听到一点的事件) */
  floor?: number;
}

interface AreaVoice {
  h: VoiceHandle;
  key: SfxKey;
  gain: number;
}

/** 玩家是否站在一次扇形特效(pos 为顶点、dir 为朝向、radius / angle 为范围)里；pad = 身体半径，沾边也算 */
function inFan(pos: Vec2, pad: number, e: FxEvent): boolean {
  if (!e.dir || e.radius === undefined) return false;
  const dx = pos.x - e.pos.x;
  const dy = pos.y - e.pos.y;
  const d = Math.hypot(dx, dy);
  if (d > e.radius + pad) return false;
  if (d <= pad) return true;
  const half = (e.angle ?? Math.PI / 3) / 2 + Math.asin(Math.min(1, pad / d));
  return (dx * e.dir.x + dy * e.dir.y) / d >= Math.cos(Math.min(Math.PI, half));
}

export interface AudioDebugStats {
  state: string;
  time: number;
  voices: number;
  notes: number;
  played: number;
  throttled: number;
  capped: number;
  stolen: number;
  peakVoices: number;
  intensity: number;
  tension: number;
  track: MusicTrack;
}

export interface AudioDebug {
  /** 直接播放某个键(画廊页试听) */
  play(key: SfxKey, opts?: PlayOpts): void;
  stats(): AudioDebugStats;
  /** 手动指定配乐强度/紧张度；null = 交还给自动判定 */
  override(intensity: number | null, tension: number | null): void;
}

export class Engine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private music: MusicEngine | null = null;
  private vols: AudioVolumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  private wantTrack: MusicTrack = 'none';
  private hidden = false;
  private disposed = false;
  private timer = 0;

  // 事件处理的缓存
  private lastTime = -1;
  private lastSeed = -1;
  private lastHero = '';
  private units = new Map<number, Unit>();
  private unitsOld = new Map<number, Unit>();
  private refreshCount = 0;
  private cores: Unit[] = [];
  private projOwner = new Map<number, number>();
  private hitProj = new Set<number>();
  private towerHits = new Set<number>();
  private areaVoices = new Map<number, AreaVoice>();
  /** 正在响的巨龙吐息(预警或喷吐)：巨龙中途被打死时要收声 */
  private breathVoice: { h: VoiceHandle; unitId: number } | null = null;
  /** 每位王昭君普攻乐句弹到第几个音、上次是什么时候弹的 */
  private strums = new Map<number, { i: number; t: number }>();
  /** 玩家身上「得手」状态的剩余时间(用来发现它刚挂上 / 被刷新) */
  private shadowLeft = 0;
  private sight: number[] = [];
  private sightReady = false;
  private lx = 0;
  private ly = 0;
  private spGain = 1;
  private spPan = 0;
  private spLp = 0;
  private annFreeAt = 0;

  // 配乐情绪
  private heat = 0;
  private intensity = 0;
  private tension = 0;
  private ovI: number | null = null;
  private ovT: number | null = null;
  private toneDead = false;
  private hbTimer = 0;
  private recallVoice: VoiceHandle | null = null;
  private frame = 0;

  readonly debug: AudioDebug = {
    play: (key, opts) => {
      this.mixer?.play(key, opts);
    },
    stats: () => ({
      state: this.ctx?.state ?? 'none',
      time: this.ctx?.currentTime ?? 0,
      voices: this.mixer?.voiceCount ?? 0,
      notes: this.mixer?.noteCount ?? 0,
      played: this.mixer?.stats.played ?? 0,
      throttled: this.mixer?.stats.throttled ?? 0,
      capped: this.mixer?.stats.capped ?? 0,
      stolen: this.mixer?.stats.stolen ?? 0,
      peakVoices: this.mixer?.stats.peakVoices ?? 0,
      intensity: this.ovI ?? this.intensity,
      tension: this.ovT ?? this.tension,
      track: this.music?.track ?? this.wantTrack,
    }),
    override: (i, t) => {
      this.ovI = i;
      this.ovT = t;
    },
  };

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    // 兜底：任何一次用户手势都尝试解锁，集成方漏调 unlock() 也能出声
    if (typeof window !== 'undefined') {
      for (const ev of GESTURES) window.addEventListener(ev, this.onGesture, { capture: true, passive: true });
    }
  }

  // ───────────────────────── 生命周期 ─────────────────────────

  unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        try {
          this.ctx = new AC();
        } catch {
          return;
        }
      }
      this.mixer = new Mixer(this.ctx);
      // 实时运行时换一个随时间变化的种子：每次开局的随机音高微调、配乐星点都不一样
      this.mixer.kit.reseed(Date.now());
      this.music = new MusicEngine(this.mixer);
      this.mixer.setVolumes(this.vols.master, this.vols.sfx, this.vols.music);
      if (this.wantTrack !== 'none') this.music.setTrack(this.wantTrack);
      // 菜单等不调用 update() 的界面也要有人推进配乐调度与节点回收
      this.timer = window.setInterval(this.pump, 60);
    }
    if (this.ctx.state !== 'running' && !this.hidden) void this.ctx.resume().catch(noop);
  }

  private pump = (): void => {
    if (!this.mixer || !this.music || this.ctx?.state !== 'running') return;
    this.mixer.sweep();
    this.music.tick();
  };

  /** 手势监听常驻：系统打断(来电、切后台)导致上下文挂起后，下一次点按就能恢复 */
  private onGesture = (): void => {
    if (!this.ctx || this.ctx.state !== 'running') this.unlock();
  };

  /** 当前能否出声：已解锁、页面可见、上下文在运行(离线自检挂接时没有 ctx，视为可用) */
  private get live(): boolean {
    return this.mixer !== null && !this.hidden && (this.ctx === null || this.ctx.state === 'running');
  }

  private removeGestureListeners(): void {
    if (typeof window === 'undefined') return;
    for (const ev of GESTURES) window.removeEventListener(ev, this.onGesture, { capture: true });
  }

  /** 页面隐藏时淡出并挂起，恢复时继续(调度器基于 AudioContext 时间，挂起期间自然暂停) */
  private onVisibility = (): void => {
    this.hidden = document.hidden;
    const ctx = this.ctx;
    const mixer = this.mixer;
    if (!ctx || !mixer) return;
    if (this.hidden) {
      mixer.fadeMaster(0, 0.015);
      window.setTimeout(() => {
        if (this.hidden && ctx.state === 'running') void ctx.suspend().catch(noop);
      }, 90);
    } else {
      void ctx
        .resume()
        .then(() => mixer.fadeMaster(this.vols.master, 0.08))
        .catch(noop);
    }
  };

  setVolumes(v: AudioVolumes): void {
    this.vols = { master: v.master, sfx: v.sfx, music: v.music };
    if (this.mixer && !this.hidden) this.mixer.setVolumes(v.master, v.sfx, v.music);
    else if (this.mixer) this.mixer.setVolumes(0, v.sfx, v.music);
  }

  setMusic(track: MusicTrack): void {
    this.wantTrack = track;
    // 离开对局曲目(回菜单 / 进结算)：对局里挂在配乐与总线上的状态一并收掉。
    // 不能指望 update() 来复位——宿主退出对局后就不再调它了(玩家阵亡期间退出时，「阵亡低通」会一直闷着菜单配乐)
    if (track !== 'battle') this.leaveBattle();
    this.music?.setTrack(track);
  }

  /** 收掉只属于对局的声音状态：阵亡低通、回城引导声、区域铺底、濒死心跳、战斗热度 */
  private leaveBattle(): void {
    if (this.toneDead) {
      this.toneDead = false;
      this.mixer?.setMusicTone(20000);
    }
    this.areaVoices.forEach((a) => a.h.stop(0.2));
    this.areaVoices.clear();
    this.breathVoice?.h.stop(0.2);
    this.breathVoice = null;
    this.recallVoice?.stop(0.1);
    this.recallVoice = null;
    this.hbTimer = 0;
    this.heat = 0;
    this.shadowLeft = 0;
  }

  /**
   * 自检用：把引擎接到一个离线上下文 + 虚拟时钟上(不创建真正的 AudioContext)，
   * 这样可以把一段真实对局的事件流按原样渲染成波形来检查。
   */
  attachOffline(ctx: BaseAudioContext, clock: () => number): Mixer {
    this.mixer = new Mixer(ctx, { clock });
    this.music = new MusicEngine(this.mixer);
    this.mixer.setVolumes(this.vols.master, this.vols.sfx, this.vols.music);
    if (this.wantTrack !== 'none') this.music.setTrack(this.wantTrack);
    return this.mixer;
  }

  ui(sound: UiSound): void {
    if (this.live) this.mixer?.play(`ui_${sound}`);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.removeGestureListeners();
    if (this.timer) window.clearInterval(this.timer);
    this.music?.dispose();
    this.mixer?.dispose();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(noop);
    this.music = null;
    this.mixer = null;
    this.ctx = null;
    this.resetMatch();
  }

  private resetMatch(): void {
    this.units.clear();
    this.unitsOld.clear();
    this.cores.length = 0;
    this.projOwner.clear();
    this.areaVoices.forEach((a) => a.h.stop(0.2));
    this.areaVoices.clear();
    this.breathVoice?.h.stop(0.2);
    this.breathVoice = null;
    this.strums.clear();
    this.shadowLeft = 0;
    this.recallVoice?.stop(0.1);
    this.recallVoice = null;
    this.heat = 0;
    this.annFreeAt = 0;
    this.hbTimer = 0;
  }

  // ───────────────────────── 单位缓存 / 空间化 / 可见性 ─────────────────────────

  /**
   * 记住见过的单位。死亡的小兵/野怪/塔在事件到达前就已从 state.units 移除，
   * 但死亡/伤害事件仍需要知道它是什么兵种、在哪一队。两代轮换防止表无限增长。
   */
  private refreshUnits(state: GameState): void {
    // 新的一局(时间倒流，或种子/所选英雄变了)：清掉上一局的单位缓存与持续声。
    // 不用 state 对象的引用判断——不假设模拟层每个 tick 都返回同一个对象
    const cfg = state.config;
    if (state.time + 1 < this.lastTime || cfg.seed !== this.lastSeed || cfg.playerHero !== this.lastHero) {
      this.resetMatch();
      this.lastSeed = cfg.seed;
      this.lastHero = cfg.playerHero;
    }
    this.lastTime = state.time;
    if (++this.refreshCount > 900) {
      this.refreshCount = 0;
      this.unitsOld = this.units;
      this.units = new Map();
    }
    this.cores.length = 0;
    for (const u of state.units) {
      this.units.set(u.id, u);
      if (u.kind === 'core') this.cores.push(u);
    }
  }

  private unit(id: number): Unit | undefined {
    return this.units.get(id) ?? this.unitsOld.get(id);
  }

  private player(state: GameState): HeroUnit | undefined {
    const u = this.unit(state.playerId);
    return u && u.kind === 'hero' ? u : undefined;
  }

  private seen(u: Unit): boolean {
    return u.team === 0 || u.visible[0];
  }

  /** 没有具体单位可查时，用己方视野圈近似判断某个位置是否在迷雾外 */
  private posSeen(state: GameState, pos: Vec2): boolean {
    const s = this.sight;
    if (!this.sightReady) {
      s.length = 0;
      for (const u of state.units) {
        if (u.team !== 0 || !u.alive) continue;
        const r = u.kind === 'hero' ? VISION.hero : u.kind === 'minion' ? VISION.minion : u.kind === 'tower' ? VISION.tower : VISION.core;
        s.push(u.pos.x, u.pos.y, r * r);
      }
      this.sightReady = true;
    }
    for (let i = 0; i < s.length; i += 3) {
      const dx = pos.x - s[i];
      const dy = pos.y - s[i + 1];
      if (dx * dx + dy * dy <= s[i + 2]) return true;
    }
    return false;
  }

  /** 相对玩家英雄的距离衰减 / 声像 / 远距低通。超出可听距离返回 false */
  private locate(pos: Vec2, range: number, floor: number): boolean {
    const dx = pos.x - this.lx;
    const dy = pos.y - this.ly;
    const d = Math.hypot(dx, dy);
    if (d > range && floor <= 0) return false;
    const near = 3;
    const k = d <= near ? 1 : Math.max(0, 1 - (d - near) / (range - near));
    this.spGain = Math.max(floor, Math.pow(k, 1.6));
    // 镜头朝北，模拟平面的 +x 就是屏幕右侧
    this.spPan = Math.max(-1, Math.min(1, dx / 13)) * 0.85;
    this.spLp = d > 8 ? 17000 * Math.pow(0.13, Math.min(1, (d - 8) / 18)) : 0;
    return this.spGain > 0.004;
  }

  private at(key: SfxKey, pos: Vec2, gain: number, o?: AtOpts): VoiceHandle | null {
    const m = this.mixer;
    if (!m || !this.locate(pos, SFX[key].range, o?.floor ?? 0)) return null;
    return m.play(key, { gain: gain * this.spGain, pan: this.spPan, lp: this.spLp, pitch: o?.pitch, v: o?.v, dur: o?.dur, prio: o?.prio });
  }

  // ───────────────────────── 事件 → 音效 ─────────────────────────

  handleEvents(events: GameEvent[], state: GameState): void {
    const m = this.mixer;
    // 上下文没在运行时不排任何声音：否则恢复的瞬间会把积压的声音一起放出来
    if (!m || !this.live || events.length === 0) return;
    this.refreshUnits(state);
    this.sightReady = false;
    const pid = state.playerId;
    const me = this.player(state);
    if (me) {
      this.lx = me.pos.x;
      this.ly = me.pos.y;
    }

    // 预扫描：同一批事件里互相替代的声音
    let killAnnounced = false;
    let playerCoin = false;
    this.hitProj.clear();
    this.towerHits.clear();
    for (const e of events) {
      if (e.type === 'announce') {
        if (KILL_ANN.has(e.key)) killAnnounced = true;
      } else if (e.type === 'gold') {
        if (e.unitId === pid && e.reason !== 'passive') playerCoin = true;
      } else if (e.type === 'projectileHit') {
        this.hitProj.add(e.id);
        if (e.visual === 'tower_bolt' || e.visual === 'core_bolt') this.towerHits.add(e.targetId);
      }
    }
    let anns: { key: AnnounceKey; team: number }[] | null = null;

    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          const u = this.unit(e.unitId);
          if (!u || !this.seen(u)) break;
          const mine = e.unitId === pid;
          const atMe = e.targetId === pid;
          if (u.kind === 'hero') {
            this.at(ATK_SWING[u.heroId], u.pos, mine ? 1 : 0.6, { prio: mine ? 2 : 1 });
          } else if (u.kind === 'minion') {
            // 小兵互殴要轻且稀疏：只有近战兵有挥击声，且强限流
            if (u.minionType === 'melee' || u.minionType === 'super') {
              this.at('minion_swing', u.pos, atMe ? 0.8 : 0.45, { pitch: u.minionType === 'super' ? 0.7 : 1 });
            }
          } else if (u.kind === 'tower' || u.kind === 'core') {
            this.at('tower_charge', u.pos, atMe ? 1 : 0.6, { pitch: u.kind === 'core' ? 0.8 : 1, prio: atMe ? 2 : 1 });
          } else if (MONSTERS[u.monsterType].projectileSpeed === 0) {
            this.at('monster_swing', u.pos, 0.7, { v: MON_VAR[u.monsterType] });
          }
          break;
        }

        case 'damage': {
          const toMe = e.targetId === pid;
          const byMe = e.sourceId === pid;
          const src = this.unit(e.sourceId);
          const tgt = this.unit(e.targetId);
          // 玩家的技能扫到草里 / 迷雾里看不见的敌人：不出命中确认音、不升战斗热度、不出命中声——与渲染层不出飘字一致，免得靠声音报位置
          const tgtHidden = tgt !== undefined && !toMe && !this.seen(tgt);
          if (toMe || (byMe && !tgtHidden)) this.noteCombat(toMe ? src : tgt);
          if (toMe && me && e.amount > 0) {
            const frac = e.amount / Math.max(1, me.stats.maxHp);
            if (frac >= 0.1) m.play('player_hurt_heavy', { gain: Math.min(1, 0.7 + frac * 1.5) });
            else if (frac >= 0.008) m.play('player_hurt', { gain: Math.min(1, 0.55 + frac * 4), v: Math.min(1, frac * 10) });
          }
          if (e.skill) {
            if (byMe && tgt && tgt.kind === 'hero' && !tgtHidden) m.play('skill_hit');
            break;
          }
          // 近战普攻的命中声。远程普攻/塔弹由 projectileHit 负责，这里不重复
          if (!src || tgtHidden) break;
          if (!toMe && !byMe && !tgt && !this.posSeen(state, e.pos)) break;
          const vsHero = tgt !== undefined && tgt.kind === 'hero';
          if (src.kind === 'hero') {
            const key = ATK_HIT[src.heroId];
            // 只认物理伤害：反伤、附魔、灼烧等附带伤害不该再响一次武器声
            if (key && e.dtype === 'physical') this.at(key, e.pos, byMe ? 1 : toMe ? 0.9 : 0.6, { prio: byMe || toMe ? 2 : 1 });
          } else if (src.kind === 'minion') {
            if (src.minionType === 'melee') this.at('minion_melee_hit', e.pos, toMe ? 0.75 : vsHero ? 0.5 : 0.3);
            else if (src.minionType === 'super') this.at('super_hit', e.pos, toMe ? 0.85 : vsHero ? 0.6 : 0.4);
          } else if (src.kind === 'monster' && MONSTERS[src.monsterType].projectileSpeed === 0) {
            if (MONSTERS[src.monsterType].epic) this.at('epic_hit', e.pos, toMe ? 1 : 0.8, { v: epicVar(src.monsterType) });
            else this.at('monster_hit', e.pos, toMe ? 0.9 : 0.65, { v: MON_VAR[src.monsterType] });
          }
          break;
        }

        case 'heal':
          // 与 fx heal 共享限流分组：只给玩家身上较大的单次治疗补一声
          if (e.targetId === pid && me && e.amount >= me.stats.maxHp * 0.04) m.play('fx_heal', { gain: 0.8 });
          break;

        case 'skillCast': {
          const mine = e.unitId === pid;
          const u = this.unit(e.unitId);
          if (!mine && !(u ? this.seen(u) : this.posSeen(state, e.pos))) break;
          const key: SfxKey = e.slot === 'recall' || e.slot === 'heal' || e.slot === 'flash' ? `cast_${e.slot}` : `cast_${e.heroId}_${e.slot}`;
          this.at(key, e.pos, mine ? 1 : 0.7, { prio: mine ? 3 : 2 });
          break;
        }

        case 'fx':
          this.onFx(e, state, pid, me, playerCoin);
          break;

        case 'projectileSpawn': {
          if (this.projOwner.size > 600) this.projOwner.clear();
          this.projOwner.set(e.id, e.ownerId);
          const mine = e.ownerId === pid;
          const owner = this.unit(e.ownerId);
          if (!mine && !(owner ? this.seen(owner) : this.posSeen(state, e.pos))) break;
          const hero = owner !== undefined && owner.kind === 'hero';
          const gain = mine ? 1 : hero ? 0.65 : e.visual === 'tower_bolt' || e.visual === 'core_bolt' ? 0.7 : e.visual === 'minion_siege' ? 0.5 : 0.38;
          // 王昭君的普攻：沿乐句往下弹一个音
          const v = e.visual === 'xingli_basic' ? this.strum(e.ownerId, state.time) : undefined;
          this.at(PROJ_SPAWN[e.visual], e.pos, gain, { pitch: e.visual === 'core_bolt' ? 0.8 : 1, prio: mine ? 2 : undefined, v });
          break;
        }

        case 'projectileHit': {
          const toMe = e.targetId === pid;
          const byMe = this.projOwner.get(e.id) === pid;
          const tgt = this.unit(e.targetId);
          // 目标看不见就不响(玩家自己的飞行物穿进草里打到人也一样)；目标已不在单位表里时才退回按位置判断
          if (!toMe && (tgt ? !this.seen(tgt) : !byMe && !this.posSeen(state, e.pos))) break;
          const tower = e.visual === 'tower_bolt' || e.visual === 'core_bolt';
          // 塔打在玩家身上要明显更重
          const key: SfxKey = tower && toMe ? 'tower_hit_player' : PROJ_HIT[e.visual];
          const minion = e.visual === 'minion_ranged' || e.visual === 'minion_siege' || e.visual === 'monster_spit';
          const vsHero = tgt !== undefined && tgt.kind === 'hero';
          const gain = toMe || byMe ? 1 : minion ? (vsHero ? 0.5 : 0.32) : tower ? 0.65 : 0.6;
          // 李广的「白羽没石」射中英雄：多一声石裂
          const v = e.visual === 'fengling_s1' && vsHero ? 1 : 0;
          this.at(key, e.pos, gain, { pitch: e.visual === 'core_bolt' ? 0.8 : 1, prio: toMe || byMe ? 2 : undefined, v });
          break;
        }

        case 'projectileEnd': {
          this.projOwner.delete(e.id);
          const skill = e.visual === 'xingli_s1' || e.visual === 'fengling_s1' || e.visual === 'yeque_s2';
          // 荆轲的匕首落空是钉进地面，其余是消散
          if (skill && !this.hitProj.has(e.id) && this.posSeen(state, e.pos)) this.at('proj_fizzle', e.pos, 0.7, { v: e.visual === 'yeque_s2' ? 1 : 0 });
          break;
        }

        case 'areaSpawn': {
          let key = AREA_KEY[e.visual];
          if (!key) break;
          let team = 2;
          for (const a of state.areas) {
            if (a.id === e.id) {
              team = a.team;
              break;
            }
          }
          const tele = e.visual === 'telegraph';
          if (tele && team !== 0) key = 'area_telegraph_enemy';
          // 预警圈敌我都可见；其余敌方区域要在视野内
          if (!tele && team !== 0 && !this.posSeen(state, e.pos)) break;
          const gain = team === 0 ? 0.9 : 1;
          const h = this.at(key, e.pos, gain, { dur: e.duration });
          if (h && e.duration > 0.8) this.areaVoices.set(e.id, { h, key, gain });
          break;
        }

        case 'areaEnd': {
          const a = this.areaVoices.get(e.id);
          if (a) {
            a.h.stop(0.25);
            this.areaVoices.delete(e.id);
          }
          break;
        }

        case 'death': {
          if (e.kind === 'hero') {
            if (e.unitId === pid) {
              m.play('death_player');
              this.recallVoice?.stop(0.1);
              this.recallVoice = null;
            } else if (e.team === 0) {
              this.at('death_hero_ally', e.pos, 0.9);
            } else if (e.killerId === pid || this.posSeen(state, e.pos)) {
              this.at('death_hero_enemy', e.pos, e.killerId === pid ? 1 : 0.8, { prio: e.killerId === pid ? 3 : 2 });
            }
          } else if (e.kind === 'minion') {
            if (e.killerId !== pid && !this.posSeen(state, e.pos)) break;
            const u = this.unit(e.unitId);
            const big = u !== undefined && u.kind === 'minion' && (u.minionType === 'siege' || u.minionType === 'super');
            this.at(big ? 'death_minion_big' : 'death_minion', e.pos, e.killerId === pid ? 0.9 : 0.45);
          } else if (e.kind === 'monster') {
            const u = this.unit(e.unitId);
            // 史诗野怪的倒下由 epicSlain 负责
            if (u && u.kind === 'monster' && !MONSTERS[u.monsterType].epic) {
              this.at('death_monster', e.pos, 0.8, { v: MON_VAR[u.monsterType] });
            }
            // 巨龙吐到一半被打死：模拟层不发「取消」事件，这里把预警 / 喷吐声收掉
            if (this.breathVoice && this.breathVoice.unitId === e.unitId) {
              this.breathVoice.h.stop(0.15);
              this.breathVoice = null;
            }
          }
          // 塔/水晶：爆炸声由 fx tower_destroyed / core_destroyed 负责
          break;
        }

        case 'heroKill': {
          if (killAnnounced) break;
          if (e.killerId === pid) m.play('kill_player');
          else if (e.victimId !== pid) {
            const victim = this.unit(e.victimId);
            const killer = this.unit(e.killerId);
            const allyKill = victim ? victim.team === 1 : killer !== undefined && killer.team === 0;
            m.play(allyKill ? 'kill_ally' : 'kill_enemy');
          }
          break;
        }

        case 'levelUp':
          if (e.unitId === pid) m.play('levelup_player');
          break;

        case 'respawn':
          if (e.unitId === pid) m.play('respawn_player');
          break;

        case 'gold':
          if (e.unitId !== pid) break;
          if (e.reason === 'lasthit' || e.reason === 'monster') m.play('coin', { v: Math.min(1, e.amount / 120) });
          else if (e.reason === 'kill') m.play('coin_big');
          else if (e.reason === 'assist' || e.reason === 'tower') m.play('coin_big', { gain: 0.7 });
          break;

        case 'itemBought':
          // 自动出装买入：同一个提示音放轻(界面只弹一条不打扰的提示条)；手动购买保持原样。
          // 与界面层的 ui('buy') 同属 'buy' 限流分组，两边都触发也只响一次
          if (e.unitId === pid) m.play('buy', e.auto ? { gain: 0.6 } : undefined);
          break;

        case 'monsterSpawn':
          if (MONSTERS[e.monsterType].epic) this.at('epic_roar', e.pos, 1, { v: epicVar(e.monsterType), floor: 0.3 });
          // 普通营地刷新：营地在己方视野里才出声
          else if (this.posSeen(state, e.pos)) this.at('monster_spawn', e.pos, 0.8, { v: MON_VAR[e.monsterType] });
          break;

        case 'epicSlain':
          this.at('epic_fall', e.pos, 1, { v: epicVar(e.monsterType), floor: 0.3 });
          break;

        case 'announce':
          (anns ??= []).push({ key: e.key, team: e.team });
          break;

        case 'reject':
          if (e.unitId === pid) m.play('reject');
          break;

        case 'gameOver':
          this.recallVoice?.stop(0.1);
          this.recallVoice = null;
          // 集成方没切曲时兜底：对局配乐直接转入胜负短曲
          if (this.music?.track === 'battle') this.setMusic(e.winner === 0 ? 'victory' : 'defeat');
          break;

        default:
          // towerDestroyed / waveSpawn：由 fx 与 announce 覆盖
          break;
      }
    }

    if (anns) this.playAnnounces(anns);
  }

  private onFx(e: FxEvent, state: GameState, pid: number, me: HeroUnit | undefined, playerCoin: boolean): void {
    const key: SfxKey = `fx_${e.key}`;
    const mine = e.unitId === pid || e.targetId === pid;
    switch (e.key) {
      case 'level_up':
      case 'respawn':
        // 玩家自己的升级/复活由 levelUp/respawn 事件播更隆重的版本
        if (e.unitId === pid) return;
        if (e.unitId === undefined && me && Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 1) return;
        break;
      case 'gold_gain':
        // 玩家自己的补刀由 gold 事件播更清脆的金币声
        if (e.unitId === pid || (e.unitId === undefined && playerCoin)) return;
        break;
      case 'hit_tower':
        // 塔弹命中声已由 projectileHit 播放(打在玩家身上时是加重版)，不再叠一层
        if (e.targetId !== undefined && this.towerHits.has(e.targetId)) return;
        break;
      case 'hit_physical':
      case 'hit_magic':
        // 模拟层只给英雄普攻带 unitId；小兵/野怪互殴的命中声由 damage 事件负责，这里不再叠加，保持兵线安静
        if (e.unitId === undefined && e.targetId !== pid) return;
        break;
      case 'tower_destroyed':
      case 'core_destroyed':
        // 建筑恒可见
        this.at(key, e.pos, 1, { floor: e.key === 'core_destroyed' ? 0.6 : 0 });
        return;
      case 'drake_breath_warn':
      case 'drake_breath':
        this.onBreath(e, state, pid, me);
        return;
      default:
        break;
    }
    if (!mine && e.team !== 0) {
      const u = e.unitId !== undefined ? this.unit(e.unitId) : undefined;
      if (!(u ? this.seen(u) : this.posSeen(state, e.pos))) return;
    }
    // 命中在看不见的敌人身上的特效音(含玩家自己打出的)：不响
    if (e.targetId !== undefined && e.targetId !== pid) {
      const t = this.unit(e.targetId);
      if (t && !this.seen(t)) return;
    }
    const generic = e.key === 'hit_physical' || e.key === 'hit_magic' || e.key === 'hit_tower';
    const gain = generic ? (mine ? 0.8 : 0.45) : mine ? 1 : 0.75;
    this.at(key, e.pos, gain, { prio: mine && !generic ? 3 : undefined });
  }

  /**
   * 河道巨龙吐息：预警与喷吐各一条跟随时长的声音。这是敌我都看得见的危险提示，
   * 只按巨龙自己是否可见来判断，不看它盯着的目标在不在视野里。
   */
  private onBreath(e: FxEvent, state: GameState, pid: number, me: HeroUnit | undefined): void {
    const u = e.unitId !== undefined ? this.unit(e.unitId) : undefined;
    if (!(u ? this.seen(u) : this.posSeen(state, e.pos))) return;
    const warn = e.key === 'drake_breath_warn';
    // 玩家是被盯上的目标、或正站在扇形里：更响、优先级最高
    const threat = e.targetId === pid || (me !== undefined && me.alive && inFan(me.pos, me.radius, e));
    // 预警 → 喷吐的交接(预警声本身就在这一刻收住，这里只是兜底)
    this.breathVoice?.h.stop(0.08);
    const dur = Math.min(1.6, Math.max(0.3, e.value ?? (warn ? 0.9 : 0.8)));
    const h = this.at(`fx_${e.key}`, e.pos, threat ? 1 : 0.7, { dur, prio: threat ? 3 : 2 });
    this.breathVoice = h && e.unitId !== undefined ? { h, unitId: e.unitId } : null;
  }

  /** 王昭君的普攻沿一句五声音阶的乐句往下弹：每位王昭君各记各的进度，停手 3 秒从头再来 */
  private strum(id: number, time: number): number {
    const s = this.strums.get(id);
    if (!s || time - s.t > 3 || time < s.t) {
      this.strums.set(id, { i: 0, t: time });
      return 0;
    }
    s.i++;
    s.t = time;
    return s.i;
  }

  private playAnnounces(anns: { key: AnnounceKey; team: number }[]): void {
    const m = this.mixer;
    if (!m) return;
    anns.sort((a, b) => ANN_RANK[b.key] - ANN_RANK[a.key]);
    const now = m.now();
    let when = Math.max(0, this.annFreeAt - now);
    for (let i = 0; i < anns.length && i < 2; i++) {
      // 排队超过两秒多的播报已经过时，丢弃
      if (when > 2.4) break;
      const a = anns[i];
      const key: SfxKey = `ann_${a.key}`;
      const dark = a.team === 1 && DARKABLE.has(a.key);
      if (!m.play(key, { v: dark ? 1 : 0, when })) continue;
      const len = SFX[key].len * 0.75;
      // 胜负的冲击音之后紧跟胜负短曲的开头，不要把它压下去
      if (a.key !== 'victory' && a.key !== 'defeat') m.duck(0.5, when + len);
      when += len;
      this.annFreeAt = now + when;
    }
  }

  /** 玩家参与了一次交手：对英雄/建筑/史诗野怪记为激烈战斗，对小兵野怪只算轻度 */
  private noteCombat(other: Unit | undefined): void {
    if (!other) return;
    const big = other.kind === 'hero' || other.kind === 'tower' || other.kind === 'core' || (other.kind === 'monster' && MONSTERS[other.monsterType].epic);
    this.heat = Math.max(this.heat, big ? 1 : 0.3);
  }

  // ───────────────────────── 每帧 ─────────────────────────

  update(state: GameState | null, dtReal: number): void {
    const m = this.mixer;
    const music = this.music;
    if (!m || !music || !this.live) return;
    m.sweep();
    const dt = Math.min(0.25, Math.max(0, dtReal));
    let target = 0;
    let tension = 0;
    let dead = false;

    if (state && !state.over) {
      this.refreshUnits(state);
      const me = this.player(state);
      if (me) {
        this.lx = me.pos.x;
        this.ly = me.pos.y;
        if (me.alive) {
          let near = 0;
          for (const h of state.heroes) {
            if (h.team !== 1 || !h.alive || !h.visible[0]) continue;
            if (Math.hypot(h.pos.x - me.pos.x, h.pos.y - me.pos.y) < 14) near++;
          }
          if (near > 0) target = Math.min(1, 0.55 + 0.15 * near);
          if (me.inCombat) target = Math.max(target, 0.85);
          if (state.time - me.lastHitTime < 2.5) target = Math.max(target, 0.45);
          target = Math.max(target, this.heat);
          this.tickPlayerBeds(m, me, dt);
        } else {
          dead = true;
          target = 0.1;
        }
      }
      // 后期逐渐紧张；任一方水晶暴露或残血时拉满
      tension = Math.max(0, Math.min(0.5, (state.time - 420) / 400));
      for (const c of this.cores) {
        if (!c.alive) continue;
        if (!c.invulnerable) tension = Math.max(tension, 0.65);
        const r = c.hp / Math.max(1, c.stats.maxHp);
        if (r < 0.6) tension = Math.max(tension, 0.65 + ((0.6 - r) / 0.6) * 0.35);
      }
      if ((++this.frame & 3) === 0) this.trackAreas(state);
    }

    this.heat *= Math.exp(-dt / 3);
    // 进战斗快、出战斗慢：打完之后紧张感再延续几秒
    const tau = target > this.intensity ? 0.7 : 4;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / tau));
    this.tension += (tension - this.tension) * (1 - Math.exp(-dt / 3));
    music.setMood(this.ovI ?? this.intensity, this.ovT ?? this.tension);
    if (dead !== this.toneDead) {
      this.toneDead = dead;
      m.setMusicTone(dead ? 700 : 20000);
    }
    music.tick();
  }

  /** 跟随玩家状态的持续声与提示：濒死心跳、回城引导、荆轲「得手」 */
  private tickPlayerBeds(m: Mixer, me: HeroUnit, dt: number): void {
    const ratio = me.hp / Math.max(1, me.stats.maxHp);
    if (ratio < 0.25 && me.hp > 0) {
      this.hbTimer -= dt;
      if (this.hbTimer <= 0) {
        const danger = 1 - ratio / 0.25;
        m.play('heartbeat', { gain: 0.6 + 0.4 * danger });
        this.hbTimer = 0.95 - 0.25 * danger;
      }
    } else {
      this.hbTimer = 0;
    }
    let recall = 0;
    let shadow = 0;
    for (const b of me.buffs) {
      if (b.id === 'recall') recall = b.timeLeft;
      else if (b.id === 'yeque_shadow') shadow = b.timeLeft;
    }
    // 荆轲「得手」：状态刚挂上(或被新的击杀刷新)的那一刻，响一声冷的击弦泛音提示技能已刷新
    if (shadow > this.shadowLeft + 0.2) m.play('yeque_refresh');
    this.shadowLeft = shadow;
    if (recall > 0.3 && !this.recallVoice) {
      this.recallVoice = m.play('recall_channel', { dur: Math.max(1, recall) });
    } else if (recall <= 0 && this.recallVoice) {
      // 被打断或已完成：收掉引导声
      this.recallVoice.stop(0.12);
      this.recallVoice = null;
    }
  }

  /** 跟随单位移动的区域铺底：更新声像；区域意外消失时收掉 */
  private trackAreas(state: GameState): void {
    if (this.areaVoices.size === 0) return;
    this.areaVoices.forEach((a, id) => {
      let found = false;
      for (const ar of state.areas) {
        if (ar.id !== id) continue;
        found = true;
        if (this.locate(ar.pos, SFX[a.key].range + 4, 0)) a.h.set(a.gain * this.spGain, this.spPan);
        else a.h.set(0, 0);
        break;
      }
      if (!found) {
        a.h.stop(0.25);
        this.areaVoices.delete(id);
      }
    });
  }
}

const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const;

function noop(): void {
  // resume/suspend/close 被浏览器拒绝时不需要处理
}
