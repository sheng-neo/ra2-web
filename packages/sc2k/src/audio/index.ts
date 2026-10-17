// ===== audio/index.ts =====（WP0 转发桩 → WP12 接手；导出名与签名按 CONTRACTS §V AudioEntry）
// v1 为静默实现：全部方法空操作（事件映射表由 WP12 补）；v2 WebAudio 原创合成音。
import type { AudioEntry } from '../contracts/entrypoints';
import type { AudioSink } from '../contracts/audio';

export const createAudioSink = ((): AudioSink => ({
  play: () => { /* 静默 */ },
  loop: () => { /* 静默 */ },
  setEnabled: () => { /* 静默 */ },
  startMusic: () => { /* 静默 */ },
  stopMusic: () => { /* 静默 */ },
})) satisfies AudioEntry['createAudioSink'];
