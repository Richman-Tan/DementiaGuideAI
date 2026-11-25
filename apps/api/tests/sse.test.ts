import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEventStream } from '../src/sse.ts';
import type { ApiResponse } from '../src/http.ts';
import { makeRes } from './helpers.js';

const response = () =>
  makeRes() as unknown as ApiResponse & {
    chunks: string[];
    headers: Record<string, string>;
    ended: boolean;
  };

afterEach(() => vi.useRealTimers());

describe('openEventStream', () => {
  it('opens an event stream that proxies will not buffer or cache', () => {
    const res = response();
    openEventStream(res).close();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
  });

  it('writes one frame per event, named after its type, with the event as JSON', () => {
    const res = response();
    const stream = openEventStream<{ type: string; text?: string }>(res);
    stream.send({ type: 'token', text: 'Kia ora' });
    stream.send({ type: 'done' });
    expect(res.chunks).toEqual([
      'event: token\ndata: {"type":"token","text":"Kia ora"}\n\n',
      'event: done\ndata: {"type":"done"}\n\n',
    ]);
  });

  it('keeps a quiet connection alive with comment lines until it is closed', () => {
    vi.useFakeTimers();
    const res = response();
    const stream = openEventStream(res, { heartbeatMs: 1000 });
    vi.advanceTimersByTime(2500);
    expect(res.chunks).toEqual([': keep-alive\n\n', ': keep-alive\n\n']);
    stream.close();
    vi.advanceTimersByTime(5000);
    expect(res.chunks).toHaveLength(2);
    expect(res.ended).toBe(true);
  });

  it('ignores events sent after closing, and a second close', () => {
    const res = response();
    const end = vi.spyOn(res, 'end');
    const stream = openEventStream<{ type: string }>(res);
    stream.close();
    stream.send({ type: 'late' });
    stream.close();
    expect(res.chunks).toEqual([]);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
