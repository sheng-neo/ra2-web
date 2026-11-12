/**
 * 程序化配乐。四首曲子共用一个音集(C 大调的七个音)和同一个「星陨」主题动机
 *   D – A – G – F – E – C – D   (上跳五度后级进下行，绕到七级再回主音)
 * - menu   ：F 利底亚，66 BPM，铺底 + 钟琴主题 + 琶音 + 随机星点。
 * - battle ：D 多利亚，108 BPM，16 小节 A/B 曲式；「探索层」与「战斗层」同步编排、按强度交叉淡变。
 * - victory：D 大调号角式主题(主题动机的大调变形)，约 8 秒，之后停在持续的 Dadd9 铺底上。
 * - defeat ：D 小调下行变形，约 9.6 秒，之后停在空五度的低音铺底上。
 * 调度器按 AudioContext 时间提前排好接下来 ~0.3 秒的音符(lookahead)，离线渲染时一次排完整段。
 */
import type { MusicTrack } from './api';
import { bass, bell, brass, choir, clap, cymbal, flute, hat, horn, kick, pad, pluck, rim, shaker, snare, stab, swell, taiko, timpani } from './instruments';
import type { Mixer } from './mixer';
import { mtof } from './synth';
import type { Patch } from './synth';

const LOOKAHEAD = 0.3;

interface Layer {
  dry: GainNode;
  wet: GainNode;
  dly: GainNode;
}

interface ChanOpts {
  pan?: number;
  rev?: number;
  dly?: number;
  layer?: Layer;
}

/** [起始步, MIDI 音高, 时值(步), 力度] */
type Ev = readonly [number, number, number, number];

interface Chord {
  bass: number;
  pad: readonly number[];
}

function indexByStep(evs: readonly Ev[], steps: number): Ev[][] {
  const out: Ev[][] = [];
  for (let i = 0; i < steps; i++) out.push([]);
  for (const e of evs) out[e[0]].push(e);
  return out;
}

/** C 大调音阶内的上方三度(给旋律配和声) */
function thirdAbove(m: number): number {
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const pc = ((m % 12) + 12) % 12;
  const i = scale.indexOf(pc);
  if (i < 0) return m + 4;
  const j = i + 2;
  return m - pc + scale[j % 7] + (j >= 7 ? 12 : 0);
}

// ───────────────────────── 轨道基类 ─────────────────────────

abstract class Track {
  protected readonly m: Mixer;
  protected step = 0;
  protected nextT: number;
  /** 淡出后在此时刻销毁 */
  killAt = Infinity;
  private readonly out: GainNode;
  private readonly wetOut: GainNode;
  private readonly delayIn: GainNode;
  private nodes: AudioNode[] = [];

  constructor(m: Mixer, t0: number, delayTime: number) {
    this.m = m;
    this.nextT = t0;
    const c = m.ctx;
    this.out = this.keep(c.createGain());
    this.out.gain.value = 0;
    this.out.connect(m.musicIn);
    this.wetOut = this.keep(c.createGain());
    this.wetOut.gain.value = 0;
    this.wetOut.connect(m.musicRev);
    // 乒乓延迟：左右交替的回声，高频逐次衰减
    this.delayIn = this.keep(c.createGain());
    const dL = this.keep(c.createDelay(1.5));
    const dR = this.keep(c.createDelay(1.5));
    dL.delayTime.value = delayTime;
    dR.delayTime.value = delayTime;
    const fb1 = this.keep(c.createGain());
    const fb2 = this.keep(c.createGain());
    fb1.gain.value = 0.4;
    fb2.gain.value = 0.4;
    const damp = this.keep(c.createBiquadFilter());
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.delayIn.connect(dL);
    dL.connect(fb1);
    fb1.connect(damp);
    damp.connect(dR);
    dR.connect(fb2);
    fb2.connect(dL);
    if (m.kit.canPan) {
      const pL = this.keep(c.createStereoPanner());
      const pR = this.keep(c.createStereoPanner());
      pL.pan.value = -0.65;
      pR.pan.value = 0.65;
      dL.connect(pL);
      dR.connect(pR);
      pL.connect(this.out);
      pR.connect(this.out);
    } else {
      dL.connect(this.out);
      dR.connect(this.out);
    }
  }

  private keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  protected layer(v: number): Layer {
    const c = this.m.ctx;
    const mk = (dest: AudioNode): GainNode => {
      const g = this.keep(c.createGain());
      g.gain.value = v;
      g.connect(dest);
      return g;
    };
    return { dry: mk(this.out), wet: mk(this.wetOut), dly: mk(this.delayIn) };
  }

