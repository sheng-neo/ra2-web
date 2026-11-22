/**
 * English phrases, as people type them on a phone: lower case, no punctuation, typos, slang,
 * voice typing. Every phrase is asserted.
 *
 * POSITIVE: one list per item family of the Medication Guides (medGuide.ts), with the guide's
 * own symptom words among them, plus the rules that have no guide behind them. Each phrase must
 * raise the card of the first public version, through one of the rules named for its family.
 * NEGATIVE: phrases that must raise nothing, because the text clearly does not describe the
 * person's own state now: someone else, long ago, a general question, a denial, the size of a
 * pill, a symptom called slight, or words that only look like a symptom.
 *
 * The line between the two lists is a judgement. The clinical reviewer is asked about it; a
 * phrase moved from one list to the other must be moved here too.
 */
import { describe, expect, it } from 'vitest';
import { alertCards, alertHits } from './alert';
import type { GuideItemId } from './medGuide';
import { triageText, type TriageContext, type TriageId } from './triage';

const ctx: TriageContext = { insulinOrSU: false, drugId: 'tirzepatide', region: 'US' };
const hitIds = (text: string): TriageId[] => triageText(text, ctx).map((h) => h.id);
/** The cards of the first public version (detail cards off). */
const launchCards = (text: string): string[] => alertCards(alertHits(triageText(text, ctx), false), 'US', 'en', false).map((c) => c.card.title);

interface Family {
  /** Rules that may stand for a phrase of this family. One of them must fire. */
  rules: TriageId[];
  phrases: string[];
}

