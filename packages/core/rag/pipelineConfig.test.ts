import { DEFAULT_MODEL, pipelineConfig } from './pipelineConfig.ts';
import { promptV2 } from './pipeline/promptV2.ts';
import { promptV3 } from './pipeline/promptV3.ts';

describe('pipelineConfig', () => {
  it('defaults to Opus 5.5 with prompt v3, lower effort for speech, and the shared retrieval settings', () => {
    const config = pipelineConfig();
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5');
    expect(config.prompt).toBe(promptV3);
    expect(config.generation).toEqual({
      text: { model: 'claude-opus-5-5', maxTokens: 16000, effort: 'medium' },
      voice: { model: 'claude-opus-5-5', maxTokens: 8000, effort: 'low' },
    });
    expect(config.retrieval).toEqual({
      topK: 5,
      oversample: 10,
      minSimilarity: 0.25,
      maxPerSourceFamily: 2,
    });
    expect(config.maxHistory).toBe(6);
    expect(config.triageTimeoutMs).toBe(4000);
  });

  it('takes overrides for the things an evaluation varies', () => {
    const config = pipelineConfig({
      model: 'claude-haiku-5-5',
      textEffort: 'low',
      voiceEffort: 'medium',
      prompt: promptV2,
      topK: 8,
      minSimilarity: 0.4,
    });
    expect(config.generation.text).toMatchObject({ model: 'claude-haiku-5-5', effort: 'low' });
    expect(config.generation.voice).toMatchObject({ model: 'claude-haiku-5-5', effort: 'medium' });
    expect(config.prompt).toBe(promptV2);
    expect(config.retrieval).toMatchObject({ topK: 8, minSimilarity: 0.4 });
  });

  it('names the version after the prompt and a fingerprint of every other setting', () => {
    const base = pipelineConfig().pipelineVersion;
    expect(base).toMatch(/^v3-claude-nz@[0-9a-z]+$/);
    expect(pipelineConfig().pipelineVersion).toBe(base);
    expect(pipelineConfig({ prompt: promptV2 }).pipelineVersion).toMatch(/^v2-nz-safety@/);
    // The prompt alone changes only the first half.
    expect(pipelineConfig({ prompt: promptV2 }).pipelineVersion.split('@')[1]).toBe(
      base.split('@')[1]
    );
    for (const changed of [
      pipelineConfig({ model: 'claude-sonnet-5-5' }),
      pipelineConfig({ textEffort: 'high' }),
      pipelineConfig({ voiceEffort: 'medium' }),
      pipelineConfig({ topK: 6 }),
      pipelineConfig({ minSimilarity: 0.3 }),
    ]) {
      expect(changed.pipelineVersion).not.toBe(base);
    }
  });
});
