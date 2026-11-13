/**
 * 野怪相关的通用特效：
 *   - 河道巨龙的吐息：drake_breath_warn(扇形预警 + 口部聚光) / drake_breath(开口锥气流 + 雾团星屑 + 地面渊蚀)，被喷中的单位身上爆开紫色水雾；
 *   - 野怪倒地 monster_slain：按种类换成冰屑 / 余烬 / 孢子 / 鳞粉 / 渊珠碎光 / 星核星雨，节拍对齐 C 包的死亡动作；
 *   - 野怪刷新(monsterSpawn 事件)：霜雾 / 地裂拱出 / 地洞尘土 / 灯花螺旋 / 潭面旋涡水柱 / 陨星砸潭；
 *   - 史诗野怪被击杀(epicSlain 事件)：河道巨龙 ≈3 秒的全队演出、星陨巨灵的星雨与八芒星印。
 * 野怪预警统一「琥珀边 + 紫色由内向外推进的填充」，与敌方技能的红、己方的蓝区分开(§5.5)。
 */
import * as THREE from 'three';
import type { GameState, MonsterType, TeamId } from '../../../core/types';
import { FX_RULES, P, R, WARN, debris, dustPuff, dustRing, embers, glints, hitBurst, pillar, ring, shards, shockShell, sparks } from '../common';
import { DECAL } from '../decals';
import { MODE, SHAPE, type FxMesh } from '../glow';
import type { FxKit } from '../kit';
import { SPRITE } from '../textures';
import { C, TAU, teamTheme } from '../util';
import type { FxHandler } from './types';

// ───────────────────────── 最近倒下的野怪(增益光球的起点) ─────────────────────────

interface Slain {
  type: MonsterType;
  x: number;
  y: number;
  z: number;
  t: number;
}
const SLAIN = new WeakMap<FxKit, Slain[]>();

function remember(k: FxKit, type: MonsterType, x: number, y: number, z: number): void {
  let list = SLAIN.get(k);
  if (!list) {
    list = [];
    SLAIN.set(k, list);
  }
  for (let i = list.length - 1; i >= 0; i--) if (k.now - list[i].t > 2) list.splice(i, 1);
  list.push({ type, x, y, z, t: k.now });
}

/** 1 秒内、离 (x, z) 不到 14 米倒下的指定种类野怪(type = null 表示不限) */
export function recentSlain(k: FxKit, x: number, z: number, type: MonsterType | null): Slain | null {
  const list = SLAIN.get(k);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (k.now - s.t > 1 || (type && s.type !== type)) continue;
    if (Math.hypot(s.x - x, s.z - z) < 14) return s;
  }
  return null;
}

// ───────────────────────── 河道巨龙吐息 ─────────────────────────

const _v = new THREE.Vector3();
/** 野怪扇形预警的推进填充色(饱和的中紫，在暖石地面上读得出) */
const WARN_FILL = new THREE.Color(0x8040ff);
const _w = new THREE.Vector3();

/** 吐息口(C 包的挂点 vent / muzzle)；没有就按单位位置 + 朝向估算 */
function mouth(k: FxKit, id: number, dirX: number, dirZ: number, out: THREE.Vector3): boolean {
  if (k.anchors.attach?.(id, 'vent', out) || k.anchors.attach?.(id, 'muzzle', out)) return true;
  if (!k.anchor(id)) return false;
  out.set(k.a.x + dirX * (k.a.radius * 1.3 + 0.6), k.a.y + k.a.height * 0.5, k.a.z + dirZ * (k.a.radius * 1.3 + 0.6));
  return true;
}

