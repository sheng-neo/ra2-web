/// <reference types="node" />
// ===== tools/strings-scan.ts =====（ARCHITECTURE §10.7；WORKPLAN §1 第 5 项）
// 文案黑名单扫描：在 src/**（排除 *.test.ts）的代码与字符串字面量中查找原版专有名（店名 / 报名 / Arcology 名 / 速度名 / refName 列的专有名 / 品牌名）。
// 注释会先被剥离（buildings.generated.ts 的"参考名"行尾注释与规格引用允许存在于注释中），字符串字面量保留扫描。
// 用法：tsx tools/strings-scan.ts [路径…]     默认扫描 packages/sc2k/src；命中则逐条打印并以退出码 1 结束
//       tsx tools/strings-scan.ts --list      打印黑名单
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 黑名单（大小写不敏感、按词边界匹配；多词短语整体匹配）。只收不含歧义的专有名，不收通用词（"Warehouse""Marina""Tornado"等）。
 * 来源：spec:building-catalogue §2.2–§2.9 参考名列中的专有名、§2.11 / spec:ui-art §2.2 的原版速度名、spec:services §2.6.1 的默认标签名、品牌名。
 */
export const BLACKLIST: readonly string[] = [
  // 品牌 / 产品
  'SimCity', 'Sim City', 'SimNation', 'Maxis', 'Electronic Arts', 'SCURK',
  // 原版吉祥物 / 奖励建筑 / 速度档名
  'Llama', 'African Swallow',
  // Arcology 专名；标识符形式整词收录（本包的 TechKey / ToolId 已改为 arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward）
  'Plymouth Arcology', 'Forest Arcology', 'Darco', 'Launch Arcology', 'arcoPlymouth', 'arcoForest', 'arcoDarco', 'arcoLaunch',
  // 建筑参考名中的专有名 / 独特措辞
  'Thingamajig', 'Couple O Trees', 'Morer Trees', 'Tons O Trees', 'Veritable Jungle',
  'Lower Class Homes', 'Middle Class Homes', 'Upper Class Homes',
  // 报纸 / 微模拟默认标签
  'Miss Sim', 'MissSim', 'OpinionFred', 'Extra!!!', 'SimBus',
];

const WORD = '[\\p{L}\\p{N}_]';
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const PATTERNS: ReadonlyArray<{ word: string; re: RegExp }> = BLACKLIST.map((word) => ({ word, re: new RegExp(`(?<!${WORD})${escapeRe(word)}(?!${WORD})`, 'giu') }));

/** 把 // 与 /* *\/ 注释替换为空格（保留换行以维持行号）；字符串 / 模板字面量原样保留。不处理正则字面量（极少含 //）。 */
export function stripComments(src: string): string {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!, d = src[i + 1];
    if (c === '/' && d === '/') {                                            // 行注释
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {                                     // 块注释
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'" || c === '`') {                         // 字符串 / 模板
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]! + (src[i + 1] ?? ''); i += 2; continue; }
        if (q !== '`' && src[i] === '\n') break;
        out += src[i]; i++;
      }
      if (i < n) { out += src[i]; i++; }
    } else { out += c; i++; }
  }
  return out;
}

export interface Hit { file: string; line: number; col: number; word: string; text: string }
export function scanSource(src: string, file: string): Hit[] {
  const code = stripComments(src);
  const lines = code.split('\n');
  const hits: Hit[] = [];
  lines.forEach((text, k) => {
    for (const { word, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) hits.push({ file, line: k + 1, col: (m.index ?? 0) + 1, word, text: text.trim() });
    }
  });
  return hits;
}

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css', '.json']);
const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);
function* walk(p: string): Generator<string> {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (SKIP_DIR.has(p.split(/[\\/]/).pop()!)) return;
    for (const e of readdirSync(p).sort()) yield* walk(join(p, e));
  } else if (SCAN_EXT.has(extname(p)) && !/\.test\.[cm]?[jt]sx?$/.test(p)) {
    yield p;
  }
}

function main(argv: string[]): number {
  if (argv.includes('--list')) { for (const w of BLACKLIST) console.log(w); return 0; }
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const roots = argv.filter((a) => !a.startsWith('--'));
  const targets = roots.length ? roots.map((r) => resolve(r)) : [resolve(pkg, 'src')];
  const hits: Hit[] = [];
  let files = 0;
  for (const root of targets) for (const f of walk(root)) { files++; hits.push(...scanSource(readFileSync(f, 'utf8'), f)); }
  for (const h of hits) console.log(`${relative(process.cwd(), h.file)}:${h.line}:${h.col}  [${h.word}]  ${h.text}`);
  if (hits.length) { console.error(`[strings-scan] 命中 ${hits.length} 处黑名单关键词（扫描 ${files} 个文件）`); return 1; }
  console.log(`[strings-scan] 通过：${files} 个文件无黑名单关键词`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
