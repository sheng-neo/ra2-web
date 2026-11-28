import { describe, expect, it } from 'vitest';
import { FG, FP, GAIT, gait, nearFigureGeometry } from './figure';
import { STRIDE_M, WALK_SPEED, type AgentPose, type Crowd } from './crowd';
import { MID_TRIANGLES, Pedestrians } from './pedestrians';

describe('近景人形几何（R4 S-P0-1）', () => {
  const g = nearFigureGeometry();
  const pos = g.getAttribute('position').array as Float32Array;
  const nrm = g.getAttribute('normal').array as Float32Array;
  const rig = g.getAttribute('aRig').array as Float32Array;
  const part = Float32Array.from({ length: rig.length / 4 }, (_, i) => rig[i * 4]!);
  const gate = Float32Array.from({ length: rig.length / 4 }, (_, i) => Math.floor(rig[i * 4 + 1]! / 16));
  const tris = (g.index?.count ?? 0) / 3;

  it('≤ 900 个三角形，法线都是单位向量（平滑着色，无零法线）', () => {
    expect(tris).toBeLessThanOrEqual(900);
    expect(tris).toBeGreaterThan(500);
    for (let i = 0; i < nrm.length; i += 3) expect(Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!)).toBeCloseTo(1, 3);
  });

  it('比例：身高 1.70–1.74 m（含头发）、头长约 1/7.5 身高、肩宽 0.42–0.47 m', () => {
    let top = 0;
    let chin = 9;
    let shoulder = 0;
    for (let i = 0; i < pos.length / 3; i++) {
      const y = pos[i * 3 + 1]!;
      const p = part[i]!;
      if (gate[i] === FG.always) top = Math.max(top, y);
      if (p === FP.face) chin = Math.min(chin, y);
      if (p === FP.upperArm && y > 1.3) shoulder = Math.max(shoulder, Math.abs(pos[i * 3 + 2]!));
    }
    expect(top).toBeGreaterThan(1.7);
    expect(top).toBeLessThan(1.75);
    const head = top - chin;
    expect(1.7 / head).toBeGreaterThan(6.8);
    expect(1.7 / head).toBeLessThan(8);
    expect(shoulder * 2).toBeGreaterThan(0.42);
    expect(shoulder * 2).toBeLessThan(0.47);
  });

  it('部件齐全：头发、脸、上衣、上臂、前臂、下装、鞋；选配件：裙、马尾、帽舌、背包、斜挎包、托特包、公文包、手机', () => {
    const parts = new Set(part);
    for (const p of [FP.hair, FP.face, FP.top, FP.upperArm, FP.foreArm, FP.bottom, FP.shoe, FP.skin]) expect(parts.has(p)).toBe(true);
    const gates = new Set(gate);
    for (const k of Object.values(FG)) expect(gates.has(k)).toBe(true);
  });
});

describe('步态（纯函数，与着色器同一组常数）', () => {
  it('步频 1.8–2.0 步/秒（1.25 m/s），大腿摆幅 ≤ 0.35 rad、手臂反向摆、膝盖只往后弯、起伏 ≤ 2.5 cm', () => {
    const steps = (2 * WALK_SPEED) / STRIDE_M;
    expect(steps).toBeGreaterThan(1.8);
    expect(steps).toBeLessThan(2.0);
    for (let k = 0; k < 64; k++) {
      const ph = (k / 64) * Math.PI * 2;
      const a = gait(ph, 1);
      expect(Math.abs(a.hipL)).toBeLessThanOrEqual(GAIT.hip + 1e-9);
      expect(a.hipR).toBeCloseTo(-a.hipL);
      if (Math.abs(a.hipL) > 0.05) expect(Math.sign(a.shoulderL)).toBe(-Math.sign(a.hipL));
      expect(a.kneeL).toBeGreaterThanOrEqual(0);
      expect(a.kneeR).toBeGreaterThanOrEqual(0);
      expect(a.elbowL).toBeGreaterThan(0);
      expect(Math.abs(a.bob)).toBeLessThanOrEqual(0.025);
    }
    // 摆动期（腿往前）膝盖弯得多
    expect(gait(0, 1).kneeL).toBeGreaterThan(gait(Math.PI, 1).kneeL);
    // 站着：几乎不动
    const s = gait(1.3, 0);
    expect(s.hipL).toBeCloseTo(0);
    expect(s.bob).toBeCloseTo(0);
  });
});

describe('行人 LOD（HIGH：30 m 内 ≤ 64 个近景人形，60 m 内低模，其余广告牌）', () => {
  it('按距离分级、近景上限、三角形统计', () => {
    const N = 200;
    const crowd = {
      gather(_x: number, _y: number, _z: number, _r: number, _t: number, out: AgentPose[]) {
        for (let i = 0; i < N; i++) {
          const o = out[i]!;
          o.x = i * 0.5;
          o.y = 0;
          o.z = 0;
          o.hx = 1;
          o.hy = 0;
          o.walk = 1;
          o.phase = 0;
          o.scale = 1;
          o.seed = i;
        }
        return N;
      },
    } as unknown as Crowd;
    const peds = new Pedestrians(crowd, { radius: 150, nearM: 60, cap: 600, nearCap: 260, detail: { m: 30, cap: 64 } });
    const camera = { position: { x: 0, y: 1.6, z: 0 } } as never;
    peds.update(camera, 0);
    const st = peds.stats();
    // 0–30 m 共 61 人（0.5 m 一个，眼高 1.6 m）
    expect(st.near).toBeLessThanOrEqual(64);
    expect(st.near).toBe(60);
    expect(st.mid).toBe(60);
    expect(st.far).toBe(80);
    expect(st.triangles).toBe(st.near * st.nearTriangles + st.mid * MID_TRIANGLES + st.far * 2);
    expect(st.near * st.nearTriangles).toBeLessThanOrEqual(64 * 900);
    // LOW：没有近景层
    const low = new Pedestrians(crowd, { radius: 80, nearM: 30, cap: 150, nearCap: 50 });
    low.update(camera, 0);
    expect(low.stats().near).toBe(0);
  });
});