const drakeBreathWarn: FxHandler = (k, e) => {
  const dir = e.dir ?? { x: 1, y: 0 };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const dx = dir.x / dl;
  const dz = dir.y / dl;
  const radius = e.radius ?? 7.5;
  const half = (e.angle ?? Math.PI / 3) * 0.5;
  const warn = Math.max(0.2, e.value ?? 0.9);
  const rot = Math.atan2(dz, dx);
  const id = e.unitId ?? -1;
  // 扇形预警：琥珀实线边 + 紫色淡填充由顶点向外推进；被地形/单位挡住的部分也画出边线
  if (id < 0 || !k.anchor(id)) {
    // 没有巨龙单位(画廊的合成事件)：一次性贴花按自身寿命推进
    k.decals.add(DECAL.coneWarn, e.pos.x, e.pos.y, radius, warn + 0.12).y(0.09).rot(rot).params(half, -1).color(WARN.monster.edge, 1.6, 0.95).under(WARN_FILL, 0.7).xray();
    return;
  }
  // 巨龙在场：用常驻贴花逐帧推进填充。蓄息中途巨龙被打死(单位离场、跟踪器随即结束)就立刻收掉——
  // 模拟层此时已取消这次吐息，地上不能还留着一块走完全程的空预警
  const slot = k.decals.hold(DECAL.coneWarn, 0.06);
  k.decals.at(slot).at(e.pos.x, e.pos.y).radius(radius).y(0.09).rot(rot).params(half, 0).color(WARN.monster.edge, 1.6, 0.95).under(WARN_FILL, 0.7).xray();
  k.track(
    id,
    warn + 0.12,
    (_a, t) => {
      k.decals.at(slot).params(half, t);
    },
    () => k.decals.release(slot, 0.12),
  );
  // 口中聚光：一颗逐渐涨大的光球，四周的光点螺旋着被吸进去
  const m = k.glow.hold(SHAPE.sphere, MODE.core);
  m.color(C.violetHot, 1.25, 0);
  m.add = 0.55;
  m.k = 1.4;
  let acc = 0;
  k.track(
    id,
    warn,
    (_a, t, dt) => {
      if (!mouth(k, id, dx, dz, _v)) return;
      // 聚光只是口中的一点(收小、压暗)：太大太亮会把整个龙头连同鳞片的明暗冲成一片紫白
      const s = 0.12 + 0.36 * t * t;
      m.at(_v.x, _v.y, _v.z).scale(s);
      m.a = 0.25 + 0.5 * t;
      acc += dt * (14 + 30 * t) * k.density;
      const p = k.particles.use(P.glint).tint(C.violetHot, C.abyssCyan);
      while (acc >= 1) {
        acc -= 1;
        p.orbit(_v.x, _v.y + k.rnd.range(-0.6, 0.4), _v.z, k.rnd.range(1.4, 2.2), 0.05, k.rnd.next() * TAU, k.rnd.range(3, 6), k.rnd.range(-0.2, 0.6), 0.35, 0.26, 0.08);
      }
    },
    () => k.glow.release(m),
  );
};

/** 正在喷吐的巨龙(被喷中单位的紫色水雾判定用)：龙的 id → 喷吐结束时刻 */
const BREATHING = new WeakMap<FxKit, Map<number, number>>();

