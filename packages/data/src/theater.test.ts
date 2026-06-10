import { describe, expect, it } from 'vitest';
import { IniFile } from './ini';
import { TheaterTileTable, theaterByName } from './theater';

const THEATER_INI = `
[General]
[TileSet0000]
SetName=Clear
FileName=clear
TilesInSet=1
[TileSet0001]
SetName=Water
FileName=water
TilesInSet=14
[TileSet0002]
SetName=Cliffs
FileName=cliff
TilesInSet=39
`;

describe('TheaterTileTable', () => {
  const table = new TheaterTileTable(new IniFile(THEATER_INI), '.tem');

  it('全局序号跨集解析', () => {
    expect(table.totalTiles).toBe(54);
    expect(table.resolve(0)!.fileName).toBe('clear01.tem');
    expect(table.resolve(1)!.fileName).toBe('water01.tem');
    expect(table.resolve(14)!.fileName).toBe('water14.tem');
    expect(table.resolve(15)!.fileName).toBe('cliff01.tem');
    expect(table.resolve(53)!.fileName).toBe('cliff39.tem');
  });

  it('越界返回 undefined', () => {
    expect(table.resolve(54)).toBeUndefined();
    expect(table.resolve(-1)).toBeUndefined();
  });

  it('战区注册表', () => {
    expect(theaterByName('temperate')!.palette).toBe('isotem.pal');
    expect(theaterByName('SNOW')!.extension).toBe('.sno');
    expect(theaterByName('LUNAR')).toBeUndefined(); // 尤里战区，原版没有
  });
});
