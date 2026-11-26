/**
 * 音频引擎（R2 TRAMS T10）：全部声音用 WebAudio 即时合成，不载入任何声音文件。
 * - AudioContext 只在第一次用户手势（pointerdown / touchend / keydown）里创建并 resume（iOS Safari 的规定）；
 *   自动化测试、无头浏览器里没有手势，就永远不建、不出声、不打印任何东西。浏览器不支持时静默。
 * - 静音：HUD「聲音」按钮切换，记在 localStorage（读写都包 try/catch：隐私模式、禁存储时只是不记）；
 *   #mute / ?mute 开场静音。
 * - 叮叮铃：bell()，两下敲击（bell.ts 的分音表），按距离衰减、按方位做立体声；最多 4 个同时的铃声。
 * - 静音时（R2 修复轮）不建 AudioContext；已经建了的就 suspend（不占着 iOS 的音频会话、不跑合成），
 *   取消静音（按钮点按本身就是手势）时再建 / resume。页面切到后台也 suspend，回来且没静音才 resume。
 */
import type { Camera } from 'three';
import { BELL_CLICK_S, BELL_DURATION_S, BELL_ATTACK_S, HUM_VOICES, MASTER_GAIN, MAX_BELL_VOICES, bellPartials, bellStrikes, distanceGain, humDistanceGain, humParams, panFor } from './bell';

/** localStorage 键：'off' = 静音。 */
export const SOUND_KEY = 'central.sound';

/** 读记住的静音设定（存储不可用时返回 null）。 */
export function readStoredMute(storage: Pick<Storage, 'getItem'> | null | undefined): boolean | null {
  try {
    const v = storage?.getItem(SOUND_KEY);
    return v === 'off' ? true : v === 'on' ? false : null;
  } catch {
    return null;
  }
}

/** 记住静音设定（失败就算了）。 */
export function writeStoredMute(storage: Pick<Storage, 'setItem'> | null | undefined, muted: boolean): void {
  try {
    storage?.setItem(SOUND_KEY, muted ? 'off' : 'on');
  } catch {
    /* 隐私模式 / 禁用存储：不记 */
  }
}

/** 开场是否静音：URL 带 mute 时一定静音，否则用记住的设定（默认有声）。 */
export function initialMute(urlMute: boolean, stored: boolean | null): boolean {
  return urlMute || stored === true;
}

type AudioCtor = new () => AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voiceEnds: number[] = [];
  private muted: boolean;
  private readonly unlockFn = () => this.unlock();
  private readonly right = { x: 1, z: 0 };
  /** 已经合成播放的铃声次数（调试 / 测试用）。 */
  played = 0;
  /** 马达声两个常驻声部（锯齿 → 低通 → 增益 → 声像）。 */
  private hum: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode | null }[] = [];

  constructor(muted: boolean) {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, this.unlockFn, { passive: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const ctx = this.ctx;
        if (!ctx) return;
        if (document.visibilityState === 'hidden') ctx.suspend().catch(() => undefined);
        else if (!this.muted) ctx.resume().catch(() => undefined);
      });
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 是否已经有可用的 AudioContext（调试用）。 */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /** AudioContext 状态（没有时 'none'）。 */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** 切换静音（应在用户手势里调用：取消静音时才建 / 恢复 AudioContext）。 */
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.02);
    if (m) this.ctx?.suspend().catch(() => undefined);
    else this.unlock();
  }

  private unlock(): void {
    // 静音中不建 / 不恢复（取消静音时 setMuted 会再来）
    if (this.muted) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor = audioCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : MASTER_GAIN;
      master.connect(ctx.destination);
      // 3 ms 白噪声（敲击的「咔」声）：用固定种子的伪随机数，结果可复现
      const n = Math.max(1, Math.round(ctx.sampleRate * BELL_CLICK_S));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        ch[i] = ((s / 4294967296) * 2 - 1) * (1 - i / n);
      }
      this.ctx = ctx;
      this.master = master;
      this.noise = buf;
      ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  /** 马达声：cars 为最近的几辆车（three 坐标、速度）；每帧调用。没有 AudioContext 时什么都不做。 */
  motors(cars: readonly { pos: readonly [number, number, number]; speed: number; d: number }[], camera: Camera): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    if (!this.hum.length) {
      for (let k = 0; k < HUM_VOICES; k++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 2;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        let pan: StereoPannerNode | null = null;
        if (typeof ctx.createStereoPanner === 'function') {
          pan = ctx.createStereoPanner();
          gain.connect(pan);
          pan.connect(this.master);
        } else gain.connect(this.master);
        osc.start();
        this.hum.push({ osc, filter, gain, pan });
      }
    }
    const now = ctx.currentTime;
    const e = camera.matrixWorld.elements;
    this.hum.forEach((h, k) => {
      const car = cars[k];
      const p = humParams(car?.speed ?? 0);
      const g = car ? p.gain * humDistanceGain(car.d) : 0;
      h.osc.frequency.setTargetAtTime(p.freq, now, 0.1);
      h.filter.frequency.setTargetAtTime(p.cutoff, now, 0.1);
      h.gain.gain.setTargetAtTime(g, now, 0.15);
      if (car && h.pan) h.pan.pan.setTargetAtTime(panFor(e[0]!, e[2]!, car.pos[0] - camera.position.x, car.pos[2] - camera.position.z), now, 0.1);
    });
  }

  /** 在 pos（three 坐标）处打一次「叮叮」铃；seed 定音高。听不到（太远、静音、没解锁）时什么都不做。 */
  bell(pos: readonly [number, number, number], camera: Camera, seed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const c = camera.position;
    const dx = pos[0] - c.x;
    const dz = pos[2] - c.z;
    const gain = distanceGain(Math.hypot(dx, pos[1] - c.y, dz));
    if (gain <= 0) return;
    const now = ctx.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    if (this.voiceEnds.length >= MAX_BELL_VOICES) return;
    this.voiceEnds.push(now + BELL_DURATION_S);
    this.played++;
    // 相机右方向：相机局部 +x 在世界里的方向
    const e = camera.matrixWorld.elements;
    this.right.x = e[0]!;
    this.right.z = e[2]!;
    const pan = panFor(this.right.x, this.right.z, dx, dz);
    const out = ctx.createGain();
    out.gain.value = gain;
    let tail: AudioNode = out;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      tail = p;
    }
    tail.connect(this.master);
    const t0 = now + 0.02;
    for (const st of bellStrikes()) {
      const ts = t0 + st;
      for (const part of bellPartials(seed)) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = part.freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ts);
        g.gain.linearRampToValueAtTime(part.amp, ts + BELL_ATTACK_S);
        g.gain.setTargetAtTime(0, ts + BELL_ATTACK_S, part.tau);
        osc.connect(g);
        g.connect(out);
        osc.start(ts);
        osc.stop(ts + part.tau * 7 + 0.05);
      }
      if (this.noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(g);
        g.connect(out);
        src.start(ts);
      }
    }
    // 铃声结束后断开这一路（避免节点堆积）
    setTimeout(() => {
      try {
        tail.disconnect();
      } catch {
        /* 已断开 */
      }
    }, (BELL_DURATION_S + 0.5) * 1000);
  }
}
