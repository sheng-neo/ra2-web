import { describe, expect, it } from 'vitest';
import golden from './triage.golden.hans.json';
import {
  crisisLine,
  emergencyDial,
  emergencyNumber,
  pausesCoaching,
  triageCard,
  triageSymptom,
  triageText,
  type TriageContext,
  type TriageHit,
  type TriageId,
} from './triage';
import type { Region } from './catalog';

const ctx: TriageContext = { insulinOrSU: false, drugId: 'semaglutide-wl', region: 'CN' };
const top = (t: string, c: TriageContext = ctx) => triageText(t, c)[0]?.id ?? null;

/** PRD 验收标准第 5 条：附录 B 每一行至少 3 种说法都要触发。 */
const MUST_TRIGGER: Record<string, string[]> = {
  pancreatitis: [
    '上腹剧痛，还吐了',
    '肚子疼得受不了，疼到后背',
    '胃绞痛直不起腰',
    '上腹劇痛',
    'severe stomach pain going to my back',
    "my stomach hurts so bad I can't stand up straight",
    'terrible pain in my upper abdomen',
    'belly pain that goes through to my back',
    'the worst stomach ache of my life',
    // pain that goes on, or is told over two sentences
    "stomach pain that won't go away and goes to my back",
    "abdominal pain that doesn't stop, radiating to my back",
    'Bad stomach pain. It goes to my back.',
    'stomach pain wrapping around my back',
    'stomach pain and now my back',
    'stomach pain, not severe, but it goes to my back',
    // other everyday words for severe
    'my stomach is in so much pain',
    'stabbing pain in my stomach',
    // "never ... like this" says the pain is there now
    'never had severe stomach pain like this before',
    "I've never had severe stomach pain like this",
  ],
  chest_or_faint: [
    '胸痛',
    '刚才晕倒了',
    '胸口疼得厉害',
    'I passed out after the shot',
    'chest pain since this morning',
    'I fainted in the shower',
    'pressure in my chest',
    'my chest hurts',
    'pressure on my chest',
    'heavy feeling on my chest',
    // a negation that the rest of the sentence takes back
    "I've never had chest pain like this",
    'never had chest pain like this before',
    "I've never had chest pain this bad",
    "haven't had chest pain like this in years",
    "I didn't have chest pain until tonight",
    'no chest pain until now',
    'I never fainted before today',
    'never fainted before but I just did',
    'I never get chest pain, but today I do',
    "I didn't have chest pain yesterday but I do now",
    'I never get chest pain. But today I do.',
    "wasn't unconscious long",
    "isn't chest pain serious?",
  ],
  anaphylaxis: [
    '嘴唇肿了喘不上气',
    '喉咙肿',
    '全身起疹子',
    'my throat is swelling',
    "I can't breathe",
    'hives all over my body',
    'swelling of my lips and tongue',
    'my face is swollen',
    'throat closing',
    'my lips are tingling and swelling',
    "I've never had my lips swell like this",
    'I have never had my throat swell like this',
    'never had trouble breathing like this',
  ],
  vision: ['一只眼突然看不清了', '右眼看东西模糊', '视野缺了一块', 'sudden vision loss in one eye', 'my right eye is blurry', "suddenly I can't see clearly", 'part of my vision is missing'],
  hypoglycemia: ['低血糖了', '手抖出冷汗心慌', '血糖很低', 'I think my blood sugar is low', 'shaky and in a cold sweat', 'low blood sugar', 'heart racing and I feel confused', 'my glucose dropped', 'sugar crashed', 'never had blood sugar this low'],
  dehydration: [
    '吐了一整天，喝水也吐',
    '一直拉肚子',
    '一天没怎么尿',
    '站起来眼前发黑',
    '喝水都吐',
    "can't keep water down",
    "I've been throwing up all day",
    'diarrhea nonstop since last night',
    "I haven't peed all day",
    'dizzy when I stand up',
    'threw up 6 times today',
    'everything I eat comes back up',
    // nausea that does not go away is named in the Medication Guides next to vomiting and diarrhea
    'constantly nauseous, no vomiting',
    "nausea that won't go away",
  ],
  gallbladder: ['右上腹疼还发烧', '眼白发黄', '皮膚變黃', 'jaundice', 'my eyes look yellow', 'pain in my upper right abdomen', 'my skin is turning yellow', 'pain under my right ribs'],
  thyroid: ['脖子摸到一个肿块', '吞咽困难', '声音嘶哑好久了', 'lump in my neck', 'trouble swallowing', 'my voice has been hoarse for weeks', "it's hard to swallow", 'never had trouble swallowing until now'],
  pregnancy: ['我怀孕了', '在备孕能打吗', '哺乳期', 'I am pregnant', 'trying to get pregnant', 'I am breastfeeding', 'I think I might be pregnant', 'not pregnant yet', 'not pregnant but trying', 'not pregnant, but we are trying'],
  procedure: ['下周要做胃镜', '要全麻手术', '明天做肠镜', 'colonoscopy next week', 'I have surgery on Friday', 'going under anesthesia tomorrow', 'endoscopy scheduled for Monday', 'have not had surgery yet, it is next week'],
  eating_too_little: [
    '好几天几乎吃不下',
    '连续三天没怎么吃',
    '整整几天都没吃',
    "haven't eaten in 3 days",
    'I have barely eaten for the past four days',
    "for the last few days I can't eat anything",
    "couldn't eat for days",
  ],
  crisis: [
    '不想活了',
    '有点想死',
    '想自杀',
    'I want to die',
    'thinking about suicide',
    "I don't want to live anymore",
    'I want to kill myself',
    "I don't want to be here anymore",
    'I want to end it',
    'want to end things',
    'thinking of ending things',
    "I can't go on",
    "I can't go on like this",
  ],
};

