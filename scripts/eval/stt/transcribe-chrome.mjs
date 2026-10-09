#!/usr/bin/env node
// E9-C (docs/eval/plan-19c-chrome-ondevice.md): transcribe the prepared
// DementiaBank/ADReSS utterance cuts with Chrome's ON-DEVICE Web Speech
// recogniser (SpeechRecognition.processLocally = true) and write the same
// hypothesis-CSV contract as transcribe-apple.mjs, so wer-report.mjs scores it
// unchanged.
//
// GOVERNANCE (non-negotiable). No DementiaBank audio, transcript or derived
// text may leave this Mac.
//   - Network is on only in --install (the language-pack download). That phase
//     plays no audio and serves no DementiaBank file.
//   - Every other phase launches the harness Chrome with its network stack
//     pointed at a local REFUSING proxy (--proxy-server; only loopback
//     bypasses it, Chrome's default) and --host-resolver-rules
//     "MAP * ~NOTFOUND", so no host name resolves and no request is forwarded.
//     The proxy reads the request line, answers 502 and closes: for HTTPS that
//     is a CONNECT naming the host, before any TLS or request body.
//   - Monitors run for the whole session: lsof on the Chrome process tree every
//     second (any socket with a non-loopback peer); nettop on the non-loopback
//     interfaces every second (any flow owned by the tree); the kernel log of
//     network-outbound denials by Chrome's own sandbox in the tree; the proxy
//     (every request); and a NetLog read live every few seconds (every URL and
//     socket address Chrome's network stack touches).
//   - DementiaBank run: before the first cut can be served, the offline proof
//     is repeated in the same Chrome (on-device recognition of a synthetic
//     clip works; the cloud recogniser fails). Then the guards are ARMED and
//     the page server's gate opens. While armed, any of these kills Chrome and
//     stops the run: a non-loopback socket (lsof) or flow (nettop) of the tree;
//     a sandbox network denial in the tree; a NetLog URL containing "speech";
//     a NetLog URL or socket address, or a proxy request host, outside the
//     baseline recorded by the no-audio offline proof; a recogniser "network"
//     error; a real-microphone access request (TCC).
// NOTHING AUDIBLE, NO MICROPHONE (the E4-B method, plan §18.4 deviation):
//   the clip is played by an AudioContext never connected to the speakers into
//   a MediaStreamAudioDestinationNode and handed to the recogniser with
//   start(track); the page refuses getUserMedia; Chrome runs with
//   --mute-audio and --disable-audio-input; a TCC watchdog kills Chrome at the
//   first real-microphone access request. Synthetic clips are written with
//   `say -o` to files and never played.
//
// Usage (the profile holds the language pack; use the same one throughout):
//   node scripts/eval/stt/transcribe-chrome.mjs --dry-run --root <main checkout>
//   node scripts/eval/stt/transcribe-chrome.mjs --probe --profile <dir>                          # offline, no audio
//   node scripts/eval/stt/transcribe-chrome.mjs --install --profile <dir> --locales en-NZ,en-US  # ONLINE, no audio
//   node scripts/eval/stt/transcribe-chrome.mjs --offline-proof --profile <dir> --locales en-NZ,en-US  # synthetic audio
//   node scripts/eval/stt/transcribe-chrome.mjs --profile <dir> --locale en-NZ --baseline <proof.json> [--concurrency 4]
//   flags: --root <repo root holding data/dementiabank> (default: this checkout)
//          --scratch <dir> (NetLogs, Chrome stderr, synthetic audio; default .cache/eval/chrome-ondevice)
//          --headed (small window instead of headless)  --limit N  --only i,j,k --cache-tag <t>
// Output: data/dementiabank/hyps_chrome-ondevice-<locale>.csv (model column
// "chrome-ondevice:<locale>"), cached per file under
// data/dementiabank/cache/chrome-ondevice-<locale>/ so an interrupted run resumes.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import net from 'node:net';

import { ROOT, gitSha, csvEscape, sleep } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');
const { wer } = require('../lib/wer.js');
const { mulberry32 } = require('../lib/stats.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const MODE = has('--dry-run') ? 'dry' : has('--probe') ? 'probe' : has('--install') ? 'install' : has('--offline-proof') ? 'proof' : 'run';
const PROFILE = argVal('--profile') ? resolve(argVal('--profile')) : null;
const LOCALE = argVal('--locale') ?? 'en-NZ';
const LOCALES = (argVal('--locales') ?? 'en-NZ,en-US').split(',');
const HEADED = has('--headed');
// --robustness: the plan's §19C.9 re-run — 60 seeded cuts, one at a time, in
// a separate cache that is never scored, compared with the primary pass.
const ROBUST = has('--robustness');
const CONCURRENCY = ROBUST ? 1 : Number(argVal('--concurrency') ?? 4);
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const ONLY = argVal('--only') ? new Set(argVal('--only').split(',').map(Number)) : null;
const PROBE_SECONDS = Number(argVal('--probe-seconds') ?? 60);
const DATA_ROOT = resolve(argVal('--root') ?? ROOT);
const REFERENCES = resolve(DATA_ROOT, argVal('--references') ?? 'data/dementiabank/references.csv');
const DATA_DIR = resolve(DATA_ROOT, 'data/dementiabank');
const TAG = `chrome-ondevice-${LOCALE}`;
const CACHE_TAG = ROBUST ? `${TAG}-robust` : (argVal('--cache-tag') ?? TAG);
const MODEL_LABEL = `chrome-ondevice:${LOCALE}`;
const OUT = resolve(DATA_ROOT, argVal('--out') ?? `data/dementiabank/hyps_${TAG}.csv`);
const CACHE_DIR = resolve(DATA_DIR, 'cache', CACHE_TAG);
const SCRATCH = resolve(argVal('--scratch') ?? resolve(ROOT, '.cache/eval/chrome-ondevice'));
const REPORT_DIR = resolve(ROOT, 'docs/report/eval/stt');
const TOOL_VERSION = 'chrome-ondevice-stt 1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HARNESS_HTML = resolve(ROOT, 'scripts/eval/stt/chrome-ondevice/harness.html');
// Request timing, fixed in the plan: the clip starts LEAD ms after the
// recogniser's audiostart; stop() is called TAIL ms after the clip's last
// sample; the final result is awaited until `end` (END_TIMEOUT cap).
const REQ = { leadMs: 250, tailMs: 1000, endTimeoutMs: 20000, audiostartTimeoutMs: 5000 };
// Recogniser errors that stop the run: a path that is not local, or a set-up
// failure. "no-speech" is routine (empty hypothesis); anything else is retried.
const FATAL_ERRORS = /^(network|service-not-allowed|language-not-supported|not-allowed|phrases-not-supported|harness:)/;

// Synthetic clips for the offline proof: our own sentences, never DementiaBank.
const SYNTH = [
  { id: 'syn1', voice: 'Samantha', text: 'My mother keeps forgetting where she put her keys and it worries me.' },
  { id: 'syn2', voice: 'Samantha', text: 'What should I do when my father gets upset in the evening?' },
  { id: 'syn3', voice: 'Daniel', text: 'The weather has been cold and wet for most of the week.' },
  { id: 'syn4', voice: 'Karen', text: 'Please remind me to call the doctor tomorrow morning about the new tablets.' },
  { id: 'syn5', voice: 'Samantha', text: 'We went for a short walk to the park and then had a cup of tea.' },
  { id: 'syn6', voice: 'Daniel', text: 'Is there a support group for carers that meets near the city?' },
];

const now = () => new Date().toISOString();
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);
const scrub = (s) => String(s).split(PROFILE ?? '\0').join('<profile>').split(SCRATCH).join('<scratch>');

