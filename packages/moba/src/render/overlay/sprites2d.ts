/**
 * 叠加层的 2D 小素材：文字精灵缓存、飘字用的数字字形条、头顶状态图标。
 * 全部按设备像素比预渲染到离屏 canvas，逐帧只做 drawImage(逐帧 fillText 在手机上很慢，而且描边文字会糊)。
 */

export const FONT_UI = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif';
export const FONT_NUM = '"Trebuchet MS","Arial Black","Helvetica Neue",Arial,sans-serif';

export interface Sprite2D {
  canvas: HTMLCanvasElement;
  /** CSS 像素尺寸 */
  w: number;
  h: number;
}

function makeCanvas(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas 不可用');
  g.scale(dpr, dpr);
  return [c, g];
}

/** 带描边的单行文字精灵，按 (文字, 字号, 颜色) 缓存 */
export class TextCache {
  private map = new Map<string, Sprite2D>();
  private dpr: number;
  constructor(dpr: number) {
    this.dpr = dpr;
  }

  setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.map.clear();
  }

  get(text: string, size: number, fill: string, stroke: string, weight = 700, font = FONT_UI): Sprite2D {
    const key = `${text}|${size}|${fill}|${stroke}|${weight}|${font === FONT_UI ? 0 : 1}`;
    let s = this.map.get(key);
    if (s) return s;
    // 名字/等级的种类有限；万一被灌入大量不同字符串，整表清掉重来
    if (this.map.size > 400) this.map.clear();
    const fontStr = `${weight} ${size}px ${font}`;
    const [probe, pg] = makeCanvas(4, 4, 1);
    pg.font = fontStr;
    const tw = Math.ceil(pg.measureText(text).width);
    probe.width = 0;
    const pad = Math.ceil(size * 0.22) + 2;
    const w = tw + pad * 2;
    const h = Math.ceil(size * 1.3) + pad;
    const [canvas, g] = makeCanvas(w, h, this.dpr);
    g.font = fontStr;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, size * 0.24);
    g.strokeStyle = stroke;
    g.strokeText(text, w / 2, h / 2 + 0.5);
    g.fillStyle = fill;
    g.fillText(text, w / 2, h / 2 + 0.5);
    s = { canvas, w, h };
    this.map.set(key, s);
    return s;
  }
}

export interface GlyphStyle {
  size: number;
  /** 上下渐变填充 */
  top: string;
  bottom: string;
  stroke: string;
  italic?: boolean;
}

const GLYPHS = '0123456789+-!';

/** 一种飘字样式的字形条：数字逐个 drawImage，任何数值都不需要新建精灵 */
export class GlyphStrip {
  readonly canvas: HTMLCanvasElement;
  readonly cell: number;
  readonly height: number;
  readonly advance: number[] = [];
  private dpr: number;

  constructor(st: GlyphStyle, dpr: number) {
    this.dpr = dpr;
    const font = `${st.italic ? 'italic ' : ''}900 ${st.size}px ${FONT_NUM}`;
    const pad = Math.ceil(st.size * 0.2) + 2;
    const [probe, pg] = makeCanvas(4, 4, 1);
    pg.font = font;
    let maxW = 0;
    for (const ch of GLYPHS) {
      const w = pg.measureText(ch).width;
      this.advance.push(w * 0.92);
      if (w > maxW) maxW = w;
    }
    probe.width = 0;
    this.cell = Math.ceil(maxW) + pad * 2;
    this.height = Math.ceil(st.size * 1.25) + pad;
    const [canvas, g] = makeCanvas(this.cell * GLYPHS.length, this.height, dpr);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const grad = g.createLinearGradient(0, this.height * 0.15, 0, this.height * 0.85);
    grad.addColorStop(0, st.top);
    grad.addColorStop(1, st.bottom);
    for (let i = 0; i < GLYPHS.length; i++) {
      const cx = i * this.cell + this.cell / 2;
      const cy = this.height / 2 + 0.5;
      // 外层深色粗描边 + 底部一像素的投影，亮地面上也清楚
      g.lineWidth = Math.max(3, st.size * 0.26);
      g.strokeStyle = 'rgba(8,10,20,0.9)';
      g.strokeText(GLYPHS[i], cx, cy + 1);
      g.lineWidth = Math.max(2, st.size * 0.14);
      g.strokeStyle = st.stroke;
      g.strokeText(GLYPHS[i], cx, cy);
      g.fillStyle = grad;
      g.fillText(GLYPHS[i], cx, cy);
    }
    this.canvas = canvas;
  }

  /** 文本宽度(CSS 像素，scale = 1) */
  measure(text: string): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      const k = GLYPHS.indexOf(text[i]);
      if (k >= 0) w += this.advance[k];
    }
    return w;
  }

  /** 以 (cx, cy) 为中心画一串字形 */
  draw(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, scale: number): void {
    const total = this.measure(text) * scale;
    let x = cx - total / 2;
    const d = this.dpr;
    const ch = this.height * scale;
    const cw = this.cell * scale;
    for (let i = 0; i < text.length; i++) {
      const k = GLYPHS.indexOf(text[i]);
      if (k < 0) continue;
      const adv = this.advance[k] * scale;
      g.drawImage(this.canvas, k * this.cell * d, 0, this.cell * d, this.height * d, x + adv / 2 - cw / 2, cy - ch / 2, cw, ch);
      x += adv;
    }
  }
}

// ───────────── 头顶状态图标 ─────────────

export type IconId = 'stun' | 'airborne' | 'root' | 'silence' | 'slow' | 'burn' | 'mark' | 'focus' | 'gale' | 'ghost' | 'lock' | 'coin';

const ICON_SIZE = 16;