  protected setLayer(l: Layer, v: number, tc: number): void {
    const t = this.m.now();
    l.dry.gain.setTargetAtTime(v, t, tc);
    l.wet.gain.setTargetAtTime(v, t, tc);
    l.dly.gain.setTargetAtTime(v, t, tc);
  }

  /** 通道条：电平 + 声像 + 混响/延迟送入量 */
  protected chan(level: number, o: ChanOpts = {}): GainNode {
    const c = this.m.ctx;
    const g = this.keep(c.createGain());
    g.gain.value = level;
    let tail: AudioNode = g;
    if (o.pan && this.m.kit.canPan) {
      const p = this.keep(c.createStereoPanner());
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(o.layer ? o.layer.dry : this.out);
    if (o.rev) {
      const s = this.keep(c.createGain());
      s.gain.value = o.rev;
      tail.connect(s);
      s.connect(o.layer ? o.layer.wet : this.wetOut);
    }
    if (o.dly) {
      const s = this.keep(c.createGain());
      s.gain.value = o.dly;
      tail.connect(s);
      s.connect(o.layer ? o.layer.dly : this.delayIn);
    }
    return g;
  }

  protected play(ch: GainNode, t: number, fn: (p: Patch) => void): void {
    fn(this.m.note(ch, t));
  }

  protected rnd(): number {
    return this.m.kit.rnd();
  }

  fade(to: number, tc: number): void {
    const t = this.m.now();
    this.out.gain.setTargetAtTime(to, t, tc);
    this.wetOut.gain.setTargetAtTime(to, t, tc);
  }

  /** 把 [now, now+ahead) 内的步都排好。标签页被挂起后落后太多时直接跳过错过的步，不补排 */
  schedule(now: number, ahead: number): void {
    if (this.nextT < now - 0.1) {
      const sd = this.stepDur();
      const skip = Math.ceil((now - this.nextT) / sd);
      this.step += skip;
      this.nextT += skip * sd;
    }
    while (this.nextT < now + ahead) {
      const sd = this.stepDur();
      this.onStep(this.step, this.nextT, sd);
      this.nextT += sd;
      this.step++;
    }
  }

  mood(_intensity: number, _tension: number): void {
    // 默认无强度分层
  }

  dispose(): void {
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
  }

  protected abstract stepDur(): number;
  protected abstract onStep(i: number, t: number, sd: number): void;
}

// ───────────────────────── 菜单：F 利底亚 ─────────────────────────

const MENU_CHORDS: readonly Chord[] = [
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 41, pad: [55, 59, 62, 67] }, // G/F —— 利底亚的 II/I
  { bass: 40, pad: [55, 59, 62, 64] }, // Em7
  { bass: 45, pad: [55, 59, 60, 64] }, // Am9
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 43, pad: [55, 59, 62, 64] }, // G6
  { bass: 45, pad: [55, 59, 60, 64] }, // Am9
  { bass: 40, pad: [55, 60, 62, 64] }, // Cadd9/E
  { bass: 38, pad: [53, 57, 60, 64] }, // Dm9
  { bass: 40, pad: [55, 59, 62, 64] }, // Em7
  { bass: 41, pad: [57, 59, 60, 64] }, // Fmaj7#11
  { bass: 43, pad: [59, 62, 64, 67] }, // G6
  { bass: 38, pad: [53, 57, 60, 64] }, // Dm9
  { bass: 40, pad: [55, 59, 62, 64] }, // Em7
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 43, pad: [55, 60, 62, 67] }, // Gsus4(后半小节解决到 G)
];

const MENU_MEL = indexByStep([
  // A：主题陈述
  [0, 74, 2, 0.8], [2, 81, 3, 0.9], [5, 79, 1, 0.6], [6, 77, 2, 0.7], [8, 76, 2, 0.7], [10, 72, 2, 0.6], [12, 74, 4, 0.8],
  // 应答：整体上移一级
  [16, 76, 2, 0.75], [18, 83, 3, 0.85], [21, 81, 1, 0.6], [22, 79, 2, 0.7], [24, 76, 2, 0.65], [26, 74, 2, 0.55], [28, 76, 4, 0.7],
  // 发展：强调利底亚的升四级(B)
  [32, 81, 2, 0.8], [34, 84, 3, 0.9], [37, 83, 1, 0.65], [38, 81, 2, 0.7], [40, 79, 3, 0.75], [43, 76, 1, 0.55], [44, 79, 4, 0.7],
  [48, 81, 6, 0.8], [54, 79, 2, 0.6], [56, 76, 8, 0.7],
  // B：级进上行的模进
  [64, 77, 3, 0.7], [67, 76, 1, 0.5], [68, 74, 4, 0.65], [72, 79, 3, 0.72], [75, 77, 1, 0.5], [76, 76, 4, 0.65],
  [80, 81, 3, 0.78], [83, 79, 1, 0.55], [84, 83, 4, 0.75], [88, 86, 4, 0.85], [92, 83, 2, 0.65], [94, 79, 2, 0.6],
  [96, 77, 3, 0.7], [99, 76, 1, 0.5], [100, 74, 2, 0.6], [102, 81, 2, 0.7], [104, 79, 6, 0.72], [110, 76, 2, 0.55],
  // 主题尾句收束，最后两个音引回开头的 D
  [112, 76, 2, 0.7], [114, 72, 2, 0.6], [116, 74, 4, 0.75], [120, 79, 4, 0.65], [124, 71, 2, 0.5], [126, 72, 2, 0.55],
], 128);

