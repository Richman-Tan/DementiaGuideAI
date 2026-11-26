// The deployed turn endpoint: ../compose.ts given the real environment and
// database. `npm run bundle -w apps/api` bundles this file into dist/turn.mjs,
// which api/turn.js re-exports for the platform.
import { insertIgnoringConflicts, rpc } from '../../api/_lib/supabaseAdmin.js';
import { recordUsage } from '../../api/_lib/usage.js';
import { composeTurnHandler } from '../compose.ts';
import { createTraceStore } from '../trace.ts';

const recordTrace = createTraceStore((row) => insertIgnoringConflicts('turn_traces', [row], 'id'));

const handler = composeTurnHandler(process.env, { rpc, recordUsage, recordTrace });

export default handler;
