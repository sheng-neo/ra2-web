// ===== render/index.ts =====（WP0 转发桩 → WP11 接手；导出名与签名按 CONTRACTS §V RenderEntry）
// createRenderer = stubRenderer（CPU 合成到 <canvas>）、sceneCompiler = stubScene、cpuCompositor = stubCompositor；
// WP10 落地后 sceneCompiler / cpuCompositor 改为 re-export ./scene、./cpu，WP11 落地后 createRenderer 改为 ./pixi。
import type { RenderEntry } from '../contracts/shell';
import { createStubRenderer } from '../app/stubs/stubRenderer';
import { stubSceneCompiler } from '../app/stubs/stubScene';
import { stubCpuCompositor } from '../app/stubs/stubCompositor';

export const createRenderer = createStubRenderer satisfies RenderEntry['createRenderer'];
export const sceneCompiler = stubSceneCompiler satisfies RenderEntry['sceneCompiler'];
export const cpuCompositor = stubCpuCompositor satisfies RenderEntry['cpuCompositor'];
