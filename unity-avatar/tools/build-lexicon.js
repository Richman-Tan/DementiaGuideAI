/**
 * Builds src/lib/lipsync/g2p/lexicon.json — a pruned CMUdict pronunciation
 * lexicon used by the G2P viseme pipeline (g2p.js).
 *
 * Sources (fetched once, cached next to this script):
 *   - CMUdict (BSD license): https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
 *   - Word frequencies (Norvig / Google Web Trillion Word Corpus): https://norvig.com/ngrams/count_1w.txt
 *
 * Keeps the top N most frequent words that have a CMUdict pronunciation, first
 * pronunciation only, stress digits stripped. Output is { word: "P IY T ER" }.
 *
 * Usage: node build-lexicon.js [--size 25000]
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const SIZE   = parseInt((process.argv.find(a => a.startsWith('--size=')) || '').split('=')[1] || '25000', 10);
const CACHE  = path.join(__dirname, '.lexicon-cache');
const OUT    = path.join(__dirname, '../../src/lib/lipsync/g2p/lexicon.json');

const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';
const FREQ_URL    = 'https://norvig.com/ngrams/count_1w.txt';

function fetchCached(url, file) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p)) return Promise.resolve(fs.readFileSync(p, 'utf8'));
  fs.mkdirSync(CACHE, { recursive: true });
  return new Promise((resolve, reject) => {
    const get = (u, redirects) => https.get(u, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects <= 0) return reject(new Error(`${u}: too many redirects`));
        return get(new URL(res.headers.location, u).href, redirects - 1);
      }
      if (res.statusCode !== 200) return reject(new Error(`${u}: HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        fs.writeFileSync(p, body);
        resolve(body);
      });
    }).on('error', reject);
    get(url, 3);
  });
}

async function main() {
  console.log('fetching sources…');
  const [dictRaw, freqRaw] = await Promise.all([
    fetchCached(CMUDICT_URL, 'cmudict.dict'),
    fetchCached(FREQ_URL, 'count_1w.txt'),
  ]);

  // CMUdict: "word phones..." — alternates look like "word(2) ...", skip them.
  const dict = new Map();
  for (const line of dictRaw.split('\n')) {
    if (!line || line.startsWith(';')) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const word = line.slice(0, sp);
    if (word.includes('(')) continue; // alternate pronunciation
    // Strip stress digits and trailing comments (# ...)
    const phones = line.slice(sp + 1).split('#')[0].trim().replace(/\d/g, '');
    if (/^[a-z']+$/.test(word)) dict.set(word, phones);
  }
  console.log(`cmudict: ${dict.size} usable words`);

  const lexicon = {};
  let kept = 0;
  for (const line of freqRaw.split('\n')) {
    if (kept >= SIZE) break;
    const word = line.split('\t')[0];
    const phones = dict.get(word);
    if (phones) { lexicon[word] = phones; kept++; }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(lexicon));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`wrote ${kept} words (${kb} KB) -> ${path.relative(process.cwd(), OUT)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