const drakeBreath: FxHandler = (k, e, env) => {
  const dir = e.dir ?? { x: 1, y: 0 };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const dx = dir.x / dl;
  const dz = dir.y / dl;
  const radius = e.radius ?? 7.5;
  const half = (e.angle ?? Math.PI / 3) * 0.5;
  const dur = Math.max(0.2, e.value ?? 0.8);
  const id = e.unitId ?? -1;
  const ox = e.pos.x;
  const oz = e.pos.y;
  let map = BREATHING.get(k);
  if (!map) {
    map = new Map();
    BREATHING.set(k, map);
  }
  map.set(id, k.now + dur + 0.15);
  const base = Math.atan2(dz, dx);
  // 主体：开口锥气流，口部跟着挂点走，方向随龙颈从左扫到右(±10°)，结尾 0.25 秒由根部向外溶解
  const cone = k.glow.hold(SHAPE.breath, MODE.breath);
  cone.color(C.violet, 1.05, 0);
  cone.add = 0.4;
  cone.k = 2.6;
  cone.progress = 0;
  const life = dur + 0.25;
  let puffAcc = 0;
  let markAcc = 0;
  let flowAcc = 0;
  const rnd = k.rnd;
  const tick = (t01: number, dt: number): void => {
    const tt = t01 * life;
    const ang = base + (-0.17 + 0.34 * Math.min(1, tt / dur));
    const cx = Math.cos(ang);
    const cz = Math.sin(ang);
    if (!mouth(k, id, cx, cz, _v)) _v.set(ox + cx * 2, 2.2, oz + cz * 2);
    // 口到扇形末端的距离：模拟层的扇形顶点在龙身中心
    const md = (_v.x - ox) * cx + (_v.z - oz) * cz;
    const L = Math.max(3, radius - md + 0.4);
    const endR = Math.tan(half) * radius * 0.92;
    const pitch = -Math.atan2(Math.max(0, _v.y - 0.9), L);
    const grow = Math.min(1, tt / 0.12);
    // 截面压扁(高约为宽的三分之一)：读成一股贴地横扫的气，而不是竖起来的一面扇子
    cone.at(_v.x, _v.y, _v.z).scale3(L * (0.35 + 0.65 * grow), endR * 0.36 * grow, endR * grow).rot(0, -ang, pitch);
    // 锥体只当气流的「体」：压淡，层次交给口部亮核、贴地流光与丝缕
    cone.a = Math.min(1, tt / 0.08) * 0.6;
    cone.progress = tt > dur ? Math.min(1, (tt - dur) / 0.25) : 0;
    if (tt > dur) return;
    // 口部白热：一小颗很亮的核 + 一圈收着的青晕(以前是一大团 1.9 米的光，连龙头一起漂白)
    k.sprites.draw(SPRITE.glow, _v.x, _v.y, _v.z, 1.15 * grow, 0, C.abyssCyan, 1.2, 0.75, 0.6);
    k.sprites.draw(SPRITE.glow, _v.x + cx * 0.25, _v.y - 0.05, _v.z + cz * 0.25, 0.55 * grow, 0, C.violetHot, 2.6, 1, 0.85);
    // 雾团与星屑拉丝：沿锥体喷出。丝缕(细长的亮线)占一半以上——「气」是一股一股的，不是一片薄纱
    puffAcc += dt * 40 * k.density;
    while (puffAcc >= 1) {
      puffAcc -= 1;
      const a = ang + rnd.signed() * half * 0.85;
      const s = rnd.range(7, 12);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (rnd.chance(0.42)) k.particles.use(P.puff).spawn(_v.x + ca * 0.4, _v.y - 0.1, _v.z + sa * 0.4, ca * s, -rnd.range(1.2, 2.4), sa * s, rnd.range(0.5, 0.75), 0.8, rnd.range(2.2, 3.2));
      else k.particles.use(P.streak).tint(C.violetHot, C.abyssCyan).spawn(_v.x, _v.y, _v.z, ca * s * 1.7, -rnd.range(1, 3), sa * s * 1.7, rnd.range(0.26, 0.42), 0.24, 0.07);
    }
    // 贴地流光：一道道梭形亮痕贴着水面 / 地面顺着气流往外窜
    flowAcc += dt * 10;
    while (flowAcc >= 1) {
      flowAcc -= 1;
      const a = ang + rnd.signed() * half * 0.7;
      const d0 = md + 1.0;
      const len = (radius - d0) * rnd.range(0.4, 0.62);
      const mid = d0 + len * 0.5 + rnd.next() * Math.max(0, radius - d0 - len);
      k.decals.add(DECAL.streak, ox + Math.cos(a) * mid, oz + Math.sin(a) * mid, len * 0.5, 0.34).rot(a, 0.1).params(0.6, 3.2).color(C.violetHot, 1.45, 0.8).under(C.violetDeep, 0.18);
    }
    // 渊蚀：被扫过的地面留下暗紫湿痕 + 细碎光点，1.5 秒淡出
    markAcc += dt * 16;
    while (markAcc >= 1) {
      markAcc -= 1;
      const a = ang + rnd.signed() * half * 0.8;
      const d = rnd.range(md + 1.2, radius * 0.95);
      k.decals.add(DECAL.scorch, ox + Math.cos(a) * d, oz + Math.sin(a) * d, rnd.range(0.9, 1.5), 1.5 + (dur - tt)).params(1).color(C.abyssCyan, 1.4).under(C.violetDeep, 0.8);
    }
  };
  if (id >= 0 && k.anchor(id)) {
    k.track(id, life, (_a, t, dt) => tick(t, dt), () => k.glow.release(cone));
  } else {
    // 没有单位(画廊合成事件)：按原地朝向播完
    k.glow.release(cone);
    return;
  }
  if (mouth(k, id, dx, dz, _w)) {
    hitBurst(k, _w.x, _w.y, _w.z, 1.8, C.violetHot, C.violet, dx, dz, 6, FX_RULES.flashSkill, 9);
    // 点光收小、压暗：强度 5 / 半径 9 会把整条龙照成亮紫白，鳞片与翼膜的明暗全被冲掉
    k.light(_w.x, _w.z, _w.y, C.violet, 2.2, 5.5, FX_RULES.lightDur);
  }
  k.shake(0.12, ox, oz);
  void env;
};

