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

/**
 * Regression cases from a blind retest: phrases written by someone who had not seen the patterns,
 * frozen after the run. Each "must" phrase must raise an alert in the first public version; each
 * negative must raise none (for a person with and without insulin or a sulfonylurea). A phrase the
 * rules miss on purpose goes in RETEST_KNOWN_MISSES with its reason, not out of the list.
 */
const RETEST_MUST: Record<string, string[]> = {
  "stomach": [
    "I have had a terrible pain in my stomach since this morning and it will not let up.",
    "Good afternoon. I am writing to note that the pain in my abdomen is quite severe and goes through to my back.",
    "stomach paint so bad cant stand up straight",
    "belly pain wont go away 2 days now",
    "dolor de estomago muy fuerte, going to my back",
    "pain under ribs radiating to back, worst ever",
    "woke up at 3am with stabbing pain in my gut that's still there",
    "my husband says I look pale, my stomach hurts so bad I'm curled up",
    "kinda bad tummy ache that hasn't stopped since tuesday",
    "abd pain 9/10",
    "Sharp pain in upper belly wrapping around to my back, threw up twice",
    "the pain in my middle is boring into my back and nothing helps",
    "stomach cramps constant for 3 days, not normal for me",
    "Dear diary, grandkids visited, we baked cookies and went to the park. The weather was lovely. Only thing is this awful pain in my stomach that has lasted all day. Then dinner with Ron.",
    "my abdomen is killing me",
    "pancreas pain? hurts left side goes to back",
    "estomago me duele mucho since yesterday",
    "excruciating belly pain",
    "pain in stomach area that will not go away with nausea",
    "gut pain getting worse every hour",
    "I've got a severe ache in the pit of my stomach",
    "Pain that starts in my belly and goes to my back. Like my mom had with her pancreas, now me.",
    "belly hurts real bad",
    "stummy pain so severe i'm crying",
    "upper abdominal pain spreading to back since last night",
    "stomach pane wont stop",
    "my belly is in agony",
    "tummy hurts SO bad",
    "pancreatitis again I think, same pain as last time",
    "abdominal pain severe radiating to back",
    "I have the worst pain in my upper stomach",
  ],
  "gallbladder": [
    "my husband says my eyes look yellow",
    "skin looks kind of yellow today",
    "whites of my eyes are yellowish",
    "stool is pale, like clay",
    "poop is light grey colored",
    "pain on the right side under my ribs and I have a fever",
    "fever 101 and upper stomach hurts",
    "I believe I'm jaundiced",
    "jaundice?? eyes yellow",
    "My daughter pointed out that I look yellow.",
    "bowel movements have been white-ish clay color since Sunday",
    "upper right belly pain after eating fatty food, with chills and fever",
    "gallbladder attack I think, pain under right rib",
    "amarillo los ojos, skin yellow too",
    "running a temp and pain upper abdomen",
    "my urine is dark and my skin is yellow",
    "noticed yellow tint to my skin in the mirror this morning",
    "pale stools and itchy all over",
    "high fever and pain in top of stomach",
    "eyes turned yellow",
    "eyes yella",
    "poop is grey",
    "kids say my eyes look yellow and I've had a fever",
  ],
  "allergy": [
    "my lips are swelling up",
    "tongue feels thick and swollen",
    "face is puffy and swollen after my shot",
    "throat feels tight and its hard to swallow",
    "throat closing up",
    "hives all over and itching like crazy",
    "broke out in a rash all over my body, really bad",
    "my eyes and lips swelled after the injection",
    "kinda hard to breathe since the shot",
    "having a hard time catching my breath",
    "cant breathe",
    "can't get air in",
    "heart is beating very very fast and I feel faint",
    "severe itching everywhere since starting",
    "my mouth and tongue are tingling and swelling",
    "struggling to breathe",
    "Wheezing and my chest is tight after injection",
    "trouble swallowing my food and drinks",
    "lips puffed up like balloons",
    "rash on arms and legs spreading, very itchy",
    "the swelling in my face won't go down",
    "lengua hinchada and hard to breathe",
    "my throat is swelling",
    "breathing feels difficult",
    "I am having difficulty breathing this evening.",
    "Heart pounding super fast, feel like passing out",
    "itchy welts all over after my dose",
    "felt like I was going to pass out after the shot",
    "my eyelids are swollen shut",
    "Its hard to breath",
    "trouble breething",
    "throat swole up",
    "can barely swallow, throat swollen",
    "swelling in my lips and tongue",
    "my heart is racing and I feel like I'm going to pass out",
  ],
  "gi_persist": [
    "puked 5x",
    "throne up all day",
    "die a rear for 4 days",
    "throwing up for 2 days can't keep anything down",
    "can't keep water down",
    "diarrhea for 4 days straight",
    "vomiting won't stop",
    "nausea that just won't go away, a week now",
    "been sick to my stomach nonstop since my dose increase",
    "running to the bathroom every hour since monday, watery",
    "I have been vomiting since Tuesday and cannot keep fluids down.",
    "vomitando todo el dia",
    "Hello, I wanted to log that I've been throwing up all night and this morning.",
    "keep throwing up bile",
    "diahrea wont quit",
    "the runs for 3 days",
    "barfing nonstop",
    "nauseous constantly, every day for 2 weeks",
    "I'm vomiting and lightheaded, haven't eaten in 2 days",
    "Long day at work, meetings, then picked up the kids from soccer and made tacos. Threw up 6 times tonight, can't stop.",
    "Diarrhea every day since I started the higher dose, three weeks now",
    "cant stop vomitting",
    "throwing up blood",
    "dry heaving for hours",
    "stomach flu like symptoms that will not go away",
    "loose stools all week, not getting better",
    "vomit x6 today",
    "diarrea all week",
    "Since Thursday I have had the runs and cannot keep anything down",
  ],
  "hypo": [
    "bs 54",
    "blood sugar 48",
    "glucose reading 50 this morning",
    "my sugar dropped to 45 and I felt like passing out",
    "slurred speech and shaky, sugar low",
    "sugar 39",
    "BS 49 shaky",
    "glucose 52",
    "my wife said I was talking gibberish and my sugar was 40",
  ],
  "vision": [
    "vision went dark in one eye for a minute",
    "I'm losing vision in my left eye",
  ],
  "mood": [
    "I want to die",
    "thinking about killing myself",
    "I don't want to be here anymore",
    "I've been thinking about ending it",
    "sometimes I think everyone would be better off without me",
    "I want to hurt myself",
    "been cutting again",
    "having dark thoughts",
    "no reason to live",
    "I keep thinking about taking all my pills",
    "I wish I could go to sleep and not wake up",
    "suicidal",
    "thoughts of self harm",
    "planning to end my life",
    "I feel like giving up on everything, even living",
    "I've felt like hurting myself",
  ],
  "emergency": [
    "chest hurts",
    "chest pain",
    "pressure in my chest going down my left arm",
    "my chest feels tight and heavy",
    "I fainted in the kitchen",
    "passed out this morning",
    "blacked out for a few seconds",
    "face drooping on one side and my words are slurred",
    "my arm went numb and I can't talk right",
    "had a seizure",
    "I think I'm having a heart attack",
    "Like my mom had, now I have chest pain",
    "crushing pain in chest",
    "Good morning. I would like to report that I fainted at church today.",
    "I collapsed at the store",
    "sudden worst headache of my life",
    "one side of my body is weak, can't lift my arm",
    "my jaw and chest hurt and I'm sweating",
    "lost consciousness",
    "convulsing earlier, my son found me on the floor",
    "dolor de pecho",
    "chest pane",
    "I think I'm having a stroke",
    "my left side is numb and my face feels funny",
    "chest discomfort since last night",
    "pain in my chest when I breathe",
    "heart attack symptoms",
    "Had a fit this morning, bit my tongue",
    "fell out at work, came to on the floor",
    "I passed out in the shower",
    "Mild chest pain, probably nothing",
    "chest a little tight, kinda hard to breathe",
    "My speech is garbled suddenly",
    "sudden confusion and can't see out of one eye",
    "squeezing in my chest",
    "Yesterday I fainted twice",
    "keeled over at the gym",
    "fainted",
    "pass out at work",
    "chest is hurting",
    "seizure today",
  ],
  "overdose": [
    "I took two doses by mistake",
    "accidentally injected twice this week",
    "I think I took too much",
    "took my shot twice today",
    "double dosed",
    "gave myself the wrong dose, way more than prescribed",
    "took 2 pills today instead of 1",
    "I injected the whole pen",
    "overdosed on my ozempic",
    "accidentally took my weekly dose again yesterday",
    "I clicked the dial all the way and injected way too much",
    "Took 2 Foundayo today, forgot I took one",
    "took an extra dose by mistake",
    "I may have taken a double dose of Rybelsus this morning.",
    "took my wife's pen dose on top of mine",
  ],
};
const RETEST_QUIET: Record<string, string[]> = {
  "other_person": [
    "My husband has chest pain, I'm taking him to the ER",
    "my mom's eyes look yellow, she's going to see her doctor",
    "Dad fainted at the store yesterday",
    "my sister on Ozempic said she threw up for days",
    "my friend had pancreatitis from mounjaro",
    "my dog keeps throwing up",
    "the cat had a seizure last night",
    "My neighbor's blood sugar was 50, the paramedics came",
    "my son has a rash all over",
    "my wife says she's depressed",
    "my coworker's lips swelled up from peanuts",
    "a lady in my group passed out at the gym",
    "my brother found a lump in his neck",
    "my daughter has diarrhea from daycare",
    "husband's vision is blurry, he needs new glasses",
    "my aunt says her stomach pain goes to her back",
    "my baby has been vomiting, calling pediatrician",
    "he says he can't breathe when he runs",
    "my mother is having trouble swallowing",
    "Our pastor had a heart attack",
    "my friend took too much ozempic",
    "my husband accidentally double dosed his insulin",
    "My husband has the flu, throwing up all night, I'm fine.",
    "the kids all have a stomach bug, I'm the only one not sick",
    "Mom's sugar was 45 this morning",
    "my sister's voice has been hoarse",
    "Reading about a woman whose face swelled up",
    "grandma had a stroke in 2019",
    "patient in the forum says they had their gallbladder removed",
  ],
  "past": [
    "I fainted once in high school",
    "had my gallbladder out in 2010",
    "back in 2015 I had pancreatitis",
    "As a child I had seizures but none since",
    "years ago I had a kidney stone",
    "I had a heart attack ten years ago, doing fine now",
    "When I was pregnant with my first, I threw up every day",
    "decades ago I was depressed but I'm happy now",
    "had hives as a kid from strawberries",
    "in college I passed out at a blood drive",
    "my last hypo was in 2021",
    "I was jaundiced as a newborn",
    "had a thyroid nodule biopsied in 2008, benign",
    "had a stroke 12 years ago, fully recovered",
    "in my twenties I had an eating disorder",
  ],
  "question": [
    "Can Ozempic cause pancreatitis?",
    "What are the signs of low blood sugar?",
    "is blurry vision a side effect?",
    "Ask doctor: should I worry about thyroid cancer?",
    "how do I know if I'm dehydrated?",
    "what does gallbladder pain feel like",
    "Question for Dr. Patel: what is the risk of a serious allergic reaction?",
    "Does Zepbound cause hair loss or depression?",
    "What should I do if I miss a dose?",
    "what happens if you take too much wegovy",
    "is chest pain a side effect of mounjaro",
    "How long does nausea usually last?",
    "When should I call about vomiting?",
    "can this drug cause seizures?",
    "Is it normal to feel tired the first week?",
    "what is the number for poison control",
    "ask about the suicide risk warning on the label",
    "What blood sugar number counts as low?",
    "Should I be concerned about a lump in my neck someday?",
    "Does it raise heart rate?",
    "ask nurse what jaundice looks like",
    "is it safe to take with my thyroid meds",
    "Why do people get gallstones on GLP-1s?",
    "What does clay colored stool mean?",
    "how to tell a heart attack from heartburn?",
  ],
  "negated": [
    "no chest pain today",
    "no vomiting, just a little queasy",
    "I have not fainted",
    "no swelling at the injection site",
    "didn't throw up",
    "No stomach pain at all this week.",
    "Haven't had any lows",
    "blood sugar fine, 110",
    "denies shortness of breath",
    "Vision is fine, no changes",
    "not dizzy",
    "eyes aren't yellow, I checked",
    "no rash no itching",
    "Nothing hurts, feeling great",
    "no thoughts of hurting myself, just tired",
    "I am not depressed, just bored",
    "no lumps when I checked my neck",
    "neither nausea nor vomiting",
    "Breathing normally.",
    "zero chest pain",
    "didn't pass out, just sat down",
    "nope, no heart racing",
    "I didn't take a double dose, I checked the log",
    "me siento bien hoy, no dolor",
  ],
  "resolved": [
    "my voice is not hoarse anymore",
    "no diarrhea since Monday",
    "stomach pain from yesterday is gone",
    "the rash cleared up",
    "nausea went away after lunch",
    "vomiting stopped last night, eating fine now",
    "headache is better",
    "blurry vision went away after I rested",
    "feeling much better, no more diarrhea",
    "swelling went down overnight, all good",
    "pain resolved",
    "the cramps eased off",
    "throat feels normal again",
    "dizziness passed",
    "back to normal",
    "chest x-ray came back clear",
    "my thyroid labs were normal",
    "doctor said my heart is fine",
  ],
  "fear": [
    "I'm scared I'll get pancreatitis",
    "worried about thyroid cancer",
    "afraid of having a low while driving",
    "nervous I'll throw up at the wedding",
    "I'm terrified of needles",
    "My biggest fear is gallbladder problems",
    "worried my vision might change",
    "I hope I don't get the stomach paralysis I read about",
    "anxious about the shot tomorrow",
    "I worry about having a heart attack like my dad",
    "scared to death of side effects",
    "fear of fainting at the doctor",
  ],
  "plan": [
    "plan to ask about the thyroid ultrasound",
    "going to get my eyes checked next month",
    "will call if the vomiting starts",
    "appointment with gastro about my gallbladder scan",
    "Schedule a colonoscopy",
    "buy glucose tabs in case of lows",
    "Next week: blood work for kidneys",
    "gonna start the 5mg dose on monday",
    "Remember to bring the pen to the appointment",
    "plan to keep juice in the car for lows",
    "if I ever get chest pain I'll call 911",
    "in case of a low, eat 15g carbs",
    "if my stomach pain goes to my back, call doctor",
  ],
  "idiom": [
    "dying to try the new restaurant",
    "I'm dying of laughter",
    "this weather is killing me lol",
    "my feet are killing me after shopping",
    "my heart skipped a beat when I saw the scale",
    "I almost died when I saw the price",
    "That meeting was a pain in the neck",
    "my boss makes me sick",
    "sick of meal prepping",
    "I could kill for a donut",
    "heartbroken that my jeans don't fit... too big!",
    "Break a leg at the recital, sweetie",
    "throw up my hands, insurance denied again",
    "breathtaking view on our hike",
    "my jaw dropped at my weight loss",
    "I was floored by the results",
    "Blew my mind",
    "I'm feeling blue about my team losing",
    "had butterflies in my stomach before the interview",
    "gut feeling this is working",
    "it took my breath away",
    "the bill gave me a heart attack",
    "I nearly fainted when I saw the price at the pharmacy",
    "kill me now, another salad",
    "Laughed so hard I cried",
    "my wallet is bleeding",
    "dead tired",
    "drop dead gorgeous dress",
    "I'm swelling with pride",
    "my phone died",
    "the battery is dying",
  ],
  "exercise": [
    "out of breath after my 5k, felt great",
    "heart rate 160 on the treadmill",
    "short of breath during spin class as usual",
    "sore abs from crunches",
    "chest muscles sore from bench press",
    "pulse went up to 150 on the hill run",
    "dizzy after the spinning ride at the fair",
    "breathing hard after climbing stairs with groceries, normal",
    "my legs were shaking after leg day",
    "sweating buckets at hot yoga",
    "side stitch while jogging",
    "winded after swimming laps",
    "Pulled a muscle in my back lifting",
    "puffed after walking up the hill",
    "my stroke count in swimming improved",
  ],
  "food": [
    "had yellow curry for dinner",
    "made a yellow squash casserole",
    "egg yolks look so yellow from farm eggs",
    "clay pot chicken for dinner",
    "ate a grey looking sausage",
    "spicy salsa burned my tongue",
    "turmeric latte",
    "drank 64 oz water today",
    "sugar free jello",
    "low sugar yogurt",
    "had a low carb day",
    "blood orange salad",
    "chicken breast and rice",
    "heart of palm salad",
    "sweet potato fries",
    "low fat milk",
    "Had a hot dog at the game",
    "sugar cube in my tea",
    "throat lozenges in my purse",
    "lip balm",
  ],
  "photo": [
    "blurry photo of my meal",
    "picture came out blurry, retake",
    "the scale display is blurry",
    "yellow filter on the pic",
    "my camera lens is foggy",
    "screen is fuzzy on my phone",
    "the label print is too small to read",
    "double vision mode on my game lol",
    "TV picture flickering",
  ],
  "pill_pen": [
    "the pill is big and hard to swallow",
    "the pen clicked twice when I dialed",
    "dose dial stuck",
    "pen leaked a drop",
    "two pens in the fridge",
    "took my 1 pill this morning with water",
    "took 2.5 mg shot today",
    "injected in thigh, no problems",
    "the needle bent",
    "double checked the dose",
    "the tablet is tiny",
    "swallowed the tablet whole as directed",
    "missed my dose yesterday, took it today",
    "took my pill 30 min before breakfast",
    "refilled 2 boxes",
    "the cap is hard to get off",
    "pharmacy gave me the wrong size pen needles",
    "took my shot a day late",
    "the pen needle is too long",
  ],
  "mild": [
    "mild nausea after dinner, normal for me",
    "a little constipated",
    "some burping",
    "slight headache",
    "tired today",
    "hair thinning a bit",
    "small bruise at injection site",
    "feel full fast",
    "a little heartburn after pizza",
    "queasy for an hour after my shot, then fine",
    "gassy",
    "nauseous this morning, ate crackers, better",
    "no appetite",
    "my stomach growled in church",
    "Lost 3 lbs this week!",
    "Woke up early, walked the dog, made oatmeal, mild nausea mid-morning that passed, did the crossword, called my sister about her knee surgery, dinner was salmon. Good day.",
  ],
  "word_share": [
    "watching a show about seizures",
    "reading a book about strokes",
    "painted the kitchen yellow",
    "sunflower yellow sundress",
    "the fire alarm went off, false alarm",
    "heart emoji for my husband",
    "vision board for my goals",
    "my vision for 2027 is to run a half marathon",
    "blood drive at church sunday",
    "fainting goats video was hilarious",
    "pass out the flyers at the meeting",
    "I passed out cookies to the neighbors",
    "the doctor's office had a seizure warning poster",
    "watching Grey's Anatomy",
    "chest freezer full of chicken",
    "lump sum payment from insurance",
    "blacked out the windows for movie night",
    "suicide squad movie night",
    "kill the lights",
    "low battery on my glucose meter",
    "my sourdough rose and swelled nicely",
    "the river swelled after rain",
    "chest of drawers delivered",
    "Played tennis, hit a great overhead",
  ],
};

