/**
 * 应对卡（PRD v2.0 附录 C）。第一天先做 4 张。
 * 【上线前必须由医生或药师审核】
 */
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

const SOURCES = [
  '药品说明书：Wegovy、Zepbound 患者用药信息（FDA）',
  'ACLM/ASN/OMA/TOS 2025 年 GLP-1 营养与生活方式联合建议',
];

export const COPING: CopingCard[] = [
  {
    id: 'nausea',
    title: '恶心、想吐',
    forSymptoms: ['nausea', 'vomiting', 'reflux'],
    tryFirst: [
      '少量多餐，一次吃到"刚好不饿"就停，吃慢一点',
      '选清淡、凉一点、气味小的食物：白粥、苏打饼、酸奶、豆腐',
      '吃完别马上躺下，饭后至少隔 2 小时再睡',
      '小口多次喝水',
    ],
    avoid: ['油腻、油炸、太辣、太甜的东西', '一次喝大量饮料', '吃撑'],
    seeDoctor: ['吐得喝水都留不住，或尿很少', '肚子剧烈疼，或疼到后背', '加量后一直不缓解'],
    sources: SOURCES,
  },
  {
    id: 'constipation',
    title: '便秘',
    forSymptoms: ['constipation'],
    tryFirst: ['多喝水，饮水量比平时多一些', '纤维慢慢加：蔬菜、燕麦、豆类、水果，别一下子加很多', '每天走一走，饭后散步 10–15 分钟'],
    avoid: ['水喝太少', '一次性大量补纤维（会更胀）'],
    seeDoctor: ['超过 3 天没有排便，同时肚子疼、呕吐或明显腹胀', '便里有血或黑便', '用了通便方法还是不行，先问医生或药师'],
    sources: SOURCES,
  },
  {
    id: 'no_appetite',
    title: '没胃口、吃不下',
    forSymptoms: ['no_appetite'],
    tryFirst: [
      '先吃蛋白：每餐先吃鸡蛋、豆腐、鱼肉，再吃主食',
      '吃不下固体就喝：牛奶、无糖豆浆、蛋白粉',
      '定时吃，每 3–4 小时吃一点，不等饿了才吃',
      '先保住"最低线"，理想线以后再说',
    ],
    avoid: ['一整天不吃，晚上一次吃很多', '只吃零食和主食'],
    seeDoctor: ['连续好几天几乎吃不下', '体重掉得太快（每周超过 1.5%），或总是头晕没力气'],
    sources: SOURCES,
  },
  {
    id: 'fatigue',
    title: '疲劳、没力气',
    forSymptoms: ['fatigue', 'dizziness'],
    tryFirst: ['检查今天水喝够没有、蛋白吃够没有', '训练换成轻量版或改天，散步也算', '睡够，固定作息'],
    avoid: ['空腹做高强度运动', '起身太快'],
    seeDoctor: ['站起来眼前发黑、心慌', '在用胰岛素或磺脲类药，出现手抖出汗', '疲劳一直不缓解或越来越重'],
    sources: SOURCES,
  },
];

export function copingFor(kind: SymptomKind | 'other'): CopingCard | undefined {
  return COPING.find((c) => c.forSymptoms.includes(kind as SymptomKind));
}
