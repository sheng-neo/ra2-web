/**
 * 假的 AudioContext(只给 *.test.ts 用)：节点什么都不算，只校验排进来的参数——
 * 时刻与数值必须是有限数、时刻不能为负、指数渐变的目标不能是 0、延迟上限要合法……
 * 这些在真实浏览器里都会直接抛异常，让整条声音(甚至整批事件)哑掉。
 * 有了它，真实的 Mixer / Patch / 配方 / 引擎的事件映射就能在没有浏览器的环境里跑起来。
 */
import type { Engine } from './engine';
import type { Mixer, PlayOpts } from './mixer';
import type { SfxKey } from './sfx';

function finite(v: number, what: string): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} 不是有限数：${String(v)}`);
}

function time(t: number, what: string): void {
  finite(t, what);
  if (t < 0) throw new Error(`${what} 为负：${t}`);
}

class FakeParam {
  value = 0;
  setValueAtTime(v: number, t: number): this {
    finite(v, 'setValueAtTime 的值');
    time(t, 'setValueAtTime 的时刻');
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    finite(v, 'linearRamp 的值');
    time(t, 'linearRamp 的时刻');
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    finite(v, 'exponentialRamp 的值');
    if (v === 0) throw new Error('exponentialRamp 的目标值为 0');
    time(t, 'exponentialRamp 的时刻');
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    finite(v, 'setTargetAtTime 的值');
    time(t, 'setTargetAtTime 的时刻');
    time(tc, 'setTargetAtTime 的时间常数');
    return this;
  }
  cancelScheduledValues(t: number): this {
    time(t, 'cancelScheduledValues 的时刻');
    return this;
  }
}

class FakeNode {
  readonly params: Record<string, FakeParam> = {};
  type = '';
  loop = false;
  normalize = true;
  buffer: unknown = null;
  curve: Float32Array | null = null;

  constructor(
    private readonly owner: FakeContext,
    readonly kind: string,
    paramNames: readonly string[],
  ) {
    for (const n of paramNames) this.params[n] = new FakeParam();
  }

  connect(dest: unknown): unknown {
    if (dest === null || dest === undefined) throw new Error(`${this.kind}.connect 的目标为空`);
    return dest;
  }
  disconnect(): void {
    // 假节点没有连接关系可拆
  }
  start(when = 0, offset = 0): void {
    time(when, `${this.kind}.start 的时刻`);
    time(offset, `${this.kind}.start 的偏移`);
    this.owner.sources++;
  }
  stop(when = 0): void {
    time(when, `${this.kind}.stop 的时刻`);
    if (when > this.owner.lastStop) this.owner.lastStop = when;
  }
  setPeriodicWave(w: unknown): void {
    if (!w) throw new Error('setPeriodicWave 的波形为空');
  }
}

/** 把 params 里的 AudioParam 摊到节点对象上(osc.frequency、gain.gain……) */
function node(owner: FakeContext, kind: string, params: readonly string[]): FakeNode {
  const n = new FakeNode(owner, kind, params);
  return Object.assign(n, n.params);
}

export class FakeContext {
  readonly sampleRate = 44100;
  currentTime = 0;
  readonly destination = {};
  /** 已启动的声源数(振荡器 + 噪声) */
  sources = 0;
  /** 排进来的最晚的 stop 时刻 */
  lastStop = 0;

  createGain(): FakeNode {
    return node(this, 'gain', ['gain']);
  }
  createOscillator(): FakeNode {
    return node(this, 'oscillator', ['frequency', 'detune']);
  }
  createBufferSource(): FakeNode {
    return node(this, 'bufferSource', ['playbackRate', 'detune']);
  }
  createBiquadFilter(): FakeNode {
    return node(this, 'biquad', ['frequency', 'Q', 'gain', 'detune']);
  }
  createWaveShaper(): FakeNode {
    return node(this, 'waveShaper', []);
  }
  createStereoPanner(): FakeNode {
    return node(this, 'panner', ['pan']);
  }
  createConvolver(): FakeNode {
    return node(this, 'convolver', []);
  }
  createDynamicsCompressor(): FakeNode {
    return node(this, 'compressor', ['threshold', 'knee', 'ratio', 'attack', 'release']);
  }
  createDelay(max = 1): FakeNode {
    if (!(max > 0 && max < 180)) throw new Error(`createDelay 的上限不合法：${max}`);
    return node(this, 'delay', ['delayTime']);
  }
  createBuffer(channels: number, length: number, sampleRate: number): { numberOfChannels: number; length: number; sampleRate: number; duration: number; getChannelData(ch: number): Float32Array } {
    if (!(channels >= 1) || !(length >= 1) || !(sampleRate > 0)) throw new Error(`createBuffer 的参数不合法：${channels} / ${length} / ${sampleRate}`);
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (ch) => data[ch] };
  }
  createPeriodicWave(re: Float32Array, im: Float32Array): object {
    if (re.length !== im.length || re.length < 2) throw new Error('createPeriodicWave 的系数长度不合法');
    for (let i = 0; i < re.length; i++) {
      finite(re[i], 'PeriodicWave 实部');
      finite(im[i], 'PeriodicWave 虚部');
    }
    return {};
  }
}

export function fakeContext(): FakeContext & BaseAudioContext {
  return new FakeContext() as unknown as FakeContext & BaseAudioContext;
}

export interface PlayCall {
  key: SfxKey;
  opts: PlayOpts;
  /** 是否真的发声了(false = 被限流 / 超上限丢弃) */
  played: boolean;
  /** 之后有没有被提前收声 */
  stopped: boolean;
}

/** 把引擎挂到假上下文上，并记录它对混音器的每一次 play / 每一次提前收声 */
export function attachSpy(engine: Engine): { ctx: FakeContext; mixer: Mixer; calls: PlayCall[]; clock: { t: number } } {
  const ctx = fakeContext();
  const clock = { t: 0 };
  const mixer = engine.attachOffline(ctx, () => clock.t);
  const calls: PlayCall[] = [];
  const play = mixer.play.bind(mixer);
  mixer.play = (key, opts = {}) => {
    const h = play(key, opts);
    const call: PlayCall = { key, opts, played: h !== null, stopped: false };
    calls.push(call);
    if (!h) return h;
    return {
      stop: (fade) => {
        call.stopped = true;
        h.stop(fade);
      },
      set: (gain, pan) => h.set(gain, pan),
    };
  };
  return { ctx, mixer, calls, clock };
}
