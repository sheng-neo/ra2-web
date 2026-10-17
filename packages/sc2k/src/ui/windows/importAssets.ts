// ===== ui/windows/importAssets.ts =====（WP12b：导入素材的薄壳，ARCHITECTURE §7.4 / §9.3）
// 只负责把 WP14 的 AssetImporter.mount(el) 挂进窗口 / 模态并在销毁时 unmount；importer 为 null 时显示不可用提示。隐私说明经 strings ui.import.privacy。
import type { ModalFactory, WindowDeps, WindowFactory } from '../windowTypes';
import { bindText } from './text';
import { btn, h } from './wdom';

export function buildImportAssets(deps: WindowDeps, opts: { modal?: boolean; onClose?: () => void } = {}): { el: HTMLElement; destroy(): void } {
  const t = bindText(deps.strings);
  const mountEl = h('div', { cls: 'sc2k-win-importmount', testid: 'import-mount' });
  const el = h('div', { cls: 'sc2k-win-body sc2k-win-import' },
    h('p', { cls: 'sc2k-win-muted', text: t('ui.import.privacy') }),
    deps.importer ? mountEl : h('p', { text: t('ui.import.none'), testid: 'import-none' }),
    opts.modal ? h('div', { cls: 'sc2k-win-buttons' }, btn(t('ui.close'), () => opts.onClose?.(), { testid: 'import-close' })) : null);
  deps.importer?.mount(mountEl);
  return { el, destroy: () => { deps.importer?.unmount(); } };
}

export const importAssetsWindow: WindowFactory = (deps) => {
  const b = buildImportAssets(deps);
  return { id: 'importAssets', title: deps.strings.t('window.importAssets'), el: b.el, width: 420, destroy: b.destroy };
};

export const importAssetsModal: ModalFactory = (deps, _payload, answer) => {
  const b = buildImportAssets(deps, { modal: true, onClose: () => answer(0) });
  return { title: deps.strings.t('modal.importAssets'), el: b.el, destroy: b.destroy };
};
