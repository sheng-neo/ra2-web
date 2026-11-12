/**
 * 技能脚本总入口：world.ts import 本文件以完成全部注册（副作用导入）。
 *
 * 每位英雄一个文件(被动钩子 + 三个主动技能)，写法见 toolkit.ts 的积木与 common.ts / timing.ts 的约定；
 * 没注册脚本的技能在 registry 里退化为「只走施法管线、没有效果」的空实现。
 * 给 Bot 用的技能意图表与伤害估算在 intents.ts(不在这里导入：它只是数据，不参与注册)。
 */
import './summoner';
import './panyue';
import './chijin';
import './xingli';
import './fengling';
import './yeque';
import '../passives';
