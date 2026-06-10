/**
 * 已知文件名字典 —— MIX 索引只存文件名哈希，靠常见名单反查显示名。
 * 解析到 rules.ini 后还会动态补充单位/建筑的 Image 名与 cameo 名。
 */
export const KNOWN_CHILD_MIXES = [
  'cache.mix',
  'conquer.mix',
  'generic.mix',
  'isogen.mix',
  'local.mix',
  'neutral.mix',
  'sidec01.mix',
  'sidec02.mix',
  'temperat.mix',
  'isotemp.mix',
  'snow.mix',
  'isosnow.mix',
  'urban.mix',
  'isourb.mix',
  'movies01.mix',
  'movies02.mix',
  'maps01.mix',
  'multimd.mix',
];

export const KNOWN_LOOSE_NAMES = [
  // 规则与配置
  'rules.ini',
  'art.ini',
  'ai.ini',
  'sound.ini',
  'eva.ini',
  'theme.ini',
  'ui.ini',
  'mission.ini',
  'battle.ini',
  'mapsel.ini',
  // 字符串表
  'ra2.csf',
  // 调色板
  'isotem.pal',
  'isosno.pal',
  'isourb.pal',
  'unittem.pal',
  'unitsno.pal',
  'uniturb.pal',
  'temperat.pal',
  'snow.pal',
  'urban.pal',
  'anim.pal',
  'cameo.pal',
  'palette.pal',
  'mousepal.pal',
  'lib.pal',
  // 常见 UI 精灵
  'mouse.shp',
  'pips.shp',
  'pips2.shp',
  'sidebar.shp',
  'powerp.shp',
  'gclock2.shp',
  'darken.shp',
  // 常见单位/动画示例（便于无 rules 时也能认出一些）
  'gtnkicon.shp',
  'htnkicon.shp',
  'e1.shp',
  'e2.shp',
  'flak.shp',
  'pillbox.shp',
];

/** 由 rules.ini 推导候选文件名（Image/cameo/体素等）。 */
export function deriveNamesFromRules(typeNames: string[]): string[] {
  const out: string[] = [];
  for (const raw of typeNames) {
    const n = raw.toLowerCase();
    out.push(
      `${n}.shp`,
      `${n}.vxl`,
      `${n}.hva`,
      `${n}tur.vxl`,
      `${n}tur.hva`,
      `${n}barl.vxl`,
      `${n}icon.shp`,
      `${n}uico.shp`,
    );
  }
  return out;
}
