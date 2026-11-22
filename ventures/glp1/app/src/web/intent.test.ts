import { describe, expect, it } from 'vitest';
import { parseLocal } from '../core/localParse';
import { routeQuestion } from './intent';

describe('routeQuestion', () => {
  it('sends Chinese questions about changing the dose to "ask your doctor", as before', () => {
    for (const s of ['能不能加量', '下次可以加到 7.5 吗', '我想停药可以吗？', '剂量要不要改呢']) expect(routeQuestion(s), s).toBe('doctor');
    for (const s of ['为什么会恶心', '便秘怎么办？', '怎么打针']) expect(routeQuestion(s), s).toBe('question');
    for (const s of ['刚打了 2.5 左腹', '早饭俩鸡蛋一杯豆浆', '今天 150 斤']) expect(routeQuestion(s), s).toBeNull();
  });

  it('sends English questions about the dose, or about stopping, skipping or switching, to "ask your doctor"', () => {
    for (const s of [
      'Should I increase my dose?',
      'Can I go up to 5 mg next week?',
      'can i skip my shot this week',
      'Is it ok to stop taking my medication?',
      'What dose should I take?',
      'how much should I inject',
      'How many mg should I take',
      'Can I split the dose?',
      'Should I switch my shot day?',
      'Is it safe to double my pills if I missed one?',
      'Could I lower my dose because of nausea?',
      'When can I move up to the next dose',
      // no question mark, but a subject right after the first word
      'did I take the right dose',
      'do I need a higher dose',
      'is my dose too high',
      'does my dose need to change',
      'am I on too high a dose',
      'is it time to go up to 5 mg',
    ])
      expect(routeQuestion(s), s).toBe('doctor');
  });

  it('treats other English questions as plain questions', () => {
    for (const s of ['Why do I feel sick?', 'What can I eat for constipation?', 'How do I store my pen?', 'Can I drink coffee?', "why can't I sleep"]) expect(routeQuestion(s), s).toBe('question');
  });

  it('leaves ordinary English logs alone', () => {
    for (const s of ['took 2.5 mg', 'shot 5mg left thigh', '182.4 lb', 'weighed 182.4', 'two eggs and a protein shake', 'felt a bit tired after my shot', 'I skipped breakfast', 'stopped for coffee']) expect(routeQuestion(s), s).toBeNull();
  });

  it('a log that starts with "did" is a log, and is read as a dose', () => {
    for (const s of ['did my 5 mg dose', 'Did my dose', 'Did my weekly dose, 5 mg', 'did my dose 5 mg', 'did my 5 mg dose this morning', 'did my shot 5 mg left thigh', 'Am on the 5 mg dose now', 'do my dose tonight']) expect(routeQuestion(s), s).toBeNull();
    for (const s of ['did my 5 mg dose', 'Did my weekly dose, 5 mg', 'did my dose 5 mg', 'did my 5 mg dose this morning']) {
      expect(parseLocal(s, 'lb', 'en'), s).toMatchObject({ events: [{ type: 'dose', amount: 5, unit: 'mg' }], rest: '' });
    }
  });
});
