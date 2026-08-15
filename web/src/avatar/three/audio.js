// Avatar audio playback engine — extracted from the mobile WebView renderer
// (src/features/avatar/components/AvatarVRM.js buildHTML(), lines ~1884-2150)
// with the ReactNativeWebView postMessage bridge replaced by callbacks. The
// playback logic (gapless PCM scheduling, underrun re-anchoring, viseme clock
// anchor) is kept as close to the source as possible on purpose.
//
// Three playback paths, mirroring mobile:
//   playAudioWithLipSync(dataUri)                       — RMS fallback (analyser)
//   playAudioWithVisemeTimeline(dataUri, timeline, emo) — one-shot with alignment
//   startStreamingPlayback / appendAudioChunk / endStreamingPlayback — WS stream
//
// The phase-(d) Three.js renderer reads getClock() every frame to drive the
// mouth; until then the engine runs headless (audio only).

export class AvatarAudioEngine {
  constructor({ onAudioStart, onAudioEnd } = {}) {
    this.onAudioStart = onAudioStart || (() => {});
    this.onAudioEnd = onAudioEnd || (() => {}); // ({ error?, underruns? })
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.analyserBuf = null;
    this.active = false;
    this.visemeMode = false;
    this.visemeTimeline = null;
    this.audioStartTime = null;
    this.speechEmotion = 'neutral';
    this.streamSession = null;
    this._endWaiters = [];
  }

