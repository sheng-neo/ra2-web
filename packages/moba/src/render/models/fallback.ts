/**
 * 兜底模型：注册表里没有对应键时(未知类型)用一个带队伍色腰带的石质傀儡桩代替，保证渲染不因缺模型而中断。
 */
import { ModelBuilder } from './kit';
import { Rig } from './rig';
import type { ModelDef } from './types';

const cache = new Map<string, ModelDef>();

export function getFallbackModel(radius: number, height: number): ModelDef {
  const key = `fallback:${radius.toFixed(2)}:${height.toFixed(2)}`;
  let def = cache.get(key);
  if (def) return def;
  const rig = new Rig();
  const root = rig.add('root', -1, 0, 0, 0);
  const body = rig.add('body', root, 0, height * 0.4, 0);
  const b = new ModelBuilder();
  const r = radius * 0.8;
  b.bone(body).paint(0x9aa0a8, { c2: 0xc8ccd4 });
  b.lathe(
    [
      [0, r * 0.9],
      [height * 0.1, r],
      [height * 0.55, r * 0.85],
      [height * 0.8, r * 0.6],
      [height, r * 0.15],
    ],
    { seg: 8, crease: 30 },
  );
  b.paint(0xffffff, { team: 1 });
  b.lathe([[height * 0.42, r * 0.95], [height * 0.5, r * 0.94], [height * 0.52, r * 0.8]], { seg: 8, cap0: false });
  b.bakeGrounding(height);
  def = {
    key,
    geometry: b.build(),
    rig,
    height,
    radius,
    scale: 1,
    stride: 2,
    triangles: b.triangleCount,
    attach: { chest: { joint: body, x: 0, y: height * 0.2, z: 0 } },
    blend: () => 0.12,
    animate(pose, a) {
      if (a.anim === 'dead') {
        const k = Math.min(1, a.t / 0.8);
        pose.rot(root, -80 * k * k, 0, 0);
        pose.scale(root, 1 - 0.5 * k);
      } else if (a.anim === 'move') pose.pos(body, 0, Math.abs(Math.sin(a.stride * Math.PI * 2)) * 0.12, 0);
      else if (a.anim === 'attack') pose.rot(body, 30 * Math.sin(Math.min(1, a.p / 0.5) * Math.PI), 0, 0);
      else pose.pos(body, 0, Math.sin(a.time * 2 + a.seed * 6) * 0.02, 0);
    },
  };
  cache.set(key, def);
  return def;
}
