import { endOfTurnWaitMs, looksLikeEcho } from './turnHeuristics.ts';

const WAITS = { baseMs: 1200, midClauseMs: 2200, questionMs: 700 };
const wait = (text: string) => endOfTurnWaitMs(text, WAITS);

describe('endOfTurnWaitMs', () => {
  it('waits the base time when nothing in the words says otherwise', () => {
    expect(wait('my mum has been getting up at night')).toBe(1200);
    expect(wait('')).toBe(1200);
    expect(wait('   ')).toBe(1200);
    expect(wait('...')).toBe(1200);
  });

  it.each([
    'my mum keeps getting up at night and',
    'she gets upset because',
    'I was wondering if',
    'he takes his tablets with',
    'it started about a week ago, um',
    'I have tried the',
    'She wanders, ',
  ])('waits longer when the words break off mid-clause: %j', (text) => {
    expect(wait(text)).toBe(2200);
  });

  it.each([
    'how do I manage sundowning',
    'What can I do when she will not eat',
    'is it safe to leave him alone',
    'Should I call the doctor?',
    'tired?',
  ])('waits less after a whole question: %j', (text) => {
    expect(wait(text)).toBe(700);
  });

  it('does not take a question that has only just begun as finished', () => {
    expect(wait('how do I')).toBe(1200);
    expect(wait('what')).toBe(1200);
  });

  it('lets a trailing word outweigh a question opening', () => {
    expect(wait('how do I help her when')).toBe(2200);
    expect(wait('what should I do if the')).toBe(2200);
  });

  it('goes by the words whatever their case or punctuation', () => {
    expect(wait('How do I manage Sundowning.')).toBe(700);
    expect(wait('She gets upset BECAUSE')).toBe(2200);
  });
});

describe('looksLikeEcho', () => {
  const SPEAKING =
    'Keep the late afternoon calm and well lit. Close the curtains before dusk and keep a familiar routine.';

  it('recognises a run of the assistant’s own words', () => {
    expect(looksLikeEcho('close the curtains before dusk', SPEAKING)).toBe(true);
    expect(looksLikeEcho('calm and well lit', SPEAKING)).toBe(true);
  });

  it('allows for a word or two the recogniser got wrong', () => {
    expect(looksLikeEcho('clothes the curtains before dusk', SPEAKING)).toBe(true);
    expect(looksLikeEcho('keep a familiar routine okay', SPEAKING)).toBe(true);
  });

  it('does not mistake the person’s own words for an echo', () => {
    expect(looksLikeEcho('sorry can you say that again', SPEAKING)).toBe(false);
    expect(looksLikeEcho('what about in the morning', SPEAKING)).toBe(false);
  });

  it('is not fooled by shared words that are out of order or scattered', () => {
    expect(looksLikeEcho('dusk before curtains the close', SPEAKING)).toBe(false);
    expect(looksLikeEcho('keep her calm and I will close the door', SPEAKING)).toBe(false);
  });

  it('never calls a single word an echo, so "stop" always gets through', () => {
    expect(looksLikeEcho('calm', SPEAKING)).toBe(false);
    expect(looksLikeEcho('stop', 'You can stop the tablets only on advice.')).toBe(false);
  });

  it('has nothing to compare when either side is empty', () => {
    expect(looksLikeEcho('', SPEAKING)).toBe(false);
    expect(looksLikeEcho('close the curtains', '')).toBe(false);
  });
});
