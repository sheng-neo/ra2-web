/**
 * 新手引导脚本（纯状态机：只读 GameState 与事件，不碰 DOM、不引用主题模块，可在 Node 里单测）。
 *
 * 六课九步：移动(动一动 → 去本路) → 普攻补兵(普攻 → 补兵) → 放技能 → 回城与出装(回城 → 商店) → 推塔 → 获胜。
 * 每一步三个阶段：
 *   wait  等触发，不出卡（这段时间顶部的指引位留给「当前目标」）；
 *   show  出卡，等玩家做到，或者超时；
 *   check 做到了：卡片打勾停 0.8 秒，再换下一步。超时不打勾，直接换。
 * 不卡死的保证：每一步都有超时；轮到某一步时发现玩家早就做过，直接跳过；
 * 玩家阵亡时卡片隐藏、计时暂停，复活后继续当前步。
 *
 * 计时一律用模拟时间(state.time 的增量)：暂停时不走，加速调试时与对局同步。
 * 文案里的富文本标记：`键位` 与 **强调**，由 parseGuideText 拆成片段给界面渲染。
 */
import { HEROES } from '../../core/data/heroes';
import { MONSTERS } from '../../core/data/units';
import type { GameEvent, GameState, HeroUnit, MinionUnit, Unit, Vec2 } from '../../core/types';
import type { InputMode } from './common';
import { OBJECTIVE_TUNE, laneTowerSpot, minionsUnder, nearestBuffCamp } from './objective-rules';
import { towerName } from './text';

export type GuideStepId = 'move' | 'go' | 'attack' | 'lasthit' | 'skill' | 'recall' | 'shop' | 'push' | 'win';
export type GuideTipId = 'tip_tower' | 'tip_bush' | 'tip_s2' | 'tip_ult' | 'tip_buff_blue' | 'tip_buff_red';
/** 要打光圈的控件 */
export type GuideControl = 'joystick' | 'attack' | 's1' | 'recall' | 'shop';
export type GuidePhase = 'wait' | 'show' | 'check';

/** 六课的名字(卡片标题、进度点) */
export const GUIDE_LESSONS = ['移动', '普攻补兵', '放技能', '回城与出装', '推塔', '获胜'] as const;
export const GUIDE_ORDER: readonly GuideStepId[] = ['move', 'go', 'attack', 'lasthit', 'skill', 'recall', 'shop', 'push', 'win'];
const STEP_LESSON: Record<GuideStepId, number> = { move: 1, go: 1, attack: 2, lasthit: 2, skill: 3, recall: 4, shop: 4, push: 5, win: 6 };

/** 各步的门槛(米 / 秒 / 次数) */
export const GUIDE_TUNE = {
  /** 开打后多久出第一张卡(让「对战开始」横幅先播完) */
  startAt: 2,
  moveDist: 8,
  moveTimeout: 30,
  goDist: 12,
  goTimeout: 60,
  /** 敌方小兵(打野：野怪)进到这个距离才教普攻；等太久就直接教 */
  nearEnemy: 14,
  /**
   * 智能普攻够得着的距离 = 射程 + 这个数。模拟层按下普攻键时只在射程外 7 米内找目标(core/hero.ts 的 ATTACK_SEEK)，
   * 这里留 1 米余量：敌人在 14 米内但还够不着时，卡片先叫玩家走近，免得照着做了却没反应。
   */
  attackReach: 6,
  attackWait: 90,
  attackTimeout: 45,
  lastHits: 2,
  monsterKills: 1,
  lasthitTimeout: 60,
  skillTimeout: 40,
  /** 回城：残血且脱战持续一会儿就教；否则放完技能 60 秒后教 */
  recallHp: 0.4,
  recallHpHold: 1.5,
  recallHpOk: 0.6,
  recallAfter: 60,
  recallTimeout: 45,
  shopTimeout: 12,
  /** 推塔：我方小兵进了敌塔射程、人在这个距离内就教；到这个时间点还没教就直接教 */
  pushDist: 22,
  pushAt: 240,
  /** 打到塔之后卡片再留多久 */
  pushLinger: 20,
  pushTimeout: 40,
  winShow: 8,
  outroShow: 3,
  checkShow: 0.8,
  tipShow: 5,
  tipGap: 15,
} as const;