// ── synthetic audio: `say -o` to a file, converted with afconvert; never played
function synth(clip) {
  const dir = resolve(SCRATCH, 'synth');
  mkdirSync(dir, { recursive: true });
  const aiff = resolve(dir, `${clip.id}.aiff`);
  const wav = resolve(dir, `${clip.id}.wav`);
  if (!existsSync(wav)) {
    execFileSync('/usr/bin/say', ['-v', clip.voice, '-o', aiff, clip.text]);
    execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', aiff, wav]);
    rmSync(aiff, { force: true });
  }
  return wav;
}

// ── page server (127.0.0.1 only). Cuts are served by index, and only while the
//    gate is open; synthetic clips by id.
function startPageServer({ cutPaths = [], synthPaths = {} }) {
  const state = { gateOpen: false, closed: false, served: 0, refused: 0, requests: 0 };
  const html = readFileSync(HARNESS_HTML);
  const srv = http.createServer((req, res) => {
    state.requests++;
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, type) => { res.writeHead(code, { 'Content-Type': type ?? 'text/plain', 'Cache-Control': 'no-store' }); res.end(body); };
    if (state.closed) return send(410, 'closed');
    if (u.pathname === '/' || u.pathname === '/index.html') return send(200, html, 'text/html; charset=utf-8');
    let m = /^\/synth\/(\w+)$/.exec(u.pathname);
    if (m && synthPaths[m[1]]) return send(200, readFileSync(synthPaths[m[1]]), 'audio/wav');
    m = /^\/cut\/(\d+)$/.exec(u.pathname);
    if (m) {
      const i = Number(m[1]);
      if (!state.gateOpen || !cutPaths[i]) { state.refused++; return send(403, 'gate closed'); }
      state.served++;
      return send(200, readFileSync(cutPaths[i]), 'audio/wav');
    }
    if (u.pathname === '/favicon.ico') return send(204, '');
    return send(404, 'not found');
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, state, close: () => new Promise((c) => { srv.closeAllConnections?.(); srv.close(c); }) })));
}

// ── refusing proxy: every request Chrome's network stack makes for a
//    non-loopback URL lands here and is answered 502 without being forwarded.
function startProxySink(onRequest) {
  const seen = [];
  const srv = net.createServer((sock) => {
    let buf = '';
    sock.on('data', (d) => {
      if (buf === null) return;
      buf += d.toString('latin1');
      if (!buf.includes('\r\n')) return;
      const [method, target] = buf.split('\r\n')[0].split(' ');
      buf = null;
      let host = target ?? '?';
      try { if (/^https?:\/\//.test(host)) host = new URL(host).host; } catch { /* keep */ }
      const entry = { at: Date.now(), method, host };
      seen.push(entry);
      onRequest(entry);
      sock.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, seen, close: () => new Promise((c) => srv.close(c)) })));
}

// ── the harness Chrome's process tree ──────────────────────────────────────
function processTable() {
  return new Promise((r) => execFile('ps', ['-A', '-o', 'pid=,ppid='], { maxBuffer: 8 << 20 }, (err, out) => {
    r(String(out || '').split('\n').map((l) => /^\s*(\d+)\s+(\d+)/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]) })));
  }));
}
async function treePids(root) {
  if (!root) return [];
  const rows = await processTable();
  if (!rows.some((x) => x.pid === root)) return [];
  const kids = new Map();
  for (const p of rows) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p.pid); }
  const out = [];
  const q = [root];
  while (q.length) { const p = q.shift(); out.push(p); for (const c of kids.get(p) ?? []) q.push(c); }
  return out;
}

// ── socket monitor: lsof on the tree every second ──────────────────────────
const isLoopback = (addr) => /^(127\.|\[::1\]|localhost|::1)/.test(addr);
function startSocketMonitor(getPids, onExternal) {
  const seen = { snapshots: 0, maxSockets: 0, external: [], kinds: {} };
  let stopped = false; let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const pids = await getPids();
      if (!pids.length) return;
      const out = await new Promise((r) => execFile('/usr/sbin/lsof', ['-nP', '-i', '-a', '-p', pids.join(',')], { timeout: 8000, maxBuffer: 8 << 20 }, (err, o) => r(String(o || ''))));
      seen.snapshots++;
      const lines = out.split('\n').slice(1).filter(Boolean);
      seen.maxSockets = Math.max(seen.maxSockets, lines.length);
      for (const l of lines) {
        const m = /(TCP|UDP)\s+(\S+?)(?:->(\S+))?(?:\s+\((\w+)\))?\s*$/.exec(l);
        if (!m) continue;
        const [, proto, local, remote, state] = m;
        const kind = `${proto} ${isLoopback(local) ? 'loopback' : local.startsWith('*') ? 'wildcard' : 'non-loopback'}-local${remote ? (isLoopback(remote) ? '->loopback' : '->EXTERNAL') : ''}${state ? ` ${state}` : ''}`;
        seen.kinds[kind] = (seen.kinds[kind] ?? 0) + 1;
        if (remote && !isLoopback(remote)) { const e = `${now()} ${l.trim().replace(/\s+/g, ' ')}`; seen.external.push(e); onExternal(e); }
      }
    } finally { busy = false; }
  };
  const iv = setInterval(tick, 1000);
  return { seen, stop: () => { stopped = true; clearInterval(iv); } };
}

// ── nettop: flows on the NON-loopback interfaces, every second. nettop reads
//    the kernel's network statistics, so it also sees flows that open and close
//    between two lsof polls. Stop signal: any TCP flow of the tree, or any UDP
//    flow of the tree that moved a byte. A zero-byte UDP socket is recorded
//    separately: Chrome's IPv6 reachability probe connect()s a UDP socket to
//    2001:4860:4860::8888:443 without sending a datagram (NetLog UDP_CONNECT).
function startNettopMonitor(isTreePid, onExternal) {
  const nt = spawn('/usr/bin/nettop', ['-L', '0', '-s', '1', '-n', '-x', '-t', 'external']);
  const seen = { samples: 0, rows: 0, tree: [], zeroByteUdp: {} };
  let buf = ''; let cur = null;
  nt.stdout.on('data', (d) => {
    buf += String(d);
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith('time,')) { seen.samples++; cur = null; continue; }
      const cols = line.split(',');
      const name = cols[1] ?? '';
      if (/^(tcp|udp)[46] /.test(name)) {
        if (!cur) continue;
        seen.rows++;
        const owner = cur;
        const proto = name.slice(0, 3);
        const bytesIn = Number(cols[4]) || 0; const bytesOut = Number(cols[5]) || 0;
        isTreePid(owner.pid).then((mine) => {
          if (!mine) return;
          const e = `${now()} ${owner.name} ${name} iface=${cols[2]} state=${cols[3]} in=${bytesIn} out=${bytesOut}`;
          if (proto === 'tcp' || bytesIn > 0 || bytesOut > 0) { seen.tree.push(e); onExternal(e); } else { const k = `${owner.name.replace(/\.\d+$/, '')} ${name.replace(/[.:]\d+<->/, ':*<->')}`; seen.zeroByteUdp[k] = (seen.zeroByteUdp[k] ?? 0) + 1; }
        });
      } else {
        const m = /^(.*)\.(\d+)$/.exec(name);
        cur = m ? { name, pid: Number(m[2]) } : null;
      }
    }
  });
  return { seen, stop: () => nt.kill() };
}

