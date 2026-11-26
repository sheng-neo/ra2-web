/**
 * 集电杆对线（R2 TRAMS T5 / T6）：纯函数。杆长 4 m、杆座在车顶中部偏前 0.4 m，杆头向后上方拖在接触线上。
 * 找接触线上离杆座正好 4 m 的点（沿线往后迭代），再把这点换到车身局部坐标求仰角与偏角 —— 弯道、坡道、桥下压低的线
 * 杆头都正好搭在线上。
 */
import { POLE_LEN_M, POLE_PIVOT } from './body';
import { routePoint, sampleAt, type RoutePose, type TramRoute } from './route';

export interface PoleAim {
  /** 仰角（弧度，水平为 0）。 */
  pitch: number;
  /** 偏角（弧度）：0 = 正后方，向车身右侧（局部 +z）为正。 */
  yaw: number;
}

/** 杆座 → 目标点（局部坐标差：dx 向前、dy 向上、dz 向右）的杆角。 */
export function poleAim(dx: number, dy: number, dz: number): PoleAim {
  return { pitch: Math.atan2(dy, Math.hypot(dx, dz)), yaw: Math.atan2(dz, -dx) };
}

const q = { x: 0, y: 0, z: 0 };

/**
 * 车在沿线 s、姿态 pose（模拟坐标，米）时，杆头该搭的接触线点（模拟坐标 + mPD）与杆角。
 * out 收杆头位置；返回杆角。
 */
export function aimPole(r: TramRoute, s: number, pose: RoutePose, out: [number, number, number]): PoleAim {
  const px = pose.x + pose.hx * POLE_PIVOT[0];
  const py = pose.y + pose.hy * POLE_PIVOT[0];
  const pz = pose.z + POLE_PIVOT[1];
  let st = s - 3.4;
  for (let k = 0; k < 4; k++) {
    routePoint(r, st, q);
    const wz = q.z + sampleAt(r.wire, st);
    const d = Math.hypot(q.x - px, q.y - py, wz - pz);
    st += d - POLE_LEN_M;
  }
  routePoint(r, st, q);
  const wz = q.z + sampleAt(r.wire, st);
  const ex = q.x - px;
  const ey = q.y - py;
  const ez = wz - pz;
  // 局部：前 = (hx, hy)，右 = (hy, −hx)（模拟坐标）
  const aim = poleAim(ex * pose.hx + ey * pose.hy, ez, ex * pose.hy - ey * pose.hx);
  const c = Math.cos(aim.pitch);
  // 杆头 = 杆座 + 4 m ×（−cos p cos y 前 + sin p 上 + cos p sin y 右）
  const fwd = -c * Math.cos(aim.yaw) * POLE_LEN_M;
  const right = c * Math.sin(aim.yaw) * POLE_LEN_M;
  out[0] = px + pose.hx * fwd + pose.hy * right;
  out[1] = py + pose.hy * fwd - pose.hx * right;
  out[2] = pz + Math.sin(aim.pitch) * POLE_LEN_M;
  return aim;
}
