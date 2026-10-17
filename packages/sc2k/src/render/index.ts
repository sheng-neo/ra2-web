// ===== render/index.ts =====（WP11 出口；导出名与签名按 CONTRACTS §V RenderEntry）
// createRenderer = render/pixi 的深度带后端（WP11）；sceneCompiler / cpuCompositor 目前仍转发 WP0 桩——
// 集成者在 WP10 合并后把下面两行改为 `export { sceneCompiler } from './scene'` / `export { cpuCompositor } from './cpu'`，
// createRenderer 只针对 SceneCompiler / CpuCompositor 接口编程，无需其它改动。
import type { RendererApi } from '../contracts/rendererApi';
import type { RenderEntry } from '../contracts/shell';
import { stubSceneCompiler } from '../app/stubs/stubScene';
import { stubCpuCompositor } from '../app/stubs/stubCompositor';
import { createPixiRenderer } from './pixi';

export const sceneCompiler = stubSceneCompiler satisfies RenderEntry['sceneCompiler'];
export const cpuCompositor = stubCpuCompositor satisfies RenderEntry['cpuCompositor'];
export const createRenderer = ((): RendererApi => createPixiRenderer({ sceneCompiler, cpuCompositor })) satisfies RenderEntry['createRenderer'];
