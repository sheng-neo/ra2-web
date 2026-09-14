// 把 Three.js + 官方扩展 + 场景代码打成一个内联脚本，生成：
//   index.html    —— 独立完整页面（双击即可打开，无需联网加载脚本）
//   artifact.html —— 供发布工具包裹的页面片段
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
});
let js = result.outputFiles[0].text;
// 内联到 <script> 里时不能出现 </script>
js = js.replace(/<\/script/gi, '<\\/script');

const template = readFileSync(join(here, 'template.html'), 'utf8');
const fragment = template.replace('/*BUNDLE*/', () => js);
writeFileSync(join(here, 'artifact.html'), fragment);

const full = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  fragment.slice(0, fragment.indexOf('</style>') + 8),
  '</head>',
  '<body>',
  fragment.slice(fragment.indexOf('</style>') + 8),
  '</body>',
  '</html>',
].join('\n');
writeFileSync(join(here, 'index.html'), full);
console.log(`bundle ${(js.length / 1024).toFixed(0)} KB · index.html ${(full.length / 1024).toFixed(0)} KB`);
