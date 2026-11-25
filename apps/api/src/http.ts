// The request and response a Vercel Node function receives: Node's own, plus
// the few helpers the platform adds. Declared here so the handlers are typed
// without depending on the platform's package.
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiRequest extends IncomingMessage {
  /** The parsed body, when the platform recognised its content type. */
  body?: unknown;
}

export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
}

export type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** The bearer token of a request, or '' when there is none. */
export function bearerToken(req: ApiRequest): string {
  const raw = req.headers.authorization ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}
