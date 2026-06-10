/**
 * 资源浏览器（M1 验证页，#assets）：
 * 挂载 game-data 下的 mix（含嵌套子 mix），列出条目并预览
 * PAL 色板 / SHP 帧 / INI 文本 / CSF 字符串 / 其他十六进制头部。
 */
import { IniFile, Palette, mixIdRA2, parseCsf, parseShp } from '@ra2web/data';
import { ResourceFS, type MountedMix } from '../vfs';
import { KNOWN_CHILD_MIXES, KNOWN_LOOSE_NAMES, deriveNamesFromRules } from '../known-names';

const ROOT_MIXES = [
  // 红警2（玩家自备）
  'ra2.mix', 'language.mix', 'multi.mix', 'theme.mix',
  // 泰伯利亚之日（EA 免费，用于验证真实渲染管线）
  'Conquer.mix', 'Cache.mix', 'Temperat.mix', 'IsoTemp.mix', 'Local.mix',
];

/** 内容嗅探：未知名条目按字节判断类型（TS 文件名与 RA2 不同）。 */
function sniffKind(bytes: Uint8Array): 'pal' | 'shp' | 'unknown' {
  if (bytes.length === 768) return 'pal';
  // SHP(TS)：首 u16 = 0，随后 cx,cy,帧数 合理
  if (bytes.length >= 8) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
    if (dv.getUint16(0, true) === 0) {
      const cx = dv.getUint16(2, true);
      const cy = dv.getUint16(4, true);
      const n = dv.getUint16(6, true);
      if (cx > 0 && cx < 2048 && cy > 0 && cy < 2048 && n > 0 && n < 4096) return 'shp';
    }
  }
  return 'unknown';
}

const RULES_TYPE_SECTIONS = ['BuildingTypes', 'InfantryTypes', 'VehicleTypes', 'AircraftTypes'];

const STYLE = `
.ab-root { position: fixed; inset: 0; display: flex; flex-direction: column; background: #0b0e11; color: #c8d2da; font: 13px/1.5 system-ui, 'PingFang SC', sans-serif; }
.ab-top { padding: 10px 14px; border-bottom: 1px solid #1d2730; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ab-top h1 { font-size: 15px; margin: 0; color: #e8eef2; }
.ab-top a { color: #6db3e8; text-decoration: none; }
.ab-body { flex: 1; display: flex; min-height: 0; }
.ab-list { width: 340px; overflow: auto; border-right: 1px solid #1d2730; padding: 8px 0; }
.ab-mix { padding: 6px 14px 2px; font-weight: 600; color: #9fd29f; position: sticky; top: 0; background: #0b0e11; }
.ab-entry { padding: 2px 14px 2px 24px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
.ab-entry:hover { background: #14202b; }
.ab-entry.sel { background: #1b3043; color: #fff; }
.ab-entry .size { color: #5f6c76; font-size: 11px; }
.ab-entry .unknown { color: #8a6d3b; }
.ab-preview { flex: 1; overflow: auto; padding: 14px; }
.ab-preview canvas { image-rendering: pixelated; background: #15191d; border: 1px solid #232c34; margin: 2px; }
.ab-preview pre { font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; word-break: break-all; }
.ab-preview table { border-collapse: collapse; font-size: 12px; }
.ab-preview td, .ab-preview th { border: 1px solid #232c34; padding: 2px 8px; text-align: left; }
.ab-empty { max-width: 560px; margin: 60px auto; line-height: 1.9; }
.ab-empty code { background: #18222b; padding: 1px 6px; border-radius: 4px; }
.ab-swatch { display: inline-block; width: 22px; height: 22px; margin: 1px; border: 1px solid #000; }
.ab-msg { color: #8a97a0; }
select.ab-pal { background: #14202b; color: #c8d2da; border: 1px solid #2a3a48; border-radius: 4px; padding: 2px 6px; }
@media (max-width: 700px) {
  .ab-body { flex-direction: column; }
  .ab-list { width: 100%; height: 38%; flex: none; border-right: none; border-bottom: 1px solid #1d2730; }
  .ab-empty { margin: 24px 12px; }
}
`;

interface ListedEntry {
  mount: MountedMix;
  id: number;
  size: number;
  name?: string;
}

