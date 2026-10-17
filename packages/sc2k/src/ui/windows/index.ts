// ===== ui/windows/index.ts =====（WP12b：窗口 / 模态工厂表；导出名与类型由 ui/windowTypes.ts（Lead）固定）
// 外壳（WP12a）按 WINDOW_FACTORIES[id] 创建窗口、按 MODAL_FACTORIES[id] 创建模态内容；每个组件只依赖 WindowDeps。
// answer(n) 约定见 ./modals.ts 头注释与 MODAL_ANSWER；WindowId 没有 gameOver（它只是模态）。population / industries 为 v2。
import './windows.css';
import type { ModalFactories, ModalFactory, WindowFactories } from '../windowTypes';
import { bondsWindow } from './bonds';
import { buildBudget, budgetWindow } from './budget';
import { graphsWindow } from './graphs';
import { importAssetsModal, importAssetsWindow } from './importAssets';
import { mapWindow } from './map';
import { bridgeTypeModal, disasterAlertModal, gameOverModal, neighborConnectModal, teamPickModal } from './modals';
import { neighborsWindow } from './neighbors';
import { newCityWindow } from './newCity';
import { buildNewspaper, newspaperWindow } from './newspaper';
import { ordinancesWindow } from './ordinances';
import { queryWindow } from './query';
import { saveLoadWindow } from './saveLoad';

/** 预算模态：复用 Budget 组件，OK → answer(0)（外壳随后 host.modalClosed() 续跑被挂起的 budgetWindow 阶段）。 */
const budgetModal: ModalFactory = (deps, _payload, answer) => {
  const b = buildBudget(deps, { modal: true, onDone: () => answer(0) });
  return { title: deps.strings.t('modal.budget'), el: b.el, refresh: b.refresh };
};
/** 订阅版 / 号外：复用 Newspaper 组件（版面由 q.news.currentPaper() 决定，extra 标志在 PaperView 内）。 */
const paperModal = (titleKey: 'modal.newspaper' | 'modal.extraPaper'): ModalFactory => (deps, _payload, answer) => {
  const p = buildNewspaper(deps, { modal: true, onClose: () => answer(0) });
  return { title: deps.strings.t(titleKey), el: p.el, refresh: p.refresh };
};

/** 窗口工厂表：缺项（population / industries，v2）时外壳显示"未实现"占位窗口。 */
export const WINDOW_FACTORIES: WindowFactories = {
  newCity: newCityWindow,
  budget: budgetWindow,
  ordinances: ordinancesWindow,
  bonds: bondsWindow,
  map: mapWindow,
  graphs: graphsWindow,
  neighbors: neighborsWindow,
  newspaper: newspaperWindow,
  query: queryWindow,
  saveLoad: saveLoadWindow,
  importAssets: importAssetsWindow,
};

/** 模态内容工厂表：缺项（militaryOffer / scenarioBrief / scenarioResult / rewardOffer，v2）时外壳用通用"确定"对话框并 answer(0)。 */
export const MODAL_FACTORIES: ModalFactories = {
  budget: budgetModal,
  newspaper: paperModal('modal.newspaper'),
  extraPaper: paperModal('modal.extraPaper'),
  disasterAlert: disasterAlertModal,
  teamPick: teamPickModal,
  bridgeType: bridgeTypeModal,
  neighborConnect: neighborConnectModal,
  gameOver: gameOverModal,
  importAssets: importAssetsModal,
};

/** answer(n) 的语义速查（外壳据此重发命令 / 回主菜单）。 */
export const MODAL_ANSWER = {
  gameOver: { keepWatching: 0, mainMenu: 1 },
  disasterAlert: { ok: 0, goto: 1 },
  neighborConnect: { decline: 0, accept: 1 },
  bridgeType: { cancel: -1 /* 其余 = BridgeKind 数值 */ },
  teamPick: { /* n = 运动项目下标 0..4 */ },
} as const;

export { NEW_CITY_EVENT } from './newCity';
export { CITY_LOADED_EVENT, CITY_SAVED_EVENT } from './saveLoad';
