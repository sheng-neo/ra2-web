// ===== ui/windows/index.ts =====（WP0 占位 → WP12b 接手整目录重写；导出名与类型固定）
import type { WindowFactories, ModalFactories } from '../windowTypes';

/** 窗口工厂表：缺项时外壳显示"未实现"占位窗口。 */
export const WINDOW_FACTORIES: WindowFactories = {};
/** 模态内容工厂表：缺项时外壳用通用"确定"对话框并 answer(0)。 */
export const MODAL_FACTORIES: ModalFactories = {};
