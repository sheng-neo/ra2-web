import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { simMetresToThree } from '../../coords';
import { reliefGrid, reliefHeight } from '../../data/terrain';
import { lanePose } from './lanes';
import { tramDirection, tramS, tramTracks } from './trams';

describe('tramDirection（靠左行驶：对向轨道在右手边）', () => {
  // 向东的轨道；对向轨道在北（左）→ 逆 pts（向西）行驶，北面轨道才在右边
  it('对向轨道在左 → 逆 pts', () => {
    expect(tramDirection([0, 0, 1000, 0, 2000, 0], [0, 30, 2000, 30])).toBe(-1);
  });
  it('对向轨道在右 → 沿 pts', () => {
    expect(tramDirection([0, 0, 1000, 0, 2000, 0], [0, -30, 2000, -30])).toBe(1);
  });
});

describe('真实数据上的电车', () => {
  const read = (n: string) => readFileSync(new URL(`../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const ground = reliefHeight(reliefGrid(decodeTerrain(read('terrain.bin'))));
  const tracks = tramTracks(city.rails, ground);

  it('两条主线、每方向约 130 m 一辆', () => {
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      expect(t.path.len / t.count).toBeGreaterThan(110);
      expect(t.path.len / t.count).toBeLessThan(150);
    }
  });

  it('两条轨道方向相反（一东一西）', () => {
    const p = { x: 0, y: 0, z: 0, hx: 0, hz: 0 };
    lanePose(tracks[0]!.path, tracks[0]!.path.len / 2, p);
    const a = p.hx;
    lanePose(tracks[1]!.path, tracks[1]!.path.len / 2, p);
    expect(Math.sign(a)).toBe(-Math.sign(p.hx));
  });

  it('街景机位（德辅道中）开场 10 s 内前方 60–250 m 有电车', () => {
    const eye = simMetresToThree(160, 103, 5);
    const target = simMetresToThree(300, -88, 25.9);
    const fx = target[0] - eye[0];
    const fz = target[2] - eye[2];
    const fl = Math.hypot(fx, fz);
    const p = { x: 0, y: 0, z: 0, hx: 0, hz: 0 };
    for (let t = 0; t <= 10; t += 0.5) {
      let seen = false;
      for (const tr of tracks) {
        for (let k = 0; k < tr.count; k++) {
          lanePose(tr.path, tramS(tr, k, t), p);
          const dx = p.x - eye[0];
          const dz = p.z - eye[2];
          const d = Math.hypot(dx, dz);
          const cos = (dx * fx + dz * fz) / (d * fl);
          if (d >= 60 && d <= 250 && cos > Math.cos((25 * Math.PI) / 180)) seen = true;
        }
      }
      expect(seen, `t = ${t}`).toBe(true);
    }
  });
});
