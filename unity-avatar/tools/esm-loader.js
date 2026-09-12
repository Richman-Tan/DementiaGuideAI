/**
 * Minimal regex-based ESM loader so node dev tools can execute the shared
 * core's Metro/Vite-bundled ESM modules (packages/core/**) without a bundler. Handles the limited
 * syntax those modules use: named/default imports, relative paths, JSON files,
 * `export function` / `export const`.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const cache = new Map();

// `opts.overrides` maps a module path (absolute, or its basename such as
// "g2p.js") to a replacement module object. Used by the evaluation ablations to
// swap one production module (e.g. the G2P lexicon lookup) while every other
// module in the graph stays real. Each distinct overrides object gets its own
// module cache so an overridden graph never leaks into a plain load.
const overrideCaches = new WeakMap();

function loadModule(file, baseDir, opts = {}) {
  let full = path.isAbsolute(file) ? file : path.resolve(baseDir, file);
  if (!fs.existsSync(full)) {
    if (fs.existsSync(full + '.js')) full += '.js';
    else if (fs.existsSync(full + '.json')) full += '.json';
  }
  const overrides = opts.overrides ?? null;
  const moduleCache = overrides
    ? (overrideCaches.get(overrides) ?? overrideCaches.set(overrides, new Map()).get(overrides))
    : cache;
  if (overrides) {
    const hit = overrides[full] ?? overrides[path.basename(full)];
    if (hit) return hit;
  }
  if (moduleCache.has(full)) return moduleCache.get(full);

  if (full.endsWith('.json')) {
    const mod = JSON.parse(fs.readFileSync(full, 'utf8'));
    moduleCache.set(full, mod);
    return mod;
  }

  let src = fs.readFileSync(full, 'utf8');
  const deps = {};
  let depIdx = 0;

  src = src.replace(/import\s+(\{[\s\S]*?\}|\w+)\s+from\s+['"](.+?)['"];?/g, (m, names, rel) => {
    const key = `__dep${depIdx++}`;
    deps[key] = loadModule(rel, path.dirname(full), opts);
    return names.startsWith('{')
      ? `const ${names.replace(/\s+as\s+/g, ': ')} = ${key};`
      : `const ${names} = ${key};`;
  });

  const exportNames = [];
  src = src.replace(/export\s+(function|const|let)\s+(\w+)/g, (m, kind, name) => {
    exportNames.push(name);
    return `${kind} ${name}`;
  });
  src = src.replace(/export\s*\{\s*\};?/g, '');

  const sandbox = { ...deps, console, module: {}, __exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src + `\n;__exports = { ${exportNames.join(', ')} };`, sandbox, { filename: full });
  moduleCache.set(full, sandbox.__exports);
  return sandbox.__exports;
}

module.exports = { loadModule };
