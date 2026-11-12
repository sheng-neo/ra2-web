/**
 * 兵线收边：沿三条兵线的两侧各砌一排倒角条石(路缘石)。
 * 它只是一条视觉边线——露出地面不到 0.12 米，单位照常跨过；配合地表着色器把路边收成
 * 「石板 → 路缘石 → 一条窄夯土带 → 草」。渡口、基地、塔座、紧贴墙体处不放；15% 缺失、10% 歪斜下沉。
 * 全部并进不投影的贴地小物分块网格，不新增 draw call。
 */
import * as THREE from 'three';
import { Rng } from '../materials';
import type { MapField } from './field';
import { type MeshBuilder, type RGB, type SceneryBatcher, mixRgb, rgb, scaleRgb } from './geo';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** 路缘石中线到兵线边缘的距离(米) */
export const CURB_OFFSET = 0.1;
const CURB_WIDTH = 0.28;

const TOP = rgb(0xb9b0a0);
const TOP_WARM = rgb(0xc4b697);
const SIDE = rgb(0x847d74);
const MOSS = rgb(0x6d8f58);

/**
 * 一块倒角条石(无底面，10 个三角形)：底面 len × wid，顶面四周内收 bevel，高 h。按面给法线。
 * m 把局部坐标(x 沿长边，y 向上)变到世界。
 */
export function addSlab(b: MeshBuilder, m: THREE.Matrix4, len: number, wid: number, h: number, bevel: number, top: RGB, side: RGB, glow = 0): void {
  const hl = len / 2;
  const hw = wid / 2;
  const tl = hl - bevel;
  const tw = hw - bevel;
  const y0 = -0.04;
  // 底圈 0..3、顶圈 4..7(逆时针，从上往下看)
  const P: [number, number, number][] = [
    [-hl, y0, -hw],
    [-hl, y0, hw],
    [hl, y0, hw],
    [hl, y0, -hw],
    [-tl, h, -tw],
    [-tl, h, tw],
    [tl, h, tw],
    [tl, h, -tw],
  ];
  _nm.getNormalMatrix(m);
  const face = (ia: number, ib: number, ic: number, id: number, nx: number, ny: number, nz: number, ca: RGB, cb: RGB): void => {
    _n.set(nx, ny, nz).applyMatrix3(_nm).normalize();
    const idx: number[] = [];
    [ia, ib, ic, id].forEach((i, k) => {
      _v.set(P[i][0], P[i][1], P[i][2]).applyMatrix4(m);
      idx.push(b.vertex(_v.x, _v.y, _v.z, k < 2 ? ca : cb, _n.x, _n.y, _n.z, 0, glow, 0, k < 2 ? 0.7 : 1));
    });
    b.quad(idx[0], idx[1], idx[2], idx[3]);
  };
  const k = bevel / Math.max(0.02, h);
  face(4, 5, 6, 7, 0, 1, 0, top, top);
  face(1, 2, 6, 5, 0, k, 1, side, top);
  face(3, 0, 4, 7, 0, k, -1, side, top);
  face(0, 1, 5, 4, -1, k, 0, side, top);
  face(2, 3, 7, 6, 1, k, 0, side, top);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

/** 沿三条兵线两侧砌路缘石。返回三角形数 */
export function buildLaneCurbs(batch: SceneryBatcher, field: MapField): number {
  const map = field.map;
  const half = map.laneWidth / 2 + CURB_OFFSET;
  const rng = new Rng(4242);
  let tris = 0;
  for (const lane of Object.values(map.lanes)) {
    for (const side of [-1, 1]) {
      // 沿这条兵线的弧长往前铺：carry = 下一块石头还要往前走多远才开始
      let carry = rng.range(0, 0.6);
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1];
        const b = lane[i];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const dx = (b.x - a.x) / segLen;
        const dz = (b.y - a.y) / segLen;
        const nx = -dz * side;
        const nz = dx * side;
        let d = carry;
        while (d < segLen) {
          const len = rng.range(0.9, 1.4);
          const mid = d + len / 2;
          const gap = rng.range(0.03, 0.07);
          d += len + gap;
          if (mid > segLen) break;
          const x = a.x + dx * mid + nx * half;
          const z = a.y + dz * mid + nz * half;
          const roll = rng.next();
          const tiltRoll = rng.next();
          const toneRoll = rng.next();
          const hRoll = rng.next();
          // 只在「兵线并集」的真正外沿上放：拐角内侧、路口交汇处的偏移线落在别的路面里，跳过
          if (Math.abs(field.laneDist(x, z) - CURB_OFFSET) > 0.07) continue;
          if (field.riverDist(x, z) < 0.9) continue;
          if (field.baseDist(x, z) < 0.35 || field.padDist(x, z) < 0.45) continue;
          if (field.solidDist(x, z) < 0.4) continue;
          if (roll < 0.15) continue;
          const crooked = tiltRoll < 0.1;
          const h = (0.06 + hRoll * 0.06) * (crooked ? 0.6 : 1);
          const yaw = Math.atan2(-dz, dx) + (crooked ? (rng.next() - 0.5) * 0.3 : (rng.next() - 0.5) * 0.05);
          _e.set(crooked ? (rng.next() - 0.5) * 0.16 : 0, yaw, crooked ? (rng.next() - 0.5) * 0.12 : 0, 'YXZ');
          _q.setFromEuler(_e);
          _p.set(x, crooked ? -0.02 : 0, z);
          _m.compose(_p, _q, _s);
          // 靠墙、近水的路缘石长苔；其余在暖灰与米色之间
          const mossy = field.solidDist(x, z, 3) < 1.8 || field.riverDist(x, z) < 3 ? rng.range(0.15, 0.5) : rng.range(0, 0.12);
          const top = scaleRgb(mixRgb(mixRgb(TOP, TOP_WARM, toneRoll), MOSS, mossy), 0.92 + toneRoll * 0.14);
          const mb = batch.at(x, z, false);
          const before = mb.triangleCount;
          addSlab(mb, _m, len, CURB_WIDTH * rng.range(0.9, 1.1), h, 0.035, top, mixRgb(SIDE, MOSS, mossy * 0.6));
          tris += mb.triangleCount - before;
        }
        carry = Math.max(0, d - segLen);
      }
    }
  }
  return tris;
}