const ARP_PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1, 2, 3],
  [0, 2, 1, 3, 0, 2, 3, 1],
  [3, 2, 1, 0, 1, 2, 3, 2],
];

class MenuTrack extends Track {
  private cPad = this.chan(1.0, { rev: 0.4 });
  private cBass = this.chan(0.7, { rev: 0.1 });
  private cBell = this.chan(0.85, { rev: 0.55, dly: 0.4 });
  private cFlute = this.chan(0.9, { rev: 0.5, dly: 0.25, pan: 0.15 });
  private cArp = this.chan(0.42, { rev: 0.35, dly: 0.35, pan: -0.25 });
  private cStarL = this.chan(0.55, { rev: 0.7, dly: 0.3, pan: -0.6 });
  private cStarR = this.chan(0.55, { rev: 0.7, dly: 0.3, pan: 0.6 });

  constructor(m: Mixer, t0: number) {
    super(m, t0, (60 / 66) * 0.75);
  }

  protected stepDur(): number {
    return 60 / 66 / 2;
  }

  protected onStep(i: number, t: number, sd: number): void {
    const loop = Math.floor(i / 128);
    const s = i % 128;
    const bar = s >> 3;
    const b = s & 7;
    const ch = MENU_CHORDS[bar];
    const last = bar === 15;

    if (b === 0) {
      const len = last ? sd * 4 : sd * 8;
      this.play(this.cPad, t, (p) => pad(p, ch.pad.map(mtof), 0, len, 0.9));
      this.play(this.cBass, t, (p) => bass(p, mtof(ch.bass), 0, sd * 7, 0.7));
    }
    if (last && b === 4) this.play(this.cPad, t, (p) => pad(p, [55, 59, 62, 67].map(mtof), 0, sd * 4, 0.9));
    if (b === 4 && bar % 2 === 1 && !last) this.play(this.cBass, t, (p) => bass(p, mtof(ch.bass + 7), 0, sd * 3, 0.4));

    // 旋律：偶数轮钟琴，奇数轮换成低八度的笛声；每四轮里有一轮的开头四小节留白
    const rest = loop % 4 === 2 && bar < 4;
    if (!rest) {
      for (const e of MENU_MEL[s]) {
        const len = e[2] * sd;
        if (loop % 2 === 0) this.play(this.cBell, t, (p) => bell(p, mtof(e[1]), 0, Math.max(1.6, len * 1.5), e[3]));
        else this.play(this.cFlute, t, (p) => flute(p, mtof(e[1] - 12), 0, len * 0.95, e[3]));
      }
    }

    // 琶音：第一轮的前四小节先不进，让音乐有个「呼吸」的开头
    if (loop > 0 || bar >= 4) {
      const pat = ARP_PATTERNS[(loop + (bar >> 2)) % ARP_PATTERNS.length];
      const n = ch.pad[pat[b]] + 12;
      const vel = b % 2 === 0 ? 0.55 : 0.38;
      this.play(this.cArp, t, (p) => pluck(p, mtof(n), 0, 0.5, vel));
    }

    // 星点：高音区随机闪烁的和弦音
    if (this.rnd() < 0.17) {
      const n = ch.pad[Math.floor(this.rnd() * ch.pad.length)] + 24 + (this.rnd() < 0.3 ? 12 : 0);
      const off = this.rnd() * sd * 0.6;
      const vel = 0.15 + this.rnd() * 0.22;
      this.play(this.rnd() < 0.5 ? this.cStarL : this.cStarR, t, (p) => bell(p, mtof(n), off, 1.3, vel));
    }
  }
}

// ───────────────────────── 对局：D 多利亚 ─────────────────────────

const C_DM: Chord = { bass: 38, pad: [53, 57, 62, 64] };
const C_C: Chord = { bass: 36, pad: [52, 55, 60, 62] };
const C_GB: Chord = { bass: 35, pad: [55, 57, 59, 62] };
const C_AM: Chord = { bass: 33, pad: [55, 57, 60, 64] };
const C_F: Chord = { bass: 41, pad: [53, 57, 60, 64] };
const C_G: Chord = { bass: 43, pad: [55, 59, 62, 64] };
const C_DMA: Chord = { bass: 33, pad: [57, 62, 64, 65] };
const C_A5: Chord = { bass: 33, pad: [57, 62, 64, 69] };

