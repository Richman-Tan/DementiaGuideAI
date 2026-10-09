// E4-B (docs/eval/evaluation-plan.md §18.4 and its deviation note): in-page
// harness, injected with addInitScript before the app's own scripts run.
// Read by scripts/eval/latency/bench-browser.mjs as text; never bundled.
//
// It OBSERVES the app and supplies the microphone. It changes no app code
// path, with two declared exceptions:
//   1. getUserMedia (audio only) returns a synthetic stream: the turn's clip,
//      played by a harness AudioContext into a MediaStreamAudioDestinationNode.
//      Native capture is NEVER called, so the real microphone cannot open.
//   2. SpeechRecognition.prototype.start passes that same track to Chrome's
//      recogniser (start(track)), so recogniser and MediaRecorder hear one copy
//      of the clip, as from one microphone. It never starts without a track.
// Condition F deletes window.SpeechRecognition / webkitSpeechRecognition
// (setLive(false)); sttWeb.js looks them up at every session start.
//
// Everything else is a pass-through wrapper that records performance.now():
// MediaRecorder start/stop/dataavailable, recogniser events,
// AudioBufferSourceNode.start (first audio), trusted clicks and console lines.
(() => {
  if (window.__e4b) return;
  const now = () => performance.now();
  const E = (window.__e4b = { events: [], clip: null, tCap: null, track: null, recParts: [], recMime: null });
  const ev = (k, v) => { E.events.push([now(), k, v === undefined ? null : v]); };
  E.reset = () => { E.events = []; E.tCap = null; E.recParts = []; E.recMime = null; try { performance.clearResourceTimings(); } catch { /* old engine */ } };
  try { performance.setResourceTimingBufferSize(5000); } catch { /* old engine */ }

  // ── console lines (the app's [LATENCY SUMMARY], [RAG] …, [STT] …) ─────────
  for (const level of ['log', 'warn', 'error', 'info']) {
    const orig = console[level].bind(console);
    console[level] = (...a) => {
      try {
        const s = a.map((x) => (typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x))).join(' ');
        if (/^\[(LATENCY SUMMARY|RAG|STT|TTS|auth|useVoiceConversation|conversations|unity)\]/.test(s)) ev('console', `${level}: ${s.slice(0, 600)}`);
      } catch { /* unserialisable argument */ }
      return orig(...a);
    };
  }

  // ── first audio: the app's AvatarAudioEngine schedules AudioBufferSourceNodes
  const origSrcStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    const t = now();
    const ctx = this.context;
    const ct = ctx.currentTime;
    const lead = when > ct ? (when - ct) * 1000 : 0;
    ev('src.start', { at: t + lead, call: t, when, ctxTime: ct, dur: this.buffer ? this.buffer.duration : null,
      base: ctx.baseLatency ?? null, out: ctx.outputLatency ?? null, state: ctx.state });
    return origSrcStart.call(this, when, ...rest);
  };

  // ── synthetic microphone ──────────────────────────────────────────────────
  let hctx = null;
  const harnessCtx = () => (hctx ||= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }));
  E.loadClip = async (b64, meta) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buf = await harnessCtx().decodeAudioData(bytes.buffer);
    E.clip = { buf, meta, ms: buf.duration * 1000 };
    return E.clip.ms;
  };
  const md = window.MediaDevices && MediaDevices.prototype;
  if (md) {
    md.getUserMedia = async function (c) {
      if (!c || !c.audio || c.video || !E.clip) {
        ev('gum.refused', JSON.stringify(c ?? null));
        throw new DOMException('E4-B harness: only the synthetic microphone exists', 'NotAllowedError');
      }
      const ctx = harnessCtx();
      if (ctx.state !== 'running') await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      dest.channelCount = 1;
      dest.channelCountMode = 'explicit';
      const src = ctx.createBufferSource();
      src.buffer = E.clip.buf;
      src.connect(dest);
      const ct = ctx.currentTime;
      const t = now();
      const when = ct + 0.05;
      origSrcStart.call(src, when); // the harness source is not an app source
      E.tCap = t + (when - ct) * 1000;
      E.track = dest.stream.getAudioTracks()[0];
      ev('gum', { tCap: E.tCap, clipMs: E.clip.ms, ctxBase: ctx.baseLatency ?? null });
      return dest.stream;
    };
    md.getDisplayMedia = async function () { throw new DOMException('E4-B harness', 'NotAllowedError'); };
  }

  // ── recogniser: route the synthetic track, observe events ─────────────────
  const ctors = [];
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    const C = window[name];
    if (C && !ctors.some((x) => x.C === C)) ctors.push({ C, desc: [] });
  }
  const descs = {};
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) descs[name] = Object.getOwnPropertyDescriptor(window, name);
  let recSeq = 0;
  for (const { C } of ctors) {
    const P = C.prototype;
    const origStart = P.start;
    const origStop = P.stop;
    P.start = function () {
      const id = ++recSeq;
      if (!E.track) { ev('rec.refused', id); throw new DOMException('E4-B harness: no synthetic track', 'InvalidStateError'); }
      for (const k of ['audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'end', 'nomatch']) {
        this.addEventListener(k, () => ev(`rec.${k}`, id));
      }
      this.addEventListener('error', (e) => ev('rec.error', `${id} ${e.error}`));
      this.addEventListener('result', (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        ev('rec.result', { id, final: e.results[e.results.length - 1].isFinal, text: text.trim() });
      });
      ev('rec.start', { id, lang: this.lang, interim: this.interimResults, continuous: this.continuous });
      return origStart.call(this, E.track);
    };
    P.stop = function () { ev('rec.stop'); return origStop.call(this); };
  }
  E.setLive = (on) => {
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      if (!descs[name]) continue;
      if (on) Object.defineProperty(window, name, descs[name]);
      else delete window[name];
    }
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  };

  // ── MediaRecorder: timing + a passive copy of the recording ───────────────
  const MR = window.MediaRecorder && MediaRecorder.prototype;
  if (MR) {
    const s0 = MR.start;
    const st0 = MR.stop;
    MR.start = function (...a) {
      const parts = [];
      E.recParts = parts;
      E.recMime = this.mimeType;
      this.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) parts.push(e.data); });
      this.addEventListener('start', () => ev('mr.started'));
      this.addEventListener('stop', () => ev('mr.stopped', parts.reduce((n, b) => n + b.size, 0)));
      ev('mr.start', this.mimeType);
      return s0.apply(this, a);
    };
    MR.stop = function (...a) { ev('mr.stop'); return st0.apply(this, a); };
  }
  E.recordingBase64 = async () => {
    if (!E.recParts.length) return null;
    const b = new Uint8Array(await new Blob(E.recParts, { type: E.recMime || 'audio/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // ── trusted clicks (the mic taps) ─────────────────────────────────────────
  const onClick = (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    ev('click', { trusted: e.isTrusted, label: btn ? btn.getAttribute('aria-label') || btn.textContent.trim().slice(0, 40) : null });
  };
  document.addEventListener('click', onClick, true);

  E.resources = () => performance.getEntriesByType('resource')
    .filter((r) => /\/api\/|\/rest\/v1\/rpc\//.test(r.name))
    .map((r) => ({ name: r.name.replace(/^https?:\/\/[^/]+/, ''), host: new URL(r.name).host, start: r.startTime, reqStart: r.requestStart, respStart: r.responseStart, end: r.responseEnd }));
})();
