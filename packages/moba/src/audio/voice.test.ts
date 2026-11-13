import { describe, expect, it } from 'vitest';
import { VOICE_LINES, VoiceAnnouncer, pickVoice, type SpeechLike } from './voice';

const v = (name: string, lang: string): SpeechSynthesisVoice => ({ name, lang, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

function fake() {
  const spoken: { text: string; pitch: number; volume: number; lang: string }[] = [];
  let cancels = 0;
  const synth: SpeechLike = {
    speak: (u) => spoken.push({ text: u.text, pitch: u.pitch, volume: u.volume, lang: u.lang }),
    cancel: () => void cancels++,
    getVoices: () => [v('Tingting', 'zh-CN'), v('Samantha', 'en-US'), v('Daniel', 'en-GB')],
  };
  const timers: { fn: () => void; ms: number }[] = [];
  const ann = new VoiceAnnouncer({
    synth,
    makeUtterance: (text) => ({ text, pitch: 1, rate: 1, volume: 1, lang: '', voice: null }) as unknown as SpeechSynthesisUtterance,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: (id) => void (timers[id - 1].fn = () => undefined),
  });
  return { ann, spoken, timers, cancels: () => cancels };
}

describe('人声播报', () => {
  it('优先挑低沉的英语男声；没有英语嗓音时交给浏览器', () => {
    expect(pickVoice([v('Tingting', 'zh-CN'), v('Samantha', 'en-US'), v('Daniel', 'en-GB')])?.name).toBe('Daniel');
    expect(pickVoice([v('Tingting', 'zh-CN'), v('Samantha', 'en-US')])?.name).toBe('Samantha');
    expect(pickVoice([v('Tingting', 'zh-CN')])).toBeNull();
  });

  it('有台词的播报会念出来，敌方的音调更低，音量跟随设置', () => {
    const { ann, spoken } = fake();
    ann.setVolume(0.5);
    expect(ann.say('double_kill', false)).toBe(true);
    expect(ann.say('double_kill', true)).toBe(true);
    expect(spoken.map((s) => s.text)).toEqual(['Double kill!', 'Double kill!']);
    expect(spoken[1].pitch).toBeLessThan(spoken[0].pitch);
    expect(spoken[0].volume).toBe(0.5);
    expect(spoken[0].lang).toBe('en-GB');
  });

  it('没有台词的播报、音量为 0、已释放时都不念', () => {
    const { ann, spoken } = fake();
    expect(VOICE_LINES.tower_destroyed).toBeUndefined();
    expect(ann.say('tower_destroyed', false)).toBe(false);
    ann.setVolume(0);
    expect(ann.say('first_blood', false)).toBe(false);
    ann.setVolume(1);
    ann.dispose();
    expect(ann.say('first_blood', false)).toBe(false);
    expect(spoken).toHaveLength(0);
  });

  it('延迟开口；stop 会取消还没开口的那句', () => {
    const { ann, spoken, timers } = fake();
    ann.say('penta_kill', false, 0.3);
    expect(spoken).toHaveLength(0);
    expect(timers[0].ms).toBe(300);
    timers[0].fn();
    expect(spoken[0].text).toBe('Penta kill!');
    ann.say('ace', false, 0.3);
    ann.stop();
    timers[1].fn();
    expect(spoken).toHaveLength(1);
  });

  it('环境不支持语音合成时静默', () => {
    const ann = new VoiceAnnouncer({ synth: null });
    expect(ann.available).toBe(false);
    expect(ann.say('first_blood', false)).toBe(false);
  });
});