/** A 段每个和弦两小节(i – VII – IV – v)，B 段一小节一换，推向属功能的空五度 */
const BATTLE_CHORDS: readonly Chord[] = [C_DM, C_DM, C_C, C_C, C_GB, C_GB, C_AM, C_AM, C_F, C_G, C_AM, C_AM, C_F, C_G, C_DMA, C_A5];
/** 每小节起点处该和弦持续的小节数(0 = 延续上一小节) */
const BATTLE_HOLD: readonly number[] = [2, 0, 2, 0, 2, 0, 2, 0, 1, 1, 2, 0, 1, 1, 1, 1];

const BATTLE_MEL = indexByStep([
  // A：主题 → 应答 → 攀升 → 落在五级
  [0, 74, 4, 0.85], [4, 81, 6, 0.95], [10, 79, 2, 0.7], [12, 77, 4, 0.8], [16, 76, 4, 0.8], [20, 72, 4, 0.7], [24, 74, 8, 0.85],
  [32, 76, 4, 0.8], [36, 79, 6, 0.9], [42, 76, 2, 0.65], [44, 74, 4, 0.75], [48, 72, 4, 0.7], [52, 74, 4, 0.75], [56, 76, 8, 0.8],
  [64, 74, 4, 0.8], [68, 83, 6, 0.95], [74, 81, 2, 0.7], [76, 79, 4, 0.8], [80, 81, 4, 0.8], [84, 83, 4, 0.85], [88, 86, 8, 0.95],
  [96, 84, 6, 0.95], [102, 83, 2, 0.7], [104, 81, 4, 0.8], [108, 79, 4, 0.75], [112, 81, 6, 0.85], [118, 76, 2, 0.65], [120, 81, 8, 0.85],
  // B：3+3+2 的切分动机逐级上行
  [128, 81, 3, 0.9], [131, 81, 3, 0.8], [134, 84, 2, 0.85], [136, 81, 4, 0.85], [140, 77, 4, 0.75],
  [144, 83, 3, 0.9], [147, 83, 3, 0.8], [150, 86, 2, 0.85], [152, 83, 4, 0.85], [156, 79, 4, 0.75],
  [160, 84, 3, 0.92], [163, 84, 3, 0.82], [166, 88, 2, 0.9], [168, 86, 4, 0.88], [172, 84, 4, 0.8],
  [176, 81, 8, 0.85], [188, 76, 2, 0.65], [190, 79, 2, 0.7],
  [192, 81, 3, 0.9], [195, 81, 3, 0.8], [198, 84, 2, 0.85], [200, 81, 4, 0.85], [204, 77, 4, 0.75],
  [208, 83, 3, 0.9], [211, 83, 3, 0.8], [214, 86, 2, 0.85], [216, 88, 4, 0.92], [220, 86, 4, 0.85],
  [224, 89, 6, 1], [230, 88, 2, 0.8], [232, 86, 4, 0.9], [236, 81, 4, 0.8],
  [240, 81, 4, 0.8], [244, 76, 4, 0.7], [248, 81, 8, 0.9],
], 256);

// 16 步打击乐型(力度)
const KICK_E = [0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0];
const RIM_E = [0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0.25];
const SHAKER_E = [0.4, 0, 0.28, 0, 0.4, 0, 0.28, 0.14, 0.4, 0, 0.28, 0, 0.4, 0, 0.28, 0.14];
const KICK_C = [1, 0, 0, 0, 0, 0, 0.6, 0, 0.9, 0, 0.5, 0, 0, 0, 0, 0];
const SNARE_C = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.3];
/** 大鼓：3-3-2 | 3-3-2 的行进律动 */
const TAIKO_LO = [1, 0, 0, 0.7, 0, 0, 0.8, 0, 1, 0, 0, 0.6, 0, 0, 0.75, 0];
const TAIKO_HI = [0, 0, 0.4, 0, 0, 0.4, 0, 0, 0, 0, 0.4, 0, 0.5, 0, 0, 0.45];
const HAT_C = [0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.25, 0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.4, 0.3];
/** 战斗层低音：八分音符上的八度/五度跳动 */
const BASS_C = [0, 0, 12, 0, 0, 12, 0, 7];

class BattleTrack extends Track {
  private lExplore = this.layer(1);
  private lCombat = this.layer(0);
  private I = 0;
  private tension = 0;
  private applied = -1;

