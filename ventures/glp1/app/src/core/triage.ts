/**
 * 危险症状分诊（PRD v2.0 附录 B）。固定规则，不经过 AI，可测试。
 * 原则：宁可多提醒，不可漏掉。文案统一为"可能需要尽快看医生"，不做诊断。
 * 【上线前必须由医生或药师审核】关键词、级别和卡片文案。
 */
import type { Region } from './catalog';

export type TriageLevel = 'emergency' | 'act_now' | 'urgent' | 'contact' | 'remind' | 'care' | 'crisis';

export type TriageId =
  | 'crisis'
  | 'pancreatitis'
  | 'chest_or_faint'
  | 'anaphylaxis'
  | 'vision'
  | 'hypoglycemia'
  | 'dehydration'
  | 'gallbladder'
  | 'thyroid'
  | 'pregnancy'
  | 'procedure'
  | 'contraception'
  | 'eating_too_little'
  | 'abdominal_pain_severe';

export interface TriageContext {
  /** 在用胰岛素或磺脲类降糖药。 */
  insulinOrSU: boolean;
  drugId: string | null;
  region: Region;
}

export interface TriageHit {
  id: TriageId;
  level: TriageLevel;
}

const RANK: Record<TriageLevel, number> = {
  crisis: 0,
  emergency: 1,
  act_now: 2,
  urgent: 3,
  contact: 4,
  care: 5,
  remind: 6,
};

export function levelRank(l: TriageLevel): number {
  return RANK[l];
}

const NEG = /[不没沒无無未别別]/;

