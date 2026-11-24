import { describe, expect, it } from 'vitest';
import { LIGHT_HEX } from '../materials/lighting';
import { islandShoreY, kowloonShoreY } from '../water/mask';
import { MEGA_TOWER, buildMassing, type MassingInput } from './massing';

const bbox: [number, number, number, number] = [-811, -983, 1663, 900];
const input: MassingInput = {
  ground: () => 4,
  isWater: (x, y) => (x < bbox[0] || x > bbox[2] ? y > islandShoreY(x) : y > 600) && y < kowloonShoreY(x),
  bbox,
};

describe('远景城区体块', () => {
  const m = buildMassing(input);

  it('确定性', () => {
    const n = buildMassing(input);
    expect(n.boxes.length).toBe(m.boxes.length);
    expect(n.boxes[17]).toEqual(m.boxes[17]);
    expect(n.glows.length).toBe(m.glows.length);
  });

  it('九龙的楼都在对岸岸线以北；港岛两翼的楼不进数据范围、不进水', () => {
    expect(m.boxes.length).toBeGreaterThan(500);
    for (const b of m.boxes) {
      const onKowloon = b.y > kowloonShoreY(b.x) - 1;
      if (onKowloon) {
        expect(b.y).toBeGreaterThan(kowloonShoreY(b.x) + 20);
      } else {
        const inside = b.x > bbox[0] && b.x < bbox[2] && b.y > bbox[1] && b.y < bbox[3];
        expect(inside).toBe(false);
        expect(input.isWater(b.x, b.y)).toBe(false);
      }
      expect(b.height).toBeGreaterThan(5);
      if (b.height < 400) expect(b.w).toBeLessThanOrEqual(48); // 480 m 超高层除外
    }
  });

  it('只有一栋约 480 m 的通用超高层，其余都矮得多', () => {
    const tall = m.boxes.filter((b) => b.base + b.height > 400);
    expect(tall.length).toBe(1);
    expect(Math.hypot(tall[0]!.x - MEGA_TOWER.x, tall[0]!.y - MEGA_TOWER.y)).toBeLessThan(1);
    expect(tall[0]!.base + tall[0]!.height).toBeGreaterThan(470);
  });

  it('灯点：颜色都是契约光源色，航空障碍灯只占少数且没有灯光秀式的彩色闪烁', () => {
    for (const g of m.glows) {
      expect(g.colour in LIGHT_HEX).toBe(true);
      expect(Number.isFinite(g.x + g.y + g.z)).toBe(true);
      if (g.blinkHz) expect(g.colour).toBe('aviation');
    }
    const aviation = m.glows.filter((g) => g.colour === 'aviation').length;
    expect(aviation).toBeLessThan(m.glows.length * 0.05);
    // 海旁步道灯：一排白光与暖光相间、高度 7–10 m、亮度不一（不是等距等亮的跑道灯）
    const prom = m.glows.filter((g) => (g.colour === 'ledWhite' || g.colour === 'sodium') && g.z >= 7 && g.z <= 10);
    expect(prom.length).toBeGreaterThan(150);
    expect(new Set(prom.map((g) => g.intensity.toFixed(2))).size).toBeGreaterThan(50);
  });
});
