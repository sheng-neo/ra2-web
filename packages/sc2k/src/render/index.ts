// ===== render/index.ts =====（render 出口；导出名与签名按 CONTRACTS §V RenderEntry）
// createRenderer = render/pixi 的深度带后端（WP11）；sceneCompiler / cpuCompositor = render/scene、render/cpu 的真实现（WP10）。
import type { RendererApi } from '../contracts/rendererApi';
import type { RenderEntry } from '../contracts/shell';
import { sceneCompiler as realSceneCompiler } from './scene';
import { cpuCompositor as realCpuCompositor } from './cpu';
import { createPixiRenderer } from './pixi';

export const sceneCompiler = realSceneCompiler satisfies RenderEntry['sceneCompiler'];
export const cpuCompositor = realCpuCompositor satisfies RenderEntry['cpuCompositor'];
export const createRenderer = ((): RendererApi => createPixiRenderer({ sceneCompiler, cpuCompositor })) satisfies RenderEntry['createRenderer'];
