/**
 * 入口：全部流程在 app/ 下。
 *   app/app.ts     启动 → 主菜单 → 加载 → 对局 → 结算 的流程与各层接线、设置、错误提示、调试钩子(window.__moba)
 *   app/match.ts   一局对局的会话(分阶段加载、HudHost 接线、主循环回调、生命周期与资源释放)
 *   app/loop.ts    固定步长主循环(纯逻辑，有单测)
 *   app/perf.ts    帧耗时滑动统计          app/params.ts  调试用 URL 参数
 *   app/shell.ts   启动占位淡出、界面内提示层
 */
import { startApp } from './app/app';

startApp();
