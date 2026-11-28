/**
 * R4 雨篷（电车走廊高清街面层）：照片模型里伸出外墙的近水平板（Building.hires.c，见 schema BuildingHires）→ 一个合并网格。
 *
 * - 每块雨篷：薄板（顶、底）、檐口板（外面、内面、顶边）、两端各两块端面，共 18 个三角形；全城一个 draw call（HIGH 档才建）。
 * - 颜色：顶 / 底 / 檐口三色来自照片（烘焙时取样，sRGB → 线性）。夜景按光照契约：表面 = 反照率 × 城市环境照度；
 *   底面是一片亮的天花（Y 约 0.25–0.31）与每 1.0–1.5 m 一盏的筒灯（灯点 3.0，过 bloom 阈值；深的雨篷两排），檐口有一条很淡的反光。
 * - 复审修正：不再是 0.8–1.2 m 厚的实心盒，而是 0.2 m 的薄板 + 外沿一块檐口板（高 = 记录的厚度：照片里檐口那几行，烘焙时已对齐）。
 * - 敏感区里的雨篷管线已丢掉（citymap stages/hires.ts validCanopy）。
 * - 檐口贴照片：照片投影时取的是「最外面的面」，雨篷檐口那几行墙面照片拍的就是檐口本身（常有招牌）。檐口四个角带上同一面墙的
 *   aHires（buildings.ts canopyFascia 按墙边算），高清页在池里时檐口画照片、招牌按自己的颜色发光（与楼的高清层同一套页与查表）。
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Sphere, Vector3, type IUniform } from 'three';
import { simToThree } from '../../coords';
import { GLSL_CITY_LIGHT, GLSL_FINISH, GLSL_HAZE, GLSL_SHARED_PARS, lightColour, sharedUniforms, streetWarmth } from '../materials/lighting';
import { GLSL_HASH } from '../materials/common';

/** 雨篷记录：[x0, y0, x1, y1（dm）, 伸出 dm, 顶面高程 dm, 厚 cm, 顶色, 底色, 檐口色]。 */
export type CanopyRecord = readonly number[];

/** 逐顶点 aHires：(s, t, 高清页号, 密度)；页号 −1 = 没有照片。 */
export type CanopyHires = readonly [number, number, number, number];
const NO_HI: CanopyHires = [0, 0, -1, 0];

/** 一块雨篷：记录 + 檐口四角的 aHires（顺序：下沿 x0 端、下沿 x1 端、上沿 x1 端、上沿 x0 端；没有时 null）。 */
export interface CanopyItem {
  rec: CanopyRecord;
  fascia?: readonly [CanopyHires, CanopyHires, CanopyHires, CanopyHires] | null;
  /** 楼的墙脚地面（mPD 米；R4 整合：铺面光源 I-1 算雨篷底离地用）。 */
  groundM?: number;
}

/** 雨篷檐口板的高（dm，= 记录的厚度，夹在 0.25–1.4 m）；雨篷底 = 顶 − 它（canopy-fit、buildings.canopyFascia 同一条）。 */
export function canopyThicknessDm(thCm: number): number {
  return Math.max(2.5, Math.min(14, thCm / 10));
}

/** 面的种类（aKind）：0 顶、1 底、2 檐口、3 端面。 */
const TOP = 0;
const UNDER = 1;
const FASCIA = 2;
const SIDE = 3;

function lin(rgb: number): [number, number, number] {
  const c = new Color().setHex(rgb); // three 把 sRGB 十六进制转成线性
  return [c.r, c.g, c.b];
}

