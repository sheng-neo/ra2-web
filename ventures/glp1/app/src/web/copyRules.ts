/**
 * Rules every piece of English copy must pass. Used by the tests of the dictionary, the content
 * files and the rendered screens, so a new string cannot slip past them.
 */

const CJK = /[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/;

const BANNED: [RegExp, string][] = [
  [/!/, 'exclamation mark'],
  [/blood\s+levels?/i, '"blood level" (say "estimated medication level")'],
  [/hipaa/i, 'HIPAA claim'],
  [/reviewed\s+by\s+(?:a\s+|an\s+|your\s+|our\s+)?(?:doctor|pharmacist|physician|clinician|dietitian)/i, '"reviewed by a doctor/pharmacist" claim'],
  [/(?:never|not|doesn't|does not)\s+leaves?\s+(?:your|this|the)\s+(?:phone|device)/i, '"data never leaves your phone" claim'],
  [/\b(?:lose|losing)\s+(?:more\s+)?weight\b|\bweight[- ]loss\b/i, 'weight-loss claim'],
  [/\b(?:keep|keeps|preserve|preserves|protect|protects|save|saves|build|builds|rebuild|rebuilds)\s+(?:your\s+|back\s+)?muscle/i, 'muscle claim'],
];

/** Problems found in one English string. Empty when the string is fine. */
export function copyProblems(text: string): string[] {
  const problems: string[] = [];
  if (CJK.test(text)) problems.push('Chinese characters or full-width punctuation');
  for (const [re, what] of BANNED) if (re.test(text)) problems.push(what);
  return problems;
}
