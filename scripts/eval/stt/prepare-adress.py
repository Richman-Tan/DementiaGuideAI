#!/usr/bin/env python3
"""
Prepare ADReSS-2020 (DementiaBank) for the speech-recognition evaluation (E9).

Reads the CHAT transcripts, cleans the participant utterances into plain
reference text, cuts (or matches) the corresponding audio, and writes
data/dementiabank/references.csv + manifest.json. Everything under
data/dementiabank/ is git-ignored: the TalkBank ground rules forbid
redistribution, so only aggregate WER tables ever reach the repository.

Expected ADReSS-2020 layout (as distributed at
media.talkbank.org/dementia/English/0extra/ADReSS-2020):

  <root>/train/Full_wave_enhanced_audio/{cc,cd}/S001.wav
  <root>/train/Normalised_audio-chunks/{cc,cd}/S001-0.wav ...
  <root>/train/transcription/{cc,cd}/S001.cha
  <root>/train/{cc,cd}_meta_data.txt          ID ; age ; gender ; mmse
  <root>/test/Full_wave_enhanced_audio/S160.wav
  <root>/test/transcription/S160.cha
  <root>/test/meta_data.txt                   ID ; age ; gender ; Label ; mmse

  cc = control, cd = dementia. The test split carries the label in meta_data.

Join strategies (--join):

  utterance  (default) Cut every PAR utterance from the full enhanced audio
             using the CHAT time bullets (•start_end•, milliseconds). The
             reference for each cut is exactly the utterance text, so the
             alignment is by construction. Cuts are written with the stdlib
             wave module (no ffmpeg) to data/dementiabank/cuts/.
  chunks     Use the distributed Normalised_audio-chunks and match chunk i
             of speaker S to the i-th PAR utterance in time order. This
             assumes the chunking followed the transcript's PAR turns one to
             one, which the ADReSS README states (VAD-segmented, ≤10 s) but
             which we verify per speaker: if the counts differ the speaker is
             flagged in the manifest and skipped, not silently misaligned.

Reference cleaning (applied to the raw main tier, NOT pylangacq's cleaned
tokens, because pylangacq drops retraced words and the recogniser hears them):

  keep   retraced words ([/] [//] markers removed, words kept)
         fillers (&-uh → "uh", flagged; the JS normaliser strips them under
         the primary policy and keeps them under the secondary policy)
         omitted sounds inside a word — washin(g) → washing (the literature
         scores the full word)
  drop   time bullets, terminators (+... +/. etc.), overlap marks (+< ⌈⌉),
         actions (&=laughs), phonological fragments (&+fr), unintelligible
         (xxx yyy www), pause marks ((.) (..)), all remaining [...] codes
         including error codes and [: replacements], @suffixes, 0omissions,
         lengthening colons, and punctuation

Usage:
  .venv/bin/python scripts/eval/stt/prepare-adress.py --adress data/dementiabank/ADReSS-IS2020-data
  .venv/bin/python scripts/eval/stt/prepare-adress.py --self-test
  .venv/bin/python scripts/eval/stt/prepare-adress.py --jiwer-check
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import struct
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "dementiabank"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

FILLER_RE = re.compile(r"&-(\w+)")
TIME_BULLET_RE = re.compile(r"\x15?\d+_\d+\x15?")


def clean_main_tier(raw: str):
    """Return (words_without_fillers, words_with_fillers, n_unintelligible)."""
    s = TIME_BULLET_RE.sub(" ", raw)
    s = s.replace("\x15", " ")
    # fillers first so the & rules below don't eat them
    s = FILLER_RE.sub(lambda m: f" \x01{m.group(1)} ", s)
    s = re.sub(r"&=\S+", " ", s)          # actions &=laughs
    s = re.sub(r"&\+\S+", " ", s)         # phonological fragments &+fr
    s = re.sub(r"&\*\S+", " ", s)         # &*INV:  interposed comments
    s = re.sub(r"&(\w+)", r"\1", s)       # legacy &uh fillers (rare) → word
    s = re.sub(r"\[[^\]]*\]", " ", s)     # every [...] code, incl. [/] [//] [* ] [: ] [=! ]
    s = re.sub(r"\+[<>\"^,/.?!]*", " ", s)  # +< +... +/. +"/. +" +^ ++
    s = re.sub(r"\([.]+\)", " ", s)       # pauses (.) (..) (...)
    unintelligible = len(re.findall(r"\b(xxx|yyy|www)\b", s))
    s = re.sub(r"\b(xxx|yyy|www)\b", " ", s)
    s = re.sub(r"\b0\w*", " ", s)         # 0word omissions and bare 0
    s = re.sub(r"(\w)\(([a-z]+)\)", r"\1\2", s)  # washin(g) → washing
    s = re.sub(r"\((\w+)\)(\w)", r"\1\2", s)     # (a)bout → about
    s = re.sub(r"@\S*", "", s)            # word@s @l @c suffixes
    s = s.replace("_", " ")               # ice_cream
    s = re.sub(r"[<>‹›⌈⌉⌊⌋„‡^:]", " ", s)  # scopes, overlaps, lengthening, trailing-off
    s = re.sub(r"[.?!,;\"“”]", " ", s)
    words = [w for w in s.split() if w]
    with_fillers = [w.lstrip("\x01") for w in words]
    without = [w for w in words if not w.startswith("\x01")]
    return without, with_fillers, unintelligible


def parse_id_lines(cha_path: Path):
    """@ID: lang|corpus|code|age|sex|group|SES|role|education|custom| → dict by code."""
    out = {}
    for line in cha_path.read_text(encoding="utf8", errors="replace").splitlines():
        if line.startswith("@ID:"):
            fields = line.split(":", 1)[1].strip().split("|")
            if len(fields) >= 8:
                out[fields[2]] = {"age": fields[3], "sex": fields[4], "group": fields[5], "role": fields[7],
                                  "custom": fields[9] if len(fields) > 9 else ""}
    return out


def read_utterances(cha_path: Path):
    import pylangacq  # noqa: WPS433 (venv-only dependency)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reader = pylangacq.read_chat(str(cha_path), strict=False)
    rows = []
    for u in reader.utterances():
        raw = u.tiers.get(u.participant, "")
        t0, t1 = (u.time_marks or (None, None))
        without, with_f, unint = clean_main_tier(raw)
        rows.append({"speaker": u.participant, "t0": t0, "t1": t1, "raw": raw,
                     "ref": " ".join(without), "ref_fillers": " ".join(with_f), "unintelligible": unint})
    return rows


def read_meta(path: Path):
    """ID ; age ; gender ; [Label ;] mmse — header line optional, whitespace-tolerant."""
    meta = {}
    if not path.exists():
        return meta
    for line in path.read_text(encoding="utf8", errors="replace").splitlines():
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 3 or parts[0].lower() in ("id", "") or not re.match(r"S\d+", parts[0]):
            continue
        rec = {"age": parts[1], "gender": parts[2]}
        if len(parts) >= 5:
            rec["label"] = parts[3]
            rec["mmse"] = parts[4]
        else:
            rec["mmse"] = parts[3] if len(parts) > 3 else ""
        meta[parts[0]] = rec
    return meta


def cut_wav(src: Path, t0_ms: int, t1_ms: int, dst: Path):
    with wave.open(str(src), "rb") as w:
        rate, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        start = int(rate * t0_ms / 1000)
        end = int(rate * t1_ms / 1000)
        w.setpos(min(start, w.getnframes()))
        frames = w.readframes(max(0, min(end, w.getnframes()) - start))
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as o:
        o.setnchannels(ch)
        o.setsampwidth(sw)
        o.setframerate(rate)
        o.writeframes(frames)
    return (end - start) / rate


def wav_duration(path: Path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


def discover(root: Path):
    """Yield (split, group, speaker_id, cha_path, full_wav_path|None, chunks_dir|None)."""
    for split in ("train", "test"):
        base = root / split
        if not base.exists():
            continue
        tdir = base / "transcription"
        cha_files = sorted(tdir.rglob("*.cha"))
        for cha in cha_files:
            sid = cha.stem
            group = cha.parent.name if cha.parent.name in ("cc", "cd") else None
            rel = cha.parent.relative_to(tdir)
            full = base / "Full_wave_enhanced_audio" / rel / f"{sid}.wav"
            chunks = base / "Normalised_audio-chunks" / rel
            yield split, group, sid, cha, (full if full.exists() else None), (chunks if chunks.exists() else None)


def prepare(root: Path, join: str, out_dir: Path, participant: str = "PAR"):
    out_dir.mkdir(parents=True, exist_ok=True)
    refs, skipped, per_speaker = [], [], {}
    metas = {}
    for split in ("train", "test"):
        for name in ("cc_meta_data.txt", "cd_meta_data.txt", "meta_data.txt"):
            p = root / split / name
            for sid, rec in read_meta(p).items():
                rec = dict(rec)
                if name.startswith("cc"):
                    rec["group"] = "control"
                elif name.startswith("cd"):
                    rec["group"] = "dementia"
                else:
                    rec["group"] = {"1": "dementia", "0": "control"}.get(rec.get("label", ""), rec.get("label", ""))
                rec["split"] = split
                metas[sid] = rec
    for split, group_dir, sid, cha, full, chunks in discover(root):
        meta = metas.get(sid, {})
        group = meta.get("group") or {"cc": "control", "cd": "dementia"}.get(group_dir or "", "unknown")
        ids = parse_id_lines(cha)
        utts = [u for u in read_utterances(cha) if u["speaker"] == participant]
        timed = [u for u in utts if u["t0"] is not None and u["t1"] is not None and u["ref"]]
        per_speaker[sid] = {"split": split, "group": group, "utterances": len(utts), "timed": len(timed)}
        if join == "utterance":
            if full is None:
                skipped.append({"speaker": sid, "reason": "no full audio"})
                continue
            for n, u in enumerate(timed):
                dst = out_dir / "cuts" / f"{sid}-{n}.wav"
                dur = cut_wav(full, u["t0"], u["t1"], dst)
                refs.append(row(sid, split, group, meta, ids, n, dst, u, dur))
        else:  # chunks
            if chunks is None:
                skipped.append({"speaker": sid, "reason": "no chunk dir"})
                continue
            files = sorted(chunks.glob(f"{sid}-*.wav"), key=lambda p: int(p.stem.split("-")[-1]))
            if len(files) != len(timed):
                skipped.append({"speaker": sid, "reason": f"chunk/utterance count mismatch {len(files)} vs {len(timed)}"})
                continue
            for n, (f, u) in enumerate(zip(files, timed)):
                refs.append(row(sid, split, group, meta, ids, n, f, u, wav_duration(f)))
    write_outputs(refs, skipped, per_speaker, out_dir, join, root)
    return refs, skipped


def row(sid, split, group, meta, ids, n, path, u, dur):
    par = ids.get("PAR", {})
    mmse = meta.get("mmse", "") or par.get("custom", "")
    return {
        "chunk_path": str(path.relative_to(ROOT)) if str(path).startswith(str(ROOT)) else str(path),
        "speaker_id": sid, "split": split, "group": group, "mmse": mmse,
        "age": meta.get("age", "") or par.get("age", ""), "gender": meta.get("gender", "") or par.get("sex", ""),
        "chunk_index": n, "t0": u["t0"], "t1": u["t1"], "duration_s": round(dur, 3),
        "ref_text": u["ref"], "ref_text_fillers_kept": u["ref_fillers"], "unintelligible": u["unintelligible"],
    }


def write_outputs(refs, skipped, per_speaker, out_dir, join, root):
    cols = ["chunk_path", "speaker_id", "split", "group", "mmse", "age", "gender", "chunk_index", "t0", "t1",
            "duration_s", "ref_text", "ref_text_fillers_kept", "unintelligible"]
    with open(out_dir / "references.csv", "w", newline="", encoding="utf8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in refs:
            w.writerow(r)
    manifest = {
        "preparedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "source": str(root), "join": join,
        "chunks": len(refs), "speakers": len({r["speaker_id"] for r in refs}),
        "groups": {g: len({r["speaker_id"] for r in refs if r["group"] == g}) for g in sorted({r["group"] for r in refs})},
        "audioSeconds": round(sum(r["duration_s"] for r in refs), 1),
        "refWords": sum(len(r["ref_text"].split()) for r in refs),
        "skipped": skipped, "perSpeaker": per_speaker,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"wrote {out_dir/'references.csv'}: {manifest['chunks']} chunks, {manifest['speakers']} speakers, "
          f"{manifest['audioSeconds']} s audio, {manifest['refWords']} reference words; skipped {len(skipped)}")


# ── self-test on the synthetic fixture ───────────────────────────────────────

def make_synthetic_wav(path: Path, seconds: float, rate: int = 16000, tone_hz: float = 220.0):
    import math
    path.parent.mkdir(parents=True, exist_ok=True)
    n = int(seconds * rate)
    frames = bytearray()
    for i in range(n):
        v = int(8000 * math.sin(2 * math.pi * tone_hz * i / rate))
        frames += struct.pack("<h", v)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))


def self_test():
    import shutil
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="adress-selftest-"))
    root = tmp / "ADReSS"
    (root / "train" / "transcription" / "cd").mkdir(parents=True)
    (root / "train" / "Full_wave_enhanced_audio" / "cd").mkdir(parents=True)
    (root / "train" / "Normalised_audio-chunks" / "cd").mkdir(parents=True)
    shutil.copy(FIXTURES / "synthetic.cha", root / "train" / "transcription" / "cd" / "S999.cha")
    (root / "train" / "cd_meta_data.txt").write_text("ID   ; age ; gender ;  mmse\nS999 ;  71 ;   1    ;  18\n")
    make_synthetic_wav(root / "train" / "Full_wave_enhanced_audio" / "cd" / "S999.wav", 20.0)
    # two tiny 1-second chunks for the transcribe.mjs smoke test + a chunk set for --join chunks
    for i in range(6):
        make_synthetic_wav(root / "train" / "Normalised_audio-chunks" / "cd" / f"S999-{i}.wav", 1.0, tone_hz=220 + 40 * i)

    # 1. cleaning
    utts = read_utterances(root / "train" / "transcription" / "cd" / "S999.cha")
    assert len(utts) == 8, f"expected 8 utterances, got {len(utts)}"
    par = [u for u in utts if u["speaker"] == "PAR"]
    assert len(par) == 6, len(par)
    assert par[0]["ref"] == "well the the the little boy is he's getting cookies", par[0]["ref"]
    assert par[0]["ref_fillers"] == "well the uh the the little boy is he's getting cookies", par[0]["ref_fillers"]
    assert par[1]["ref"] == "and the stool is falling over" and par[1]["unintelligible"] == 1, par[1]
    assert par[2]["ref"] == "the mother's washing dishes and the water's running", par[2]["ref"]
    assert par[3]["ref"] == "it's it's overflowing", par[3]["ref"]
    assert par[4]["ref"] == "um the girl is reaching for a cookie", par[4]["ref"]  # bare "um" is a word, not &-um
    assert par[5]["ref"] == "I don't know what else", par[5]["ref"]
    assert par[0]["t0"] == 2100 and par[0]["t1"] == 6300

    # 2. utterance join → cuts
    out = tmp / "out-utt"
    refs, skipped = prepare(root, "utterance", out)
    assert len(refs) == 6 and not skipped, (len(refs), skipped)
    assert refs[0]["group"] == "dementia" and refs[0]["mmse"] == "18" and refs[0]["age"] == "71"
    assert abs(refs[0]["duration_s"] - 4.2) < 0.01, refs[0]["duration_s"]
    assert (out / "cuts" / "S999-0.wav").exists()
    assert json.loads((out / "manifest.json").read_text())["speakers"] == 1

    # 3. chunk join with matching counts, then a deliberate mismatch
    out2 = tmp / "out-chunks"
    refs2, skipped2 = prepare(root, "chunks", out2)
    assert len(refs2) == 6 and not skipped2, (len(refs2), skipped2)
    (root / "train" / "Normalised_audio-chunks" / "cd" / "S999-6.wav").write_bytes(
        (root / "train" / "Normalised_audio-chunks" / "cd" / "S999-0.wav").read_bytes())
    refs3, skipped3 = prepare(root, "chunks", tmp / "out-mismatch")
    assert len(refs3) == 0 and skipped3 and "mismatch" in skipped3[0]["reason"], skipped3

    # 4. leave two synthetic 1-second WAVs where transcribe.mjs can find them for its smoke test
    smoke = DATA / "selftest"
    smoke.mkdir(parents=True, exist_ok=True)
    for i in range(2):
        shutil.copy(root / "train" / "Normalised_audio-chunks" / "cd" / f"S999-{i}.wav", smoke / f"S999-{i}.wav")
    with open(smoke / "references.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(refs[0].keys()))
        w.writeheader()
        for i in range(2):
            r = dict(refs[i])
            r["chunk_path"] = str((smoke / f"S999-{i}.wav").relative_to(ROOT))
            w.writerow(r)
    shutil.rmtree(tmp)
    print("self-test OK: 8 utterances (6 PAR), codes stripped as expected, utterance cuts 6/6, chunk join 6/6, mismatch flagged")


def jiwer_check():
    import jiwer
    pairs = [
        ("the cat sat on the mat", "the cat sit on mat"),
        ("she is reaching for a cookie", "she is reaching up for a cookie jar"),
        ("well uh the boy is uh getting cookies", "well the boy is getting cookies"),
    ]
    for ref, hyp in pairs:
        m = jiwer.process_words(ref, hyp)
        print(f"ref={ref!r} hyp={hyp!r} → wer={m.wer:.6f} S={m.substitutions} D={m.deletions} I={m.insertions} H={m.hits}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--adress", help="root of the ADReSS-2020 download")
    ap.add_argument("--join", choices=["utterance", "chunks"], default="utterance")
    ap.add_argument("--out", default=str(DATA))
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--jiwer-check", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return
    if a.jiwer_check:
        jiwer_check()
        return
    if not a.adress:
        ap.error("--adress <dir> is required (or --self-test / --jiwer-check)")
    prepare(Path(a.adress), a.join, Path(a.out))


if __name__ == "__main__":
    main()
