/**
 * 校验 game-data/ 中红警2 游戏文件是否齐全。
 * 用法：pnpm check-assets
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game-data');

interface AssetSpec {
  name: string;
  desc: string;
  required: boolean;
}

export const ASSET_SPECS: AssetSpec[] = [
  { name: 'ra2.mix', desc: '主资源包（规则/贴图/地形/体素）', required: true },
  { name: 'language.mix', desc: '界面文字与字符串表', required: true },
  { name: 'multi.mix', desc: '官方遭遇战地图', required: true },
  { name: 'theme.mix', desc: '背景音乐', required: false },
  { name: 'audio.bag', desc: '音效数据包', required: false },
  { name: 'audio.idx', desc: '音效索引', required: false },
];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function main(): void {
  let entries: Map<string, string>;
  try {
    // 大小写不敏感匹配（绿色版/不同来源的文件名大小写不一）
    entries = new Map(readdirSync(GAME_DATA_DIR).map((f) => [f.toLowerCase(), f]));
  } catch {
    console.error(`✗ 找不到 game-data/ 目录：${GAME_DATA_DIR}`);
    process.exitCode = 1;
    return;
  }

  console.log('红警2 游戏文件检查\n');
  let missingRequired = 0;

  for (const spec of ASSET_SPECS) {
    const actual = entries.get(spec.name.toLowerCase());
    if (actual) {
      const size = statSync(join(GAME_DATA_DIR, actual)).size;
      console.log(`  ✓ ${spec.name.padEnd(14)} ${formatSize(size).padStart(10)}   ${spec.desc}`);
    } else if (spec.required) {
      console.log(`  ✗ ${spec.name.padEnd(14)} ${'缺失'.padStart(8)}   ${spec.desc}（必需）`);
      missingRequired++;
    } else {
      console.log(`  - ${spec.name.padEnd(14)} ${'缺失'.padStart(8)}   ${spec.desc}（可选）`);
    }
  }

  console.log('');
  if (missingRequired > 0) {
    console.log(`还缺 ${missingRequired} 个必需文件。获取方式见 game-data/README.md：`);
    console.log('购买 Steam/EA App 上的《Command & Conquer The Ultimate Collection》，');
    console.log('安装后从游戏目录把上述文件拷贝到 game-data/ 即可。');
  } else {
    console.log('✓ 必需文件齐全，可以开始开发/游玩。');
  }
}

main();
