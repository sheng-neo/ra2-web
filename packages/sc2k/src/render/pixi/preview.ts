// ===== render/pixi/preview.ts =====（ARCHITECTURE §6.5 previewLayer；spec:ui-art §3.9.1 previewOk / previewBad）
// 放置预览：PlacementPreview.tiles 每格一张 PreviewOk / PreviewBad 叠加菱形，锚点 = 该格基准海拔的底顶点 c11'；
// 单独容器置于两组根之上（不参与深度带），按 zKey 排序保证重叠时的画家序。
import { Container, Sprite, Texture } from 'pixi.js';
import type { PlacementPreview } from '../../contracts/commands';
import type { RenderSnapshot, SceneCompiler } from '../../contracts/render';
import { OverlayId, SceneLayer, ZOOM_TABLE, zKeyOf } from '../../contracts/render';
import { tileX, tileY } from '../../contracts/grid';
import { rotateTile } from '../../contracts/rotation';
import type { Atlas } from './atlas';

export interface PreviewLayer {
  readonly layer: Container; readonly count: number;
  set(p: PlacementPreview | null, snap: RenderSnapshot, compiler: SceneCompiler, atlas: Atlas): void;
  clear(): void; destroy(): void;
}

export function createPreviewLayer(): PreviewLayer {
  const layer = new Container({ label: 'preview' });
  const pool: Sprite[] = [];
  let count = 0;
  const clear = (): void => {
    for (const c of layer.removeChildren()) pool.push(c as Sprite);
    count = 0;
  };
  return {
    layer,
    get count() { return count; },
    set(p, snap, compiler, atlas) {
      clear();
      if (!p || p.tiles.length === 0) return;
      const z = ZOOM_TABLE[snap.view.zoom];
      const order = p.tiles.map((t) => {
        const [rx, ry] = rotateTile(tileX(t.i), tileY(t.i), snap.view.rotation);
        return { t, z: zKeyOf(rx + ry, rx, SceneLayer.Preview) };
      }).sort((a, b) => a.z - b.z);
      for (const { t } of order) {
        const x = tileX(t.i), y = tileY(t.i);
        const [sx, sy] = compiler.worldToScreen(snap, x, y, snap.layers.alt[t.i]!);
        const e = atlas.get({ kind: 'overlay', id: t.ok ? OverlayId.PreviewOk : OverlayId.PreviewBad }, snap.artScale);
        const s = pool.pop() ?? new Sprite(Texture.EMPTY);
        s.texture = e.texture;
        s.anchor.set(e.w > 0 ? e.anchorX / e.w : 0, e.h > 0 ? e.anchorY / e.h : 0);
        s.position.set(sx, sy + z.tileH);
        layer.addChild(s);
        count++;
      }
    },
    clear,
    destroy() { layer.destroy({ children: true }); pool.length = 0; count = 0; },
  };
}
