// The ChoiceGroup component (src/components/ui/ChoiceGroup.jsx): the markup a
// screen reader depends on. Its keyboard behaviour and its look in a browser
// are checked in e2e/onboarding.spec.js.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChoiceGroup } from '../src/components/ui/ChoiceGroup.jsx';

const OPTIONS = [
  { value: 'short', label: 'Short', note: 'A few sentences.' },
  { value: 'balanced', label: 'Balanced', note: 'Two to four short paragraphs.' },
  { value: 'thorough', label: 'Thorough' },
];
const render = (props) =>
  renderToStaticMarkup(
    React.createElement(ChoiceGroup, {
      label: 'How much detail?',
      value: 'balanced',
      onChange: () => {},
      options: OPTIONS,
      ...props,
    })
  );
const radios = (html) => [...html.matchAll(/<button[^>]*role="radio"[^>]*>.*?<\/button>/g)];
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe('a group of choices', () => {
  const html = render();

  it('is a radio group named by its visible label', () => {
    const group = html.match(/<div[^>]*role="radiogroup"[^>]*>/)[0];
    const labelId = attr(group, 'aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(html).toContain(`id="${labelId}"`);
    expect(html).toMatch(new RegExp(`id="${labelId}"[^>]*>How much detail\\?<`));
  });

  it('has one radio for each option, and says which is chosen', () => {
    const found = radios(html).map(([tag]) => ({
      checked: attr(tag, 'aria-checked'),
      text: tag.replace(/<[^>]+>/g, ''),
    }));
    expect(found).toEqual([
      { checked: 'false', text: 'Short' },
      { checked: 'true', text: 'Balanced✓' },
      { checked: 'false', text: 'Thorough' },
    ]);
  });

  it('marks the chosen one with a tick that is kept from screen readers', () => {
    // The state is already announced; the tick is for the eye.
    expect(html.match(/✓/g)).toHaveLength(1);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>✓<\/span>/);
  });

  it('writes out what the chosen option does, and ties it to the group', () => {
    const group = html.match(/<div[^>]*role="radiogroup"[^>]*>/)[0];
    const noteId = attr(group, 'aria-describedby');
    expect(html).toMatch(new RegExp(`<p id="${noteId}"[^>]*>Two to four short paragraphs\\.</p>`));
    expect(html).not.toContain('A few sentences.');
  });

  it('writes nothing underneath when the chosen option has no note', () => {
    const quiet = render({ value: 'thorough' });
    expect(quiet).not.toContain('<p');
    expect(quiet.match(/<div[^>]*role="radiogroup"[^>]*>/)[0]).not.toContain('aria-describedby');
  });

  it('adds the classes a screen gives it for where it sits', () => {
    expect(render({ className: 'mt-5' })).toMatch(/^<div class="[^"]*\bmt-5\b/);
    expect(render()).toMatch(/^<div class="flex flex-col gap-2 text-left">/);
  });

  it('lets its options wrap rather than overflow', () => {
    const group = html.match(/<div[^>]*role="radiogroup"[^>]*>/)[0];
    expect(attr(group, 'class')).toContain('flex-wrap');
    expect(attr(radios(html)[0][0], 'class')).toContain('min-w-max');
  });
});
