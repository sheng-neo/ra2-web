/**
 * 音效总线（Web Audio）。默认程序合成（无文件也有声音反馈）；本机有
 * 泰伯利亚之日免费 Sounds.mix 时，解码其真实 AUD 音效采样替换合成音
 * （真实 C&C 战斗/建造音），触发接口不变。自动节流（每类最小间隔 +
 * 全局并发上限），避免大规模交火爆音。
 */
import { BufferSource, MixFile, parseAud } from '@ra2web/data';
import { loadGameMix } from './game-files';

export type Sfx = 'fire' | 'cannon' | 'hit' | 'explosion' | 'bigExplosion' | 'build' | 'ready' | 'place' | 'select';

/** 事件 → 泰伯利亚之日 Sounds.mix 真实音效文件（名取自 Sound01.ini）。 */
const REAL_SFX: Partial<Record<Sfx, string>> = {
  fire: 'infgun3.aud', // 步兵/轻武器开火
  cannon: 'bigggun1.aud', // 重型火炮
  hit: 'expnew14.aud', // 小型爆炸（命中）
  explosion: 'expnew06.aud', // 中型爆炸
  bigExplosion: 'expnew01.aud', // 大型建筑爆炸
  build: 'facbld1.aud', // 建造完成/工厂上线
  ready: 'notify.aud', // 提示音
  place: 'place2.aud', // 建筑落地
  select: 'clicky1.aud', // 选择点击
};
/** 单位语音应答文件（泰伯利亚之日 GDI 步兵语音，名取自 Sound01.ini 注释）。
 *  15-i012「是，长官」/ i006「长官？」/ i042「请下令？」/ i018「出发」… */
export const VOICE_FILES = [
  '15-i000', // Infantry reporting
  '15-i002', // Unit ready!
  '15-i006', // Sir?
  '15-i012', // Yes sir
  '15-i016', // Orders received
  '15-i018', // Moving out
  '15-i022', // On my way
  '15-i024', // You got it
  '15-i042', // Orders?
  '15-i046', // I'm on it
];

