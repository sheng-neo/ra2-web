import { describe, expect, it } from 'vitest';
import { LEPTONS_PER_CELL, cellToLepton, leptonToCell } from './coords';

describe('lepton 坐标', () => {
  it('格中心往返转换', () => {
    expect(cellToLepton(0)).toBe(128);
    expect(cellToLepton(3)).toBe(3 * LEPTONS_PER_CELL + 128);
    expect(leptonToCell(cellToLepton(7))).toBe(7);
  });

  it('格边界归属', () => {
    expect(leptonToCell(255)).toBe(0);
    expect(leptonToCell(256)).toBe(1);
    expect(leptonToCell(-1)).toBe(-1);
  });
});
