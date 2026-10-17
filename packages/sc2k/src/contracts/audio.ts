// ===== audio.ts =====（WP12；v1 静默实现，v2 WebAudio 原创合成）
// 音效接口（CONTRACTS §T）：sim 只 emit { type:'sound', id }，播放由 app 侧 AudioSink 承担。
export type SoundId = 'click' | 'place' | 'bulldoze' | 'reject' | 'zone' | 'cash' | 'siren' | 'explosion' | 'thunder' | 'monster' | 'tornado' | 'plane' | 'helicopter' | 'train' | 'ship' | 'boo' | 'cheer' | 'news' | 'invention' | 'milestone' | 'launch' | 'quake' | 'flood';
export interface AudioSink { play(id: SoundId, opts?: { volume?: number; pan?: number }): void; loop(id: SoundId, on: boolean): void; setEnabled(sound: boolean, music: boolean): void; startMusic(track: 'city' | 'disaster' | 'title'): void; stopMusic(): void }
