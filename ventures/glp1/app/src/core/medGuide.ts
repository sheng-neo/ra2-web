/**
 * The warning signs of each medication, in the words of its FDA Medication Guide.
 *
 * One entry per Medication Guide of the seven current US labels (the same labels as in
 * labelFacts.ts). An entry holds the guide's "most important information" items and its serious
 * side effects, word for word, and the other places where the guide tells the patient to tell
 * or call someone. The screen "Warning signs in the Medication Guide" shows the first two parts
 * exactly as they stand here, and as a third part the sentence about taking too much. guideCoverage.ts ties the danger-symptom rules of triage.ts to
 * these items, and scripts/build-review-packet.ts prints both for the clinical reviewer.
 *
 * THIS FILE IS WRITTEN BY A SCRIPT. Do not edit a quoted word by hand.
 *
 * Rules for this file:
 * - Every word of a guide was sliced from the label file itself (DailyMed SPL, the Medication
 *   Guide section, code 42231-1) by a script, and checked against that file by a second script
 *   that shares no code with the first. Nothing here is written from memory. The scripts are
 *   not part of the repository.
 * - Runs of spaces and line breaks are written as one space; a no-break space counts as a
 *   space. Bold and italics are dropped. Punctuation, curly quotes, capital letters and symbols
 *   are kept as printed. Nothing else is changed: where the label file has a space too few or
 *   too many, so does this file ("RYBELSUS andOZEMPIC tablets", "ZEPBOUND ®").
 * - `text` is the item's own words, whole. `bullets` are its sub-bullets in the order the
 *   label file stores them (the guides print them in columns). `after` holds words the guide
 *   prints after the sub-bullets. `lead` (the words the guide prints in bold at the start of
 *   the item), `instruction` (the sentences that tell the patient what to do) and `symptoms`
 *   (the signs the item names) are slices of `text` or `bullets`; they add no words.
 * - `id`, `kind`, `action` and `stopUsing` are ours: names, and a reading of the
 *   instruction. emergency: "get medical help right away", or an emergency room. right_away:
 *   tell or call the healthcare provider "right away". tell: tell, call or talk to the
 *   healthcare provider, with no "right away". none: no instruction to contact anyone.
 *   `stopUsing` is true where the instruction begins "Stop using" or "Stop taking".
 * - MED_GUIDE_OTHER holds the places outside the two parts where a guide tells the patient to
 *   tell, call or talk to someone. A bullet is copied whole; from running text, the sentences
 *   that carry the instruction. Two statements are left out for every guide, because they tell
 *   the patient to contact nobody: the one about sharing pens and "Keep a list of them to show
 *   your healthcare provider and pharmacist". The app does not show this part. It is a table of
 *   its own so that the screens, which do not use it, do not carry it.
 * - The guides change. When a label is read again, write this file again from it, update
 *   MED_GUIDES_READ_ON, and re-check guideCoverage.ts.
 * - An entry says where words were read. It does not say a reviewer has confirmed anything.
 *   PENDING CLINICAL REVIEW: the copy was checked against the label files by script, not by a reviewer.
 */
import { drugById, regimenBrand, type Region } from './catalog';
import type { Lang } from './i18n';
import type { Regimen } from './types';

/** The day the Medication Guides below were read. */
export const MED_GUIDES_READ_ON = '2026-11-22';

export type GuideAction = 'emergency' | 'right_away' | 'tell' | 'none';

export const GUIDE_ACTIONS: readonly GuideAction[] = ['emergency', 'right_away', 'tell', 'none'];

export type GuideItemId =
  | 'thyroid_tumors'
  | 'thyroid_do_not_use'
  | 'see_most_important'
  | 'pancreatitis'
  | 'gallbladder'
  | 'low_blood_sugar'
  | 'kidney_dehydration'
  | 'severe_stomach'
  | 'allergic_reaction'
  | 'vision_changes'
  | 'heart_rate'
  | 'aspiration_anesthesia';

export type GuideOtherKind =
  | 'before_use_condition'
  | 'pregnancy'
  | 'pregnancy_registry'
  | 'birth_control'
  | 'breastfeeding'
  | 'medicines'
  | 'diabetes_medicines'
  | 'overdose'
  | 'missed_doses'
  | 'side_effects_general';

export interface GuideItem {
  id: GuideItemId;
  /** The words the guide prints in bold at the start of the item. Empty where it prints none. */
  lead: string;
  /** The item's own words, whole, without its sub-bullets. */
  text: string;
  /** Sub-bullets, in the order the label file stores them. */
  bullets: string[];
  /** Words the guide prints after the sub-bullets. */
  after?: string;
  /** The sentences of the item that tell the patient what to do. Empty where there are none. */
  instruction: string;
  action: GuideAction;
  stopUsing: boolean;
  /** The signs the item names, in the guide's words. */
  symptoms: string[];
}

export interface GuideSection {
  /** The heading the guide prints over this part. */
  question: string;
  /** The line between the heading and the items. */
  intro: string;
  items: GuideItem[];
}

export interface GuideOther {
  kind: GuideOtherKind;
  /** The heading the words stand under. */
  under: string;
  text: string;
  action: Exclude<GuideAction, 'none'>;
}

export interface MedGuide {
  key: string;
  /** The title of the guide, its lines joined by one space. */
  title: string;
  setid: string;
  version: string;
  /** Effective date of this label version as the label file gives it, YYYYMMDD. */
  effective: string;
  /** The date line at the end of the guide, as printed: "Revised: 06/2026", "Issued: 07/2026". */
  revised: string;
  /** The sentence at the end of the guide that says who approved it. */
  approval: string;
  /** Public page of the label the guide is part of. */
  url: string;
  /** The US brands the guide covers, as stored in the catalog, each with its catalog entry. */
  brands: Record<string, string>;
  mostImportant: GuideSection;
  seriousSideEffects: GuideSection;
}

