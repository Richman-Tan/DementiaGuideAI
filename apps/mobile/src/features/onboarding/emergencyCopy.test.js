// The app serves carers in Aotearoa New Zealand. The onboarding safety notice
// once told them to call 000, Australia's emergency number. This reads the
// source text of every mobile screen, so the wrong number cannot come back in a
// different file.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..'); // apps/mobile/src

// Library content quotes Australian organisations by name, which is correct.
const SKIP_DIRS = [path.join(SRC, 'features', 'library', 'data')];

function sourceFiles(dir) {
  if (SKIP_DIRS.includes(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [full];
  });
}

const AUSTRALIAN_EMERGENCY = /\bcall\s+000\b|triple zero|urgent help in Australia/i;

describe('emergency copy', () => {
  test('no screen sends a carer to the Australian emergency number', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => AUSTRALIAN_EMERGENCY.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  test('the onboarding safety notice names 111 and Healthline', () => {
    const notice = fs.readFileSync(path.join(__dirname, 'screens', 'SafetyScreen.js'), 'utf8');
    expect(notice).toMatch(/In an emergency, call 111\./);
    expect(notice).toMatch(/Healthline on 0800 611 116/);
  });
});