// ── kernel log: network-outbound denied by Chrome's own sandbox in the tree ─
function startSandboxLogMonitor(isTreePid, onDenial) {
  const wd = spawn('/usr/bin/log', ['stream', '--style', 'compact', '--predicate', 'sender == "Sandbox" AND eventMessage CONTAINS "network-outbound"']);
  const seen = { denials: [], otherProcesses: {} };
  let buf = '';
  wd.stdout.on('data', (d) => {
    buf += String(d);
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const m = /Sandbox: (.+?)\((\d+)\) deny\(\d+\) network-outbound (.*)$/.exec(line);
      if (!m) continue;
      const [, proc, pidS, what] = m;
      isTreePid(Number(pidS)).then((mine) => {
        if (mine) { const e = `${now()} ${proc}(${pidS}) ${what}`; seen.denials.push(e); onDenial(e); } else seen.otherProcesses[proc] = (seen.otherProcesses[proc] ?? 0) + 1;
      });
    }
  });
  return { seen, stop: () => wd.kill() };
}

// ── TCC watchdog (as scripts/eval/latency/bench-browser.mjs, E4-B): a
//    real-microphone access request by the harness Chrome, or by anything with
//    Terminal as responsible app, kills Chrome. Other apps are only counted.
function startTccWatchdog(onTrip, isMine) {
  const wd = spawn('/usr/bin/log', ['stream', '--style', 'compact', '--predicate',
    'subsystem == "com.apple.TCC" AND (eventMessage CONTAINS "AUTHREQ_CTX" OR eventMessage CONTAINS "AUTHREQ_ATTRIBUTION" OR eventMessage CONTAINS "AUTHREQ_PROMPTING")']);
  const seen = { preflight: 0, trips: [], others: {} };
  const byMsg = new Map();
  const decide = (id) => {
    const m = byMsg.get(id);
    if (!m || m.done || !m.mic || m.preflight !== 'no' || !m.attr) return;
    m.done = true;
    const trip = () => { seen.trips.push(`${id} pid ${m.pid} responsible ${m.responsible}`); onTrip(`msgID ${id}, accessing pid ${m.pid}, responsible ${m.responsible}`); };
    if (m.responsible === 'com.apple.Terminal') return trip();
    isMine(m.pid).then((mine) => {
      if (mine) return trip();
      const k = `${m.responsible ?? '?'} (${m.accessing ?? '?'})`; seen.others[k] = (seen.others[k] ?? 0) + 1;
    });
  };
  let buf = '';
  wd.stdout.on('data', (d) => {
    buf += String(d);
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const id = /msgID=([\d.]+)/.exec(line)?.[1];
      if (!id) continue;
      const m = byMsg.get(id) ?? {};
      byMsg.set(id, m);
      if (/AUTHREQ_CTX/.test(line)) {
        m.mic = /service=kTCCServiceMicrophone/.test(line);
        m.preflight = /preflight=no/.test(line) ? 'no' : 'yes';
        if (m.mic && m.preflight === 'yes') seen.preflight++;
        if (m.mic && m.preflight === 'no' && !m.attr) setTimeout(() => { if (!m.done && !m.attr) { m.attr = true; m.responsible = 'unknown'; m.done = true; seen.trips.push(`${id} no attribution`); onTrip(`msgID ${id}: real-microphone request with no attribution`); } }, 3000);
      } else if (/AUTHREQ_ATTRIBUTION/.test(line)) {
        m.attr = true;
        m.responsible = /responsible=\{TCCDProcess: identifier=([\w.]+)/.exec(line)?.[1] ?? null;
        m.pid = Number(/accessing=\{TCCDProcess: identifier=[\w.]+, pid=(\d+)/.exec(line)?.[1]) || null;
        m.accessing = /accessing=\{TCCDProcess: identifier=([\w.]+)/.exec(line)?.[1] ?? null;
      } else if (/AUTHREQ_PROMPTING/.test(line) && /kTCCServiceMicrophone/.test(line) && /com\.apple\.Terminal/.test(line)) {
        seen.trips.push(`${id} prompt`); onTrip(`msgID ${id}: microphone prompt for Terminal`);
      }
      decide(id);
      if (byMsg.size > 5000) byMsg.clear();
    }
  });
  return { stop: () => wd.kill(), seen };
}

// ── NetLog, read live: every URL and socket address Chrome's network stack
//    touches. Keys: "<scheme>//<host><path>" for URLs (query dropped) and
//    "<event>/<source> <address>" for non-loopback socket addresses.
//    DNS-configuration and local-address events are not connections.
const LOOP_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const NOT_CONNECTIONS = /^(DNS_CONFIG_CHANGED|UDP_LOCAL_ADDRESS|TCP_ACCEPT|SOCKET_BYTES_|NETWORK_)/;
function startNetLogMonitor(file, onItem) {
  const st = { offset: 0, partial: '', types: null, srcTypes: null, tickOffset: 0, events: 0, urls: {}, addrs: {}, items: [] };
  const record = (kind, key, at, speech) => {
    const bag = kind === 'url' ? st.urls : st.addrs;
    const first = !bag[key];
    bag[key] = bag[key] ?? { n: 0, first: at, speech };
    bag[key].n++; bag[key].last = at;
    const item = { kind, key, at, speech, first };
    st.items.push(item);
    onItem(item);
  };
  const handle = (e) => {
    st.events++;
    const tn = st.types?.[e.type] ?? String(e.type);
    const sn = st.srcTypes?.[e.source?.type] ?? String(e.source?.type);
    const at = Number(e.time) + st.tickOffset;
    const p = e.params;
    if (!p) return;
    if (typeof p.url === 'string') {
      let u = null; try { u = new URL(p.url); } catch { /* not a URL */ }
      if (u && /^(https?|wss?):$/.test(u.protocol) && !LOOP_HOST.test(u.host)) record('url', `${u.protocol}//${u.host}${u.pathname}`, at, /speech/i.test(p.url));
    }
    if (NOT_CONNECTIONS.test(tn)) return;
    for (const [k, v] of Object.entries(p)) {
      if (!/address/i.test(k)) continue;
      for (const a of Array.isArray(v) ? v : [v]) {
        if (typeof a !== 'string' || !/^\[?[\da-f.:]+\]?:\d+$/i.test(a) || /^(127\.|\[::1\])/.test(a)) continue;
        record('addr', `${tn}/${sn} ${a}`, at, false);
      }
    }
  };
  const poll = () => {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size <= st.offset) return;
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - st.offset);
    readSync(fd, buf, 0, buf.length, st.offset);
    closeSync(fd);
    st.offset = size;
    const lines = (st.partial + buf.toString('utf8')).split('\n');
    st.partial = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('{"constants"')) {
        try {
          const c = JSON.parse(line.replace(/,$/, '') + '}').constants;
          st.types = Object.fromEntries(Object.entries(c.logEventTypes).map(([k, v]) => [v, k]));
          st.srcTypes = Object.fromEntries(Object.entries(c.logSourceType).map(([k, v]) => [v, k]));
          st.tickOffset = Number(c.timeTickOffset) || 0;
        } catch { /* keep going */ }
        continue;
      }
      if (!line.startsWith('{')) continue;
      let e = null;
      try { e = JSON.parse(line.replace(/\],?$/, '').replace(/,$/, '')); } catch { continue; }
      handle(e);
    }
  };
  const iv = setInterval(poll, 3000);
  return { st, poll, stop: () => { clearInterval(iv); poll(); } };
}

