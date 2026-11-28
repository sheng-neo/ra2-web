/**
 * R5 真实地标：二进制格式（合成数据）与仓库里的真实产物（public/city/central.json + public/city/landmarks/）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { simMetresToThree } from '../../coords';
import { atlasGpuBytes, CLMK_HEADER, CLTX_BC3, CLTX_ETC2, chooseAtlas, desktopAtlasRes, FULL_ATLAS_MAX_RT_BYTES, isWebp, parseMesh, parseTexture, rgbaBytes } from './format';
import { LANDMARK_REAL_NAMES } from '../../../../citymap/src/redlines';
import { makeFixtureCity } from '../../dev/fixture';
import { FEATURE, LINE_COLOURS } from './material';

/** 合成一个 CLMK v1：nv 个顶点、三角形 (0,1,2)…，位置 = 顶点号。 */
function mesh(nv: number, idx: number[], big = false): ArrayBuffer {
  const ib = idx.length * (big ? 4 : 2);
  const buf = new ArrayBuffer(CLMK_HEADER + nv * 36 + ib + ((4 - (ib % 4)) % 4));
  const u8 = new Uint8Array(buf);
  u8.set([0x43, 0x4c, 0x4d, 0x4b]);
  const dv = new DataView(buf);
  dv.setUint16(4, 1, true);
  dv.setUint16(6, big ? 1 : 0, true);
  dv.setUint32(8, nv, true);
  dv.setUint32(12, idx.length, true);
  for (let k = 0; k < 3; k++) {
    dv.setFloat32(16 + 4 * k, -10 * (k + 1), true);
    dv.setFloat32(28 + 4 * k, 100, true);
  }
  const pos = new Uint16Array(buf, CLMK_HEADER, nv * 4);
  for (let i = 0; i < nv; i++) pos[i * 4] = i * 1000;
  const grid = new Uint8Array(buf, CLMK_HEADER + nv * 32, nv * 4);
  for (let i = 0; i < nv; i++) grid[i * 4 + 1] = FEATURE.led;
  const at = CLMK_HEADER + nv * 36;
  (big ? new Uint32Array(buf, at, idx.length) : new Uint16Array(buf, at, idx.length)).set(idx);
  return buf;
}

function texture(format: number, w: number, h: number, levels: number, lenFix = 0): ArrayBuffer {
  const lens: number[] = [];
  for (let k = 0, ww = w, hh = h; k < levels; k++, ww = Math.max(1, ww >> 1), hh = Math.max(1, hh >> 1)) {
    lens.push(Math.ceil(ww / 4) * Math.ceil(hh / 4) * 16);
  }
  lens[0]! += lenFix;
  const buf = new ArrayBuffer(20 + 4 * levels + lens.reduce((a, b) => a + b, 0));
  new Uint8Array(buf).set([0x43, 0x4c, 0x54, 0x58]);
  const dv = new DataView(buf);
  dv.setUint16(4, 1, true);
  dv.setUint16(6, format, true);
  dv.setUint32(8, w, true);
  dv.setUint32(12, h, true);
  dv.setUint32(16, levels, true);
  lens.forEach((l, k) => dv.setUint32(20 + 4 * k, l, true));
  return buf;
}