  private cPad = this.chan(0.8, { rev: 0.35 });
  // 探索层
  private eBass = this.chan(0.62, { layer: this.lExplore });
  private eArp = this.chan(0.36, { layer: this.lExplore, rev: 0.3, dly: 0.35, pan: -0.3 });
  private eBell = this.chan(0.62, { layer: this.lExplore, rev: 0.5, dly: 0.35, pan: 0.2 });
  private eFlute = this.chan(0.75, { layer: this.lExplore, rev: 0.45, dly: 0.2, pan: 0.1 });
  private ePerc = this.chan(0.42, { layer: this.lExplore, rev: 0.15 });
  // 战斗层
  private cBass = this.chan(0.7, { layer: this.lCombat });
  private cDrum = this.chan(0.62, { layer: this.lCombat, rev: 0.16 });
  private cHat = this.chan(0.3, { layer: this.lCombat, rev: 0.08, pan: 0.25 });
  private cStr = this.chan(0.5, { layer: this.lCombat, rev: 0.25, pan: -0.2 });
  private cBrass = this.chan(0.7, { layer: this.lCombat, rev: 0.35, dly: 0.12 });
  private cLow = this.chan(0.55, { layer: this.lCombat, rev: 0.3 });

  constructor(m: Mixer, t0: number) {
    super(m, t0, (60 / 108) * 0.75);
  }

  override mood(intensity: number, tension: number): void {
    this.I = intensity;
    this.tension = tension;
    if (Math.abs(intensity - this.applied) < 0.01) return;
    this.applied = intensity;
    // 等功率交叉淡变
    this.setLayer(this.lExplore, Math.cos((intensity * Math.PI) / 2), 0.15);
    this.setLayer(this.lCombat, Math.sin((intensity * Math.PI) / 2), 0.15);
  }

  protected stepDur(): number {
    // 局势越紧张速度略快(最多 +7%)
    return 60 / (108 * (1 + 0.07 * this.tension)) / 4;
  }

