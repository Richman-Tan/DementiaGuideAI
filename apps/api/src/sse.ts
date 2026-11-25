// Server-sent events: how the turn endpoint streams the pipeline's events.
//
// One frame per event, named after the event's type, with the event as JSON.
// A comment line goes out on a timer while nothing else does: the model can
// think for several seconds before its first word, and a silent connection is
// what proxies and browsers give up on.
import type { ApiResponse } from './http.ts';

export interface EventStream<E extends { type: string }> {
  send(event: E): void;
  close(): void;
}

export function openEventStream<E extends { type: string }>(
  res: ApiResponse,
  { heartbeatMs = 15000 }: { heartbeatMs?: number } = {}
): EventStream<E> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    // Tells buffering proxies to pass each frame through as it is written.
    'X-Accel-Buffering': 'no',
  });
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), heartbeatMs);
  let open = true;
  return {
    send(event) {
      if (open) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      if (!open) return;
      open = false;
      clearInterval(heartbeat);
      res.end();
    },
  };
}
