import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './camera';

/** 屏幕 NDC 点 → 地面(y = 0)坐标 */
function ground(rig: CameraRig, nx: number, ny: number): THREE.Vector3 {
  const cam = rig.camera;
  const o = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const d = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(o).normalize();
  return o.addScaledVector(d, -o.y / d.y);
}

/** 让镜头缓动到位 */
function settle(rig: CameraRig, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) rig.update(1 / 60);
}

function makeRig(aspect = 16 / 9): CameraRig {
  const rig = new CameraRig();
  rig.setAspect(aspect);
  rig.setFollow(0, 0);
  rig.update(0);
  return rig;
}

describe('相机装置：鼠标瞄准落点型技能的下探', () => {
  it('不下探时，指针在状态栏上沿(屏高 89%)只够得到英雄以南 8 米左右', () => {
    const rig = makeRig();
    expect(ground(rig, 0, -0.778).z).toBeGreaterThan(7.2);
    expect(ground(rig, 0, -0.778).z).toBeLessThan(8.4);
  });

  it('指针放在屏幕下方时镜头向南让，11.5 米的射程在状态栏上沿之内够得到', () => {
    const rig = makeRig();
    rig.setPointerReach(-0.778, 11.5);
    settle(rig);
    expect(ground(rig, 0, -0.778).z).toBeGreaterThanOrEqual(11.5);
    // 英雄自己没有被推出画面上半部(NDC 0.4 以下)
    const hero = new THREE.Vector3(0, 0, 0).project(rig.camera);
    expect(hero.y).toBeLessThanOrEqual(0.41);
  });

  it('偏移只由指针的屏幕纵坐标与射程决定：同一个输入反复给，镜头停在同一处(没有回路)', () => {
    const rig = makeRig();
    rig.setPointerReach(-0.5, 11.5);
    settle(rig);
    const z1 = ground(rig, 0, 0).z;
    for (let i = 0; i < 120; i++) {
      rig.setPointerReach(-0.5, 11.5);
      rig.update(1 / 60);
    }
    expect(ground(rig, 0, 0).z).toBeCloseTo(z1, 3);
  });

  it('指针在屏幕上半部不偏移；结束瞄准后回到原位', () => {
    const rig = makeRig();
    const z0 = ground(rig, 0, 0).z;
    rig.setPointerReach(0.5, 11.5);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeCloseTo(z0, 3);
    rig.setPointerReach(-0.9, 11.5);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeGreaterThan(z0 + 2);
    rig.setPointerReach(null);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeCloseTo(z0, 2);
  });

  it('射程本来就看得到的技能不偏移', () => {
    const rig = makeRig();
    const z0 = ground(rig, 0, 0).z;
    rig.setPointerReach(-0.9, 6);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeCloseTo(z0, 3);
  });
});

describe('相机装置：触控瞄准前探的安全框', () => {
  it('横屏朝正南拖满 11 米：英雄不被推到屏高 30% 以上', () => {
    const rig = makeRig(844 / 390);
    rig.setReach(0, 13.5);
    settle(rig);
    const hero = new THREE.Vector3(0, 0, 0).project(rig.camera);
    expect(hero.y).toBeLessThanOrEqual(0.41);
    // 落点(11 米处)仍在屏幕内
    const land = new THREE.Vector3(0, 0, 11).project(rig.camera);
    expect(land.y).toBeGreaterThan(-1);
  });

  it('竖屏朝正南拖：落点不低于屏高 67% 处(下半屏是摇杆与技能键)', () => {
    const rig = makeRig(390 / 844);
    rig.setReach(0, 6);
    settle(rig);
    const land = new THREE.Vector3(0, 0, 6).project(rig.camera);
    expect(land.y).toBeGreaterThanOrEqual(-0.36);
  });
});

describe('相机装置：高个子取景', () => {
  it('打开后注视点北移、镜头拉远；关闭后复位', () => {
    const rig = makeRig();
    const z0 = ground(rig, 0, 0).z;
    const h0 = rig.camera.position.y;
    rig.setTallFocus(1.5);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeLessThan(z0 - 3);
    expect(rig.camera.position.y).toBeGreaterThan(h0 * 1.1);
    rig.setTallFocus(0);
    settle(rig);
    expect(ground(rig, 0, 0).z).toBeCloseTo(z0, 2);
    expect(rig.camera.position.y).toBeCloseTo(h0, 2);
  });
});