/** 被吐息喷中：紫色水雾爆开(由 fx 模块在 damage 事件里调用) */
export function drakeBreathHit(k: FxKit, sourceId: number, targetId: number): void {
  const map = BREATHING.get(k);
  const until = map?.get(sourceId);
  if (until === undefined || k.now > until) return;
  if (!k.anchor(targetId)) return;
  const x = k.a.x;
  const z = k.a.z;
  const y = k.a.y + k.a.height * 0.5;
  const r = k.rnd;
  const p = k.particles.use(P.puff);
  for (let i = 0; i < k.n(3); i++) p.spawn(x + r.signed() * 0.3, y + r.signed() * 0.3, z + r.signed() * 0.3, r.signed() * 1.6, r.range(0.4, 1.4), r.signed() * 1.6, r.range(0.45, 0.65), 0.7, 1.7);
  glints(k, x, y, z, 3, 2.5, C.violetHot, C.violet, 0.4, 0.26);
  // 模型整体染紫 0.3 秒(§5.5)：吐息每 tick 结算一次，连续被喷就连续续上
  k.anchors.flashTint?.(targetId, C.violet, 0.5, 0.3);
}

// ───────────────────────── 野怪倒地 ─────────────────────────

const monsterSlain: FxHandler = (k, e) => {
  const x = e.pos.x;
  const z = e.pos.y;
  const u = k.anchors.unit(e.unitId ?? -1);
  const type: MonsterType | null = u && u.kind === 'monster' ? u.monsterType : null;
  const rad = u ? u.radius : 0.9;
  const id = e.unitId ?? -1;
  const r = k.rnd;
  const h = k.anchor(id) ? k.a.height : 2;
  remember(k, type ?? 'mossback', x, h * 0.6, z);
  switch (type) {
    case 'frost_golem': {
      // 0~0.5 跪地、0.5~1.1 侧倒 → 1.0~1.8 鹿角由尖向根碎成冰屑 → 霜纹晶脱出
      dustPuff(k, x, 0.2, z, 4, rad, 1.6, C.frostHot, C.frostDeep, 0.9);
      k.after(1.0, () => {
        const pf = k.particles.use(P.frost);
        for (let i = 0; i < k.n(14); i++) pf.spawn(x + r.signed() * rad, r.range(0.6, 2.2), z + r.signed() * rad, r.signed() * 2.5, r.range(0.5, 2.5), r.signed() * 2.5, r.range(0.7, 1.1), 0.34, 0.12, r.range(0, 0.7));
        shards(k, x, 1.4, z, 10, 4, 4, C.frostHot, C.frost, 0.22);
      });
      k.after(1.6, () => {
        hitBurst(k, x, 1.2, z, 1.6, C.frostHot, C.frost, 0, 0, 4, FX_RULES.flashSkill, 3);
        k.decals.add(DECAL.sigil, x, z, rad + 0.8, 0.8).params(0, 0.6).color(C.frost, 1.3, 0.9).under(C.shadow, 0.2);
      });
      break;
    }
    case 'ember_golem': {
      // 人立长嚎、火口大喷发(0~0.5) → 熔核熄灭 → 前扑趴倒 → 背甲崩裂冒烟
      const pf = k.particles.use(P.flame);
      for (let i = 0; i < k.n(10); i++) pf.spawn(x + r.signed() * 0.4, r.range(2.2, 3), z + r.signed() * 0.4, r.signed() * 1.2, r.range(3, 6), r.signed() * 1.2, r.range(0.35, 0.6), 1.0, 0.5, r.range(0, 0.35));
      embers(k, x, 2.4, z, 16, 0.6, 3, C.emberHot, C.ember, 1.3, 0.18);
      k.after(1.3, () => {
        dustPuff(k, x, 0.3, z, 4, rad, 1.8, C.smoke, C.smokeDark, 1.3);
        embers(k, x, 0.8, z, 8, rad, 1.2, C.emberHot, C.ember, 1.2, 0.14);
        debris(k, x, z, 5, 2.5, 4, rad * 0.5, C.smokeDark, C.smoke, 0.24);
      });
      k.after(1.0, () => k.decals.add(DECAL.scorch, x, z, rad + 0.6, 2.4).color(C.ember, 1.3).under(C.shadow, 0.7));
      break;
    }
    case 'mossback': {
      // 侧翻蹬腿 → 蘑菇孢子飘散
      dustPuff(k, x, 0.2, z, 3, rad, 1.2, C.dust, C.dustDark, 0.8);
      k.after(0.6, () => {
        const p = k.particles.use(P.glint).tint(C.spore, C.poisonDeep);
        for (let i = 0; i < k.n(14); i++) p.spawn(x + r.signed() * 0.6, r.range(0.6, 1.2), z + r.signed() * 0.6, r.signed() * 0.8, r.range(0.4, 1.2), r.signed() * 0.8, r.range(1.0, 1.6), 0.26, 0.1, r.range(0, 0.4));
        const lp = k.particles.use(P.broadleaf);
        for (let i = 0; i < k.n(4); i++) lp.spawn(x, 0.9, z, r.signed() * 2, r.range(1.5, 3), r.signed() * 2, r.range(0.8, 1.1), 0.3, 0.26);
      });
      break;
    }
    case 'glimwing': {
      // 旋转飘落 → 翅膀平摊 → 眼斑熄灭 → 碎成鳞粉
      k.after(0.7, () => {
        const p = k.particles.use(P.scale).tint(C.moth, C.magicDeep);
        for (let i = 0; i < k.n(10); i++) p.spawn(x + r.signed() * 0.7, r.range(0.2, 0.6), z + r.signed() * 0.7, r.signed() * 0.8, r.range(0.6, 1.6), r.signed() * 0.8, r.range(0.8, 1.2), 0.2, 0.08);
        glints(k, x, 0.5, z, 6, 1.4, C.moth, C.magicDeep, 0.9, 0.22);
      });
      break;
    }
    case 'abyss_drake': {
      // 仰天长啸 → 渊珠碎裂闪光(0.6) → 侧倒(0.6~1.6) → 颈与头落下溅水花(1.6~2.0) → 鳞片化成上升的紫青光点(2.0~3.2)
      k.after(0.6, () => {
        const ok = k.anchors.attach?.(id, 'crest', _v);
        const cx = ok ? _v.x : x;
        const cy = ok ? _v.y : 4;
        const cz = ok ? _v.z : z;
        hitBurst(k, cx, cy, cz, 2.6, C.violetHot, C.violet, 0, 0, 10, FX_RULES.flashBig, 8);
        shards(k, cx, cy, cz, 10, 6, 5, C.violetHot, C.violet, 0.26);
        k.light(cx, cz, cy, C.violet, 6, 10, FX_RULES.lightDur);
      });
      k.after(1.7, () => {
        splashBurst(k, x + r.signed() * 1.5, z + r.signed() * 1.5, 2.2, 14);
        k.shake(0.2, x, z);
      });
      k.after(2.0, () => {
        const p = k.particles.use(P.scale).tint(C.violetHot, C.abyssCyan);
        for (let i = 0; i < k.n(26); i++) p.orbit(x + r.signed() * 2.5, r.range(0.3, 1.6), z + r.signed() * 2.5, r.range(0.1, 0.6), r.range(0.2, 0.8), r.next() * TAU, r.range(1, 3), r.range(1.5, 3), r.range(1, 1.4), 0.22, 0.08, r.range(0, 1.0));
        glints(k, x, 1.5, z, 10, 2.5, C.abyssCyan, C.violet, 1.2, 0.3);
      });
      break;
    }
    case 'star_colossus': {
      // 浑仪环崩断飞出(0~1.0) → 双拳坠水溅起水柱(1.0~1.6，震屏) → 星核升空爆成金色星雨(2.6~3.6)
      for (let i = 0; i < 3; i++) {
        k.after(i * 0.3, () => {
          const a = r.next() * TAU;
          k.glow.spawn(SHAPE.hoop, MODE.hoop, 0.9).at(x, 4.2, z).vel(Math.cos(a) * 6, 4, Math.sin(a) * 6, 9).scale(2.2, 1.6).rot(r.next(), r.next() * 3, r.next()).spin(3, 2, 4).color(C.gold, 1.4, 0.9).fade(0.02, 0.6).opt(0.4, 2, 1);
          sparks(k, x, 4.2, z, 6, 7, C.goldHot, C.gold);
        });
      }
      k.after(1.1, () => {
        splashBurst(k, x - 2, z + 1, 2.4, 16);
        splashBurst(k, x + 2, z - 1, 2.4, 16);
        k.shake(0.3, x, z);
      });
      k.after(2.6, () => {
        k.glow.spawn(SHAPE.sphere, MODE.core, 0.9).at(x, 3, z).vel(0, 6, 0).scale(0.6, 1.2).color(C.goldHot, 1.8, 1).fade(0.05, 0.5).opt(0.7, 1.4, 1);
        k.after(0.8, () => {
          hitBurst(k, x, 7.5, z, 3, C.goldHot, C.gold, 0, 0, 10, FX_RULES.flashBig, 10);
          const p = k.particles.use(P.star8);
          for (let i = 0; i < k.n(28); i++) {
            const a = r.next() * TAU;
            const d = Math.sqrt(r.next()) * 6;
            p.spawn(x + Math.cos(a) * d, r.range(6, 9), z + Math.sin(a) * d, r.signed() * 0.6, -r.range(2.5, 4.5), r.signed() * 0.6, r.range(1.4, 2), 0.36, 0.14, r.range(0, 0.6));
          }
        });
      });
      break;
    }
    default:
      dustPuff(k, x, 0.3, z, 5, rad, 1.3, C.dust, C.dustDark, 1.0);
      break;
  }
};

