/**
 * 应对卡（PRD v2.0 附录 C）。第一天先做 4 张。
 * 【上线前必须由医生或药师审核】
 *
 * English text: a line-by-line translation of the Chinese cards, PENDING CLINICAL REVIEW.
 * Keep the two languages in step: same lines, same order, same meaning.
 */
import { pick, type Lang, type Text } from '../../core/i18n';
import type { SymptomKind } from '../../core/triage';

export interface CopingCard {
  id: string;
  title: string;
  forSymptoms: SymptomKind[];
  tryFirst: string[];
  avoid: string[];
  seeDoctor: string[];
  sources: string[];
}

interface CopingSource {
  id: string;
  title: Text;
  forSymptoms: SymptomKind[];
  tryFirst: Text[];
  avoid: Text[];
  seeDoctor: Text[];
}

// The English source line names the active ingredients, not the brands.
const SOURCES: Text[] = [
  { hans: '药品说明书：Wegovy、Zepbound 患者用药信息（FDA）', en: 'FDA patient information for semaglutide and tirzepatide injections for weight management' },
  { hans: 'ACLM/ASN/OMA/TOS 2025 年 GLP-1 营养与生活方式联合建议', en: 'ACLM/ASN/OMA/TOS 2025 joint advisory on nutrition and lifestyle with GLP-1 medications' },
];

