#!/usr/bin/env python3
"""
Regenerate the mid-year report figures from the recorded lip-sync test data.

Reproducible replacement for the ad-hoc figures that were committed as PNGs
without a generator. Reads the baseline and final TestResults runs (the same
provenance listed in the report §G) and writes the figures into
docs/report/figures/.

  Fig 1  fig1_checks_passed.png  — acceptance checks passed per fixture
                                    (baseline vs final, total-checks backdrop)
  Fig 2  fig2_viseme_montage.png — three viseme face captures side by side.
                                    Captures come from docs/report/figures/_captures/
                                    (re-captured from the AaronImproved avatar via
                                    scripts/capture-visemes helper); the montage is
                                    only assembled when those inputs exist.
  Fig 3  fig3_bilabial_curves.png — V_Explosive over the bilabials fixture,
                                    baseline vs final, with open-shape suppression
                                    and every /p b m/ check time marked.

Usage:  python3 scripts/make-figures.py [--only 1,3]
"""
import csv
import json
import os
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager  # noqa: F401  (ensures font cache is built)

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "unity-avatar/UnityAvatarProject/TestResults/lipsync"
BASELINE_RUN = RESULTS / "20260711_231911"
FINAL_RUN = RESULTS / "20260712_000426"
FIG_DIR = ROOT / "docs/report/figures"
CAPTURE_DIR = FIG_DIR / "_captures"

# Shared palette (kept consistent with the original figures).
C_BASELINE = "#b5654a"   # sienna
C_FINAL = "#3b7bb5"      # steel blue
C_BACKDROP = "#e7e1d4"   # light beige
C_OPEN = "#c0674a"       # open-shape dashed (warm)

# Fixture display order and any two-line labels (matches report Table 1).
FIXTURE_ORDER = [
    "bilabials", "dental", "labiodental", "sibilant_rhotic",
    "hello", "silence_gaps", "rounded", "g2p_pipeline",
]
FIXTURE_LABELS = {
    "sibilant_rhotic": "sibilant_\nrhotic",
    "silence_gaps": "silence_\ngaps",
    "g2p_pipeline": "g2p_\npipeline",
}


def load_metrics(run_dir):
    """{fixture: (passed, total)} for one run."""
    out = {}
    for path in run_dir.glob("*_metrics.json"):
        m = json.loads(path.read_text())
        out[m["fixture"]] = (m["passedChecks"], m["totalChecks"])
    return out


def read_csv_columns(path):
    """Return (header list, {col: [floats]}) for a fixture CSV."""
    with open(path, newline="") as fh:
        rows = list(csv.reader(fh))
    header = rows[0]
    cols = {name: [] for name in header}
    for row in rows[1:]:
        for name, val in zip(header, row):
            cols[name].append(float(val))
    return header, cols


# ── Figure 1 ────────────────────────────────────────────────────────────────
def figure1():
    baseline = load_metrics(BASELINE_RUN)
    final = load_metrics(FINAL_RUN)

    labels, base_vals, final_vals, totals = [], [], [], []
    for fx in FIXTURE_ORDER:
        labels.append(FIXTURE_LABELS.get(fx, fx))
        b = baseline.get(fx)
        f = final.get(fx)
        base_vals.append(b[0] if b else None)   # None = no baseline (g2p)
        final_vals.append(f[0])
        totals.append(f[1])

    x = range(len(labels))
    width = 0.38
    fig, ax = plt.subplots(figsize=(13, 6.2))

    # Total-checks backdrop behind each group.
    ax.bar(x, totals, width=0.86, color=C_BACKDROP, zorder=0,
           label="Total checks in fixture")

    xb = [i - width / 2 for i in x]
    xf = [i + width / 2 for i in x]
    # Baseline bars (skip fixtures with no baseline).
    ax.bar([i for i, v in zip(xb, base_vals) if v is not None],
           [v for v in base_vals if v is not None],
           width=width, color=C_BASELINE, zorder=2, label="Baseline pipeline")
    ax.bar(xf, final_vals, width=width, color=C_FINAL, zorder=2,
           label="Final pipeline")

    for i, v in zip(xb, base_vals):
        if v is not None:
            ax.text(i, v + 0.15, str(v), ha="center", va="bottom",
                    color=C_BASELINE, fontweight="bold", fontsize=11)
    for i, v in zip(xf, final_vals):
        ax.text(i, v + 0.15, str(v), ha="center", va="bottom",
                color=C_FINAL, fontweight="bold", fontsize=11)
    # "no baseline" note under the g2p group.
    for i, fx in enumerate(FIXTURE_ORDER):
        if baseline.get(fx) is None:
            ax.text(i - width / 2, 0.5, "no\nbaseline", ha="center", va="bottom",
                    color="#9a958b", fontsize=9, style="italic")

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylabel("Acceptance checks passed")
    ax.set_title("Lip-sync acceptance checks passed per fixture: "
                 "baseline vs final pipeline")
    ax.legend(loc="upper right", framealpha=0.9)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color="#eeeeee")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    out = FIG_DIR / "fig1_checks_passed.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)}")


