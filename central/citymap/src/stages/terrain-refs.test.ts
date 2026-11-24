import { describe, expect, it } from 'vitest';
import { loadSnapshot } from './snapshot';
import { LANDSD_DIR } from '../config';
import { csdiAttribution, csdiAttributionZh, REF_CEDD_DTM, REF_LANDSD_BUILDINGS } from './terrain-refs';

describe('港府数据署名', () => {
  it('与快照 sources.json（即 TERMS.md 第 4 节）措辞一致', () => {
    const { manifest } = loadSnapshot(LANDSD_DIR);
    expect(manifest.attribution[0]).toBe(
      csdiAttribution('Lands Department and the Civil Engineering and Development Department'),
    );
    expect(manifest.attribution[1]).toBe(csdiAttributionZh('地政總署及土木工程拓展署'));
  });

  it('地形 id 能被客户端识别，建筑 id 前缀对应 Building.src', () => {
    // 客户端 data/terrain.ts 的 wantsTerrain 用这条规则决定是否下载 terrain.bin
    expect(/dtm|terrain|dem/i.test(REF_CEDD_DTM.id)).toBe(true);
    expect(REF_LANDSD_BUILDINGS.id.startsWith('landsd')).toBe(true);
    for (const ref of [REF_CEDD_DTM, REF_LANDSD_BUILDINGS]) {
      expect(ref.attribution).toMatch(/Intellectual property rights in the data are owned by the Government/);
      expect(ref.attribution).toMatch(/CSDI/);
      expect(ref.attribution).toMatch(/\n部分資料來源：香港特別行政區政府/);
    }
  });

  it('处理方式如实写出：建筑层写明简化、篩选、估算高度和地标替换（英、繁）', () => {
    expect(REF_LANDSD_BUILDINGS.attribution).toMatch(/simplified and filtered, some heights estimated/);
    expect(REF_LANDSD_BUILDINGS.attribution).toMatch(/部分高度為估算，部分建築以風格化地標取代/);
    expect(REF_CEDD_DTM.attribution).toMatch(/resampled\/converted, outliers and small gaps repaired/);
    expect(REF_CEDD_DTM.attribution).toMatch(/重新取樣及轉換，修補異常值與小空洞/);
  });
});
