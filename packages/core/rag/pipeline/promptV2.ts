// The prompt the university evaluation measured (v2-nz-safety), presented
// through the pipeline's prompt interface. It exists so the new pipeline can be
// run against the saved results of the old one: same instructions, same passage
// labels, same citation markers.
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
