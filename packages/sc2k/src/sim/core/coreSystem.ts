// ===== sim/core/coreSystem.ts =====
// core 系统本体（CONTRACTS §V createCoreSystem）：两个 core 阶段（growthScan / uiRefresh）、四条 core 命令
// （setSpeed / setView / terrainDone / modalAnswer）、新城初始化、.SC2 的"清洗"步（IMPORT_ORDER 第 2 位 / EXPORT_ORDER 第 1 位）。
// growthScan 与 modalAnswer 需要访问其它已注册系统：createSim 用 bindCoreRegistry(ctx, …) 以 ctx 为键注入（WeakMap，不污染 ctx）。
import type { CommandResult, ModalId } from '../../contracts/commands';
import { MODAL_OWNER } from '../../contracts/commands';
import { GROWTH_VISIT_ORDER, growthStep, growthSubstep } from '../../contracts/clock';
import { CityMode } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import type { Speed } from '../../contracts/state';
import type { Diagnostic, NewCityParams, SimContext, System, SystemId } from '../../contracts/system';
import { recountFromLayers } from './stateOps';

export interface CoreRegistry { systemById(id: SystemId): System | undefined }
const REGISTRY = new WeakMap<SimContext, CoreRegistry>();
/** createSim 调用：把注册表绑到 ctx（core 阶段 / 命令据此找到兄弟系统）。 */
export function bindCoreRegistry(ctx: SimContext, reg: CoreRegistry): void { REGISTRY.set(ctx, reg); }
const registryOf = (ctx: SimContext): CoreRegistry => {
  const r = REGISTRY.get(ctx);
  if (!r) throw new Error('core: ctx 未经 createSim 绑定注册表（不要手工构造 SimContext）');
  return r;
};

const ok = (changed: readonly number[] = []): CommandResult => ({ ok: true, cost: 0, changed });
const reject = (reason: CommandResult['reason']): CommandResult => ({ ok: false, cost: 0, reason, changed: [] });
const isSpeed = (v: number): v is Speed => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