/** 雨篷记录 → 顶点数组（three 坐标米）。纯函数（不建 three 对象），单元测试用。 */
export function canopyArrays(items: readonly (CanopyItem | CanopyRecord)[]): {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  attr: Float32Array;
  hires: Float32Array;
  index: Uint32Array;
} {
  const P: number[] = [];
  const N: number[] = [];
  const C: number[] = [];
  const A: number[] = [];
  const Hh: number[] = [];
  const I: number[] = [];
  const v3 = [0, 0, 0];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, col: [number, number, number], kind: number, a: number, b: number, warm: number, hi: CanopyHires = NO_HI) => {
    simToThree(x, y, z, v3, 0);
    P.push(v3[0]!, v3[1]!, v3[2]!);
    simToThree(nx, ny, nz, v3, 0, 1);
    N.push(v3[0]!, v3[1]!, v3[2]!);
    C.push(col[0], col[1], col[2]);
    A.push(kind, a, b, warm);
    Hh.push(hi[0], hi[1], hi[2], hi[3]);
    return P.length / 3 - 1;
  };
  for (const it of items) {
    const r = 'rec' in it ? it.rec : it;
    const fh = 'rec' in it ? (it.fascia ?? null) : null;
    if (r.length !== 10) continue;
    const [x0, y0, x1, y1, depth, zTop, thCm, top, under, fascia] = r as [number, number, number, number, number, number, number, number, number, number];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1 || depth <= 0) continue;
    const tx = (x1 - x0) / L;
    const ty = (y1 - y0) / L;
    // 外法线 = 边方向右手侧
    const nx = ty;
    const ny = -tx;
    // 复审修正：不再是 0.8–1.2 m 厚的实心盒——底下一块 0.2 m 的薄板（底面 = 雨篷底），外沿一块檐口板（高 = 记录的厚度，
    // 照片里檐口那几行；烘焙时已对齐），檐口板 0.08 m 厚、内侧与顶边另画；薄板顶面在檐口板后面
    const zt = zTop;
    const thDm = canopyThicknessDm(thCm);
    const zb = zTop - thDm;
    const slab = Math.min(2, thDm);
    const zs = zb + slab;
    const ft = Math.min(0.8, depth * 0.5);
    const ox = nx * depth;
    const oy = ny * depth;
    const ix = nx * (depth - ft);
    const iy = ny * (depth - ft);
    const ct = lin(top);
    const cu = lin(under);
    const cf = lin(fascia);
    const cfDark: [number, number, number] = [cf[0] * 0.6, cf[1] * 0.6, cf[2] * 0.6];
    const Lm = L / 10;
    const Dm = depth / 10;
    const warm = streetWarmth((x0 + x1) / 20, (y0 + y1) / 20, zb / 10);
    const quad = (a: number, b: number, c: number, d: number) => {
      I.push(a, b, c, a, c, d);
    };
    // 薄板顶面（朝上）：沿墙 0..L、向外 0..D − 檐口板厚
    quad(
      push(x0, y0, zs, 0, 0, 1, ct, TOP, 0, 0, warm),
      push(x0 + ix, y0 + iy, zs, 0, 0, 1, ct, TOP, 0, Dm, warm),
      push(x1 + ix, y1 + iy, zs, 0, 0, 1, ct, TOP, Lm, Dm, warm),
      push(x1, y1, zs, 0, 0, 1, ct, TOP, Lm, 0, warm),
    );
    // 底面（朝下，雨篷底：灯带与筒灯）
    quad(
      push(x0, y0, zb, 0, 0, -1, cu, UNDER, 0, 0, warm),
      push(x1, y1, zb, 0, 0, -1, cu, UNDER, Lm, 0, warm),
      push(x1 + ox, y1 + oy, zb, 0, 0, -1, cu, UNDER, Lm, Dm, warm),
      push(x0 + ox, y0 + oy, zb, 0, 0, -1, cu, UNDER, 0, Dm, warm),
    );
    // 檐口板外面（朝外）：有照片时四角带 aHires
    quad(
      push(x0 + ox, y0 + oy, zb, nx, ny, 0, cf, FASCIA, 0, 0, warm, fh?.[0]),
      push(x1 + ox, y1 + oy, zb, nx, ny, 0, cf, FASCIA, Lm, 0, warm, fh?.[1]),
      push(x1 + ox, y1 + oy, zt, nx, ny, 0, cf, FASCIA, Lm, (zt - zb) / 10, warm, fh?.[2]),
      push(x0 + ox, y0 + oy, zt, nx, ny, 0, cf, FASCIA, 0, (zt - zb) / 10, warm, fh?.[3]),
    );
    if (zt - zs > 0.5) {
      // 檐口板内侧（朝墙）与顶边
      quad(
        push(x1 + ix, y1 + iy, zs, -nx, -ny, 0, cfDark, SIDE, 0, 0, warm),
        push(x0 + ix, y0 + iy, zs, -nx, -ny, 0, cfDark, SIDE, Lm, 0, warm),
        push(x0 + ix, y0 + iy, zt, -nx, -ny, 0, cfDark, SIDE, Lm, 1, warm),
        push(x1 + ix, y1 + iy, zt, -nx, -ny, 0, cfDark, SIDE, 0, 1, warm),
      );
      quad(
        push(x0 + ix, y0 + iy, zt, 0, 0, 1, cf, TOP, 0, 0, warm),
        push(x0 + ox, y0 + oy, zt, 0, 0, 1, cf, TOP, 0, Dm, warm),
        push(x1 + ox, y1 + oy, zt, 0, 0, 1, cf, TOP, Lm, Dm, warm),
        push(x1 + ix, y1 + iy, zt, 0, 0, 1, cf, TOP, Lm, 0, warm),
      );
    }
    // 两端（朝 −t / +t）：薄板端面（zb..zs、离墙 0..D）+ 檐口板端面（zs..zt、离墙 D − 板厚..D）；顶点顺序同原来的端面
    quad(
      push(x0, y0, zb, -tx, -ty, 0, cf, SIDE, 0, 0, warm),
      push(x0 + ox, y0 + oy, zb, -tx, -ty, 0, cf, SIDE, Dm, 0, warm),
      push(x0 + ox, y0 + oy, zs, -tx, -ty, 0, cf, SIDE, Dm, 1, warm),
      push(x0, y0, zs, -tx, -ty, 0, cf, SIDE, 0, 1, warm),
    );
    quad(
      push(x1, y1, zb, tx, ty, 0, cf, SIDE, 0, 0, warm),
      push(x1, y1, zs, tx, ty, 0, cf, SIDE, 0, 1, warm),
      push(x1 + ox, y1 + oy, zs, tx, ty, 0, cf, SIDE, Dm, 1, warm),
      push(x1 + ox, y1 + oy, zb, tx, ty, 0, cf, SIDE, Dm, 0, warm),
    );
    if (zt - zs > 0.5) {
      quad(
        push(x0 + ix, y0 + iy, zs, -tx, -ty, 0, cf, SIDE, 0, 0, warm),
        push(x0 + ox, y0 + oy, zs, -tx, -ty, 0, cf, SIDE, Dm, 0, warm),
        push(x0 + ox, y0 + oy, zt, -tx, -ty, 0, cf, SIDE, Dm, 1, warm),
        push(x0 + ix, y0 + iy, zt, -tx, -ty, 0, cf, SIDE, 0, 1, warm),
      );
      quad(
        push(x1 + ix, y1 + iy, zs, tx, ty, 0, cf, SIDE, 0, 0, warm),
        push(x1 + ix, y1 + iy, zt, tx, ty, 0, cf, SIDE, 0, 1, warm),
        push(x1 + ox, y1 + oy, zt, tx, ty, 0, cf, SIDE, Dm, 1, warm),
        push(x1 + ox, y1 + oy, zs, tx, ty, 0, cf, SIDE, Dm, 0, warm),
      );
    }
  }
  return {
    position: Float32Array.from(P),
    normal: Float32Array.from(N),
    color: Float32Array.from(C),
    attr: Float32Array.from(A),
    hires: Float32Array.from(Hh),
    index: Uint32Array.from(I),
  };
}

