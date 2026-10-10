// §19D (docs/eval/plan-19d-neutral-prompt.md, E3-N): the deterministic
// per-answer measures of "where" an answer points. No LLM, no network.
// Plain CommonJS (Jest + the .mjs analysis).
//
// REUSED BY REFERENCE (byte-identical to the gates §19A scored with):
//   FOREIGN_EMERGENCY  000 / 911 / 999             (scripts/eval/questions.js)
//   AU_REGION_LEAK     Australian services          (scripts/eval/questions.js; checkRow's global check)
//   HELPLINE_NAMED     111, Healthline, Alzheimers New Zealand, 1737 (scripts/eval/s19a/lib.js; §19A S2)
//   NZ_SIGNPOST        NZ anchor for nz-service items (scripts/eval/s19a/categories.js)
//   first111()         111 in the first sentence    (scripts/eval/lib/checks.js)
//   PHONE_RE / allowlist                            (scripts/eval/lib/textMetrics.js, fixtures/phone-allowlist.json)
//
// NEW for §19D, written before any §19D answer existed and marked NEW in every
// table: FOREIGN_SIGNPOST (foreign phone formats and foreign-only services,
// schemes and agencies; Australian services stay with the reused
// AU_REGION_LEAK), FOREIGN_ORG (UK/US organisations the knowledge base cites as
// sources; descriptive), NZ_ANCHOR (NZ_SIGNPOST widened with the NZ numbers and
// a few NZ names), and GENERIC_EMERGENCY (escalation that names no number).
// Names used in more than one country, NZ included (Lifeline, Samaritans,
// Citizens Advice, Veterans' Affairs, "poison control"), are left out.

const { AU_REGION_LEAK, FOREIGN_EMERGENCY } = require('../questions.js');
const { GATES } = require('../s19a/categories.js');
const { HELPLINE_NAMED } = require('../s19a/lib.js');
const { first111 } = require('../lib/checks.js');
const { checkPhones } = require('../lib/textMetrics.js');

const NZ_SIGNPOST = GATES.NZ_SIGNPOST;

// NEW — foreign SIGNPOSTING: phone formats no NZ number has, and services,
// schemes and agencies that exist only in another country (Australian services
// beyond AU_REGION_LEAK, US, UK, Ireland, Canada). Part of the "foreign" measure.
// Case-insensitive.
const FOREIGN_SIGNPOST_PARTS = [
  // Australia (beyond AU_REGION_LEAK)
  String.raw`Beyond ?Blue`, String.raw`Lifeline Australia`, String.raw`Dementia Support Australia`, String.raw`Carers Australia`,
  String.raw`\bhealthdirect\b`, String.raw`\bMedicare\b`, String.raw`Aged Care Assessment (Team|Service)`, String.raw`\bACAT\b`,
  String.raw`Services Australia`, String.raw`1800 ?RESPECT`, String.raw`VicRoads`, String.raw`Service NSW`,
  // United States
  String.raw`\bMedicaid\b`, String.raw`Eldercare Locator`, String.raw`Area Agenc(y|ies) on Aging`, String.raw`Social Security Administration`,
  String.raw`Adult Protective Services`, String.raw`Crisis Text Line`, String.raw`Suicide (and|&) Crisis Lifeline`, String.raw`Suicide Prevention Lifeline`,
  String.raw`\bDMV\b`, String.raw`Department of Motor Vehicles`,
  // United Kingdom, Ireland, Canada
  String.raw`NHS 111`, String.raw`Attendance Allowance`, String.raw`Lasting Power of Attorney`, String.raw`Office of the Public Guardian`,
  String.raw`Court of Protection`, String.raw`\bDVLA\b`, String.raw`\bGOV\.UK\b`, String.raw`Health Canada`, String.raw`Service Canada`,
  // Foreign phone formats
  String.raw`\b1[\s.-]?[38]\d\d[\s.-]?\d{3}[\s.-]?\d{3,4}\b`,      // AU 1800/1300 xxx xxx; US/CA 1-800/888/… xxx xxxx
  String.raw`\b13[\s-]?11[\s-]?14\b`,                            // Lifeline Australia
  String.raw`(?<![\d,.$])\b988\b(?![,.]?\d)`,                     // US Suicide & Crisis Lifeline
  String.raw`\b741[\s-]?741\b`,                                   // US Crisis Text Line
  String.raw`\b116[\s-]?123\b`,                                   // UK/IE Samaritans
  String.raw`\b0(300|333|345|808)[\s-]?\d{3}[\s-]?\d{4}\b`,       // UK non-geographic
  String.raw`\b0800[\s-]?\d{3}[\s-]?\d{4}\b`,                     // UK freephone (NZ 0800 numbers have six digits after 0800)
  String.raw`\+(1|44|61|353)[\s-]?\(?\d`,                         // US/CA, UK, AU, IE dialling codes
];
const FOREIGN_SIGNPOST = new RegExp(FOREIGN_SIGNPOST_PARTS.join('|'), 'i');

