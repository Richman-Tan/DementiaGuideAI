// Maps the web app's dg_settings enums onto the option names expected by
// packages/core/rag/prompt.js (the shared vocabulary). Unknown values fall back
// safely inside buildSystemPrompt, but the mapping is still unit-tested to keep
// the wiring honest.
export function mapSettingsToRag(settings = {}) {
  return {
    conciseMode: !!settings.concise,
    responseStyle: { short: 'brief', balanced: 'balanced', thorough: 'detailed' }[settings.responseStyle] || 'balanced',
    jargonMode: { plain: 'avoid', explained: 'explain', fine: 'ok' }[settings.jargon] || 'explain',
    ariaPersonality: settings.ariaStyle || 'warm',
    // 'exploring for myself' is the only non-carer setup path.
    isCaregiversSetup: settings.setupType !== 'exploring',
  };
}

// Voice speed → ElevenLabs speech rate. 0.78 is the mobile default.
export function speechRateFor(settings = {}) {
  return { slower: 0.65, normal: 0.78, faster: 0.92 }[settings.voiceSpeed] || 0.78;
}
