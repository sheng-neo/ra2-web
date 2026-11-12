/**
 * 占位单位视图：在真实模型(R2)接入前，用一批实例化胶囊体标出各单位的位置/队伍/朝向。
 * 只做最基本的事：插值位置、按可见性隐藏、队伍着色。R2 完成后从 DEFAULT_MODULES 里移除它。
 */
import * as THREE from 'three';
import type { Unit } from '../../core/types';
import { PALETTE, createToonMaterial } from '../materials';
import type { RenderContext, RenderModule } from './context';

const CAPACITY = 320;

function sizeOf(u: Unit): { r: number; h: number } {
  switch (u.kind) {
    case 'hero':
      return { r: u.radius * 0.8, h: 2.0 };
    case 'minion':
      return { r: u.radius * 0.8, h: 1.0 };
    case 'tower':
      return { r: u.radius * 0.7, h: 6.5 };
    case 'core':
      return { r: u.radius * 0.8, h: 5.0 };
    case 'monster':
      return { r: u.radius * 0.85, h: 1.0 + u.radius };
  }
}

export function createPlaceholderUnits(ctx: RenderContext): RenderModule {
  const geo = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
  geo.translate(0, 1, 0);
  const mat = createToonMaterial({ steps: 3, rim: 0.5, fx: false });
  const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
  mesh.name = 'placeholder-units';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  ctx.layers.units.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const lying = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const c = new THREE.Color();
  const colors = {
    blue: new THREE.Color(PALETTE.blue.main),
    red: new THREE.Color(PALETTE.red.main),
    neutral: new THREE.Color(PALETTE.neutral.main),
    player: new THREE.Color(PALETTE.player.main),
  };

  return {
    name: 'units',
    update(frame) {
      const st = frame.state;
      let n = 0;
      for (const u of st.units) {
        if (n >= CAPACITY) break;
        if (u.team !== frame.playerTeam && u.team !== 2 && !u.visible[frame.playerTeam]) continue;
        if (!u.alive && u.kind !== 'hero') continue;
        const a = frame.alpha;
        const x = u.prevPos.x + (u.pos.x - u.prevPos.x) * a;
        const z = u.prevPos.y + (u.pos.y - u.prevPos.y) * a;
        const sz = sizeOf(u);
        p.set(x, ctx.terrain.heightAt(x, z) * 0.6, z);
        // facing 是 atan2(y, x)：绕 y 轴转 -facing 让模型的 +x 朝向该方向
        q.setFromAxisAngle(up, -u.facing);
        if (!u.alive) q.multiply(lying);
        s.set(sz.r * 2, sz.h / 2, sz.r * 2);
        m.compose(p, q, s);
        mesh.setMatrixAt(n, m);
        c.copy(u.id === st.playerId ? colors.player : u.team === 0 ? colors.blue : u.team === 1 ? colors.red : colors.neutral);
        if (!u.alive) c.multiplyScalar(0.35);
        mesh.setColorAt(n, c);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      ctx.layers.units.remove(mesh);
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
