import {
  visemeTimelineToCC4,
  visemeTimelineToEvents,
  segmentToCC4Payload,
} from './blendshapeTranslator';

// The payload builder shared by the mobile and web Unity bridges. Unity itself
// is not present in any test runner, but the data it is sent is plain JSON and
// is pinned here.

const frame = (viseme, weight = 1, time = 0, duration = 0.1) => ({
  time,
  viseme,
  duration,
  weight,
});
const timeline = (...frames) => ({ frames, totalDuration: 1 });

describe('visemeTimelineToCC4', () => {
  it('returns no keyframes for a missing or empty timeline', () => {
    expect(visemeTimelineToCC4(null)).toEqual([]);
    expect(visemeTimelineToCC4(undefined)).toEqual([]);
    expect(visemeTimelineToCC4({ frames: [] })).toEqual([]);
  });

  it('maps an open vowel at full weight onto the CC4 shapes, with jaw_drive for the bone', () => {
    const [kf] = visemeTimelineToCC4(timeline(frame('aa', 1, 0.25)), null);
    expect(kf.time).toBe(0.25);
    expect(kf.weights).toEqual({
      jaw_drive: 1,
      V_Lip_Open: 0.9,
      V_Open: 0.8,
      Mouth_Lips_Pull_DL: 0.45,
      Mouth_Lips_Pull_DR: 0.45,
      Mouth_Lips_Pull_UL: 0.3,
      Mouth_Lips_Pull_UR: 0.3,
    });
  });

  it('drives only symmetric pairs: every _L/_R and DL/DR, UL/UR pair moves together', () => {
    const all = [
      'aa',
      'ih',
      'ou',
      'ee',
      'oh',
      'v_pp',
      'v_ff',
      'v_th',
      'v_dd',
      'v_kk',
      'v_ch',
      'v_ss',
      'v_nn',
      'v_rr',
    ];
    for (const v of all) {
      const [{ weights }] = visemeTimelineToCC4(timeline(frame(v)), null);
      expect(Object.keys(weights).length).toBeGreaterThan(0);
      for (const [k, w] of Object.entries(weights)) {
        // Mouth_Lips_Press_L → _R, Mouth_Lips_Pull_DL → _DR, …_UL → _UR.
        const mirror = k.replace(/_([DU]?)L$/, '_$1R');
        if (mirror !== k) expect(weights[mirror]).toBe(w);
      }
      // The asymmetric shapes that are broken on the FBX export are never used.
      expect(weights).not.toHaveProperty('Jaw_Open');
      expect(weights).not.toHaveProperty('Mouth_LowerLip_Depress_R');
      expect(weights).not.toHaveProperty('Mouth_UpperLip_Raise_R');
    }
  });

  it('scales by the frame weight and the per-profile scalar for that viseme', () => {
    const [kf] = visemeTimelineToCC4(timeline(frame('ou', 0.5)), { ou: 0.5 });
    // effective 0.25 × multipliers (jaw 0.25, lip-open 0.22, tight-O 1.0)
    expect(kf.weights.V_Tight_O).toBeCloseTo(0.25, 6);
    expect(kf.weights.jaw_drive).toBeCloseTo(0.0625, 6);
    expect(kf.weights.V_Lip_Open).toBeCloseTo(0.055, 6);
  });

  it('uses the default CC4 scale of 1.0 when the profile has no scalar for that viseme', () => {
    const [kf] = visemeTimelineToCC4(timeline(frame('v_pp', 0.5)), { aa: 0.1 });
    expect(kf.weights).toEqual({
      V_Explosive: 0.5,
      Mouth_Lips_Press_L: 0.2,
      Mouth_Lips_Press_R: 0.2,
    });
  });

  it('clamps every shape at 1.0 when a profile boosts past full', () => {
    const [kf] = visemeTimelineToCC4(timeline(frame('aa', 1)), { aa: 3 });
    for (const w of Object.values(kf.weights)) expect(w).toBeLessThanOrEqual(1);
    expect(kf.weights.jaw_drive).toBe(1);
    expect(kf.weights.Mouth_Lips_Pull_UL).toBeCloseTo(0.9, 6);
  });

  it('drops shapes that would round to nothing (≤ 0.001) rather than sending zeros', () => {
    // v_nn jaw_drive multiplier is 0.04, so a weight of 0.02 gives 0.0008.
    const [kf] = visemeTimelineToCC4(timeline(frame('v_nn', 0.02)), null);
    expect(kf.weights).not.toHaveProperty('jaw_drive');
    expect(kf.weights.Mouth_Lips_Press_L).toBeCloseTo(0.005, 6);
  });

  it('closes the mouth on silence and on an unknown viseme, keeping the keyframe time', () => {
    const out = visemeTimelineToCC4(timeline(frame('neutral', 1, 0.1), frame('zz', 1, 0.2)), null);
    expect(out).toEqual([
      { time: 0.1, weights: {} },
      { time: 0.2, weights: {} },
    ]);
  });
});

describe('visemeTimelineToEvents', () => {
  it('returns no events for a missing or empty timeline', () => {
    expect(visemeTimelineToEvents(null)).toEqual([]);
    expect(visemeTimelineToEvents({ frames: [] })).toEqual([]);
  });

  it('carries viseme identity, timing and weight in the compact Unity shape', () => {
    const out = visemeTimelineToEvents(
      timeline(frame('v_pp', 0.7, 0.5, 0.08), frame('aa', 0.6, 0.58, 0.12))
    );
    expect(out).toEqual([
      { t: 0.5, d: 0.08, v: 'v_pp', w: 0.7 },
      { t: 0.58, d: 0.12, v: 'aa', w: 0.6 },
    ]);
  });
});

describe('segmentToCC4Payload', () => {
  it('builds both the raw events and the pre-translated blendshapes from one segment', () => {
    const tl = timeline(frame('ee', 1, 0));
    const payload = segmentToCC4Payload(
      { audio: 'BASE64', visemeTimeline: tl, text: 'Kia ora', emotion: 'happy' },
      null
    );
    expect(payload).toEqual({
      audio: 'BASE64',
      visemes: [{ t: 0, d: 0.1, v: 'ee', w: 1 }],
      blendshapes: [{ time: 0, weights: { jaw_drive: 0.18, V_Lip_Open: 0.18, V_Tight: 0.9 } }],
      emotion: 'happy',
      text: 'Kia ora',
    });
  });

  it('defaults the emotion to neutral and tolerates a segment with no timeline', () => {
    const payload = segmentToCC4Payload({ audio: 'A', visemeTimeline: null, text: 'Hi' }, null);
    expect(payload).toEqual({
      audio: 'A',
      visemes: [],
      blendshapes: [],
      emotion: 'neutral',
      text: 'Hi',
    });
  });
});