/** 匹配位置前 3 个字里有否定词（"没有剧痛"），视为否定。 */
function matchesPositive(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    if (!NEG.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

const any = (text: string, res: RegExp[]) => res.some((r) => matchesPositive(text, r));

const ABDOMEN = '(上腹|胃|肚子|腹部|腹|心窝|心窩|肚脐|肚臍)';
const SEVERE = '(剧痛|劇痛|绞痛|絞痛|疼得(厉|厲)害|痛得(厉|厲)害|疼死|痛死|受不了|直不起腰|疼得要命|痛得要命|撕裂)';

const RULES: { id: TriageId; level: TriageLevel | ((c: TriageContext) => TriageLevel); when?: (c: TriageContext) => boolean; test: (t: string, c: TriageContext) => boolean }[] = [
  {
    id: 'crisis',
    level: 'crisis',
    test: (t) =>
      /(想死|不想活|自杀|自殺|轻生|輕生|结束生命|結束生命|活着没意思|活著沒意思|活着没有意义|活著沒有意義)/.test(t) ||
      /(suicid|kill myself|end my life|want to die)/i.test(t),
  },
  {
    id: 'pancreatitis',
    level: 'emergency',
    test: (t) =>
      any(t, [new RegExp(`${ABDOMEN}.{0,6}${SEVERE}`), /(severe|unbearable|excruciating|terrible|really bad|worst).{0,20}(stomach|abdominal|abdomen|belly|tummy)\s*(pain|ache)/i]) ||
      (new RegExp(ABDOMEN).test(t) && any(t, [/(疼|痛).{0,6}(到|连|連|窜|竄|放射).{0,3}(后背|後背|背)/, /(后背|後背).{0,4}(也|一起|跟着|跟著)?.{0,2}(疼|痛)/])) ||
      /(stomach|abdominal|belly).{0,30}pain.{0,40}\bback\b/i.test(t),
  },
  {
    id: 'chest_or_faint',
    level: 'emergency',
    test: (t) =>
      any(t, [/(胸痛|胸口(剧痛|劇痛|疼得|痛得|压着疼|壓著痛|像压|像壓))/, /(晕倒|暈倒|昏过去|昏過去|失去意识|失去意識|昏迷)/]) ||
      /(chest pain|passed out|fainted|unconscious)/i.test(t),
  },
  {
    id: 'anaphylaxis',
    level: 'emergency',
    test: (t) =>
      any(t, [
        /(嘴唇|喉咙|喉嚨|舌头|舌頭|脸|臉|眼皮).{0,4}(肿|腫)/,
        /(喘不上气|喘不上氣|喘不过气|喘不過氣|呼吸困难|呼吸困難|透不过气|透不過氣|上不来气|上不來氣)/,
        /全身.{0,4}(起疹|疹子|风团|風團|荨麻疹|蕁麻疹)/,
      ]) ||
      /((throat|lips?|tongue|face).{0,10}(swell|swollen))|((can't|cannot|hard to|trouble|difficulty) breath)/i.test(t),
  },
  {
    id: 'vision',
    level: 'emergency',
    test: (t) =>
      any(t, [
        /(突然|忽然).{0,6}(看不清|看不见|看不見|模糊|失明|黑了)/,
        /(一只眼|一隻眼|单眼|單眼|左眼|右眼).{0,6}(看不清|看不见|看不見|模糊|失明|发黑|發黑|黑了)/,
        /(视野|視野).{0,4}(缺|黑|少了|挡住|擋住)/,
      ]) || /((sudden(ly)?|one eye).{0,20}(vision|blurr|can't see|cannot see|blind))|(vision loss|lost vision|losing vision)/i.test(t),
  },
  {
    id: 'hypoglycemia',
    level: (c) => (c.insulinOrSU ? 'act_now' : 'urgent'),
    test: (t) => {
      if (/(低血糖|血糖(很|太|特别|特別)?低|hypoglyc|low blood sugar)/i.test(t)) return true;
      const signs = [/手抖|发抖|發抖|shaky|shaking/i, /冷汗|cold sweat/i, /心慌|心悸|palpitat/i, /发懵|發懵|意识模糊|意識模糊|糊涂|糊塗|confus/i];
      return signs.filter((r) => r.test(t)).length >= 2;
    },
  },
  {
    id: 'dehydration',
    level: 'urgent',
    test: (t) =>
      any(t, [
        /(一直|不停|不断|不斷|反复|反覆|止不住).{0,3}(吐|拉|呕|嘔|腹泻|腹瀉)/,
        /(吐|拉肚子|拉|腹泻|腹瀉)了?.{0,3}(一整天|整天|一天一夜|好几次|好幾次|[五六七八九十]+次|十几次|十幾次|(\d{2}|[5-9])次)/,
        /(喝水|喝什么|喝什麼|喝点|喝點|吃什么|吃什麼).{0,3}(也|都|就).{0,2}吐/,
        /(一天|整天|一整天|24\s*小[时時]).{0,6}(没|沒).{0,3}(尿|小便)/,
        /(尿很少|尿少|没怎么尿|沒怎麼尿|尿不出)/,
        /(站起来|站起來|起身).{0,6}(眼前发黑|眼前發黑|发晕|發暈|头晕|頭暈)/,
      ]) || /(can't keep (water|anything|fluids) down|(vomit(ing|ed)?|throwing up).{0,10}(all day|nonstop|non-stop|24 hours)|haven't (peed|urinated))/i.test(t),
  },
  {
    id: 'gallbladder',
    level: 'urgent',
    test: (t) =>
      any(t, [/(右上腹|右肋|右边肋骨|右邊肋骨).{0,8}(疼|痛)/, /(眼白|皮肤|皮膚).{0,4}(发黄|發黃|变黄|變黃|黄了|黃了)/, /(黄疸|黃疸)/]) ||
      /(jaundice|yellow (skin|eyes)|right upper (abdominal )?pain)/i.test(t),
  },
  {
    id: 'thyroid',
    level: 'urgent',
    test: (t) =>
      any(t, [/(脖子|颈部|頸部).{0,6}(肿块|腫塊|硬块|硬塊|鼓包|肿了|腫了)/, /(吞咽困难|吞嚥困難|咽不下去|吞不下去)/, /(声音嘶哑|聲音嘶啞|嗓子哑|嗓子啞).{0,8}(一直|好久|几周|幾週|几个星期|幾個星期)/]) ||
      /((lump|swelling) (in|on) (my )?neck|(trouble|difficulty) swallowing|hoarse for weeks)/i.test(t),
  },
  {
    id: 'pregnancy',
    level: 'contact',
    test: (t) => any(t, [/(怀孕|懷孕|备孕|備孕|验孕|驗孕|两道杠|兩道槓|哺乳期|喂奶|餵奶)/]) || /(pregnan|breastfeed|trying to conceive)/i.test(t),
  },
  {
    id: 'procedure',
    level: 'remind',
    test: (t) => any(t, [/(手术|手術|全麻|麻醉|胃镜|胃鏡|肠镜|腸鏡|内镜|內鏡)/]) || /(surgery|an(a)?esthesia|endoscopy|colonoscopy)/i.test(t),
  },
  {
    id: 'contraception',
    level: 'remind',
    when: (c) => c.drugId === 'tirzepatide',
    test: (t) => any(t, [/(避孕药|避孕藥|口服避孕|短效避孕)/]) || /(birth control pill|oral contracept)/i.test(t),
  },
  {
    id: 'eating_too_little',
    level: 'care',
    test: (t) =>
      any(t, [/(好几天|好幾天|几天|幾天|连续|連續|整整).{0,6}(几乎|幾乎|都)?.{0,3}(吃不下|没吃|沒吃|没怎么吃|沒怎麼吃|吃不进|吃不進)/]) ||
      /((haven't|have not|barely|hardly) (eaten|eat).{0,15}(days|\d+ days))/i.test(t),
  },
];

export function triageText(text: string, ctx: TriageContext): TriageHit[] {
  const t = text.trim();
  if (!t) return [];
  const hits: TriageHit[] = [];
  for (const r of RULES) {
    if (r.when && !r.when(ctx)) continue;
    if (r.test(t, ctx)) hits.push({ id: r.id, level: typeof r.level === 'function' ? r.level(ctx) : r.level });
  }
  return hits.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export type SymptomKind =
  | 'nausea'
  | 'vomiting'
  | 'reflux'
  | 'constipation'
  | 'diarrhea'
  | 'no_appetite'
  | 'fatigue'
  | 'dizziness'
  | 'abdominal_pain'
  | 'hair_loss'
  | 'injection_site'
  | 'mood'
  | 'menstrual';

/** 快捷记录的症状打分（0–3）触发的分诊。 */
export function triageSymptom(kind: SymptomKind, grade: number, ctx: TriageContext): TriageHit[] {
  if (grade < 3) return [];
  if (kind === 'vomiting' || kind === 'diarrhea') return [{ id: 'dehydration', level: 'urgent' }];
  if (kind === 'abdominal_pain') return [{ id: 'abdominal_pain_severe', level: 'urgent' }];
  if (kind === 'dizziness' && ctx.insulinOrSU) return [{ id: 'hypoglycemia', level: 'act_now' }];
  return [];
}

/** 急救电话（【待核实】）。 */
export const EMERGENCY_NUMBER: Record<Region, string> = {
  CN: '120',
  HK: '999',
  TW: '119',
  US: '911',
  SG: '995',
  MY: '999',
  OTHER: '当地急救电话',
};

/** 心理危机热线（【待核实】，上线前逐条拨测）。 */
export const CRISIS_LINE: Record<Region, string> = {
  CN: '12356（全国心理援助热线）',
  HK: '2389 2222（撒玛利亚防止自杀会）',
  TW: '1925（安心专线）',
  US: '988',
  SG: '1767（Samaritans of Singapore）',
  MY: '15999（Talian Kasih）',
  OTHER: '当地心理援助热线',
};

export interface TriageCard {
  title: string;
  body: string;
  /** 卡片上是否显示急救电话。 */
  showEmergency: boolean;
  /** 触发后是否暂停当天的训练和饮食提醒。 */
  pauseCoaching: boolean;
}

export function triageCard(hit: TriageHit, region: Region): TriageCard {
  const em = EMERGENCY_NUMBER[region];
  switch (hit.id) {
    case 'crisis':
      return {
        title: '你不是一个人',
        body: `如果你有伤害自己的想法，请现在就联系能帮你的人：心理援助热线 ${CRISIS_LINE[region]}。有立即的危险，请拨打 ${em}。`,
        showEmergency: true,
        pauseCoaching: true,
      };
    case 'pancreatitis':
      return { title: '这种腹痛需要马上看医生', body: `上腹剧烈疼痛、疼到后背（可能伴呕吐）可能和胰腺有关。请马上去急诊，必要时拨打 ${em}。今天的训练和饮食提醒先暂停。`, showEmergency: true, pauseCoaching: true };
    case 'abdominal_pain_severe':
      return { title: '剧烈或持续的腹痛，请尽快看医生', body: `如果疼到后背、伴呕吐，或越来越重，请马上去急诊（${em}）。今天的训练先暂停。`, showEmergency: true, pauseCoaching: true };
    case 'chest_or_faint':
      return { title: '请立即就医', body: `胸痛或晕倒需要马上处理，请拨打 ${em}。`, showEmergency: true, pauseCoaching: true };
    case 'anaphylaxis':
      return { title: '可能是严重过敏', body: `嘴唇或喉咙肿、喘不上气、全身起疹子，请立即拨打 ${em}。`, showEmergency: true, pauseCoaching: true };
    case 'vision':
      return { title: '视力突然变化，请马上就医', body: `一只眼突然看不清或视野缺了一块，请马上去眼科或急诊（${em}），并告诉医生你在用 GLP-1 类药物。`, showEmergency: true, pauseCoaching: true };
    case 'hypoglycemia':
      return hit.level === 'act_now'
        ? { title: '可能是低血糖，先处理', body: `先吃 15 克糖（比如半杯果汁或 3–4 块方糖），15 分钟后不缓解或更糟，请就医（${em}），并联系你的医生。`, showEmergency: true, pauseCoaching: true }
        : { title: '这些症状建议问问医生', body: '手抖、出冷汗、心慌同时出现，可能和血糖有关。如果反复出现，请尽快看医生。', showEmergency: false, pauseCoaching: true };
    case 'dehydration':
      return { title: '小心脱水', body: `一直吐或拉、喝水也吐、尿很少、站起来眼前发黑，有脱水和伤肾的风险，请尽快就医。先别勉强喝蛋白饮料，能喝就小口喝水或补液盐。`, showEmergency: true, pauseCoaching: true };
    case 'gallbladder':
      return { title: '请尽快看医生', body: '右上腹疼、发烧、眼白或皮肤发黄，可能和胆囊有关。', showEmergency: false, pauseCoaching: true };
    case 'thyroid':
      return { title: '请尽快看医生', body: '脖子摸到肿块、吞咽困难或声音嘶哑一直不好，请告诉医生你在用这类药。', showEmergency: false, pauseCoaching: false };
    case 'pregnancy':
      return { title: '请联系开药的医生', body: '怀孕、备孕或哺乳期间用药需要医生评估（司美格鲁肽说明书要求计划怀孕前至少停药 2 个月）。减重目标已暂停。', showEmergency: false, pauseCoaching: false };
    case 'procedure':
      return { title: '提前告诉医生', body: '要做手术、全麻、胃镜或肠镜，请提前告诉医生和麻醉医生你在用 GLP-1 类药物。', showEmergency: false, pauseCoaching: false };
    case 'contraception':
      return { title: '说明书里的一条提醒', body: '替尔泊肽说明书建议：开始用药和每次加量后的 4 周内，口服避孕药之外加用其他避孕方式。', showEmergency: false, pauseCoaching: false };
    case 'eating_too_little':
      return { title: '吃得太少了，照顾好自己', body: '连续多天几乎吃不下东西，建议和医生或营养师聊聊。减重目标先放一放，先保证喝水和一点蛋白。', showEmergency: false, pauseCoaching: false };
  }
}
