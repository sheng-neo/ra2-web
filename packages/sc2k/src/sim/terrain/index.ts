// ===== sim/terrain/index.ts =====（CONTRACTS §V SimEntries.createTerrainSystem；WP2 真实现）
// 地形系统：queries.terrain、命令 terrainTool、新城生成（terrain 流）、.SC2 导入 / 导出、任一读档后重建角点场缓存、
// 对其他系统直接写地形的格（act.setTerrain）收编角点并修正邻居浅水形状。无 priv（全部状态都在真源层 + terrain 元数据）。
import type { SimEntries } from '../../contracts/entrypoints';
import { createCityState } from '../../contracts/state';
import type { CityState } from '../../contracts/state';
import { getTuning } from '../../contracts/system';
import type { System } from '../../contracts/system';
import { ChangeSet } from './changes';
import { handleTerrainTool } from './commands';
import type { TerrainRuntime } from './commands';
import { TerrainField, reshapeAround } from './field';
import { generateTerrain } from './generate';
import { makeTerrainQuery } from './queries';
import { exportTerrain, importTerrain } from './save';
import { DEFAULT_TERRAIN_TUNING } from './tuning';

export { DEFAULT_TERRAIN_TUNING } from './tuning';
export type { TerrainTuning } from './tuning';
export * from './slope';
export { TerrainField, applyGeometry, surfaceShape } from './field';
export { generateTerrain, relaxCorners, removeSaddles, seaLevelFor, hillsRangeFor, lakeFractionFor, streamCountFor, describeTerrain } from './generate';
export { carveStream, refloodAll, recomputeSalt, placeWater, waterPlaceCheck } from './water';
export { makeTerrainQuery } from './queries';
export { importTerrain, exportTerrain } from './save';
export { handleTerrainTool } from './commands';

export const createTerrainSystem = ((): System => {
  const field = new TerrainField();
  const rt: TerrainRuntime = { field, changes: new ChangeSet() };
  let bound: CityState | null = null;
  let fallback: CityState | null = null;
  const getState = (): CityState => bound ?? (fallback ??= createCityState());
  const terrainQuery = makeTerrainQuery(getState);
  return {
    id: 'terrain',
    queries: { terrain: terrainQuery },
    commands: { terrainTool: (ctx, cmd) => handleTerrainTool(ctx, cmd, rt) },
    /** 新城：用 terrainSeed 与地形参数生成并直接写层；core 随后 recountFromLayers + markBulk('all')。 */
    init(ctx, p) {
      bound = ctx.state;
      generateTerrain(ctx, field, p.terrainSeed, p.terrain, getTuning(ctx, 'terrain', DEFAULT_TERRAIN_TUNING));
      ctx.act.layerChanged('all');
    },
    importFrom(ctx, doc, diag) { bound = ctx.state; importTerrain(ctx, doc, diag, field, getTuning(ctx, 'terrain', DEFAULT_TERRAIN_TUNING)); },
    exportTo(ctx, doc) { exportTerrain(ctx, doc); },
    /** 任一读档路径：重建角点场（不消费 PRNG、不改真源层）。 */
    postLoad(ctx, source) {
      bound = ctx.state;
      field.rebuild(ctx.state.layers);
      if (source === 'sc2' && field.inconsistent > 0) ctx.diag.push({ level: 'info', code: 'terrain.cornerMismatch', message: `${field.inconsistent} 个地块的角点与邻居不一致` });
    },
    /**
     * 其他系统经 act.setTerrain 改了地形（桥头 / 隧道口 / 推平池塘）：几何变了就以该格为准收编角点，并修正 8 邻的浅水形状。
     * 本系统自己的写入经 field.write 打了自写标记，在此消费并跳过（避免扇出回环）。
     */
    onTilesChanged(ctx, tiles, kind) {
      if (kind !== 'terrain') return;
      const L = ctx.state.layers;
      const foreign: number[] = [];
      for (const i of tiles) {
        if (field.selfWritten[i] !== 0) { field.selfWritten[i] = 0; continue; }
        if (!field.tileMatches(L, i)) field.adoptTile(L, i);
        foreign.push(i);
      }
      if (foreign.length === 0) return;
      const out: number[] = [];
      reshapeAround(ctx, field, foreign, out, rt.changes.mark);
      for (const j of out) rt.changes.mark[j] = 0;
    },
  };
}) satisfies SimEntries['createTerrainSystem'];