/** 核心系统：无 priv、无 stub 标记；phases / commands 键集合恰为 PHASE_OWNER / COMMAND_OWNER 归 core 者。 */
export function createCoreSystem(): System {
  return {
    id: 'core',
    phases: {
      /** spec:economy §2.3.3：x = step 外层、y = substep 内层，每格按 GROWTH_VISIT_ORDER 回调（缺席 / 未实现的系统跳过，不消费 PRNG）。 */
      growthScan(ctx, day) {
        const reg = registryOf(ctx);
        const visitors: System[] = [];
        for (const id of GROWTH_VISIT_ORDER) { const s = reg.systemById(id); if (s && typeof s.growthVisit === 'function') visitors.push(s); }
        if (visitors.length === 0) return 'done';
        const step = growthStep(day), sub = growthSubstep(day);
        for (let x = step; x < 128; x += 4) for (let y = sub; y < 128; y += 4) for (const s of visitors) s.growthVisit!(ctx, x, y);
        return 'done';
      },
      /** 只发事件（统计窗口 / 小地图刷新），不改模拟状态。 */
      uiRefresh(ctx) { ctx.act.emit({ type: 'uiRefresh' }); return 'done'; },
    },
    commands: {
      setSpeed(ctx, cmd) {
        if (!isSpeed(cmd.speed)) return reject('mode');
        ctx.state.clock.speed = cmd.speed;
        return ok();
      },
      /** 只写 view / terrain.rotation（两者都不入哈希）。 */
      setView(ctx, cmd) {
        const v = ctx.state.view;
        v.x = cmd.x | 0; v.y = cmd.y | 0; v.zoom = cmd.zoom | 0;
        ctx.state.terrain.rotation = ((cmd.rotation | 0) & 3) as 0 | 1 | 2 | 3;
        return ok();
      },
      /** 地形编辑 → 城市模式（不可返回）；已在城市 / 灾害模式 → reason 'mode'。 */
      terrainDone(ctx) {
        const c = ctx.state.clock;
        if (c.mode !== CityMode.TerrainEdit) return reject('mode');
        c.mode = CityMode.City;
        ctx.act.emit({ type: 'modeChanged', mode: CityMode.City });
        ctx.act.emit({ type: 'toolbar', reason: 'mode' });
        return ok();
      },
      /** 按 MODAL_OWNER 转发；owner 为 core（importAssets，纯 UI）直接忽略；owner 缺席 / 未实现 → 记 diag 并忽略（仍算成功）。 */
      modalAnswer(ctx, cmd) {
        const dialog: ModalId = cmd.dialog;
        const owner = MODAL_OWNER[dialog];
        if (owner === undefined) return reject('noTarget');
        if (owner === 'core') return ok();
        const sys = registryOf(ctx).systemById(owner);
        if (sys && typeof sys.onModalAnswer === 'function') sys.onModalAnswer(ctx, dialog, cmd.answer | 0);
        else ctx.diag.push({ level: 'info', code: 'core.modalAnswerIgnored', message: `modalAnswer(${dialog}) 的 owner ${owner} 缺席或未实现 onModalAnswer，已忽略` });
        return ok();
      },
    },
    /** 新城：名字、建城年、时钟归零、地形编辑模式、暂停。资金 / 难度等归 economy，地形归 terrain。 */
    init(ctx: SimContext, p: NewCityParams): void {
      const s = ctx.state;
      s.cityName = p.name;
      s.mayorName = p.mayor ?? '';
      const c = s.clock;
      c.age = 0; c.foundedYear = p.startYear; c.mode = CityMode.TerrainEdit; c.speed = 1; c.modalPause = 0; c.phaseCursor = 0; c.accumMs = 0; c.disasterTicks = 0;
    },
    /** 清洗步（spec:file-formats §3.4.2 第 3 步）：拷贝与存档同编码的层与低分辨率图、XGRP、rawMisc、城市名与时钟标量；XZON 低 nibble ≥ 10 → 0、XUND ≥ 0x24 → 0；重算 counts。 */
    importFrom(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void {
      const s = ctx.state, L = s.layers, M = s.maps;
      s.cityName = doc.cityName;
      L.xbld.set(doc.xbld); L.xzon.set(doc.xzon); L.xund.set(doc.xund); L.xtxt.set(doc.xtxt); L.xbit.set(doc.xbit);
      L.xlab.set(doc.xlab); L.xmic.set(doc.xmic); L.xthg.set(doc.xthg);
      M.xtrf.set(doc.xtrf); M.xplt.set(doc.xplt); M.xval.set(doc.xval); M.xcrm.set(doc.xcrm);
      M.xplc.set(doc.xplc); M.xfir.set(doc.xfir); M.xpop.set(doc.xpop); M.xrog.set(doc.xrog);
      s.xgrp.set(doc.xgrp); s.rawMisc.set(doc.misc);
      let cleaned = 0;
      for (let i = 0; i < L.xzon.length; i++) {
        if ((L.xzon[i]! & 0x0f) >= 10) { L.xzon[i] = L.xzon[i]! & 0xf0; cleaned++; }
        if (L.xund[i]! >= 0x24) { L.xund[i] = 0; cleaned++; }
      }
      if (cleaned > 0) diag.push({ level: 'info', code: 'core.importCleaned', message: `清洗了 ${cleaned} 个非法 XZON / XUND 值` });
      const m = doc.misc, c = s.clock;
      c.age = Math.max(0, miscGet(m, MISC.cityAge) | 0);
      c.foundedYear = miscGet(m, MISC.yearFounded) | 0;
      const mode = miscGet(m, MISC.cityMode) | 0;
      c.mode = mode === CityMode.Disaster ? CityMode.Disaster : mode === CityMode.TerrainEdit ? CityMode.TerrainEdit : CityMode.City;
      const speed = miscGet(m, MISC.speed) | 0;
      c.speed = isSpeed(speed) ? speed : 1;
      c.phaseCursor = 0; c.modalPause = 0; c.accumMs = 0;
      s.terrain.rotation = (miscGet(m, MISC.rotation) & 3) as 0 | 1 | 2 | 3;
      s.view.x = miscGet(m, MISC.viewX) | 0; s.view.y = miscGet(m, MISC.viewY) | 0; s.view.zoom = miscGet(m, MISC.zoom) | 0;
      if (miscGet(m, MISC.prngMarker) !== 0) c.prngState = miscGet(m, MISC.prngState) | 0;
      recountFromLayers(s, ctx.catalogue);
    },
    /** 导出：层 / 图 / XGRP 原样、rawMisc 透传未知偏移、core 所有的 MISC 标量与派生计数。 */
    exportTo(ctx: SimContext, doc: Sc2Document): void {
      const s = ctx.state, L = s.layers, M = s.maps;
      doc.cityName = s.cityName;
      doc.xbld.set(L.xbld); doc.xzon.set(L.xzon); doc.xund.set(L.xund); doc.xtxt.set(L.xtxt); doc.xbit.set(L.xbit);
      doc.xlab.set(L.xlab); doc.xmic.set(L.xmic); doc.xthg.set(L.xthg);
      doc.xtrf.set(M.xtrf); doc.xplt.set(M.xplt); doc.xval.set(M.xval); doc.xcrm.set(M.xcrm);
      doc.xplc.set(M.xplc); doc.xfir.set(M.xfir); doc.xpop.set(M.xpop); doc.xrog.set(M.xrog);
      doc.xgrp.set(s.xgrp); doc.misc.set(s.rawMisc);
      const m = doc.misc, c = s.clock;
      miscSet(m, MISC.cityAge, c.age); miscSet(m, MISC.yearFounded, c.foundedYear); miscSet(m, MISC.cityMode, c.mode);
      miscSet(m, MISC.speed, c.speed); miscSet(m, MISC.rotation, s.terrain.rotation);
      miscSet(m, MISC.viewX, s.view.x); miscSet(m, MISC.viewY, s.view.y); miscSet(m, MISC.zoom, s.view.zoom);
      miscSet(m, MISC.prngMarker, 1); miscSet(m, MISC.prngState, c.prngState); miscSet(m, MISC.saveFormatVersion, s.formatVersion);
      for (let id = 0; id < 256; id++) miscSet(m, MISC.tileCounts + id * 4, s.counts.tile[id]!);
      for (let k = 0; k < 8; k++) miscSet(m, MISC.zoneTileCounts + k * 4, s.counts.zone[k]!);
    },
    postLoad(): void { /* core 无闭包缓存 */ },
  };
}