/** 各真实音效的播放增益（样本响度不一，逐类平衡）。 */
const REAL_GAIN: Partial<Record<Sfx, number>> = {
  fire: 0.5,
  cannon: 0.7,
  hit: 0.5,
  explosion: 0.9,
  bigExplosion: 1,
  build: 0.85,
  ready: 0.9,
  place: 0.8,
  select: 0.5,
};

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private readonly lastPlayed = new Map<Sfx, number>();
  private activeVoices = 0;
  /** 已解码的真实音效 PCM（无 ctx 也可存）。 */
  private readonly realPcm = new Map<Sfx, { rate: number; samples: Int16Array }>();
  private readonly voices = new Map<string, { rate: number; samples: Int16Array }>();
  private readonly bufCache = new Map<string, AudioBuffer>();
  private realLoaded = false;
  private lastVoiceAt = -1e9;

  /** 载入本机 Sounds.mix 并解码常用音效为真实采样（有则替换合成音）。
   *  无文件/解码失败则静默保持合成音。可在任意时刻调用（不需 ctx）。 */
  async loadRealSounds(): Promise<void> {
    if (this.realLoaded) return;
    this.realLoaded = true;
    const bytes = await loadGameMix('Sounds.mix');
    if (!bytes) return;
    let mix: MixFile;
    try {
      mix = await MixFile.open(new BufferSource(bytes));
    } catch {
      return;
    }
    for (const [sfx, file] of Object.entries(REAL_SFX) as [Sfx, string][]) {
      try {
        if (!mix.hasFile(file)) continue;
        const a = parseAud(await mix.readFile(file));
        if (a.samples.length > 0) this.realPcm.set(sfx, { rate: a.sampleRate, samples: a.samples });
      } catch {
        /* 跳过坏样本，该类回退合成音 */
      }
    }
    for (const name of VOICE_FILES) {
      try {
        const file = `${name}.aud`;
        if (!mix.hasFile(file)) continue;
        const a = parseAud(await mix.readFile(file));
        if (a.samples.length > 0) this.voices.set(name, { rate: a.sampleRate, samples: a.samples });
      } catch {
        /* 跳过坏样本 */
      }
    }
  }

  /** 每类最小触发间隔（ms），抑制密集重复。 */
  private static readonly MIN_GAP: Record<Sfx, number> = {
    fire: 45,
    cannon: 70,
    hit: 60,
    explosion: 80,
    bigExplosion: 150,
    build: 0,
    ready: 0,
    place: 0,
    select: 30,
  };

  /** 须在用户手势中调用以解锁音频（浏览器自动播放策略）。 */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // 预生成 1s 白噪声
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 22222;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x40000000) - 1;
      }
      this.noiseBuffer = buf;
    }
    void this.ctx.resume();
  }

  get isMuted(): boolean {
    return this.muted;
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  play(sfx: Sfx, now = performance.now()): void {
    if (!this.ctx || !this.master || this.muted) return;
    const gap = AudioBus.MIN_GAP[sfx];
    const last = this.lastPlayed.get(sfx) ?? -1e9;
    if (now - last < gap) return;
    if (this.activeVoices > 24) return;
    this.lastPlayed.set(sfx, now);
    if (this.realPcm.has(sfx)) {
      this.playSample(sfx);
      return;
    }
    switch (sfx) {
      case 'fire':
        this.blip(720, 0.05, 'square', 0.18);
        this.noise(0.04, 1400, 0.12);
        break;
      case 'cannon':
        this.blip(180, 0.12, 'sawtooth', 0.25);
        this.noise(0.1, 800, 0.2);
        break;
      case 'hit':
        this.noise(0.06, 2500, 0.12);
        break;
      case 'explosion':
        this.boom(0.35, 0.3);
        break;
      case 'bigExplosion':
        this.boom(0.6, 0.45);
        break;
      case 'build':
        this.chime([440, 660], 0.16);
        break;
      case 'ready':
        this.chime([520, 780, 1040], 0.12);
        break;
      case 'place':
        this.blip(120, 0.12, 'sine', 0.3);
        break;
      case 'select':
        this.blip(900, 0.03, 'triangle', 0.1);
        break;
    }
  }

  /** 播放真实音效采样。 */
  private playSample(sfx: Sfx): void {
    this.playPcmBuffer(`sfx:${sfx}`, this.realPcm.get(sfx)!, REAL_GAIN[sfx] ?? 0.8);
  }

  /** 选中/下令时播放单位语音应答。无真实语音能力返回 false（调用方回退合成
   *  提示音）；有能力但静音/节流则视为已处理返回 true。语音不叠音。 */
  playVoice(name: string): boolean {
    if (this.voices.size === 0) return false;
    if (!this.ctx || !this.master || this.muted) return true;
    const pcm = this.voices.get(name);
    if (!pcm) return true;
    const now = performance.now();
    if (now - this.lastVoiceAt < 650) return true;
    this.lastVoiceAt = now;
    this.playPcmBuffer(`voice:${name}`, pcm, 0.95);
    return true;
  }

  /** 由 16bit PCM 建并缓存 AudioBuffer 后播放（按 key 缓存）。 */
  private playPcmBuffer(key: string, pcm: { rate: number; samples: Int16Array }, gain: number): void {
    const ctx = this.ctx!;
    let buf = this.bufCache.get(key);
    if (!buf) {
      buf = ctx.createBuffer(1, pcm.samples.length, pcm.rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.samples.length; i++) ch[i] = pcm.samples[i]! / 32768;
      this.bufCache.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master!);
    src.start();
    this.track(src, buf.duration);
  }

  private t(): number {
    return this.ctx!.currentTime;
  }

  private track(node: AudioScheduledSourceNode, dur: number): void {
    this.activeVoices++;
    node.onended = () => {
      this.activeVoices--;
    };
    node.stop(this.t() + dur);
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t());
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), this.t() + dur);
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    osc.connect(g).connect(this.master!);
    osc.start();
    this.track(osc, dur + 0.02);
  }

  private noise(dur: number, cutoff: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    this.track(src, dur + 0.02);
  }

  private boom(dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, this.t());
    filter.frequency.exponentialRampToValueAtTime(120, this.t() + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.t());
    g.gain.exponentialRampToValueAtTime(0.001, this.t() + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    this.track(src, dur + 0.02);
  }

  private chime(freqs: number[], step: number): void {
    const ctx = this.ctx!;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const start = this.t() + i * step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + step + 0.05);
      osc.connect(g).connect(this.master!);
      osc.start(start);
      this.activeVoices++;
      osc.onended = () => {
        this.activeVoices--;
      };
      osc.stop(start + step + 0.06);
    });
  }
}

/** 全局单例（一个标签页一份音频上下文）。 */
export const audioBus = new AudioBus();
