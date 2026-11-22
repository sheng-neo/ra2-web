import { describe, expect, it } from 'vitest';
import { cleanSetupAnswers, hasSetupAnswer, HEARD_FROM, LOGGED_BEFORE, NO_SETUP_ANSWERS, TIME_ON_MEDICATION } from './setupQuestions';

describe('the three optional setup questions', () => {
  it('each has its five fixed choices', () => {
    expect(TIME_ON_MEDICATION).toEqual(['not_started', 'under_1_month', '1_to_3_months', '3_to_12_months', 'over_1_year']);
    expect(LOGGED_BEFORE).toEqual(['nothing', 'notes_or_spreadsheet', 'tracker_app', 'drug_maker_app', 'other']);
    expect(HEARD_FROM).toEqual(['app_store_search', 'friend_or_family', 'online_community', 'web_search', 'other']);
  });

  it('every question can be skipped', () => {
    expect(NO_SETUP_ANSWERS).toEqual({ timeOnMedication: null, loggedBefore: null, heardFrom: null });
    expect(hasSetupAnswer(NO_SETUP_ANSWERS)).toBe(false);
    expect(hasSetupAnswer({ ...NO_SETUP_ANSWERS, heardFrom: 'other' })).toBe(true);
  });

  it('saved answers are read back as listed values only', () => {
    const saved = { timeOnMedication: 'over_1_year', loggedBefore: 'nothing', heardFrom: 'web_search' };
    expect(cleanSetupAnswers(saved)).toEqual(saved);
    // A profile saved before the questions existed, or by a build that does not ask them.
    for (const missing of [undefined, null, 'x', 3, []]) expect(cleanSetupAnswers(missing)).toEqual(NO_SETUP_ANSWERS);
    // A hand-edited backup: free text, a value from another question's list, a wrong type.
    expect(cleanSetupAnswers({ timeOnMedication: 'about two years', loggedBefore: 'web_search', heardFrom: 7, extra: 'kept out' })).toEqual(NO_SETUP_ANSWERS);
    expect(cleanSetupAnswers({ timeOnMedication: 'not_started' })).toEqual({ timeOnMedication: 'not_started', loggedBefore: null, heardFrom: null });
  });
});