const CARDS: CopingSource[] = [
  {
    id: 'nausea',
    title: { hans: '恶心、想吐', en: 'Nausea, feeling like throwing up' },
    forSymptoms: ['nausea', 'vomiting', 'reflux'],
    tryFirst: [
      { hans: '少量多餐，一次吃到"刚好不饿"就停，吃慢一点', en: 'Eat small meals more often. Stop when you are just no longer hungry, and eat slowly' },
      { hans: '选清淡、凉一点、气味小的食物：白粥、苏打饼、酸奶、豆腐', en: 'Choose bland, cooler foods without strong smells: plain rice porridge, saltine crackers, yogurt, tofu' },
      { hans: '吃完别马上躺下，饭后至少隔 2 小时再睡', en: 'Do not lie down right after eating. Wait at least 2 hours after a meal before you sleep' },
      { hans: '小口多次喝水', en: 'Take small sips of water often' },
    ],
    avoid: [
      { hans: '油腻、油炸、太辣、太甜的东西', en: 'Greasy, fried, very spicy or very sweet foods' },
      { hans: '一次喝大量饮料', en: 'Drinking a lot at one time' },
      { hans: '吃撑', en: 'Eating until you are too full' },
    ],
    seeDoctor: [
      { hans: '吐得喝水都留不住，或尿很少', en: 'You vomit so much that you cannot keep water down, or you pass very little urine' },
      { hans: '肚子剧烈疼，或疼到后背', en: 'Severe stomach pain, or pain that reaches your back' },
      { hans: '加量后一直不缓解', en: 'It does not ease up after a dose increase' },
    ],
  },
  {
    id: 'constipation',
    title: { hans: '便秘', en: 'Constipation' },
    forSymptoms: ['constipation'],
    tryFirst: [
      { hans: '多喝水，饮水量比平时多一些', en: 'Drink more water than you usually do' },
      { hans: '纤维慢慢加：蔬菜、燕麦、豆类、水果，别一下子加很多', en: 'Add fiber slowly: vegetables, oats, beans, fruit. Do not add a lot all at once' },
      { hans: '每天走一走，饭后散步 10–15 分钟', en: 'Walk every day. Take a 10–15 minute walk after meals' },
    ],
    avoid: [
      { hans: '水喝太少', en: 'Drinking too little water' },
      { hans: '一次性大量补纤维（会更胀）', en: 'Adding a lot of fiber all at once (it makes bloating worse)' },
    ],
    seeDoctor: [
      { hans: '超过 3 天没有排便，同时肚子疼、呕吐或明显腹胀', en: 'No bowel movement for more than 3 days, together with stomach pain, vomiting or a lot of bloating' },
      { hans: '便里有血或黑便', en: 'Blood in your stool, or black stool' },
      { hans: '用了通便方法还是不行，先问医生或药师', en: 'You have tried ways to relieve constipation and they have not worked (ask your doctor or pharmacist first)' },
    ],
  },
  {
    id: 'no_appetite',
    title: { hans: '没胃口、吃不下', en: 'No appetite, hard to eat' },
    forSymptoms: ['no_appetite'],
    tryFirst: [
      { hans: '先吃蛋白：每餐先吃鸡蛋、豆腐、鱼肉，再吃主食', en: 'Protein first: at each meal eat the eggs, tofu, fish or meat before the rice, bread or noodles' },
      { hans: '吃不下固体就喝：牛奶、无糖豆浆、蛋白粉', en: 'If you cannot eat solid food, drink it: milk, unsweetened soy milk, protein powder' },
      { hans: '定时吃，每 3–4 小时吃一点，不等饿了才吃', en: 'Eat by the clock: a little every 3–4 hours. Do not wait until you feel hungry' },
      { hans: '先保住"最低线"，理想线以后再说', en: 'Reach your minimum first. The ideal range can wait' },
    ],
    avoid: [
      { hans: '一整天不吃，晚上一次吃很多', en: 'Eating nothing all day and then a lot at night' },
      { hans: '只吃零食和主食', en: 'Eating only snacks and starchy foods' },
    ],
    seeDoctor: [
      { hans: '连续好几天几乎吃不下', en: 'You can barely eat for several days in a row' },
      { hans: '体重掉得太快（每周超过 1.5%），或总是头晕没力气', en: 'Your weight is dropping too fast (more than 1.5% a week), or you are always dizzy and weak' },
    ],
  },
  {
    id: 'fatigue',
    title: { hans: '疲劳、没力气', en: 'Tired, no energy' },
    forSymptoms: ['fatigue', 'dizziness'],
    tryFirst: [
      { hans: '检查今天水喝够没有、蛋白吃够没有', en: 'Check whether you have had enough water and enough protein today' },
      { hans: '训练换成轻量版或改天，散步也算', en: 'Switch your workout to the light version or move it to another day. A walk counts too' },
      { hans: '睡够，固定作息', en: 'Get enough sleep and keep a regular schedule' },
    ],
    avoid: [
      { hans: '空腹做高强度运动', en: 'Hard exercise on an empty stomach' },
      { hans: '起身太快', en: 'Standing up too fast' },
    ],
    seeDoctor: [
      { hans: '站起来眼前发黑、心慌', en: 'Your vision goes dark or your heart pounds when you stand up' },
      { hans: '在用胰岛素或磺脲类药，出现手抖出汗', en: 'You take insulin or a sulfonylurea diabetes medication and you get shaky and sweaty' },
      { hans: '疲劳一直不缓解或越来越重', en: 'The tiredness does not ease up, or keeps getting worse' },
    ],
  },
];

function localize(c: CopingSource, lang: Lang): CopingCard {
  const all = (xs: Text[]) => xs.map((x) => pick(lang, x));
  return { id: c.id, title: pick(lang, c.title), forSymptoms: c.forSymptoms, tryFirst: all(c.tryFirst), avoid: all(c.avoid), seeDoctor: all(c.seeDoctor), sources: all(SOURCES) };
}

/**
 * Ids of the cards, in display order. The same in every language.
 * The call is marked pure so a build that shows no coping cards can leave this whole file out.
 */
export const COPING_IDS: string[] = /*#__PURE__*/ CARDS.map((c) => c.id);

export function copingCards(lang: Lang): CopingCard[] {
  return CARDS.map((c) => localize(c, lang));
}

export function copingById(id: string, lang: Lang): CopingCard | undefined {
  const c = CARDS.find((x) => x.id === id);
  return c && localize(c, lang);
}

export function copingFor(kind: SymptomKind | 'other', lang: Lang): CopingCard | undefined {
  const c = CARDS.find((x) => x.forSymptoms.includes(kind as SymptomKind));
  return c && localize(c, lang);
}
