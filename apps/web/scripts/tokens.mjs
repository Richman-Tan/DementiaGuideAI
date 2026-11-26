// Writes the web stylesheet for the design tokens.
//
//   npm run tokens -w apps/web
//
// The tokens are decided in packages/core/design/tokens.ts. Run this after
// changing them; tests/designTokens.test.js fails if the stylesheet is stale.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToCss } from '../../../packages/core/design/toCss.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '../src/styles/tokens.generated.css');
writeFileSync(out, tokensToCss());
console.log(`wrote ${out}`);
