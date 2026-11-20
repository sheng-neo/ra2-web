/**
 * "今天这样过"卡片的文案（PRD v2.0 第 2.2 节）。事先写好，【待审核】。
 */
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

export function adviceText(a: Advice, protein: ProteinTarget, opts: { oral: boolean }): AdviceText {
  const floor = floorOf(protein);
  const proteinLine = floor ? `先保住 ${floor} 克蛋白，分 3–4 次吃。` : '';
  switch (a.kind) {
    case 'triage':
      return { title: '先处理身体的情况', body: '你刚才记录的情况可能需要看医生，详情见上面的提醒。今天的训练和饮食建议先暂停。', tone: 'alert' };
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
