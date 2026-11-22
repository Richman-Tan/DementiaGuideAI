// Minimal React render helpers for jsdom test files (`// @vitest-environment jsdom`).
//
// React 19 ships `act` itself, so mounting a provider or a hook needs no testing
// library: createRoot into a detached container, and drive every update through
// act() so effects and state settle before the assertions run. Test files are
// plain .js (the Vitest include pattern), so elements are built with
// React.createElement rather than JSX.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Captured before any test installs fake timers, so settle() always yields a
// real macrotask.
const realSetTimeout = globalThis.setTimeout;

export const h = React.createElement;

const mounted = new Set();

/** Mount an element. → { container, rerender(el), unmount() } */
export async function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  const unmount = async () => {
    if (!mounted.delete(unmount)) return;
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  mounted.add(unmount);
  return {
    container,
    rerender: (el) =>
      act(async () => {
        root.render(el);
      }),
    unmount,
  };
}

/** Unmount everything still mounted — call from afterEach so no listener outlives its test. */
export async function cleanup() {
  for (const unmount of [...mounted]) await unmount();
}

/**
 * Run a hook inside a component. `result.current` is the latest return value.
 * `wrapper` is an optional provider component wrapped around the probe.
 */
export async function renderHook(hook, { initialProps, wrapper } = {}) {
  const result = { current: undefined };
  function Probe({ props }) {
    result.current = hook(props);
    return null;
  }
  const tree = (props) => {
    const probe = h(Probe, { props });
    return wrapper ? h(wrapper, null, probe) : probe;
  };
  const r = await render(tree(initialProps));
  return {
    result,
    rerender: (props) => r.rerender(tree(props)),
    unmount: r.unmount,
  };
}

/** Run a callback inside act() and let effects and microtasks settle. */
export const flush = (fn = () => {}) =>
  act(async () => {
    await fn();
  });

/** Let every pending promise chain (async effects, mocked I/O) run to completion. */
export const settle = () =>
  act(async () => {
    await new Promise((r) => realSetTimeout(r, 0));
  });