export async function renderAssetBrowser(root: HTMLElement): Promise<void> {
  document.title = '资源浏览器 — 网页版红警2';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  root.innerHTML = `
    <div class="ab-root">
      <div class="ab-top">
        <h1>资源浏览器</h1>
        <span class="ab-msg" id="ab-status">挂载中…</span>
        <span style="flex:1"></span>
        <label class="ab-msg">SHP 调色板 <select class="ab-pal" id="ab-pal"></select></label>
        <a href="#">← 返回首页</a>
      </div>
      <div class="ab-body">
        <div class="ab-list" id="ab-list"></div>
        <div class="ab-preview" id="ab-preview"></div>
      </div>
    </div>`;

  const statusEl = root.querySelector('#ab-status') as HTMLElement;
  const listEl = root.querySelector('#ab-list') as HTMLElement;
  const previewEl = root.querySelector('#ab-preview') as HTMLElement;
  const palSelect = root.querySelector('#ab-pal') as HTMLSelectElement;

  const fs = new ResourceFS();
  const errors: string[] = [];
  for (const name of ROOT_MIXES) {
    try {
      await fs.mountUrl(`/game-data/${name}`, name);
    } catch {
      errors.push(name);
    }
  }

  if (fs.mounts.length === 0) {
    previewEl.innerHTML = `
      <div class="ab-empty">
        <h2>未找到游戏文件</h2>
        <p>资源浏览器需要你自备的红警2原版文件。请按 <code>game-data/README.md</code> 的说明，
        把 <code>ra2.mix</code>、<code>language.mix</code>、<code>multi.mix</code> 等文件拷入仓库的
        <code>game-data/</code> 目录，然后运行 <code>pnpm check-assets</code> 校验，刷新本页即可。</p>
        <p>获取途径：Steam / EA App 购买《Command &amp; Conquer The Ultimate Collection》。</p>
      </div>`;
    statusEl.textContent = '未挂载任何 mix';
    return;
  }

  // 递归挂载已知子 mix（ra2.mix 内套 cache/local/conquer 等）
  for (let i = 0; i < fs.mounts.length; i++) {
    const mount = fs.mounts[i]!;
    for (const child of KNOWN_CHILD_MIXES) {
      try {
        await fs.mountChild(mount, child);
      } catch {
        // 子 mix 打不开（不存在或非 mix）则跳过
      }
    }
  }

  // 名字字典：静态名单 + rules.ini 推导
  const nameById = new Map<number, string>();
  const addNames = (names: string[]) => {
    for (const n of names) nameById.set(mixIdRA2(n), n.toLowerCase());
  };
  addNames(KNOWN_LOOSE_NAMES);
  addNames(KNOWN_CHILD_MIXES);
  try {
    const rules = IniFile.fromBytes(await fs.readFile('rules.ini'));
    const typeNames: string[] = [];
    for (const sec of RULES_TYPE_SECTIONS) {
      typeNames.push(...(rules.getSection(sec)?.values() ?? []));
    }
    addNames(deriveNamesFromRules(typeNames));
    statusEl.textContent = `已挂载 ${fs.mounts.length} 个 mix · rules.ini 解析成功（${typeNames.length} 个单位类型）`;
  } catch {
    statusEl.textContent = `已挂载 ${fs.mounts.length} 个 mix${errors.length ? ` · 缺失: ${errors.join(', ')}` : ''}`;
  }

  // 调色板选择
  const palNames = ['unittem.pal', 'isotem.pal', 'cameo.pal', 'anim.pal', 'palette.pal', 'temperat.pal'];
  const pals = new Map<string, Palette>();
  for (const p of palNames) {
    try {
      pals.set(p, Palette.parse(await fs.readFile(p)));
    } catch {
      // 缺失则不提供
    }
  }
  for (const p of pals.keys()) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    palSelect.appendChild(opt);
  }

  // 条目列表
  const allEntries: ListedEntry[] = [];
  for (const mount of fs.mounts) {
    const head = document.createElement('div');
    head.className = 'ab-mix';
    head.textContent = `📦 ${mount.path}（${mount.mix.fileCount} 个文件）`;
    listEl.appendChild(head);

    const sorted = [...mount.mix.entries.values()].map((e) => ({
      mount,
      id: e.id,
      size: e.size,
      name: nameById.get(e.id),
    }));
    sorted.sort((a, b) => (a.name ?? 'zzz').localeCompare(b.name ?? 'zzz') || a.id - b.id);

    for (const item of sorted) {
      const el = document.createElement('div');
      el.className = 'ab-entry';
      const label = item.name ?? `#${item.id.toString(16).padStart(8, '0')}`;
      el.innerHTML = `<span class="${item.name ? '' : 'unknown'}">${label}</span><span class="size">${formatSize(item.size)}</span>`;
      el.addEventListener('click', () => {
        listEl.querySelector('.sel')?.classList.remove('sel');
        el.classList.add('sel');
        void preview(item);
      });
      listEl.appendChild(el);
      allEntries.push(item);
    }
  }

  async function preview(item: ListedEntry): Promise<void> {
    previewEl.innerHTML = `<p class="ab-msg">读取中…</p>`;
    try {
      const bytes = await item.mount.mix.readFile(item.id);
      const name = item.name ?? '';
      const sniff = name === '' ? sniffKind(bytes) : 'unknown';
      if (name.endsWith('.pal') || sniff === 'pal') {
        renderPal(bytes);
      } else if (name.endsWith('.shp') || sniff === 'shp') {
        renderShp(bytes, name || `#${item.id.toString(16)}`);
      } else if (name.endsWith('.ini')) {
        previewEl.innerHTML = '';
        const pre = document.createElement('pre');
        pre.textContent = new TextDecoder('latin1').decode(bytes.subarray(0, 200_000));
        previewEl.appendChild(pre);
      } else if (name.endsWith('.csf')) {
        renderCsf(bytes);
      } else {
        renderHex(bytes, name || `#${item.id.toString(16)}`);
      }
    } catch (err) {
      previewEl.innerHTML = `<p class="ab-msg">预览失败：${String(err)}</p>`;
    }
  }

  function renderPal(bytes: Uint8Array): void {
    const pal = Palette.parse(bytes);
    previewEl.innerHTML = '<h3>调色板（256 色，16–31 为玩家变色区）</h3>';
    const wrap = document.createElement('div');
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = pal.color(i);
      const sw = document.createElement('span');
      sw.className = 'ab-swatch';
      sw.style.background = `rgb(${r},${g},${b})`;
      sw.title = `#${i}: rgb(${r},${g},${b})`;
      wrap.appendChild(sw);
      if (i % 16 === 15) wrap.appendChild(document.createElement('br'));
    }
    previewEl.appendChild(wrap);
  }

  function renderShp(bytes: Uint8Array, name: string): void {
    const shp = parseShp(bytes);
    const pal = pals.get(palSelect.value) ?? [...pals.values()][0];
    previewEl.innerHTML = `<h3>${name} — ${shp.frames.length} 帧，画布 ${shp.width}×${shp.height}</h3>`;
    if (!pal) {
      previewEl.insertAdjacentHTML('beforeend', '<p class="ab-msg">无可用调色板</p>');
      return;
    }
    const maxFrames = Math.min(shp.frames.length, 64);
    for (let i = 0; i < maxFrames; i++) {
      const f = shp.frames[i]!;
      if (f.pixels.length === 0) continue;
      const canvas = document.createElement('canvas');
      canvas.width = f.width;
      canvas.height = f.height;
      canvas.style.width = `${f.width * 2}px`;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(f.width, f.height);
      for (let p = 0; p < f.pixels.length; p++) {
        const idx = f.pixels[p]!;
        if (idx === 0) continue; // 透明
        img.data[p * 4] = pal.rgba[idx * 4]!;
        img.data[p * 4 + 1] = pal.rgba[idx * 4 + 1]!;
        img.data[p * 4 + 2] = pal.rgba[idx * 4 + 2]!;
        img.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      canvas.title = `帧 ${i}`;
      previewEl.appendChild(canvas);
    }
    if (shp.frames.length > maxFrames) {
      previewEl.insertAdjacentHTML('beforeend', `<p class="ab-msg">（仅显示前 ${maxFrames} 帧）</p>`);
    }
  }

  function renderCsf(bytes: Uint8Array): void {
    const csf = parseCsf(bytes);
    previewEl.innerHTML = `<h3>字符串表 — ${csf.strings.size} 条</h3>`;
    const table = document.createElement('table');
    table.innerHTML = '<tr><th>标签</th><th>文本</th></tr>';
    let count = 0;
    for (const [k, v] of csf.strings) {
      if (count++ >= 500) break;
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = k;
      const td2 = document.createElement('td');
      td2.textContent = v;
      tr.append(td1, td2);
      table.appendChild(tr);
    }
    previewEl.appendChild(table);
    if (csf.strings.size > 500) {
      previewEl.insertAdjacentHTML('beforeend', '<p class="ab-msg">（仅显示前 500 条）</p>');
    }
  }

  function renderHex(bytes: Uint8Array, name: string): void {
    const n = Math.min(bytes.length, 512);
    let dump = '';
    for (let o = 0; o < n; o += 16) {
      const row = [...bytes.subarray(o, o + 16)];
      const hexPart = row.map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
      dump += `${o.toString(16).padStart(6, '0')}  ${hexPart.padEnd(47)}  ${ascii}\n`;
    }
    previewEl.innerHTML = `<h3>${name} — ${formatSize(bytes.length)}</h3>`;
    const pre = document.createElement('pre');
    pre.textContent = dump + (bytes.length > n ? '…' : '');
    previewEl.appendChild(pre);
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}
