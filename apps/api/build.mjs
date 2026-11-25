// Bundles the server's TypeScript entry points (src/entry/*.ts) into dist/,
// one self-contained ES module per endpoint, for the plain-JavaScript files
// under api/ to re-export. Run with `npm run bundle -w apps/api`, before
// `vercel build`.
//
// The script is not named `build` on purpose: the platform takes a `build`
// script to mean a site with an output directory, and this project is
// functions only.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entries = readdirSync(join(here, 'src/entry')).filter((f) => f.endsWith('.ts'));

await build({
  entryPoints: Object.fromEntries(
    entries.map((f) => [basename(f, '.ts'), join(here, 'src/entry', f)])
  ),
  outdir: join(here, 'dist'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Dependencies that still call require() get one, since an ES module has none.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// --check: load each endpoint the way the platform will, through its file under
// api/, and confirm it exports a handler. Catches a bundle that builds but
// cannot be imported. Nothing is called and no key is needed: an endpoint with
// no environment is switched off.
if (process.argv.includes('--check')) {
  for (const entry of entries) {
    const route = join(here, 'api', `${basename(entry, '.ts')}.js`);
    const mod = await import(pathToFileURL(route).href);
    if (typeof mod.default !== 'function') {
      console.error(`${route} does not export a handler`);
      process.exit(1);
    }
  }
  console.log(`  checked: ${entries.length} endpoint(s) load from their bundle`);
}
