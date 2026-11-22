// @vitest-environment jsdom
// The auto-growing composer (components/GrowTextArea.jsx) used by Home and
// Chat: one line at rest, grows with its content up to maxHeight and then
// scrolls inside itself; Enter sends, Shift+Enter is a newline.
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { createRef } from 'react';
import { render, flush, cleanup, h } from './helpers/render.js';
import { GrowTextArea } from '../src/components/GrowTextArea.jsx';

// jsdom does no layout, so scrollHeight is whatever the test says the content
// needs.
let contentHeight = 0;
Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
  configurable: true,
  get: () => contentHeight,
});
afterAll(() => {
  delete HTMLTextAreaElement.prototype.scrollHeight;
});

afterEach(async () => {
  await cleanup();
  contentHeight = 0;
});

const props = (over = {}) => ({ value: '', onChange: vi.fn(), onSubmit: vi.fn(), ...over });

async function mount(p) {
  const r = await render(h(GrowTextArea, p));
  return { ...r, ta: r.container.querySelector('textarea') };
}

describe('height', () => {
  it('fits its content, then caps at maxHeight and scrolls inside', async () => {
    contentHeight = 48;
    const p = props({ value: 'one line', maxHeight: 120, onGrow: vi.fn() });
    const { ta, rerender } = await mount(p);
    expect(ta.style.height).toBe('48px');
    expect(ta.style.overflowY).toBe('hidden');
    expect(p.onGrow).toHaveBeenCalledTimes(1);

    contentHeight = 300;
    await rerender(h(GrowTextArea, { ...p, value: 'many\nlines\nof\ntext' }));
    expect(ta.style.height).toBe('120px');
    expect(ta.style.overflowY).toBe('auto');
    expect(p.onGrow).toHaveBeenCalledTimes(2);
  });

  it('keeps managing its height when a caller passes its own ref', async () => {
    // React 19 hands `ref` to a function component as an ordinary prop, so it
    // arrives in the rest spread. The component's own ref is applied after the
    // spread, so the caller's cannot detach the textarea from the effect (and is
    // not attached itself: no caller needs the element today).
    contentHeight = 60;
    const ref = createRef();
    const { ta } = await mount({ ...props({ value: 'x' }), ref });
    expect(ta.style.height).toBe('60px');
    expect(ref.current).toBeNull();
  });
});

describe('keys', () => {
  const key = (ta, init) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    ta.dispatchEvent(e);
    return e;
  };

  it('Enter sends and does not insert a newline; Shift+Enter is left alone', async () => {
    const p = props({ value: 'hello' });
    const { ta } = await mount(p);
    let e;
    await flush(() => {
      e = key(ta, { key: 'Enter' });
    });
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);

    await flush(() => {
      e = key(ta, { key: 'Enter', shiftKey: true });
    });
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);

    await flush(() => {
      key(ta, { key: 'a' });
    });
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('reports typed text as a plain string', async () => {
    const p = props();
    const { ta } = await mount(p);
    await flush(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, 'typed');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(p.onChange).toHaveBeenCalledWith('typed');
  });
});
