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
 * Phone numbers are the exception: they are read digit by digit, the way New
 * Zealanders say them, so "call 111" is "call one one one" and never "one
 * hundred eleven" (see the phone-number section below).
 *
 * Only affects spoken audio + lip-sync — the on-screen chat text is separate.
 * The provider returns alignment for the text it was sent (this normalised
 * text), so lip-sync and subtitle timings are in the spoken text's own
 * character space; nothing maps them back onto the on-screen text.
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

/**
 * Non-negative integer → words. Past the billions the head recurses through the
 * table again, so 10^12 reads "one thousand billion".
 */
function intToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  // n >= 100 here and the table ends at 100, so the largest scale ≤ n always exists.
  const { value, name } = SCALES.find((s) => n >= s.value);
  const head = intToWords(Math.floor(n / value));
  const rest = n % value;
  return rest ? `${head} ${name} ${intToWords(rest)}` : `${head} ${name}`;
}

/** Reads a run of digits one at a time: "05" → "zero five" (for decimals). */
function digitsToWords(digits) {
  return digits.split('').map((d) => ONES[Number(d)]).join(' ');
}

// A JS number holds an integer exactly only up to 15–16 digits, and a run of
// 309 or more overflows to Infinity, which intToWords recursed on until it threw
// a RangeError. Longer runs are not quantities anyone says aloud, so they are
// read digit by digit instead.
const MAX_CARDINAL_DIGITS = 15;

/** Digit string (no commas) → cardinal words, or digit by digit when too long. */
function cardinalToWords(digits) {
  return digits.length > MAX_CARDINAL_DIGITS ? digitsToWords(digits) : intToWords(Number(digits));
}

/** "3.5" → "three point five"; integer part uses cardinal words, fraction is digit-by-digit. */
function decimalToWords(intPart, fracPart) {
  const whole = cardinalToWords(intPart.replace(/,/g, ''));
  return fracPart ? `${whole} point ${digitsToWords(fracPart)}` : whole;
}

/** "3:30" → "three thirty", "3:05" → "three oh five", "3:00" → "three o'clock". */
function timeToWords(hour, minute) {
  const h = intToWords(Number(hour));
  if (minute === '00') return `${h} o'clock`;
  if (minute[0] === '0') return `${h} oh ${ONES[Number(minute[1])]}`;
  return `${h} ${intToWords(Number(minute))}`;
}

// ── Phone numbers ────────────────────────────────────────────────────────────
//
// Read digit by digit, zero as "oh", groups separated by a comma (a short
// pause). These are the numbers the assistant can say: the v2 prompt and its
// safety rules, plus the knowledge base (scripts/eval/fixtures/phone-allowlist.json
// is the verified list):
//
//   111            emergency services        one one one
//   1737           Need to Talk? (call/text) one seven three seven
//   0800 611 116   Healthline                oh eight hundred, six one one, one one six
//   0800 004 001   Alzheimers New Zealand    oh eight hundred, oh oh four, oh oh one
//   0800 543 354   Lifeline                  oh eight hundred, five four three, three five four
//   0508 828 865   Suicide Crisis Helpline   oh five oh eight, eight two eight, eight six five
//   1800 100 500   Dementia Australia (only in the v1 rollback prompt)
//                                            one eight hundred, one oh oh, five oh oh
//
// and any other number of the same shapes the model writes. The rules:
//
// 1. Leading zero. A run that starts with 0 and continues in groups of 2–7
//    digits, each after one space, no-break space or hyphen ("(09) 123 4567"
//    is accepted too). It is a phone number only if its prefix and length fit
//    an NZ number (NZ_SHAPES below): 0800/0508/0900 + 6–7 digits, 02x + 6–8,
//    03/04/06/07/09 + 7. Groups past that length go back to the ordinary
//    rules, so "0800 611 116 24/7" keeps "twenty-four/seven". A bare
//    0800/0508/0900 says its name ("an 0800 number"). Other leading-zero runs
//    ("05", "007", "09-12-2026") are left as they were.
// 2. Australian 1800/1300 freephone, only in the full 4-3-3 shape.
// 3. 111 and 1737 are ordinary numbers too ("111 people"), so they are read as
//    phone numbers only with a cue:
//    - a calling word (CUE_WORD: call, dial, ring, phone, text, contact, reach,
//      on, at, via, through, emergency, helpline, line, service, number, in any
//      inflection) among the four words before the number in the same
//      sentence; punctuation-only tokens are skipped and a whole phone number
//      counts as one word ("Family Services (0800 211 211) or 1737"); or
//    - one of immediately, now, urgently, right, straight, any, anytime,
//      operator or 24/7 straight after it ("the 111 operator").
//    On the 3,879 archived eval answers in docs/report/eval this catches 1,048
//    of the 1,049 mentions; the miss ("in most places, this is 111") has no cue.
//
// Never read as a phone number: anything joined to a letter or digit, or part
// of a decimal, thousands-separated number, money amount, percentage, clock
// time or range ("1,111", "1.111", "$111", "111%", "100-111").

