/**
 * 数据来源与署名（原样写进 meta.sources 和 ATTRIBUTION.txt）。
 * id 以 'ovt' 开头，与 Building.src = 'ovt' 对应。
 */
import type { SourceRef } from '@central/data';
import { OVERTURE_RELEASE } from '../config';

export const REF_OSM: SourceRef = {
  id: `ovt/${OVERTURE_RELEASE}/osm`,
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
};

export const REF_OVERTURE: SourceRef = {
  id: `ovt/${OVERTURE_RELEASE}`,
  license: 'ODbL-1.0',
  attribution: 'Overture Maps Foundation',
  url: 'https://overturemaps.org',
};

/** Overture 路段里由 TomTom 提供的部分（同为 ODbL-1.0），只在产物确实用到时列出。 */
export const REF_TOMTOM: SourceRef = {
  id: `ovt/${OVERTURE_RELEASE}/tomtom`,
  license: 'ODbL-1.0',
  attribution: 'Some road segments: TomTom data (ODbL-1.0), distributed via Overture Maps Foundation',
  url: 'https://overturemaps.org',
};

/** Overture 建筑里非 OSM 的东亚建筑轮廓（CC-BY-4.0），只在产物确实用到时列出。 */
export const REF_EAST_ASIA_BUILDINGS: SourceRef = {
  id: `ovt/${OVERTURE_RELEASE}/east-asian-buildings`,
  license: 'CC-BY-4.0',
  attribution:
    'Building footprints from Shi, Q. et al. (2024), "The Last Puzzle of Global Building Footprints: ' +
    'Mapping 280 Million Buildings in East Asia Based on VHR Images", Journal of Remote Sensing, ' +
    'dataset doi:10.5281/zenodo.8174931, licensed CC BY 4.0, distributed via Overture Maps Foundation',
  url: 'https://doi.org/10.5281/zenodo.8174931',
};
