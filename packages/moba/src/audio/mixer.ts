/**
 * 混音器：总线结构、发声管理(限流 / 同时发声上限 / 优先级让位)、节点回收。
 * 只依赖 BaseAudioContext + 一个可注入的时钟，所以实时引擎与离线自检走完全相同的代码路径。
 *
 *   音效 voice ─ gain ─ [远距低通] ─ [声像] ─┬─ sfx/ui 总线 ─┐
 *                                           └─ 混响送入 ────┤
 *   配乐 track ─ musicIn ─ 低通 ─ 闪避 ─ 音量 ───────────────┼─ 汇总 ─ 压限器 ─ 补偿 ─ 软削波 ─ 主音量 ─ 输出
 *   卷积混响(程序生成冲激响应) ─────────────────────────────┘
 */
import { SFX, trimOf } from './sfx';
import type { SfxKey } from './sfx';
import { Kit, Patch } from './synth';
import type { Ctx } from './synth';

export interface PlayOpts {
  /** 事件级增益(距离衰减 × 重要性)，再乘以该键的配平增益 */
  gain?: number;
  /** 声像 -1..1；undefined = 不做空间化 */
  pan?: number;
  /** 远距离低通截止(Hz)；0/undefined = 不滤 */
  lp?: number;
  /** 音高倍率 */
  pitch?: number;
  /** 传给配方的变体参数 */
  v?: number;
  /** 持续类音效的时长 */
  dur?: number;
  /** 延后多少秒开始 */
  when?: number;
  prio?: number;
}

export interface VoiceHandle {
  /** 提前淡出并回收 */
  stop(fade?: number): void;
  /** 更新空间化(跟随移动的区域) */
  set(gain: number, pan: number): void;
}

interface Voice {
  key: SfxKey;
  patch: Patch;
  out: GainNode;
  pan: StereoPannerNode | null;
  lpf: BiquadFilterNode | null;
  send: GainNode | null;
  prio: number;
  vol: number;
  killAt: number;
  /** 已被更高优先级的声音挤掉(正在 40ms 淡出)：不再计入发声数，也不会被重复挤占 */
  stolen: boolean;
}

interface NoteRec {
  patch: Patch;
  root: GainNode;
}

/** 同时发声的音效上限：超过后低优先级的新声音被丢弃，或挤掉更低优先级的旧声音 */
export const MAX_VOICES = 28;

/** 压限器之前的总增益：给多个音效叠加留余量 */
const SUM_GAIN = 0.8;
/**
 * 压限器之后的补偿。DynamicsCompressorNode 自带一个由阈值/比率推出的固定提升(本参数下实测约 +3.5dB)。
 * 这里把整条链的小信号净增益定在约 1.33(+2.5dB，离线自检「总线传输特性」一栏实测)：
 * 默认音量下的整体响度更接近常见手游，峰值仍由压限器和末端软削波兜住(输出恒 < 1)。
 */
const POST_GAIN = 1.13;
const COMP = { threshold: -9, knee: 6, ratio: 8, attack: 0.003, release: 0.2 } as const;

export interface MixerOptions {
  /** false = 旁路压限与软削波(离线自检测量单个音效的原始电平时用) */
  dynamics?: boolean;
  clock?: () => number;
}

export class Mixer {
  readonly ctx: Ctx;
  readonly kit: Kit;
  /** 配乐轨的干声入口 / 混响入口 */
  readonly musicIn: GainNode;
  readonly musicRev: GainNode;
  now: () => number;
  readonly stats = { played: 0, throttled: 0, capped: 0, stolen: 0, peakVoices: 0 };
  /** 各键的播放次数(画廊/自检统计用) */
  readonly counts = new Map<SfxKey, number>();

  private sfxBus: GainNode;
  private uiBus: GainNode;
  private sfxRev: GainNode;
  private musicVol: GainNode;
  private musicLp: BiquadFilterNode;
  private musicDuck: GainNode;
  private master: GainNode;
  private voices: Voice[] = [];
  private notes: NoteRec[] = [];
  private lastAt = new Map<string, number>();
  private graph: AudioNode[] = [];

  constructor(ctx: Ctx, opts: MixerOptions = {}) {
    this.ctx = ctx;
    this.kit = new Kit(ctx);
    this.now = opts.clock ?? ((): number => ctx.currentTime);
    const g = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      this.graph.push(n);
      return n;
    };