/** 水花：一圈贴水面的溅环 + 抛起的水珠 */
export function splashBurst(k: FxKit, x: number, z: number, size: number, drops: number): void {
  const r = k.rnd;
  k.particles.use(P.splash).spawn(x, 0.02, z, 0, 0, 0, 0.55, size * 0.4, size * 1.6);
  const p = k.particles.use(P.droplet);
  for (let i = 0; i < k.n(drops); i++) {
    const a = r.next() * TAU;
    const s = r.range(1, 3) * size * 0.6;
    p.spawn(x + Math.cos(a) * size * 0.25, 0.1, z + Math.sin(a) * size * 0.25, Math.cos(a) * s, r.range(3, 6) * Math.sqrt(size), Math.sin(a) * s, r.range(0.5, 0.8), 0.16, 0.1);
  }
}

// ───────────────────────── 野怪刷新 ─────────────────────────

/** 野怪刷新：按种类各有一段出场(与 C 包的出生动作同时开始) */
export function monsterSpawnFx(k: FxKit, x: number, z: number, type: MonsterType): void {
  const r = k.rnd;
  switch (type) {
    case 'frost_golem': {
      // 法阵起霜，一团冷雾里巨鹿解冻
      k.decals.add(DECAL.sigil, x, z, 3.2, 1.4).params(0, 0.3).color(C.frost, 1.4, 0.95).under(C.shadow, 0.25);
      const p = k.particles.use(P.puff).tint(C.frostHot, C.frost);
      for (let i = 0; i < k.n(10); i++) {
        const a = r.next() * TAU;
        p.spawn(x + Math.cos(a) * 1.2, 0.4, z + Math.sin(a) * 1.2, Math.cos(a) * 1.2, r.range(0.2, 0.8), Math.sin(a) * 1.2, r.range(1.0, 1.4), 1.2, 3, r.range(0, 0.3));
      }
      const pf = k.particles.use(P.frost);
      for (let i = 0; i < k.n(12); i++) pf.orbit(x, 0.2, z, 2.4, 0.8, r.next() * TAU, 2, r.range(0.8, 2.2), r.range(0.8, 1.2), 0.3, 0.1, r.range(0, 0.4));
      break;
    }
    case 'ember_golem': {
      // 余烬坑裂纹变亮，地面拱起碎石
      k.decals.add(DECAL.cracks, x, z, 3, 1.6).params(0, 0.6).color(C.ember, 1.5).under(C.shadow, 0.7);
      debris(k, x, z, 12, 3, 7, 1.2, C.smokeDark, C.smoke, 0.32);
      embers(k, x, 0.3, z, 12, 1.4, 2.4, C.emberHot, C.ember, 1.0, 0.16);
      dustPuff(k, x, 0.3, z, 5, 1.2, 1.8, C.dust, C.smoke, 1.0);
      break;
    }
    case 'mossback': {
      // 从地洞里钻出：洞口喷土
      debris(k, x, z, 8, 2.2, 4, 0.5, C.dust, C.dustDark, 0.24);
      dustPuff(k, x, 0.2, z, 4, 0.5, 1.4, C.dust, C.dustDark, 0.9);
      break;
    }
    case 'glimwing': {
      // 从崖壁灯花里飞出，沿螺旋线落到位：一串螺旋下落的光点
      const p = k.particles.use(P.glint).tint(C.amber, C.moth);
      for (let i = 0; i < k.n(16); i++) p.orbit(x, 3.5 - i * 0.15, z, 1.6 - i * 0.06, 0.2, i * 0.7, 3, -1.5, 0.9, 0.3, 0.08, i * 0.05);
      break;
    }
    case 'abyss_drake': {
      // 潭面起旋涡(1 秒) → 水柱炸开，龙首破水而出 → 展翼长啸(震屏 0.3)
      k.decals.add(DECAL.swirl, x, z, 5.5, 1.3).params(4, -2.5).color(C.abyssCyan, 1.3, 0.9).under(C.violetDeep, 0.6);
      k.after(1.0, () => {
        splashBurst(k, x, z, 3.2, 26);
        k.glow.spawn(SHAPE.pillar, MODE.pillar, 0.7).at(x, 0, z).scale3(1.6, 2, 1.6, 2.4, 7, 2.4).color(C.abyssCyan, 1.0, 0.6).fade(0.05, 0.4).opt(0.25, 1.2, 1);
        ring(k, x, z, 6, 0.6, C.abyssCyan, 1.4, 0.15, 0.3);
      });
      k.after(1.8, () => k.shake(0.3, x, z));
      break;
    }
    case 'star_colossus': {
      // 天上一点金光 → 陨星拖尾砸进潭心(预警圈 1 秒，纯演出) → 水柱与蒸汽炸开(震屏 0.4)
      k.decals.add(DECAL.telegraph, x, z, 4, 1.05).y(0.09).color(C.gold, 1.5, 0.9).under(C.violetDeep, 0.4).params(0.5);
      const sx = x + 6;
      const sz = z - 4;
      const ribbon = k.ribbons.start(R.fire, sx, 22, sz, C.goldHot, C.gold);
      const m: FxMesh = k.glow.hold(SHAPE.sphere, MODE.core);
      m.color(C.goldHot, 1.8, 1);
      m.add = 0.8;
      m.k = 1.3;
      m.scale(0.8);
      let tt = 0;
      const step = (): void => {
        tt += k.dt;
        const t = Math.min(1, tt / 1.0);
        const px = sx + (x - sx) * t;
        const py = 22 * (1 - t * t);
        const pz = sz + (z - sz) * t;
        m.at(px, py, pz);
        if (ribbon >= 0) k.ribbons.move(ribbon, px, py, pz);
        if (t < 1) k.after(0, step);
        else {
          k.glow.release(m);
          k.ribbons.end(ribbon);
          hitBurst(k, x, 1, z, 4, C.goldHot, C.gold, 0, 0, 14, FX_RULES.flashBig, 12);
          shockShell(k, x, 0.5, z, 1, 6, 0.5, C.gold, 1.4, 0.7);
          splashBurst(k, x, z, 3.6, 30);
          const st = k.particles.use(P.puff).tint(C.white, C.frost);
          for (let i = 0; i < k.n(10); i++) st.spawn(x + r.signed() * 2, 0.4, z + r.signed() * 2, r.signed() * 1.5, r.range(1.5, 3), r.signed() * 1.5, r.range(1.2, 1.8), 1.6, 3.6, r.range(0, 0.3));
          k.light(x, z, 3, C.gold, FX_RULES.lightMax, 14, FX_RULES.lightDur);
          k.shake(FX_RULES.shakeEpic, x, z);
        }
      };
      k.after(0, step);
      break;
    }
    default:
      dustRing(k, x, z, 6, 0.4, 2.5, C.dust, C.dustDark, 1.1, 0.9);
  }
}

