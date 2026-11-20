/**
 * 轻量训练（PRD v2.0 第 3.3 节）：3 套全身训练，每套有标准版和轻量版。
 * 第一版只打勾记录完成情况。【待专业人士审核动作和量】
 */
export type Routine = 'bodyweight' | 'band' | 'dumbbell';

export interface Exercise {
  name: string;
  how: string;
  standard: string;
  light: string;
}

export const ROUTINES: Record<Routine, { title: string; exercises: Exercise[] }> = {
  bodyweight: {
    title: '徒手',
    exercises: [
      { name: '椅子坐站', how: '坐在椅子前沿，双手抱胸，站起来再慢慢坐下', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '靠墙俯卧撑', how: '双手撑墙，身体成一条直线，胸口靠近墙再推回', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '臀桥', how: '仰卧屈膝，脚踩地，把臀部抬起再放下', standard: '3 组 × 12 次', light: '2 组 × 10 次' },
      { name: '提踵', how: '扶着桌子站好，踮起脚尖再放下', standard: '3 组 × 15 次', light: '2 组 × 12 次' },
      { name: '平板支撑（跪姿也行）', how: '前臂撑地，身体保持一条直线', standard: '3 组 × 20 秒', light: '2 组 × 15 秒' },
    ],
  },
  band: {
    title: '弹力带',
    exercises: [
      { name: '弹力带深蹲', how: '脚踩弹力带，双手拉住放在肩前，下蹲再站起', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '弹力带划船', how: '弹力带绕过脚底或固定在门把手，向后拉到腰侧', standard: '3 组 × 12 次', light: '2 组 × 10 次' },
      { name: '弹力带推胸', how: '弹力带绕到背后，双手向前推', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '弹力带侧走', how: '弹力带套在膝盖上方，半蹲向侧面走', standard: '3 组 × 10 步', light: '2 组 × 8 步' },
      { name: '弹力带面拉', how: '弹力带固定在高处，向脸的方向拉开', standard: '3 组 × 12 次', light: '2 组 × 10 次' },
    ],
  },
  dumbbell: {
    title: '哑铃',
    exercises: [
      { name: '高脚杯深蹲', how: '双手捧一只哑铃在胸前，下蹲再站起', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '单臂划船', how: '一手撑椅子，另一手把哑铃拉到腰侧', standard: '3 组 × 10 次/侧', light: '2 组 × 8 次/侧' },
      { name: '哑铃推举', how: '坐着把哑铃从肩膀推到头顶', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '罗马尼亚硬拉', how: '膝盖微弯，臀部向后推，哑铃沿腿下放再站起', standard: '3 组 × 10 次', light: '2 组 × 8 次' },
      { name: '农夫走', how: '双手各拿一只哑铃，挺胸走', standard: '3 趟 × 30 秒', light: '2 趟 × 20 秒' },
    ],
  },
};