    this.master = g(1);
    this.master.connect(ctx.destination);
    const sum = g(SUM_GAIN);
    if (opts.dynamics === false) {
      sum.gain.value = 1;
      sum.connect(this.master);
    } else {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = COMP.threshold;
      comp.knee.value = COMP.knee;
      comp.ratio.value = COMP.ratio;
      comp.attack.value = COMP.attack;
      comp.release.value = COMP.release;
      const post = g(POST_GAIN);
      // 软削波兜底：压限器有起音时间，瞬态可能漏过去。输入先 ×0.5 以覆盖 ±2 的范围
      const pre = g(0.5);
      const clip = ctx.createWaveShaper();
      clip.curve = softClipCurve();
      sum.connect(comp);
      comp.connect(post);
      post.connect(pre);
      pre.connect(clip);
      clip.connect(this.master);
      this.graph.push(comp, clip);
    }

    this.sfxBus = g(1);
    this.uiBus = g(1);
    this.sfxBus.connect(sum);
    this.uiBus.connect(sum);

    this.musicIn = g(1);
    this.musicLp = ctx.createBiquadFilter();
    this.musicLp.type = 'lowpass';
    this.musicLp.frequency.value = 20000;
    this.musicLp.Q.value = 0.5;
    this.musicDuck = g(1);
    this.musicVol = g(1);
    this.musicIn.connect(this.musicLp);
    this.musicLp.connect(this.musicDuck);
    this.musicDuck.connect(this.musicVol);
    this.musicVol.connect(sum);
    this.graph.push(this.musicLp);