  protected onStep(i: number, t: number, sd: number): void {
    const loop = Math.floor(i / 256);
    const s = i % 256;
    const bar = s >> 4;
    const b = s & 15;
    const sec = bar >> 3;
    const ch = BATTLE_CHORDS[bar];
    const hot = this.I > 0.04;
    const calm = this.I < 0.97;
    const fillBar = bar === 7 || bar === 15;
    const hum = (): number => (this.rnd() - 0.5) * 0.006;

    // ── 铺底(常驻)：战斗越激烈越亮 ──
    if (b === 0 && BATTLE_HOLD[bar] > 0) {
      const len = sd * 16 * BATTLE_HOLD[bar];
      this.play(this.cPad, t, (p) => pad(p, ch.pad.map(mtof), 0, len, 0.85, 1 + this.I * 0.6));
    }

    // ── 主题旋律的出场计划：四轮一个大循环，避免每 35 秒原样重复 ──
    const phase = loop % 4;
    const melOn = phase === 0 || phase === 3 || (phase === 1 ? sec === 1 : sec === 0);
    const harmony = phase === 3 && sec === 1;
    const mel = melOn ? BATTLE_MEL[s] : null;

    if (calm) {
      // ── 探索层 ──
      if (b === 0 && BATTLE_HOLD[bar] > 0) {
        const len = sd * 16 * BATTLE_HOLD[bar];
        this.play(this.eBass, t, (p) => bass(p, mtof(ch.bass), 0, len * 0.85, 0.75));
      }
      if (b === 14 && (bar === 15 || BATTLE_HOLD[bar + 1] > 0)) {
        this.play(this.eBass, t, (p) => bass(p, mtof(ch.bass + 12), 0, sd * 1.6, 0.45, 0.3));
      }
      if ((b & 1) === 0 && (loop > 0 || bar >= 2)) {
        const pat = ARP_PATTERNS[(loop + sec) % ARP_PATTERNS.length];
        const n = ch.pad[pat[b >> 1]] + 12;
        this.play(this.eArp, t + hum(), (p) => pluck(p, mtof(n), 0, 0.32, (b & 3) === 0 ? 0.6 : 0.42));
      }
      if (KICK_E[b] > 0) this.play(this.ePerc, t, (p) => kick(p, 0, KICK_E[b] * 0.7));
      if (RIM_E[b] > 0) this.play(this.ePerc, t + hum(), (p) => rim(p, 0, RIM_E[b]));
      if (SHAKER_E[b] > 0) this.play(this.ePerc, t + hum(), (p) => shaker(p, 0, SHAKER_E[b] * (0.85 + this.rnd() * 0.3)));
      if (mel) {
        for (const e of mel) {
          const len = e[2] * sd;
          if (phase === 2) this.play(this.eFlute, t, (p) => flute(p, mtof(e[1] - 12), 0, len * 0.92, e[3]));
          else this.play(this.eBell, t, (p) => bell(p, mtof(e[1]), 0, Math.max(0.9, len * 1.4), e[3] * 0.9));
        }
      }
    }

    if (hot) {
      // ── 战斗层 ──
      if ((b & 1) === 0) {
        const n = ch.bass + 12 + BASS_C[b >> 1];
        this.play(this.cBass, t, (p) => bass(p, mtof(n), 0, sd * 1.5, (b & 3) === 0 ? 0.85 : 0.65, 0.8));
      }
      const roll = fillBar && b >= 12;
      if (KICK_C[b] > 0 && !roll) this.play(this.cDrum, t, (p) => kick(p, 0, KICK_C[b]));
      if (TAIKO_LO[b] > 0 && !roll) this.play(this.cDrum, t + hum(), (p) => taiko(p, 0, TAIKO_LO[b] * (0.9 + this.rnd() * 0.15), 1));
      if (TAIKO_HI[b] > 0 && !roll) this.play(this.cDrum, t + hum(), (p) => taiko(p, 0, TAIKO_HI[b], 1.5));
      if (SNARE_C[b] > 0 && !roll) {
        this.play(this.cDrum, t, (p) => {
          snare(p, 0, SNARE_C[b] * 0.8);
          if (SNARE_C[b] === 1) clap(p, 0, 0.5);
        });
      }
      // 乐句交接：最后一拍的大鼓滚奏渐强
      if (roll) this.play(this.cDrum, t, (p) => taiko(p, 0, 0.5 + (b - 12) * 0.17, b % 2 ? 1.5 : 1.2));
      this.play(this.cHat, t + hum(), (p) => hat(p, 0, HAT_C[b] * (0.85 + this.rnd() * 0.3), b === 14 && (bar & 1) === 1));
      // 弦乐奔马节奏：每拍的 1、3、4 个十六分
      if ((b & 3) !== 1) {
        const bi = b >> 2;
        const n = ch.pad[[0, 2, 1, 3][bi]] + (bi === 3 ? 12 : 0);
        this.play(this.cStr, t + hum(), (p) => stab(p, mtof(n), 0, 0.14, (b & 3) === 0 ? 0.85 : 0.55));
      }
      // 换和弦处：低音铜管 + 定音鼓落点
      if (b === 0 && BATTLE_HOLD[bar] > 0) {
        this.play(this.cLow, t, (p) => {
          brass(p, mtof(ch.bass + 12), 0, sd * 6, 0.8, 0.7);
          brass(p, mtof(ch.bass + 19), 0, sd * 6, 0.6, 0.7);
          timpani(p, mtof(ch.bass), 0, 0.7);
        });
      }
      if (b === 0 && (bar === 0 || bar === 8)) this.play(this.cDrum, t, (p) => cymbal(p, 0, 0.55, 1.8));
      if (fillBar && b === 8) this.play(this.cDrum, t, (p) => swell(p, 0, sd * 8, 0.7));
      if (mel) {
        for (const e of mel) {
          const len = e[2] * sd;
          this.play(this.cBrass, t, (p) => {
            brass(p, mtof(e[1] - 12), 0, len * 0.9, e[3]);
            if (harmony) brass(p, mtof(thirdAbove(e[1]) - 12), 0, len * 0.9, e[3] * 0.6);
          });
        }
      }
      // 告急：高音弦乐十六分震音，力度随紧张度
      if (this.tension > 0.25) {
        const n = (b & 2) === 0 ? 81 : 86;
        const vel = (0.2 + 0.35 * this.tension) * ((b & 3) === 0 ? 1 : 0.7);
        this.play(this.cStr, t, (p) => stab(p, mtof(n), 0, 0.09, vel));
      }
    }
  }
}

// ───────────────────────── 胜利：D 大调 ─────────────────────────

const VIC_MEL: readonly Ev[] = [
  // 主题动机的大调变形：D–D–A 上跳，G、F# 级进下行 → 再度攀升到高八度的 D
  [4, 74, 1, 0.9], [5, 74, 1, 0.85], [6, 81, 3, 1], [9, 79, 1, 0.8], [10, 78, 2, 0.9],
  [12, 76, 1, 0.85], [13, 78, 1, 0.85], [14, 79, 2, 0.9], [16, 81, 4, 0.95],
  [20, 83, 2, 0.95], [22, 81, 1, 0.85], [23, 83, 1, 0.9], [24, 85, 2, 0.95], [26, 86, 10, 1],
];
const VIC_CHORDS: readonly (readonly [number, number, readonly number[], number])[] = [
  // [起始步, 低音, 和弦, 持续步数]
  [0, 38, [50, 57, 62, 66], 12],
  [12, 43, [55, 59, 62, 67], 4],
  [16, 45, [57, 61, 64, 69], 4],
  [20, 43, [55, 59, 62, 67], 4],
  [24, 45, [57, 61, 64, 69], 2],
  [26, 38, [50, 57, 62, 66, 69, 74], 12],
];
const VIC_TAIL = 36;

