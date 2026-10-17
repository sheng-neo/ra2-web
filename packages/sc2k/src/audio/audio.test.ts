// ===== audio/audio.test.ts =====（WP12b 验收：WebAudio 合成 AudioSink —— 假 AudioContext 记录节点；Node 无 AudioContext 时静默）
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SoundId } from '../contracts/audio';
import { MUSIC_TRACKS, SOUND_IDS, SOUND_RECIPES, createAudioSink, recipeDuration } from './index';
import type { AudioContextLike } from './synth';

interface Rec { osc: number; gain: number; noise: number; starts: number; peaks: number[]; resumed: number }
function fakeContext(state: string = 'running'): { ctx: AudioContextLike; rec: Rec } {
  const rec: Rec = { osc: 0, gain: 0, noise: 0, starts: 0, peaks: [], resumed: 0 };
  const param = (onRamp?: (v: number) => void) => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: (v: number) => { onRamp?.(v); },
    exponentialRampToValueAtTime: () => undefined,
  });
  const ctx: AudioContextLike = {
    currentTime: 0, sampleRate: 8000, destination: {}, state,
    resume: () => { rec.resumed++; },
    createOscillator: () => { rec.osc++; return { type: 'sine', frequency: param(), connect: () => undefined, start: () => { rec.starts++; }, stop: () => undefined }; },
    createGain: () => { rec.gain++; return { gain: param((v) => rec.peaks.push(v)), connect: () => undefined }; },
    createBuffer: (_c, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => { rec.noise++; return { buffer: null, loop: false, connect: () => undefined, start: () => { rec.starts++; }, stop: () => undefined }; },
  };
  return { ctx, rec };
}

afterEach(() => { vi.useRealTimers(); });

describe('配方表', () => {
  it('SOUND_IDS 的每个 id 都有非空配方，时长 (0, 2] 秒', () => {
    expect(SOUND_IDS.length).toBe(23);
    for (const id of SOUND_IDS) {
      const r = SOUND_RECIPES[id];
      expect(r.length, id).toBeGreaterThan(0);
      const d = recipeDuration(r);
      expect(d, id).toBeGreaterThan(0);
      expect(d, id).toBeLessThanOrEqual(2);
      for (const s of r) { expect(s.gain).toBeGreaterThan(0); expect(s.gain).toBeLessThanOrEqual(0.5); }
    }
    expect(Object.keys(SOUND_RECIPES).sort()).toEqual([...SOUND_IDS].sort());
    for (const t of Object.values(MUSIC_TRACKS)) { expect(t.notes.length).toBe(16); expect(t.bpm).toBeGreaterThan(0); }
  });
});

describe('createAudioSink', () => {
  it('Node 下没有 AudioContext：全部方法安全空操作', () => {
    expect(typeof (globalThis as { AudioContext?: unknown }).AudioContext).toBe('undefined');
    const sink = createAudioSink();
    expect(() => { sink.play('click'); sink.loop('siren', true); sink.loop('siren', false); sink.setEnabled(true, true); sink.startMusic('city'); sink.stopMusic(); }).not.toThrow();
  });
  it('工厂抛错 / 返回 null 也静默', () => {
    const a = createAudioSink({ createContext: () => { throw new Error('nope'); } });
    const b = createAudioSink({ createContext: () => null });
    expect(() => { a.play('cash'); b.play('cash'); a.startMusic('title'); }).not.toThrow();
  });
  it('惰性创建上下文；play 创建振荡器 / 增益并启动；噪声配方用 BufferSource；suspended 时 resume', () => {
    const f = fakeContext('suspended');
    const factory = vi.fn(() => f.ctx);
    const sink = createAudioSink({ createContext: factory });
    expect(factory).not.toHaveBeenCalled();
    sink.play('click');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(f.rec.resumed).toBeGreaterThan(0);
    expect(f.rec.osc).toBe(SOUND_RECIPES.click.length);
    expect(f.rec.gain).toBe(SOUND_RECIPES.click.length);
    expect(f.rec.starts).toBe(SOUND_RECIPES.click.length);
    sink.play('explosion');
    expect(f.rec.noise).toBe(SOUND_RECIPES.explosion.filter((s) => s.wave === 'noise').length);
    sink.play('explosion');
    expect(factory).toHaveBeenCalledTimes(1);
    for (const id of SOUND_IDS) sink.play(id as SoundId);
  });
  it('volume 影响包络峰值；setEnabled(false) 后不再创建节点', () => {
    const f = fakeContext();
    const sink = createAudioSink({ createContext: () => f.ctx, masterVolume: 1 });
    sink.play('zone', { volume: 1 });
    const loud = Math.max(...f.rec.peaks);
    f.rec.peaks.length = 0;
    sink.play('zone', { volume: 0.25 });
    const quiet = Math.max(...f.rec.peaks);
    expect(quiet).toBeLessThan(loud);
    expect(quiet).toBeGreaterThan(0);
    const before = f.rec.osc;
    sink.setEnabled(false, true);
    sink.play('zone');
    expect(f.rec.osc).toBe(before);
    sink.setEnabled(true, true);
    sink.play('zone');
    expect(f.rec.osc).toBeGreaterThan(before);
  });
  it('loop(id, on)：立即播放并按配方时长重触发；off 停止；静音会清掉循环', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const sink = createAudioSink({ createContext: () => f.ctx });
    sink.loop('siren', true);
    const per = SOUND_RECIPES.siren.length;
    expect(f.rec.osc).toBe(per);
    vi.advanceTimersByTime(Math.round(recipeDuration(SOUND_RECIPES.siren) * 1000) * 3 + 5);
    expect(f.rec.osc).toBe(per * 4);
    sink.loop('siren', true);                      // 重复开启不叠加
    vi.advanceTimersByTime(Math.round(recipeDuration(SOUND_RECIPES.siren) * 1000));
    expect(f.rec.osc).toBe(per * 5);
    sink.loop('siren', false);
    vi.advanceTimersByTime(5000);
    expect(f.rec.osc).toBe(per * 5);
    sink.loop('siren', true);
    sink.setEnabled(false, false);
    const n = f.rec.osc;
    vi.advanceTimersByTime(5000);
    expect(f.rec.osc).toBe(n);
  });
  it('startMusic 按节拍步进音符；stopMusic / 关闭音乐停止；切曲先停旧曲', () => {
    vi.useFakeTimers();
    const f = fakeContext();
    const sink = createAudioSink({ createContext: () => f.ctx });
    sink.startMusic('city');
    expect(f.rec.osc).toBe(1);
    const noteMs = Math.round(Math.max(0.12, 60 / MUSIC_TRACKS.city.bpm / 2) * 1000);
    vi.advanceTimersByTime(noteMs * 4 + 2);
    expect(f.rec.osc).toBe(5);
    sink.startMusic('disaster');
    const n = f.rec.osc;
    vi.advanceTimersByTime(noteMs * 10);
    expect(f.rec.osc).toBeGreaterThan(n);
    sink.stopMusic();
    const m = f.rec.osc;
    vi.advanceTimersByTime(10000);
    expect(f.rec.osc).toBe(m);
    sink.setEnabled(true, false);
    sink.startMusic('title');
    vi.advanceTimersByTime(5000);
    expect(f.rec.osc).toBe(m);
  });
});