describe('CLMK / CLTX 解析', () => {
  it('网格：头、各属性数组与索引按格式取出；16 / 32 位索引都认', () => {
    const d = parseMesh(mesh(3, [0, 1, 2]));
    expect(d.vertexCount).toBe(3);
    expect(d.indexCount).toBe(3);
    expect(d.offset).toEqual([-10, -20, -30]);
    expect(d.span).toEqual([100, 100, 100]);
    expect([...d.pos.filter((_, i) => i % 4 === 0)]).toEqual([0, 1000, 2000]);
    expect(d.grid[1]).toBe(FEATURE.led);
    expect(d.index).toBeInstanceOf(Uint16Array);
    expect(parseMesh(mesh(3, [0, 1, 2], true)).index).toBeInstanceOf(Uint32Array);
  });

  it('网格：魔数、长度、越界索引都拒收（坏文件、SPA 回退页）', () => {
    expect(() => parseMesh(new TextEncoder().encode('<!doctype html><p>SPA fallback</p>'.padEnd(64)).buffer)).toThrow(/魔数/);
    expect(() => parseMesh(mesh(3, [0, 1, 2]).slice(0, 60))).toThrow(/长度/);
    expect(() => parseMesh(mesh(3, [0, 1, 7]))).toThrow(/越界/);
  });

  it('压缩贴图：逐级长度按 4×4 块核对；格式只认 BC3 / ETC2', () => {
    const t = parseTexture(texture(CLTX_BC3, 64, 32, 5));
    expect(t.levels.map((l) => [l.width, l.height])).toEqual([[64, 32], [32, 16], [16, 8], [8, 4], [4, 2]]);
    expect(t.bytes).toBe(t.levels.reduce((a, l) => a + l.data.byteLength, 0));
    expect(parseTexture(texture(CLTX_ETC2, 16, 16, 3)).format).toBe(CLTX_ETC2);
    expect(() => parseTexture(texture(CLTX_BC3, 64, 32, 5, 16))).toThrow(/长度/);
    expect(() => parseTexture(texture(9, 16, 16, 1))).toThrow(/格式/);
  });

  it('图集选择：桌面 BC3 全分辨率（desktop = full 时）、手机 ETC2 半分辨率、LOW 四分之一分辨率，都不支持时 WebP', () => {
    const all = { s3tc: true, etc: true };
    expect(chooseAtlas('high', false, all, null, 'full')).toBe('bc3');
    expect(chooseAtlas('high', true, all)).toBe('etc2Half');
    expect(chooseAtlas('low', false, all)).toBe('bc3Quarter');
    expect(chooseAtlas('low', true, { s3tc: false, etc: true })).toBe('etc2Quarter');
    expect(chooseAtlas('low', true, { s3tc: false, etc: false })).toBe('webpQuarter');
    expect(chooseAtlas('high', false, { s3tc: false, etc: false }, null, 'full')).toBe('webpHalf');
    expect(chooseAtlas('high', true, { s3tc: false, etc: false })).toBe('webpQuarter');
    expect(chooseAtlas('high', false, all, 'webpHalf')).toBe('webpHalf');
    expect(chooseAtlas('high', false, { s3tc: false, etc: false }, 'bc3')).toBe('webpQuarter');
    expect(chooseAtlas('high', false, { s3tc: false, etc: true }, 'bc3Quarter')).toBe('webpQuarter');
    expect(chooseAtlas('high', false, { s3tc: true, etc: false }, 'etc2Quarter')).toBe('webpQuarter');
    expect(chooseAtlas('high', false, all, 'etc2Quarter')).toBe('etc2Quarter');
    expect(rgbaBytes(1024, 1024)).toBe(5592405);
    // LOW 的四分之一分辨率压缩图集：512² 起整条 mip 约 0.33 MiB（R4 + R5 整合时是 1024² 文件上传时丢掉最大一级）
    expect(atlasGpuBytes('bc3Quarter', 2048)).toBe(atlasGpuBytes('etc2Quarter', 2048));
    expect(atlasGpuBytes('bc3Quarter', 2048)).toBeLessThan(0.34 * 1024 * 1024);
    expect(atlasGpuBytes('bc3Half', 2048) - atlasGpuBytes('bc3Quarter', 2048)).toBeGreaterThan(1_000_000);
  });

  it('桌面 HIGH 图集分辨率按起始渲染目标的显存定：≤ 48 MiB 用 full（BC3 2048²，5.3 MiB），否则 half（1024²，1.3 MiB，WebP 后备同样减半）', () => {
    const all = { s3tc: true, etc: true };
    const none = { s3tc: false, etc: false };
    const MiB = 1024 * 1024;
    expect(FULL_ATLAS_MAX_RT_BYTES).toBe(48 * MiB);
    // 实测的渲染目标（场景目标 + 画布 + 反射 + bloom）：1280×720 @1（MSAA 2）41.3 MiB、1920×1080 @1 / 2560×1440 / 1280×720 @2 53.4 MiB
    expect(desktopAtlasRes(41.3 * MiB)).toBe('full');
    expect(desktopAtlasRes(53.4 * MiB)).toBe('half');
    expect(desktopAtlasRes(48 * MiB)).toBe('full');
    expect(desktopAtlasRes(48 * MiB + 1)).toBe('half');
    // 不传 desktop 时按省显存的 half
    expect(chooseAtlas('high', false, all)).toBe('bc3Half');
    // full
    expect(chooseAtlas('high', false, all, null, 'full')).toBe('bc3');
    expect(chooseAtlas('high', false, none, null, 'full')).toBe('webpHalf');
    expect(atlasGpuBytes('bc3', 2048)).toBe(5592400);
    expect(atlasGpuBytes('webpHalf', 2048)).toBe(rgbaBytes(1024, 1024));
    // half：省约 4 MiB；手机与 LOW 不受影响
    expect(chooseAtlas('high', false, all, null, 'half')).toBe('bc3Half');
    expect(chooseAtlas('high', false, { s3tc: false, etc: true }, null, 'half')).toBe('etc2Half');
    expect(chooseAtlas('high', false, none, null, 'half')).toBe('webpQuarter');
    expect(atlasGpuBytes('bc3Half', 2048)).toBe(1398096);
    expect(atlasGpuBytes('webpQuarter', 2048)).toBeLessThan(1.4 * MiB);
    expect(atlasGpuBytes('bc3', 2048) - atlasGpuBytes('bc3Half', 2048)).toBeGreaterThan(4 * MiB - 10);
    for (const d of ['full', 'half'] as const) {
      expect(chooseAtlas('high', true, all, null, d)).toBe('etc2Half');
      expect(chooseAtlas('low', false, all, null, d)).toBe('bc3Quarter');
      // 手动强制（#lmtex=）照旧优先
      expect(chooseAtlas('high', false, all, 'bc3', d)).toBe('bc3');
    }
  });

  it('地标名：合成城市（fixture）与 D6 真名表逐字一致（冒烟脚本按 fixture.ts 里的次数豁免这些字面量）', () => {
    const fx = makeFixtureCity();
    expect(fx.landmarks.map((l) => l.id).sort()).toEqual(Object.keys(LANDMARK_REAL_NAMES).sort());
    for (const l of fx.landmarks) expect(l.name).toEqual(LANDMARK_REAL_NAMES[l.id]);
  });

  it('网格里的位置按 three 的轴序（x, z, −y）存：与 coords.ts 的换算一致', () => {
    expect(simMetresToThree(1, 2, 3)).toEqual([1, 3, -2]);
  });
});

