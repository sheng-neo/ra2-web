/**
 * 叠加层模块(RenderModule 'overlay')：血条 / 名字 / 等级 / 头顶状态图标 / 伤害·治疗·金币飘字(2D canvas，按设备像素比)，
 * 以及贴地的世界标记(指向环、锁定圈、塔的攻击范围与警示线，走特效层的贴花系统)。
 *
 * 接入：DEFAULT_MODULES 里放在 'fx' 模块之后。有 'fx' 模块时共用它的贴花系统与单位锚点；
 * 单独使用(没有 'fx')时会自建一套最小的特效底层，仍然可用。
 */
import * as THREE from 'three';
import type { GameEvent, GameState } from '../../core/types';
import type { FrameInfo, RenderContext, RenderModule } from '../engine/context';
import type { UnitAnchors } from '../fx/anchors';
import { FxKit } from '../fx/kit';
import { type AvoidRect, BarLayer, type Projector } from './bars';
import { FloaterLayer } from './floaters';
import { WorldMarks } from './marks';
import { IconCache, TextCache } from './sprites2d';

export interface OverlayModule extends RenderModule {
  /** 分别开关：血条与名字 / 飘字 / 世界标记(观战、截图、过场时用) */
  setVisible(part: 'bars' | 'floaters' | 'marks', on: boolean): void;
  /** 清空飘字与残影状态(重开对局) */
  reset(): void;
  /** 顶部界面占用的屏幕矩形(CSS 像素，相对视口)：压到上沿的宽血条避开它们。null = 用缺省布局估 */
  setAvoid(rects: AvoidRect[] | null): void;
}

interface KitHolder extends RenderModule {
  kit?: FxKit;
}

/** 叠加层自己的像素比上限：与 WebGL 画质档无关，低画质下文字也保持锐利 */
const MAX_DPR = 2;

export function createOverlayModule(ctx: RenderContext): OverlayModule {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
  ctx.overlayRoot.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas 不可用');

  let dpr = 1;
  let W = 1;
  let H = 1;
  const text = new TextCache(1);
  const icons = new IconCache(1);
  const bars = new BarLayer(text, icons);
  const floaters = new FloaterLayer(text, icons, 1);
  const show = { bars: true, floaters: true, marks: true };

  // 共用 'fx' 模块的底层；没有就自建
  const shared = ctx.getModule<KitHolder>('fx')?.kit;
  const ownKit = shared ? null : new FxKit(ctx);
  const kit = shared ?? (ownKit as FxKit);
  const marks = new WorldMarks(kit);
  const hook = (frame: FrameInfo): void => marks.update(frame);
  kit.hooks.push(hook);
  const onClear = (): void => marks.reset();
  kit.onClear.push(onClear);
  const anchors = (): UnitAnchors => kit.anchors;

  const resize = (): void => {
    W = Math.max(1, ctx.viewport.width);
    H = Math.max(1, ctx.viewport.height);
    dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    text.setDpr(dpr);
    icons.setDpr(dpr);
    floaters.setDpr(dpr);
  };
  resize();

  // 世界 → 屏幕(CSS 像素，相对容器左上角)。自己乘视图投影矩阵：不触发布局查询，也不分配对象
  const vp = new THREE.Matrix4();
  const project: Projector = (x, y, z, out) => {
    const e = vp.elements;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 0.05) return false;
    out.x = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W;
    out.y = (0.5 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5) * H;
    return true;
  };

  return {
    name: 'overlay',
    update(frame: FrameInfo): void {
      if (ownKit) {
        ownKit.begin(frame);
        ownKit.flush(frame);
      }
      if (W !== ctx.viewport.width || H !== ctx.viewport.height) resize();
      const cam = ctx.camera;
      vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      // 界面缩放：以 1280×720 为基准，小屏不小于 0.7，大屏不大于 1.4
      const s = Math.min(1.4, Math.max(0.7, Math.min(W / 1280, H / 720)));
      if (show.bars) bars.draw(g, frame, anchors(), project, W, H, s);
      if (show.floaters) floaters.draw(g, frame.dt, frame.state, anchors(), project, W, H, s);
    },
    handleEvents(events: GameEvent[], state: GameState): void {
      if (show.floaters) floaters.handle(events, state, anchors(), ctx.frame.playerTeam);
    },
    resize,
    setVisible(part, on): void {
      show[part] = on;
      if (part === 'marks') marks.enabled = on;
    },
    reset(): void {
      bars.reset();
      floaters.reset();
      marks.reset();
    },
    setAvoid(rects): void {
      if (!rects) {
        bars.avoid = null;
        return;
      }
      // 换算到渲染容器的坐标系(容器通常铺满视口，这里只是保险)
      const box = ctx.container.getBoundingClientRect();
      bars.avoid = rects.map((r) => ({ left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top }));
    },
    dispose(): void {
      const i = kit.hooks.indexOf(hook);
      if (i >= 0) kit.hooks.splice(i, 1);
      const j = kit.onClear.indexOf(onClear);
      if (j >= 0) kit.onClear.splice(j, 1);
      marks.dispose();
      ownKit?.dispose();
      canvas.remove();
    },
  };
}
