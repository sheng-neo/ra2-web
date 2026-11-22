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
// English is the default. A Chinese profile gets its title and loading text from the app once it starts.
const page = `<title>GLP-1 companion</title>
<meta name="description" content="A GLP-1 medication companion">
<style>
${css}
</style>
<div id="root"><div class="loading">Loading…</div></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(dir, 'wenshou.html'), page);
console.log(`dist-artifact/wenshou.html ${(page.length / 1024).toFixed(0)} KB`);
