/**
 * 港府数据的署名（写进 meta.sources 与 ATTRIBUTION.txt）。措辞与 data-raw/landsd/TERMS.md 第 4 节一致，
 * 只按实际用到的部门换主语、按实际做过的处理换处理方式；每条署名先英文、换行后繁体中文。
 * id 前缀 'landsd' 与 Building.src = 'landsd' 对应；地形 id 含 'dtm'，客户端据此去取 terrain.bin。
 */
import type { SourceRef } from '@central/data';

/** 对数据做过的处理（英、繁），须如实写全（TERMS.md 第 5 节：条款没有明文授予「修改」）。 */
export interface Processing {
  en: string;
  zh: string;
}

/** TERMS.md 第 4 节的通用措辞。 */
export const RESAMPLED: Processing = { en: 'resampled/converted', zh: '重新取樣及轉換' };

const DTM_PROCESSING: Processing = {
  en: 'resampled/converted, outliers and small gaps repaired, sea set to 0 mPD',
  zh: '重新取樣及轉換，修補異常值與小空洞，海面設為 0 mPD',
};

const BUILDINGS_PROCESSING: Processing = {
  en: 'converted, footprints simplified and filtered, some heights estimated, some buildings replaced by stylised landmarks',
  zh: '轉換、簡化及篩選輪廓，部分高度為估算，部分建築以風格化地標取代',
};

/** CSDI 条款要求：写明政府与 CSDI 平台是来源，并声明知识产权属政府。 */
export function csdiAttribution(departments: string, processing: Processing = RESAMPLED): string {
  return (
    `Contains data from the ${departments}, HKSAR Government, obtained from the Common Spatial Data ` +
    'Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the ' +
    `Government of the Hong Kong Special Administrative Region. The data have been processed (${processing.en}) ` +
    'for this game; the Government is not responsible for, and does not endorse, this game.'
  );
}

/** 第 4 节的繁体中文版本；departments 如「地政總署」。 */
export function csdiAttributionZh(departments: string, processing: Processing = RESAMPLED): string {
  return (
    `部分資料來源：香港特別行政區政府${departments}，經空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；` +
    `資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲${processing.zh}，政府不對本遊戲負責，亦不代表政府認可。`
  );
}

export const CSDI_LICENSE = 'CSDI-Terms';

export const REF_CEDD_DTM: SourceRef = {
  id: 'cedd/lidar-dtm-2020',
  license: CSDI_LICENSE,
  attribution:
    `${csdiAttribution('Civil Engineering and Development Department', DTM_PROCESSING)}\n` +
    csdiAttributionZh('土木工程拓展署', DTM_PROCESSING),
  url: 'https://portal.csdi.gov.hk/geoportal/?datasetId=cedd_rcd_1629267205233_87895',
};

/**
 * 地政总署「可視化三維地圖（無紋理模型）」：经 CSDI 图幅索引与可視化三維地圖网站（3d.map.gov.hk）的下载接口取得，
 * 两处条款都要求写明政府与网站是来源（TERMS.md 第 7 节）。只留了屋面派生的分层轮廓，不含网格、贴图与名称。
 */
export const REF_LANDSD_3DVM: SourceRef = {
  id: 'landsd/3dvm-nontextured-2026',
  license: CSDI_LICENSE,
  attribution:
    'Contains 3D building data from the Lands Department, HKSAR Government (3D Visualisation Map, Non-textured models), ' +
    'obtained from the 3D Visualisation Map website (3d.map.gov.hk) through the Common Spatial Data Infrastructure ' +
    '(CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the ' +
    'Hong Kong Special Administrative Region. The data have been processed (roof surfaces of the 3D models converted ' +
    'to simplified stacked outlines and fitted to the 2D building footprints; no meshes or textures kept) for this ' +
    'game; the Government is not responsible for, and does not endorse, this game.\n' +
    '部分資料來源：香港特別行政區政府地政總署「可視化三維地圖（無紋理模型）」，經可視化三維地圖網站（3d.map.gov.hk）' +
    '及空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲轉換' +
    '（三維模型的屋面簡化為分層輪廓並套合二維建築輪廓，不保留網格及紋理），政府不對本遊戲負責，亦不代表政府認可。',
  url: 'https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1742809441342_98380',
};

export const REF_LANDSD_BUILDINGS: SourceRef = {
  id: 'landsd/building-2026-10-20',
  license: CSDI_LICENSE,
  attribution:
    `${csdiAttribution('Lands Department', BUILDINGS_PROCESSING)}\n` + csdiAttributionZh('地政總署', BUILDINGS_PROCESSING),
  url: 'https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1637211194312_35158',
};