class VictoryTrack extends Track {
  private cPad = this.chan(0.75, { rev: 0.4 });
  private cBrass = this.chan(0.95, { rev: 0.4, dly: 0.12 });
  private cBell = this.chan(0.6, { rev: 0.55, dly: 0.3 });
  private cBass = this.chan(0.7);
  private cDrum = this.chan(0.6, { rev: 0.2 });
  private mel = indexByStep(VIC_MEL, 40);

  constructor(m: Mixer, t0: number) {
    super(m, t0, (60 / 132) * 0.75);
  }

  protected stepDur(): number {
    return 60 / 132 / 2;
  }

  protected onStep(i: number, t: number, sd: number): void {
    if (i < VIC_TAIL) {
      // 引子：两拍的军鼓滚奏渐强
      if (i < 4) {
        this.play(this.cDrum, t, (p) => {
          snare(p, 0, 0.35 + i * 0.12);
          snare(p, sd / 2, 0.4 + i * 0.12);
        });
        if (i === 0) this.play(this.cDrum, t, (p) => swell(p, 0, sd * 4, 0.8));
      }
      for (const c of VIC_CHORDS) {
        if (c[0] !== i) continue;
        const len = c[3] * sd;
        const big = i === 26;
        this.play(this.cPad, t, (p) => {
          pad(p, c[2].map(mtof), 0, len, 0.9, 1.4);
          if (big) choir(p, [62, 66, 69, 74].map(mtof), 0, len, 0.55);
        });
        this.play(this.cBass, t, (p) => bass(p, mtof(c[1]), 0, len * 0.9, 0.8, 0.4));
        if (i > 0) this.play(this.cDrum, t, (p) => timpani(p, mtof(c[1]), 0, big ? 1 : 0.7));
        if (i === 4 || big) this.play(this.cDrum, t, (p) => cymbal(p, 0, big ? 0.8 : 0.5, big ? 2.6 : 1.5));
      }
      // 进行曲式的小军鼓
      if (i >= 4 && i < 26) {
        this.play(this.cDrum, t, (p) => snare(p, 0, i % 2 === 0 ? 0.5 : 0.28));
        if (i % 4 === 3) this.play(this.cDrum, t, (p) => snare(p, sd / 2, 0.25));
      }
      for (const e of this.mel[i]) {
        const len = e[2] * sd;
        this.play(this.cBrass, t, (p) => {
          brass(p, mtof(e[1]), 0, len * 0.92, e[3], 1.1);
          brass(p, mtof(e[1] - 12), 0, len * 0.92, e[3] * 0.7, 0.9);
        });
        this.play(this.cBell, t, (p) => bell(p, mtof(e[1] + 12), 0, Math.max(0.8, len), e[3] * 0.6));
      }
      // 终止和弦上的钟琴上行琶音
      if (i >= 27 && i <= 31) this.play(this.cBell, t, (p) => bell(p, mtof([78, 81, 86, 90, 93][i - 27]), 0, 1.6, 0.6));
      return;
    }
    // 尾音：Dadd9 铺底每 16 步柔和地续上，零星的五声音阶星点
    const k = i - VIC_TAIL;
    if (k % 16 === 0) {
      this.play(this.cPad, t, (p) => pad(p, [50, 57, 62, 66, 69, 76].map(mtof), 0, sd * 17, 0.6, 1.1));
      this.play(this.cBass, t, (p) => bass(p, mtof(38), 0, sd * 14, 0.4));
    }
    if (this.rnd() < 0.22) {
      const n = [74, 76, 78, 81, 83, 86, 88, 90][Math.floor(this.rnd() * 8)];
      const vel = 0.18 + this.rnd() * 0.2;
      this.play(this.cBell, t, (p) => bell(p, mtof(n), 0, 1.6, vel));
    }
  }
}

// ───────────────────────── 失败：D 小调 ─────────────────────────

const DEF_MEL: readonly Ev[] = [
  // 主题的下行变形：从五级叹息般地落回主音
  [1, 69, 3, 0.8], [4, 67, 2, 0.7], [6, 65, 2, 0.7],
  [8, 62, 3, 0.75], [11, 64, 1, 0.6], [12, 65, 4, 0.75],
  [16, 67, 3, 0.8], [19, 65, 1, 0.65], [20, 64, 4, 0.7],
  [24, 62, 8, 0.8],
];
const DEF_CHORDS: readonly (readonly [number, number, readonly number[], number])[] = [
  [0, 38, [50, 57, 62, 65], 8], // Dm
  [8, 34, [53, 58, 62, 65], 8], // Bb
  [16, 31, [55, 58, 62], 4], // Gm
  [20, 33, [57, 62, 64], 4], // Asus4
  [24, 38, [50, 57, 62, 64, 65], 8], // Dm(add9)
];
const DEF_TAIL = 32;

