/**
 * 状态哈希：把对局状态里所有会影响后续演算的数值揉成一个 32 位整数。
 * 用于确定性测试（同种子同输入 → 每个 tick 哈希一致）与联调时定位分叉。
 */
import type { Sim } from './world';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

export function hashSim(sim: Sim): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    f64[0] = v;
    h = Math.imul(h ^ u32[0], 0x01000193);
    h = Math.imul(h ^ u32[1], 0x01000193);
  };
  const st = sim.state;
  mix(st.tick);
  mix(sim.rng.state);
  mix(st.wave);
  mix(st.over ? 1 : 0);
  for (const t of st.teams) {
    mix(t.kills);
    mix(t.gold);
    mix(t.towersDestroyed);
    mix(t.blessingLeft);
  }
  for (const u of sim.units) {
    mix(u.id);
    mix(u.pos.x);
    mix(u.pos.y);
    mix(u.facing);
    mix(u.hp);
    mix(u.mana);
    mix(u.shield);
    mix(u.alive ? 1 : 0);
    mix(u.targetId);
    mix(u.buffs.length);
    for (const b of u.buffs) {
      mix(b.timeLeft);
      mix(b.value);
      mix(b.stacks);
    }
    mix(u.rt.atkCd);
    if (u.kind === 'hero') {
      mix(u.level);
      mix(u.xp);
      mix(u.gold);
      mix(u.kills);
      mix(u.deaths);
      mix(u.respawnIn);
      mix(u.skills.s1.cd);
      mix(u.skills.s2.cd);
      mix(u.skills.ult.cd);
    }
  }
  for (const p of sim.projectiles) {
    mix(p.id);
    mix(p.pos.x);
    mix(p.pos.y);
  }
  for (const a of sim.areas) {
    mix(a.id);
    mix(a.age);
  }
  return h >>> 0;
}
