import { Linking } from 'react-native';

// Phrases suggesting immediate danger. Checked before every LLM call.
// Word boundaries (\b) prevent false positives on partial matches.
const CRISIS_REGEX = /\b(emergency|danger(?:ous)?|hurt (?:my|your|him|her|them)self|self[\s-]?harm|suicid(?:e|al)|kill(?:ing)? (?:my|your|him|her|them)self|abuse|violence|violent|threaten(?:ing)?|call (?:the )?police|call (?:an )?ambulance|call 111)\b/i;

export const CRISIS_CONTACTS = [
  { label: 'Emergency',   sublabel: 'Police · Ambulance · Fire', number: '111',          color: '#D4375D' },
  { label: 'Lifeline NZ', sublabel: 'Crisis support, 24/7',      number: '0800 543 354', color: '#E8956D' },
  { label: 'Dementia NZ', sublabel: 'Dementia helpline',         number: '0800 433 636', color: '#4A7C8E' },
];

export const CRISIS_RESPONSE_TEXT =
  "This sounds like it may be an urgent or distressing situation. Please reach out to one of these services — they are there to help. You can call emergency services on 111, Lifeline NZ on 0800 543 354 for 24/7 crisis support, or Dementia NZ on 0800 433 636 for dementia-specific guidance.";

export function detectCrisis(text) {
  if (!text || typeof text !== 'string') return false;
  return CRISIS_REGEX.test(text);
}

export function callNumber(numberString) {
  const uri = `tel:${numberString.replace(/\s/g, '')}`;
  Linking.canOpenURL(uri)
    .then(supported => { if (supported) Linking.openURL(uri); })
    .catch(() => {});
}
