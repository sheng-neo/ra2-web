/**
 * 轻量训练（PRD v2.0 第 3.3 节）：3 套全身训练，每套有标准版和轻量版。
 * 第一版只打勾记录完成情况。【待专业人士审核动作和量】
 *
 * English text: a translation of the Chinese text, PENDING REVIEW by a qualified professional
 * (exercises and amounts), like the Chinese.
 */
import { pick, type Lang, type Text } from '../../core/i18n';

export type Routine = 'bodyweight' | 'band' | 'dumbbell';

export const ROUTINE_IDS: Routine[] = ['bodyweight', 'band', 'dumbbell'];

export interface Exercise {
  name: string;
  how: string;
  standard: string;
  light: string;
}

interface ExerciseSource {
  name: Text;
  how: Text;
  standard: Text;
  light: Text;
}

/** "3 组 × 10 次" / "3 sets × 10 reps". `perSide` adds "/侧" / "per side". */
function sets(n: number, count: number, kind: 'reps' | 'seconds' | 'steps', perSide = false): Text {
  const zhUnit = kind === 'reps' ? '次' : kind === 'seconds' ? '秒' : '步';
  return { hans: `${n} 组 × ${count} ${zhUnit}${perSide ? '/侧' : ''}`, en: `${n} sets × ${count} ${kind}${perSide ? ' per side' : ''}` };
}

/** "3 趟 × 30 秒" / "3 rounds × 30 seconds". */
function walks(n: number, seconds: number): Text {
  return { hans: `${n} 趟 × ${seconds} 秒`, en: `${n} rounds × ${seconds} seconds` };
}

const SOURCE: Record<Routine, { title: Text; exercises: ExerciseSource[] }> = {
  bodyweight: {
    title: { hans: '徒手', en: 'Bodyweight' },
    exercises: [
      {
        name: { hans: '椅子坐站', en: 'Chair sit-to-stand' },
        how: { hans: '坐在椅子前沿，双手抱胸，站起来再慢慢坐下', en: 'Sit on the front edge of a chair with your arms crossed over your chest. Stand up, then sit back down slowly' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '靠墙俯卧撑', en: 'Wall push-up' },
        how: { hans: '双手撑墙，身体成一条直线，胸口靠近墙再推回', en: 'Put your hands on a wall with your body in a straight line. Bring your chest toward the wall, then push back' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '臀桥', en: 'Glute bridge' },
        how: { hans: '仰卧屈膝，脚踩地，把臀部抬起再放下', en: 'Lie on your back with your knees bent and your feet on the floor. Lift your hips, then lower them' },
        standard: sets(3, 12, 'reps'),
        light: sets(2, 10, 'reps'),
      },
      {
        name: { hans: '提踵', en: 'Calf raise' },
        how: { hans: '扶着桌子站好，踮起脚尖再放下', en: 'Stand holding on to a table. Rise onto your toes, then lower' },
        standard: sets(3, 15, 'reps'),
        light: sets(2, 12, 'reps'),
      },
      {
        name: { hans: '平板支撑（跪姿也行）', en: 'Plank (on your knees is fine)' },
        how: { hans: '前臂撑地，身体保持一条直线', en: 'Rest on your forearms and keep your body in a straight line' },
        standard: sets(3, 20, 'seconds'),
        light: sets(2, 15, 'seconds'),
      },
    ],
  },
  band: {
    title: { hans: '弹力带', en: 'Resistance band' },
    exercises: [
      {
        name: { hans: '弹力带深蹲', en: 'Band squat' },
        how: { hans: '脚踩弹力带，双手拉住放在肩前，下蹲再站起', en: 'Stand on the band and hold the ends in front of your shoulders. Squat down, then stand up' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '弹力带划船', en: 'Band row' },
        how: { hans: '弹力带绕过脚底或固定在门把手，向后拉到腰侧', en: 'Loop the band under your feet or fix it to a door handle. Pull back to the side of your waist' },
        standard: sets(3, 12, 'reps'),
        light: sets(2, 10, 'reps'),
      },
      {
        name: { hans: '弹力带推胸', en: 'Band chest press' },
        how: { hans: '弹力带绕到背后，双手向前推', en: 'Wrap the band behind your back and push both hands forward' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '弹力带侧走', en: 'Band side step' },
        how: { hans: '弹力带套在膝盖上方，半蹲向侧面走', en: 'Put the band just above your knees. In a half squat, step to the side' },
        standard: sets(3, 10, 'steps'),
        light: sets(2, 8, 'steps'),
      },
      {
        name: { hans: '弹力带面拉', en: 'Band face pull' },
        how: { hans: '弹力带固定在高处，向脸的方向拉开', en: 'Fix the band at a high point. Pull it toward your face, moving your hands apart' },
        standard: sets(3, 12, 'reps'),
        light: sets(2, 10, 'reps'),
      },
    ],
  },
  dumbbell: {
    title: { hans: '哑铃', en: 'Dumbbells' },
    exercises: [
      {
        name: { hans: '高脚杯深蹲', en: 'Goblet squat' },
        how: { hans: '双手捧一只哑铃在胸前，下蹲再站起', en: 'Hold one dumbbell at your chest with both hands. Squat down, then stand up' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '单臂划船', en: 'One-arm row' },
        how: { hans: '一手撑椅子，另一手把哑铃拉到腰侧', en: 'Rest one hand on a chair. With the other hand, pull the dumbbell up to the side of your waist' },
        standard: sets(3, 10, 'reps', true),
        light: sets(2, 8, 'reps', true),
      },
      {
        name: { hans: '哑铃推举', en: 'Dumbbell shoulder press' },
        how: { hans: '坐着把哑铃从肩膀推到头顶', en: 'Sitting down, push the dumbbells from your shoulders to above your head' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '罗马尼亚硬拉', en: 'Romanian deadlift' },
        how: { hans: '膝盖微弯，臀部向后推，哑铃沿腿下放再站起', en: 'With your knees slightly bent, push your hips back and lower the dumbbells along your legs. Then stand up' },
        standard: sets(3, 10, 'reps'),
        light: sets(2, 8, 'reps'),
      },
      {
        name: { hans: '农夫走', en: "Farmer's walk" },
        how: { hans: '双手各拿一只哑铃，挺胸走', en: 'Hold a dumbbell in each hand and walk with your chest up' },
        standard: walks(3, 30),
        light: walks(2, 20),
      },
    ],
  },
};

export function routineTitle(routine: Routine, lang: Lang): string {
  return pick(lang, SOURCE[routine].title);
}

export function routineExercises(routine: Routine, lang: Lang): Exercise[] {
  return SOURCE[routine].exercises.map((e) => ({ name: pick(lang, e.name), how: pick(lang, e.how), standard: pick(lang, e.standard), light: pick(lang, e.light) }));
}