/** Digits as said in a phone number: zero is "oh". */
const PHONE_DIGITS = ['oh', ...ONES.slice(1, 10)];

/** Prefixes with a name of their own. */
const PREFIX_NAMES = {
  '0800': 'oh eight hundred',
  '0508': 'oh five oh eight',
  '0900': 'oh nine hundred',
  '1800': 'one eight hundred',
  '1300': 'one three hundred',
};

/**
 * NZ number shapes: the prefix, how long it is when the number is written
 * without spaces, and how many digits may follow it.
 */
const NZ_SHAPES = [
  { prefix: /^0(?:800|508|900)/, length: 4, min: 6, max: 7 }, // freephone, premium
  { prefix: /^02\d/, length: 3, min: 6, max: 8 },             // mobile
  { prefix: /^0[34679]/, length: 2, min: 7, max: 7 },         // landline
];

const PHONE_RE = new RegExp(
  '(?:'
  // 1: leading zero, optionally "(09)"; then the groups that follow
  + String.raw`(?:\((0\d{1,3})\)|\b(0\d+))((?:[ \u00a0-]\d{2,7})*)`
  // 2: Australian freephone
  + String.raw`|\b(1[38]00)[ \u00a0-]?(\d{3})[ \u00a0-]?(\d{3})`
  // 3: the short helplines
  + String.raw`|\b(111|1737)`
  + ')'
  // Not joined to a letter, digit or %, nor part of a decimal, time or range.
  + String.raw`(?![\w%]|[.,:\-–]\d)`,
  'g'
);

// Cues for 111 and 1737 (rule 3). CUE_WORD must stay disjoint from AFTER_CUE:
// the streaming hold below relies on it.
const CUE_WINDOW = 4;
const CUE_WORD = new RegExp(String.raw`\b(?:call(?:s|ed|ing)?|dial(?:s|led|ed|ling|ing)?|ring(?:s|ing)?|rang`
  + String.raw`|(?:tele|free)?phon(?:e|es|ed|ing)|text(?:s|ed|ing)?|contact(?:s|ed|ing)?|reach(?:es|ed|ing)?`
  + String.raw`|on|at|via|through|emergency|emergencies|helplines?|lines?|services?|numbers?)\b`, 'i');
const AFTER_CUE = /^[)\]*"'”’]*[ \u00a0]+[(*"'“]*(?:immediately|now|urgently|right|straight|any|anytime|operator|24\/7)\b/i;