export interface GuideCard {
  kind: 'step' | 'tip' | 'outro';
  id: GuideStepId | GuideTipId | 'outro';
  /** 第几课(1..6)；小贴士沿用当前课，结束语为 6 */
  lesson: number;
  title: string;
  /** 带富文本标记的正文 */
  text: string;
  /** 打勾状态(刚做到) */
  done: boolean;
  /** 警告色(塔在打你) */
  warn: boolean;
}

export interface GuideView {
  /** 现在该显示的卡；null = 不显示(等触发 / 阵亡 / 已结束) */
  card: GuideCard | null;
  /** 当前在第几课(1..6) */
  lesson: number;
  /** 六课各自是否已完成(进度点) */
  lessonsDone: readonly boolean[];
  highlight: GuideControl | null;
  /** 场景箭头指向的地方 */
  arrow: { pos: Vec2; label: string } | null;
  /** 小地图脉冲圈 */
  minimap: Vec2 | null;
  finished: boolean;
}

export interface GuideInput {
  state: GameState;
  me: HeroUnit;
  mode: InputMode;
  /** 商店面板是否开着 */
  shopOpen: boolean;
  /** 「当前目标提示」是否开着(决定结束语怎么说) */
  objectiveHints: boolean;
}

/** 富文本片段：普通文字 / 键位 / 强调 */
export interface GuideSeg {
  t: 'text' | 'key' | 'bold';
  s: string;
}

