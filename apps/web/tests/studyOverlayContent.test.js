// What the task band shows, in each of its two states. The band is subtracted
// from the chat window, so every always-visible line here is space a pilot
// tester asked for back ("the task window is too big but the main window is too
// small") — and the identity warning must survive the slimming, because it is
// the instruction most likely to be forgotten mid-task.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverlayBand, nextTextScale, textScaleLabel } from '../src/study/screens/OverlayBand.jsx';
import { IDENTITY_WARNING } from '@core/study/studyConfig.mjs';

const task = {
  title: 'Find out about sleep',
  situation: 'The person you care for has been sleeping much more than usual lately.',
  goal: 'Find out what could be causing it and what you could do.',
};

const render = (over = {}) =>
  renderToStaticMarkup(
    React.createElement(OverlayBand, {
      task,
      expanded: false,
      textScale: 1,
      confirmStop: false,
      onToggle: () => {}, onCycleText: () => {}, onFound: () => {}, onNotFound: () => {},
      onStopRequest: () => {}, onStopConfirm: () => {}, onStopCancel: () => {},
      ...over,
    }),
  );

describe('the collapsed band (the default during a task)', () => {
  const html = render();

  it('keeps the title, the goal, and the identity warning', () => {
    expect(html).toContain(task.title);
    expect(html).toContain(task.goal);
    // Imported from the same constant the band renders, so the two cannot drift.
    expect(html).toContain(IDENTITY_WARNING.slice(0, 40));
  });

  it('hides the situation — it was read in full on the arm brief', () => {
    expect(html).not.toContain(task.situation);
  });

  it('keeps all three task buttons and offers the details', () => {
    expect(html).toContain('I found my answer');
    expect(html).toContain('I couldn’t find it');
    expect(html).toContain('I need to stop');
    expect(html).toContain('Show details');
  });

  it('carries the text-size control', () => {
    expect(html).toContain('aria-label="Text size"');
  });
});

describe('the expanded band', () => {
  const html = render({ expanded: true });

  it('shows the situation again', () => {
    expect(html).toContain(task.situation);
  });

  it('offers the way back down', () => {
    expect(html).toContain('Hide details');
  });
});

describe('the stop confirmation', () => {
  it('appears only when asked for', () => {
    expect(render()).not.toContain('Yes, stop');
    expect(render({ confirmStop: true })).toContain('Yes, stop');
  });
});

describe('the text-size cycle', () => {
  it('visits every step and returns home', () => {
    expect(nextTextScale(1)).toBe(1.25);
    expect(nextTextScale(1.25)).toBe(0.85);
    expect(nextTextScale(0.85)).toBe(1);
  });

  it('labels each step distinctly', () => {
    expect(new Set([textScaleLabel(1), textScaleLabel(1.25), textScaleLabel(0.85)]).size).toBe(3);
  });
});