const root = new URL('../../../public/city/', import.meta.url);
/** 第一个 LED 线顶点的下标（线段的顶点按 4 个一组连续写在网格末尾）。 */
const firstLine = (d: ReturnType<typeof parseMesh>) => {
  for (let v = 0; v < d.vertexCount; v++) if (d.grid[v * 4 + 1] === FEATURE.line) return v;
  return -1;
};
const city = existsSync(new URL('central.json', root)) ? (JSON.parse(readFileSync(new URL('central.json', root), 'utf8')) as CityFile) : null;
const meta = city?.meta.landmarkMeshes;

describe.skipIf(!meta)('地标真实网格（真实数据）', () => {
  const read = (f: string) => {
    const b = readFileSync(new URL(`${meta!.dir}/${f}`, root));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };

  it('真实数据的地标名是 D6 真名表里对应 id 的那一个', () => {
    for (const l of city!.landmarks) expect(l.name).toEqual(LANDMARK_REAL_NAMES[l.id]);
  });

  it('六座都有近景网格：三角形数与清单一致、索引不越界、外包盒在清单的 bbox 里；合计在 R5 预算内', () => {
    let high = 0;
    let low = 0;
    for (const l of city!.landmarks) {
      expect(l.mesh, l.id).toBeDefined();
      const d = parseMesh(read(l.mesh!.high));
      expect(d.indexCount / 3).toBe(l.mesh!.tris[0]);
      high += l.mesh!.tris[0];
      low += l.mesh!.tris[1];
      const [x0, y0, z0, x1, y1, z1] = l.mesh!.bbox;
      // three 坐标的外包盒 → 模拟坐标 dm（±1 dm 量化）
      expect(d.offset[0] * 10).toBeGreaterThanOrEqual(x0 - 1);
      expect((d.offset[0] + d.span[0]) * 10).toBeLessThanOrEqual(x1 + 1);
      expect(d.offset[1] * 10).toBeGreaterThanOrEqual(z0 - 1);
      expect((d.offset[1] + d.span[1]) * 10).toBeLessThanOrEqual(z1 + 1);
      expect(-(d.offset[2] + d.span[2]) * 10).toBeGreaterThanOrEqual(y0 - 1);
      expect(-d.offset[2] * 10).toBeLessThanOrEqual(y1 + 1);
      const feats = new Set<number>();
      for (let i = 1; i < d.grid.length; i += 4) feats.add(d.grid[i]!);
      // 网格里的地标序号 = 本座在 central.json landmarks 数组里的下标（客户端的 uniform 数组与远景按位隐藏都按它）
      const idx = new Set<number>();
      for (let i = 2; i < d.grid.length; i += 4) idx.add(d.grid[i]!);
      expect([...idx]).toEqual([city!.landmarks.indexOf(l)]);
      for (const f of feats) expect(f).toBeLessThanOrEqual(FEATURE.ctier);
    }
    expect(high).toBeLessThanOrEqual(160_000);
    expect(low).toBeLessThanOrEqual(50_000);
    const d = parseMesh(read(meta!.low));
    expect(d.indexCount / 3).toBe(low);
    const idx = new Set<number>();
    for (let i = 2; i < d.grid.length; i += 4) idx.add(d.grid[i]!);
    expect([...idx].sort()).toEqual(city!.landmarks.map((_, i) => i));
  });

  it('LED 线（特征 line）：每段 4 个顶点同一方向、左右号 ±1；白线 / 冠顶线宽 0.3 m，steel-frame 红线 0.9 m（桁架）/ 0.6 m（竖线）；prism-tower白线、steel-frame红线、neon-centre冠顶线都在，远景网格里也有', () => {
    const lineStats = (d: ReturnType<typeof parseMesh>) => {
      const colours = new Map<number, number>();
      let quads = 0;
      for (let v = 0; v < d.vertexCount; v++) {
        if (d.grid[v * 4 + 1] !== FEATURE.line) continue;
        quads++;
        expect(Math.abs(d.nrm[v * 4 + 3]!)).toBe(127);
        expect(d.grid[v * 4 + 3] === LINE_COLOURS.red ? [600, 900] : [300]).toContain(d.fac[v * 2 + 1]);
        colours.set(d.grid[v * 4 + 3]!, (colours.get(d.grid[v * 4 + 3]!) ?? 0) + 1);
      }
      return { verts: quads, colours };
    };
    const byId = new Map(city!.landmarks.map((l) => [l.id, parseMesh(read(l.mesh!.high))]));
    const prism = lineStats(byId.get('prism-tower')!);
    expect(prism.verts / 4).toBeGreaterThan(40);
    expect([...prism.colours.keys()]).toEqual([LINE_COLOURS.white]);
    const steel = lineStats(byId.get('steel-frame')!);
    expect(steel.colours.get(LINE_COLOURS.red)! / 4).toBeGreaterThan(20);
    expect(lineStats(byId.get('neon-centre')!).colours.get(LINE_COLOURS.tier)).toBeGreaterThan(0);
    // 同一段的 4 个顶点：法线（线方向）相同、左右号一负一正
    const d = byId.get('prism-tower')!;
    for (let v = 0; v < d.vertexCount; v++) {
      if (d.grid[v * 4 + 1] !== FEATURE.line || (v - firstLine(d)) % 4 !== 0) continue;
      for (let k = 1; k < 4; k++) for (let c = 0; c < 3; c++) expect(d.nrm[(v + k) * 4 + c]).toBe(d.nrm[v * 4 + c]);
      expect([d.nrm[v * 4 + 3], d.nrm[(v + 1) * 4 + 3]]).toEqual([-127, 127]);
    }
    const low = lineStats(parseMesh(read(meta!.low)));
    expect(low.verts).toBeGreaterThan(0);
  });

  it('steel-frame：地面广场是开敞的——服务塔之间、底腹（12.9 mPD）以下没有大块的竖直封闭墙；冠顶发光芯在harbour-spire上', () => {
    const l = city!.landmarks.find((x) => x.id === 'steel-frame')!;
    const d = parseMesh(read(l.mesh!.high));
    const a = (-16 * Math.PI) / 180;
    const E = [Math.cos(a), Math.sin(a)];
    const N = [-Math.sin(a), Math.cos(a)];
    const sim = (i: number) => {
      const x = d.offset[0] + (d.pos[i * 4]! / 65535) * d.span[0];
      const z = d.offset[1] + (d.pos[i * 4 + 1]! / 65535) * d.span[1];
      const ny = d.offset[2] + (d.pos[i * 4 + 2]! / 65535) * d.span[2];
      return [x, -ny, z] as const;
    };
    let closure = 0;
    for (let t = 0; t < d.indexCount; t += 3) {
      const p = [0, 1, 2].map((k) => sim(d.index[t + k]!));
      if (d.grid[d.index[t]! * 4 + 1] === FEATURE.line) continue;
      const cx = (p[0]![0] + p[1]![0] + p[2]![0]) / 3;
      const cy = (p[0]![1] + p[1]![1] + p[2]![1]) / 3;
      const e = cx * E[0]! + cy * E[1]!;
      const n = cx * N[0]! + cy * N[1]!;
      if (e < 519.5 || e > 564.5 || n < -166 || n > -117.5) continue;
      const zmax = Math.max(p[0]![2], p[1]![2], p[2]![2]);
      if (zmax > 12.8) continue;
      const u = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
      const v = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]];
      const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const area = Math.hypot(c[0]!, c[1]!, c[2]!) / 2;
      if (area > 0 && Math.abs(c[2]!) / (2 * area) < 0.3 && area > 30) closure += area;
    }
    expect(closure).toBeLessThan(30);
    const spire = parseMesh(read(city!.landmarks.find((x) => x.id === 'harbour-spire')!.mesh!.high));
    let core = 0;
    for (let v = 0; v < spire.vertexCount; v++) if (spire.grid[v * 4 + 1] === FEATURE.crown && spire.grid[v * 4 + 3] === 1) core++;
    expect(core).toBeGreaterThan(30);
  });

  it('prism-tower 的 LED 线没有重复 / 错开的同一根构件（复审 R5b：同向 ≤ 5°、相距 ≤ 2 m、大半重叠的两条算重复）', () => {
    const l = city!.landmarks.find((x) => x.id === 'prism-tower')!;
    const d = parseMesh(read(l.mesh!.high));
    const P = (v: number) => [0, 1, 2].map((k) => d.offset[k]! + (d.pos[v * 4 + k]! / 65535) * d.span[k]!);
    const lines: [number[], number[]][] = [];
    for (let v = firstLine(d); v >= 0 && v < d.vertexCount; v += 4) lines.push([P(v), P(v + 2)]);
    expect(lines.length).toBeGreaterThan(40);
    const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]!);
    const dot = (a: number[], b: number[]) => a.reduce((s2, x, i) => s2 + x * b[i]!, 0);
    const len = (a: number[]) => Math.sqrt(dot(a, a));
    let dup = 0;
    for (let i = 0; i < lines.length; i++) {
      const [A, B] = lines[i]!;
      const L = len(sub(B, A));
      const u = sub(B, A).map((x) => x / L);
      for (let j = i + 1; j < lines.length; j++) {
        const [C, D] = lines[j]!;
        const M = len(sub(D, C));
        if (Math.abs(dot(u, sub(D, C))) / M < Math.cos((5 * Math.PI) / 180)) continue;
        const perp = (q: number[]) => {
          const w = sub(q, A);
          const t = dot(w, u);
          return len(sub(w, u.map((x) => x * t)));
        };
        if (perp(C) > 2 || perp(D) > 2) continue;
        const [t0, t1] = [dot(sub(C, A), u), dot(sub(D, A), u)].sort((a, b) => a - b);
        if (Math.min(t1!, L) - Math.max(t0!, 0) > 0.5 * Math.min(L, M)) dup++;
      }
    }
    expect(dup).toBe(0);
  });

  it('steel-frame 红光楼梯间只在西服务塔最外面的北 / 南立面上、西桅杆以西：条带坐标（网格立面第 2 分量）切出约 4.2 m 宽的一条（e 510.5–514.7）', () => {
    const l = city!.landmarks.find((x) => x.id === 'steel-frame')!;
    const d = parseMesh(read(l.mesh!.high));
    const a = (-16 * Math.PI) / 180;
    let inStrip = 0;
    let outStrip = 0;
    const faces = new Set<number>();
    // 条带坐标 s = (e − 中线) / 半宽 × 1000 是本地 e 的一次函数：用全部红光楼梯间顶点做最小二乘，反求条带的中线与宽度
    let n = 0;
    let se = 0;
    let ss = 0;
    let see = 0;
    let ses = 0;
    let eMaxIn = -Infinity;
    for (let v = 0; v < d.vertexCount; v++) {
      if (d.grid[v * 4 + 1] !== FEATURE.redcore) continue;
      const x = d.offset[0] + (d.pos[v * 4]! / 65535) * d.span[0];
      const y = -(d.offset[2] + (d.pos[v * 4 + 2]! / 65535) * d.span[2]);
      const e = Math.cos(a) * x + Math.sin(a) * y;
      const s2 = d.fac[v * 2 + 1]!;
      if (Math.abs(s2) < 32767) {
        n++;
        se += e;
        ss += s2;
        see += e * e;
        ses += e * s2;
      }
      if (Math.abs(s2) > 1000) {
        outStrip++;
        continue;
      }
      inStrip++;
      eMaxIn = Math.max(eMaxIn, e);
      faces.add(Math.round((-Math.sin(a) * x + Math.cos(a) * y) * 10) / 10);
    }
    expect(inStrip).toBeGreaterThan(0);
    expect(outStrip).toBeGreaterThan(0);
    // 条带里的顶点都在北立面（本地 n ≈ −116.1）或南立面（≈ −168.6）上
    for (const nn of faces) expect(Math.min(Math.abs(nn + 116.1), Math.abs(nn + 168.6)), `本地 n = ${nn}`).toBeLessThanOrEqual(1.5);
    const slope = (n * ses - se * ss) / (n * see - se * se); // = 1000 / 半宽
    const width = (2 * 1000) / slope;
    const centre = se / n - ss / n / slope; // s = 0 处的 e
    expect(width).toBeGreaterThan(3.9);
    expect(width).toBeLessThan(4.5);
    // 中线约 512.6：在西桅杆（两腿 519.7–525.9，本地 e）以西、西服务塔（e 506–519）里；条带里的顶点没有一个伸到西桅杆
    expect(Math.abs(centre - 512.6)).toBeLessThan(0.3);
    expect(eMaxIn).toBeLessThan(519.0);
  });

  it('steel-frame 的远景网格是体块（复审 R5b 修正二）：面只有竖直墙（法线沿本地 e / n 轴）与水平的屋面 / 底面，没有斜的大三角形；桅杆是长方体', () => {
    const d = parseMesh(read(meta!.low));
    const li = city!.landmarks.findIndex((l) => l.id === 'steel-frame');
    const a = (-16 * Math.PI) / 180;
    let tris = 0;
    let mast = 0;
    for (let t = 0; t < d.indexCount; t += 3) {
      const v = d.index[t]!;
      if (d.grid[v * 4 + 2] !== li || d.grid[v * 4 + 1] === FEATURE.line) continue;
      tris++;
      // 法线 i8（three 轴序 x, y=上, z=−北）→ 本地 (e, n, 上)
      const nx = d.nrm[v * 4]! / 127;
      const ny = d.nrm[v * 4 + 1]! / 127;
      const sy = -d.nrm[v * 4 + 2]! / 127;
      const ne = Math.cos(a) * nx + Math.sin(a) * sy;
      const nn = -Math.sin(a) * nx + Math.cos(a) * sy;
      const axis = Math.max(Math.abs(ne), Math.abs(nn), Math.abs(ny));
      expect(axis, `三角形 ${t / 3} 法线 (${ne.toFixed(2)}, ${nn.toFixed(2)}, ${ny.toFixed(2)})`).toBeGreaterThan(0.985);
      if (d.grid[v * 4 + 1] === FEATURE.mast) mast++;
    }
    expect(tris).toBeGreaterThan(300);
    // 8 根桅杆 × （4 面 + 顶）× 2 个三角形
    expect(mast).toBeGreaterThanOrEqual(80);
  });

  it('neon-centre 每层的蓝光带只在四个三角凸窗的面上（法线方位 11.4° + k·90°），不绕到主方形的面（与轴成 45°）上', () => {
    const l = city!.landmarks.find((x) => x.id === 'neon-centre')!;
    const d = parseMesh(read(l.mesh!.high));
    let bands = 0;
    let facade = 0;
    for (let v = 0; v < d.vertexCount; v++) {
      const f = d.grid[v * 4 + 1];
      if (f !== FEATURE.bands && f !== FEATURE.facade) continue;
      const nx = d.nrm[v * 4]! / 127;
      const sy = -d.nrm[v * 4 + 2]! / 127;
      if (Math.hypot(nx, sy) < 0.8) continue;
      const az = ((((Math.atan2(sy, nx) * 180) / Math.PI - 11.4) % 90) + 90) % 90;
      const off = Math.min(az, 90 - az);
      if (f === FEATURE.bands) {
        bands++;
        expect(off).toBeLessThan(20);
      } else if (off > 35) facade++;
    }
    expect(bands).toBeGreaterThan(50);
    expect(facade).toBeGreaterThan(50);
  });

  it('图集：BC3 全 / 半 / 四分之一分辨率、ETC2 半 / 四分之一分辨率与两份 WebP 都在，尺寸对、带 mip', () => {
    const a = meta!.atlas;
    const bc3 = parseTexture(read(a.bc3));
    expect([bc3.format, bc3.width, bc3.height]).toEqual([CLTX_BC3, a.size, a.size]);
    expect(bc3.levels.length).toBeGreaterThan(8);
    const half = parseTexture(read(a.bc3Half));
    expect([half.width, half.levels.length]).toEqual([a.size / 2, bc3.levels.length - 1]);
    const etc = parseTexture(read(a.etc2Half));
    expect([etc.format, etc.width]).toEqual([CLTX_ETC2, a.size / 2]);
    for (const f of [a.webpHalf, a.webpQuarter]) expect(isWebp(read(f))).toBe(true);
    // 四分之一分辨率 = 半分辨率去掉最大一级 mip（逐级的块数据逐字节相同）
    for (const [qf, hf, fmt] of [[a.bc3Quarter, a.bc3Half, CLTX_BC3], [a.etc2Quarter, a.etc2Half, CLTX_ETC2]] as const) {
      const q = parseTexture(read(qf));
      const h = parseTexture(read(hf));
      expect([q.format, q.width, q.height, q.levels.length]).toEqual([fmt, a.size / 4, a.size / 4, h.levels.length - 1]);
      q.levels.forEach((l, k) => expect(Buffer.from(l.data).equals(Buffer.from(h.levels[k + 1]!.data))).toBe(true));
    }
  });

  it('文件个数、单个与合计大小在 R5 预算内（≤ 24 个、单个 ≤ 6 MB、合计 ≤ 20 MB）', () => {
    const a = meta!.atlas;
    const files = [meta!.low, a.bc3, a.bc3Half, a.etc2Half, a.bc3Quarter, a.etc2Quarter, a.webpHalf, a.webpQuarter, ...city!.landmarks.map((l) => l.mesh!.high)];
    expect(files.length).toBeLessThanOrEqual(24);
    let total = 0;
    for (const f of files) {
      const n = read(f).byteLength;
      expect(n, f).toBeLessThanOrEqual(6_000_000);
      total += n;
    }
    expect(total).toBe(meta!.bytes);
    expect(total).toBeLessThanOrEqual(20_000_000);
  });
});

describe('近景 / 远景切换（selectHigh）', () => {
  it('450 m 内画近景，已显示的放宽到 500 m（滞回）；没下载的不画；最多 4 座，取最近的', async () => {
    const { selectHigh, HIGH_SHOW_M, HIGH_KEEP_M, MAX_HIGH } = await import('./real');
    expect([HIGH_SHOW_M, HIGH_KEEP_M, MAX_HIGH]).toEqual([450, 500, 4]);
    expect(selectHigh([100, 460, 480, 900], [true, true, true, true], [false, false, true, true])).toEqual([true, false, true, false]);
    expect(selectHigh([100, 200], [false, true], [false, false])).toEqual([false, true]);
    const six = selectHigh([60, 10, 50, 40, 30, 20], [true, true, true, true, true, true], [false, false, false, false, false, false]);
    expect(six).toEqual([false, true, false, true, true, true]);
  });
});