const isEnglish = (s: string) => /^[\x20-\x7E]+$/.test(s);

describe('triage — must trigger', () => {
  for (const [id, phrases] of Object.entries(MUST_TRIGGER)) {
    for (const p of phrases) {
      it(`${id}: ${p}`, () => {
        expect(triageText(p, ctx).map((h) => h.id)).toContain(id as TriageId);
      });
    }
    it(`${id}: has at least three Chinese and three English phrasings`, () => {
      expect(phrases.filter(isEnglish).length).toBeGreaterThanOrEqual(3);
      expect(phrases.filter((p) => !isEnglish(p)).length).toBeGreaterThanOrEqual(3);
    });
  }

  it('reads English typed on a phone: curly apostrophes, capitals, no apostrophes', () => {
    expect(top('I can’t breathe')).toBe('anaphylaxis');
    expect(top('I can’t keep any fluids down')).toBe('dehydration');
    expect(top('CHEST PAIN')).toBe('chest_or_faint');
    expect(top('havent peed since yesterday')).toBe('dehydration');
    expect(top('I don’t want to live')).toBe('crisis');
  });
});

describe('triage — must stay quiet on ordinary logs', () => {
  for (const p of ['早饭俩鸡蛋一杯豆浆', '有点恶心', '今天有点累', '刚打了 7.5，右大腿', '今早 81.6', '吐了一次', '肚子有点胀', '没有剧痛', '我没怀孕', '胃口很差']) {
    it(p, () => expect(triageText(p, ctx)).toEqual([]));
  }

  const ENGLISH_QUIET = [
    'a little nauseous',
    'threw up once',
    'took my shot, 5 mg, left thigh',
    '182.4 this morning',
    'not pregnant',
    'no severe pain',
    // more everyday lines
    'feeling tired today',
    'two eggs and a protein shake',
    'mild stomach ache after dinner',
    'stomach feels bloated',
    'my stomach pain is back',
    'back is sore from the gym',
    'upper right arm is sore after the shot',
    'injection site is a little red',
    'rash at the injection site',
    'itchy rash all over my thigh',
    'a little dizzy',
    'heart racing a bit',
    'threw up twice',
    'Took my shot this morning. Mild nausea. No vomiting.',
    'barely ate today',
    'skipped breakfast',
    'sore throat',
    "can't breathe through my nose",
    'chest day at the gym',
    'yellow squash for dinner',
    'vision is fine',
    'lost 2 pounds this week',
    'weighed 182.4',
    // near misses of the wider phrase lists
    "I can't go on a walk today",
    "can't go on vacation this month",
    "I don't want to be here at the gym",
    'had a sugar crash after lunch',
    'cut sugar, dropped 2 lb',
    'my face is red and my ankle is swollen',
    'my eyelids closed and I fell asleep',
    'sharp cheddar and stomach ache',
    'stomach ache. Went back to bed.',
    'stomach pain, but not to my back',
    'stomach pain while sitting in the back seat',
    'rested the bar on my chest',
  ];
  for (const p of ENGLISH_QUIET) {
    it(p, () => expect(triageText(p, { ...ctx, region: 'US' })).toEqual([]));
  }
});

