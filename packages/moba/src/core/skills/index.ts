/**
 * 技能脚本总入口：world.ts import 本文件以完成全部注册（副作用导入）。
 * 顺序有意义：后注册的覆盖先注册的，英雄技能文件要排在 heroes.ts(占位) 之后。
 */
import './summoner';
import './heroes';
import '../passives';
