import { describe, expect, it } from 'vitest';
import { RIDE_LOOK, RideLook } from './ride-look';
import { RIDE_MOTION, RideMotion } from '../render/streets/tram/ride-motion';

const D = Math.PI / 180;

describe('搭電車转头看（R4 S-P0-3）', () => {
  it('夹角：偏航 ±120°、俯仰 −35°…+25°', () => {
    const l = new RideLook();
    l.nudge(10, 10);
    expect(l.goalYaw).toBeCloseTo(120 * D);
    expect(l.goalPitch).toBeCloseTo(25 * D);
    l.nudge(-20, -20);
    expect(l.goalYaw).toBeCloseTo(-120 * D);
    expect(l.goalPitch).toBeCloseTo(-35 * D);
  });

  it('缓动 ≥ 0.15 s：一帧不会跳到位，0.6 s 后基本到位', () => {
    const l = new RideLook();
    l.nudge(90 * D, 0);
    l.update(1 / 60);
    expect(l.yaw).toBeLessThan(10 * D);
    for (let i = 0; i < 36; i++) l.update(1 / 60);
    expect(l.yaw).toBeGreaterThan(85 * D);
    expect(RIDE_LOOK.easeS).toBeGreaterThanOrEqual(0.15);
  });

  it('停手 6 s 自动回正；「向前」立刻回正；调试设的角不自动回正', () => {
    const l = new RideLook();
    l.nudge(80 * D, -10 * D);
    for (let i = 0; i < 60 * 5; i++) l.update(1 / 60);
    expect(l.yaw).toBeGreaterThan(75 * D);
    for (let i = 0; i < 60 * 6; i++) l.update(1 / 60);
    expect(Math.abs(l.yaw)).toBeLessThan(2 * D);
    expect(l.pitch).toBeCloseTo(RIDE_LOOK.defaultPitch, 1);
    l.nudge(-60 * D, 0);
    l.front();
    for (let i = 0; i < 60; i++) l.update(1 / 60);
    expect(Math.abs(l.yaw)).toBeLessThan(2 * D);
    l.set(70 * D, -6 * D, true, true);
    for (let i = 0; i < 60 * 30; i++) l.update(1 / 60);
    expect(l.yaw).toBeCloseTo(70 * D);
  });
});

describe('车身晃动（R4 S-P0-3）', () => {
  it('俯仰 ≤ 0.6°、侧倾 ≤ 0.5°、起伏 ≤ 2 cm；刹车点头、加速抬头；弯道往外倾', () => {
    const m = new RideMotion();
    let s = 0;
    let v = 0;
    let maxLift = 0;
    let minPitch = 0;
    let maxPitch = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const t = i / 60;
      const a = t < 8 ? 1.0 : t < 20 ? 0 : t < 27 ? -1.1 : 0;
      v = Math.max(0, v + a / 60);
      s += v / 60;
      m.update(1 / 60, v, t > 10 && t < 18 ? 1 / 30 : 0, s);
      maxLift = Math.max(maxLift, Math.abs(m.lift));
      minPitch = Math.min(minPitch, m.pitch);
      maxPitch = Math.max(maxPitch, m.pitch);
      expect(Math.abs(m.pitch)).toBeLessThanOrEqual(RIDE_MOTION.pitchMax + 1e-9);
      expect(Math.abs(m.roll)).toBeLessThanOrEqual(RIDE_MOTION.rollMax + 1e-9);
      if (t > 14 && t < 17) expect(m.roll).toBeGreaterThan(0);
    }
    expect(maxLift).toBeLessThanOrEqual(0.02);
    expect(maxLift).toBeGreaterThan(0.005);
    expect(maxPitch).toBeGreaterThan(0.3 * D);
    expect(minPitch).toBeLessThan(-0.3 * D);
  });

  it('停站不抖：车停下 3 s 后俯仰、侧倾、起伏都 < 0.01°/1 mm；快进（大 dt）不发散', () => {
    const m = new RideMotion();
    m.update(1 / 60, 7, 0.02, 0);
    for (let i = 0; i < 180; i++) m.update(1 / 60, 0, 0, 100);
    expect(Math.abs(m.pitch)).toBeLessThan(0.01 * D);
    expect(Math.abs(m.roll)).toBeLessThan(0.01 * D);
    expect(Math.abs(m.lift)).toBeLessThan(0.001);
    m.update(0.8, 8, 0.05, 120);
    expect(Number.isFinite(m.pitch) && Math.abs(m.pitch) <= RIDE_MOTION.pitchMax).toBe(true);
  });
});