describe('triage — English negation', () => {
  it('a negation right before the symptom keeps it quiet', () => {
    for (const p of ['no chest pain', "I don't have any chest pain", 'never had chest pain', 'no longer have chest pain', 'I’m not pregnant', 'I am not currently pregnant', 'no trouble breathing', 'no fever or chest pain', 'no low blood sugar', 'no jaundice', 'no surgery planned']) {
      expect(triageText(p, ctx), p).toEqual([]);
    }
  });

  it('a plain denial stays quiet even with a time word or another complaint after it', () => {
    for (const p of [
      'no chest pain today',
      'no chest pain now',
      'no chest pain for a long time',
      'no chest pain but nausea',
      'no chest pain but I have nausea',
      'no chest pain, but I feel sick',
      'No chest pain. But I do have nausea',
      'no chest pain, is that normal?',
      "I haven't fainted",
      'not unconscious',
      "I don't feel chest pain anymore",
      'not pregnant now',
      'not pregnant and not trying',
      'I do not have a lump in my neck',
      'never had surgery',
    ]) {
      expect(triageText(p, ctx), p).toEqual([]);
    }
  });

  it('a negation that the rest of the sentence takes back is a complaint, not a denial', () => {
    expect(top("I've never had chest pain like this")).toBe('chest_or_faint');
    expect(top('never felt chest pain this bad')).toBe('chest_or_faint');
    expect(top("I don't usually get chest pain but I have it now")).toBe('chest_or_faint');
    expect(top('I have never passed out before, just did')).toBe('chest_or_faint');
    expect(top('I was not unconscious long but I did pass out')).toBe('chest_or_faint');
    expect(top("I haven't been this short of breath before")).toBe('anaphylaxis');
    expect(top('never had severe stomach pain like this before')).toBe('pancreatitis');
    expect(top('vomiting, not stopping, all day')).toBe('dehydration');
  });

  it('a negation about something else does not hide the symptom', () => {
    expect(top('not feeling well, chest pain')).toBe('chest_or_faint');
    expect(top('not good chest pain')).toBe('chest_or_faint');
    expect(top('No vomiting. Chest pain though.')).toBe('chest_or_faint');
    expect(top('no nausea but chest pain since lunch')).toBe('chest_or_faint');
    expect(top('not sure if I am pregnant')).toBe('pregnancy');
    expect(top('not feeling well severe stomach pain')).toBe('pancreatitis');
    expect(top("no I'm having chest pain")).toBe('chest_or_faint');
    expect(top("I don't think it's chest pain")).toBe('chest_or_faint');
  });

  it('the crisis card ignores negation on purpose', () => {
    expect(top('I do not want to die')).toBe('crisis');
  });
});

describe('triage — context', () => {
  it('hypoglycemia is act-now only for insulin or sulfonylurea users', () => {
    expect(triageText('手抖出冷汗心慌', { ...ctx, insulinOrSU: true })[0]).toEqual({ id: 'hypoglycemia', level: 'act_now' });
    expect(triageText('手抖出冷汗心慌', ctx)[0]).toEqual({ id: 'hypoglycemia', level: 'urgent' });
    expect(triageText('有点心慌', ctx)).toEqual([]);
    expect(triageText('shaky and in a cold sweat', { ...ctx, insulinOrSU: true })[0]).toEqual({ id: 'hypoglycemia', level: 'act_now' });
    expect(triageText('shaky and in a cold sweat', ctx)[0]).toEqual({ id: 'hypoglycemia', level: 'urgent' });
    expect(triageText('feeling shaky after coffee', ctx)).toEqual([]);
  });

  it('the contraception reminder only applies to tirzepatide', () => {
    expect(top('我在吃避孕药', { ...ctx, drugId: 'tirzepatide' })).toBe('contraception');
    expect(top('我在吃避孕药', ctx)).toBeNull();
    for (const p of ["I'm on birth control pills", 'I take an oral contraceptive', "I'm on the pill"]) {
      expect(top(p, { ...ctx, drugId: 'tirzepatide' }), p).toBe('contraception');
      expect(top(p, ctx), p).toBeNull();
    }
  });

  it('sorts by severity: crisis, then emergencies', () => {
    expect(triageText('上腹剧痛，不想活了', ctx).map((h) => h.id)).toEqual(['crisis', 'pancreatitis']);
    expect(triageText('severe stomach pain and I want to die', ctx).map((h) => h.id)).toEqual(['crisis', 'pancreatitis']);
  });

  it('grade-3 quick logs trigger the matching card', () => {
    expect(triageSymptom('vomiting', 3, ctx)).toEqual([{ id: 'dehydration', level: 'urgent' }]);
    expect(triageSymptom('vomiting', 2, ctx)).toEqual([]);
    expect(triageSymptom('abdominal_pain', 3, ctx)[0].id).toBe('abdominal_pain_severe');
    // Severe nausea: the Medication Guides name it with vomiting and diarrhea.
    expect(triageSymptom('nausea', 3, ctx)).toEqual([{ id: 'dehydration', level: 'urgent', fixedCard: true }]);
    expect(triageSymptom('nausea', 2, ctx)).toEqual([]);
    // Severe dizziness raises the card for everyone ("fainting or feeling dizzy" in the guides);
    // a person on insulin or a sulfonylurea gets the low-blood-sugar hit, as before.
    expect(triageSymptom('dizziness', 3, ctx)).toEqual([{ id: 'dehydration', level: 'urgent', fixedCard: true }]);
    expect(triageSymptom('dizziness', 2, ctx)).toEqual([]);
    expect(triageSymptom('dizziness', 3, { ...ctx, insulinOrSU: true })).toEqual([{ id: 'hypoglycemia', level: 'act_now' }]);
    // Every other symptom raises nothing at any grade.
    for (const kind of ['reflux', 'constipation', 'no_appetite', 'fatigue', 'hair_loss', 'injection_site', 'mood', 'menstrual'] as const) expect(triageSymptom(kind, 3, ctx), kind).toEqual([]);
  });

  it('cards show the local emergency number', () => {
    expect(triageCard({ id: 'pancreatitis', level: 'emergency' }, 'TW', 'hans').body).toContain('119');
    expect(triageCard({ id: 'crisis', level: 'crisis' }, 'US', 'hans').body).toContain('988');
    expect(triageCard({ id: 'pancreatitis', level: 'emergency' }, 'US', 'en').body).toContain('911');
    expect(triageCard({ id: 'crisis', level: 'crisis' }, 'US', 'en').body).toContain('988');
  });
});

