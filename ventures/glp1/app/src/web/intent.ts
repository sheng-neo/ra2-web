/**
 * Decides whether a typed message is a question, before any parsing.
 * A question about changing the dose is never answered: it is offered to be saved under
 * "questions for my doctor". Any other question gets the "answers are not ready yet" card.
 */

/** 涉及加量、减量、停药、换药的问题：不回答，转成"想问医生的问题"。 */
const DOSE_Q = /((加量|加到|加大|减量|減量|减到|減到|停药|停藥|换药|換藥|剂量|劑量|几毫克|幾毫克).{0,12}(吗|嗎|么|麼|呢|\?|？))|((能不能|可不可以|可以不可以|能否).{0,8}(加|减|減|停|换|換))/;
const QUESTION = /([?？]|吗|嗎|么|麼|呢)\s*$|^(怎么|怎麼|为什么|為什麼|要不要|能不能|可不可以|how|what|why|can i|should i)/i;

// English. A message counts as a dose question only when it both asks something and is about
// the amount of medication or about stopping, skipping or switching it.
// It asks something when it ends with a question mark or opens like a question. "Did", "do",
// "is", "are" and "am" only open a question with a subject after them ("did I", "is it",
// "is my"): a log can start the same way ("did my 5 mg dose", "did my shot").
const ASKS_EN = new RegExp(
  String.raw`\?\s*$` +
    String.raw`|^\s*(?:should|can|could|may|will|would|how|what|when|which|why)\b` +
    String.raw`|^\s*(?:is|are|does)\s+(?:i|it|we|you|they|this|that|these|those|there|the|my|a|an)\b` +
    String.raw`|^\s*do\s+(?:i|we|you|they|these|those|people|the)\b` +
    String.raw`|^\s*am\s+i\b` +
    String.raw`|^\s*did\s+(?:i|it|we|you|they|this|that|the|my\s+(?:doctor|dr|nurse|pharmacist|provider))\b`,
  'i',
);
const DOSE_WORD_EN = /\b(?:dose|doses|dosage|dosing)\b/i;
const HOW_MUCH_EN = /\bhow\s+(?:much|many\s+(?:mg|milligrams?|units?|clicks?|pills?))\b.{0,40}\b(?:take|inject|use|shot|pill|medication|meds?)\b/i;
const CHANGE_VERB_EN = String.raw`(?:increas|rais|lower|reduc|decreas|skip|stop|quit|paus|restart|resum|switch|doubl|split|taper)\w*|go(?:ing)?\s+(?:up|down)|mov(?:e|ing)\s+up|step(?:ping)?\s+up|bump(?:ing)?\s+up|cut(?:ting)?\s+(?:back|down)|com(?:e|ing)\s+off|get(?:ting)?\s+off`;
const MEDICATION_EN = String.raw`(?:mg|milligrams?|shots?|injections?|pills?|tablets?|medication|medicine|meds?)`;
const CHANGE_EN = new RegExp(String.raw`\b(?:${CHANGE_VERB_EN})\b.{0,40}\b${MEDICATION_EN}\b`, 'i');

export type QuestionRoute = 'doctor' | 'question' | null;

export function routeQuestion(text: string): QuestionRoute {
  // Phones type curly apostrophes; the patterns expect straight ones.
  const s = text.trim().replace(/[\u2018\u2019]/g, "'");
  if (DOSE_Q.test(s)) return 'doctor';
  if (ASKS_EN.test(s) && (DOSE_WORD_EN.test(s) || HOW_MUCH_EN.test(s) || CHANGE_EN.test(s))) return 'doctor';
  if (QUESTION.test(s)) return 'question';
  return null;
}
