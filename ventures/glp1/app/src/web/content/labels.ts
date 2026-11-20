import type { Region } from '../../core/catalog';
import type { Site } from '../../core/schedule';
import type { SymptomKind } from '../../core/triage';
import type { CourseStatus } from '../../core/types';

export const SITE_LABEL: Record<Site, string> = {
  abd_l: '左腹',
  abd_r: '右腹',
  thigh_l: '左大腿',
  thigh_r: '右大腿',
  arm_l: '左上臂',
  arm_r: '右上臂',
};

export const SYMPTOMS: { kind: SymptomKind; label: string }[] = [
  { kind: 'nausea', label: '恶心' },
  { kind: 'vomiting', label: '呕吐' },
  { kind: 'reflux', label: '反酸打嗝' },
  { kind: 'constipation', label: '便秘' },
  { kind: 'diarrhea', label: '腹泻' },
  { kind: 'abdominal_pain', label: '肚子疼' },
  { kind: 'no_appetite', label: '没胃口' },
  { kind: 'fatigue', label: '疲劳' },
  { kind: 'dizziness', label: '头晕' },
  { kind: 'hair_loss', label: '脱发' },
  { kind: 'injection_site', label: '注射部位红肿' },
  { kind: 'mood', label: '情绪低落' },
  { kind: 'menstrual', label: '月经变化' },
];

export const symptomLabel = (k: string) => SYMPTOMS.find((s) => s.kind === k)?.label ?? '不舒服';

export const GRADE_LABEL = ['没有', '轻', '中', '重'];

export const STATUS_LABEL: Record<CourseStatus, string> = {
  not_started: '还没开始',
  escalating: '加量中',
  maintenance: '维持剂量',
  paused: '暂停中',
  stopped: '已停药',
};

export const REGION_LABEL: Record<Region, string> = {
  CN: '中国大陆',
  HK: '香港',
  TW: '台湾',
  SG: '新加坡',
  MY: '马来西亚',
  US: '美国',
  OTHER: '其他地区',
};

export const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const DISCLAIMER = '内容仅供参考，不构成医疗建议；调整用药或训练前请咨询医生。';
