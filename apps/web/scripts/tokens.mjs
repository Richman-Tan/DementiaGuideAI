// Writes the web stylesheets for the design tokens: the CSS variables, and the
// Tailwind theme that names them.
//
//   npm run tokens -w apps/web
//
// The tokens are decided in packages/core/design/tokens.ts. Run this after
// changing them; tests/designTokens.test.js fails if either file is stale.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToCss, tokensToTailwindTheme } from '../../../packages/core/design/toCss.ts';

const styles = join(dirname(fileURLToPath(import.meta.url)), '../src/styles');
for (const [file, css] of [
  ['tokens.generated.css', tokensToCss()],
  ['theme.generated.css', tokensToTailwindTheme()],
]) {
  writeFileSync(join(styles, file), css);
  console.log(`wrote ${join(styles, file)}`);
}