// ───────────────────────── 史诗野怪被击杀：全队演出 ─────────────────────────

/** 一道光带从 (sx,sy,sz) 飞向单位 id，duration 秒到达后调 arrive */
function homingBand(k: FxKit, id: number, sx: number, sy: number, sz: number, duration: number, c: THREE.Color, c2: THREE.Color, arrive: () => void): void {
  const rib = k.ribbons.start(R.energy, sx, sy, sz, c, c2);
  if (rib >= 0) k.ribbons.setWidth(rib, 1.4);
  const side = k.rnd.signed() * 2.5;
  k.track(
    id,
    duration,
    (a, t) => {
      const s = t * t * (3 - 2 * t);
      const tx = a.x;
      const tz = a.z;
      const ty = a.y + a.height * 0.55;
      // 侧向弯一下的弧线，几道光带不重叠
      const nx = -(tz - sz);
      const nz = tx - sx;
      const nl = Math.hypot(nx, nz) || 1;
      const bend = Math.sin(t * Math.PI) * side;
      const px = sx + (tx - sx) * s + (nx / nl) * bend;
      const pz = sz + (tz - sz) * s + (nz / nl) * bend;
      const py = sy + (ty - sy) * s + Math.sin(t * Math.PI) * 3;
      if (rib >= 0) k.ribbons.move(rib, px, py, pz);
      if (k.rnd.next() < 0.5) k.particles.use(P.glint).tint(c, c2).spawn(px, py, pz, 0, 0.3, 0, 0.35, 0.28, 0.06);
    },
    () => {
      k.ribbons.end(rib);
      arrive();
    },
  );
}