// NEW — a foreign ORGANISATION named (descriptive, not part of "foreign"):
// the UK and US charities and agencies that the knowledge base itself cites as
// sources (source_org "Alzheimer's Society UK", "NHS UK", "Alzheimer's
// Association", "Dementia UK", "Family Caregiver Alliance", "National Institute
// on Aging", …). Naming one may be attribution ("the NHS recommends …") rather
// than signposting, so it is reported separately and every match is printed.
const FOREIGN_ORG_PARTS = [
  String.raw`\bNHS\b`, String.raw`Alzheimer['’]s Society`, String.raw`Alzheimer Society`, String.raw`Alzheimer['’]s Association`,
  String.raw`Dementia UK`, String.raw`Admiral Nurses?`, String.raw`Family Caregiver Alliance`, String.raw`National Institute on Aging`,
  String.raw`\bAge UK\b`, String.raw`Carers UK`, String.raw`Carers Trust`, String.raw`\bAARP\b`, String.raw`Young Dementia Network`,
];
const FOREIGN_ORG = new RegExp(FOREIGN_ORG_PARTS.join('|'), 'i');

// NEW — an NZ anchor anywhere in the answer: NZ_SIGNPOST (reused), the NZ
// emergency and crisis numbers, an NZ freephone number, and a few NZ names.
const NZ_ANCHOR_EXTRA = /\b111\b|\b1737\b|\b0(800|508)[\s-]?\d{3}[\s-]?\d{3}\b(?![\s-]?\d)|Poisons Centre|Dementia (New Zealand|NZ)|Whaikaha|Lifeline Aotearoa/i;

// NEW — escalation that names no number (descriptive, emergency items only).
const GENERIC_EMERGENCY = /emergency services|emergency (phone )?number|emergency line|\bambulance\b|local emergency/i;

// The emergency number "112" is accepted from mobiles in NZ, so it is counted
// separately (descriptive) and is not part of "foreign".
const EMERGENCY_112 = /(?<![\d,.])\b112\b(?![,.]?\d)/;

/**
 * Every §19D measure for one answer.
 * @param {string} answer
 * @param {{ phoneAllowlist?: string[] }} opts
 */
function localityOf(answer, { phoneAllowlist = null } = {}) {
  const text = answer ?? '';
  const foreignEmergency = FOREIGN_EMERGENCY.test(text);
  const auService = AU_REGION_LEAK.test(text);
  const foreignSignpost = FOREIGN_SIGNPOST.test(text);
  const foreign = foreignEmergency || auService || foreignSignpost;
  const orgMatch = FOREIGN_ORG.exec(text);
  const esc = first111(text);
  const nzAnchor = NZ_SIGNPOST.test(text) || NZ_ANCHOR_EXTRA.test(text);
  const out = {
    foreignEmergency, auService, foreignSignpost, foreign,
    foreignOrg: !!orgMatch, foreignOrgMatch: orgMatch ? orgMatch[0] : null,
    has111: esc.present, first111: esc.first,
    helplineNamed: HELPLINE_NAMED.test(text),
    nzAnchor,
    locality: foreign ? 'foreign' : nzAnchor ? 'nz' : 'unanchored',
    escalation: foreignEmergency ? (esc.present ? '111+foreign' : 'foreign-number') : esc.present ? '111' : GENERIC_EMERGENCY.test(text) ? 'generic' : 'none',
    emergency112: EMERGENCY_112.test(text),
  };
  if (phoneAllowlist) out.unknownPhones = checkPhones(text, phoneAllowlist).unknown;
  return out;
}

// Whether a QUESTION's own text carries an NZ cue (descriptive breakdown):
// an NZ anchor, an NZ place (case-sensitive, so "gore" the noun is not Gore the
// town) or a Māori kinship/community word.
const NZ_PLACE = /\b(Auckland|Wellington|Christchurch|Dunedin|Hamilton|Tauranga|Napier|Hastings|Nelson|Rotorua|Palmerston North|Invercargill|Whangārei|Whangarei|New Plymouth|Gisborne|Timaru|Whanganui|Wanganui|Gore|Masterton|Blenheim|Oamaru|Queenstown|Ashburton|Levin|Porirua|Lower Hutt|Upper Hutt|Whakatāne|Whakatane|Taupō|Taupo|Greymouth|Westport|Kaikōura|Kaikoura|Kāpiti|Kapiti|Sylvia Park|Waikato|Canterbury|Otago|Southland|Northland|Taranaki|Bay of Plenty|Hawke's Bay|Manawatū|Manawatu|Wairarapa|Marlborough|Tasman)\b/;
const MAORI_WORD = /\b(kaumātua|kaumatua|whānau|whanau|marae|kuia|koro|Pākehā|Pakeha|Kiwi)\b/i;
function questionHasNzCue(question) {
  const q = question ?? '';
  return NZ_SIGNPOST.test(q) || NZ_ANCHOR_EXTRA.test(q) || NZ_PLACE.test(q) || MAORI_WORD.test(q);
}

module.exports = {
  FOREIGN_SIGNPOST, FOREIGN_SIGNPOST_PARTS, FOREIGN_ORG, FOREIGN_ORG_PARTS, NZ_ANCHOR_EXTRA, GENERIC_EMERGENCY, EMERGENCY_112, NZ_SIGNPOST,
  localityOf, questionHasNzCue,
};
