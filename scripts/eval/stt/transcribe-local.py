#!/usr/bin/env python3
"""
Transcribe the prepared DementiaBank/ADReSS chunks with a LOCAL open-weights
Whisper model (E9). This is the primary path: TalkBank's Ground Rules
(https://talkbank.org/0share/rules.html) forbid uploading password-protected
data to web services unless a non-storage option is in force, so the audio
never leaves this machine here. `transcribe.mjs` (the OpenAI API path, which is
byte-identical to what the app ships) is the secondary path and needs either
zero-data-retention on the account or supervisor sign-off.

Model default is `large-v2`: OpenAI has stated the hosted `whisper-1` is the
large-v2 family, so this is the closest local proxy for the production
fallback recogniser. `large-v3`, `medium`, `small`, `base`, `tiny` are allowed
for speed checks and are labelled as such in the output.

Output contract is IDENTICAL to transcribe.mjs so wer-report.mjs reads both:
  data/dementiabank/hyps_local-<model>.csv
  columns: chunk_path, model, prompt, hyp_text, ms, cached, error
  model column = "local:<model>" (a colon; file names use a hyphen)
Cache: data/dementiabank/cache/local-<model>/<sha256(model, prompt, bytes)>.json
Audio and hypothesis text stay under data/dementiabank/ (git-ignored).

Decoding: language en, beam 5, condition_on_previous_text False, no VAD
(ADReSS chunks are already VAD-cut), no initial prompt unless --prompt.

Usage:
  .venv/bin/python scripts/eval/stt/transcribe-local.py --dry-run
  .venv/bin/python scripts/eval/stt/transcribe-local.py                       # large-v2 over references.csv
  .venv/bin/python scripts/eval/stt/transcribe-local.py --model tiny --limit 20
  flags: --references <csv> --out <csv> --model M --device auto|cpu --compute-type int8
         --prompt "..." --limit N --resume --dry-run
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "dementiabank"
MODELS = ["large-v2", "large-v3", "medium", "small", "base", "tiny"]
# Rough CPU int8 real-time factors on an Apple-silicon laptop, used ONLY for the
# --dry-run time estimate; the run reports the measured RTF.
RTF_GUESS = {"tiny": 0.05, "base": 0.08, "small": 0.2, "medium": 0.5, "large-v2": 1.0, "large-v3": 1.0}
COLS = ["chunk_path", "model", "prompt", "hyp_text", "ms", "cached", "error"]


def wav_duration_seconds(path: Path) -> float | None:
    """Minimal RIFF parser, the same shape as transcribe.mjs wavDurationSeconds."""
    try:
        b = path.read_bytes()
        if b[0:4] != b"RIFF" or b[8:12] != b"WAVE":
            return None
        off, byte_rate, data_len = 12, None, None
        while off + 8 <= len(b):
            cid = b[off:off + 4]
            ln = struct.unpack("<I", b[off + 4:off + 8])[0]
            if cid == b"fmt ":
                byte_rate = struct.unpack("<I", b[off + 16:off + 20])[0]
            if cid == b"data":
                data_len = ln
                break
            off += 8 + ln + (ln % 2)
        return data_len / byte_rate if byte_rate and data_len is not None else None
    except Exception:
        return None


def cache_path(model: str, prompt: str, data: bytes) -> Path:
    h = hashlib.sha256()
    h.update(f"local:{model}".encode()); h.update(b"\0"); h.update(prompt.encode()); h.update(b"\0"); h.update(data)
    d = DATA / "cache" / f"local-{model}"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{h.hexdigest()}.json"


def read_refs(path: Path, limit: int | None) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return rows[:limit] if limit else rows


def read_existing(out: Path) -> dict[str, dict]:
    if not out.exists():
        return {}
    with out.open(newline="", encoding="utf-8") as f:
        return {r["chunk_path"]: r for r in csv.DictReader(f) if not r.get("error")}


def write_rows(out: Path, rows: list[dict]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            if r is not None:
                w.writerow({c: r.get(c, "") for c in COLS})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--references", default=str(DATA / "references.csv"))
    ap.add_argument("--out")
    ap.add_argument("--model", default="large-v2", choices=MODELS)
    ap.add_argument("--device", default="auto", choices=["auto", "cpu"])
    ap.add_argument("--compute-type", default="int8")
    ap.add_argument("--language", default="en")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--beam-size", type=int, default=5)
    ap.add_argument("--backend", default="faster-whisper", choices=["faster-whisper", "mlx"],
                    help="mlx = Apple-silicon GPU via mlx-whisper (needed on 8 GB machines: fp16 large-v2 on CPU swaps)")
    ap.add_argument("--repo", default="", help="mlx only: Hugging Face repo, e.g. mlx-community/whisper-large-v2-mlx-8bit")
    ap.add_argument("--label", default="", help="override the model label written to the CSV (default local:<model> or local:<repo suffix>)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--resume", action="store_true", help="keep rows already in --out; only transcribe the missing ones")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    refs_path = Path(a.references)
    if not refs_path.is_absolute():
        refs_path = ROOT / refs_path
    if not refs_path.exists():
        print(f"references file not found: {refs_path} (run prepare-adress.py first)", file=sys.stderr)
        return 1
    if a.backend == "mlx":
        if not a.repo:
            a.repo = f"mlx-community/whisper-{a.model}-mlx"
        suffix = a.repo.split("/")[-1].replace("whisper-", "", 1)
        model_label = a.label or f"local:{suffix}"
    else:
        model_label = a.label or f"local:{a.model}"
    cache_model = model_label.split(":", 1)[1]
    out = Path(a.out) if a.out else DATA / f"hyps_local-{cache_model}{'_prompt' if a.prompt else ''}.csv"
    if not out.is_absolute():
        out = ROOT / out

    refs = read_refs(refs_path, a.limit)
    files = [ROOT / r["chunk_path"] for r in refs]
    missing = [f for f in files if not f.exists()]
    if missing:
        print(f"{len(missing)} audio files missing, e.g. {missing[0]}", file=sys.stderr)
        return 1

    seconds = 0.0
    cached_n = 0
    for r, f in zip(refs, files):
        seconds += wav_duration_seconds(f) or float(r.get("duration_s") or 0)
        if cache_path(a.model, a.prompt, f.read_bytes()).exists():
            cached_n += 1
    existing = read_existing(out) if a.resume else {}
    to_do = len(files) - max(cached_n, len([f for f in refs if f["chunk_path"] in existing]))
    rtf = RTF_GUESS[a.model]
    print(f"Transcribe (local) — model {model_label}{' + prompt' if a.prompt else ''}, device {a.device}, compute {a.compute_type}")
    print(f"  {len(files)} chunks, {seconds / 60:.1f} min audio, {cached_n} already cached, {len(existing)} already in --out")
    print(f"  estimated wall time ≈ {seconds * rtf * (to_do / max(1, len(files))) / 60:.0f} min at guessed RTF {rtf} (measured RTF is printed at the end)")
    print(f"  cost US$0 — audio never leaves this machine")
    print(f"  output {out}")
    if a.dry_run:
        return 0

    t_load = time.perf_counter()
    if a.backend == "mlx":
        try:
            import mlx_whisper  # noqa: WPS433
        except ImportError:
            print("mlx-whisper is not installed in this interpreter; run .venv/bin/pip install mlx-whisper", file=sys.stderr)
            return 1
        # Warm the model holder once so the first clip is not charged with the load.
        mlx_whisper.transcribe(str(files[0]), path_or_hf_repo=a.repo, language=a.language, condition_on_previous_text=False, fp16=True, verbose=None)

        def decode(path: str) -> str:
            out = mlx_whisper.transcribe(path, path_or_hf_repo=a.repo, language=a.language,
                                         condition_on_previous_text=False, fp16=True, verbose=None,
                                         initial_prompt=a.prompt or None)
            return (out.get("text") or "").strip()
        print(f"  mlx repo {a.repo}")
    else:
        try:
            from faster_whisper import WhisperModel  # noqa: WPS433 (deliberately late: --dry-run needs no model)
        except ImportError:
            print("faster-whisper is not installed in this interpreter; run .venv/bin/pip install -r scripts/eval/stt/requirements.txt", file=sys.stderr)
            return 1
        model = WhisperModel(a.model, device=a.device, compute_type=a.compute_type)

        def decode(path: str) -> str:
            segments, _info = model.transcribe(
                path, language=a.language, beam_size=a.beam_size,
                condition_on_previous_text=False, vad_filter=False,
                initial_prompt=a.prompt or None,
            )
            return " ".join(s.text.strip() for s in segments).strip()
    print(f"  model loaded in {time.perf_counter() - t_load:.1f} s")

    rows: list[dict | None] = [None] * len(refs)
    done = billed = 0
    audio_s_decoded = 0.0
    decode_s = 0.0
    for i, (r, f) in enumerate(zip(refs, files)):
        cp_key = r["chunk_path"]
        if cp_key in existing:
            rows[i] = existing[cp_key]
            done += 1
            continue
        data = f.read_bytes()
        cp = cache_path(cache_model, a.prompt, data)
        try:
            if cp.exists():
                hit = json.loads(cp.read_text())
                rows[i] = {"chunk_path": cp_key, "model": model_label, "prompt": a.prompt, "hyp_text": hit["text"], "ms": hit["ms"], "cached": "true", "error": ""}
            else:
                t0 = time.perf_counter()
                text = decode(str(f))
                ms = round((time.perf_counter() - t0) * 1000)
                decode_s += ms / 1000
                audio_s_decoded += wav_duration_seconds(f) or 0.0
                cp.write_text(json.dumps({"text": text, "ms": ms, "model": model_label, "prompt": a.prompt or None, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
                rows[i] = {"chunk_path": cp_key, "model": model_label, "prompt": a.prompt, "hyp_text": text, "ms": ms, "cached": "false", "error": ""}
                billed += 1
        except Exception as e:  # keep going; failures are retried on the next run because they are not cached
            rows[i] = {"chunk_path": cp_key, "model": model_label, "prompt": a.prompt, "hyp_text": "", "ms": "", "cached": "false", "error": str(e)[:200]}
            print(f"  FAILED {cp_key}: {e}", file=sys.stderr)
        done += 1
        if done % 100 == 0 or done == len(refs):
            print(f"  {done}/{len(refs)} ({billed} decoded)")
            write_rows(out, rows)
    write_rows(out, rows)
    failed = sum(1 for r in rows if r and r.get("error"))
    rtf_measured = (decode_s / audio_s_decoded) if audio_s_decoded else None
    print(f"\nWrote {out}: {len(rows)} rows, {billed} newly decoded, {failed} failed"
          + (f"; measured RTF {rtf_measured:.3f} ({decode_s:.1f} s compute / {audio_s_decoded:.1f} s audio)" if rtf_measured else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
