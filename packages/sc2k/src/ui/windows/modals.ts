// ===== ui/windows/modals.ts =====（WP12b：模态内容，spec:ui-art §2.6）
// answer(n) 约定（外壳的通用对话框默认 answer(0)，因此 0 必须是"安全"的选项）：
//  gameOver        0 = 继续观看，1 = 回主菜单
//  disasterAlert   0 = OK，1 = Go To（本组件已自行 renderer.goto 到 payload.x/y）
//  teamPick        n = 运动项目下标 0..4（ui.team.n）；队名若 payload.slot 为数值则先派发 rename{slot,text}
//  bridgeType      n = 所选 BridgeKind 的数值（不是下标；0 = Causeway 与通用默认一致）；−1 = 取消
//  neighborConnect 1 = 接受，0 = 拒绝
import type { BridgeKind } from '../../contracts/net';
import type { ModalFactory } from '../windowTypes';
import { money } from './format';
import { bindText } from './text';
import { btn, field, h } from './wdom';

/** DisasterKind 数值 → strings 键后缀 disaster.<key>（与 contracts/grid.DisasterKind 同序）。 */
export const DISASTER_KEYS: readonly string[] = ['none', 'fire', 'flood', 'riot', 'toxicSpill', 'airCrashLegacy', 'earthquake', 'tornado', 'monster', 'meltdown', 'microwave', 'volcano', 'firestorm', 'massRiots', 'massFloods', 'pollution', 'hurricane', 'helicopterCrash', 'planeCrash'];
/** BridgeKind 数值 → strings 键后缀 ui.bridge.<key>（与 contracts/net.BridgeKind 同序）。 */
export const BRIDGE_KEYS: readonly string[] = ['causeway', 'raising', 'suspension', 'rail', 'wire', 'highwayLow', 'highwayReinforced'];
export const TEAM_COUNT = 5;
export const DEFAULT_CONNECTION_COST = 1000;      // spec:ui-art §2.6 "连接到邻城？$1,000"
export const BRIDGE_CANCEL = -1;

const obj = (p: unknown): Record<string, unknown> => (p && typeof p === 'object' ? (p as Record<string, unknown>) : {});
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export const gameOverModal: ModalFactory = (deps, payload, answer) => {
  const t = bindText(deps.strings);
  const funds = num(obj(payload)['funds']);
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-modal sc2k-win-gameover' },
    h('p', { text: t('message.gameOver'), testid: 'gameover-text' }),
    funds !== undefined ? h('p', { cls: 'sc2k-win-muted', text: `${t('ui.funds')} ${money(funds)}` }) : null,
    h('div', { cls: 'sc2k-win-buttons' },
      btn(t('ui.keepWatching'), () => answer(0), { testid: 'gameover-watch' }),
      btn(t('ui.mainMenu'), () => answer(1), { testid: 'gameover-menu', cls: 'sc2k-win-primary' })));
  return { title: t('modal.gameOver'), el };
};

export const disasterAlertModal: ModalFactory = (deps, payload, answer) => {
  const t = bindText(deps.strings);
  const p = obj(payload);
  const kind = num(p['kind']) ?? 0;
  const x = num(p['x']), y = num(p['y']);
  const name = t(`disaster.${DISASTER_KEYS[kind] ?? 'none'}`);
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-modal sc2k-win-alert' },
    h('p', { text: t('message.disasterStarted', { name }), testid: 'alert-text' }),
    h('div', { cls: 'sc2k-win-buttons' },
      x !== undefined && y !== undefined ? btn(t('ui.goto'), () => { deps.renderer.goto(x, y, true); answer(1); }, { testid: 'alert-goto', title: t('ui.disaster.goto') }) : null,
      btn(t('ui.ok'), () => answer(0), { testid: 'alert-ok', cls: 'sc2k-win-primary' })));
  return { title: t('modal.disasterAlert'), el };
};

export const teamPickModal: ModalFactory = (deps, payload, answer) => {
  const t = bindText(deps.strings);
  const slot = num(obj(payload)['slot']);
  let sport = 0;
  const radios = Array.from({ length: TEAM_COUNT }, (_, k) => {
    const input = h('input', { type: 'radio', name: 'sc2k-team', checked: k === 0, testid: `team-${k}` });
    input.addEventListener('change', () => { if (input.checked) sport = k; });
    return h('label', { cls: 'sc2k-win-check' }, input, h('span', { text: t(`ui.team.${k}`) }));
  });
  const nameInput = h('input', { type: 'text', cls: 'sc2k-win-input', maxLength: 23, testid: 'team-name' });
  const ok = (): void => {
    const text = nameInput.value.trim();
    if (slot !== undefined && text) deps.dispatch({ type: 'rename', slot, text });
    answer(sport);
  };
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-modal sc2k-win-team' },
    h('p', { text: t('ui.team.pick') }),
    h('div', { cls: 'sc2k-win-columns' }, ...radios),
    field(t('ui.team.prompt'), nameInput),
    h('div', { cls: 'sc2k-win-buttons' }, btn(t('ui.ok'), ok, { testid: 'team-ok', cls: 'sc2k-win-primary' })));
  return { title: t('modal.teamPick'), el };
};

export const bridgeTypeModal: ModalFactory = (deps, payload, answer) => {
  const t = bindText(deps.strings);
  const p = obj(payload);
  const options = Array.isArray(p['options']) ? (p['options'] as unknown[]).filter((v): v is BridgeKind => typeof v === 'number') : [];
  const costs = Array.isArray(p['costs']) ? (p['costs'] as unknown[]).map(num) : [];
  const length = num(p['length']);
  const funds = deps.host.state.economy.funds;
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-modal sc2k-win-bridge' },
    h('p', { text: t('ui.bridge.choose') }),
    length !== undefined ? h('p', { cls: 'sc2k-win-muted', text: t('ui.bridge.length', { value: length }) }) : null,
    h('div', { cls: 'sc2k-win-buttons sc2k-win-vertical' }, ...options.map((kind, k) => {
      const cost = costs[k];
      const label = cost !== undefined ? `${t(`ui.bridge.${BRIDGE_KEYS[kind] ?? 'causeway'}`)} — ${t('ui.bridge.total', { value: money(cost) })}` : t(`ui.bridge.${BRIDGE_KEYS[kind] ?? 'causeway'}`);
      return btn(label, () => answer(kind), { testid: `bridge-${kind}`, cls: cost !== undefined && cost > funds ? 'sc2k-win-danger' : undefined });   // 资金不足红字仍可选（spec §2.6）
    })),
    h('div', { cls: 'sc2k-win-buttons' }, btn(t('ui.cancel'), () => answer(BRIDGE_CANCEL), { testid: 'bridge-cancel' })));
  return { title: t('modal.bridgeType'), el };
};

export const neighborConnectModal: ModalFactory = (deps, payload, answer) => {
  const t = bindText(deps.strings);
  const cost = num(obj(payload)['cost']) ?? DEFAULT_CONNECTION_COST;
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-modal sc2k-win-connect' },
    h('p', { text: t('ui.neighbor.connect', { value: money(cost) }), testid: 'connect-text' }),
    h('div', { cls: 'sc2k-win-buttons' },
      btn(t('ui.yes'), () => answer(1), { testid: 'connect-yes', cls: 'sc2k-win-primary' }),
      btn(t('ui.no'), () => answer(0), { testid: 'connect-no' })));
  return { title: t('modal.neighborConnect'), el };
};
