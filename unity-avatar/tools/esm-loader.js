/**
 * Minimal regex-based ESM loader so node dev tools can execute the RN app's
 * Metro-bundled source modules (src/**) without a bundler. Handles the limited
 * syntax those modules use: named/default imports, relative paths, JSON files,
 * `export function` / `export const`.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const cache = new Map();

function loadModule(file, baseDir) {
  let full = path.isAbsolute(file) ? file : path.resolve(baseDir, file);
  if (!fs.existsSync(full)) {
    if (fs.existsSync(full + '.js')) full += '.js';
    else if (fs.existsSync(full + '.json')) full += '.json';
  }
  if (cache.has(full)) return cache.get(full);

  if (full.endsWith('.json')) {
    const mod = JSON.parse(fs.readFileSync(full, 'utf8'));
    cache.set(full, mod);
    return mod;
  }

  let src = fs.readFileSync(full, 'utf8');
  const deps = {};
  let depIdx = 0;

  src = src.replace(/import\s+(\{[\s\S]*?\}|\w+)\s+from\s+['"](.+?)['"];?/g, (m, names, rel) => {
    const key = `__dep${depIdx++}`;
    deps[key] = loadModule(rel, path.dirname(full));
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
  cache.set(full, sandbox.__exports);
  return sandbox.__exports;
}

module.exports = { loadModule };