const vertexShader = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aAttr;
attribute vec4 aHires;
varying vec3 vColor;
varying vec4 vAttr;
varying vec2 vHiUV;
flat varying float vHiPage;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vColor = aColor;
  vAttr = aAttr;
  vHiUV = aHires.xy;
  vHiPage = aHires.z;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_SHARED_PARS}
${GLSL_HAZE}
${GLSL_CITY_LIGHT}
${GLSL_HASH}
uniform vec3 uLampW;
uniform vec3 uLampC;
#ifdef HIRES
uniform highp sampler2DArray uPhotoNearCol;
uniform highp sampler2DArray uHiresAux;
uniform sampler2D uHiresSlots;
uniform vec4 uHiresInfo;
#endif
varying vec3 vColor;
varying vec4 vAttr;
varying vec2 vHiUV;
flat varying float vHiPage;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormalW);
  float kind = vAttr.x;
  float a = vAttr.y;
  float b = vAttr.z;
  float warm = vAttr.w;
  // 离地高度未知：雨篷都在 2.5–8 m，按 4 m 取街面反光
  vec3 amb = cityAmbient(n, 4.0, warm);
  vec3 surf = vColor * amb;
  vec3 emit = vec3(0.0);
  if (kind > 0.5 && kind < 1.5) {
    // 底面（复审修正，规格 H-P0-5）：一片亮的天花 Y 约 0.25–0.31（筒灯与铺面灯照亮）+ 每 1.0–1.5 m 一盏筒灯（灯点过 bloom 阈值）；
    // 深的雨篷两排。色温：金 / 古铜檐口下暖（约 3700 K），其余冷白；按雨篷一块一个
    float blk = hash12(floor(vWorld.xz * 0.05) + vec2(3.1, 7.7));
    float warmF = smoothstep(0.08, 0.2, vColor.r - vColor.b);
    vec3 lc = mix(uLampC, uLampW, max(warmF, step(blk, 0.35)));
    lc /= max(dot(lc, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float pitch = 1.0 + 0.5 * blk;
    float cell = floor(a / pitch);
    float h = hash12(vec2(cell, blk * 91.0));
    float du = (fract(a / pitch) - 0.5) * pitch;
    // 进深未知（b 是离墙米数），两排筒灯放在 0.7 m 与 1.9 m，浅雨篷只有第一排（第二排落在外沿以外就被裁掉）
    float r1 = length(vec2(du, b - 0.7));
    float r2 = length(vec2(du, b - 1.9));
    float w = fwidth(b) + 1e-3;
    float spot = max(1.0 - smoothstep(0.07 - w, 0.07 + w, r1), 1.0 - smoothstep(0.07 - w, 0.07 + w, r2));
    // 灯点四周一圈光晕（天花被筒灯照亮的亮斑）
    float halo = exp(-min(r1, r2) * min(r1, r2) / 0.06);
    surf = vColor * amb * 0.5;
    emit = lc * ((0.16 + 0.06 * blk) * (0.85 + 0.5 * halo) + spot * (h < 0.92 ? 3.0 : 0.0));
  } else if (kind > 1.5 && kind < 2.5) {
    // 檐口：被铺面灯光与街灯打亮一点
    surf += vColor * vec3(0.05, 0.045, 0.04);
#ifdef HIRES
    // 檐口照片（同一面墙的高清页）：照片反照率 × 照度；招牌按自己的颜色发光（契约灯箱 1.5–2.5）
    if (vHiPage > -0.5 && uHiresInfo.w > 0.5) {
      vec4 sl = texelFetch(uHiresSlots, ivec2(int(vHiPage + 0.5), 0), 0);
      if (sl.r < 0.999 && sl.g > 0.0) {
        vec4 c = texture(uPhotoNearCol, vec3(vHiUV, floor(sl.r * 255.0 + 0.5)));
        vec4 ax = texture(uHiresAux, vec3(vHiUV, floor(sl.b * 255.0 + 0.5)));
        float w = smoothstep(6.0, 20.0, c.a * 255.0) * sl.g;
        vec3 ps = c.rgb * (amb + vec3(0.05, 0.045, 0.04));
        // 复审修正：檐口整块常被认成招牌（金色 / 不锈钢板、整片色板），满亮度时整条檐口成了发光的黄块——檐口上的字按照片颜色亮，
        // 整体封顶在 Y 0.7（白灯箱仍过 bloom 阈值的一半左右；真正的灯箱字由楼墙上的同一张照片发光）
        vec3 E = c.rgb * 2.6;
        E *= min(1.0, 0.7 / max(dot(E, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
        surf = mix(surf, ps, w);
        emit = mix(emit, E, w * smoothstep(0.3, 0.8, ax.b));
      }
    }
#endif
  }
  vec3 col = applyHaze(surf, emit, vWorld);
  ${GLSL_FINISH}
}
`;

/**
 * 雨篷网格（没有雨篷时 null）。photo：真实贴面流式加载器的 uniform（facades/streamer.ts）与是否有高清层；
 * 有高清层时檐口按 aHires 贴照片（同一套近景池与辅助图）。
 */
export function buildCanopies(items: readonly (CanopyItem | CanopyRecord)[], photo?: { uniforms: Record<string, IUniform>; hires: boolean }): Mesh | null {
  const arr = canopyArrays(items);
  if (arr.index.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(arr.position, 3));
  g.setAttribute('normal', new BufferAttribute(arr.normal, 3));
  g.setAttribute('aColor', new BufferAttribute(arr.color, 3));
  g.setAttribute('aAttr', new BufferAttribute(arr.attr, 4));
  g.setAttribute('aHires', new BufferAttribute(arr.hires, 4));
  g.setIndex(new BufferAttribute(arr.index, 1));
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.boundingSphere = new Sphere(bb.getCenter(new Vector3()), bb.getSize(new Vector3()).length() / 2);
  const hi = !!photo?.hires;
  const u = photo?.uniforms;
  const mat = new ShaderMaterial({
    uniforms: {
      ...sharedUniforms(),
      uLampW: { value: lightColour('shopWarm') },
      uLampC: { value: lightColour('ledWhite') },
      // 与建筑材质共用同一批 uniform 对象（按引用：页上传、淡入都同步）
      ...(hi && u ? { uPhotoNearCol: u.uPhotoNearCol!, uHiresAux: u.uHiresAux!, uHiresSlots: u.uHiresSlots!, uHiresInfo: u.uHiresInfo! } : {}),
    },
    vertexShader,
    fragmentShader,
    defines: hi ? { HIRES: 1 } : {},
  });
  const mesh = new Mesh(g, mat);
  mesh.name = 'canopies';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
