/**
 * "今天这样过"卡片的文案（PRD v2.0 第 2.2 节）。事先写好，【待审核】。
 *
 * English text: a translation of the Chinese text, PENDING CLINICAL REVIEW.
 * It leaves out two Chinese phrases that promise a result for muscle ("helps you keep muscle",
 * "the best time to build muscle back"): English copy makes no such claims.
 */
import type { Lang } from '../../core/i18n';
import type { Advice } from '../../core/today';
import type { ProteinTarget } from '../../core/protein';

export interface AdviceText {
  title: string;
  body: string;
  tone: 'calm' | 'warn' | 'alert';
}

function floorOf(p: ProteinTarget): number | null {
  return p.kind === 'auto' || p.kind === 'manual' ? p.floorG : null;
}

export function adviceText(a: Advice, protein: ProteinTarget, opts: { oral: boolean; lang: Lang }): AdviceText {
  return opts.lang === 'en' ? adviceTextEn(a, protein, opts) : adviceTextZh(a, protein, opts);
}

/** Chinese text. Do not edit without review; Traditional Chinese uses this text too. */
function adviceTextZh(a: Advice, protein: ProteinTarget, opts: { oral: boolean }): AdviceText {
  const floor = floorOf(protein);
  const proteinLine = floor ? `先保住 ${floor} 克蛋白，分 3–4 次吃。` : '';
  switch (a.kind) {
    case 'triage':
      return { title: '今天先照顾身体', body: '你今天记录的情况可能需要看医生。今天的训练和饮食建议先暂停，能喝就小口喝水。', tone: 'alert' };
    case 'dose_day':
      if (a.status === 'overdue') return { title: '是不是忘了记？', body: opts.oral ? '到了吃药时间还没有记录。吃过了就补记一下；漏吃了，按说明书或问医生。' : '到了打针时间还没有记录。打过了就补记一下；漏打了怎么办，以说明书为准，拿不准就问医生。', tone: 'warn' };
      return { title: opts.oral ? '今天记得吃药' : '今天是打针日', body: opts.oral ? '按时吃，吃完记一下。' : `打完记一下，部位换一换。打针后的一两天如果胃口差，${proteinLine || '先少量多餐。'}`, tone: 'calm' };
    case 'escalation':
      return { title: `加量第 ${a.dayOfEscalation} 天`, body: `刚加量的两周反应常常更明显。少量多餐、多喝水；${proteinLine}训练换成 15 分钟轻量版。`, tone: 'calm' };
    case 'high_symptom':
      return { title: '今天可能会难受一点', body: `按你前几周的记录，打针后第 ${a.offset} 天反应常常更明显。${proteinLine}训练换成轻量版或改天。`, tone: 'calm' };
    case 'protein_low':
      return { title: '这几天蛋白吃少了', body: `已经连续 ${a.days} 天没到 ${a.floorG} 克。试试每餐先吃蛋白，或者加一杯牛奶、一勺蛋白粉。`, tone: 'warn' };
    case 'stopped':
      return {
        title: a.daysSince !== null ? `停药第 ${a.daysSince + 1} 天` : '停药后的维持期',
        body: `每周称 2–3 次体重，看 7 天平均就好。蛋白和训练继续，这个阶段最适合把肌肉练回来。体重回升很常见，是生理现象，不是失败。`,
        tone: 'calm',
      };
    case 'normal':
      return a.train
        ? { title: '今天适合练一次', body: `15–25 分钟就够，每周 2–3 次，帮你守住肌肉。${proteinLine}`, tone: 'calm' }
        : { title: '今天照常过', body: `${proteinLine || '按平时的节奏吃饭。'}累了就散散步。`, tone: 'calm' };
  }
}

/** English text. PENDING CLINICAL REVIEW. */
function adviceTextEn(a: Advice, protein: ProteinTarget, opts: { oral: boolean }): AdviceText {
  const floor = floorOf(protein);
  // The protein sentence, with a trailing space so it can sit in front of the next sentence.
  const proteinLine = floor ? `Get your ${floor} g of protein first, spread over 3–4 meals or snacks. ` : '';
  switch (a.kind) {
    case 'triage':
      return {
        title: 'Take care of your body first today',
        body: 'What you logged today may need a doctor. Workout and food tips are paused for today. If you can drink, take small sips of water.',
        tone: 'alert',
      };
    case 'dose_day':
      if (a.status === 'overdue')
        return {
          title: 'Did you forget to log it?',
          body: opts.oral
            ? 'It is past your pill time and nothing is logged. If you took it, log it now. If you missed it, follow the instructions that came with your medication, or ask your doctor.'
            : 'It is past your shot time and nothing is logged. If you took it, log it now. If you missed it, go by the instructions that came with your medication. If you are not sure, ask your doctor.',
          tone: 'warn',
        };
      return {
        title: opts.oral ? 'Remember your pill today' : 'Today is shot day',
        body: opts.oral
          ? 'Take it on time, then log it.'
          : `Log your shot after you take it, and use a different site from last time. If your appetite is low for a day or two after the shot: ${floor ? `get your ${floor} g of protein first, spread over 3–4 meals or snacks.` : 'try smaller meals, more often.'}`,
        tone: 'calm',
      };
    case 'escalation':
      return {
        title: `Day ${a.dayOfEscalation} after a dose increase`,
        body: `Side effects are often more noticeable in the two weeks after a dose increase. Eat small meals more often and drink plenty of water. ${proteinLine}Switch your workout to the 15-minute light version.`,
        tone: 'calm',
      };
    case 'high_symptom':
      return {
        title: 'Today may be a bit harder',
        body: `Going by your logs from the past few weeks, side effects are often more noticeable on day ${a.offset} after your shot. ${proteinLine}Switch your workout to the light version, or move it to another day.`,
        tone: 'calm',
      };
    case 'protein_low':
      return {
        title: 'Protein has been low the last few days',
        body: `You have been under ${a.floorG} g for ${a.days} days in a row. Try eating the protein part of each meal first, or add a glass of milk or a scoop of protein powder.`,
        tone: 'warn',
      };
    case 'stopped':
      return {
        title: a.daysSince !== null ? `Day ${a.daysSince + 1} off your medication` : 'After stopping your medication',
        body: 'Weigh yourself 2–3 times a week and watch the 7-day average. Keep up your protein and workouts. Some weight regain is very common. It is how the body works, not a failure.',
        tone: 'calm',
      };
    case 'normal':
      return a.train
        ? { title: 'A good day for a workout', body: `15–25 minutes is enough, 2–3 times a week. ${proteinLine}`.trim(), tone: 'calm' }
        : { title: 'A regular day today', body: `${proteinLine || 'Eat the way you usually do. '}If you get tired, take an easy walk.`, tone: 'calm' };
  }
}
