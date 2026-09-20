// No screen may hard-code an avatar's name. The assistant's name is whichever
// profile actually resolved — Aaron by default, the fallback when the Unity
// build fails to load — and a hard-coded "Aria" splits the app's identity the
// moment those differ: the study brief says one name, the library another.
// That is precisely what the pilot tester reported ("I got confused between
// Aaron and Aria – did it make any difference?").
//
// A source scan, in the spirit of studyInstruments.test.js: cheaper than
// rendering each screen under its providers, and it catches comments-turned-
// copy-paste as well. Case-sensitive \bAria\b leaves aria-label etc. alone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Every web screen. avatarProfiles.js is the one legitimate home of the names;
// Onboarding still carries ~12 literals but is unreachable during a study
// session (the router exempts study sessions) — its rewrite is deferred and
// tracked in the PR that added this test. Everything else must resolve the
// name through useEffectiveAvatarProfile.
const SCREENS = [
  'Landing.jsx', 'Library.jsx', 'Privacy.jsx', 'Disclaimer.jsx', 'Settings.jsx',
  'Chat.jsx', 'Voice.jsx', 'Home.jsx', 'Article.jsx',
];

const src = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/screens/${name}`, import.meta.url)), 'utf8');

describe('avatar naming', () => {
  for (const name of SCREENS) {
    it(`${name} does not hard-code "Aria"`, () => {
      let text;
      try {
        text = src(name);
      } catch {
        return; // screen renamed/removed — nothing to hard-code
      }
      const hits = text.split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\bAria\b/.test(line));
      expect(hits, `literal "Aria" at ${name}:${hits.map((h) => h.n).join(',')}`).toEqual([]);
    });
  }

  it('the screens above resolve the name through the effective profile', () => {
    // The scan alone would pass on a screen that simply says nothing; the
    // screens that DO name the assistant must derive it.
    for (const name of ['Landing.jsx', 'Library.jsx', 'Privacy.jsx', 'Disclaimer.jsx', 'Settings.jsx']) {
      expect(src(name), `${name} should use useEffectiveAvatarProfile`).toContain('useEffectiveAvatarProfile');
    }
  });
});
