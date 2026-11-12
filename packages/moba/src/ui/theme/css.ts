/**
 * 样式注入工具。所有界面样式以 TS 字符串形式随 JS 一起打包（单文件构建天然内联），
 * 运行时注入到 <head>，不依赖打包器的 CSS 管线。
 */

/**
 * 设计单位 `u`：样式里写 `12u`，展开为 `calc(var(--sf-u) * 12)`。
 * `--sf-u` 是随视口缩放的「设计像素」（横屏以 1280×720 为基准，见 tokens.ts），
 * 这样整套界面从竖屏手机到 4K 桌面按同一比例缩放，又不必到处手写 calc。
 */
export function sfCss(src: string): string {
  return colorMixFallback(src).replace(/(^|[\s(,:])(-?(?:\d+\.?\d*|\.\d+))u(?![\w%])/g, (_m, pre: string, n: string) => `${pre}calc(var(--sf-u) * ${n})`);
}

/** 把一个值里的 color-mix(in srgb, A p%, B) 全部换成 A */
function stripColorMix(value: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = value.indexOf('color-mix(', i);
    if (at < 0) return out + value.slice(i);
    out += value.slice(i, at);
    let depth = 0;
    let end = at + 9;
    const commas: number[] = [];
    for (; end < value.length; end++) {
      const ch = value[end];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      } else if (ch === ',' && depth === 1) commas.push(end);
    }
    // 第一个逗号后到第二个逗号前是「颜色 A + 百分比」
    const first = commas.length >= 2 ? value.slice(commas[0] + 1, commas[1]).trim().replace(/\s+[\d.]+%$/, '') : 'currentColor';
    out += first;
    i = end + 1;
  }
}

/**
 * 给用到 color-mix() 的声明前面补一条不含 color-mix 的同名声明。
 * 不支持 color-mix 的旧浏览器会整条丢弃声明（连同里面的描边/阴影），有了兜底至少还有个近似的样子。
 */
function colorMixFallback(src: string): string {
  return src.replace(/([;{]\s*)([\w-]+)(\s*:\s*)([^;{}]*color-mix\([^;{}]*)/g, (_m, pre: string, prop: string, sep: string, value: string) => `${pre}${prop}${sep}${stripColorMix(value)}; ${prop}${sep}${value}`);
}

/** JS 里需要设计单位时用：u(12) → 'calc(var(--sf-u) * 12)' */
export const u = (n: number): string => `calc(var(--sf-u) * ${n})`;

/** 以 id 去重地注入一段样式；重复调用是无害的。 */
export function injectStyle(id: string, css: string): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/** 把 SVG 字符串转成可用于 CSS url() 的 data URI（无 base64，保持可读与体积）。 */
export function svgDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}")`;
}
