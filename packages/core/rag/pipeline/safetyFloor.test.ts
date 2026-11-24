import { safetyFloor } from './safetyFloor.ts';

describe('safetyFloor', () => {
  it.each([
    ["My dad's face is drooping and his speech is slurred", 'stroke'],
    ['I think she is having a stroke', 'stroke'],
    ["He can't lift his arm all of a sudden", 'stroke'],
    ["She won't wake up", 'unresponsive'],
    ['Mum collapsed in the kitchen', 'unresponsive'],
    ["He can't breathe properly", 'breathing'],
    ['Dad is choking on his food', 'breathing'],
    ['She has chest pain and feels sick', 'chest_pain'],
    ['Mum fell in the bathroom and hit her head', 'fall_injury'],
    ['He had a fall and now he cannot stand, I think something is broken', 'fall_injury'],
    ['He took too many pills this morning', 'poisoning'],
    ['She drank bleach by mistake', 'poisoning'],
    ['I want to kill myself', 'self_harm'],
    ["I don't want to be here anymore", 'self_harm'],
    ['He keeps talking about suicide', 'self_harm'],
  ])('treats %j as an emergency (%s)', (message, category) => {
    const result = safetyFloor(message);
    expect(result.level).toBe('emergency');
    expect(result.categories).toContain(category);
  });

  it.each([
    ['Dad has gone missing from the house', 'missing_person'],
    ["Mum's missing and it is getting dark", 'missing_person'],
    ["I can't find my husband anywhere", 'missing_person'],
    ['He hit me last night when I tried to help him dress', 'violence'],
    ['She gets violent in the evenings', 'violence'],
    ['Since his stroke last year he has trouble with words', 'stroke_mentioned'],
  ])('treats %j as needing caution (%s)', (message, category) => {
    const result = safetyFloor(message);
    expect(result.level).toBe('caution');
    expect(result.categories).toContain(category);
  });

  // The check this replaces matched substrings: "white" contains "hit" and
  // "pharmacy" contains "harm", and both raised the emergency card.
  it.each([
    'She only eats white bread now',
    'Which pharmacy does blister packs?',
    'How do I manage sundowning?',
    "I'm missing my old life",
    'He missed breakfast again',
    'What respite care options are available?',
    'She hit the nail on the head about the care plan',
    'Is it safe to leave him alone for an hour?',
  ])('raises nothing for %j', (message) => {
    expect(safetyFloor(message)).toEqual({ level: 'none', categories: [] });
  });

  it('reports every category that matches, and the most serious level', () => {
    const result = safetyFloor('He hit me, then collapsed and is not breathing');
    expect(result.level).toBe('emergency');
    expect(result.categories).toEqual(expect.arrayContaining(['unresponsive', 'violence']));
  });

  it('does not also count a stroke happening now as a stroke mentioned in passing', () => {
    expect(safetyFloor('I think he is having a stroke').categories).toEqual(['stroke']);
  });
});