/** A word that closes a sentence; the cue window never reaches past one. */
const ENDS_SENTENCE = /[.!?]["'”’)\]*]*$/;
/** A token made only of digits (one phone-number group, possibly bracketed or bold). */
const NUMBER_TOKEN = /^[(*"'“]*\d(?:[\d-]|[.,]\d)*[)*"'”]*$/;

function speakDigits(digits) {
  return digits.split('').map((d) => PHONE_DIGITS[d]).join(' ');
}

/** "611116" → ["611", "116"]: threes, with the last group up to four long. */
function chunkDigits(digits) {
  const groups = [];
  let rest = digits;
  while (rest.length > 4) {
    groups.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  groups.push(rest);
  return groups;
}

/** [prefix, ...groups] → "oh eight hundred, six one one, one one six". */
function speakPhone(prefix, groups) {
  const spokenGroups = groups.flatMap(chunkDigits).map(speakDigits);
  return [PREFIX_NAMES[prefix] ?? speakDigits(prefix), ...spokenGroups].join(', ');
}

/**
 * Index of the earliest cue word among the CUE_WINDOW words before `end`, or
 * -1. Shared by the normaliser and the streaming hold so the two agree.
 */
function cueIndex(words, end) {
  let found = -1;
  for (let j = end - 1, seen = 0; j >= 0 && seen < CUE_WINDOW; j--) {
    const word = words[j];
    if (ENDS_SENTENCE.test(word)) break;
    if (!/[A-Za-z\d]/.test(word)) continue;
    // A run of number groups is one word: count only its first group.
    if (!(NUMBER_TOKEN.test(word) && j > 0 && NUMBER_TOKEN.test(words[j - 1]))) seen++;
    if (CUE_WORD.test(word)) found = j;
  }
  return found;
}

/** Rule 3: is this 111 / 1737 being given as a number to call? */
function hasHelplineCue(str, offset, length) {
  if (AFTER_CUE.test(str.slice(offset + length))) return true;
  const words = str.slice(0, offset).match(/\S+/g) ?? [];
  return cueIndex(words, words.length) >= 0;
}

/** Rule 1, for a run that starts with 0. */
function speakLeadingZero(match, head, rest) {
  const shape = NZ_SHAPES.find((s) => s.prefix.test(head));
  if (!shape) return match.slice(0, match.length - rest.length) + speakPhoneNumbers(rest);
  const prefix = head.slice(0, shape.length);
  const groups = head.length > shape.length ? [head.slice(shape.length)] : [];
  let count = groups.join('').length;
  let used = 0;
  for (const group of rest.matchAll(/[ \u00a0-](\d+)/g)) {
    if (count + group[1].length > shape.max) break;
    groups.push(group[1]);
    count += group[1].length;
    used = group.index + group[0].length;
  }
  if (count < shape.min || count > shape.max) {
    if (PREFIX_NAMES[head]) return PREFIX_NAMES[head] + speakPhoneNumbers(rest);
    return match.slice(0, match.length - rest.length) + speakPhoneNumbers(rest);
  }
  // A group that would not fit may start the next number ("… 116 0800 004 001").
  return speakPhone(prefix, groups) + speakPhoneNumbers(rest.slice(used));
}

/** Rewrites every phone number in `text` into its spoken form. */
function speakPhoneNumbers(text) {
  return text.replace(PHONE_RE, (match, parenHead, bareHead, rest, au, auMid, auEnd, short, offset, str) => {
    if (/[$+]$|\d[.,\-–]$/.test(str.slice(Math.max(0, offset - 2), offset))) return match;
    if (au) return speakPhone(au, [auMid, auEnd]);
    if (short) return hasHelplineCue(str, offset, match.length) ? speakDigits(short) : match;
    return speakLeadingZero(match, parenHead ?? bareHead, rest);
  });
}

/**
 * For the streaming path, which normalises text a few words at a time: given
 * text that ends on a word boundary, returns the index where a tail starts that
 * must wait for more text before it can be normalised. That tail is
 * - a trailing run of number groups ("0800 " may be followed by "611 116"; a
 *   number's after-cue has not arrived yet), plus
 * - the earliest cue word among the CUE_WINDOW words before it (a "call" sent
 *   on its own would leave the "111" that follows without its cue).
 * Everything before the index normalises the same on its own as it would in
 * the full sentence. Returns text.length when nothing needs to wait.
 */
export function unsettledTailStart(text) {
  const tokens = [...text.matchAll(/\S+/g)];
  const words = tokens.map((t) => t[0]);
  let start = words.length;
  while (start > 0 && NUMBER_TOKEN.test(words[start - 1])) start--;
  const cue = cueIndex(words, start);
  if (cue >= 0) start = cue;
  return start < words.length ? tokens[start].index : text.length;
}

/**
 * @param {string} text — the assistant reply about to be spoken
 * @returns {string} text with numbers/symbols expanded to words
 */
export function normalizeSpokenText(text) {
  if (!text) return text;
  // Phone numbers first: their digits must not reach the cardinal rules below.
  let out = speakPhoneNumbers(text);

  // Currency: "$5" → "five dollars", "$5.50" → "five dollars and fifty cents".
  // Runs first so the '$' and cents are consumed before the plain-number rule.
  // Thousands commas need at least one group, or "$1250" would stop at "$125".
  out = out.replace(/\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g, (_m, dollars, cents) => {
    const d = dollars.replace(/,/g, '');
    let phrase = `${cardinalToWords(d)} ${Number(d) === 1 ? 'dollar' : 'dollars'}`;
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
