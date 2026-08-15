import { createSpeculativeRag } from './speculativeRetrieval';
import { SPECULATIVE_STABLE_MS } from '@/lib/voice/voiceConfig';

const CHUNKS = [{ id: 'c1', title: 'Sundowning basics' }];

// Fake-timer-safe microtask drain (setTimeout would never fire here).
const flushPromises = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('createSpeculativeRag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function stabilize(spec, text) {
    spec.onPartial(text);
    jest.advanceTimersByTime(SPECULATIVE_STABLE_MS + 10);
  }

  it('fires retrieval after a partial stabilizes and reuses it on a matching final', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'how do I manage sundowning in the evening');
    expect(search).toHaveBeenCalledTimes(1);

    const result = await spec.resolve('how do I manage sundowning in the evening');
    expect(result.status).toBe('hit');
    expect(result.chunks).toBe(CHUNKS);
  });

  it('reuses when the final only appends a short tail (prefix growth ≤ 25%)', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'what should I do when mum gets agitated at night and will not settle');
    const result = await spec.resolve('what should I do when mum gets agitated at night and will not settle down');
    expect(result.status).toBe('hit');
  });

  it('misses when the final transcript diverges materially', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'tell me about medication reminders');
    const result = await spec.resolve('actually can you explain respite care options in Auckland');
    expect(result.status).toBe('miss');
    expect(result.chunks).toBeNull();
  });

  it('does not fire on short fragments', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'how do'); // < SPECULATIVE_MIN_WORDS
    expect(search).not.toHaveBeenCalled();
    expect((await spec.resolve('how do I help')).status).toBe('none');
  });

  it('restarts the stabilization window while the partial keeps changing', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    spec.onPartial('how do I manage sundowning');
    jest.advanceTimersByTime(SPECULATIVE_STABLE_MS - 100);
    spec.onPartial('how do I manage sundowning behaviour'); // change resets timer
    jest.advanceTimersByTime(SPECULATIVE_STABLE_MS - 100);
    expect(search).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('caps speculative fires and skips refires for near-identical text', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'first question about morning routines and structure');
    // Near-identical stabilization → no refire (existing result will pass the gate).
    await stabilize(spec, 'first question about morning routines and structure please');
    expect(search).toHaveBeenCalledTimes(1);
    // Genuinely different → second (and last allowed) fire.
    await stabilize(spec, 'completely different topic entirely about driving safety assessments');
    expect(search).toHaveBeenCalledTimes(2);
    // Third fire is over the cap.
    await stabilize(spec, 'yet another brand new subject regarding legal power of attorney');
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('treats a failed search as a miss instead of throwing', async () => {
    const search = jest.fn().mockRejectedValue(new Error('network down'));
    const spec = createSpeculativeRag({ search });

    await stabilize(spec, 'how do I manage sundowning in the evening');
    await flushPromises();
    const result = await spec.resolve('how do I manage sundowning in the evening');
    expect(result.status).toBe('miss');
  });

  it('cancel() prevents firing and resolving', async () => {
    const search = jest.fn().mockResolvedValue(CHUNKS);
    const spec = createSpeculativeRag({ search });

    spec.onPartial('how do I manage sundowning in the evening');
    spec.cancel();
    jest.advanceTimersByTime(SPECULATIVE_STABLE_MS + 10);
    expect(search).not.toHaveBeenCalled();
    expect((await spec.resolve('how do I manage sundowning')).status).toBe('none');
  });
});