class DefeatTrack extends Track {
  private cPad = this.chan(0.85, { rev: 0.45 });
  private cHorn = this.chan(0.95, { rev: 0.5, dly: 0.2 });
  private cBell = this.chan(0.6, { rev: 0.6, dly: 0.3 });
  private cBass = this.chan(0.7);
  private cDrum = this.chan(0.55, { rev: 0.25 });
  private mel = indexByStep(DEF_MEL, 32);

  constructor(m: Mixer, t0: number) {
    super(m, t0, (60 / 100) * 1.5);
  }

  protected stepDur(): number {
    return 60 / 100 / 2;
  }

  protected onStep(i: number, t: number, sd: number): void {
    if (i < DEF_TAIL) {
      for (const c of DEF_CHORDS) {
        if (c[0] !== i) continue;
        const len = c[3] * sd;
        this.play(this.cPad, t, (p) => pad(p, c[2].map(mtof), 0, len, 0.9, 0.7));
        this.play(this.cBass, t, (p) => bass(p, mtof(c[1]), 0, len * 0.9, 0.75));
        this.play(this.cDrum, t, (p) => timpani(p, mtof(c[1] < 36 ? c[1] + 12 : c[1]), 0, i === 0 || i === 24 ? 0.8 : 0.5));
      }
      for (const e of this.mel[i]) {
        const len = e[2] * sd;
        this.play(this.cHorn, t, (p) => {
          horn(p, mtof(e[1]), 0, len * 0.95, e[3]);
          horn(p, mtof(e[1] - 12), 0, len * 0.95, e[3] * 0.5);
        });
      }
      // 最后的和弦上敲两下低沉的钟
      if (i === 24 || i === 28) this.play(this.cBell, t, (p) => bell(p, mtof(50), 0, 2.6, 0.7));
      return;
    }
    // 尾音：空五度 + 九音的低音铺底，偶尔一声远钟
    const k = i - DEF_TAIL;
    if (k % 16 === 0) {
      this.play(this.cPad, t, (p) => pad(p, [38, 45, 50, 57, 64].map(mtof), 0, sd * 17, 0.7, 0.6));
    }
    if (k % 32 === 8) this.play(this.cBell, t, (p) => bell(p, mtof(62), 0, 3, 0.3));
  }
}

// ───────────────────────── 配乐引擎 ─────────────────────────

export class MusicEngine {
  private readonly m: Mixer;
  private cur: Track | null = null;
  private name: MusicTrack = 'none';
  private dying: Track[] = [];
  private I = 0;
  private tension = 0;

  constructor(m: Mixer) {
    this.m = m;
  }

  get track(): MusicTrack {
    return this.name;
  }

  /** 切换曲目：旧曲淡出、新曲淡入(胜负短曲立即进入) */
  setTrack(name: MusicTrack): void {
    if (name === this.name) return;
    const now = this.m.now();
    const sting = name === 'victory' || name === 'defeat';
    if (this.cur) {
      const out = sting ? 0.12 : 0.45;
      this.cur.fade(0, out);
      this.cur.killAt = now + out * 6 + 2.5;
      this.dying.push(this.cur);
      this.cur = null;
    }
    this.name = name;
    if (name === 'none') return;
    const t0 = now + (sting ? 0.08 : 0.25);
    const tr = name === 'menu' ? new MenuTrack(this.m, t0) : name === 'battle' ? new BattleTrack(this.m, t0) : name === 'victory' ? new VictoryTrack(this.m, t0) : new DefeatTrack(this.m, t0);
    tr.mood(this.I, this.tension);
    tr.fade(1, sting ? 0.02 : 0.3);
    this.cur = tr;
  }

  /** intensity：0 = 探索，1 = 团战；tension：对局后期/基地告急 */
  setMood(intensity: number, tension: number): void {
    this.I = intensity;
    this.tension = tension;
    this.cur?.mood(intensity, tension);
  }

  tick(ahead = LOOKAHEAD): void {
    const now = this.m.now();
    this.cur?.schedule(now, ahead);
    if (this.dying.length) {
      this.dying = this.dying.filter((t) => {
        if (t.killAt > now) return true;
        t.dispose();
        return false;
      });
    }
  }

  dispose(): void {
    this.cur?.dispose();
    for (const t of this.dying) t.dispose();
    this.cur = null;
    this.dying.length = 0;
    this.name = 'none';
  }
}
