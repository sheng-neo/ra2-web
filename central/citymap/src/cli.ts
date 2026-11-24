/**
 * pnpm citymap [--check] [--debug[=DIR]] [--buildings=landsd|overture] [--out=DIR]
 *   默认：构建并写入 central/client/public/city/（central.json、terrain.bin、署名文件）。
 *   --check：只在内存里构建，与已写入的文件逐字节比较，不一致则退出码 1（给 CI 用，离线）。
 *   --debug：额外把俯视 SVG 写到 DIR（默认系统临时目录下的 central-citymap/）。
 *   --buildings：建筑图层来源，默认 landsd（地政总署）；overture 整层换回 Overture（对比用，
 *     不是仓库里提交的产物，一般配合 --out 写到别处）。
 *   --out：产物目录，默认 central/client/public/city/。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCity, type BuildingsFrom } from './build';
import { OUT_DIR } from './config';
import { cityToSvg } from './debug-svg';
import { CITY_FILE, packOutputs, TERRAIN_FILE } from './stages/pack';

function readOrEmpty(file: string): Uint8Array {
  try {
    return readFileSync(file);
  } catch {
    return new Uint8Array();
  }
}

function option(argv: readonly string[], name: string): string | undefined {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a?.slice(name.length + 3);
}

async function main(argv: readonly string[]): Promise<number> {
  const check = argv.includes('--check');
  const debugArg = argv.find((a) => a === '--debug' || a.startsWith('--debug='));
  const buildings = option(argv, 'buildings') ?? 'landsd';
  if (buildings !== 'landsd' && buildings !== 'overture') throw new Error(`--buildings 只能是 landsd 或 overture`);
  const outDir = path.resolve(option(argv, 'out') ?? OUT_DIR);
  const t0 = performance.now();
  const { city, terrain } = await buildCity({ buildings: buildings satisfies BuildingsFrom });
  const files = packOutputs(city, terrain.grid);

  if (debugArg) {
    const dir = debugArg.includes('=') ? debugArg.slice('--debug='.length) : path.join(os.tmpdir(), 'central-citymap');
    mkdirSync(dir, { recursive: true });
    const svg = path.join(dir, 'city.svg');
    writeFileSync(svg, cityToSvg(city));
    console.log(`debug: ${svg}`);
  }

  if (check) {
    const stale = [...files].filter(([name, bytes]) => !Buffer.from(bytes).equals(readOrEmpty(path.join(outDir, name))));
    for (const [name] of stale) console.error(`过期：${path.join(outDir, name)}（运行 pnpm citymap 重新生成）`);
    console.log(`check ${stale.length === 0 ? 'ok' : 'FAILED'} in ${Math.round(performance.now() - t0)} ms`);
    return stale.length === 0 ? 0 : 1;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(path.join(outDir, name), bytes);
  const r = terrain.report;
  console.log(
    `wrote ${outDir}: buildings ${city.buildings.length} (${buildings}), roads ${city.roads.length}, ` +
      `rails ${city.rails.length}, water ${city.water.length}, sensitive ${city.zones.sensitive.length}, ` +
      `landmarks ${city.landmarks.length}; ${CITY_FILE} ${files.get(CITY_FILE)!.byteLength} B, ` +
      `${TERRAIN_FILE} ${r.nx}×${r.ny} @ ${r.cell / 10} m ${files.get(TERRAIN_FILE)!.byteLength} B; ` +
      `${Math.round(performance.now() - t0)} ms`,
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
