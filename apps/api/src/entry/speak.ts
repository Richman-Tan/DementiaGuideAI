// The deployed speech endpoint: ../composeSpeak.ts given the real environment and
// database. Bundled into dist/speak.mjs, which api/speak.js re-exports.
import { rpc } from '../../api/_lib/supabaseAdmin.js';
import { recordUsage } from '../../api/_lib/usage.js';
import { composeSpeakHandler } from '../composeSpeak.ts';

const handler = composeSpeakHandler(process.env, { rpc, recordUsage });

export default handler;