const ALL_HITS: TriageHit[] = [
  { id: 'crisis', level: 'crisis' },
  { id: 'pancreatitis', level: 'emergency' },
  { id: 'abdominal_pain_severe', level: 'urgent' },
  { id: 'chest_or_faint', level: 'emergency' },
  { id: 'anaphylaxis', level: 'emergency' },
  { id: 'vision', level: 'emergency' },
  { id: 'hypoglycemia', level: 'act_now' },
  { id: 'hypoglycemia', level: 'urgent' },
  { id: 'dehydration', level: 'urgent' },
  { id: 'gallbladder', level: 'urgent' },
  { id: 'thyroid', level: 'urgent' },
  { id: 'pregnancy', level: 'contact' },
  { id: 'procedure', level: 'remind' },
  { id: 'contraception', level: 'remind' },
  { id: 'eating_too_little', level: 'care' },
];
const REGIONS: Region[] = ['CN', 'TW', 'HK', 'US', 'SG', 'MY', 'OTHER'];

describe('triage cards — Chinese text is unchanged', () => {
  it('matches the cards as they were before English was added, character for character', () => {
    expect(golden).toHaveLength(45);
    for (const g of golden) {
      const hit = g.hit as TriageHit;
      expect(triageCard(hit, g.region as Region, 'hans'), `${g.region} ${hit.id}`).toEqual(g.card);
      // Traditional Chinese has no card text of its own yet and shows the same cards, as before.
      expect(triageCard(hit, g.region as Region, 'hant'), `${g.region} ${hit.id}`).toEqual(g.card);
    }
  });
});

