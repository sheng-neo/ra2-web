// ===== io/assets/import/labels.ts =====（WORKPLAN §1 第 4 条：文案走 strings 键，缺键回退）
// 导入面板用到的文案键（前缀 assets.*，已在 docs/contract-rfc.md 提出加入 data/strings.*.ts）与本地回退表。
// 有 Strings 时：strings.has(key) ? strings.t(key, args) : 回退表；无 Strings 时按 lang 用回退表。所有文案原创，不含原版专名。
import type { Strings } from '../../../contracts/strings';

export const ASSET_LABELS_ZH: Readonly<Record<string, string>> = {
  'assets.title': '导入游戏素材',
  'assets.hint': '从你自己安装的 Win95 版游戏目录里选择 DATA/LARGE.DAT、DATA/SMALLMED.DAT、DATA/SPECIAL.DAT 与 BITMAPS/PAL_MSTR.BMP；也可以一并选择 .SC2 存档。',
  'assets.pick': '选择文件…',
  'assets.useOriginal': '使用原版美术',
  'assets.art.enabled': '原版美术：已启用',
  'assets.art.partial': '原版美术：部分启用（缺 {missing}）',
  'assets.art.disabled': '原版美术：未启用',
  'assets.busy': '正在解码…',
  'assets.clear': '清除本地缓存',
  'assets.cleared': '已清除本机缓存的游戏文件',
  'assets.files': '已导入的文件',
  'assets.rows': '本次选择',
  'assets.diagnostics': '诊断',
  'assets.none': '（无）',
  'assets.status.stored': '已导入',
  'assets.status.saved': '已加入存档库',
  'assets.status.rejected': '未采用',
  'assets.privacy': '文件只保存在本机浏览器中，不会上传',
  'assets.err.SPRITE_HEADER_TRUNCATED': '精灵文件损坏',
  'assets.err.BAD_ENTRY': '精灵文件损坏',
  'assets.err.LARGE_SANITY': '这似乎不是 Win95 版的 LARGE.DAT（DOS 版不支持）',
  'assets.err.PALETTE_FORMAT': '调色板文件格式不对',
  'assets.err.PALETTE_MISSING': '需要 BITMAPS/PAL_MSTR.BMP 才能显示原版画面',
  'assets.err.PALETTE_FALLBACK': '没有 PAL_MSTR.BMP，暂用其它调色板文件',
  'assets.err.QUOTA': '浏览器存储空间不足，本次只在会话内使用',
  'assets.err.PERMISSION': '需要读取权限；可改用文件多选',
  'assets.err.BAD_MAGIC': '文件名对，但内容不是对应的格式',
  'assets.err.UNKNOWN_FILE': '无法识别这个文件',
  'assets.err.NAME_MISMATCH': '按文件内容识别（文件名不符）',
  'assets.err.IDENTIFIED_BY_MAGIC': '按文件内容识别',
  'assets.err.NOT_SC2': '这不是本游戏支持的存档',
  'assets.err.UNSUPPORTED_CLASSIC': '暂不支持更早版本的存档',
  'assets.err.MISSING_CHUNK': '存档不完整',
  'assets.err.SC2_READ_FAILED': '存档无法读取',
  'assets.err.UNSUPPORTED': '暂不支持这种文件',
  'assets.err.DECODE_FAILED': '解码失败',
  'assets.err.DAT_ALIGN_SUSPECT': '精灵对齐可疑，仍按默认锚点显示',
  'assets.err.ID_LAYOUT_UNRESOLVED': '部分精灵段未能对齐，将使用程序化美术',
  'assets.err.DUPLICATE_SPRITE_ID': '精灵文件内有重复编号（已按先出现者）',
  'assets.err.SPECIAL_OVERRIDE': 'SPECIAL.DAT 覆盖了部分中小号精灵',
};
export const ASSET_LABELS_EN: Readonly<Record<string, string>> = {
  'assets.title': 'Import game assets',
  'assets.hint': 'Pick DATA/LARGE.DAT, DATA/SMALLMED.DAT, DATA/SPECIAL.DAT and BITMAPS/PAL_MSTR.BMP from your own Win95 installation; .SC2 saves can be added too.',
  'assets.pick': 'Choose files…',
  'assets.useOriginal': 'Use original artwork',
  'assets.art.enabled': 'Original artwork: enabled',
  'assets.art.partial': 'Original artwork: partially enabled (missing {missing})',
  'assets.art.disabled': 'Original artwork: not enabled',
  'assets.busy': 'Decoding…',
  'assets.clear': 'Clear local cache',
  'assets.cleared': 'Cached game files removed from this browser',
  'assets.files': 'Imported files',
  'assets.rows': 'This selection',
  'assets.diagnostics': 'Diagnostics',
  'assets.none': '(none)',
  'assets.status.stored': 'imported',
  'assets.status.saved': 'added to saves',
  'assets.status.rejected': 'not used',
  'assets.privacy': 'Files stay in this browser only and are never uploaded',
  'assets.err.SPRITE_HEADER_TRUNCATED': 'Sprite file is damaged',
  'assets.err.BAD_ENTRY': 'Sprite file is damaged',
  'assets.err.LARGE_SANITY': 'This does not look like the Win95 LARGE.DAT (DOS files are not supported)',
  'assets.err.PALETTE_FORMAT': 'Palette file has the wrong format',
  'assets.err.PALETTE_MISSING': 'BITMAPS/PAL_MSTR.BMP is required for original artwork',
  'assets.err.PALETTE_FALLBACK': 'PAL_MSTR.BMP missing; using another palette file for now',
  'assets.err.QUOTA': 'Browser storage is full; files are used for this session only',
  'assets.err.PERMISSION': 'Read permission required; try picking files instead',
  'assets.err.BAD_MAGIC': 'Name matches but the content is not that format',
  'assets.err.UNKNOWN_FILE': 'Unrecognised file',
  'assets.err.NAME_MISMATCH': 'Identified by content (name did not match)',
  'assets.err.IDENTIFIED_BY_MAGIC': 'Identified by content',
  'assets.err.NOT_SC2': 'Not a supported city file',
  'assets.err.UNSUPPORTED_CLASSIC': 'Older-generation city files are not supported',
  'assets.err.MISSING_CHUNK': 'City file is incomplete',
  'assets.err.SC2_READ_FAILED': 'City file could not be read',
  'assets.err.UNSUPPORTED': 'This file type is not supported yet',
  'assets.err.DECODE_FAILED': 'Decoding failed',
  'assets.err.DAT_ALIGN_SUSPECT': 'Sprite alignment looks odd; default anchor kept',
  'assets.err.ID_LAYOUT_UNRESOLVED': 'Some sprite ranges could not be aligned; procedural art is used there',
  'assets.err.DUPLICATE_SPRITE_ID': 'Duplicate sprite ids in file (first occurrence used)',
  'assets.err.SPECIAL_OVERRIDE': 'SPECIAL.DAT overrides some small/medium sprites',
};

export type LabelFn = (key: string, args?: Record<string, string | number>) => string;
const fill = (s: string, args?: Record<string, string | number>): string => (args ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in args ? String(args[k]) : m)) : s);

/** 组装文案函数：优先 strings 表（缺键回退本地表；本地也没有则返回键名，与 Strings.t 的缺键约定一致）。 */
export function makeLabels(strings?: Strings, lang: 'zh' | 'en' = strings?.lang ?? 'zh'): LabelFn {
  const local = lang === 'en' ? ASSET_LABELS_EN : ASSET_LABELS_ZH;
  return (key, args) => {
    if (strings && strings.has(key)) return strings.t(key, args);
    const s = local[key];
    return s === undefined ? key : fill(s, args);
  };
}