/** 史诗野怪被击杀：河道巨龙 = 紫青光带飞向击杀方每位英雄 + 龙鳞纹环；星陨巨灵 = 金色星雨 + 八芒星印 */
export function epicSlainFx(k: FxKit, x: number, z: number, team: TeamId, type: MonsterType, state: GameState): void {
  const th = teamTheme(team);
  if (type === 'abyss_drake') {
    // 龙尸处升起一束紫青光(细)，光带分头飞向击杀方每位英雄(0.8 秒)，到达时脚下炸开龙鳞纹环(1.2 秒) + 上升的金币与经验光点
    pillar(k, x, z, 0.5, 7, 0.9, C.violet, 1.3, 0.6);
    ring(k, x, z, 6, 0.8, C.abyssCyan, 1.4, 0.1, 0.25);
    k.light(x, z, 3, C.violet, 6, 12, FX_RULES.lightDur);
    let i = 0;
    for (const h of state.heroes) {
      if (h.team !== team || !h.alive) continue;
      if (k.focusDist(h.pos.x, h.pos.y) > 46) continue;
      const id = h.id;
      k.after(0.15 + i * 0.08, () =>
        homingBand(k, id, x, 3, z, 0.8, C.violetHot, C.abyssCyan, () => {
          if (!k.anchor(id)) return;
          const rad = k.a.radius;
          k.decals.add(DECAL.sigil, k.a.x, k.a.z, rad * 2.1 + 0.5, 1.2).params(3, 0.3).color(C.violet, 1.6, 1).under(C.violetDeep, 0.35).follow(id);
          hitBurst(k, k.a.x, k.a.y + k.a.height * 0.5, k.a.z, 1.6, C.violetHot, C.violet, 0, 0, 4, FX_RULES.flashSkill, 4);
          // 奖励到手：模型描边转金 1.5 秒(§5.7)
          k.anchors.flashRim?.(id, 1.5);
          const p = k.particles.use(P.coin);
          const pg = k.particles.use(P.glint).tint(C.goldHot, C.abyssCyan);
          for (let j = 0; j < k.n(8); j++) {
            const a = k.rnd.next() * TAU;
            const d = rad + k.rnd.range(0.1, 0.6);
            (j % 2 === 0 ? p : pg).orbit(k.a.x, k.a.y + 0.2, k.a.z, d, d * 0.6, a, 2.5, k.rnd.range(1.5, 2.6), k.rnd.range(0.8, 1.1), 0.26, 0.14, j * 0.06);
          }
        }),
      );
      i++;
    }
    return;
  }
  // 星陨巨灵：每位英雄头顶落下金色星雨，脚下八芒星印展开(常驻的星轨环由 status.ts 画)
  pillar(k, x, z, 0.7, 9, 1.0, C.gold, 1.3, 0.6);
  ring(k, x, z, 9, 0.9, th.glow, 1.4, 0.08, 0.25);
  k.light(x, z, 4, C.gold, FX_RULES.lightMax, 16, FX_RULES.lightDur);
  for (const h of state.heroes) {
    if (h.team !== team || !h.alive) continue;
    if (k.focusDist(h.pos.x, h.pos.y) > 46) continue;
    const id = h.id;
    k.after(0.3 + k.rnd.next() * 0.3, () => {
      if (!k.anchor(id)) return;
      const ax = k.a.x;
      const az = k.a.z;
      const rad = k.a.radius;
      k.decals.add(DECAL.star, ax, az, rad * 2.1 + 0.6, 1.2).params(8, 2.2).color(C.gold, 1.5, 0.95).under(C.shadow, 0.25).follow(id);
      k.decals.add(DECAL.sigil, ax, az, rad * 2.1 + 0.4, 1.0).params(2, 0.4).color(C.gold, 1.5, 1).under(C.shadow, 0.3).follow(id);
      const p = k.particles.use(P.star8);
      for (let j = 0; j < k.n(10); j++) p.spawn(ax + k.rnd.signed() * 1.2, k.rnd.range(4, 6), az + k.rnd.signed() * 1.2, 0, -k.rnd.range(3.5, 5), 0, k.rnd.range(0.7, 1.0), 0.32, 0.16, j * 0.05);
    });
  }
}

export const MONSTER_FX = {
  monster_slain: monsterSlain,
  drake_breath_warn: drakeBreathWarn,
  drake_breath: drakeBreath,
} satisfies Record<string, FxHandler>;