/** Families that are items of the Medication Guides. */
const GUIDE_FAMILIES: Record<Extract<GuideItemId, 'thyroid_tumors' | 'pancreatitis' | 'gallbladder' | 'low_blood_sugar' | 'kidney_dehydration' | 'severe_stomach' | 'allergic_reaction' | 'vision_changes' | 'heart_rate'>, Family> = {
  // "a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath"
  thyroid_tumors: {
    rules: ['thyroid', 'anaphylaxis'],
    phrases: [
      'a lump in my neck',
      'swelling in my neck',
      'hoarseness',
      'trouble swallowing',
      'shortness of breath',
      'i found a lump in my neck',
      'theres a bump on my neck that wasnt there before',
      'my neck is swollen on one side',
      'swelling in the front of my neck',
      'hoarseness for the last few days',
      'my voice is hoarse',
      'been hoarse since tuesday',
      'lost my voice and it hasnt come back',
      'its getting hard to swallow food',
      'food keeps getting stuck when i swallow',
      'cant swallow right',
      'short of breath just walking to the kitchen',
      'swollen glands in my neck',
      'raspy voice all week',
      'I have a lump on the side of my neck and I am hoarse',
    ],
  },
  // "severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting"; "pain from your abdomen to your back"
  pancreatitis: {
    rules: ['pancreatitis'],
    phrases: [
      'severe pain in my stomach area that will not go away',
      'severe pain in my abdomen that will not go away with nausea and vomiting',
      'pain from my abdomen to my back',
      'severe stomach pain',
      'my stomach hurts so bad i cant stand up',
      'the pain goes from my stomach to my back',
      'horrible belly pain wrapping around to my back',
      'stomach is killing me',
      'worst stomach ache ive ever had',
      'excruciating abdominal pain and throwing up',
      'doubled over with stomach cramps',
      'really bad tummy pain since last night',
      'sharp pain in my upper belly that goes through to my back',
      'i think i have pancreatitis',
      'stomache pain is unbearable',
      'terrible stomach pain wont stop',
    ],
  },
  // "pain in your upper stomach (abdomen)", "yellowing of skin or eyes (jaundice)", "fever", "clay-colored stools"
  gallbladder: {
    rules: ['gallbladder'],
    phrases: [
      'pain in my upper stomach',
      'pain in my upper abdomen',
      'yellowing of my skin',
      'yellowing of my eyes',
      'jaundice',
      'fever',
      'clay-colored stools',
      'upper abdominal pain after i eat',
      'my upper belly hurts',
      'pain under my right ribs',
      'sore right under my ribs',
      'my eyes look yellow',
      'the whites of my eyes are yellow',
      'i think im jaundiced',
      'i have a fever',
      'running a fever of 101',
      'fever and chills since last night',
      'clay colored stools',
      'my poop is pale',
      'light colored poop the last 2 days',
      'grey stool',
      'gallbladder attack i think',
      'feverish and my skin looks yellow',
    ],
  },
  // "low blood sugar (hypoglycemia)", and two or more of the signs the guides list
  low_blood_sugar: {
    rules: ['hypoglycemia'],
    phrases: [
      'low blood sugar',
      'hypoglycemia',
      'my blood sugar is low',
      'i think im hypoglycemic',
      'sugar dropped to 52',
      'my sugars are running low',
      'bg is low',
      'having a hypo',
      'glucose crashed after lunch',
      'shaky and sweaty',
      'dizziness and sweating',
      'shakiness and blurred vision',
      'confusion and a fast heartbeat',
      'feeling jittery and hungry',
      'sweating and weakness',
      'slurred speech and weakness',
      'shaky with a headache',
      'dizzy and my heart is racing',
      'shaking and cant think straight',
      'sweating and confused',
      'jittery and starving',
      'weak and shaky after my shot',
      'anxious and sweating a lot',
      'so hungry and lightheaded',
      'felt drowsy and irritable all afternoon',
    ],
  },
  // "nausea, vomiting, or diarrhea that does not go away"
  kidney_dehydration: {
    rules: ['dehydration'],
    phrases: [
      'nausea that does not go away',
      'vomiting that does not go away',
      'diarrhea that does not go away',
      'vomiting that wont go away',
      'ive been nauseous for 4 days straight',
      'nausea wont stop',
      'constantly nauseous',
      'puking all day',
      'cant stop throwing up',
      'i keep throwing up',
      'the runs for 3 days now',
      'diarrea nonstop',
      'cant keep anything down',
      'threw up 7 times today',
      'even water comes back up',
      'been sick to my stomach every day this week',
      'still throwing up and its been 3 days',
      'barfing nonstop since yesterday',
      'hardly peeing',
      'i think im dehydrated',
    ],
  },
  // "stomach problems that are severe or will not go away"
  severe_stomach: {
    rules: ['abdominal_pain_severe', 'pancreatitis', 'dehydration'],
    phrases: [
      'stomach problems that are severe',
      'stomach problems that will not go away',
      'severe stomach problems',
      'stomach pain that wont go away',
      'my stomach has hurt for 5 days',
      'constant stomach pain',
      'belly ache every day',
      'severe constipation',
      'constipated for a week',
      'really bad heartburn',
      'bloating that wont go away',
      'acid reflux every single day',
      'upset stomach for weeks',
      'vomited blood',
      'throwing up blood',
      'black tarry stool',
      'blood in my stool',
      'severe nausea',
      'severe vomiting',
      'really bad stomach cramps',
      'the diarrhea is out of control',
    ],
  },
  // "swelling of your face, lips, tongue or throat", "problems breathing or swallowing", "severe rash or itching", "fainting or feeling dizzy", "very rapid heartbeat"
  allergic_reaction: {
    rules: ['anaphylaxis', 'chest_or_faint', 'dehydration', 'thyroid'],
    phrases: [
      'swelling of my face',
      'swelling of my lips and tongue',
      'swelling of my throat',
      'problems breathing',
      'problems swallowing',
      'severe rash',
      'severe itching',
      'fainting',
      'feeling dizzy',
      'very rapid heartbeat',
      'my lips are swollen',
      'tongue feels swollen',
      'throat feels tight',
      'my throat is closing up',
      'face is all puffy',
      'hard to breathe',
      'cant breathe',
      'wheezing',
      'itching all over',
      'broke out in hives',
      'rash is spreading',
      'i fainted',
      'passed out',
      'i keep passing out',
      'i feel faint',
      'so dizzy i had to sit down',
      'my heart is beating so fast',
      'i think im having an allergic reaction',
      'eyelids swelled shut',
    ],
  },
  // "changes in vision"
  vision_changes: {
    rules: ['vision'],
    phrases: [
      'changes in vision',
      'changes in my vision',
      'my vision is blurry',
      'blurry vision since yesterday',
      'vision got worse this week',
      'seeing double',
      'double vision',
      'everything looks fuzzy',
      'i see floaters',
      'cant see well out of my left eye',
      'my eyes are blurry',
      'trouble seeing at night',
      'suddenly cant see out of one eye',
      'dark spot in my vision',
      'my eyesight is getting worse',
      'vision seems off',
      'losing my sight',
    ],
  },
  // "heart racing or pounding in your chest and it lasts for several minutes"
  heart_rate: {
    rules: ['chest_or_faint'],
    phrases: [
      'heart racing in my chest',
      'heart pounding in my chest and it lasts for several minutes',
      'my heart is racing',
      'heart racing for like 10 minutes',
      'pounding heart wont slow down',
      'my pulse is really fast',
      'heart rate is through the roof',
      'palpitations',
      'heart palpitations again tonight',
      'resting heart rate is way too high',
      'my heart keeps fluttering',
      'heart beating out of my chest',
      'fast heartbeat even when im sitting',
      'heart is going crazy',
      'racing pulse',
    ],
  },
};