/** 把 `键位` 与 **强调** 标记拆成片段 */
export function parseGuideText(text: string): GuideSeg[] {
  const out: GuideSeg[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'key', s: m[1] });
    else out.push({ t: 'bold', s: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}

/** 去掉标记后的纯文字(无障碍朗读、测试用) */
export function plainGuideText(text: string): string {
  return parseGuideText(text)
    .map((x) => x.s)
    .join('');
}

const d2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

function hasBuff(u: Unit, id: string): boolean {
  for (const b of u.buffs) if (b.id === id) return true;
  return false;
}

interface PendingTip {
  id: GuideTipId;
  text: string;
  warn: boolean;
  /** 过了这个模拟时间还没轮到就作废(情境已经过去了) */
  expire: number;
  /** 可以打断步骤卡(只有「塔在打你」) */
  urgent: boolean;
}

export class GuideScript {
  private readonly team: 0 | 1;
  private readonly playerId: number;
  private readonly jungler: boolean;
  private readonly foeTowerIds = new Set<number>();

  // ── 步骤机 ──
  private cur: GuideStepId | 'outro' | 'end' = 'move';
  private phase: GuidePhase = 'wait';
  /** 当前阶段已经过的时间(只在玩家存活时累计) */
  private tPhase = 0;
  private readonly done: Record<GuideStepId, boolean> = { move: false, go: false, attack: false, lasthit: false, skill: false, recall: false, shop: false, push: false, win: false };
  /** 回城：'low' = 残血触发(不超时，血回上来就收)；'timed' = 到点触发。推塔：'minions' = 兵进塔了；'late' = 到点触发 */
  private variant: 'low' | 'timed' | 'minions' | 'late' | '' = '';
  private target: Vec2 | null = null;
  private targetLabel = '';
  private targetId = -1;
  private skipped = false;

  // ── 一直在记的事实(「已经做过」的依据) ──
  private lastTime: number;
  private lastPos: Vec2;
  private moved = 0;
  private attacked = false;
  private lastHits = 0;
  private monsterKills = 0;
  private casted = false;
  private recallDone = false;
  private leftFountain = false;
  private backAtFountain = false;
  private shopOpened = false;
  private autoBought = false;
  /** 打到敌塔之后累计的存活时间；-1 = 还没打到过 */
  private sinceTowerHit = -1;
  /** 放技能那一步结束后累计的存活时间；-1 = 还没到 */
  private sinceSkill = -1;
  private lowHpFor = 0;
  private scanAt = -1;
  private enemyNear = false;
  /** 按下普攻键就打得到的距离内有没有目标 */
  private enemyInReach = false;

  // ── 情境小贴士 ──
  private readonly seenTips = new Set<GuideTipId>();
  private readonly pendingTips: PendingTip[] = [];
  private activeTip: PendingTip | null = null;
  private tipLeft = 0;
  private lastTipEnd = -Infinity;
  private s2Level: number;
  private ultLevel: number;

  private readonly view: { card: GuideCard | null; lesson: number; lessonsDone: boolean[]; highlight: GuideControl | null; arrow: { pos: Vec2; label: string } | null; minimap: Vec2 | null; finished: boolean } = {
    card: null,
    lesson: 1,
    lessonsDone: [false, false, false, false, false, false],
    highlight: null,
    arrow: null,
    minimap: null,
    finished: false,
  };

  constructor(state: GameState, me: HeroUnit) {
    this.team = me.team;
    this.playerId = me.id;
    this.jungler = me.lane === 'jungle';
    this.lastTime = state.time;
    this.lastPos = { x: me.pos.x, y: me.pos.y };
    this.s2Level = me.skills.s2.level;
    this.ultLevel = me.skills.ult.level;
    for (const u of state.units) if (u.kind === 'tower' && u.team !== me.team) this.foeTowerIds.add(u.id);
  }

  get finished(): boolean {
    return this.cur === 'end';
  }

  /** 玩家点了「跳过引导」 */
  skip(): void {
    this.skipped = true;
    this.cur = 'end';
    this.activeTip = null;
    this.pendingTips.length = 0;
  }

  /** 调试 / 测试用的快照 */
  debug(): { step: string; phase: GuidePhase; variant: string; t: number; done: GuideStepId[]; tips: GuideTipId[]; tip: GuideTipId | null; skipped: boolean; moved: number; lastHits: number } {
    return {
      step: this.cur,
      phase: this.phase,
      variant: this.variant,
      t: this.tPhase,
      done: GUIDE_ORDER.filter((id) => this.done[id]),
      tips: [...this.seenTips],
      tip: this.activeTip ? this.activeTip.id : null,
      skipped: this.skipped,
      moved: this.moved,
      lastHits: this.jungler ? this.monsterKills : this.lastHits,
    };
  }

  onEvent(ev: GameEvent, state: GameState): void {
    const pid = this.playerId;
    switch (ev.type) {
      case 'attack':
        if (ev.unitId === pid) this.attacked = true;
        break;
      case 'gold':
        if (ev.unitId !== pid) break;
        if (ev.reason === 'lasthit') this.lastHits++;
        else if (ev.reason === 'monster') this.monsterKills++;
        break;
      case 'skillCast':
        if (ev.unitId === pid && (ev.slot === 's1' || ev.slot === 's2' || ev.slot === 'ult')) this.casted = true;
        break;
      case 'fx':
        if (ev.key === 'recall_done' && ev.unitId === pid) this.recallDone = true;
        break;
      case 'itemBought':
        // 开局那双草鞋不算：那时候人还在泉水，讲商店太早
        if (ev.unitId === pid && ev.auto === true && state.time > 5) this.autoBought = true;
        break;
      case 'damage':
        if (ev.sourceId === pid && this.sinceTowerHit < 0 && this.foeTowerIds.has(ev.targetId)) this.sinceTowerHit = 0;
        break;
      default:
        break;
    }
  }

  /** 每帧(或每 tick)调用一次，返回这一刻该显示什么。返回的对象会被复用，不要长期持有 */
  update(inp: GuideInput): GuideView {
    const { state, me } = inp;
    const T = GUIDE_TUNE;
    const v = this.view;
    let dt = state.time - this.lastTime;
    this.lastTime = state.time;
    if (!(dt > 0)) dt = 0;
    else if (dt > 5) dt = 5;

    if (this.step() === 'end') return this.hidden(true);
    if (inp.shopOpen) this.shopOpened = true;

    // 位移累计：瞬移(回城、复活、闪现)不算。帧率低时一帧走的路可以超过 2 米，按移速放宽
    const step = Math.sqrt(d2(me.pos, this.lastPos));
    if (me.alive && step <= Math.max(2, me.stats.moveSpeed * dt * 1.5 + 0.5)) this.moved += step;
    this.lastPos.x = me.pos.x;
    this.lastPos.y = me.pos.y;

    if (state.over || !me.alive) return this.hidden(false);

    // 「出过门」按离泉水的距离算(开局头一帧泉水的回复状态还没挂上，不能只看状态)；出过门之后再挂上泉水状态 = 回来了
    const inFountain = hasBuff(me, 'fountain');
    const base = state.map.bases[this.team];
    const away = base.fountainRadius + 4;
    if (d2(me.pos, base.fountain) > away * away) {
      this.leftFountain = true;
      this.backAtFountain = false;
    } else if (inFountain && this.leftFountain) this.backAtFountain = true;
    if (this.sinceSkill >= 0) this.sinceSkill += dt;
    if (this.sinceTowerHit >= 0) this.sinceTowerHit += dt;
    const hpRatio = me.hp / Math.max(1, me.stats.maxHp);
    this.lowHpFor = hpRatio < T.recallHp && !me.inCombat && !inFountain ? this.lowHpFor + dt : 0;

    // 比较重的扫描(周围有没有敌人、小贴士的触发)每 0.2 秒做一次
    const rescan = state.time - this.scanAt >= 0.2 || state.time < this.scanAt;
    if (rescan) {
      this.scanAt = state.time;
      this.scanNear(state, me);
      this.detectTips(inp);
    }
    this.levelTips(inp);

    // ── 小贴士的生命周期 ──
    if (this.activeTip) {
      this.tipLeft -= dt;
      if (this.tipLeft <= 0) {
        this.activeTip = null;
        this.lastTipEnd = state.time;
      }
    }

    // ── 步骤机 ──
    // 小贴士盖着步骤卡的时候，步骤卡的计时先停(玩家读不到它)；等触发的计时照走
    if (!(this.activeTip && this.phase !== 'wait')) this.tPhase += dt;
    for (let guard = 0; guard < 16; guard++) {
      const cur = this.step();
      if (cur === 'end') return this.hidden(true);
      if (cur === 'outro') {
        if (this.tPhase >= T.outroShow) {
          this.cur = 'end';
          continue;
        }
        break;
      }
      if (this.phase === 'wait') {
        // 等回城触发的空档里，如果自动出装买了东西，先讲商店
        if (cur === 'recall' && !this.done.shop && this.autoBought && !this.shopOpened) {
          this.enter('shop', state, me);
          continue;
        }
        if (this.alreadyDone(cur, me)) {
          this.finish(cur, state, me);
          continue;
        }
        if (this.trigger(cur, state, me)) {
          this.phase = 'show';
          this.tPhase = 0;
          continue;
        }
        break;
      }
      if (this.phase === 'show') {
        if (this.completed(cur, state, me)) {
          // 「获胜」那一课只是读完，不打勾
          if (cur === 'win') {
            this.finish(cur, state, me);
            continue;
          }
          this.phase = 'check';
          this.tPhase = 0;
          break;
        }
        if (cur === 'recall' && this.variant === 'low') {
          // 残血版不超时；血回上来了就收起。已经过了定时版的时间点就算学过了，不再唠叨第二遍
          if (hpRatio >= T.recallHpOk) {
            if (this.sinceSkill >= T.recallAfter) this.finish(cur, state, me);
            else {
              this.phase = 'wait';
              this.tPhase = 0;
              this.lowHpFor = 0;
            }
            continue;
          }
          break;
        }
        if (this.tPhase >= this.timeout(cur)) {
          this.finish(cur, state, me);
          continue;
        }
        break;
      }
      // check
      if (this.tPhase >= T.checkShow) {
        this.finish(cur, state, me);
        continue;
      }
      break;
    }

    // ── 轮到小贴士了吗 ──
    if (!this.activeTip && this.pendingTips.length > 0) {
      for (let i = this.pendingTips.length - 1; i >= 0; i--) {
        if (this.pendingTips[i].expire >= state.time) continue;
        // 没轮到就过期的：情境已经过去，下次再遇到时重新提示
        this.seenTips.delete(this.pendingTips[i].id);
        this.pendingTips.splice(i, 1);
      }
      const cardBusy = this.cur === 'outro' || this.phase !== 'wait';
      if (state.time - this.lastTipEnd >= T.tipGap) {
        const i = this.pendingTips.findIndex((t) => t.urgent || !cardBusy);
        if (i >= 0) {
          this.activeTip = this.pendingTips[i];
          this.pendingTips.splice(i, 1);
          this.tipLeft = T.tipShow;
        }
      }
    }

    // ── 输出 ──
    const cur = this.step();
    if (cur === 'end') return this.hidden(true);
    v.finished = false;
    v.lesson = cur === 'outro' ? 6 : STEP_LESSON[cur];
    v.lessonsDone.fill(true);
    for (const id of GUIDE_ORDER) if (!this.done[id]) v.lessonsDone[STEP_LESSON[id] - 1] = false;
    v.highlight = null;
    v.arrow = null;
    v.minimap = null;
    if (this.activeTip) {
      v.card = { kind: 'tip', id: this.activeTip.id, lesson: v.lesson, title: '小贴士', text: this.activeTip.text, done: false, warn: this.activeTip.warn };
    } else if (cur === 'outro') {
      v.card = { kind: 'outro', id: 'outro', lesson: 6, title: '引导结束', text: inp.objectiveHints ? '引导结束，接下来看屏幕上方的目标提示。' : '引导结束，祝你旗开得胜！', done: true, warn: false };
    } else if (this.phase === 'wait') {
      v.card = null;
    } else {
      v.card = { kind: 'step', id: cur, lesson: v.lesson, title: GUIDE_LESSONS[v.lesson - 1], text: this.text(cur, inp), done: this.phase === 'check', warn: false };
    }
    // 指示只跟着步骤卡走(小贴士盖着的时候箭头照指，免得一闪一闪)
    if (cur !== 'outro' && this.phase === 'show') {
      if (!this.activeTip) v.highlight = this.highlightOf(cur, inp.mode);
      if ((cur === 'go' || cur === 'push') && this.target) {
        v.arrow = { pos: this.target, label: this.targetLabel };
        v.minimap = this.target;
      } else if (cur === 'win') v.minimap = state.map.bases[this.team === 0 ? 1 : 0].core;
    }
    return v;
  }

  // ───────────── 内部 ─────────────

  /** 当前步(经函数读一遍：步骤在别的方法里被改写，不让类型收窄记住旧值) */
  private step(): GuideStepId | 'outro' | 'end' {
    return this.cur;
  }

  private hidden(finished: boolean): GuideView {
    const v = this.view;
    v.card = null;
    v.highlight = null;
    v.arrow = null;
    v.minimap = null;
    v.finished = finished;
    if (finished) v.lessonsDone.fill(true);
    return v;
  }

  /** 进入某一步的等待阶段 */
  private enter(id: GuideStepId, state: GameState, me: HeroUnit): void {
    this.cur = id;
    this.phase = 'wait';
    this.tPhase = 0;
    this.variant = '';
    this.target = null;
    this.targetLabel = '';
    this.targetId = -1;
    if (id === 'go') {
      if (this.jungler) {
        const camp = nearestBuffCamp(state, me);
        if (camp) {
          this.target = camp.pos;
          this.targetLabel = MONSTERS[camp.monsterType].name;
        }
      } else if (me.lane !== 'jungle') {
        this.target = laneTowerSpot(state, this.team, me.lane);
        // 第 5 课的箭头会指向敌方的同名塔：两处都写明是哪一方的
        this.targetLabel = `我方${towerName(me.lane, 1)}`;
      }
    }
  }

  /** 一步结束(做到 / 超时 / 早就做过)：记下来，换到下一个没做的 */
  private finish(id: GuideStepId, state: GameState, me: HeroUnit): void {
    this.done[id] = true;
    if (id === 'skill' && this.sinceSkill < 0) this.sinceSkill = 0;
    const next = GUIDE_ORDER.find((x) => !this.done[x]);
    if (!next) {
      this.cur = 'outro';
      this.phase = 'show';
      this.tPhase = 0;
      this.target = null;
      return;
    }
    this.enter(next, state, me);
  }

  private alreadyDone(id: GuideStepId, me: HeroUnit): boolean {
    const T = GUIDE_TUNE;
    switch (id) {
      case 'move':
        return this.moved >= T.moveDist;
      case 'go':
        return !this.target || d2(me.pos, this.target) < T.goDist * T.goDist;
      case 'attack':
        return this.attacked;
      case 'lasthit':
        return this.jungler ? this.monsterKills >= T.monsterKills : this.lastHits >= T.lastHits;
      case 'skill':
        return this.casted;
      case 'recall':
        // 只有真的按过回城才算早就会了：阵亡复活回到泉水不算
        return this.recallDone;
      case 'shop':
        return this.shopOpened;
      case 'push':
        return this.sinceTowerHit >= 0;
      default:
        return false;
    }
  }

  private trigger(id: GuideStepId, state: GameState, me: HeroUnit): boolean {
    const T = GUIDE_TUNE;
    switch (id) {
      case 'move':
        return state.time >= T.startAt;
      case 'attack':
        return this.enemyNear || this.tPhase >= T.attackWait;
      case 'recall':
        if (this.lowHpFor >= T.recallHpHold) {
          this.variant = 'low';
          return true;
        }
        if (this.sinceSkill >= T.recallAfter) {
          this.variant = 'timed';
          return true;
        }
        return false;
      case 'push': {
        const t = this.findPushTower(state, me);
        if (t) {
          this.variant = 'minions';
          this.setTower(t);
          return true;
        }
        if (state.time >= T.pushAt) {
          const late = this.frontTower(state, me);
          if (late) {
            this.variant = 'late';
            this.setTower(late);
          }
          // 敌塔全没了也照常往下走(水晶那一课接手)
          return true;
        }
        return false;
      }
      default:
        return true;
    }
  }

  private completed(id: GuideStepId, state: GameState, me: HeroUnit): boolean {
    const T = GUIDE_TUNE;
    switch (id) {
      case 'move':
        return this.moved >= T.moveDist;
      case 'go':
        return !this.target || d2(me.pos, this.target) < T.goDist * T.goDist;
      case 'attack':
        return this.attacked;
      case 'lasthit':
        return this.jungler ? this.monsterKills >= T.monsterKills : this.lastHits >= T.lastHits;
      case 'skill':
        return this.casted;
      case 'recall':
        // 按了回城、走回泉水、阵亡复活，都算学到了「回泉水补状态」
        return this.recallDone || this.backAtFountain;
      case 'shop':
        return this.shopOpened;
      case 'push': {
        if (this.sinceTowerHit >= T.pushLinger) return true;
        // 指着的那座塔没了(自己推的或队友推的)：这一课的情境结束
        if (this.targetId >= 0 && !state.units.some((u) => u.id === this.targetId && u.alive)) return true;
        return false;
      }
      case 'win':
        return this.tPhase >= T.winShow;
      default:
        return false;
    }
  }

  private timeout(id: GuideStepId): number {
    const T = GUIDE_TUNE;
    switch (id) {
      case 'move':
        return T.moveTimeout;
      case 'go':
        return T.goTimeout;
      case 'attack':
        return T.attackTimeout;
      case 'lasthit':
        return T.lasthitTimeout;
      case 'skill':
        return T.skillTimeout;
      case 'recall':
        return T.recallTimeout;
      case 'shop':
        return T.shopTimeout;
      case 'push':
        return T.pushTimeout;
      default:
        return T.winShow;
    }
  }

  private highlightOf(id: GuideStepId, mode: InputMode): GuideControl | null {
    switch (id) {
      case 'move':
        return mode === 'touch' ? 'joystick' : null;
      case 'attack':
        return 'attack';
      case 'skill':
        return 's1';
      case 'recall':
        return 'recall';
      case 'shop':
        return 'shop';
      default:
        return null;
    }
  }

  private text(id: GuideStepId, inp: GuideInput): string {
    const kbm = inp.mode === 'kbm';
    const me = inp.me;
    switch (id) {
      case 'move':
        return kbm ? '按 `W` `A` `S` `D` 移动，或鼠标右键点地面。' : '拖动左下角的摇杆移动。';
      case 'go':
        if (this.jungler) return `你是打野：跟着箭头去**${this.targetLabel}**，打野怪升级。`;
        return `跟着箭头去**${this.targetLabel}**，小兵马上就到。`;
      case 'attack': {
        // 敌人还够不着时先叫人走近：照着卡片按了键却没反应，是最糟的第一印象
        const who = this.jungler ? '野怪' : '敌方小兵';
        if (!this.enemyInReach) return kbm ? `走近${who}，再按 \`空格\` 普攻。` : `走近${who}，再按住右下角的大按钮普攻。`;
        return kbm ? '按 `空格` 普攻，会自动打最合适的敌人。' : '按住右下角的大按钮普攻。';
      }
      case 'lasthit':
        if (this.jungler) return `把野怪打死，金币和经验都归你。(${Math.min(this.monsterKills, GUIDE_TUNE.monsterKills)}/${GUIDE_TUNE.monsterKills})`;
        return `小兵快死时补上**最后一击**，金币全拿。(${Math.min(this.lastHits, GUIDE_TUNE.lastHits)}/${GUIDE_TUNE.lastHits})`;
      case 'skill': {
        const brief = HEROES[me.heroId].skills.s1.brief;
        const what = brief ? `：${brief}。` : '。';
        return kbm ? `按 \`Q\` 放一技能${what}按住能看到范围，松开施放。` : `轻点一技能${what}按住拖动可以自己瞄准。`;
      }
      case 'recall':
        return kbm ? '血少了就按 `B` 回城：原地站 5 秒，回泉水很快补满。' : '血少了就点「回城」：原地站 5 秒，回泉水很快补满。';
      case 'shop':
        if (me.autoBuy) return kbm ? '金币够了会**自动购买**推荐装备。想自己挑，按 `P` 打开商店。' : '金币够了会**自动购买**推荐装备。想自己挑，点小地图下面的商店。';
        return kbm ? '金币够了就按 `P` 打开商店，照着**推荐**页买下一件。' : '金币够了就点小地图下面的商店，照着**推荐**页买下一件。';
      case 'push':
        if (this.variant === 'late') return '塔会先打小兵：等小兵进塔再上去打，塔下没兵就退出来。';
        return '小兵进塔了！塔会先打小兵，趁现在打塔。塔下没兵就退出来。';
      default:
        return '一路打掉 **一塔 → 二塔 → 高地塔**，就能打水晶。水晶爆了就赢！';
    }
  }

  private setTower(t: Unit): void {
    this.target = { x: t.pos.x, y: t.pos.y };
    this.targetId = t.id;
    this.targetLabel = t.kind === 'tower' ? `敌方${towerName(t.lane, t.tier)}` : '敌方防御塔';
  }

  /** 我方小兵已经进了射程、人也离得不远的那座敌塔 */
  private findPushTower(state: GameState, me: HeroUnit): Unit | null {
    const r2 = GUIDE_TUNE.pushDist * GUIDE_TUNE.pushDist;
    let minions: MinionUnit[] | null = null;
    for (const u of state.units) {
      if (u.kind !== 'tower' || !u.alive || u.team === this.team || u.invulnerable) continue;
      if (d2(u.pos, me.pos) > r2) continue;
      if (!minions) {
        minions = [];
        for (const m of state.units) if (m.kind === 'minion' && m.alive && m.team === this.team) minions.push(m);
      }
      if (minionsUnder(u, minions)) return u;
    }
    return null;
  }

  /** 到点还没推过塔：指向本路(打野取最近)当前打得动的那座敌塔 */
  private frontTower(state: GameState, me: HeroUnit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of state.units) {
      if (u.kind !== 'tower' || !u.alive || u.team === this.team || u.invulnerable) continue;
      const d = me.lane !== 'jungle' && u.lane === me.lane ? -1 : d2(u.pos, me.pos);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  /** 周围有没有该打的东西(对线英雄看敌方小兵，打野看野怪)，以及按下普攻键够不够得着 */
  private scanNear(state: GameState, me: HeroUnit): void {
    const r2 = GUIDE_TUNE.nearEnemy * GUIDE_TUNE.nearEnemy;
    const reach = me.stats.attackRange + GUIDE_TUNE.attackReach;
    this.enemyNear = false;
    this.enemyInReach = false;
    for (const u of state.units) {
      if (!u.alive) continue;
      const hit = this.jungler ? u.kind === 'monster' : u.kind === 'minion' && u.team !== this.team && u.visible[this.team];
      if (!hit) continue;
      const dd = d2(u.pos, me.pos);
      if (dd > r2) continue;
      this.enemyNear = true;
      const r = reach + u.radius;
      if (dd <= r * r) {
        this.enemyInReach = true;
        return;
      }
    }
  }

  private queueTip(id: GuideTipId, text: string, state: GameState, ttl: number, warn = false, urgent = false): void {
    if (this.seenTips.has(id)) return;
    this.seenTips.add(id);
    this.pendingTips.push({ id, text, warn, urgent, expire: state.time + ttl });
  }

  /** 技能解锁的提示(每帧看一眼等级，便宜) */
  private levelTips(inp: GuideInput): void {
    const { me, state } = inp;
    const kbm = inp.mode === 'kbm';
    const def = HEROES[me.heroId];
    if (me.skills.s2.level > 0 && this.s2Level === 0) {
      const brief = def.skills.s2.brief;
      this.queueTip('tip_s2', `二技能解锁了${brief ? `：${brief}` : ''}。${kbm ? '按 `E` 施放。' : ''}`, state, 40);
    }
    if (me.skills.ult.level > 0 && this.ultLevel === 0) {
      const brief = def.skills.ult.brief;
      this.queueTip('tip_ult', `大招解锁了${brief ? `：${brief}` : ''}。${kbm ? '按 `R` 施放。' : ''}`, state, 40);
    }
    this.s2Level = me.skills.s2.level;
    this.ultLevel = me.skills.ult.level;
  }

  /** 情境触发：被塔打、进草丛、靠近蓝 / 红buff */
  private detectTips(inp: GuideInput): void {
    const { state, me } = inp;
    if (!this.seenTips.has('tip_tower')) {
      for (const b of me.buffs) {
        if (b.id !== 'tower_focus') continue;
        const tower = state.units.find((u) => u.id === b.sourceId);
        if (!tower) continue;
        // 锁定状态会多挂几秒：人已经跑出射程就不用再喊了(与目标行的同一条规则同口径)
        const reach = tower.stats.attackRange + me.radius + OBJECTIVE_TUNE.aggroPad[0];
        if (d2(tower.pos, me.pos) > reach * reach) break;
        const minions: MinionUnit[] = [];
        for (const m of state.units) if (m.kind === 'minion' && m.alive && m.team === this.team) minions.push(m);
        if (!minionsUnder(tower, minions)) this.queueTip('tip_tower', '塔在打你！塔下没有小兵别硬冲，越打越疼。', state, 3, true, true);
        break;
      }
    }
    if (me.bushId >= 0) this.queueTip('tip_bush', '草丛里敌人看不见你；出手会暴露 1.5 秒。', state, 4);
    if (!this.seenTips.has('tip_buff_blue') || !this.seenTips.has('tip_buff_red')) {
      const r2 = GUIDE_TUNE.nearEnemy * GUIDE_TUNE.nearEnemy;
      for (const u of state.units) {
        if (u.kind !== 'monster' || !u.alive) continue;
        if (u.monsterType !== 'frost_golem' && u.monsterType !== 'ember_golem') continue;
        if (d2(u.pos, me.pos) > r2) continue;
        const def = MONSTERS[u.monsterType];
        this.queueTip(u.monsterType === 'frost_golem' ? 'tip_buff_blue' : 'tip_buff_red', `**${def.name}**：${def.reward ?? '打掉它有增益'}。`, state, 25);
      }
    }
  }
}