# ── Figure 3 ────────────────────────────────────────────────────────────────
def figure3():
    _, base = read_csv_columns(BASELINE_RUN / "bilabials.csv")
    _, final = read_csv_columns(FINAL_RUN / "bilabials.csv")
    metrics = json.loads((FINAL_RUN / "bilabials_metrics.json").read_text())
    pbm_times = [c["time"] for c in metrics["checks"] if c["type"] == "bilabial"]

    open_final = [o + l for o, l in zip(final["V_Open"], final["V_Lip_Open"])]

    fig, ax = plt.subplots(figsize=(13, 6.2))

    # /p b m/ check-time verticals (the defect in the old figure: only the first
    # two rendered — now every closure instant is marked).
    for i, t in enumerate(pbm_times):
        ax.axvline(t, color="#b8b8b8", lw=1.0, zorder=0,
                   label="/p b m/ check times" if i == 0 else None)

    ax.axhline(0.90, ls=":", color="#555555", lw=1.2, zorder=1,
               label="bilabial threshold 0.90")
    ax.plot(base["t"], base["V_Explosive"], color=C_BASELINE, alpha=0.5, lw=1.8,
            label="V_Explosive — baseline")
    ax.plot(final["t"], final["V_Explosive"], color=C_FINAL, lw=2.6,
            label="V_Explosive — final")
    ax.plot(final["t"], open_final, color=C_OPEN, ls="--", lw=1.8,
            label="Open shapes (V_Open + V_Lip_Open) — final")

    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Blendshape weight (0–1)")
    ax.set_ylim(-0.03, 1.05)
    ax.set_xlim(0, max(final["t"]))
    ax.set_title('Bilabial closure over time ("bilabials" fixture): '
                 "closure rises while open shapes stay suppressed")
    ax.legend(loc="upper right", framealpha=0.9, fontsize=9)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    out = FIG_DIR / "fig3_bilabial_curves.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)} ({len(pbm_times)} /p b m/ markers)")


# ── Figure 2 ────────────────────────────────────────────────────────────────
# Three captured viseme faces assembled into a labelled montage. Capture inputs
# are produced from the live AaronImproved avatar; see PANELS for the expected
# files and their annotations.
PANELS = [
    ("aaron_bilabial.png",   "Bilabial /b/ (“by”)",
     "V_Explosive = 0.94 — lips sealed, open shapes suppressed"),
    ("aaron_open_vowel.png", "Open vowel /a/ (“barn”)",
     "Merged_Open_Mouth drives a wide, symmetric jaw"),
    ("aaron_labiodental.png","Labiodental /f/ (“five”)",
     "V_Dental_Lip = 0.95 — lower lip to upper teeth"),
]


def figure2():
    from PIL import Image, ImageDraw, ImageFont

    missing = [p for p, *_ in PANELS if not (CAPTURE_DIR / p).exists()]
    if missing:
        print(f"skip fig2 — missing captures in {CAPTURE_DIR.relative_to(ROOT)}: "
              f"{', '.join(missing)}")
        return

    imgs = [Image.open(CAPTURE_DIR / p).convert("RGB") for p, *_ in PANELS]
    h = min(720, min(im.height for im in imgs))  # cap panel height for a sane montage size
    imgs = [im.resize((int(im.width * h / im.height), h), Image.LANCZOS) for im in imgs]

    pad, gap = 24, 18
    title_h, cap_h = 40, 74
    border = 3
    W = sum(im.width for im in imgs) + gap * (len(imgs) - 1) + pad * 2
    H = title_h + h + cap_h + pad
    canvas = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(canvas)

    def font(sz, bold=False):
        for name in ((["Arial Bold.ttf", "Helvetica.ttc"] if bold
                      else ["Arial.ttf", "Helvetica.ttc"])):
            try:
                return ImageFont.truetype(name, sz)
            except OSError:
                continue
        return ImageFont.load_default()

    draw.text((pad, 10), "Distinct viseme shapes produced by the final pipeline "
              "(editor capture, AaronImproved)", fill="black", font=font(22, True))

    x = pad
    for im, (_, label, caption) in zip(imgs, PANELS):
        y = title_h
        canvas.paste(im, (x, y))
        draw.rectangle([x - border, y - border, x + im.width + border - 1,
                        y + h + border - 1], outline=C_FINAL, width=border)
        cy = y + h + 12
        draw.text((x, cy), label, fill=C_FINAL, font=font(19, True))
        draw.text((x, cy + 26), caption, fill="#333333", font=font(14))
        x += im.width + gap

    out = FIG_DIR / "fig2_viseme_montage.png"
    canvas.save(out)
    print(f"wrote {out.relative_to(ROOT)}")


def main():
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    if only is None or "1" in only:
        figure1()
    if only is None or "2" in only:
        figure2()
    if only is None or "3" in only:
        figure3()


if __name__ == "__main__":
    main()
