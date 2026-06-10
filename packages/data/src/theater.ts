/**
 * 战区（Theater）：决定地图用哪套地形 TMP、调色板与文件扩展名。
 * 战区 ini（temperat.ini 等）内 [TileSetXXXX] 节定义地块集；
 * 地图 tileIndex 是跨所有地块集的全局序号。
 */
import type { IniFile } from './ini';

export interface TheaterInfo {
  /** [Map]Theater= 的取值。 */
  name: string;
  ini: string;
  palette: string;
  extension: string;
  /** 地形 TMP 所在的 mix（按优先级）。 */
  mixes: string[];
}

/** 红警2原版三大战区。 */
export const THEATERS: TheaterInfo[] = [
  {
    name: 'TEMPERATE',
    ini: 'temperat.ini',
    palette: 'isotem.pal',
    extension: '.tem',
    mixes: ['isotemp.mix', 'temperat.mix'],
  },
  {
    name: 'SNOW',
    ini: 'snow.ini',
    palette: 'isosno.pal',
    extension: '.sno',
    mixes: ['isosnow.mix', 'snow.mix'],
  },
  {
    name: 'URBAN',
    ini: 'urban.ini',
    palette: 'isourb.pal',
    extension: '.urb',
    mixes: ['isourb.mix', 'urban.mix'],
  },
];

export function theaterByName(name: string): TheaterInfo | undefined {
  return THEATERS.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
}

export interface TileSetEntry {
  setIndex: number;
  setName: string;
  fileName: string;
  tilesInSet: number;
  /** 此集第一个地块的全局 tileIndex。 */
  startIndex: number;
}

export interface ResolvedTile {
  set: TileSetEntry;
  /** 集内序号（0 起）。 */
  indexInSet: number;
  /** 实际文件名，如 clear01.tem。 */
  fileName: string;
}

/** 战区地块集表：全局 tileIndex → TMP 文件名。 */
export class TheaterTileTable {
  readonly sets: TileSetEntry[] = [];
  readonly totalTiles: number;

  constructor(theaterIni: IniFile, readonly extension: string) {
    let start = 0;
    for (let i = 0; ; i++) {
      const section = theaterIni.getSection(`TileSet${String(i).padStart(4, '0')}`);
      if (!section) break;
      const entry: TileSetEntry = {
        setIndex: i,
        setName: section.getString('SetName'),
        fileName: section.getString('FileName'),
        tilesInSet: section.getNumber('TilesInSet', 0),
        startIndex: start,
      };
      this.sets.push(entry);
      start += entry.tilesInSet;
    }
    this.totalTiles = start;
  }

  resolve(tileIndex: number): ResolvedTile | undefined {
    if (tileIndex < 0 || tileIndex >= this.totalTiles) return undefined;
    // 集合数量 ~几百，线性扫足够快；热路径在渲染端有缓存
    for (const set of this.sets) {
      if (tileIndex < set.startIndex + set.tilesInSet) {
        const indexInSet = tileIndex - set.startIndex;
        return {
          set,
          indexInSet,
          fileName: `${set.fileName}${String(indexInSet + 1).padStart(2, '0')}${this.extension}`,
        };
      }
    }
    return undefined;
  }
}
