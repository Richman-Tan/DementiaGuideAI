#!/usr/bin/env python3
"""
Figures for the Part IV final report (Richman Tan, 2026).

Every chart reads committed artefacts only: nothing under git-ignored paths
(data/dementiabank/, unity-avatar/**/TestResults/). Where a number exists only
in a committed results .md table, it is parsed from that table; the one value
that has no machine-readable source is quoted beside a comment naming the file
and section it comes from.

  F1  fig3_1_architecture.png      system architecture + one spoken turn
  F3  fig5_1_retrieval_effect.png  production vs no-retrieval vs oracle (deterministic)
  F4  fig5_2_safety_ablation.png   prompt generations P0, v1, v2-SAFETY, v2
  F5  fig5_3_latency_stages.png    per-stage latency box plots, plus the October
                                   headless spoken turns (E4-S)
  F7  fig5_4_wer_fallback.png      whisper-1 WER by group and input condition
  F8  fig5_5_asr_degradation.png   retrieval vs injected ASR error
  F9  fig5_6_cost_per_turn.png     cost of a typed and a spoken turn
  F10 fig3_3_coarticulation.png    lip-sync pipeline: text to blendshape curves (schematic)
  F12 fig4_1_evaluation_design.png evaluation design: inputs, conditions, measures, checks (schematic)
  F13 fig5_5_checkback.png        check-back rules on garbled safety questions (E9-K)

  (F6, the articulation-checks chart, was dropped: the per-fixture counts are
  reported as Table 5.3, read from docs/report/eval/lipsync/README.md.)
  (F11, the report's Figure 5.3, is not in the compendium: it plots each carer's
  usability-study results, which may be assessed but not published; README section 6.)

Usage:
  python3 scripts/report/make-report-figures.py            # all figures
  python3 scripts/report/make-report-figures.py --only F3,F7
  python3 scripts/report/make-report-figures.py --only F5 --yardstick-ms 3000   # F5 as in the report, with the 3 s yardstick

Requires matplotlib and numpy (pandas is not needed).
"""
import argparse
import csv
import json
import math
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Patch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
EVAL = ROOT / "docs/report/eval"
OUT = ROOT / "docs/report/figures/final"

CM = 1 / 2.54
FULL_W = 16 * CM
HALF_W = 8 * CM

# ── style ──────────────────────────────────────────────────────────────────
# Greyscale-legible: four grey levels plus one blue accent whose luminance
# (~114/255) sits between the dark and mid greys, and hatching wherever two
# fills could be confused in print.
INK = "#1a1a1a"
G_DARK = "#3d3d3d"
G_MID = "#8f8f8f"
G_LIGHT = "#c9c9c9"
G_XLIGHT = "#ececec"
ACCENT = "#2f74c0"
WHITE = "#ffffff"


def _font_family():
    names = {f.name for f in font_manager.fontManager.ttflist}
    return "Times New Roman" if "Times New Roman" in names else "DejaVu Serif"


plt.rcParams.update({
    "font.family": "serif",
    "font.serif": [_font_family(), "DejaVu Serif"],
    "mathtext.fontset": "stix",
    "font.size": 9,
    "axes.labelsize": 9,
    "axes.titlesize": 9,
    "xtick.labelsize": 8.5,
    "ytick.labelsize": 8.5,
    "legend.fontsize": 8,
    "axes.edgecolor": INK,
    "axes.labelcolor": INK,
    "xtick.color": INK,
    "ytick.color": INK,
    "text.color": INK,
    "axes.linewidth": 0.6,
    "xtick.major.width": 0.6,
    "ytick.major.width": 0.6,
    "hatch.linewidth": 0.6,
    "hatch.color": INK,
    "legend.frameon": False,
    "savefig.dpi": 300,
})

_SOURCES = []  # paths read by the figure being built


def src(path):
    """Register and return an artefact path (must be tracked by git)."""
    p = ROOT / path if not isinstance(path, Path) else path
    rel = p.relative_to(ROOT).as_posix()
    tracked = subprocess.run(["git", "ls-files", "--error-unmatch", rel], cwd=ROOT,
                             capture_output=True).returncode == 0
    if not tracked:
        sys.exit(f"refusing to read {rel}: not a committed artefact")
    if rel not in _SOURCES:
        _SOURCES.append(rel)
    return p


def head_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                              capture_output=True, text=True).stdout.strip()
    except OSError:
        return "unknown"


def save(fig, name):
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / name
    meta = {"Software": "scripts/report/make-report-figures.py",
            "Source": "; ".join(_SOURCES), "Comment": f"repo HEAD {head_sha()}"}
    fig.savefig(out, dpi=300, metadata=meta, facecolor="white")
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)}")
    for s in _SOURCES:
        print(f"    source: {s}")
    _SOURCES.clear()