/** Retest phrases the rules miss on purpose, each with the reason. Empty today: every "must" phrase raises the alert. */
const RETEST_KNOWN_MISSES: [phrase: string, reason: string][] = [];

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
    for (const one of ['sweating', 'headache', 'hungry', 'weakness', 'anxiety', 'irritable', 'drowsy', 'confused', 'shaky']) expect(triageText(one, ctx), one).toEqual([]);
    // Slurred speech alone raises the card: it is also a sign of a stroke (general emergency signs).
    expect(triageText('slurred speech', ctx).map((h) => h.id)).toEqual(['chest_or_faint']);
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

describe('English corpus: blind retest, frozen', () => {
  const contexts: TriageContext[] = [ctx, { ...ctx, insulinOrSU: true }, { ...ctx, drugId: 'semaglutide-wl' }];
  const raises = (text: string, c: TriageContext) => alertHits(triageText(text, c), false).length > 0;
  const missedOnPurpose = new Set(RETEST_KNOWN_MISSES.map(([p]) => p));
  for (const [family, phrases] of Object.entries(RETEST_MUST)) {
    describe(`must raise: ${family}`, () => {
      for (const phrase of phrases) {
        if (missedOnPurpose.has(phrase)) continue;
        it(phrase, () => {
          for (const c of contexts) expect(raises(phrase, c), `"${phrase}" (${c.drugId}, insulin ${c.insulinOrSU}) raised ${JSON.stringify(hitIds(phrase))}`).toBe(true);
        });
      }
    });
  }
  for (const [cause, phrases] of Object.entries(RETEST_QUIET)) {
    describe(`must stay quiet: ${cause}`, () => {
      for (const phrase of phrases) {
        it(phrase, () => {
          for (const c of contexts) expect(alertHits(triageText(phrase, c), false), `"${phrase}" (${c.drugId}, insulin ${c.insulinOrSU})`).toEqual([]);
        });
      }
    });
  }
  it('every known miss is still on the list, still missed, and has a reason', () => {
    const all = new Set(Object.values(RETEST_MUST).flat());
    for (const [phrase, reason] of RETEST_KNOWN_MISSES) {
      expect(all.has(phrase), phrase).toBe(true);
      expect(reason.trim().length, phrase).toBeGreaterThan(10);
      expect(raises(phrase, ctx), phrase).toBe(false);
    }
  });
});
