// The v2-nz-safety prompt as the studied system shipped it, presented through
// the pipeline's prompt interface. It exists so the new pipeline can be run
// against the saved results of the old one: same instructions, same passage
// labels, same citation markers. With default settings its text is byte for
// byte what scripts/eval's "v2" condition produces (sha256 aa6fd9e6…).
//
// One caveat when comparing: the September 2026 baseline runs
// (docs/report/eval/generation_8a92ecd_v2_*.json, sha256 dd8c5e58…) were made
// before two sentences were added to v2, the don't-overstate clause and the
// driving rule. The October runs used the text as it is here.
//
// It is not what the product should ship: the text names the assistant "Aria"
// whatever avatar is selected, and it has no spoken lead. The prompt text itself
// lives in ../prompt.js and is never edited, because those saved results depend
// on it.
import { buildSystemPrompt, buildUserContent } from '../prompt.js';
import type { PromptAdapter } from './types.ts';

export const promptV2: PromptAdapter = {
  version: 'v2-nz-safety',
  sections: false,
  system(settings) {
    return {
      stable: buildSystemPrompt(
        {
          conciseMode: settings.conciseMode,
          responseStyle: settings.responseStyle,
          jargonMode: settings.jargonMode,
          ariaPersonality: settings.personality,
          isCaregiversSetup: settings.isCaregiverSetup,
          includeSources: true,
          citationMode: 'inline',
        },
        'v2-nz-safety'
      ),
      perTurn: '',
    };
  },
  user(question, passages) {
    return buildUserContent(question, passages, 'inline');
  },
};
