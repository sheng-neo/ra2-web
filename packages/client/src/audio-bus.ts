/**
 * 程序合成音效（Web Audio）—— 无需游戏文件即可有声音反馈。
 * 真实 audio.bag / EVA 语音就绪后可替换为采样播放，触发接口不变。
 * 自动节流（每类最小间隔 + 全局并发上限），避免大规模交火时爆音。
 */
export type Sfx = 'fire' | 'cannon' | 'hit' | 'explosion' | 'bigExplosion' | 'build' | 'ready' | 'place' | 'select';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private readonly lastPlayed = new Map<Sfx, number>();
  private activeVoices = 0;

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
