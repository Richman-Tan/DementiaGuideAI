/**
 * Expands numbers and a few common symbols into their spoken-word form BEFORE
 * the text is sent to a TTS provider.
 *
 * Why this lives at the TTS boundary and not in the viseme mapper:
 * ElevenLabs/Azure pronounce "23" as "twenty-three" (~1s of audio) but return
 * character alignment only for the two digit glyphs '2' and '3'. By the time the
 * alignment reaches createVisemeTimeline the multi-syllable information is gone,
 * so digits can only be neutralised (mouth stays shut). Expanding to words here
 * keeps the *spoken audio identical* (the provider says "twenty-three" either
 * way) while giving the alignment real letters that the G2P lexicon animates.
 *
 * Only affects spoken audio + lip-sync — the on-screen chat text is separate.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
];
const SCALES = [
  { value: 1e9, name: 'billion' },
  { value: 1e6, name: 'million' },
  { value: 1e3, name: 'thousand' },
  { value: 100, name: 'hundred' },
];

/** Integer (0 – 999,999,999,999) → words. Falls back to digit-by-digit above range. */
function intToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  for (const { value, name } of SCALES) {
    if (n >= value) {
      const head = intToWords(Math.floor(n / value));
      const rest = n % value;
      return rest ? `${head} ${name} ${intToWords(rest)}` : `${head} ${name}`;
    }
  }
  // Beyond our scale table — read the digits out one by one.
  return String(n).split('').map((d) => ONES[Number(d)]).join(' ');
}

/** Reads a run of digits one at a time: "05" → "zero five" (for decimals). */
function digitsToWords(digits) {
  return digits.split('').map((d) => ONES[Number(d)]).join(' ');
}

/** "3.5" → "three point five"; integer part uses cardinal words, fraction is digit-by-digit. */
function decimalToWords(intPart, fracPart) {
  const whole = intToWords(Number(intPart.replace(/,/g, '')));
  return fracPart ? `${whole} point ${digitsToWords(fracPart)}` : whole;
}

/** "3:30" → "three thirty", "3:05" → "three oh five", "3:00" → "three o'clock". */
function timeToWords(hour, minute) {
  const h = intToWords(Number(hour));
  if (minute === '00') return `${h} o'clock`;
  if (minute[0] === '0') return `${h} oh ${ONES[Number(minute[1])]}`;
  return `${h} ${intToWords(Number(minute))}`;
}

/**
 * @param {string} text — the assistant reply about to be spoken
 * @returns {string} text with numbers/symbols expanded to words
 */
export function normalizeSpokenText(text) {
  if (!text) return text;
  let out = text;

  // Currency: "$5" → "five dollars", "$5.50" → "five dollars and fifty cents".
  // Runs first so the '$' and cents are consumed before the plain-number rule.
  out = out.replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g, (_m, dollars, cents) => {
    const d = Number(dollars.replace(/,/g, ''));
    let phrase = `${intToWords(d)} ${d === 1 ? 'dollar' : 'dollars'}`;
    if (cents && cents !== '00') {
      const c = Number(cents);
      phrase += ` and ${intToWords(c)} ${c === 1 ? 'cent' : 'cents'}`;
    }
    return phrase;
  });

  // Percent: "50%" → "fifty percent" (accepts an optional decimal).
  out = out.replace(/(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?\s*%/g, (_m, intPart, fracPart) =>
    `${decimalToWords(intPart, fracPart)} percent`
  );

  // Clock times: "3:30" → "three thirty" (H:MM, minutes 00–59).
  out = out.replace(/\b(\d{1,2}):([0-5]\d)\b/g, (_m, h, mm) => timeToWords(h, mm));

  // Remaining numbers — decimals and cardinals, with optional thousands commas.
  out = out.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\b/g, (_m, intPart, fracPart) =>
    decimalToWords(intPart, fracPart)
  );

  // Ampersand reads as "and" (kept minimal — other symbols are left to the provider).
  out = out.replace(/\s*&\s*/g, ' and ');

  return out;
}