function star(g: CanvasRenderingContext2D, cx: number, cy: number, n: number, r0: number, r1: number, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? r0 : r1;
    if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

const ICONS: Record<IconId, (g: CanvasRenderingContext2D) => void> = {
  stun(g) {
    g.fillStyle = '#ffd84a';
    g.strokeStyle = '#5a3a00';
    g.lineWidth = 1.2;
    star(g, 8, 8.4, 5, 7, 3.1);
    g.fill();
    g.stroke();
  },
  airborne(g) {
    g.fillStyle = '#dff3ff';
    g.strokeStyle = '#1c3a66';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(8, 1.5);
    g.lineTo(14, 8);
    g.lineTo(10.4, 8);
    g.lineTo(10.4, 14.5);
    g.lineTo(5.6, 14.5);
    g.lineTo(5.6, 8);
    g.lineTo(2, 8);
    g.closePath();
    g.fill();
    g.stroke();
  },
  root(g) {
    // 三根岩晶
    g.strokeStyle = '#4a3410';
    g.lineWidth = 1.1;
    for (const [x, h, c] of [[4, 8, '#c89a4a'], [8, 12, '#ffcf70'], [12, 7, '#c89a4a']] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(x - 2.6, 14.5);
      g.lineTo(x, 14.5 - h);
      g.lineTo(x + 2.6, 14.5);
      g.closePath();
      g.fill();
      g.stroke();
    }
  },
  silence(g) {
    g.strokeStyle = '#d8b4ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(8, 8, 5.6, 0, Math.PI * 2);
    g.moveTo(4.2, 4.2);
    g.lineTo(11.8, 11.8);
    g.stroke();
  },
  slow(g) {
    g.strokeStyle = '#9fe0ff';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4);
      g.lineTo(8 - Math.cos(a) * 6.4, 8 - Math.sin(a) * 6.4);
    }
    g.stroke();
  },
  burn(g) {
    g.fillStyle = '#ff7a2a';
    g.strokeStyle = '#6a1a00';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(8, 1.5);
    g.quadraticCurveTo(14.5, 8, 11.5, 13);
    g.quadraticCurveTo(8, 16, 4.5, 13);
    g.quadraticCurveTo(1.8, 8.5, 6, 5.5);
    g.quadraticCurveTo(6.5, 8, 8, 8);
    g.quadraticCurveTo(9.5, 5, 8, 1.5);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffd86a';
    g.beginPath();
    g.ellipse(8, 11.5, 2.2, 2.8, 0, 0, Math.PI * 2);
    g.fill();
  },
  mark(g) {
    g.fillStyle = '#bfeeff';
    g.strokeStyle = '#1a3c8a';
    g.lineWidth = 1.2;
    star(g, 8, 8, 4, 7.2, 2.6);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(8, 8, 1.6, 0, Math.PI * 2);
    g.fill();
  },
  focus(g) {
    g.strokeStyle = '#ff4a38';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(8, 8, 5, 0, Math.PI * 2);
    g.moveTo(8, 0.8);
    g.lineTo(8, 4.6);
    g.moveTo(8, 11.4);
    g.lineTo(8, 15.2);
    g.moveTo(0.8, 8);
    g.lineTo(4.6, 8);
    g.moveTo(11.4, 8);
    g.lineTo(15.2, 8);
    g.stroke();
    g.fillStyle = '#ff4a38';
    g.beginPath();
    g.arc(8, 8, 1.5, 0, Math.PI * 2);
    g.fill();
  },
  gale(g) {
    g.fillStyle = '#9dffd8';
    g.strokeStyle = '#0f5a44';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(1.5, 10);
    g.quadraticCurveTo(7, 0.5, 14.5, 5);
    g.quadraticCurveTo(8, 7.5, 1.5, 10);
    g.fill();
    g.stroke();
    g.strokeStyle = '#9dffd8';
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(3, 13.5);
    g.lineTo(12, 11.5);
    g.stroke();
  },
  ghost(g) {
    g.fillStyle = 'rgba(190,150,255,0.9)';
    g.strokeStyle = '#2a1460';
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(8, 7, 5.2, Math.PI, 0);
    g.lineTo(13.2, 14);
    g.lineTo(10.6, 12);
    g.lineTo(8, 14);
    g.lineTo(5.4, 12);
    g.lineTo(2.8, 14);
    g.closePath();
    g.fill();
    g.stroke();
  },
  lock(g) {
    g.strokeStyle = '#e8e2cc';
    g.fillStyle = '#e8e2cc';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(8, 6.2, 3.2, Math.PI, 0);
    g.stroke();
    g.fillRect(3.6, 6.6, 8.8, 7.4);
  },
  coin(g) {
    g.fillStyle = '#ffd84a';
    g.strokeStyle = '#7a4a00';
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(8, 8, 6.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff4b8';
    star(g, 8, 8, 4, 3.8, 1.5);
    g.fill();
  },
};

export class IconCache {
  private map = new Map<IconId, HTMLCanvasElement>();
  private dpr: number;
  constructor(dpr: number) {
    this.dpr = dpr;
  }

  setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.map.clear();
  }

  /** 以 (cx, cy) 为中心画一个图标，size 为边长(CSS 像素) */
  draw(g: CanvasRenderingContext2D, id: IconId, cx: number, cy: number, size: number): void {
    let c = this.map.get(id);
    if (!c) {
      // 按 2× 目标尺寸预渲染：缩放后仍然锐利
      const k = this.dpr * 2;
      const [canvas, cg] = makeCanvas(ICON_SIZE, ICON_SIZE, k);
      ICONS[id](cg);
      c = canvas;
      this.map.set(id, c);
    }
    g.drawImage(c, cx - size / 2, cy - size / 2, size, size);
  }
}