  // ─── AudioContext lifecycle ────────────────────────────────────────────────
  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      });
    }
    return this.ctx;
  }

  // Must be called from a user gesture at least once (autoplay policy).
  unlock() {
    try { this.ensureCtx().resume().catch(() => {}); } catch { /* no audio */ }
  }

  async _decode(dataUri) {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const bin = atob(base64);
    const ab = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ab[i] = bin.charCodeAt(i);
    this.ensureCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx.decodeAudioData(ab.buffer);
  }

  _stopCurrent() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source = null;
    }
    this._stopStreaming();
    this.active = false;
    this.analyser = null;
    this.analyserBuf = null;
    this.visemeMode = false;
    this.visemeTimeline = null;
    this.audioStartTime = null;
  }

  _stopStreaming() {
    const s = this.streamSession;
    if (!s) return;
    for (const src of s.sources) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.streamSession = null;
  }

  _emitEnd(payload) {
    const waiters = this._endWaiters;
    this._endWaiters = [];
    for (const w of waiters) w(payload);
    this.onAudioEnd(payload || {});
  }

  _onAudioEnded(errorMsg) {
    this._stopCurrent();
    this._emitEnd(errorMsg ? { error: errorMsg } : {});
  }

  // Resolves when the current playback/stream fully ends (mobile's awaited
  // endStreamingPlayback semantics).
  waitForEnd() {
    return new Promise((resolve) => this._endWaiters.push(resolve));
  }

  // ─── RMS fallback path ─────────────────────────────────────────────────────
  async playAudioWithLipSync(dataUri) {
    this._stopCurrent();
    this.visemeMode = false;
    try {
      const decoded = await this._decode(dataUri);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyserBuf = new Uint8Array(this.analyser.frequencyBinCount);

      this.source = this.ctx.createBufferSource();
      this.source.buffer = decoded;
      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.active = true;

      this.source.onended = () => this._onAudioEnded(null);
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.onAudioStart();
      this.source.start(0);
    } catch (err) {
      this._onAudioEnded(String(err));
    }
  }

  // ─── Viseme timeline path ──────────────────────────────────────────────────
  async playAudioWithVisemeTimeline(dataUri, timeline, emotion) {
    this._stopCurrent();
    this.visemeMode = true;
    this.visemeTimeline = timeline;
    this.speechEmotion = emotion || 'neutral';
    try {
      const decoded = await this._decode(dataUri);
      this.source = this.ctx.createBufferSource();
      this.source.buffer = decoded;
      this.source.connect(this.ctx.destination);
      this.active = true;

      this.source.onended = () => this._onAudioEnded(null);
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      // 10ms look-ahead so the anchor matches actual sample playback.
      const startAt = this.ctx.currentTime + 0.010;
      this.audioStartTime = startAt;
      this.source.start(startAt);
      this.onAudioStart();
    } catch (err) {
      this._onAudioEnded(String(err));
    }
  }

  // ─── Streaming playback path ───────────────────────────────────────────────
  startStreamingPlayback(sessionId, sampleRate, emotion) {
    this._stopCurrent();
    this.visemeMode = true;
    this.visemeTimeline = { frames: [], totalDuration: 0 };
    this.speechEmotion = emotion || 'neutral';
    this.active = true;
    this.streamSession = {
      id: sessionId,
      sampleRate: sampleRate || 22050,
      nextStartTime: 0,
      sources: [],
      pending: 0,
      endRequested: false,
      underruns: 0,
      started: false,
    };
  }

  appendAudioChunk(sessionId, base64Pcm, visemeFrames) {
    const s = this.streamSession;
    if (!s || s.id !== sessionId) return; // stale chunk after stop/new session
    try {
      // Frames may arrive without audio (flushed trailing word) — append only.
      if (!base64Pcm) {
        this._appendFrames(visemeFrames);
        return;
      }

      this.ensureCtx();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

      // base64 → Int16 PCM → Float32 AudioBuffer
      const bin = atob(base64Pcm);
      const n = bin.length >> 1;
      if (n === 0) return;
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer, 0, n);
      const buffer = this.ctx.createBuffer(1, n, s.sampleRate);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = pcm[i] / 32768;

      if (!s.started) {
        // First chunk anchors the stream clock (same 10ms look-ahead).
        this.audioStartTime = this.ctx.currentTime + 0.010;
        s.nextStartTime = this.audioStartTime;
        s.started = true;
        this.onAudioStart();
      } else if (s.nextStartTime < this.ctx.currentTime) {
        // Underrun: restart slightly ahead and shift the viseme clock anchor.
        const newStart = this.ctx.currentTime + 0.02;
        const shift = newStart - s.nextStartTime;
        this.audioStartTime += shift;
        s.nextStartTime = newStart;
        s.underruns++;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx.destination);
      src.onended = () => {
        s.pending--;
        const idx = s.sources.indexOf(src);
        if (idx >= 0) s.sources.splice(idx, 1);
        if (s.endRequested && s.pending === 0 && this.streamSession === s) {
          const underruns = s.underruns;
          this.streamSession = null;
          this._stopCurrent();
          this._emitEnd({ underruns });
        }
      };
      src.start(s.nextStartTime);
      s.nextStartTime += buffer.duration;
      s.sources.push(src);
      s.pending++;

      this._appendFrames(visemeFrames);
    } catch (err) {
      this._stopStreaming();
      this._onAudioEnded(String(err));
    }
  }

  _appendFrames(visemeFrames) {
    if (visemeFrames && visemeFrames.length && this.visemeTimeline) {
      Array.prototype.push.apply(this.visemeTimeline.frames, visemeFrames);
      const last = visemeFrames[visemeFrames.length - 1];
      this.visemeTimeline.totalDuration = Math.max(this.visemeTimeline.totalDuration, last.time + last.duration);
    }
  }

  endStreamingPlayback(sessionId) {
    const s = this.streamSession;
    if (!s || s.id !== sessionId) return Promise.resolve({});
    const done = this.waitForEnd();
    s.endRequested = true;
    if (s.pending === 0) {
      // Nothing scheduled (empty stream) or everything already finished.
      const underruns = s.underruns;
      const started = s.started;
      this.streamSession = null;
      this._stopCurrent();
      if (!started) this.onAudioStart();
      this._emitEnd({ underruns });
    }
    return done;
  }

  setSpeechEmotion(emotion) {
    this.speechEmotion = emotion || 'neutral';
  }

  stopAudioLipSync() {
    this._stopStreaming();
    this._stopCurrent();
  }

  // Read by the Three.js renderer every animation frame (phase d).
  getClock() {
    return {
      active: this.active,
      visemeMode: this.visemeMode,
      timeline: this.visemeTimeline,
      audioStartTime: this.audioStartTime,
      currentTime: this.ctx ? this.ctx.currentTime : 0,
      emotion: this.speechEmotion,
      analyser: this.analyser,
      analyserBuf: this.analyserBuf,
    };
  }
}