/** Rules with no Medication Guide behind them (guideCoverage.ts says why they are kept). */
const OTHER_FAMILIES: Record<string, Family> = {
  chest_pain: {
    rules: ['chest_or_faint'],
    phrases: [
      'chest pain',
      'my chest hurts',
      'pressure in my chest',
      'tightness in my chest',
      'chest feels tight',
      'crushing chest pain',
      'chest pains when i breathe',
      'pain in my chest and left arm',
      'i blacked out',
      'lost consciousness for a second',
      'passed out in the bathroom',
      'i was unconscious',
    ],
  },
  crisis: {
    rules: ['crisis'],
    phrases: [
      'i want to die',
      'thinking about killing myself',
      'i want to kill myself',
      'suicidal',
      'i dont want to live anymore',
      'i wish i was dead',
      'better off dead',
      'i want to end my life',
      'thoughts of hurting myself',
      'i cant go on like this',
      'i want to end it all',
      'theres no point in living',
    ],
  },
};

/** Phrases that must raise nothing at all. */
const NEGATIVE: Record<string, string[]> = {
  'someone else': [
    'my dad had chest pain last year',
    'my sister is pregnant',
    'my mom is having surgery next week',
    'my husband fainted at work',
    'my friend has low blood sugar a lot',
    'my wife has a fever',
    "my son's throat is swollen",
    'she passed out at the gym',
    'he has jaundice',
    'my dog threw up 6 times',
    'my coworker had an allergic reaction',
    'my mom has trouble swallowing',
    'my brother has pancreatitis',
    'a friend of mine had gallstones',
    'my grandma has blurry vision',
    'my kid has had diarrhea for 3 days',
    'my husband is dizzy all the time',
    "my dad's heart was racing",
    'some people get hives from it',
    'my daughter has a rash all over',
    'my mother in law has double vision',
    'they have a fever',
  ],
  'long ago': [
    'I fainted once as a kid',
    'had chest pain years ago',
    'i had pancreatitis in 2019',
    'last year i had gallstones',
    'i used to get palpitations',
    'i had jaundice as a baby',
    'history of low blood sugar',
    'i had hives as a child',
    'i used to have blurry vision before lasik',
    'passed out once in college',
    'two years ago i had trouble swallowing',
    'i had a bad allergic reaction 10 years ago',
    'when i was younger i had vertigo',
    'a long time ago i had a lump in my neck removed',
    'growing up i had fevers all the time',
  ],
  'a general question': [
    'What are the signs of low blood sugar?',
    'what are the symptoms of pancreatitis',
    'can ozempic cause chest pain',
    'does zepbound cause blurry vision',
    'is fainting a side effect',
    'what does low blood sugar feel like',
    'what is jaundice',
    'what is considered low blood sugar',
    'can this medication cause gallstones',
    'will the shot give me hives',
    'is hoarseness a common side effect',
    'how common is pancreatitis on wegovy',
    'what should i do if i get low blood sugar',
    'what are the warning signs of a serious allergic reaction',
    'does mounjaro cause heart palpitations',
    'i read that ozempic can cause vision loss',
    'i heard about people fainting on this',
    'worried about getting pancreatitis',
    'how to prevent low blood sugar',
    'are hives a side effect of zepbound',
    'what does an allergic reaction look like',
    'is chest pain a side effect of wegovy',
    'who do i call if i get chest pain',
    'what counts as a fever',
    'how can you tell if you have low blood sugar',
    'i wonder if it can cause pancreatitis',
    'what causes low blood sugar',
    'what are signs of a gallbladder attack',
    'can you get jaundice from this',
  ],
  'a denial': [
    'no chest pain',
    'no fever',
    'not dizzy',
    "i don't have trouble swallowing",
    'no shortness of breath',
    'never fainted',
    'no blurry vision',
    'not short of breath',
    'no rash',
    'no hives',
    'no low blood sugar',
    'no yellowing of my skin',
    'not hoarse',
    'no heart palpitations',
    'no swelling in my neck',
    'not having trouble breathing',
    "i'm not dizzy anymore",
    'no more stomach pain',
    'no nausea today',
    'never had a fever',
    'no itching',
    'not lightheaded',
  ],
  'the size of a pill': [
    'hard to swallow this big pill',
    'trouble swallowing the tablets',
    'these pills are hard to swallow',
    'cant swallow pills',
    'that was a hard pill to swallow',
    'the capsule is hard to swallow',
    'difficulty swallowing my vitamins',
    'the rybelsus tablet is huge and hard to swallow',
  ],
  'slight, or an ordinary day on this medication': [
    'a little dizzy',
    'slightly dizzy this morning',
    'kinda lightheaded',
    'heart racing a bit',
    'a little nauseous',
    'mild nausea',
    'threw up once',
    'threw up twice',
    'nauseous all day',
    'nausea after eating',
    'queasy this morning',
    'a little hoarse',
    'upset stomach',
    'mild stomach ache after dinner',
    'stomach feels bloated',
    'my stomach pain is back',
    'some heartburn after pizza',
    'a bit constipated',
    'constipated today',
    'had diarrhea this morning',
    'loose stools once',
    'felt tired today',
    'headache this afternoon',
    'so hungry today',
    'starving before dinner',
    'sweaty after my workout',
    'feeling anxious about my appointment',
    'a bit shaky after coffee',
    'weak after leg day',
    'moody today',
    'drowsy after lunch',
    'itchy at the injection site',
    'rash at the injection site',
    'small bruise where i injected',
    'injection site is a little red',
    'sore throat',
    'stuffy nose cant breathe through my nose',
    'eyes are tired',
    'eyes are dry',
    'vision is fine',
    'neck is sore from sleeping wrong',
    'stiff neck',
    'back is sore from the gym',
    'burped a lot today',
    'gassy',
    'dry mouth',
    'thirsty all day',
    'peed a lot today',
    'tired and sore',
    'bloated and gassy after dinner',
    'itchy rash all over my thigh',
    'puffy eyes this morning',
  ],
  'words that only look like a symptom': [
    'yellow squash for dinner',
    'had a sugar crash after lunch',
    'cut sugar, dropped 2 lb',
    'low sugar yogurt for breakfast',
    'on a low sugar diet',
    'two protein shakes and i was still hungry',
    'hay fever is acting up',
    'cabin fever this week',
    'saturday night fever was on tv',
    'feverfew supplement',
    'passed out flyers at school',
    'a faint smell of smoke',
    'the print was faint',
    'lost sight of my goals this week',
    'sharp cheddar and stomach ache',
    'stomach ache. Went back to bed.',
    'stomach pain while sitting in the back seat',
    'rested the bar on my chest',
    'chest day at the gym',
    'my face is red and my ankle is swollen',
    'my eyelids closed and I fell asleep',
    "I can't go on a walk today",
    'pounding headache',
    'racing to get to work',
    'heartburn',
    'heart rate was 72 this morning',
    'blood sugar was 105',
    'blood sugar is fine',
    'sugar free gum',
    'took my blood pressure',
    'breathing exercises this morning',
    'swallowed my pill with water',
    'voice lesson today',
    'upper right arm is sore after the shot',
    'upper body workout',
    'top of my foot hurts',
    'white rice and chicken',
    'pale ale with dinner',
    'spinning class this morning',
    'a dizzying amount of emails',
    'threw up my hands and gave up',
    'bloody mary at brunch',
    'blood test tomorrow',
    'black coffee and toast',
    'throat lozenge',
    'swollen ankle',
    'lip balm',
    'took my shot, 5 mg, left thigh',
    '182.4 this morning',
    'lost 2 pounds this week',
  ],
};

