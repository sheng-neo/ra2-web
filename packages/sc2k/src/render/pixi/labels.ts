// ===== render/pixi/labels.ts =====（ARCHITECTURE §6.9 DOM 标牌层；spec:file-formats §2.2.8 XLAB）
// 标牌文字是绝对定位的 DOM 元素（不烧进精灵）：位置 = 项锚点（底顶点 c11'）的地图像素 + 相机偏移，文字浮在地块上方；
// 相机变化时批量重排（≤ 50 + 连接牌）。文本来自 XLAB（25 B Pascal 串：len + ≤ 24 字节 ASCII，首个 0 截断）。
import type { LabelSpec } from './tree';

export const XLAB_ENTRY_BYTES = 25;
export const XLAB_MAX_CHARS = 24;
export const CONNECTION_LABEL_INDEX = 0xfa;

/** 解码一条 XLAB：越界 / 空 → ''。 */
export function decodeLabel(xlab: Uint8Array, index: number): string {
  const off = index * XLAB_ENTRY_BYTES;
  if (index < 0 || off + XLAB_ENTRY_BYTES > xlab.length) return '';
  const len = Math.min(xlab[off]!, XLAB_MAX_CHARS);
  let s = '';
  for (let k = 0; k < len; k++) {
    const c = xlab[off + 1 + k]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
/** 标牌格的文字：xtxt 0x01..0x32 → XLAB[xtxt]；0xFA → XLAB[0xFA]；其余 ''。 */
export function labelTextOf(layers: { xtxt: Uint8Array; xlab: Uint8Array }, tile: number): string {
  const v = layers.xtxt[tile]!;
  if ((v >= 0x01 && v <= 0x32) || v === CONNECTION_LABEL_INDEX) return decodeLabel(layers.xlab, v);
  return '';
}

export interface LabelLayer {
  readonly element: HTMLElement; readonly count: number;
  set(specs: readonly LabelSpec[], textOf: (spec: LabelSpec) => string): void;
  reposition(camX: number, camY: number, tileH: number): void;
  setVisible(v: boolean): void;
  destroy(): void;
}

interface LabelNode { el: HTMLDivElement; x: number; y: number }

export function createLabelLayer(host: HTMLElement): LabelLayer {
  const element = document.createElement('div');
  element.dataset['sc2k'] = 'labels';
  Object.assign(element.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '2' } as Partial<CSSStyleDeclaration>);
  host.appendChild(element);
  let nodes: LabelNode[] = [];
  let cam = { x: 0, y: 0, tileH: 16 };
  const place = (n: LabelNode): void => {
    n.el.style.left = `${n.x + cam.x}px`;
    n.el.style.top = `${n.y + cam.y - cam.tileH}px`;
  };
  return {
    element,
    get count() { return nodes.length; },
    set(specs, textOf) {
      const next: LabelNode[] = [];
      let k = 0;
      for (const s of specs) {
        const text = textOf(s);
        if (!text) continue;
        let n = nodes[k++];
        if (!n) {
          const el = document.createElement('div');
          el.className = 'sc2k-label';
          Object.assign(el.style, {
            position: 'absolute', transform: 'translate(-50%, -100%)', whiteSpace: 'nowrap', font: '11px/1.2 var(--font-ui, sans-serif)',
            padding: '1px 4px', border: '1px solid #303030', background: '#f4f1e6', color: '#202020', boxShadow: '1px 1px 0 #303030',
          } as Partial<CSSStyleDeclaration>);
          element.appendChild(el);
          n = { el, x: 0, y: 0 };
        }
        n.el.dataset['kind'] = s.kind;
        n.el.style.background = s.kind === 'connection' ? '#f0d690' : '#f4f1e6';
        if (n.el.textContent !== text) n.el.textContent = text;
        n.x = s.x; n.y = s.y;
        place(n);
        next.push(n);
      }
      for (; k < nodes.length; k++) nodes[k]!.el.remove();
      nodes = next;
    },
    reposition(camX, camY, tileH) {
      if (cam.x === camX && cam.y === camY && cam.tileH === tileH) return;
      cam = { x: camX, y: camY, tileH };
      for (const n of nodes) place(n);
    },
    setVisible(v) { element.style.display = v ? '' : 'none'; },
    destroy() { element.remove(); nodes = []; },
  };
}
