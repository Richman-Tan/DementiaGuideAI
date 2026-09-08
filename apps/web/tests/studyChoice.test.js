// Questionnaire interaction rules. The instruments' wording is ethics-approved
// and lives in instruments.js; what is tested here is how a participant's taps
// become stored answers — the part the pilot tester caught: "some of the
// options cannot be left unticked, and on some more than one answer might
// apply".
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Choice, MultiChoice, nextChoiceValue, toggleMulti } from '../src/study/ui.jsx';

describe('single-choice taps', () => {
  it('selects, and switches between options', () => {
    expect(nextChoiceValue(null, 3)).toBe(3);
    expect(nextChoiceValue(3, 5)).toBe(5);
  });

  it('clears when the selected option is tapped again', () => {
    // The fix itself: an answer is voluntary, so a stray tap cannot be
    // permanent. null is indistinguishable from never-answered downstream —
    // the flat responses map and the snapshot payloads both carry it.
    expect(nextChoiceValue(3, 3)).toBe(null);
  });

  it('treats false as a real answer, not as unanswered', () => {
    // The setup screen's supporter question stores true/false; its Start gate
    // requires === true, so a cleared false must become null, not flip to true.
    expect(nextChoiceValue(false, false)).toBe(null);
    expect(nextChoiceValue(null, false)).toBe(false);
  });
});

describe('multi-choice taps', () => {
  it('adds and removes values', () => {
    expect(toggleMulti([], 'a')).toEqual(['a']);
    expect(toggleMulti(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleMulti(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('never mutates the stored answer', () => {
    const stored = ['a'];
    toggleMulti(stored, 'b');
    toggleMulti(stored, 'a');
    expect(stored).toEqual(['a']);
  });

  it('tolerates a scalar left over from a single-choice question', () => {
    expect(toggleMulti(undefined, 'a')).toEqual(['a']);
    expect(toggleMulti('oops', 'a')).toEqual(['a']);
  });
});

const OPTIONS = [
  { value: 1, label: 'One' },
  { value: 2, label: 'Two' },
  { value: 3, label: 'Three' },
];

describe('rendered semantics', () => {
  it('Choice is a radiogroup with exactly one checked option', () => {
    const html = renderToStaticMarkup(
      React.createElement(Choice, { name: 'q', options: OPTIONS, value: 2, onChange: () => {} }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(2);
  });

  it('MultiChoice is a group of checkboxes and can carry several answers', () => {
    const html = renderToStaticMarkup(
      React.createElement(MultiChoice, { name: 'q', options: OPTIONS, value: [1, 3], onChange: () => {} }),
    );
    expect(html).toContain('role="group"');
    expect(html.match(/role="checkbox"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
  });

  it('MultiChoice renders unanswered when handed no value at all', () => {
    const html = renderToStaticMarkup(
      React.createElement(MultiChoice, { name: 'q', options: OPTIONS, onChange: () => {} }),
    );
    expect(html.match(/aria-checked="false"/g)).toHaveLength(3);
  });
});