describe('English corpus: phrases that raise the card', () => {
  for (const [family, { rules, phrases }] of Object.entries({ ...GUIDE_FAMILIES, ...OTHER_FAMILIES })) {
    describe(family, () => {
      for (const phrase of phrases) {
        it(phrase, () => {
          const ids = hitIds(phrase);
          expect(ids.some((id) => rules.includes(id)), `"${phrase}" fired ${JSON.stringify(ids)}, expected one of ${JSON.stringify(rules)}`).toBe(true);
          // The first public version shows the fixed card for it (the crisis card for a crisis phrase).
          expect(launchCards(phrase)).toContain(family === 'crisis' ? 'You are not alone' : 'Contact your doctor right away');
        });
      }
    });
  }

  it('each family has at least 12 phrases, and no phrase is listed twice', () => {
    const all: string[] = [];
    for (const [family, { phrases }] of Object.entries({ ...GUIDE_FAMILIES, ...OTHER_FAMILIES })) {
      expect(phrases.length, family).toBeGreaterThanOrEqual(12);
      all.push(...phrases);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('English corpus: phrases that raise nothing', () => {
  for (const [reason, phrases] of Object.entries(NEGATIVE)) {
    describe(reason, () => {
      for (const phrase of phrases) {
        it(phrase, () => {
          expect(triageText(phrase, ctx), `"${phrase}" fired ${JSON.stringify(hitIds(phrase))}`).toEqual([]);
          // The same for a person who takes insulin or a sulfonylurea.
          expect(triageText(phrase, { ...ctx, insulinOrSU: true })).toEqual([]);
        });
      }
    });
  }

  it('there are at least 150 of them, and none is also on the other list', () => {
    const negative = Object.values(NEGATIVE).flat();
    expect(negative.length).toBeGreaterThanOrEqual(150);
    expect(new Set(negative).size).toBe(negative.length);
    const positive = new Set(Object.values({ ...GUIDE_FAMILIES, ...OTHER_FAMILIES }).flatMap((f) => f.phrases));
    for (const phrase of negative) expect(positive.has(phrase), phrase).toBe(false);
  });
});

describe('English corpus: the same words, the other way round', () => {
  it('a sentence about someone else still counts when it turns to the writer', () => {
    for (const phrase of [
      'my dad had chest pain and now I have chest pain',
      'my husband says my face is swollen',
      'my wife noticed my eyes look yellow',
      'my friend passed out and now I feel faint too',
      'they said my blood sugar was low',
      'my doctor found a lump in my neck',
      'my husband is fine, chest pain started an hour ago',
      'has anyone else had chest pain on this',
      'me and my husband have been throwing up all day',
      'my kids and I all have diarrhea that will not stop',
    ]) {
      expect(launchCards(phrase), phrase).toContain('Contact your doctor right away');
    }
  });

  it('a time long past still counts when the sentence says it is here now, or when it belongs to another part of the sentence', () => {
    for (const phrase of [
      'had chest pain last year and again today',
      'i used to get palpitations and now they are back',
      'I had gallstones years ago and my upper stomach hurts again',
      'I never had chest pain before I started this',
      'I had my gallbladder out last year and I have severe stomach pain',
      'last year I was fine but my chest hurts',
      "I've had chest pain since last year",
    ]) {
      expect(launchCards(phrase), phrase).toContain('Contact your doctor right away');
    }
    // The time alone, right before the symptom, still makes it long ago.
    for (const phrase of ['last year, I had chest pain', 'when I was younger, I had vertigo']) expect(triageText(phrase, ctx), phrase).toEqual([]);
  });

  it('a statement is not a general question', () => {
    for (const phrase of [
      'the shot did cause severe stomach pain',
      'this med does give me chest pain',
      'showing symptoms of low blood sugar',
      'all the signs of an allergic reaction',
      'when I get dizzy I sit down',
      'how do I manage nausea that will not go away',
      'how do you treat low blood sugar',
      'i saw it getting worse, the rash is spreading',
    ]) {
      expect(launchCards(phrase), phrase).toContain('Contact your doctor right away');
    }
  });

  it('a question still counts when the person says they have the symptom', () => {
    for (const phrase of [
      'what are the signs of low blood sugar? I feel shaky and sweaty',
      'can ozempic cause the chest pain I have now',
      'Is severe stomach pain going to my back normal?',
      "isn't chest pain serious?",
      'what should I do about this chest pain',
      'what is this lump in my neck',
      'why is my heart racing',
      'what does it mean if my eyes are yellow',
      'should I worry about the lump in my neck',
      'is it normal to be nauseous for 5 days',
      'what do i do if i get chest pain again',
    ]) {
      expect(launchCards(phrase), phrase).toContain('Contact your doctor right away');
    }
  });

  it('trouble swallowing still counts when it is not about a pill', () => {
    for (const phrase of ['trouble swallowing food', 'since starting my medication I have trouble swallowing', 'hard to swallow anything lately']) expect(hitIds(phrase), phrase).toContain('thyroid');
  });

  it('a symptom called slight is quiet; the same symptom without that word is not', () => {
    for (const [slight, plain] of [
      ['a little dizzy', 'dizzy'],
      ['heart racing a bit', 'heart racing'],
      ['a little hoarse', 'hoarse'],
      ['kinda lightheaded', 'lightheaded'],
    ]) {
      expect(triageText(slight, ctx), slight).toEqual([]);
      expect(launchCards(plain), plain).toContain('Contact your doctor right away');
    }
    // Slight, but lasting: the older rule about a hoarse voice that does not go away still fires.
    expect(hitIds('a little hoarse for 3 weeks')).toContain('thyroid');
  });

  it('one sign of low blood sugar alone is quiet, unless another rule stands for it; two together are not', () => {
    for (const one of ['sweating', 'headache', 'hungry', 'weakness', 'anxiety', 'irritable', 'drowsy', 'confused', 'shaky', 'slurred speech']) expect(triageText(one, ctx), one).toEqual([]);
    // Three of the guides' signs are also signs of another item, and raise the card alone.
    expect(hitIds('blurred vision')).toEqual(['vision']);
    expect(hitIds('fast heartbeat')).toEqual(['chest_or_faint']);
    expect(hitIds('dizziness')).toEqual(['dehydration']);
    expect(hitIds('shaky and hungry')).toEqual(['hypoglycemia']);
    // Hunger, headache, weakness and mood count only next to one of the other signs.
    for (const common of ['hungry with a headache', 'weak and hungry before lunch', 'moody and hungry', 'headache and irritability', 'anxious and weak']) expect(triageText(common, ctx), common).toEqual([]);
  });

  it('questions about pregnancy, an operation or birth control still match their reminder rule, which shows no card in the first public version', () => {
    for (const phrase of ['Can I get pregnant while taking this?', 'Do I need to stop before surgery?', 'what are the risks of anesthesia on this']) {
      expect(triageText(phrase, ctx).length, phrase).toBeGreaterThan(0);
      expect(launchCards(phrase), phrase).toEqual([]);
    }
  });
});