describe('triage cards — English', () => {
  const cards = REGIONS.flatMap((region) => ALL_HITS.map((hit) => ({ region, hit, card: triageCard(hit, region, 'en') })));

  it('every card is fully in English, in plain punctuation, with no exclamation marks', () => {
    for (const { region, hit, card } of cards) {
      for (const text of [card.title, card.body]) {
        expect(text, `${region} ${hit.id}`).toMatch(/^[\x20-\x7E]+$/);
        expect(text, `${region} ${hit.id}`).not.toContain('!');
      }
      expect(card.title[0], card.title).toMatch(/[A-Z]/);
    }
  });

  it('never uses wording the product must not use', () => {
    for (const { card } of cards) {
      expect(`${card.title} ${card.body}`).not.toMatch(/blood level|hipaa|reviewed by|never leaves|weight loss|lose weight|muscle/i);
    }
  });

  it('acts the same as the Chinese card: same emergency button, same pause', () => {
    for (const { region, hit, card } of cards) {
      const zh = triageCard(hit, region, 'hans');
      expect({ e: card.showEmergency, p: card.pauseCoaching }, hit.id).toEqual({ e: zh.showEmergency, p: zh.pauseCoaching });
      expect(pausesCoaching(hit)).toBe(zh.pauseCoaching);
    }
  });

  it('names the same emergency number and crisis line as the Chinese card', () => {
    for (const { region, hit, card } of cards) {
      const zh = triageCard(hit, region, 'hans');
      const dial = emergencyDial(region);
      if (dial && zh.body.includes(dial)) expect(card.body, `${region} ${hit.id}`).toContain(dial);
    }
    expect(triageCard({ id: 'crisis', level: 'crisis' }, 'US', 'en').body).toBe(
      'If you are thinking about hurting yourself, please reach out now to someone who can help: crisis line 988. If you are in immediate danger, call 911.',
    );
    expect(triageCard({ id: 'chest_or_faint', level: 'emergency' }, 'OTHER', 'en').body).toBe('Chest pain or fainting needs care right away. Call your local emergency number.');
  });

  it('reads as a sentence where there is no number to give', () => {
    const other = (id: TriageId, level: TriageHit['level']) => triageCard({ id, level }, 'OTHER', 'en').body;
    expect(other('crisis', 'crisis')).toBe(
      'If you are thinking about hurting yourself, please reach out now to someone who can help: your local crisis line. If you are in immediate danger, call your local emergency number.',
    );
    expect(other('abdominal_pain_severe', 'urgent')).toContain('go to the emergency room right away (call your local emergency number).');
    expect(other('vision', 'emergency')).toContain('right away (call your local emergency number), and tell the doctor');
    expect(other('hypoglycemia', 'act_now')).toContain('get medical help (call your local emergency number) and contact your doctor.');
    for (const { region, hit, card } of cards) {
      expect(card.body, `${region} ${hit.id}`).not.toMatch(/crisis line your|\(your local/);
    }
    // Regions with a number keep it in brackets, as the Chinese card does.
    expect(triageCard({ id: 'abdominal_pain_severe', level: 'urgent' }, 'US', 'en').body).toContain('right away (911).');
    expect(triageCard({ id: 'crisis', level: 'crisis' }, 'HK', 'en').body).toContain('crisis line 2389 2222 (The Samaritan Befrienders Hong Kong).');
  });

  it('describes the same signs as the Chinese card', () => {
    // The Chinese card lists two signs; the rule fires on either one.
    expect(triageCard({ id: 'pancreatitis', level: 'emergency' }, 'US', 'en').body).toContain('Severe pain in your upper stomach area, or pain that spreads to your back (possibly with vomiting), may be related to your pancreas.');
    // The label that is quoted is named, so a user of another medication does not read it as theirs.
    expect(triageCard({ id: 'pregnancy', level: 'contact' }, 'US', 'en').body).toContain('(the semaglutide label says to stop semaglutide at least 2 months before a planned pregnancy)');
  });

  it('keeps the numbers that carry medical meaning', () => {
    const body = (id: TriageId, level: TriageHit['level']) => triageCard({ id, level }, 'US', 'en').body;
    expect(body('hypoglycemia', 'act_now')).toMatch(/15 grams of sugar.*15 minutes/);
    expect(body('pregnancy', 'contact')).toContain('at least 2 months before a planned pregnancy');
    expect(body('contraception', 'remind')).toContain('for 4 weeks after you start the medication and after each dose increase');
  });
});

describe('emergency number follows where the phone is', () => {
  it('a Hong Kong user in Los Angeles gets 911; unknown zones fall back to the chosen region', async () => {
    const { emergencyRegion, EMERGENCY_NUMBER } = await import('./triage');
    expect(EMERGENCY_NUMBER[emergencyRegion('America/Los_Angeles', 'HK')]).toBe('911');
    expect(EMERGENCY_NUMBER[emergencyRegion('Asia/Hong_Kong', 'US')]).toBe('999');
    expect(EMERGENCY_NUMBER[emergencyRegion('Europe/London', 'TW')]).toBe('119');
    expect(EMERGENCY_NUMBER[emergencyRegion('Europe/London', 'US')]).toBe('911');
  });

  it('gives a number to dial, or a phrase where there is no single number', () => {
    expect(emergencyDial('US')).toBe('911');
    expect(emergencyDial('OTHER')).toBeNull();
    expect(emergencyNumber('US', 'en')).toBe('911');
    expect(emergencyNumber('OTHER', 'en')).toBe('your local emergency number');
    expect(emergencyNumber('OTHER', 'hans')).toBe('当地急救电话');
    expect(crisisLine('US', 'en')).toBe('988');
    expect(crisisLine('CN', 'hans')).toBe('12356（全国心理援助热线）');
    expect(crisisLine('OTHER', 'en')).toBe('your local crisis line');
  });
});
