// 把前端打包成一个 HTML 文件，用于发布成 claude.ai 私有网页（artifact）。
// 用法：node scripts/build-artifact.mjs  → dist-artifact/wenshou.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build --base ./', { stdio: 'inherit', env: { ...process.env, ARTIFACT: '1' } });
const dir = 'dist-artifact';
const assets = readdirSync(join(dir, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8')).join('\n');
const jsFiles = assets.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`expected one JS chunk, got ${jsFiles.join(', ')}`);
const js = readFileSync(join(dir, 'assets', jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const page = `<title>稳瘦</title>
<meta name="description" content="说中文的 GLP-1 用药伴侣">
<style>
${css}
</style>
<div id="root"><div class="loading">加载中…</div></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(dir, 'wenshou.html'), page);
console.log(`dist-artifact/wenshou.html ${(page.length / 1024).toFixed(0)} KB`);