const dailymed = (setid: string): string => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;

export const MED_GUIDES = {
  wegovy: {
    key: 'wegovy',
    title: 'MEDICATION GUIDE WEGOVY® (wee-GOH-vee) (semaglutide) injection, for subcutaneous use WEGOVY® (wee-GOH-vee) (semaglutide) tablets, for oral use',
    setid: 'ee06186f-2aa3-4990-a760-757579d8f77b',
    version: '19',
    effective: '20260618',
    revised: 'Revised: 06/2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('ee06186f-2aa3-4990-a760-757579d8f77b'),
    brands: { Wegovy: 'semaglutide-wl', 'Wegovy pill': 'semaglutide-oral-wl' },
    mostImportant: {
      question: 'What is the most important information I should know about WEGOVY?',
      intro: 'WEGOVY may cause serious side effects, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, WEGOVY and other medicines that work like WEGOVY caused thyroid tumors, including thyroid cancer. It is not known if WEGOVY will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['a lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not use WEGOVY if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use WEGOVY if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of WEGOVY?',
      intro: 'WEGOVY may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about WEGOVY?”', text: 'See “What is the most important information I should know about WEGOVY?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of your pancreas (pancreatitis).', text: 'inflammation of your pancreas (pancreatitis). Stop using WEGOVY and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop using WEGOVY and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your abdomen to your back'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. WEGOVY may cause gallbladder problems including gallstones. Some gallbladder problems need surgery. Call your healthcare provider if you have any of the following symptoms:', bullets: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'], instruction: 'Call your healthcare provider if you have any of the following symptoms:', action: 'tell', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'] },
        { id: 'low_blood_sugar', lead: 'increased risk of low blood sugar (hypoglycemia) in patients with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas.', text: 'increased risk of low blood sugar (hypoglycemia) in patients with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas. Low blood sugar in patients with type 2 diabetes who receive WEGOVY can be both a serious and common side effect. Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking WEGOVY and while you take WEGOVY. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'sweating', 'shakiness', 'blurred vision', 'slurred speech', 'weakness', 'anxiety', 'hunger', 'headache', 'irritability or mood changes', 'confusion or drowsiness', 'fast heartbeat', 'feeling jittery'], instruction: 'Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking WEGOVY and while you take WEGOVY.', action: 'tell', stopUsing: false, symptoms: ['dizziness or light-headedness', 'sweating', 'shakiness', 'blurred vision', 'slurred speech', 'weakness', 'anxiety', 'hunger', 'headache', 'irritability or mood changes', 'confusion or drowsiness', 'fast heartbeat', 'feeling jittery'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use WEGOVY. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using WEGOVY and get medical help right away, if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue or throat', 'severe rash or itching', 'very rapid heartbeat', 'problems breathing or swallowing', 'fainting or feeling dizzy'], instruction: 'Stop using WEGOVY and get medical help right away, if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue or throat', 'severe rash or itching', 'very rapid heartbeat', 'problems breathing or swallowing', 'fainting or feeling dizzy'] },
        { id: 'vision_changes', lead: 'change in vision in people with type 2 diabetes.', text: 'change in vision in people with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with WEGOVY.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with WEGOVY.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'heart_rate', lead: 'increased heart rate.', text: 'increased heart rate. WEGOVY can increase your heart rate while you are at rest. Your healthcare provider should check your heart rate while you take WEGOVY. Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.', bullets: [], instruction: 'Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.', action: 'tell', stopUsing: false, symptoms: ['heart racing or pounding in your chest and it lasts for several minutes'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). WEGOVY may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking WEGOVY before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking WEGOVY before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  ozempic: {
    key: 'ozempic',
    title: 'Medication Guide OZEMPIC® (oh-ZEM-pick) (semaglutide) injection, for subcutaneous use',
    setid: 'adec4fd2-6858-4c99-91d4-531f5f2a2d79',
    version: '20',
    effective: '20260601',
    revised: 'Revised: 01/2025',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('adec4fd2-6858-4c99-91d4-531f5f2a2d79'),
    brands: { Ozempic: 'semaglutide-t2d' },
    mostImportant: {
      question: 'What is the most important information I should know about OZEMPIC?',
      intro: 'OZEMPIC may cause serious side effects, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, OZEMPIC and medicines that work like OZEMPIC caused thyroid tumors, including thyroid cancer. It is not known if OZEMPIC will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['a lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not use OZEMPIC if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use OZEMPIC if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of OZEMPIC?',
      intro: 'OZEMPIC may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about OZEMPIC?”', text: 'See “What is the most important information I should know about OZEMPIC?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of your pancreas (pancreatitis).', text: 'inflammation of your pancreas (pancreatitis). Stop using OZEMPIC and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without vomiting. You may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop using OZEMPIC and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without vomiting', 'pain from your abdomen to your back'] },
        { id: 'vision_changes', lead: 'changes in vision.', text: 'changes in vision. Tell your healthcare provider if you have changes in vision during treatment with OZEMPIC.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with OZEMPIC.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'low_blood_sugar', lead: 'low blood sugar (hypoglycemia).', text: 'low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use OZEMPIC with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'blurred vision', 'anxiety, irritability, or mood changes', 'sweating', 'slurred speech', 'hunger', 'confusion or drowsiness', 'shakiness', 'weakness', 'headache', 'fast heartbeat', 'feeling jittery'], instruction: '', action: 'none', stopUsing: false, symptoms: ['dizziness or light-headedness', 'blurred vision', 'anxiety, irritability, or mood changes', 'sweating', 'slurred speech', 'hunger', 'confusion or drowsiness', 'shakiness', 'weakness', 'headache', 'fast heartbeat', 'feeling jittery'] },
        { id: 'kidney_dehydration', lead: 'Dehydration leading to kidney problems.', text: 'Dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'severe_stomach', lead: 'Severe stomach problems.', text: 'Severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use OZEMPIC. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using OZEMPIC and get medical help right away, if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop using OZEMPIC and get medical help right away, if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. Gallbladder problems have happened in some people who take OZEMPIC. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', bullets: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'], instruction: 'Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', action: 'right_away', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). OZEMPIC may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking OZEMPIC before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking OZEMPIC before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  semaglutideTablets: {
    key: 'semaglutideTablets',
    title: 'MEDICATION GUIDE RYBELSUS® (reb-EL-sus) (semaglutide) tablets, for oral use OZEMPIC® (oh-ZEM-pick) (semaglutide) tablets, for oral use',
    setid: '27f15fac-7d98-4114-a2ec-92494a91da98',
    version: '14',
    effective: '20260130',
    revised: 'Revised: 1/2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('27f15fac-7d98-4114-a2ec-92494a91da98'),
    brands: { Rybelsus: 'semaglutide-oral-t2d', 'Ozempic pill': 'semaglutide-oral-t2d-ozempic' },
    mostImportant: {
      question: 'What is the most important information I should know about RYBELSUS and OZEMPIC tablets?',
      intro: 'RYBELSUS and OZEMPIC tablets may cause serious side effects, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, RYBELSUS and OZEMPIC tablets and other medicines that work like RYBELSUS and OZEMPIC tablets caused thyroid tumors, including thyroid cancer. It is not known if RYBELSUS and OZEMPIC tablets will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['a lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not use RYBELSUS or OZEMPIC tablets if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use RYBELSUS or OZEMPIC tablets if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of RYBELSUS and OZEMPIC tablets?',
      intro: 'RYBELSUS and OZEMPIC tablets may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about RYBELSUS and OZEMPIC tablets?”', text: 'See “What is the most important information I should know about RYBELSUS and OZEMPIC tablets?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of your pancreas (pancreatitis).', text: 'inflammation of your pancreas (pancreatitis). Stop using RYBELSUS or OZEMPIC tablets and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop using RYBELSUS or OZEMPIC tablets and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your abdomen to your back'] },
        { id: 'vision_changes', lead: 'changes in vision.', text: 'changes in vision. Tell your healthcare provider if you have changes in vision during treatment with RYBELSUS or OZEMPIC tablets.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with RYBELSUS or OZEMPIC tablets.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'low_blood_sugar', lead: 'low blood sugar (hypoglycemia).', text: 'low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use RYBELSUS or OZEMPIC tablets with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'blurred vision', 'anxiety, irritability, or mood changes', 'sweating', 'slurred speech', 'hunger', 'confusion or drowsiness', 'shakiness', 'weakness', 'headache', 'fast heartbeat', 'feeling jittery'], instruction: '', action: 'none', stopUsing: false, symptoms: ['dizziness or light-headedness', 'blurred vision', 'anxiety, irritability, or mood changes', 'sweating', 'slurred speech', 'hunger', 'confusion or drowsiness', 'shakiness', 'weakness', 'headache', 'fast heartbeat', 'feeling jittery'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use RYBELSUS or OZEMPIC tablets. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using RYBELSUS or OZEMPIC tablets and get medical help right away, if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop using RYBELSUS or OZEMPIC tablets and get medical help right away, if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. Gallbladder problems have happened in some people who take RYBELSUS andOZEMPIC tablets. Tell your healthcare provider right away if you get symptoms of gallbladder problems, which may include:', bullets: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'], instruction: 'Tell your healthcare provider right away if you get symptoms of gallbladder problems, which may include:', action: 'right_away', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'yellowing of skin or eyes (jaundice)', 'fever', 'clay-colored stools'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). RYBELSUS and OZEMPIC tablets may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking RYBELSUS or OZEMPIC tablets before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking RYBELSUS or OZEMPIC tablets before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  zepbound: {
    key: 'zepbound',
    title: 'Medication Guide ZEPBOUND ® (ZEHP-bownd) (tirzepatide) injection, for subcutaneous use',
    setid: '487cd7e7-434c-4925-99fa-aa80b1cc776b',
    version: '40',
    effective: '20260828',
    revised: 'Revised: 08/2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('487cd7e7-434c-4925-99fa-aa80b1cc776b'),
    brands: { Zepbound: 'tirzepatide' },
    mostImportant: {
      question: 'What is the most important information I should know about ZEPBOUND?',
      intro: 'ZEPBOUND may cause serious side effects, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats, ZEPBOUND and medicines that work like ZEPBOUND caused thyroid tumors, including thyroid cancer. It is not known if ZEPBOUND will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not use ZEPBOUND if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use ZEPBOUND if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of ZEPBOUND?',
      intro: 'ZEPBOUND may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about ZEPBOUND?”', text: 'See “What is the most important information I should know about ZEPBOUND?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use ZEPBOUND. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. Gallbladder problems have happened in some people who use ZEPBOUND. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', bullets: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'], instruction: 'Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', action: 'right_away', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'] },
        { id: 'pancreatitis', lead: 'inflammation of your pancreas (pancreatitis).', text: 'inflammation of your pancreas (pancreatitis). Stop using ZEPBOUND and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop using ZEPBOUND and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your abdomen to your back'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using ZEPBOUND and get medical help right away if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop using ZEPBOUND and get medical help right away if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'low_blood_sugar', lead: 'low blood sugar (hypoglycemia).', text: 'low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use ZEPBOUND with medicines that can cause low blood sugar, such as an insulin or sulfonylurea. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'], instruction: '', action: 'none', stopUsing: false, symptoms: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'] },
        { id: 'vision_changes', lead: 'changes in vision in patients with type 2 diabetes.', text: 'changes in vision in patients with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with ZEPBOUND.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with ZEPBOUND.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). ZEPBOUND may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking ZEPBOUND before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking ZEPBOUND before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  mounjaro: {
    key: 'mounjaro',
    title: 'Medication Guide MOUNJARO® [mown-JAHR-OH] (tirzepatide) injection, for subcutaneous use',
    setid: 'd2d7da5d-ad07-4228-955f-cf7e355c8cc0',
    version: '40',
    effective: '20260827',
    revised: 'Revised: August 2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration',
    url: dailymed('d2d7da5d-ad07-4228-955f-cf7e355c8cc0'),
    brands: { Mounjaro: 'tirzepatide' },
    mostImportant: {
      question: 'What is the most important information I should know about MOUNJARO?',
      intro: 'MOUNJARO may cause serious side effects, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats, MOUNJARO and medicines that work like MOUNJARO caused thyroid tumors, including thyroid cancer. It is not known if MOUNJARO will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not use MOUNJARO if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use MOUNJARO if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of MOUNJARO?',
      intro: 'MOUNJARO may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about MOUNJARO?”', text: 'See “What is the most important information I should know about MOUNJARO?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of your pancreas (pancreatitis).', text: 'inflammation of your pancreas (pancreatitis). Stop using MOUNJARO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop using MOUNJARO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your abdomen to your back'] },
        { id: 'low_blood_sugar', lead: 'low blood sugar (hypoglycemia).', text: 'low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use MOUNJARO with another medicine that can cause low blood sugar, such as a sulfonylurea or insulin. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'], instruction: '', action: 'none', stopUsing: false, symptoms: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using MOUNJARO and get medical help right away if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop using MOUNJARO and get medical help right away if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use MOUNJARO. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'vision_changes', lead: 'changes in vision.', text: 'changes in vision. Tell your healthcare provider if you have changes in vision during treatment with MOUNJARO.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with MOUNJARO.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. Gallbladder problems have happened in some people who use MOUNJARO. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', bullets: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'], instruction: 'Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', action: 'right_away', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). MOUNJARO may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking MOUNJARO before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking MOUNJARO before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  saxenda: {
    key: 'saxenda',
    title: 'MEDICATION GUIDE SAXENDA (sax-end-ah) (liraglutide) injection, for subcutaneous use',
    setid: '3946d389-0926-4f77-a708-0acb8153b143',
    version: '22',
    effective: '20260225',
    revised: 'Revised: 02/2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('3946d389-0926-4f77-a708-0acb8153b143'),
    brands: { Saxenda: 'liraglutide' },
    mostImportant: {
      question: 'What is the most important information I should know about SAXENDA?',
      intro: 'Serious side effects may happen in people who take SAXENDA, including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rats and mice, SAXENDA and medicines that work like SAXENDA caused thyroid tumors, including thyroid cancer. It is not known if SAXENDA will cause thyroid tumors or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['a lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: 'Do not use SAXENDA', text: 'Do not use SAXENDA if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not use SAXENDA if you or any of your family have ever had a type of thyroid cancer called medullary thyroid carcinoma (MTC), or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of SAXENDA?',
      intro: 'SAXENDA may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about SAXENDA?”', text: 'See “What is the most important information I should know about SAXENDA?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of the pancreas (pancreatitis).', text: 'inflammation of the pancreas (pancreatitis). Stop using SAXENDA and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. You may feel the pain from your stomach area (abdomen) to your back.', bullets: [], instruction: 'Stop using SAXENDA and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your stomach area (abdomen) to your back'] },
        { id: 'low_blood_sugar', lead: 'increased risk of low blood sugar (hypoglycemia) in adults with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas and in children who are 12 years of age and older without type 2 diabetes mellitus.', text: 'increased risk of low blood sugar (hypoglycemia) in adults with type 2 diabetes, especially those who also take medicines to treat type 2 diabetes mellitus such as an insulin or a sulfonylureas and in children who are 12 years of age and older without type 2 diabetes mellitus. Low blood sugar in patients with adults with type 2 diabetes and in children without type 2 diabetes mellitus who receive SAXENDA can be both a serious and common side effect. Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking SAXENDA and while you take SAXENDA. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'], after: 'Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking SAXENDA and while you take SAXENDA.', instruction: 'Talk to your healthcare provider about how to recognize and treat low blood sugar. You should check your blood sugar before you start taking SAXENDA and while you take SAXENDA.', action: 'tell', stopUsing: false, symptoms: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'] },
        { id: 'heart_rate', lead: 'increased heart rate.', text: 'increased heart rate. SAXENDA can increase your heart rate while you are at rest. Your healthcare provider should check your heart rate while you take SAXENDA. Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.', bullets: [], instruction: 'Tell your healthcare provider if you feel your heart racing or pounding in your chest and it lasts for several minutes.', action: 'tell', stopUsing: false, symptoms: ['heart racing or pounding in your chest and it lasts for several minutes'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use SAXENDA. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop using SAXENDA, and get medical help right away if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop using SAXENDA, and get medical help right away if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. SAXENDA may cause gallbladder problems including gallstones. Some gallbladder problems need surgery. Call your healthcare provider if you have any of the following symptoms:', bullets: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of your skin or eyes (jaundice)', 'clay-colored stools'], instruction: 'Call your healthcare provider if you have any of the following symptoms:', action: 'tell', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of your skin or eyes (jaundice)', 'clay-colored stools'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). SAXENDA may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking SAXENDA before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking SAXENDA before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
  foundayo: {
    key: 'foundayo',
    title: 'Medication Guide FOUNDAYO™ [fown-DAY-oh] (orforglipron) tablets, for oral use',
    setid: '8ac446c5-feba-474f-a103-23facb9b5c62',
    version: '10',
    effective: '20260729',
    revised: 'Issued: 07/2026',
    approval: 'This Medication Guide has been approved by the U.S. Food and Drug Administration.',
    url: dailymed('8ac446c5-feba-474f-a103-23facb9b5c62'),
    brands: { Foundayo: 'orforglipron' },
    mostImportant: {
      question: 'What is the most important information I should know about FOUNDAYO?',
      intro: 'FOUNDAYO may cause serious side effects including:',
      items: [
        { id: 'thyroid_tumors', lead: 'Possible thyroid tumors, including cancer.', text: 'Possible thyroid tumors, including cancer. Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath. These may be symptoms of thyroid cancer. In studies with rodents, medicines that work like FOUNDAYO caused thyroid tumors, including thyroid cancer. It is not known if FOUNDAYO will cause thyroid tumors, or a type of thyroid cancer called medullary thyroid carcinoma (MTC) in people.', bullets: [], instruction: 'Tell your healthcare provider if you get a lump or swelling in your neck, hoarseness, trouble swallowing, or shortness of breath.', action: 'tell', stopUsing: false, symptoms: ['lump or swelling in your neck', 'hoarseness', 'trouble swallowing', 'shortness of breath'] },
        { id: 'thyroid_do_not_use', lead: '', text: 'Do not take FOUNDAYO if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', bullets: [], instruction: 'Do not take FOUNDAYO if you or any of your family have ever had a type of thyroid cancer called MTC, or if you have an endocrine system condition called Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).', action: 'none', stopUsing: false, symptoms: [] },
      ],
    },
    seriousSideEffects: {
      question: 'What are the possible side effects of FOUNDAYO?',
      intro: 'FOUNDAYO may cause serious side effects, including:',
      items: [
        { id: 'see_most_important', lead: 'See “What is the most important information I should know about FOUNDAYO?”', text: 'See “What is the most important information I should know about FOUNDAYO?”', bullets: [], instruction: '', action: 'none', stopUsing: false, symptoms: [] },
        { id: 'pancreatitis', lead: 'inflammation of the pancreas (pancreatitis).', text: 'inflammation of the pancreas (pancreatitis). Stop taking FOUNDAYO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting. Sometimes you may feel the pain from your abdomen to your back.', bullets: [], instruction: 'Stop taking FOUNDAYO and call your healthcare provider right away if you have severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting.', action: 'right_away', stopUsing: true, symptoms: ['severe pain in your stomach area (abdomen) that will not go away, with or without nausea or vomiting', 'pain from your abdomen to your back'] },
        { id: 'severe_stomach', lead: 'severe stomach problems.', text: 'severe stomach problems. Stomach problems, sometimes severe, have been reported in people who use FOUNDAYO. Tell your healthcare provider if you have stomach problems that are severe or will not go away.', bullets: [], instruction: 'Tell your healthcare provider if you have stomach problems that are severe or will not go away.', action: 'tell', stopUsing: false, symptoms: ['stomach problems that are severe or will not go away'] },
        { id: 'kidney_dehydration', lead: 'dehydration leading to kidney problems.', text: 'dehydration leading to kidney problems. Diarrhea, nausea, and vomiting may cause a loss of fluids (dehydration) which may cause kidney problems. It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', bullets: [], instruction: 'It is important for you to drink fluids to help reduce your chance of dehydration. Tell your healthcare provider right away if you have nausea, vomiting, or diarrhea that does not go away.', action: 'right_away', stopUsing: false, symptoms: ['nausea, vomiting, or diarrhea that does not go away'] },
        { id: 'low_blood_sugar', lead: 'low blood sugar (hypoglycemia).', text: 'low blood sugar (hypoglycemia). Your risk for getting low blood sugar may be higher if you use FOUNDAYO with medicines that can cause low blood sugar, such as an insulin or sulfonylurea. Signs and symptoms of low blood sugar may include:', bullets: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'], instruction: '', action: 'none', stopUsing: false, symptoms: ['dizziness or light-headedness', 'sweating', 'confusion or drowsiness', 'headache', 'blurred vision', 'slurred speech', 'shakiness', 'fast heartbeat', 'anxiety, irritability, or mood changes', 'hunger', 'weakness', 'feeling jittery'] },
        { id: 'allergic_reaction', lead: 'serious allergic reactions.', text: 'serious allergic reactions. Stop taking FOUNDAYO and get medical help right away if you have any symptoms of a serious allergic reaction including:', bullets: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'], instruction: 'Stop taking FOUNDAYO and get medical help right away if you have any symptoms of a serious allergic reaction including:', action: 'emergency', stopUsing: true, symptoms: ['swelling of your face, lips, tongue, or throat', 'problems breathing or swallowing', 'severe rash or itching', 'fainting or feeling dizzy', 'very rapid heartbeat'] },
        { id: 'vision_changes', lead: 'changes in vision in patients with type 2 diabetes.', text: 'changes in vision in patients with type 2 diabetes. Tell your healthcare provider if you have changes in vision during treatment with FOUNDAYO.', bullets: [], instruction: 'Tell your healthcare provider if you have changes in vision during treatment with FOUNDAYO.', action: 'tell', stopUsing: false, symptoms: ['changes in vision'] },
        { id: 'gallbladder', lead: 'gallbladder problems.', text: 'gallbladder problems. Gallbladder problems have happened in some people who use FOUNDAYO. Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', bullets: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'], instruction: 'Tell your healthcare provider right away if you get symptoms of gallbladder problems which may include:', action: 'right_away', stopUsing: false, symptoms: ['pain in your upper stomach (abdomen)', 'fever', 'yellowing of skin or eyes (jaundice)', 'clay-colored stools'] },
        { id: 'aspiration_anesthesia', lead: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', text: 'food or liquid getting into the lungs during surgery or other procedures that use anesthesia or deep sleepiness (deep sedation). FOUNDAYO may increase the chance of food getting into your lungs during surgery or other procedures. Tell all your healthcare providers that you are taking FOUNDAYO before you are scheduled to have surgery or other procedures.', bullets: [], instruction: 'Tell all your healthcare providers that you are taking FOUNDAYO before you are scheduled to have surgery or other procedures.', action: 'tell', stopUsing: false, symptoms: [] },
      ],
    },
  },
} satisfies Record<string, MedGuide>;

export type MedGuideKey = keyof typeof MED_GUIDES;

export const MED_GUIDE_LIST: MedGuide[] = Object.values(MED_GUIDES);

/** The other instructions of each guide, by the key of the guide. Only the one about taking too much is shown in the app (guideOverdose). */
export const MED_GUIDE_OTHER: Record<MedGuideKey, GuideOther[]> = {
  wegovy: [
    { kind: 'before_use_condition', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have or have had problems with your pancreas or kidneys.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have type 2 diabetes and a history of diabetic retinopathy.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. WEGOVY may harm your unborn baby. You should stop using WEGOVY 2 months before you plan to become pregnant.', action: 'tell' },
    { kind: 'pregnancy_registry', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Pregnancy Exposure Registry: There is a pregnancy exposure registry for women who use WEGOVY during pregnancy. The purpose of this registry is to collect information about the health of you and your baby. Talk to your healthcare provider about how you can take part in this registry or you may contact Novo Nordisk at 1-877-390-2760 or www.wegovypregnancyregistry.com.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. Breastfeeding is not recommended during treatment with WEGOVY tablets. It is not known if WEGOVY when received through an injection passes into your breast milk. You should talk with your healthcare provider about the best way to feed your baby while using WEGOVY.', action: 'tell' },
    { kind: 'medicines', under: 'Before using WEGOVY, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements. WEGOVY may affect the way some medicines work and some medicines may affect the way WEGOVY works. Tell your healthcare provider if you are taking other medicines to treat diabetes, including sulfonylureas or insulin. WEGOVY slows stomach emptying and can affect medicines that need to pass through the stomach quickly.', action: 'tell' },
    { kind: 'overdose', under: 'How should I use WEGOVY?', text: 'If you take too much WEGOVY, you may have severe nausea, severe vomiting and severe low blood sugar. Call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org.', action: 'emergency' },
    { kind: 'missed_doses', under: 'How should I use WEGOVY?', text: 'If you miss doses of WEGOVY for 2 or more consecutive weeks, contact your healthcare provider to talk about how to restart your treatment.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of WEGOVY?', text: 'Talk to your healthcare provider about any side effect that bothers you or does not go away. These are not all the possible side effects of WEGOVY.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of WEGOVY?', text: 'Call your doctor for medical advice about side effects. You may report side effects to FDA at 1‑800‑FDA‑1088.', action: 'tell' },
  ],
  ozempic: [
    { kind: 'before_use_condition', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have or have had problems with your pancreas.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have a history of diabetic retinopathy.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have severe problems with your stomach, such as slowed emptying of your stomach (gastroparesis) or problems with digesting food.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. It is not known if OZEMPIC will harm your unborn baby. You should stop using OZEMPIC at least 2 months before you plan to become pregnant. Talk to your healthcare provider about the best way to control your blood sugar if you plan to become pregnant or while you are pregnant.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. It is not known if OZEMPIC passes into your breast milk. You should talk with your healthcare provider about the best way to feed your baby while using OZEMPIC.', action: 'tell' },
    { kind: 'medicines', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before using OZEMPIC, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Before using OZEMPIC, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking other medicines to treat diabetes, including insulin or sulfonylureas.', action: 'tell' },
    { kind: 'overdose', under: 'How should I use OZEMPIC?', text: 'If you take too much OZEMPIC, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of OZEMPIC?', text: 'Talk to your healthcare provider about any side effect that bothers you or does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of OZEMPIC?', text: 'Call your doctor for medical advice about side effects.', action: 'tell' },
  ],
  semaglutideTablets: [
    { kind: 'before_use_condition', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have or have had problems with your pancreas or kidneys.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'have a history of vision problems related to your diabetes.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. It is not known if RYBELSUS and OZEMPIC tablets will harm your unborn baby. You should stop using RYBELSUS or OZEMPIC tablets 2 months before you plan to become pregnant. Talk to your healthcare provider about the best way to control your blood sugar if you plan to become pregnant or while you are pregnant.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. Breastfeeding is not recommended during treatment with RYBELSUS or OZEMPIC tablets.', action: 'tell' },
    { kind: 'medicines', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take,including prescription and over-the-counter medicines, vitamins, and herbal supplements.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before using RYBELSUS or OZEMPIC tablets, tell your healthcare provider if you have any other medical conditions, including if you:', text: 'Before using RYBELSUS or OZEMPIC tablets, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking other medicines to treat diabetes, including insulin or sulfonylureas.', action: 'tell' },
    { kind: 'overdose', under: 'How should I take RYBELSUS or OZEMPIC tablets?', text: 'If you take too much RYBELSUS or OZEMPIC tablets, call your healthcare provider or Poison Help line at 1-800-222-1222, or go to the nearest hospital emergency room right away. Advice is also available online at poisonhelp.org.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of RYBELSUS and OZEMPIC tablets?', text: 'Talk to your healthcare provider about any side effect that bothers you or does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of RYBELSUS and OZEMPIC tablets?', text: 'Call your doctor for medical advice about side effects.', action: 'tell' },
  ],
  zepbound: [
    { kind: 'before_use_condition', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have or have had problems with your pancreas.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have severe problems with your stomach, such as slowed emptying of your stomach (gastroparesis) or problems with digesting food.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have a history of diabetic retinopathy.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. ZEPBOUND may harm your unborn baby. Tell your healthcare provider if you become pregnant while using ZEPBOUND.', action: 'tell' },
    { kind: 'pregnancy_registry', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Pregnancy Exposure Registry: There is a pregnancy exposure registry for women who have taken ZEPBOUND during pregnancy. The purpose of this registry is to collect information about the health of you and your baby. Talk to your healthcare provider about how you can take part in this registry, or you may call 1-844-524-0039 or email at MILEregistry@thermofisher.com or visit https://pregnancyregistry.lilly.com/zepbound.', action: 'tell' },
    { kind: 'birth_control', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Birth control pills by mouth may not work as well while using ZEPBOUND. If you take birth control pills by mouth, your healthcare provider may recommend another type of birth control for 4 weeks after you start ZEPBOUND and for 4 weeks after each increase in your dose of ZEPBOUND. Talk to your healthcare provider about birth control methods that may be right for you while using ZEPBOUND.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. ZEPBOUND may pass into your breast milk. Talk to your healthcare provider about the best way to feed your baby while using ZEPBOUND.', action: 'tell' },
    { kind: 'medicines', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take , including prescription and over-the-counter medicines, vitamins, and herbal supplements.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before using ZEPBOUND, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Before using ZEPBOUND, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking medicines to treat diabetes including an insulin or sulfonylurea.', action: 'tell' },
    { kind: 'overdose', under: 'How should I use ZEPBOUND?', text: 'If you take too much ZEPBOUND, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of ZEPBOUND?', text: 'Talk to your healthcare provider if you have any side effect that bothers you or that does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of ZEPBOUND?', text: 'Call your doctor for medical advice about side effects.', action: 'tell' },
  ],
  mounjaro: [
    { kind: 'before_use_condition', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have or have had problems with your pancreas.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have severe problems with your stomach, such as slowed emptying of your stomach (gastroparesis) or problems with digesting food.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have a history of diabetic retinopathy.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. It is not known if MOUNJARO will harm your unborn baby. Tell your healthcare provider if you become pregnant while using MOUNJARO.', action: 'tell' },
    { kind: 'birth_control', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Birth control pills by mouth may not work as well while using MOUNJARO. If you take birth control pills by mouth, your healthcare provider may recommend another type of birth control for 4 weeks after you start MOUNJARO and for 4 weeks after each increase in your dose of MOUNJARO. Talk to your healthcare provider about birth control methods that may be right for you while using MOUNJARO.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. MOUNJARO may pass into your breast milk. Talk to your healthcare provider about the best way to feed your baby while using MOUNJARO.', action: 'tell' },
    { kind: 'medicines', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before using MOUNJARO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Before using MOUNJARO, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking other medicines to treat diabetes including insulin or sulfonylureas.', action: 'tell' },
    { kind: 'overdose', under: 'How should I use MOUNJARO?', text: 'If you take too much MOUNJARO, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of MOUNJARO?', text: 'Talk to your healthcare provider if you have any side effect that bothers you or that does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of MOUNJARO?', text: 'Call your doctor for medical advice about side effects.', action: 'tell' },
  ],
  saxenda: [
    { kind: 'before_use_condition', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have or have had problems with your pancreas.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have severe problems with your stomach, such as slowed emptying of your stomach (gastroparesis) or problems with digesting food.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. It is not known if SAXENDA passes into your breast milk. You and your healthcare provider should decide if you will use SAXENDA or breastfeed.', action: 'tell' },
    { kind: 'medicines', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take including prescription, over-the-counter medicines, vitamins, and herbal supplements. SAXENDA may affect the way some medicines work and some other medicines may affect the way SAXENDA works.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before taking SAXENDA, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Tell your healthcare provider if you take diabetes medicines, especially insulin and sulfonylurea medicines. Talk with your healthcare provider if you are not sure if you take any of these medicines.', action: 'tell' },
    { kind: 'missed_doses', under: 'How should I use SAXENDA?', text: 'If you miss your daily dose of SAXENDA, just take your next daily dose as usual on the following day. Do not take an extra dose of SAXENDA or increase your dose on the following day to make up for your missed dose. If you miss your dose of SAXENDA for 3 days or more, call your healthcare provider to talk about how to restart your treatment.', action: 'tell' },
    { kind: 'overdose', under: 'How should I use SAXENDA?', text: 'If you take too much SAXENDA, call your healthcare provider or Poison Helpline at 1-800-222-1222 or go to the nearest hospital emergency room right away.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of SAXENDA?', text: 'Talk to your healthcare provider if you have any side effect that bothers you or that does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of SAXENDA?', text: 'These are not all the possible side effects of SAXENDA. Call your doctor for medical advice about side effects. You may report side effects to FDA at 1-800-FDA-1088.', action: 'tell' },
  ],
  foundayo: [
    { kind: 'before_use_condition', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have or have had problems with your pancreas or kidneys.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have severe problems with your liver.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have severe problems with your stomach, such as slowed emptying of your stomach (gastroparesis) or problems with digesting food.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'have a history of diabetic retinopathy.', action: 'tell' },
    { kind: 'before_use_condition', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are scheduled to have surgery or other procedures that use anesthesia or deep sleepiness (deep sedation).', action: 'tell' },
    { kind: 'pregnancy', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are pregnant or plan to become pregnant. FOUNDAYO may harm your unborn baby. Tell your healthcare provider if you become pregnant while taking FOUNDAYO.', action: 'tell' },
    { kind: 'pregnancy_registry', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Pregnancy Exposure Registry: There will be a pregnancy exposure registry for women who have taken FOUNDAYO during pregnancy. The purpose of this registry is to collect information about the health of you and your baby. Talk to your healthcare provider about how you can take part in this registry, or you may contact Eli Lilly and Company at 1-800-LillyRx (1-800-545-5979).', action: 'tell' },
    { kind: 'birth_control', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Birth control pills by mouth may not work as well while taking FOUNDAYO. If you take birth control pills by mouth, your healthcare provider may recommend another type of birth control for 30 days after you start FOUNDAYO and for 30 days after each increase in your dose of FOUNDAYO. Talk to your healthcare provider about birth control methods that may be right for you while using FOUNDAYO.', action: 'tell' },
    { kind: 'breastfeeding', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'are breastfeeding or plan to breastfeed. Breastfeeding is not recommended during treatment with FOUNDAYO. Talk to your healthcare provider about the best way to feed your baby while using FOUNDAYO.', action: 'tell' },
    { kind: 'medicines', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Tell your healthcare provider about all the medicines you take, including prescription and over-the-counter medicines, vitamins, and herbal supplements.', action: 'tell' },
    { kind: 'diabetes_medicines', under: 'Before taking FOUNDAYO, tell your healthcare provider about all of your medical conditions, including if you:', text: 'Before using FOUNDAYO, talk to your healthcare provider about low blood sugar and how to manage it. Tell your healthcare provider if you are taking medicines to treat diabetes including an insulin or sulfonylurea.', action: 'tell' },
    { kind: 'missed_doses', under: 'How should I take FOUNDAYO?', text: 'If you miss taking FOUNDAYO for 7 or more days in a row, call your healthcare provider to talk about how to restart your treatment.', action: 'tell' },
    { kind: 'overdose', under: 'How should I take FOUNDAYO?', text: 'If you take too much FOUNDAYO, call your healthcare provider or Poison Help line at 1-800-222-1222 or go to the nearest hospital emergency room right away.', action: 'emergency' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of FOUNDAYO?', text: 'Talk to your healthcare provider if you have any side effect that bothers you or that does not go away.', action: 'tell' },
    { kind: 'side_effects_general', under: 'What are the possible side effects of FOUNDAYO?', text: 'Call your doctor for medical advice about side effects.', action: 'tell' },
  ],
};

/** The Medication Guide of one US brand of a catalog entry, if there is one. */
export function medGuideFor(entryId: string, brand: string): MedGuide | undefined {
  return MED_GUIDE_LIST.find((g) => g.brands[brand] === entryId);
}

/**
 * What the guide says about taking too much, with the heading it stands under. It is the one
 * instruction outside the two parts that names an emergency room, so the screen shows it as a
 * third part, word for word.
 */
export function guideOverdose(g: MedGuide): GuideOther | undefined {
  return MED_GUIDE_OTHER[g.key as MedGuideKey]?.find((o) => o.kind === 'overdose');
}

/** The items the screen shows, in the guide's order: the most important information, then the serious side effects. */
export function guideItems(g: MedGuide): GuideItem[] {
  return [...g.mostImportant.items, ...g.seriousSideEffects.items];
}

/**
 * The date line of a guide as part of a sentence: "revised 06/2026", "issued 07/2026". The
 * word and the date are the guide's own; only the capital letter and the colon are dropped.
 * Chinese keeps the date as printed and translates the one word in front of it.
 */
export function guideDated(g: MedGuide, lang: Lang): string {
  const [word, ...rest] = g.revised.split(': ');
  const date = rest.join(': ');
  if (lang === 'en') return `${word.toLowerCase()} ${date}`;
  return `${word === 'Issued' ? '发布于' : '修订于'} ${date}`;
}

/**
 * Which Medication Guide the warning-signs screen shows for a saved medication.
 * - guide: the regimen names a US brand (or its region has exactly one brand of the entry and
 *   that is a US brand), and that brand has a guide here.
 * - chooseBrand: the entry has several US brands with a guide each, the regimen names none of
 *   them, and the person's region lists them all, so picking one in setup settles it
 *   (tirzepatide without Zepbound or Mounjaro; the chart asks in the same way).
 * - none: everything else. No US guide is on file: "Other / custom", a medication with no US
 *   brand, any region other than the United States (also where the brand has the same name),
 *   no medication at all. The app never picks a guide for a
 *   brand the person did not name.
 */
export type GuideChoice = { kind: 'guide'; guide: MedGuide; brand: string } | { kind: 'chooseBrand'; brands: string[] } | { kind: 'none' };

export function guideChoice(reg: Pick<Regimen, 'drugId' | 'brand'> | null | undefined, region: Region): GuideChoice {
  // The guides are US documents. A brand of the same name sold elsewhere has its own leaflet.
  if (!reg || region !== 'US') return { kind: 'none' };
  const drug = drugById(reg.drugId);
  const brand = regimenBrand(reg, region);
  const guide = brand ? medGuideFor(drug.id, brand) : undefined;
  if (brand && guide) return { kind: 'guide', guide, brand };
  const withGuide = (drug.brands.US ?? []).filter((b) => medGuideFor(drug.id, b) !== undefined);
  const listed = drug.brands[region] ?? [];
  if (withGuide.length > 1 && withGuide.every((b) => listed.includes(b))) return { kind: 'chooseBrand', brands: withGuide };
  return { kind: 'none' };
}
