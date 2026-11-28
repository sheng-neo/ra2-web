import { describe, expect, it } from 'vitest';
import { looksLikeGlsl, minifyGlslQuasi, minifyGlslQuasis } from './glsl-minify';

describe('构建期 GLSL 瘦身（R4 + R5 整合）', () => {
  it('只认 GLSL：着色器认得出来，界面文字、URL、普通模板字符串不碰', () => {
    expect(looksLikeGlsl('uniform float uTime;\nvoid main() { gl_FragColor = vec4(1.0); }')).toBe(true);
    expect(looksLikeGlsl('  vec3 c = vec3(0.2); float k = 1.0;')).toBe(true);
    expect(looksLikeGlsl('#define PI 3.14159;')).toBe(true);
    expect(looksLikeGlsl('鳴謝 / Credits：© OpenStreetMap contributors')).toBe(false);
    expect(looksLikeGlsl('https://portal.csdi.gov.hk/; see // notes')).toBe(false);
    expect(looksLikeGlsl('${a} float ${b}')).toBe(false);
  });

  it('删注释与行首尾空白、空行；行内空白与段首尾紧挨 ${…} 的空白不动', () => {
    const src = '\n  // 注释：中文\n  uniform float uA; // 行尾注释\n\n  /* 块\n 注释 */ vec3 f(vec3 c) {\n    return c * 2.0;   \n  }\n';
    expect(minifyGlslQuasi(src)).toBe('\nuniform float uA;\nvec3 f(vec3 c) {\nreturn c * 2.0;\n}\n');
    // 段首尾（紧挨插值）的空格保留：`uniform ${T} x`
    expect(minifyGlslQuasi('uniform ')).toBe('uniform ');
    expect(minifyGlslQuasi(' x;\n')).toBe(' x;\n');
  });

  it('注释接到 ${…} 里去（这一段没有换行）时原样留着；转义的 \\n 也算行尾；行注释里的 /* 不当块注释', () => {
    expect(minifyGlslQuasi('float a; // see ')).toBe('float a; // see ');
    expect(minifyGlslQuasi('float a; // x\\nfloat b;')).toBe('float a; \\nfloat b;');
    expect(minifyGlslQuasi('float a; // a /* b\nfloat c; // */\nfloat d;')).toBe('float a;\nfloat c;\nfloat d;');
    expect(minifyGlslQuasi('float a; /* 没有结尾')).toBe('float a; /* 没有结尾');
  });

  it('注释跨过 ${…}：状态带到下一段，注释到结尾为止原样留着（块注释里的 // 不会吃掉 */）', () => {
    // `/* a ${x} b // c */ float d;` → 第二段的 // 在块注释里，不是行注释
    expect(minifyGlslQuasis(['float a; /* a ', ' b // c */ float d; // e\nfloat f;'])).toEqual(['float a; /* a ', ' b // c */ float d;\nfloat f;']);
    // 行注释跨段：到换行为止原样，之后照常去注释
    expect(minifyGlslQuasis(['float a; // x ', ' y\n  float b; // z\n'])).toEqual(['float a; // x ', ' y\nfloat b;\n']);
    // 一段里没有结尾：整段原样，状态继续
    expect(minifyGlslQuasis(['/* a ', ' b ', ' c */ x;'])).toEqual(['/* a ', ' b ', ' c */ x;']);
    // 与逐段处理在没有跨段注释时结果相同
    const parts = ['\n  uniform float uA; // u\n  vec3 f(', ') { return c; }\n'];
    expect(minifyGlslQuasis(parts)).toEqual(parts.map(minifyGlslQuasi));
  });
});
