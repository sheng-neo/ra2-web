/**
 * 人声播报：用浏览器自带的语音合成(Web Speech API)念出击杀播报。
 *
 * - 不含任何音频文件；念的是各类对战游戏通用的播报用语(First Blood / Double Kill …)。
 * - 音色取决于设备与浏览器；环境不支持语音合成时整个模块静默，播报退回到原有的合成提示音。
 * - 合成器与时钟可注入，便于在 Node 里单测。
 */
import type { AnnounceKey } from '../core/types';

/** 念什么。没列出的播报(出兵、推塔、野怪刷新…)不配人声，只有提示音与横幅。 */
export const VOICE_LINES: Partial<Record<AnnounceKey, string>> = {
  first_blood: 'First blood!',
  double_kill: 'Double kill!',
  triple_kill: 'Triple kill!',
  quadra_kill: 'Quadra kill!',
  penta_kill: 'Penta kill!',
  killing_spree: 'Killing spree!',
  unstoppable: 'Unstoppable!',
  legendary: 'Legendary!',
  shutdown: 'Shut down!',
  ace: 'Ace!',
  victory: 'Victory!',
  defeat: 'Defeat.',
};

/** 语音合成器里我们用到的那一小部分接口 */
export interface SpeechLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener?(type: 'voiceschanged', cb: () => void): void;
  removeEventListener?(type: 'voiceschanged', cb: () => void): void;
}

export interface VoiceDeps {
  synth?: SpeechLike | null;
  /** 构造一条待念的话；缺省用全局的 SpeechSynthesisUtterance */
  makeUtterance?: (text: string) => SpeechSynthesisUtterance;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/** 偏好的嗓音：低沉的英语男声在各平台上的常见名字，排前面的优先 */
const PREFERRED = ['google uk english male', 'daniel', 'microsoft guy', 'microsoft david', 'microsoft ryan', 'microsoft george', 'alex', 'aaron', 'arthur', 'fred', 'male'];

/** 从系统嗓音里挑一个英语嗓音；没有英语嗓音时返回 null(交给浏览器按语言自己选) */
export function pickVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (!en.length) return null;
  for (const name of PREFERRED) {
    const hit = en.find((v) => v.name.toLowerCase().includes(name));
    if (hit) return hit;
  }
  return en.find((v) => /en[-_](us|gb)/i.test(v.lang)) ?? en[0];
}

export class VoiceAnnouncer {
  private readonly synth: SpeechLike | null;
  private readonly make: ((text: string) => SpeechSynthesisUtterance) | null;
  private readonly setTimer: (fn: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;
  private voice: SpeechSynthesisVoice | null = null;
  private volume = 1;
  private timers = new Set<number>();
  private disposed = false;

  constructor(deps: VoiceDeps = {}) {
    const g = globalThis as { speechSynthesis?: SpeechLike; SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance };
    this.synth = deps.synth !== undefined ? deps.synth : (g.speechSynthesis ?? null);
    const Ctor = g.SpeechSynthesisUtterance;
    this.make = deps.makeUtterance ?? (Ctor ? (text) => new Ctor(text) : null);
    this.setTimer = deps.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number);
    this.clearTimer = deps.clearTimer ?? ((id) => globalThis.clearTimeout(id));
    if (this.synth) {
      this.refreshVoice();
      // 多数浏览器的嗓音列表是异步到的
      try {
        this.synth.addEventListener?.('voiceschanged', this.refreshVoice);
      } catch {
        /* 个别环境不支持事件监听：就用当时拿到的列表 */
      }
    }
  }

  /** 环境是否支持人声播报 */
  get available(): boolean {
    return !this.disposed && this.synth !== null && this.make !== null;
  }

  private refreshVoice = (): void => {
    try {
      this.voice = this.synth ? pickVoice(this.synth.getVoices()) : null;
    } catch {
      this.voice = null;
    }
  };

  /** 音量 0..1(跟随 主音量 × 音效音量) */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * 念一条播报。enemy = 对方达成(压低音调)；delaySec = 等提示音起头之后再开口。
   * 返回是否已排上(环境不支持、音量为 0、这条播报没有台词时返回 false)。
   */
  say(key: AnnounceKey, enemy: boolean, delaySec = 0): boolean {
    const text = VOICE_LINES[key];
    if (!text || !this.available || this.volume <= 0.01) return false;
    const fire = (): void => {
      if (!this.available) return;
      try {
        const u = this.make!(text);
        u.lang = this.voice?.lang ?? 'en-US';
        if (this.voice) u.voice = this.voice;
        u.rate = 0.92;
        u.pitch = enemy ? 0.5 : 0.75;
        u.volume = this.volume;
        // 上一句还没念完时直接打断：播报要跟得上战况，不排长队
        this.synth!.cancel();
        this.synth!.speak(u);
      } catch {
        /* 语音合成偶发抛错(未获用户手势、后台标签页等)：这一句不念 */
      }
    };
    if (delaySec <= 0.02) {
      fire();
    } else {
      const id = this.setTimer(() => {
        this.timers.delete(id);
        fire();
      }, delaySec * 1000);
      this.timers.add(id);
    }
    return true;
  }

  /** 停掉正在念的和排着的(暂停、切后台、离开对局时调用) */
  stop(): void {
    for (const id of this.timers) this.clearTimer(id);
    this.timers.clear();
    try {
      this.synth?.cancel();
    } catch {
      /* 忽略 */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    try {
      this.synth?.removeEventListener?.('voiceschanged', this.refreshVoice);
    } catch {
      /* 忽略 */
    }
    this.disposed = true;
  }
}
