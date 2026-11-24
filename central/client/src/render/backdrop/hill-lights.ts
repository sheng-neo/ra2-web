/**
 * 山上灯点（纯函数，确定性）：大部分是沿等高线走的「山路灯链」（钠灯为主，少数白光 LED），
 * 其余是零散的屋苑窗光小簇，外加山顶（Peak）一带的一簇。只放在地形网格以外的远景山体上
 * （网格内的山路灯由 STREETS 的路灯负责）。坐标模拟米。
 */
import { mulberry32, type GlowSpec } from './massing';

export interface HillLightInput {
  height: (x: number, y: number) => number;
  /** 该点可以放灯（陆地、网格外、在山上）。 */
  allowed: (x: number, y: number) => boolean;
  /** 撒点范围（模拟米）。 */
  rect: readonly [number, number, number, number];
  /** 离这些点（相机机位）太近不放灯（米）。 */
  avoid?: readonly { x: number; y: number; r: number }[];
}

export function hillLights(input: HillLightInput, seed = 7319): GlowSpec[] {
  const rand = mulberry32(seed);
  const out: GlowSpec[] = [];
  const [rx0, ry0, rx1, ry1] = input.rect;
  const ok = (x: number, y: number) =>
    x > rx0 && x < rx1 && y > ry0 && y < ry1 && input.allowed(x, y) && !(input.avoid ?? []).some((a) => Math.hypot(x - a.x, y - a.y) < a.r);
  const grad = (x: number, y: number): [number, number] => {
    const e = 8;
    return [(input.height(x + e, y) - input.height(x - e, y)) / (2 * e), (input.height(x, y + e) - input.height(x, y - e)) / (2 * e)];
  };

  // 山路灯链：沿等高线（垂直于坡度）每 32 m 一盏，牛顿一步拉回原等高线。
  // 复审后：只 15 条；每盏 50 % 被树挡掉、亮度 0.3–1 倍（照片 05、07：断断续续的一串，不是沿山脊的一道亮墙）
  let chains = 0;
  for (let tries = 0; tries < 400 && chains < 15; tries++) {
    let x = rx0 + rand() * (rx1 - rx0);
    let y = ry0 + rand() * (ry1 - ry0);
    if (!ok(x, y)) continue;
    const h0 = input.height(x, y);
    if (h0 < 50 || h0 > 470) continue;
    chains++;
    const sodium = rand() < 0.75;
    const dir = rand() < 0.5 ? 1 : -1;
    const steps = 12 + Math.floor(rand() * 30);
    let level = h0;
    for (let k = 0; k < steps; k++) {
      const [gx, gy] = grad(x, y);
      const g2 = gx * gx + gy * gy;
      if (g2 < 1e-4) break;
      const gl = Math.sqrt(g2);
      // 沿等高线前进，带一点缓慢爬升（山路有坡）
      x += (-gy / gl) * 32 * dir + (gx / gl) * 32 * 0.06;
      y += (gx / gl) * 32 * dir + (gy / gl) * 32 * 0.06;
      level += 32 * 0.06 * gl;
      const h = input.height(x, y);
      x += (gx / g2) * (level - h) * 0.8;
      y += (gy / g2) * (level - h) * 0.8;
      if (!ok(x, y)) break;
      const hz = input.height(x, y);
      const hidden = rand() < 0.5;
      const k01 = 0.3 + 0.7 * rand();
      if (!hidden) out.push({ x, y, z: hz + 8, colour: sodium ? 'sodium' : 'ledWhite', intensity: (sodium ? 6 : 8) * k01, radius: 0.3 });
    }
  }

  // 零散屋苑：3–8 盏暖光的小簇
  for (let tries = 0, made = 0; tries < 600 && made < 70; tries++) {
    const x = rx0 + rand() * (rx1 - rx0);
    const y = ry0 + rand() * (ry1 - ry0);
    if (!ok(x, y)) continue;
    const h = input.height(x, y);
    if (h < 40 || h > 520) continue;
    made++;
    const n = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      const px = x + (rand() - 0.5) * 50;
      const py = y + (rand() - 0.5) * 50;
      if (!ok(px, py)) continue;
      out.push({ x: px, y: py, z: input.height(px, py) + 3 + rand() * 10, colour: rand() < 0.6 ? 'homeWarm' : 'homeCool', intensity: 2.5 + rand() * 1.5, radius: 0.5 });
    }
  }
  return out;
}