def clean_axes(ax, grid_axis="y"):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.set_axisbelow(True)
    if grid_axis:
        getattr(ax, f"{grid_axis}axis").grid(True, color="#e3e3e3", lw=0.5)


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"),) * 2
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def md_table(path, heading_regex):
    """Rows (list of cell lists, header first) of the first table after a heading."""
    lines = Path(path).read_text().splitlines()
    start = next(i for i, l in enumerate(lines) if re.search(heading_regex, l))
    rows = []
    for l in lines[start + 1:]:
        if l.startswith("|"):
            cells = [c.strip() for c in l.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                rows.append(cells)
        elif rows:
            break
    return rows


def count(cell):
    """'95.6% (43/45)' -> (43, 45); '— (no markers)' -> None."""
    m = re.search(r"\((\d+)/(\d+)\)", cell)
    return (int(m.group(1)), int(m.group(2))) if m else None


# ════════════════════════════════════════════════════════════════════════════
# F1 — architecture
# ════════════════════════════════════════════════════════════════════════════
def fig_architecture():
    # Components traced in docs/eval/evaluation-plan.md §2.1 and checked against
    # the code on 2026-09-30: apps/web/src/services/transport.js (proxy routes),
    # apps/web/src/services/openaiClient.js:160 (match_chunks called from the client),
    # apps/web/src/services/ttsClient.js (ElevenLabs REST /with-timestamps via
    # /api/eleven-tts), apps/api/api/{chat,embed,transcribe,eleven-tts,speech}.js,
    # packages/core/{rag,voice,tts,lipsync}, packages/core/rag/ragConfig.js,
    # unity-avatar/.../Scripts/{NativeBridgeReceiver,AvatarRouter}.cs and
    # LipSync/CoarticulationEngine.cs.
    for p in ("docs/eval/evaluation-plan.md", "apps/web/src/services/transport.js",
              "apps/web/src/services/openaiClient.js", "apps/web/src/services/ttsClient.js",
              "packages/core/rag/ragConfig.js"):
        # (The Unity scripts live in the unity-avatar/UnityAvatarProject submodule,
        # so they are cited in the comment above rather than registered here.)
        src(p)

    W, H = 160, 130  # drawing units = mm
    fig = plt.figure(figsize=(FULL_W, FULL_W * H / W))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    # Printed at 16 cm, so these are the sizes on the page; 8 pt minimum for legibility
    # (examiner, 10 Oct 2026: the earlier 6 to 7 pt labels were too small at print size).
    BODY = 8.0   # pt, box body text
    HEAD = 9.0   # pt, box titles
    NOTE = 7.6   # pt, connector labels and notes

    def box(x, y, w, h, title=None, lines=(), fc=WHITE, ec=INK, lw=0.8, ls="-",
            title_size=HEAD, line_size=BODY, pad=2.0, title_weight="bold", round_=1.2):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={round_}",
                                    fc=fc, ec=ec, lw=lw, ls=ls, zorder=2))
        ty = y + h - pad
        if title:
            ax.text(x + pad, ty, title, ha="left", va="top", fontsize=title_size,
                    fontweight=title_weight, zorder=3)
            ty -= title_size * 0.56
        for ln in lines:
            ax.text(x + pad, ty, ln, ha="left", va="top", fontsize=line_size, zorder=3)
            ty -= line_size * 0.50

    def step(x, y, n, r=2.1, fc=ACCENT):
        ax.add_patch(Circle((x, y), r, fc=fc, ec="none", zorder=6))
        ax.text(x, y - 0.1, str(n), ha="center", va="center", fontsize=7.6, color=WHITE,
                fontweight="bold", zorder=7)

    def arrow(p0, p1, both=True, ls="-", color=INK, lw=0.9):
        ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="<|-|>" if both else "-|>",
                                     mutation_scale=7, lw=lw, ls=ls, color=color, zorder=4,
                                     shrinkA=0, shrinkB=0))

    # ── client device ──────────────────────────────────────────────────────
    box(2, 21, 84, 107, fc="#f6f6f6", ec=G_MID, ls=(0, (4, 2)))
    ax.text(4.2, 126.6, "Client device (browser or phone)", ha="left", va="top",
            fontsize=HEAD, fontstyle="italic", color=G_DARK, zorder=3)

    box(4.5, 99, 39, 22.5, "Web app",
        ["Vite + React", "STT: Web Speech API", "Avatar: Unity WebGL"])
    box(45, 99, 39, 22.5, "Mobile app",
        ["Expo / React Native", "STT: platform recogniser", "Avatar: Unity library"])
    step(44.25, 121.5, 1)

    # packages/core
    box(4.5, 49, 79.5, 46.5, "packages/core: shared code in both apps",
        fc=G_XLIGHT, ec=INK)
    box(6.5, 71, 37, 18.5, "rag", ["top 5, family cap", "prompt v2-nz-safety", "citation check"])
    box(45, 71, 37, 18.5, "voice", ["speculative retrieval", "sentence splitting"])
    box(6.5, 51, 37, 18, "tts", ["numbers to words", "citations removed"])
    box(45, 51, 37, 18, "lipsync", ["timings → visemes", "G2P: CMUdict + rules"])
    step(40.6, 86.6, 4)
    step(79.1, 86.6, 6)
    step(79.1, 66.1, 8)

    # Unity avatar
    box(4.5, 23.5, 79.5, 22.5, "Unity avatar (C#, both apps)",
        ["Viseme events and audio from the bridge",
         "Co-articulation engine (Cohen–Massaro), 90 Hz",
         "Blendshapes; characters Aaron and Ariana"])
    step(80.6, 43.0, 9)
    arrow((63.5, 51), (63.5, 46), both=False)  # lipsync -> Unity

    # ── apps/api ───────────────────────────────────────────────────────────
    box(95, 50, 24, 62, "apps/api",
        ["serverless", "holds keys", "", "/transcribe", "/embed", "/chat", "/eleven-tts",
         "/speech", "", "access codes", "usage meter"])

    # ── providers ──────────────────────────────────────────────────────────
    box(127, 86, 31, 42, "OpenAI",
        ["gpt-4o: chat", "text-embedding-", "  3-small", "whisper-1: fallback",
         "  speech to text", "tts-1: fallback", "  voice, no timings"])
    box(127, 52, 31, 30, "ElevenLabs",
        ["/with-timestamps", "one call per", "  sentence", "audio + timings"])
    box(127, 21, 31, 27, "Supabase",
        ["Postgres + pgvector", "453 chunks", "match_chunks:", "  hybrid search",
         "study tables"])

    # ── connections ────────────────────────────────────────────────────────
    arrow((86, 81), (95, 81))                         # client <-> apps/api
    for i, n in enumerate((2, 5, 7)):
        step(90.5, 76.6 - i * 4.8, n)
    arrow((119, 104), (127, 104))                     # apps/api <-> OpenAI
    step(123, 108, 2)
    step(123, 112.6, 5)
    arrow((119, 95), (127, 95), ls=(0, (2, 1.5)), lw=0.7, color=G_DARK)   # whisper fallback
    step(123, 91.2, 1, fc=G_MID)
    arrow((119, 66), (127, 66))                       # apps/api <-> ElevenLabs
    step(123, 70.2, 7)
    arrow((86, 33), (127, 33))                        # client <-> Supabase, direct
    ax.text(106, 34.6, "direct from the client", ha="center", va="bottom",
            fontsize=NOTE, color=G_DARK)
    step(106, 30.0, 3)
    ax.text(95.5, 47.6, "BYO-key builds call\nproviders directly",
            ha="left", va="top", fontsize=NOTE, fontstyle="italic", color=G_DARK)

    # ── one spoken turn ────────────────────────────────────────────────────
    ax.plot([2, 158], [18, 18], color=G_LIGHT, lw=0.6)
    ax.text(2, 16.6, "One spoken turn", ha="left", va="top", fontsize=HEAD, fontweight="bold")
    steps = [
        (1, "speech to text"),
        (2, "embed the question"),
        (3, "match_chunks: top 5 passages"),
        (4, "prompt with numbered passages"),
        (5, "gpt-4o streams the answer"),
        (6, "split into sentences"),
        (7, "ElevenLabs voice, per sentence"),
        (8, "timings → viseme timeline"),
        (9, "lip-synced face and audio"),
    ]
    col_x = (4, 57, 110)
    for i, (n, text) in enumerate(steps):
        x = col_x[i // 3]
        y = 11.0 - (i % 3) * 4.4
        step(x, y, n, r=1.9)
        ax.text(x + 3.0, y, text, ha="left", va="center", fontsize=BODY)

    save(fig, "fig3_1_architecture.png")


# ════════════════════════════════════════════════════════════════════════════
# F3 — effect of retrieval (deterministic measures)
# ════════════════════════════════════════════════════════════════════════════
def fig_retrieval_effect():
    samples = md_table(src("docs/report/eval/final/tables_samples.md"),
                       r"^## Table A")
    seeded = md_table(src("docs/report/eval/final/tables_seeded.md"), r"^## Table A")

    def col(rows, name):
        hdr = rows[0]
        j = hdr.index(name)
        return {r[0]: r[j] for r in rows[1:]}

    prod = col(samples, "v2:x3:final")
    none = col(samples, "v2:none:x3:final")
    orac = col(seeded, "v2:oracle:final")

    # Item-assertion pass per answer (the per-answer safety report's `pass`
    # column; the unknown-phone gate is the separate third group).
    gate = defaultdict(lambda: [0, 0])
    with open(src("docs/report/eval/final/safety-report_samples.csv"), newline="") as fh:
        for r in csv.DictReader(fh):
            gate[r["column"]][1] += 1
            gate[r["column"]][0] += int(r["pass"])
    # The oracle run has no per-answer safety-report row. Its gate result is
    # quoted from docs/eval/results-2026-09-13.md §2.1 (row "Seeded — assertions
    # failed (of 130)", column "v2 oracle": "0 (of 33)"), i.e. 33 of 33 pass.
    ORACLE_GATE = (33, 33)

    measures = [
        ("Answers citing\n≥ 1 passage",
         [count(prod["Answers with any citation marker or Sources list"]),
          count(none["Answers with any citation marker or Sources list"]),
          count(orac["Answers with any citation marker or Sources list"])]),
        ("Citation precision\n(markers pointing to a\nretrieved passage)",
         [count(prod["Citation precision (markers)"]),
          count(none["Citation precision (markers)"]),
          count(orac["Citation precision (markers)"])]),
        ("Answers with a phone\nnumber not in the\nverified NZ list",
         [count(prod["Phone number not in the verified NZ list"]),
          count(none["Phone number not in the verified NZ list"]),
          count(orac["Phone number not in the verified NZ list"])]),
        ("Answers passing every\nitem assertion",
         [tuple(gate["v2:x3:final"]), tuple(gate["v2:none:x3:final"]), ORACLE_GATE]),
    ]
    conds = [("Production retrieval (sampled, 390 answers)", G_DARK, None),
             ("No retrieval (sampled, 390 answers)", G_LIGHT, "////"),
             ("Oracle passages (seeded, 33 labelled items)", ACCENT, None)]

    fig, ax = plt.subplots(figsize=(FULL_W, 7.0 * CM), layout="constrained")
    bw = 0.25
    for i, (_, vals) in enumerate(measures):
        for j, ((label, fc, hatch), kn) in enumerate(zip(conds, vals)):
            x = i + (j - 1) * bw
            k, n = kn
            p = 100 * k / n
            lo, hi = wilson(k, n)
            ax.bar(x, p, bw * 0.9, color=fc, hatch=hatch, edgecolor=INK if hatch else fc,
                   lw=0.5, label=label if i == 0 else None, zorder=2)
            ax.errorbar(x, p, yerr=[[max(0.0, p - 100 * lo)], [max(0.0, 100 * hi - p)]], fmt="none",
                        ecolor=INK, elinewidth=0.6, capsize=1.5, zorder=3)
            ax.text(x, 100 * hi + 2, f"{k}/{n}", ha="center", va="bottom",
                    fontsize=6.6, rotation=90)
    ax.set_xticks(range(len(measures)))
    ax.set_xticklabels([m[0] for m in measures], fontsize=8)
    ax.set_ylabel("Answers or markers (%)")
    ax.set_ylim(0, 118)
    ax.set_yticks(range(0, 101, 20))
    ax.set_xlim(-0.5, len(measures) - 0.5)
    clean_axes(ax)
    fig.legend(loc="outside upper center", ncol=3, fontsize=7.5,
               handlelength=1.4, columnspacing=1.2)
    save(fig, "fig5_1_retrieval_effect.png")


# ════════════════════════════════════════════════════════════════════════════
# F4 — prompt generations and the safety-block ablation
# ════════════════════════════════════════════════════════════════════════════
def fig_safety_ablation():
    rows = md_table(src("docs/report/eval/final/tables_samples.md"), r"^## Table A")
    hdr = rows[0]
    by = {r[0]: r for r in rows[1:]}
    # Descriptive names (examiner, 10 Oct 2026: codes sent readers back to the front matter);
    # the codes P0, v1, v2-SAFETY and v2 map to these in Section 3.3 and the appendices.
    conds = [("Original prompt", "p0:x3:final", G_LIGHT, None),
             ("Australian-framed prompt", "v1:x3:final", G_MID, None),
             ("Production prompt without its safety rules", "v2-nosafety:x3:final", WHITE, "////"),
             ("Production prompt", "v2:x3:final", ACCENT, None)]
    panels = [
        ("111 in first sentence\n(of 45 emergency answers)",
         "111 in first sentence, emergency items", True),
        ("Medication dose\nstated (of 390)", "Dose stated (mg/mcg)", False),
        ("Australian service\nnamed (of 390)", "Australian service named", False),
        ("Foreign emergency\nnumber (of 390)", "Foreign emergency number", False),
    ]
    fig, axes = plt.subplots(1, 4, figsize=(FULL_W, 6.0 * CM), layout="constrained")
    for ax, (title, key, pct) in zip(axes, panels):
        vals = [count(by[key][hdr.index(c)]) for _, c, _, _ in conds]
        ys = [100 * k / n if pct else k for k, n in vals]
        for i, ((lab, _, fc, hatch), y, (k, n)) in enumerate(zip(conds, ys, vals)):
            ax.bar(i, y, 0.72, color=fc, hatch=hatch, edgecolor=INK, lw=0.5, zorder=2)
            txt = f"{k}/{n}" if pct else f"{k}"
            ax.text(i, y + (max(ys) or 1) * 0.03, txt, ha="center", va="bottom", fontsize=7)
        top = max(max(ys), 1)
        ax.set_ylim(0, (100 if pct else top) * 1.18)
        ax.set_xticks([])
        ax.set_xlabel(title, fontsize=8)
        ax.xaxis.set_label_position("bottom")
        clean_axes(ax)
        ax.tick_params(axis="x", length=0)
    axes[0].set_ylabel("Answers (%)")
    axes[1].set_ylabel("Answers (count)")
    fig.legend(handles=[Patch(facecolor=fc, hatch=hatch, edgecolor=INK, lw=0.5, label=lab)
                        for lab, _, fc, hatch in conds],
               loc="outside upper center", ncol=2, fontsize=8, handlelength=1.4,
               columnspacing=1.5)
    save(fig, "fig5_2_safety_ablation.png")


# ════════════════════════════════════════════════════════════════════════════
# F5 — latency by stage
# ════════════════════════════════════════════════════════════════════════════
def fig_latency(yardstick_ms=None):
    stages = defaultdict(list)
    with open(src("docs/report/eval/final/latency-bench_8ed29d6_mac-wifi-2026-09-13_raw.csv"),
              newline="") as fh:
        for r in csv.DictReader(fh):
            if r["cold"] == "0":  # warm rows only, as in the summary table
                stages[r["stage"]].append(float(r["ms"]))
    web = []
    with open(src("docs/report/eval/final/latency-web_2026-09-19_typed_raw.csv"), newline="") as fh:
        for r in csv.DictReader(fh):
            if r["mode"] == "typed":
                web.append(float(r["to_first_token_ms"]))
    # October follow-up (E4-S, evaluation plan §18.1): headless spoken turns on the
    # fallback-recogniser path, with TTS (the headline run); measured turns only.
    spoken = []
    with open(src("docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts_raw.csv"),
              newline="") as fh:
        for r in csv.DictReader(fh):
            if r["phase"] == "measured":
                spoken.append(float(r["to_first_audio_byte_ms"]))

    rows = [
        ("Query embedding\n(text-embedding-3-small)", stages["embed"], G_LIGHT),
        ("Retrieval RPC\n(match_chunks)", stages["rpc"], G_LIGHT),
        ("gpt-4o time to\nfirst token", stages["llm_ttft"], G_LIGHT),
        ("gpt-4o full answer", stages["llm_total"], G_LIGHT),
        ("Browser, typed turn:\ntime to first token", web, ACCENT),
        ("Spoken turn: end of\nspeech to first audio", spoken, G_MID),
    ]
    fig, ax = plt.subplots(figsize=(FULL_W, 7.3 * CM), layout="constrained")
    ypos = [6.6, 5.7, 4.8, 3.9, 2.55, 1.15]
    for (label, data, fc), y in zip(rows, ypos):
        bp = ax.boxplot(data, positions=[y], vert=False, widths=0.55, patch_artist=True,
                        whis=1.5, manage_ticks=False,
                        medianprops=dict(color=INK, lw=1.2),
                        boxprops=dict(facecolor=fc, edgecolor=INK, lw=0.6),
                        whiskerprops=dict(color=INK, lw=0.6), capprops=dict(color=INK, lw=0.6),
                        flierprops=dict(marker="o", markersize=2.5, markerfacecolor="none",
                                        markeredgecolor=INK, markeredgewidth=0.5))
        med = statistics.median(data)
        hi = max(data)
        label_txt = f"median {med:,.0f} ms  (n = {len(data)})"
        if hi + 1600 > 7000:
            # no room to the right of this row's data: put the label in the empty left part
            ax.text(120, y, label_txt, va="center", ha="left", fontsize=7.5)
        else:
            # labels sit in a right-hand column, clear of the yardstick line
            ax.text(max(4400, hi + 90), y, label_txt, va="center", ha="left", fontsize=7.5)
    ax.set_yticks(ypos)
    ax.set_yticklabels([r[0] for r in rows], fontsize=8)
    ax.axhline(3.25, color=G_LIGHT, lw=0.6)
    ax.axhline(1.85, color=G_LIGHT, lw=0.6)
    ax.text(6950, 7.0, "September: headless stages (Mac, home Wi-Fi)",
            ha="right", va="top", fontsize=7, color=G_DARK, fontstyle="italic")
    ax.text(6950, 3.17, "September: browser end to end (Chrome, study build)",
            ha="right", va="top", fontsize=7, color=G_DARK, fontstyle="italic")
    ax.text(6950, 1.77, "October follow-up: headless spoken turns",
            ha="right", va="top", fontsize=7, color=G_DARK, fontstyle="italic")
    ax.set_xlabel("Latency (ms)")
    ax.set_xlim(0, 7000)
    ax.set_ylim(0.5, 7.1)
    if yardstick_ms:
        ax.axvline(yardstick_ms, color=INK, ls=(0, (3, 2)), lw=0.8)
        ax.text(yardstick_ms + 40, 2.02, f"post-hoc yardstick {yardstick_ms:,.0f} ms (§4.5)",
                va="bottom", ha="left", fontsize=7)
    clean_axes(ax, "x")
    save(fig, "fig5_3_latency_stages.png")


# ════════════════════════════════════════════════════════════════════════════
# F7 — whisper-1 WER by group and input condition
# ════════════════════════════════════════════════════════════════════════════
def fig_wer():
    # Condition is identified from each report's header line, not assumed:
    # (a) = 2,063 utterance cuts with pauses; (b) = 1,973 VAD-trimmed clips
    # (docs/eval/results-e9-stt-2026-09-18.md §1, §4).
    runs = {}
    for sha in ("57ad032", "0419750"):
        header = src(f"docs/report/eval/stt/wer_{sha}_whisper-1.md").read_text()
        m = re.search(r"(\d+) rows in references", header)
        cond = {"2063": "a", "1973": "b"}[m.group(1)]
        rows = list(csv.DictReader(open(src(f"docs/report/eval/stt/wer_{sha}_whisper-1.csv"),
                                        newline="")))
        runs[cond] = rows

    rng = np.random.default_rng(42)
    B = 5000

    def pooled(rows):
        ref = np.array([float(r["refWords"]) for r in rows])
        err = {c: np.array([float(r[c]) for r in rows]) for c in "SDI"}
        tot = ref.sum()
        parts = {c: err[c].sum() / tot for c in "SDI"}
        e = err["S"] + err["D"] + err["I"]
        idx = rng.integers(0, len(rows), size=(B, len(rows)))
        boots = e[idx].sum(1) / ref[idx].sum(1)
        return parts, sum(parts.values()), np.percentile(boots, [2.5, 97.5]), len(rows), int(tot)

    bars = []
    for grp in ("control", "dementia"):
        for cond in ("a", "b"):
            rows = [r for r in runs[cond] if r["group"] == grp]
            bars.append((grp, cond, *pooled(rows)))

    fig, ax = plt.subplots(figsize=(HALF_W, 7.6 * CM), layout="constrained")
    xs = [0, 1, 2.5, 3.5]
    comp = [("S", "Substitutions", G_DARK, None), ("D", "Deletions", G_LIGHT, None),
            ("I", "Insertions", WHITE, "////")]
    for x, (grp, cond, parts, total, ci, n, words) in zip(xs, bars):
        base = 0
        for c, lab, fc, hatch in comp:
            v = 100 * parts[c]
            ax.bar(x, v, 0.72, bottom=base, color=fc, hatch=hatch, edgecolor=INK, lw=0.5,
                   label=lab if x == 0 else None, zorder=2)
            base += v
        ax.errorbar(x, 100 * total, yerr=[[max(0.0, 100 * (total - ci[0]))], [max(0.0, 100 * (ci[1] - total))]],
                    fmt="none", ecolor=INK, elinewidth=0.7, capsize=2, zorder=3)
        ax.text(x, 100 * ci[1] + 1.2, f"{100 * total:.1f}", ha="center", va="bottom",
                fontsize=7.5, fontweight="bold")
        ax.text(x, -3.5, f"({cond})", ha="center", va="top", fontsize=8)
        ax.text(x, -7.8, f"n = {n}", ha="center", va="top", fontsize=6.6, color=G_DARK)
    ax.text(0.5, -12.0, "Control", ha="center", va="top", fontsize=8.5)
    ax.text(3.0, -12.0, "Dementia", ha="center", va="top", fontsize=8.5)
    ax.set_xticks([])
    ax.set_xlim(-0.6, 4.1)
    ax.set_ylim(0, 62)
    ax.set_ylabel("Pooled word error rate (%)")
    clean_axes(ax)
    ax.spines["bottom"].set_visible(True)
    ax.legend(loc="upper left", fontsize=7.2, handlelength=1.2, ncol=1)
    fig.text(0.5, 0.012, "(a) utterances with pauses; (b) energy-VAD-trimmed.\n"
             "n = speakers. Whiskers: 95% bootstrap CI over speakers.",
             ha="center", va="bottom", fontsize=6.8, color=G_DARK)
    fig.get_layout_engine().set(h_pad=0.02, rect=(0, 0.135, 1, 0.865))
    save(fig, "fig5_4_wer_fallback.png")
    return bars


# ════════════════════════════════════════════════════════════════════════════
# F8 — retrieval under injected ASR error
# ════════════════════════════════════════════════════════════════════════════
LEVELS = ["disfluent", "control", "ad", "ad150"]


def _achieved_wer(path):
    """Mean achieved WER per level (all 45 perturbed questions), from the generated file."""
    t = src(path).read_text()
    lv = re.findall(r'"level":\s*"([^"]+)"', t)
    w = re.findall(r'"achievedWer":\s*([\d.]+)', t)
    assert len(lv) == len(w), path
    acc = defaultdict(list)
    for l, x in zip(lv, w):
        acc[l].append(float(x))
    return {k: 100 * sum(v) / len(v) for k, v in acc.items()}


def _retrieval_by_level(path):
    d = json.loads(src(path).read_text())
    acc = defaultdict(list)
    for q in d["perQuestion"]:
        acc[q["level"]].append(q)
    return {lv: (np.mean([q["recall@5"] for q in qs]), np.mean([q["mrr"] for q in qs]), len(qs))
            for lv, qs in acc.items()}


def fig_asr_degradation():
    clean = json.loads(src("docs/report/eval/retrieval_8a92ecd_v2.json").read_text())
    c_r5, c_mrr, c_n = clean["overall"]["recall@5"], clean["overall"]["mrr"], clean["n"]
    prod = _retrieval_by_level("docs/report/eval/retrieval_3a4dde3_v2_perturbed-whisper1.json")
    prod_w = _achieved_wer("scripts/eval/questions.perturbed-whisper1.js")
    q8 = _retrieval_by_level("docs/report/eval/retrieval_5131155_v2_perturbed.json")
    q8_w = _achieved_wer("scripts/eval/questions.perturbed.js")

    fig, ax = plt.subplots(figsize=(HALF_W, 7.2 * CM), layout="constrained")
    for metric, idx, marker, color in (("recall@5", 0, "o", G_DARK), ("MRR", 1, "s", ACCENT)):
        x = [0] + [prod_w[l] for l in LEVELS]
        y = [c_r5 if idx == 0 else c_mrr] + [prod[l][idx] for l in LEVELS]
        ax.plot(x, y, marker=marker, ms=4, color=color, lw=1.3,
                label=f"{metric}, production (whisper-1) profile", zorder=3)
        x8 = [0] + [q8_w[l] for l in LEVELS]
        y8 = [c_r5 if idx == 0 else c_mrr] + [q8[l][idx] for l in LEVELS]
        ax.plot(x8, y8, marker=marker, ms=3.2, color=color, lw=0.9, ls=(0, (3, 2)),
                markerfacecolor="white", label=f"{metric}, local stand-in profile (harsher)", zorder=2)
    names = {"disfluent": "disfluent", "control": "control-rate", "ad": "dementia-rate",
             "ad150": "1.5× dementia"}
    for l in LEVELS:
        ax.axvline(prod_w[l], color="#eeeeee", lw=0.6, zorder=0)
    top = ax.secondary_xaxis("top")
    top.set_xticks([0] + [prod_w[l] for l in LEVELS])
    top.set_xticklabels(["clean"] + [names[l] for l in LEVELS], rotation=35, ha="left",
                        fontsize=6.6, rotation_mode="anchor")
    top.tick_params(length=2, width=0.5, pad=1.5)
    top.spines["top"].set_visible(False)
    ax.set_xlabel("Injected word error rate vs clean question (%)")
    ax.set_ylabel("Retrieval score (0–1)")
    ax.set_ylim(0.3, 1.02)
    ax.set_xlim(-3, 75)
    clean_axes(ax, None)
    ax.legend(loc="lower left", fontsize=6.6, handlelength=2.2)
    # Label the hollow (dashed) points directly: they sit at the local stand-in
    # profile's own achieved WER, not under the top-axis level ticks.
    ax.annotate("local stand-in\nprofile (hollow)", xy=(q8_w["ad"], q8["ad"][0]),
                xytext=(q8_w["ad"] + 3, 0.985), fontsize=6.4, ha="left", va="top",
                color=G_DARK, fontstyle="italic",
                arrowprops=dict(arrowstyle="-", lw=0.5, color=G_DARK, shrinkB=3))
    ns = {prod[l][2] for l in LEVELS} | {q8[l][2] for l in LEVELS} | {c_n}
    ax.text(0.98, 0.03, f"n = {'/'.join(map(str, sorted(ns)))} labelled\nquestions per level",
            transform=ax.transAxes, ha="right", va="bottom", fontsize=6.8)
    save(fig, "fig5_5_asr_degradation.png")
    return prod, prod_w, q8, q8_w


# ════════════════════════════════════════════════════════════════════════════
# F9 — cost per turn
# ════════════════════════════════════════════════════════════════════════════
def fig_cost():
    # Replays scripts/eval/cost-model.mjs for the production column
    # (generation_8a92ecd_v2_x3_final.json) with the committed price table.
    P = json.loads(src("scripts/eval/pricing.2026-09.json").read_text())
    run = json.loads(src("docs/report/eval/generation_8a92ecd_v2_x3_final.json").read_text())
    rows = [r for r in run["rows"] if r.get("promptTokens") is not None
            and r.get("completionTokens") is not None]
    g4o = P["openai"]["gpt-4o"]
    emb = P["openai"]["text-embedding-3-small"]["input"]
    llm_in = np.mean([r["promptTokens"] for r in rows]) * g4o["input"] / 1e6
    llm_out = np.mean([r["completionTokens"] for r in rows]) * g4o["output"] / 1e6
    q_tok = np.mean([math.ceil(len(r["question"]) / 4) for r in rows])
    embed_typed = q_tok * emb / 1e6
    embed_spec = q_tok * 1 * emb / 1e6  # one speculative embedding per spoken turn (cost md, Assumptions)

    # Mean TTS characters per answer: produced by the JS voice-path replay in
    # cost-model.mjs; read from its committed report (Table A, production row).
    cost_md = src("docs/report/eval/final/cost_ff2753e.md")
    tab = md_table(cost_md, r"^## A\. Per-turn cost")
    hdr = tab[0]
    row = next(r for r in tab[1:] if "generation_8a92ecd_v2_x3_final.json" in r[0])
    chars = float(row[hdr.index("TTS chars")].split("/")[0])
    plan = P["elevenlabs"]["plans"]["creator"]  # plan named in cost md Assumptions
    per_char = plan["usd_per_month"] / (plan["credits"] / P["elevenlabs"]["credits_per_char"]["flash_turbo"])
    tts = chars * per_char

    typed = [llm_in, llm_out, embed_typed, 0.0]
    spoken = [llm_in, llm_out, embed_typed + embed_spec, tts]
    labels = ["gpt-4o input tokens", "gpt-4o output tokens", "Embeddings (< US$0.0001)",
              f"ElevenLabs TTS ({chars:,.0f} characters, Creator plan rate)"]
    fills = [(G_DARK, None), (G_MID, None), (INK, None), (ACCENT, None)]

    fig, ax = plt.subplots(figsize=(FULL_W, 4.6 * CM), layout="constrained")
    for y, parts in ((1, typed), (0, spoken)):
        left = 0
        for i, (v, (fc, hatch)) in enumerate(zip(parts, fills)):
            if v > 0:
                ax.barh(y, v, 0.5, left=left, color=fc, hatch=hatch,
                        edgecolor=WHITE if v > 0.003 else fc, lw=0.4,
                        label=labels[i] if y == 0 else None, zorder=2)
            left += v
        ax.text(left + 0.0015, y, f"US${left:.4f}", va="center", ha="left", fontsize=8)
    ax.text(llm_in + llm_out + tts / 2, 0, f"US${tts:.4f} ({100 * tts / sum(spoken):.1f}% of the spoken turn)",
            ha="center", va="center", fontsize=7.5, color=WHITE, zorder=3)
    print(f"    F9 check: typed {sum(typed):.4f}, spoken {sum(spoken):.4f}, "
          f"llm in {llm_in:.4f}, out {llm_out:.4f}, embed {embed_typed + embed_spec:.6f}, tts {tts:.4f}")
    ax.text(sum(spoken) + 0.0015, -0.36, f"{sum(spoken) / sum(typed):.1f}× the typed turn",
            va="center", ha="left", fontsize=7, color=G_DARK)
    ax.set_yticks([1, 0])
    ax.set_yticklabels(["Typed turn", "Spoken turn"])
    ax.set_xlabel("Mean cost per turn (US$, list prices checked 18 Sep 2026)")
    ax.set_xlim(0, 0.13)
    ax.set_ylim(-0.6, 1.5)
    clean_axes(ax, "x")
    ax.legend(loc="upper right", fontsize=7, ncol=2, bbox_to_anchor=(1.0, 1.08),
              handlelength=1.2, columnspacing=1.0)
    save(fig, "fig5_6_cost_per_turn.png")
    return typed, spoken


# ════════════════════════════════════════════════════════════════════════════
# F10 — co-articulation pipeline (schematic; no data)
# ════════════════════════════════════════════════════════════════════════════
def fig_coarticulation():
    # Stages as described in Section 3.5 and implemented in packages/core/lipsync (G2P,
    # timings to visemes) and unity-avatar/.../LipSync/CoarticulationEngine.cs (blending,
    # 90 Hz bake). Schematic only: it reads no artefact.
    W, H = 160, 40
    fig = plt.figure(figsize=(FULL_W, FULL_W * H / W))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    BODY, HEAD = 8.0, 9.0
    stages = [
        ("Sentence", ["text and the", "voice's timing", "of each letter"]),
        ("G2P", ["CMU dictionary,", "25,000 words;", "spelling rules", "for the rest"]),
        ("Visemes", ["phonemes timed,", "mapped to the", "rig's 14 mouth", "shapes"]),
        ("Co-articulation", ["influence rises", "before, decays after;", "neighbours blend;", "p b m, f v close"]),
        ("Blendshapes", ["curves baked", "at 90 Hz,", "played with", "the audio"]),
    ]
    bw, gap, x0, y0, bh = 27.0, 5.25, 2.0, 9.0, 27.0
    for i, (title, lines) in enumerate(stages):
        x = x0 + i * (bw + gap)
        fc = G_XLIGHT if i < 3 else WHITE
        ax.add_patch(FancyBboxPatch((x, y0), bw, bh, boxstyle="round,pad=0,rounding_size=1.2",
                                    fc=fc, ec=INK, lw=0.8, zorder=2))
        ax.text(x + 1.8, y0 + bh - 1.8, title, ha="left", va="top", fontsize=HEAD,
                fontweight="bold", zorder=3)
        ty = y0 + bh - 7.4
        for ln in lines:
            ax.text(x + 1.8, ty, ln, ha="left", va="top", fontsize=BODY, zorder=3)
            ty -= 4.1
        if i < len(stages) - 1:
            ax.add_patch(FancyArrowPatch((x + bw + 0.4, y0 + bh / 2), (x + bw + gap - 0.4, y0 + bh / 2),
                                         arrowstyle="-|>", mutation_scale=8, lw=0.9, color=INK,
                                         zorder=4, shrinkA=0, shrinkB=0))
    # which code runs each stage
    split = x0 + 3 * (bw + gap) - gap / 2
    ax.plot([x0, split - 1.5], [5.6, 5.6], color=G_MID, lw=0.8)
    ax.plot([split + 1.5, x0 + 5 * bw + 4 * gap], [5.6, 5.6], color=G_MID, lw=0.8)
    ax.text((x0 + split) / 2, 4.2, "shared JavaScript core (both apps)", ha="center", va="top",
            fontsize=BODY, fontstyle="italic", color=G_DARK)
    ax.text((split + x0 + 5 * bw + 4 * gap) / 2, 4.2, "Unity (C#), on the character's face",
            ha="center", va="top", fontsize=BODY, fontstyle="italic", color=G_DARK)
    save(fig, "fig3_3_coarticulation.png")


# ════════════════════════════════════════════════════════════════════════════
# F12 — evaluation design (Figure 4.1; replaces the lip-sync schematic F10 in the
#        body, 12 Oct 2026, after an examiner asked for a method overview)
# ════════════════════════════════════════════════════════════════════════════
def fig_eval_design():
    # Schematic of Chapter 4 (Table 4.1, Sections 4.2 to 4.4); reads no artefact.
    W, H = 160, 54
    fig = plt.figure(figsize=(FULL_W, FULL_W * H / W))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    BODY, HEAD = 6.9, 7.8
    cols = ["Inputs", "Conditions compared", "Measures", "Reading and tests"]
    rows = [
        ("RQ1\nanswers", [
            ["130 items (74 development,", "56 held-out); 111 more", "written by another model"],
            ["retrieval none, oracle or", "production; earlier prompts;", "rules cut out; neutral"],
            ["gates on every answer;", "recall@5, MRR;", "citation support"],
            ["every failure read; 20%", "of passes read; judges", "against four raters"]]),
        ("RQ2\ninterface", [
            ["95 articulation checks;", "latency and cost runs;", "15 viewers; 10 carers"],
            ["new engine vs legacy;", "recogniser paths; avatar", "with voice vs text"],
            ["checks passed; ms per", "stage; US$ per turn;", "SUS, Likert, time"],
            ["blind pairwise choices;", "safety read of every", "consented study answer"]]),
        ("RQ3\nspeech", [
            ["ADReSS-2020: 78", "speakers with dementia,", "78 controls"],
            ["seven recognisers; pauses", "kept or trimmed; injected", "error profiles"],
            ["WER by speaker;", "recall@5 and gates", "under injected errors"],
            ["paired tests by", "speaker; failing", "answers read"]]),
    ]
    lab_w, x0, gap, verdict_w = 13.0, 0.5, 2.2, 15.0
    cw = (W - x0 - lab_w - verdict_w - gap * 5 - 1.0) / 4
    top, head_h, rh, rgap = H - 1.0, 5.0, 14.0, 1.6
    for j, c in enumerate(cols):
        x = x0 + lab_w + gap + j * (cw + gap)
        ax.text(x + cw / 2, top - 1.2, c, ha="center", va="top", fontsize=HEAD, fontweight="bold")
    for i, (lab, cells) in enumerate(rows):
        y = top - head_h - (i + 1) * rh - i * rgap
        ax.text(x0 + lab_w / 2, y + rh / 2, lab, ha="center", va="center", fontsize=HEAD,
                fontweight="bold", linespacing=1.15)
        for j, lines in enumerate(cells):
            x = x0 + lab_w + gap + j * (cw + gap)
            fc = G_XLIGHT if j < 2 else WHITE
            ax.add_patch(FancyBboxPatch((x, y), cw, rh, boxstyle="round,pad=0,rounding_size=1.0",
                                        fc=fc, ec=INK, lw=0.7, zorder=2))
            ty = y + rh - 2.0
            for ln in lines:
                ax.text(x + 1.2, ty, ln, ha="left", va="top", fontsize=BODY, zorder=3)
                ty -= 3.7
            if j < 3:
                ax.add_patch(FancyArrowPatch((x + cw + 0.2, y + rh / 2), (x + cw + gap - 0.2, y + rh / 2),
                                             arrowstyle="-|>", mutation_scale=6, lw=0.8, color=INK,
                                             zorder=4, shrinkA=0, shrinkB=0))
    # verdict bar spanning all rows
    vx = x0 + lab_w + gap + 4 * (cw + gap)
    vy = top - head_h - 3 * rh - 2 * rgap
    vh = 3 * rh + 2 * rgap
    ax.add_patch(FancyBboxPatch((vx, vy), verdict_w, vh, boxstyle="round,pad=0,rounding_size=1.0",
                                fc=ACCENT, ec=ACCENT, lw=0.7, zorder=2))
    ax.text(vx + verdict_w / 2, vy + vh / 2,
            "Verdicts\nagainst\nexpectations,\nmost\ncommitted\nbefore\nthe runs\n(Table 4.1)",
            ha="center", va="center", fontsize=BODY, color=WHITE, fontweight="bold", linespacing=1.25, zorder=3)
    for i in range(3):
        y = top - head_h - (i + 1) * rh - i * rgap + rh / 2
        x = vx - gap
        ax.add_patch(FancyArrowPatch((x + 0.2, y), (vx - 0.2, y), arrowstyle="-|>", mutation_scale=6,
                                     lw=0.8, color=INK, zorder=4, shrinkA=0, shrinkB=0))
    save(fig, "fig4_1_evaluation_design.png")


# ════════════════════════════════════════════════════════════════════════════
# F13 — check-back rules on garbled questions (§19H Part A and §19I)
# ════════════════════════════════════════════════════════════════════════════
def fig_checkback():
    """Check-back rules on garbled questions: §19J sampled gpt-4o (bars, Wilson 95%), with the
    §19J single answers on gpt-4.1 and claude-sonnet-5-5 and §19H/§19I's seeded gpt-4o run overlaid."""
    from matplotlib.lines import Line2D
    j = src("docs/report/eval/safety/s19j_a7a1abc.md").read_text().splitlines()
    i19 = md_table(src("docs/report/eval/safety/s19i_87a077b.md"), r"^# §19I")
    hdr19 = i19[0]
    by19 = {(r[0], r[1]): r for r in i19[1:]}
    def kn(cell):
        m = re.match(r"\s*(\d+)/(\d+)", cell)
        return int(m.group(1)), int(m.group(2))
    part_a = md_table(src("docs/report/eval/safety/s19j_a7a1abc.md"), r"^## Part A")
    a_rows = {r[0]: r for r in part_a[1:]}
    part_b = md_table(src("docs/report/eval/safety/s19j_a7a1abc.md"), r"^## Part B")
    b_rows = {r[0]: r for r in part_b[1:]}
    conds = [("Deployed prompt", 1, G_LIGHT, None, "(a) v2"),
             ("+ check-back rule", 2, WHITE, "////", "(k) check-back"),
             ("+ escalate-first check-back rule", 3, ACCENT, None, "(e) escalate-first")]
    panels = [("111 in the first sentence,\ngarbled emergency questions", "111 first, emergency answers",
               ("perturbed emergency (82)", "111 first"), 82, 1),
              ("Answer checks back what was asked,\ngarbled questions", "Checks back, all answers",
               ("perturbed (307)", "checks back"), 307, 3)]
    fig, axes = plt.subplots(1, 2, figsize=(FULL_W, 6.2 * CM), layout="constrained")
    for ax, (title, arow, key19, n19, bcol) in zip(axes, panels):
        for i, (lab, col, fc, hatch, c19) in enumerate(conds):
            k, n = kn(a_rows[arow][col])
            p = 100 * k / n
            lo, hi = wilson(k, n)
            ax.bar(i, p, 0.62, color=fc, hatch=hatch, edgecolor=INK, lw=0.5, zorder=2)
            ax.errorbar(i, p, yerr=[[p - 100 * lo], [100 * hi - p]], fmt="none", ecolor=INK, elinewidth=0.7, capsize=2.5, zorder=3)
            ax.text(i + 0.33, p + 1.5, f"{p:.0f}%", ha="left", va="bottom", fontsize=7)
            s = int(by19[key19][hdr19.index(c19)])
            ax.plot(i - 0.18, 100 * s / n19, marker="x", ms=5, mew=1.0, color=INK, zorder=4, ls="")
        for (model, mk) in (("gpt-4.1", "D"), ("claude-sonnet-5-5", "^")):
            a, e = [int(x) for x in b_rows[model][bcol].split("/")]
            for i, v in ((0, a), (2, e)):
                ax.plot(i + 0.18, 100 * v / n19, marker=mk, ms=4.5, mfc=WHITE, mec=INK, mew=0.8, zorder=4, ls="")
        ax.set_ylim(0, 100)
        ax.set_xticks([])
        ax.set_xlabel(title, fontsize=8)
        clean_axes(ax)
        ax.tick_params(axis="x", length=0)
    axes[0].set_ylabel("Answers (%)")
    handles = [Patch(facecolor=fc, hatch=hatch, edgecolor=INK, lw=0.5, label=lab) for lab, _, fc, hatch, _ in conds]
    handles += [Line2D([], [], ls="", marker="x", color=INK, mew=1.0, label="gpt-4o, one seeded run"),
                Line2D([], [], ls="", marker="D", mfc=WHITE, mec=INK, label="gpt-4.1"),
                Line2D([], [], ls="", marker="^", mfc=WHITE, mec=INK, label="Claude model")]
    fig.legend(handles=handles, loc="outside upper center", ncol=3, fontsize=7.5, handlelength=1.4, columnspacing=1.2)
    save(fig, "fig5_5_checkback.png")


FIGS = {
    "F1": fig_architecture,
    "F3": fig_retrieval_effect,
    "F4": fig_safety_ablation,
    "F5": fig_latency,
    "F7": fig_wer,
    "F8": fig_asr_degradation,
    "F9": fig_cost,
    "F10": fig_coarticulation,
    "F12": fig_eval_design,
    "F13": fig_checkback,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", help="comma-separated figure ids, e.g. F3,F7")
    ap.add_argument("--yardstick-ms", type=float, default=None,
                    help="draw a latency yardstick on F5 (none has been chosen yet; §4.5)")
    args = ap.parse_args()
    ids = [s.strip().upper() for s in args.only.split(",")] if args.only else list(FIGS)
    bad = [i for i in ids if i not in FIGS]
    if bad:
        sys.exit(f"unknown figure id(s): {', '.join(bad)}; choose from {', '.join(FIGS)}")
    print(f"font: {plt.rcParams['font.serif'][0]}")
    for i in ids:
        if i == "F5":
            fig_latency(args.yardstick_ms)
        else:
            FIGS[i]()


if __name__ == "__main__":
    main()
