// @vitest-environment jsdom
// Unity bridge behaviour that does not need the real 244 MB runtime: who may
// park the shared canvas, and the config handed to createUnityInstance. The
// loader script, fetch and createUnityInstance are fakes; the bridge is real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../src/avatar/unity/unityBridge.js');
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('shared canvas ownership', () => {
  it('a mount that lost the canvas to another mount does not pull it back out', async () => {
    const { getUnityCanvas, parkUnityCanvas } = await load();
    const hostA = document.body.appendChild(document.createElement('div'));
    const hostB = document.body.appendChild(document.createElement('div'));
    const canvas = getUnityCanvas();
    hostA.appendChild(canvas); // mount A adopts it
    hostB.appendChild(getUnityCanvas()); // mount B adopts it (a layout change)
    parkUnityCanvas(hostA); // A's cleanup runs late
    expect(canvas.parentElement).toBe(hostB);
  });

  it('the mount that still holds the canvas parks it off-screen', async () => {
    const { getUnityCanvas, parkUnityCanvas } = await load();
    const host = document.body.appendChild(document.createElement('div'));
    const canvas = getUnityCanvas();
    host.appendChild(canvas);
    parkUnityCanvas(host);
    expect(canvas.parentElement.id).toBe('unity-parking');
    expect(canvas.isConnected).toBe(true);
    parkUnityCanvas(host); // already parked: nothing to do
    expect(canvas.parentElement.id).toBe('unity-parking');
  });

  it('parking before any canvas exists is a no-op', async () => {
    const { parkUnityCanvas } = await load();
    expect(() => parkUnityCanvas(document.body)).not.toThrow();
    expect(document.getElementById('unity-parking')).toBeNull();
  });
});

describe('mountUnity', () => {
  async function boot(dpr) {
    vi.stubGlobal('devicePixelRatio', dpr);
    const create = vi.fn(async () => ({ SendMessage: vi.fn(), Quit: vi.fn() }));
    vi.stubGlobal('createUnityInstance', create);
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.method === 'HEAD') return { ok: true, headers: new Headers({ 'content-type': 'text/javascript' }) };
      return { ok: false, headers: new Headers() }; // no manifest: default file names
    }));
    const realAppend = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node.tagName === 'SCRIPT') { queueMicrotask(() => node.onload()); return node; }
      return realAppend(node);
    });
    const bridge = await load();
    await bridge.mountUnity();
    return create.mock.calls[0][1];
  }

  it('caps the pixel ratio at 2 for the loader', async () => {
    expect((await boot(3)).devicePixelRatio).toBe(2);
  });

  it('passes a lower ratio through, and treats a missing one as 1', async () => {
    expect((await boot(1.5)).devicePixelRatio).toBe(1.5);
    expect((await boot(0)).devicePixelRatio).toBe(1);
  });
});
