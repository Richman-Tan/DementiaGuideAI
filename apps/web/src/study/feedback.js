// The feedback protocol's deploy-time switches, read in one place.
//
// The mode ships switched off. It goes live only when BOTH this web flag and the
// API's STUDY_PROTOCOLS include it, so a web deploy alone cannot open sessions
// the backend was never prepared for (docs/study/protocol-feedback.md).
import { PROTOCOL_FEEDBACK, PROTOCOL_TASKS } from '@core/study/studyConfig.mjs';

export const FEEDBACK_PATH = '/study/feedback';

/** Whether this build offers the feedback protocol at all. */
export function feedbackEnabled() {
  return import.meta.env?.VITE_STUDY_FEEDBACK === '1';
}

/**
 * The protocol a study link asks for, from the hash path. `#/study/feedback`
 * asks for the feedback round, anything else under `#/study` for the tasks
 * protocol. Only consulted before a session exists — afterwards the server's
 * record of the session decides.
 */
export function requestedProtocol(path) {
  return path === FEEDBACK_PATH || path.startsWith(`${FEEDBACK_PATH}/`) ? PROTOCOL_FEEDBACK : PROTOCOL_TASKS;
}

/**
 * Who holds the feedback data, for the privacy notice. NZ Privacy Act IPP 3
 * asks that people know who is collecting their information and how to reach
 * them, so this must be set before the mode goes live; until then the notice
 * points people to whoever gave them their code rather than inventing a contact.
 */
export function feedbackContact() {
  return String(import.meta.env?.VITE_STUDY_FEEDBACK_CONTACT || '').trim();
}

/** The e-DiVA-NZ website, for the comparison suggestions. Optional. */
export function edivaUrl() {
  const url = String(import.meta.env?.VITE_STUDY_EDIVA_URL || '').trim();
  return /^https:\/\//.test(url) ? url : '';
}
