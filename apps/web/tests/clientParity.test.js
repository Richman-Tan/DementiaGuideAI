// The web and mobile clients each carry their own copy of the RAG driver:
// apps/web/src/services/openaiClient.js and apps/mobile/src/lib/openaiService.js.
// Retrieval, prompt and citations are shared through packages/core, but the
// pacing and timeout constants around them are declared twice. Nothing else
// ties the two copies together, so a value changed on one platform would leave
// the study measuring a different client from the one the report describes.
//
// This is a source-scan contract, like unityKeyboard.test.js and csp.test.js:
// it reads both files as text and fails naming the constant that diverged.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = readFileSync(join(webRoot, 'src', 'services', 'openaiClient.js'), 'utf8');
const mobile = readFileSync(join(webRoot, '..', 'mobile', 'src', 'lib', 'openaiService.js'), 'utf8');

const CONSTANTS = [
  'EMBED_TIMEOUT_MS',
  'SEARCH_TIMEOUT_MS',
  'WHISPER_TIMEOUT_MS',
  'LLM_TOTAL_TIMEOUT_MS',
  'LLM_TTFB_TIMEOUT_MS',
  'EMBED_CACHE_MAX',
  'MIN_REQUEST_INTERVAL_MS',
];

function constant(source, name) {
  const m = new RegExp(`^const\\s+${name}\\s*=\\s*(\\d+)\\s*;`, 'm').exec(source);
  return m ? Number(m[1]) : null;
}

describe('web and mobile RAG clients agree on their constants', () => {
  for (const name of CONSTANTS) {
    it(`${name} is declared on both platforms with the same value`, () => {
      const w = constant(web, name);
      const m = constant(mobile, name);
      expect(w, `${name} not found as a numeric const in openaiClient.js`).not.toBeNull();
      expect(m, `${name} not found as a numeric const in openaiService.js`).not.toBeNull();
      expect(w, `${name} diverges: web ${w} vs mobile ${m}`).toBe(m);
    });
  }

  it('both trim history to the shared MAX_HISTORY from packages/core, not a local number', () => {
    for (const [label, src] of [['web', web], ['mobile', mobile]]) {
      expect(src, `${label} does not import MAX_HISTORY from ragConfig`).toMatch(/\bMAX_HISTORY\b[\s\S]*?ragConfig/);
      expect(src, `${label} does not slice history by MAX_HISTORY`).toMatch(/\.slice\(-MAX_HISTORY\)/);
      expect(src, `${label} slices history by a literal instead of MAX_HISTORY`).not.toMatch(/\.slice\(-\d+\)\.map/);
    }
  });

  it('both send the same Whisper request shape (whisper-1, language en)', () => {
    for (const [label, src] of [['web', web], ['mobile', mobile]]) {
      expect(src, `${label} whisper model`).toMatch(/append\('model',\s*'whisper-1'\)/);
      expect(src, `${label} whisper language`).toMatch(/append\('language',\s*'en'\)/);
    }
  });
});
