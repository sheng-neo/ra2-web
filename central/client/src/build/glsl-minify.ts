/**
 * 构建期 GLSL 瘦身（R4 + R5 整合，JS 预算 PLAN §7.1）：只给 vite.config.ts 的构建插件用，运行时代码不引用。
 *
 * 着色器写在 TS 模板字符串里，带大量中文注释（UTF-8 每字 3 字节）与缩进；产物里它们一个字节也不用。插件对
 * `src/` 下每个模块里「看起来是 GLSL」的模板字符串，逐个静态段（quasi 的 raw）调用 minifyGlslQuasi：
 * - 删块注释（换成一个空格，免得前后两个记号粘在一起）与行注释（只删到同一段里的换行为止；注释里夹着 `${…}`、
 *   这一段里没有换行的不动，保守）；
 * - 删每行行首 / 行尾的空白与空行。行内的空白一律不动（不改记号之间的间隔），段首 / 段尾紧挨 `${…}` 的空白也不动
 *   （`uniform ${T} x` 这类拼接要靠它隔开）；
 * - 不碰 three.js 自己的着色器块（node_modules 不处理；lighting.ts 按原文替换 three 的 CustomToneMapping 桩）。
 * 判断「是 GLSL」：模板的静态文本里同时有 GLSL 的类型 / 限定词（vec2–4、float、uniform、varying、void main……）与语句（`;`）。
 */

/** 模板字符串的静态文本是否像 GLSL（宁可漏判：漏判只是少省几个字节）。 */
export function looksLikeGlsl(text: string): boolean {
  if (!text.includes(';')) return false;
  const strong = /\b(?:void\s+main\s*\(|gl_(?:Position|FragColor|FragCoord|PointSize)\b|uniform\s+\w|varying\s+\w|precision\s+(?:high|medium|low)p\b)|#(?:include\s*<|define\s+\w)/;
  const typed = /\b(?:vec[234]|mat[234]|float|sampler2D(?:Array)?)\s+\w+\s*[=;(,)]/;
  return strong.test(text) || (typed.test(text) && /\b(?:vec[234]|float)\s*\(/.test(text));
}

/** 一个静态段（raw 文本）去注释与行首尾空白；结果仍是合法的模板字符串 raw 文本。 */
export function minifyGlslQuasi(raw: string): string {
  return minifyGlslQuasis([raw])[0]!;
}

type ScanState = 'code' | 'line' | 'block';

/**
 * 一个模板字符串的全部静态段（按顺序）一起处理：注释的状态跨段带着走（R4 + R5 整合复审修正）。注释跨过 `${…}` 时，
 * 前一段从注释开头起、后一段到注释结尾为止都原样留着——原来逐段独立扫描，后一段从「代码」状态开始，块注释里的 `//`
 * 会把注释的结尾 `*\/` 当成行注释删掉（源码里现在没有这种写法，这里防以后出错）。
 */
export function minifyGlslQuasis(raws: readonly string[]): string[] {
  let state: ScanState = 'code';
  return raws.map((raw) => {
    let s = '';
    let i = 0;
    // 上一段留下的注释：原样留到它结束
    if (state === 'line') {
      const nl = lineEnd(raw, 0);
      if (nl < 0) return raw;
      s += raw.slice(0, nl);
      i = nl;
      state = 'code';
    } else if (state === 'block') {
      const end = raw.indexOf('*/');
      if (end < 0) return raw;
      s += raw.slice(0, end + 2);
      i = end + 2;
      state = 'code';
    }
    // 从左到右扫：先遇到哪种注释就按哪种删（行注释里的「/*」不会被当成块注释的开头）
    while (i < raw.length) {
      if (raw.startsWith('//', i)) {
        const nl = lineEnd(raw, i);
        if (nl < 0) {
          s += raw.slice(i); // 注释接到 ${…} 里去了：原样留着，下一段接着当注释
          state = 'line';
          break;
        }
        i = nl;
      } else if (raw.startsWith('/*', i)) {
        const end = raw.indexOf('*/', i + 2);
        if (end < 0) {
          s += raw.slice(i);
          state = 'block';
          break;
        }
        s += ' ';
        i = end + 2;
      } else {
        s += raw[i++];
      }
    }
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n[ \t]+/g, '\n');
    s = s.replace(/\n{2,}/g, '\n');
    return s;
  });
}

/** 行尾：真的换行，或写成转义的「\n」（`a;\n${b}` 这种拼接），取先到的那个；没有返回 −1。 */
function lineEnd(raw: string, from: number): number {
  const real = raw.indexOf('\n', from);
  const esc = raw.indexOf('\\n', from);
  return real < 0 ? esc : esc < 0 ? real : Math.min(real, esc);
}
