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
  return src.replace(/(^|[\s(,:])(-?(?:\d+\.?\d*|\.\d+))u(?![\w%])/g, (_m, pre: string, n: string) => `${pre}calc(var(--sf-u) * ${n})`);
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