// ── Chrome launch ──────────────────────────────────────────────────────────
async function launchChrome({ offline, netlog, proxyPort }) {
  if (!PROFILE) throw new Error('--profile <dir> is required');
  mkdirSync(PROFILE, { recursive: true });
  rmSync(join(PROFILE, 'DevToolsActivePort'), { force: true });
  const switches = [
    `--user-data-dir=${PROFILE}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    // nothing audible, no microphone (E4-B's switch set)
    '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-audio-input',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(HEADED ? ['--window-size=420,320', '--window-position=1500,40'] : ['--headless=new']),
  ];
  if (offline) {
    switches.push(
      `--proxy-server=http://127.0.0.1:${proxyPort}`,
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
      '--disable-quic',
      '--disable-background-networking', '--disable-sync', '--no-pings', '--disable-domain-reliability',
      '--disable-client-side-phishing-detection', '--disable-default-apps', '--disable-extensions', '--disable-breakpad',
      '--metrics-recording-only',
    );
  }
  if (netlog) switches.push(`--log-net-log=${netlog}`, '--net-log-capture-mode=Default');
  const chromeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG ?? 'en_NZ.UTF-8' };
  mkdirSync(SCRATCH, { recursive: true });
  const errFd = openSync(resolve(SCRATCH, `chrome-stderr-${MODE}-${Date.now()}.log`), 'w');
  const proc = spawn(CHROME, [...switches, 'about:blank'], { stdio: ['ignore', errFd, errFd], env: chromeEnv });
  let wsPort = null;
  for (let i = 0; i < 300 && !wsPort; i++) { await sleep(100); const f = join(PROFILE, 'DevToolsActivePort'); if (existsSync(f)) wsPort = readFileSync(f, 'utf8').split('\n')[0]; }
  if (!wsPort) { try { proc.kill('SIGKILL'); } catch { /* gone */ } throw new Error('Chrome did not open its DevTools port'); }
  const { chromium } = require('playwright-core');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${wsPort}`);
  const context = browser.contexts()[0];
  return { proc, browser, context, version: browser.version(), switches: switches.map(scrub) };
}

// Guard bundle for one offline Chrome session. Before arm(): every signal is
// recorded; lsof, nettop, sandbox and TCC signals stop a strict session at
// once. After arm() (strict only): the baseline rules apply as well.
async function startGuards({ strict, baseline, onAbort }) {
  const g = { chromePid: null, pidsEver: new Set(), abortReason: null, armed: false, armedAt: null };
  const abort = (why) => { if (g.abortReason) return; g.abortReason = why; log(`STOP: ${why}`); onAbort(why); };
  const flag = (why, stopNow) => { if (strict && stopNow) abort(why); else log(`guard: ${why}`); };
  g.getPids = async () => { const p = await treePids(g.chromePid); for (const x of p) g.pidsEver.add(x); return p; };
  g.isTreePid = async (pid) => {
    if (!pid || g.chromePid == null) return false;
    if (g.pidsEver.has(pid)) return true;
    return (await g.getPids()).includes(pid);
  };
  const baseHosts = new Set(baseline?.proxyHosts ?? []);
  const baseUrls = new Set(baseline?.urlKeys ?? []);
  const baseAddrs = new Set(baseline?.addrKeys ?? []);
  g.sink = await startProxySink((e) => {
    const outside = !baseHosts.has(e.host);
    if (g.armed && outside) flag(`proxy request outside the baseline: ${e.method} ${e.host}`, true);
  });
  g.sockets = startSocketMonitor(g.getPids, (e) => flag(`external socket: ${e}`, true));
  g.nettop = startNettopMonitor(g.isTreePid, (e) => flag(`nettop external flow: ${e}`, true));
  g.sbx = startSandboxLogMonitor(g.isTreePid, (e) => flag(`sandbox denied network-outbound: ${e}`, true));
  g.tcc = startTccWatchdog((why) => abort(`TCC watchdog: ${why}`), g.isTreePid);
  g.attachNetLog = (file) => {
    g.netlog = startNetLogMonitor(file, (it) => {
      if (!g.armed || it.at < g.armedAt) return;
      if (it.speech) return flag(`NetLog speech URL after arming: ${it.key}`, true);
      if (it.kind === 'url' && !baseUrls.has(it.key)) return flag(`NetLog URL outside the baseline: ${it.key}`, true);
      if (it.kind === 'addr' && !baseAddrs.has(it.key)) return flag(`NetLog socket address outside the baseline: ${it.key}`, true);
    });
  };
  g.arm = () => { g.armed = true; g.armedAt = Date.now(); };
  await sleep(1500); // let the log streams attach
  g.stop = async () => { g.sockets.stop(); g.sbx.stop(); g.nettop.stop(); g.tcc.stop(); g.netlog?.stop(); await g.sink.close(); };
  g.summary = (since = 0) => {
    const nl = g.netlog?.st;
    const items = (nl?.items ?? []).filter((x) => x.at >= since);
    const tally = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
    return {
      proxyRequests: g.sink.seen.filter((e) => e.at >= since).length,
      proxyByHost: tally(g.sink.seen.filter((e) => e.at >= since), (e) => `${e.method} ${e.host}`),
      lsofSnapshots: g.sockets.seen.snapshots, lsofMaxSockets: g.sockets.seen.maxSockets, lsofSocketKinds: g.sockets.seen.kinds, lsofExternal: g.sockets.seen.external,
      nettopSamples: g.nettop.seen.samples, nettopFlowRowsAllProcesses: g.nettop.seen.rows, nettopTreeFlows: g.nettop.seen.tree, nettopTreeZeroByteUdp: g.nettop.seen.zeroByteUdp,
      sandboxDenials: g.sbx.seen.denials, sandboxDenialsOtherProcesses: g.sbx.seen.otherProcesses,
      tccTrips: g.tcc.seen.trips, tccPreflights: g.tcc.seen.preflight, tccOtherApps: g.tcc.seen.others,
      netlogEvents: nl?.events ?? 0,
      netlogUrls: tally(items.filter((x) => x.kind === 'url'), (x) => x.key),
      netlogAddrs: tally(items.filter((x) => x.kind === 'addr'), (x) => x.key),
      netlogSpeechUrls: items.filter((x) => x.speech).length,
      armedAt: g.armedAt ? new Date(g.armedAt).toISOString() : null,
      abortReason: g.abortReason,
    };
  };
  return g;
}

function killTree(g, chrome) {
  try { chrome?.proc.kill('SIGKILL'); } catch { /* gone */ }
  for (const p of g?.pidsEver ?? []) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

async function closeChrome(chrome) {
  try { await chrome.browser.close(); } catch { /* gone */ }
  for (let i = 0; i < 50 && chrome.proc.exitCode == null && chrome.proc.signalCode == null; i++) await sleep(100);
  try { chrome.proc.kill('SIGKILL'); } catch { /* gone */ }
}

const synthScore = (clip, text) => wer(clip.text, text ?? '').wer;

async function openHarnessPage(context, port) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.H && document.getElementById('status').textContent === 'ready');
  return page;
}
const recognise = (page, url, lang, processLocally) => page.evaluate(([u, o]) => window.H.recognise(u, o), [url, { ...REQ, lang, processLocally }]);
const available = (page, lang, processLocally) => page.evaluate(([l, p]) => window.H.available(l, p), [lang, processLocally]);

// On-device recognition of the synthetic clips (must work), then the cloud
// recogniser on two of them (must fail offline). Wall-clock windows recorded.
async function syntheticChecks(page, locale, clips, { cloudControl = true } = {}) {
  const tLocal0 = Date.now();
  const local = [];
  for (const c of clips) {
    const r = await recognise(page, `/synth/${c.id}`, locale, true);
    local.push({ id: c.id, voice: c.voice, script: c.text, hyp: r.text, wer: synthScore(c, r.text), errors: r.errors, audiostart: r.audiostart, lastFinal: r.lastFinal, nResults: r.nResults, finalWaitMs: Math.round(r.finalWaitMs ?? -1), clipMs: Math.round(r.clipMs ?? -1) });
  }
  const tLocal1 = Date.now();
  const cloud = [];
  if (cloudControl) {
    for (const c of clips.slice(0, 2)) {
      const r = await recognise(page, `/synth/${c.id}`, locale, false);
      cloud.push({ id: c.id, hyp: r.text, errors: r.errors, audiostart: r.audiostart });
    }
  }
  const tCloud1 = Date.now();
  const localOk = local.every((x) => x.hyp && x.wer <= 0.5 && !x.errors.some((e) => FATAL_ERRORS.test(e)));
  const cloudFailed = cloud.every((x) => !x.hyp && x.errors.length > 0);
  return { locale, local, cloud, localOk, cloudFailed, meanWer: local.reduce((a, x) => a + x.wer, 0) / local.length, windows: { local: [tLocal0, tLocal1], cloud: cloudControl ? [tLocal1, tCloud1] : null } };
}

function dirSizeKb(p) {
  try { return Number(String(execFileSync('du', ['-sk', p])).split('\t')[0]); } catch { return null; }
}
function sodaDirs(profile) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let ents = [];
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = join(d, e.name);
      if (/soda/i.test(e.name)) out.push({ dir: p.replace(profile, '<profile>'), kb: dirSizeKb(p), entries: (() => { try { return readdirSync(p).slice(0, 20); } catch { return []; } })() });
      else walk(p, depth + 1);
    }
  };
  walk(profile, 0);
  return out;
}
const osVersion = () => `macOS ${String(execFileSync('sw_vers', ['-productVersion'])).trim()} (${String(execFileSync('sw_vers', ['-buildVersion'])).trim()})`;

// ── modes ──────────────────────────────────────────────────────────────────
async function modeProbe() {
  const netlog = resolve(SCRATCH, `netlog-probe-${Date.now()}.json`);
  let chrome = null;
  const g = await startGuards({ strict: false, onAbort: () => killTree(g, chrome) });
  const server = await startPageServer({});
  chrome = await launchChrome({ offline: true, netlog, proxyPort: g.sink.port });
  g.chromePid = chrome.proc.pid;
  g.attachNetLog(netlog);
  log(`Chrome ${chrome.version} (offline guards), pid ${g.chromePid}`);
  const page = await openHarnessPage(chrome.context, server.port);
  const info = await page.evaluate(() => window.H.info());
  const avail = {};
  for (const L of [...new Set([...LOCALES, 'en-AU', 'en-GB'])]) avail[L] = { local: await available(page, L, true), cloud: await available(page, L, false) };
  log(JSON.stringify({ info, avail }));
  log(`idling ${PROBE_SECONDS} s under the guards …`);
  await sleep(PROBE_SECONDS * 1000);
  await closeChrome(chrome);
  await sleep(1500);
  await g.stop(); await server.close();
  console.log(JSON.stringify({ mode: 'probe', at: now(), chrome: chrome.version, info, avail, guards: g.summary() }, null, 1));
}

async function modeInstall() {
  const netlog = resolve(SCRATCH, `netlog-install-${Date.now()}.json`);
  const before = { profileKb: PROFILE && existsSync(PROFILE) ? dirSizeKb(PROFILE) : 0, soda: PROFILE && existsSync(PROFILE) ? sodaDirs(PROFILE) : [] };
  let chrome = null; let tripped = null;
  const tcc = startTccWatchdog((why) => { tripped = why; log(`STOP: TCC ${why}`); try { chrome?.proc.kill('SIGKILL'); } catch { /* gone */ } }, async () => true);
  await sleep(1500);
  const server = await startPageServer({});
  chrome = await launchChrome({ offline: false, netlog });
  const startedAt = now();
  log(`ONLINE install phase — Chrome ${chrome.version}, pid ${chrome.proc.pid}, headless ${!HEADED}`);
  const nl = startNetLogMonitor(netlog, () => {});
  const page = await openHarnessPage(chrome.context, server.port);
  const info = await page.evaluate(() => window.H.info());
  const probeLocales = [...new Set([...LOCALES, 'en-US', 'en-NZ', 'en-AU', 'en-GB'])];
  const availability = async () => { const o = {}; for (const L of probeLocales) o[L] = { local: await available(page, L, true), cloud: await available(page, L, false) }; return o; };
  const availBefore = await availability();
  log(`before: ${JSON.stringify(availBefore)}`);
  const installs = [];
  for (const L of LOCALES) {
    const t0 = Date.now();
    await page.evaluate(([l]) => { window.H.installLangs = [l]; window.H.installResult = null; }, [L]);
    await page.click('#install'); // a trusted click: install() runs with user activation
    let result = null;
    for (let i = 0; i < 1200 && !tripped; i++) { result = await page.evaluate(() => window.H.installResult); if (result && result !== 'pending') break; await sleep(1000); }
    let state = null;
    for (let i = 0; i < 600 && !tripped; i++) { state = await available(page, L, true); if (state === 'available') break; await sleep(2000); }
    installs.push({ locale: L, installResult: result, availableAfter: state, seconds: Math.round((Date.now() - t0) / 1000) });
    log(`install ${L}: install() → ${result}; available → ${state} after ${Math.round((Date.now() - t0) / 1000)} s`);
    log(`  now: ${JSON.stringify(await availability())}`);
  }
  const availAfter = await availability();
  log(`after: ${JSON.stringify(availAfter)}`);
  let components = null;
  try {
    const cp = await chrome.context.newPage();
    await cp.goto('chrome://components');
    await sleep(2000);
    const lines = await cp.evaluate(() => document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean));
    components = lines.filter((s, i, a) => /soda|speech/i.test(s) || /soda|speech/i.test(a[i - 1] ?? '') || /soda|speech/i.test(a[i - 2] ?? ''));
  } catch (e) { components = [`unavailable: ${e.message}`]; }
  await closeChrome(chrome);
  await sleep(1500);
  nl.stop(); tcc.stop(); await server.close();
  const after = { profileKb: dirSizeKb(PROFILE), soda: sodaDirs(PROFILE) };
  const tally = (arr) => arr.reduce((o, x) => { o[x.key] = (o[x.key] ?? 0) + 1; return o; }, {});
  const res = { mode: 'install', startedAt, finishedAt: now(), chrome: chrome.version, os: osVersion(), headless: !HEADED, switches: chrome.switches, info, availBefore, installs, availAfter, components, profileBefore: before, profileAfter: after, tcc: { trips: tcc.seen.trips, preflights: tcc.seen.preflight, otherApps: tcc.seen.others }, tripped, netlogUrls: tally(nl.st.items.filter((x) => x.kind === 'url')) };
  const out = resolve(REPORT_DIR, `chrome-ondevice-install_${gitSha()}${HEADED ? '_headed' : ''}.json`);
  writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
  log(`wrote ${out}`);
  if (tripped) process.exit(2);
}

async function modeProof() {
  const netlog = resolve(SCRATCH, `netlog-proof-${Date.now()}.json`);
  const synthPaths = Object.fromEntries(SYNTH.map((c) => [c.id, synth(c)]));
  let chrome = null;
  const g = await startGuards({ strict: false, onAbort: () => killTree(g, chrome) });
  const server = await startPageServer({ synthPaths });
  chrome = await launchChrome({ offline: true, netlog, proxyPort: g.sink.port });
  g.chromePid = chrome.proc.pid;
  g.attachNetLog(netlog);
  const startedAt = now();
  log(`OFFLINE proof — Chrome ${chrome.version}, headless ${!HEADED}, pid ${g.chromePid}`);
  const page = await openHarnessPage(chrome.context, server.port);
  const info = await page.evaluate(() => window.H.info());
  const res = { mode: 'offline-proof', startedAt, chrome: chrome.version, os: osVersion(), headless: !HEADED, switches: chrome.switches, request: REQ, info, locales: [] };
  const localWindows = []; const cloudWindows = [];
  for (const L of LOCALES) {
    const avail = { local: await available(page, L, true), cloud: await available(page, L, false) };
    log(`${L}: available local=${avail.local} cloud=${avail.cloud}`);
    const seq = await syntheticChecks(page, L, SYNTH);
    localWindows.push(seq.windows.local); cloudWindows.push(seq.windows.cloud);
    log(`${L}: on-device mean WER ${seq.meanWer.toFixed(3)} (ok ${seq.localOk}); cloud control failed ${seq.cloudFailed}: ${JSON.stringify(seq.cloud.map((c) => c.errors))}`);
    // Concurrency: the same clips across k pages at once, on-device only.
    const conc = {};
    for (const k of [4, 2]) {
      const t0 = Date.now();
      const pages = [page, ...await Promise.all(Array.from({ length: k - 1 }, () => openHarnessPage(chrome.context, server.port)))];
      const results = new Array(SYNTH.length);
      let next = 0;
      await Promise.all(pages.map(async (p) => { while (next < SYNTH.length) { const i = next++; const r = await recognise(p, `/synth/${SYNTH[i].id}`, L, true); results[i] = { id: SYNTH[i].id, hyp: r.text, wer: synthScore(SYNTH[i], r.text), errors: r.errors }; } }));
      for (const p of pages.slice(1)) await p.close();
      localWindows.push([t0, Date.now()]);
      conc[k] = { meanWer: results.reduce((a, x) => a + x.wer, 0) / results.length, identicalToSequential: results.filter((x, i) => x.hyp === seq.local[i].hyp).length, n: results.length, errors: results.flatMap((x) => x.errors), results };
      log(`${L}: k=${k} mean WER ${conc[k].meanWer.toFixed(3)}, identical to sequential ${conc[k].identicalToSequential}/${results.length}, errors ${JSON.stringify(conc[k].errors)}`);
    }
    const again = await syntheticChecks(page, L, SYNTH, { cloudControl: false });
    localWindows.push(again.windows.local);
    res.locales.push({ locale: L, available: avail, sequential: seq, repeat: { meanWer: again.meanWer, identical: again.local.filter((x, i) => x.hyp === seq.local[i].hyp).length, n: again.local.length }, concurrency: conc });
  }
  // Idle under the guards for a minute: Chrome's periodic background requests.
  await sleep(60000);
  await closeChrome(chrome);
  await sleep(2000);
  await g.stop(); await server.close();
  res.finishedAt = now();
  res.guards = g.summary();
  const items = g.netlog.st.items;
  const inWin = (t, ws) => ws.some((w) => w && t >= w[0] && t <= w[1] + 3000);
  const speech = items.filter((x) => x.speech);
  res.speechUrls = { total: speech.length, duringCloudControl: speech.filter((x) => inWin(x.at, cloudWindows)).length, duringOnDevice: speech.filter((x) => inWin(x.at, localWindows) && !inWin(x.at, cloudWindows)).length, keys: [...new Set(speech.map((x) => x.key))] };
  res.proxyDuringCloudControl = g.sink.seen.filter((e) => inWin(e.at, cloudWindows)).map((e) => `${e.method} ${e.host}`);
  const tcpExternal = Object.keys(g.netlog.st.addrs).filter((k) => !/\/UDP_/.test(k) && !/^UDP_/.test(k));
  // The baseline the DementiaBank run is held to: everything seen here except
  // the deliberate cloud-control speech requests.
  res.baseline = {
    urlKeys: Object.keys(g.netlog.st.urls).filter((k) => !g.netlog.st.urls[k].speech).sort(),
    addrKeys: Object.keys(g.netlog.st.addrs).sort(),
    proxyHosts: [...new Set(g.sink.seen.filter((e) => !inWin(e.at, cloudWindows)).map((e) => e.host))].sort(),
  };
  res.verdict = {
    onDeviceWorksOffline: res.locales.every((l) => l.available.local === 'available' && l.sequential.localOk),
    cloudFailsOffline: res.locales.every((l) => l.sequential.cloudFailed),
    noSpeechUrlOutsideCloudControl: res.speechUrls.total === res.speechUrls.duringCloudControl,
    noExternalSocket: res.guards.lsofExternal.length === 0 && res.guards.lsofSnapshots > 0,
    noNettopFlow: res.guards.nettopTreeFlows.length === 0 && res.guards.nettopSamples > 0,
    noSandboxDenial: res.guards.sandboxDenials.length === 0,
    noTcpToExternalAddress: tcpExternal.length === 0,
    noMicrophone: res.guards.tccTrips.length === 0,
  };
  res.tcpExternal = tcpExternal;
  res.verdict.pass = Object.values(res.verdict).every(Boolean);
  const out = resolve(REPORT_DIR, `chrome-ondevice-offline-proof_${gitSha()}${HEADED ? '_headed' : ''}.json`);
  writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
  log(`speech URLs ${JSON.stringify(res.speechUrls)}; proxy during cloud control ${JSON.stringify(res.proxyDuringCloudControl)}`);
  log(`verdict ${JSON.stringify(res.verdict)}`);
  log(`wrote ${out}`);
  if (!res.verdict.pass) process.exit(3);
}

const cacheKey = (bytes) => createHash('sha256').update(TOOL_VERSION).update('\0').update(LOCALE).update('\0').update(bytes).digest('hex');
const cacheFile = (key, dir = CACHE_DIR) => resolve(dir, `${key}.json`);

// 30 dementia + 30 control cuts, mulberry32(19), as §19C.9 fixes.
function robustSample(refs) {
  const rnd = mulberry32(19);
  const pick = (group) => {
    const idx = refs.map((r, i) => [r, i]).filter(([r]) => r.group === group).map(([, i]) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, 30);
  };
  return new Set([...pick('dementia'), ...pick('control')]);
}

function writeCsv(rows) {
  const cols = ['chunk_path', 'model', 'prompt', 'hyp_text', 'ms', 'cached', 'error'];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, [cols.join(','), ...rows.filter(Boolean).map((r) => cols.map((c) => csvEscape(r[c] ?? '')).join(','))].join('\n') + '\n');
}

async function modeRun() {
  if (!existsSync(REFERENCES)) { console.error(`references not found: ${REFERENCES}`); process.exit(1); }
  const refs = parseCsv(readFileSync(REFERENCES, 'utf8')).slice(0, LIMIT);
  const files = refs.map((r) => resolve(DATA_ROOT, r.chunk_path));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) { console.error(`${missing.length} audio files missing`); process.exit(1); }
  const keys = files.map((f) => cacheKey(readFileSync(f)));
  const only = ROBUST ? robustSample(refs) : ONLY;
  const inScope = (i) => !only || only.has(i);
  const todo = refs.map((r, i) => i).filter((i) => inScope(i) && !existsSync(cacheFile(keys[i])));
  const seconds = refs.reduce((s, r) => s + (Number(r.duration_s) || 0), 0);
  log(`Chrome on-device recogniser — locale ${LOCALE}, ${refs.length} chunks (${(seconds / 60).toFixed(1)} min audio), ${refs.length - todo.length} cached, ${todo.length} to run, concurrency ${CONCURRENCY}`);
  log(`  output ${OUT}`);
  log(`  cache  ${CACHE_DIR}`);
  if (MODE === 'dry') return;
  const baselineFile = argVal('--baseline');
  if (!baselineFile || !existsSync(baselineFile)) { console.error('--baseline <offline-proof json> is required for a DementiaBank run'); process.exit(1); }
  const proof = JSON.parse(readFileSync(baselineFile, 'utf8'));
  if (!proof.verdict?.pass || !proof.baseline) { console.error(`the offline proof ${baselineFile} did not pass`); process.exit(1); }
  mkdirSync(CACHE_DIR, { recursive: true });

  const startedAt = now();
  const netlog = resolve(SCRATCH, `netlog-run-${CACHE_TAG}-${Date.now()}.json`);
  const synthPaths = Object.fromEntries(SYNTH.slice(0, 2).map((c) => [c.id, synth(c)]));
  let chrome = null; let server = null;
  const g = await startGuards({ strict: true, baseline: proof.baseline, onAbort: () => { if (server) server.state.closed = true; killTree(g, chrome); } });
  server = await startPageServer({ cutPaths: files, synthPaths });
  chrome = await launchChrome({ offline: true, netlog, proxyPort: g.sink.port });
  g.chromePid = chrome.proc.pid;
  g.attachNetLog(netlog);
  log(`OFFLINE run — Chrome ${chrome.version}, headless ${!HEADED}, pid ${g.chromePid}, baseline ${baselineFile.replace(ROOT + '/', '')}`);
  const meta = { mode: 'run', locale: LOCALE, cacheTag: CACHE_TAG, tool: TOOL_VERSION, chrome: chrome.version, os: osVersion(), headless: !HEADED, concurrency: CONCURRENCY, request: REQ, baseline: baselineFile.replace(ROOT + '/', ''), startedAt, switches: chrome.switches, only: only ? only.size : null, robustness: ROBUST };
  const fail = async (why) => {
    log(`ABORT: ${why}`);
    server.state.closed = true; killTree(g, chrome);
    await sleep(2000); await g.stop(); await server.close();
    Object.assign(meta, { abortedAt: now(), abort: why, cutsServed: server.state.served, guards: g.summary() });
    writeFileSync(resolve(DATA_DIR, `${CACHE_TAG}_run-aborted-${Date.now()}.json`), JSON.stringify(meta, null, 1));
    process.exit(2);
  };

  // Preflight in this same Chrome, before any cut can be served.
  let pages;
  try {
    const page = await openHarnessPage(chrome.context, server.port);
    const availLocal = await available(page, LOCALE, true);
    if (availLocal !== 'available') return fail(`on-device pack not available for ${LOCALE}: ${availLocal}`);
    const pre = await syntheticChecks(page, LOCALE, SYNTH.slice(0, 2));
    meta.preflight = { availLocal, onDeviceMeanWer: pre.meanWer, localOk: pre.localOk, cloudFailed: pre.cloudFailed, cloudErrors: pre.cloud.map((c) => c.errors), at: now() };
    log(`preflight: on-device ok ${pre.localOk} (mean WER ${pre.meanWer.toFixed(3)}), cloud failed ${pre.cloudFailed} ${JSON.stringify(meta.preflight.cloudErrors)}`);
    if (!pre.localOk) return fail('preflight: on-device recognition of the synthetic clip failed');
    if (!pre.cloudFailed) return fail('preflight: the CLOUD recogniser worked — the network is not blocked');
    pages = [page, ...await Promise.all(Array.from({ length: CONCURRENCY - 1 }, () => openHarnessPage(chrome.context, server.port)))];
    await sleep(5000); // let the cloud control's NetLog entries land before arming
    g.netlog.poll();
    if (g.abortReason) return fail(g.abortReason);
  } catch (e) { return fail(`preflight error: ${e.message}`); }

  g.arm();
  server.state.gateOpen = true;
  meta.gateOpenedAt = now();
  log(`guards armed and gate open at ${meta.gateOpenedAt}: DementiaBank cuts may now be served`);
  const t0 = Date.now();
  let done = 0; let audioS = 0; let errors = 0;
  const runPass = async (pending, pass) => {
    let next = 0;
    await Promise.all(pages.map(async (p) => {
      while (!g.abortReason) {
        const k = next++;
        if (k >= pending.length) return;
        const i = pending[k];
        let r;
        try { r = await recognise(p, `/cut/${i}`, LOCALE, true); } catch (e) { g.abortReason ??= `page error: ${e.message.split('\n')[0]}`; return; }
        if (g.abortReason) return; // never cache a result produced after a stop signal
        const fatal = r.errors.find((e) => FATAL_ERRORS.test(e));
        if (fatal) { g.abortReason ??= `recogniser error "${fatal}" on cut ${i}`; return; }
        const nonRoutine = r.errors.filter((e) => e !== 'no-speech');
        const error = !r.audiostart ? 'no-audiostart' : nonRoutine.length ? nonRoutine.join('|') : null;
        const rec = { text: r.text, error, errors: r.errors, noSpeech: r.errors.includes('no-speech') && !r.text, empty: !r.text, lastFinal: r.lastFinal, nResults: r.nResults, endedEarly: r.endedEarly, finalWaitMs: Math.round(r.finalWaitMs ?? -1), wallMs: Math.round(r.wallMs ?? -1), clipMs: Math.round(r.clipMs ?? -1) };
        writeFileSync(cacheFile(keys[i]), JSON.stringify({ ...rec, locale: LOCALE, tool: TOOL_VERSION, chrome: chrome.version, concurrency: CONCURRENCY, retried: pass === 1, at: now() }));
        done++; audioS += Number(refs[i].duration_s) || 0; if (error) errors++;
        if (done % 50 === 0) { const el = (Date.now() - t0) / 1000; log(`  pass ${pass}: ${done} done (${errors} errors) — ${(audioS / 60).toFixed(1)} min audio in ${(el / 60).toFixed(1)} min wall, ${(audioS / el).toFixed(2)}× real time`); }
      }
    }));
  };
  await runPass(todo, 0);
  if (!g.abortReason) {
    const retry = refs.map((r, i) => i).filter((i) => { if (!inScope(i) || !existsSync(cacheFile(keys[i]))) return false; const c = JSON.parse(readFileSync(cacheFile(keys[i]), 'utf8')); return c.error && !c.retried; });
    if (retry.length) { log(`retrying ${retry.length} errored file(s) once`); await runPass(retry, 1); }
  }
  if (g.abortReason) return fail(g.abortReason);
  // Close the gate, then give the NetLog a last read before judging the session.
  server.state.gateOpen = false;
  meta.gateClosedAt = now();
  await sleep(5000);
  g.netlog.poll();
  if (g.abortReason) return fail(g.abortReason);
  Object.assign(meta, { finishedAt: now(), wallSeconds: Math.round((Date.now() - t0) / 1000), audioSecondsThisSession: Math.round(audioS), cutsThisSession: done, throughputXRealTime: done ? audioS / ((Date.now() - t0) / 1000) : null, cutsServed: server.state.served, cutRequestsRefusedOutsideGate: server.state.refused });
  await closeChrome(chrome);
  await sleep(2000);
  await g.stop(); await server.close();
  meta.guards = g.summary();
  meta.guardsWhileArmed = g.summary(g.armedAt);
  if (meta.guards.abortReason) return fail(meta.guards.abortReason);

  const cached = refs.map((r, i) => (inScope(i) && existsSync(cacheFile(keys[i])) ? JSON.parse(readFileSync(cacheFile(keys[i]), 'utf8')) : null));
  const ok = cached.filter((c) => c && !c.error);
  meta.counts = {
    cuts: only ? only.size : refs.length, withResult: ok.length, errorsLeftMissing: cached.filter((c) => c && c.error).length, notRun: refs.filter((r, i) => inScope(i) && !cached[i]).length,
    empty: ok.filter((c) => c.empty).length, noSpeechEvents: ok.filter((c) => c.noSpeech).length,
    endedEarly: ok.filter((c) => c.endedEarly).length, lastResultNotFinal: ok.filter((c) => c.text && c.lastFinal === false).length,
    finalWithin700ms: ok.filter((c) => c.finalWaitMs >= 0 && c.finalWaitMs <= 700).length,
    retried: cached.filter((c) => c && c.retried).length,
    errorKinds: cached.filter((c) => c && c.error).reduce((o, c) => { o[c.error] = (o[c.error] ?? 0) + 1; return o; }, {}),
  };
  const fw = ok.map((c) => c.finalWaitMs).filter((x) => x >= 0).sort((a, b) => a - b);
  meta.finalWaitMs = { median: fw[Math.floor(fw.length / 2)] ?? null, p90: fw[Math.floor(fw.length * 0.9)] ?? null, max: fw[fw.length - 1] ?? null };
  const runAt = cached.filter(Boolean).map((c) => c.at).sort();
  meta.cacheFirstAt = runAt[0]; meta.cacheLastAt = runAt[runAt.length - 1];
  writeFileSync(resolve(DATA_DIR, `${CACHE_TAG}_run-${Date.now()}.json`), JSON.stringify(meta, null, 1));
  if (ROBUST) {
    // Compare with the primary pass, cut by cut; aggregates only.
    const primaryDir = resolve(DATA_DIR, 'cache', TAG);
    const pairs = [...only].map((i) => {
      const a = existsSync(cacheFile(keys[i], primaryDir)) ? JSON.parse(readFileSync(cacheFile(keys[i], primaryDir), 'utf8')) : null;
      const b = cached[i];
      if (!a || !b || a.error || b.error) return null;
      const ref = refs[i].ref_text_fillers_kept || refs[i].ref_text;
      return { group: refs[i].group, identical: a.text === b.text, d: Math.abs(wer(ref, a.text).wer - wer(ref, b.text).wer), emptyA: !a.text, emptyB: !b.text };
    }).filter(Boolean);
    meta.robustness = {
      seed: 19, cuts: only.size, compared: pairs.length, identical: pairs.filter((p) => p.identical).length,
      meanAbsWerDiffPp: pairs.length ? (100 * pairs.reduce((s2, p) => s2 + p.d, 0)) / pairs.length : null,
      emptyPrimary: pairs.filter((p) => p.emptyA).length, emptyRerun: pairs.filter((p) => p.emptyB).length,
      byGroup: Object.fromEntries(['dementia', 'control'].map((gname) => { const ps = pairs.filter((p) => p.group === gname); return [gname, { compared: ps.length, identical: ps.filter((p) => p.identical).length, meanAbsWerDiffPp: ps.length ? (100 * ps.reduce((s2, p) => s2 + p.d, 0)) / ps.length : null }]; })),
    };
    writeFileSync(resolve(DATA_DIR, `${CACHE_TAG}_run-${Date.now()}.json`), JSON.stringify(meta, null, 1));
    log(`robustness: ${JSON.stringify(meta.robustness)}`);
    return;
  }
  if (only) { log(`--only run finished: ${JSON.stringify(meta.counts)}`); return; }
  const rows = refs.map((r, i) => {
    const c = cached[i];
    if (!c) return { chunk_path: r.chunk_path, model: MODEL_LABEL, prompt: '', hyp_text: '', ms: '', cached: false, error: 'not run' };
    return { chunk_path: r.chunk_path, model: MODEL_LABEL, prompt: '', hyp_text: c.error ? '' : c.text, ms: c.finalWaitMs >= 0 ? c.finalWaitMs : '', cached: true, error: c.error ?? '' };
  });
  writeCsv(rows);
  log(`Wrote ${OUT}: ${rows.length} rows; ${JSON.stringify(meta.counts)}`);
}

const main = { dry: modeRun, run: modeRun, probe: modeProbe, install: modeInstall, proof: modeProof }[MODE];
main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