    const reverb = ctx.createConvolver();
    reverb.normalize = false;
    reverb.buffer = this.kit.impulse(2.4, 2.0);
    this.sfxRev = g(1);
    this.musicRev = g(1);
    this.sfxRev.connect(reverb);
    this.musicRev.connect(reverb);
    reverb.connect(sum);
    this.graph.push(reverb);
  }

  /** 播放一个音效。被限流/超上限时返回 null */
  play(key: SfxKey, o: PlayOpts = {}): VoiceHandle | null {
    const def = SFX[key];
    const t = this.now() + (o.when ?? 0) + 0.004;
    const gk = def.group ?? key;
    const last = this.lastAt.get(gk);
    if (last !== undefined && t - last < def.gap && t >= last) {
      this.stats.throttled++;
      return null;
    }
    const prio = o.prio ?? def.prio;
    let same = 0;
    let live = 0;
    for (const v of this.voices) {
      if (v.stolen || v.killAt < t) continue;
      live++;
      if (v.key === key) same++;
    }
    if (same >= def.poly) {
      this.stats.throttled++;
      return null;
    }
    if (live >= MAX_VOICES && !this.steal(prio, t)) {
      this.stats.capped++;
      return null;
    }
    this.lastAt.set(gk, t);

    const c = this.ctx;
    const vol = trimOf(key);
    const out = c.createGain();
    out.gain.value = (o.gain ?? 1) * vol;
    let tail: AudioNode = out;
    let lpf: BiquadFilterNode | null = null;
    if (o.lp && o.lp < 16000) {
      lpf = c.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = o.lp;
      lpf.Q.value = 0.5;
      tail.connect(lpf);
      tail = lpf;
    }
    let pan: StereoPannerNode | null = null;
    if (o.pan !== undefined && this.kit.canPan) {
      pan = c.createStereoPanner();
      pan.pan.value = o.pan;
      tail.connect(pan);
      tail = pan;
    }
    tail.connect(def.bus === 'ui' ? this.uiBus : this.sfxBus);
    let send: GainNode | null = null;
    if (def.rev > 0) {
      send = c.createGain();
      send.gain.value = def.rev;
      tail.connect(send);
      send.connect(this.sfxRev);
    }

    const patch = new Patch(this.kit, out, t);
    patch.pm = (o.pitch ?? 1) * (1 + (this.kit.rnd() * 2 - 1) * def.jitter);
    patch.dur = o.dur ?? def.len;
    def.fn(patch, o.v ?? 0);
    patch.finish();

    const voice: Voice = { key, patch, out, pan, lpf, send, prio, vol, killAt: patch.end + 0.05, stolen: false };
    this.voices.push(voice);
    this.stats.played++;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (live + 1 > this.stats.peakVoices) this.stats.peakVoices = live + 1;

    return {
      stop: (fade = 0.15): void => {
        const n = this.now();
        if (voice.killAt <= n) return;
        out.gain.cancelScheduledValues(n);
        out.gain.setTargetAtTime(0, n, fade / 4);
        voice.killAt = Math.min(voice.killAt, n + fade + 0.05);
      },
      set: (gain: number, p: number): void => {
        const n = this.now();
        out.gain.setTargetAtTime(gain * vol, n, 0.06);
        if (pan) pan.pan.setTargetAtTime(p, n, 0.06);
      },
    };
  }

  /** 挤掉一个优先级更低的旧声音(最低优先级里最老的) */
  private steal(prio: number, t: number): boolean {
    let pick: Voice | null = null;
    for (const v of this.voices) {
      if (v.stolen || v.killAt < t || v.prio >= prio) continue;
      if (!pick || v.prio < pick.prio) pick = v;
    }
    if (!pick) return false;
    pick.out.gain.cancelScheduledValues(t);
    pick.out.gain.setTargetAtTime(0, t, 0.006);
    pick.killAt = t + 0.04;
    pick.stolen = true;
    this.stats.stolen++;
    return true;
  }

  /** 配乐音符：不占音效发声数，但同样登记回收 */
  note(dest: AudioNode, t: number): Patch {
    const root = this.ctx.createGain();
    root.connect(dest);
    const patch = new Patch(this.kit, root, t);
    this.notes.push({ patch, root });
    return patch;
  }

  /** 回收已结束的发声：断开其根节点，整棵子图即可被垃圾回收 */
  sweep(): void {
    const now = this.now();
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.killAt < now) {
        v.out.disconnect();
        v.lpf?.disconnect();
        v.pan?.disconnect();
        v.send?.disconnect();
      } else {
        this.voices[w++] = v;
      }
    }
    this.voices.length = w;
    w = 0;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.patch.end + 0.1 < now) n.root.disconnect();
      else this.notes[w++] = n;
    }
    this.notes.length = w;
  }

  get voiceCount(): number {
    return this.voices.length;
  }

  get noteCount(): number {
    return this.notes.length;
  }

  setVolumes(master: number, sfx: number, music: number): void {
    const t = this.now();
    this.master.gain.setTargetAtTime(clamp01(master), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(clamp01(sfx), t, 0.03);
    this.uiBus.gain.setTargetAtTime(clamp01(sfx), t, 0.03);
    this.sfxRev.gain.setTargetAtTime(clamp01(sfx), t, 0.03);
    this.musicVol.gain.setTargetAtTime(clamp01(music), t, 0.03);
    this.musicRev.gain.setTargetAtTime(clamp01(music), t, 0.03);
  }

  /** 主音量快速淡出/淡入(页面隐藏/恢复时避免咔哒声) */
  fadeMaster(v: number, tc: number): void {
    const t = this.now();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(v, t, tc);
  }

  /** 播报响起时让配乐暂时让位 */
  duck(depth: number, hold: number): void {
    const t = this.now();
    this.musicDuck.gain.cancelScheduledValues(t);
    this.musicDuck.gain.setTargetAtTime(depth, t, 0.04);
    this.musicDuck.gain.setTargetAtTime(1, t + hold, 0.35);
  }

  /** 配乐整体低通(玩家阵亡时发闷) */
  setMusicTone(hz: number): void {
    this.musicLp.frequency.setTargetAtTime(hz, this.now(), 0.25);
  }

  dispose(): void {
    for (const v of this.voices) v.out.disconnect();
    for (const n of this.notes) n.root.disconnect();
    this.voices.length = 0;
    this.notes.length = 0;
    for (const n of this.graph) n.disconnect();
    this.graph.length = 0;
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0.72 以下线性，以上用 tanh 收敛到 0.985：保证输出永不超过 1.0 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  const K = 0.72;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const ax = Math.abs(x);
    const y = ax <= K ? ax : K + (1 - K) * Math.tanh((ax - K) / (1 - K));
    c[i] = Math.sign(x) * y * 0.985;
  }
  return c;
}
