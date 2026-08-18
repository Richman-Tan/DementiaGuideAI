#!/usr/bin/env python3
"""
Generate the usability-study figures from the exported CSVs.

Reads docs/study/results/ (produced by scripts/study/export-study-data.mjs) and
writes into docs/report/figures/, using the same palette and conventions as
scripts/make-figures.py so the final report stays visually consistent with the
mid-year submission.

  Fig 4  fig4_time_on_task.png   — paired time on task, one line per participant
  Fig 5  fig5_sus.png            — SUS per participant per arm, with the
                                    conventional 68 reference line
  Fig 6  fig6_task_success.png   — task success counts by arm

Why individual points rather than bars of means: at n < 20 a bar chart of two
means implies a precision the data does not have, and hides the thing that
actually matters — whether participants moved in the same direction. The paired
plot shows every participant (docs/study/analysis-plan.md §1).

Usage:  python3 scripts/study/make-study-figures.py [--only 4,5]
"""
import csv
import sys
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent.parent
RESULTS = ROOT / "docs/study/results"
FIG_DIR = ROOT / "docs/report/figures"

# Same palette as scripts/make-figures.py.
C_ARM_A = "#3b7bb5"      # steel blue — avatar
C_ARM_B = "#b5654a"      # sienna — text
C_BACKDROP = "#e7e1d4"   # light beige
C_MUTED = "#9a958b"


def read(name):
    path = RESULTS / name
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def style(ax):
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color="#eeeeee")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)


def paired_times(tasks):
    """Median time per participant per arm — the design is within-subjects, so
    the unit of comparison is the participant, not the task."""
    by = {}
    for t in tasks:
        secs = num(t.get("duration_s"))
        if secs is None:
            continue
        by.setdefault(t["participant_code"], {"A": [], "B": []})
        by[t["participant_code"]].setdefault(t["arm"], []).append(secs)
    out = []
    for code, arms in sorted(by.items()):
        if arms.get("A") and arms.get("B"):
            out.append((code, median(arms["A"]), median(arms["B"])))
    return out


def fig_time_on_task():
    pairs = paired_times(read("tasks.csv"))
    if not pairs:
        print("skip fig 4 — no paired time data")
        return

    fig, ax = plt.subplots(figsize=(9, 6.2))
    for _code, a, b in pairs:
        # Colour by direction so the split is readable without a legend entry
        # per participant.
        ax.plot([0, 1], [a, b], color=C_MUTED, linewidth=1.2, zorder=1, alpha=0.8)
        ax.plot(0, a, "o", color=C_ARM_A, markersize=9, zorder=2)
        ax.plot(1, b, "o", color=C_ARM_B, markersize=9, zorder=2)

    med_a = median([p[1] for p in pairs])
    med_b = median([p[2] for p in pairs])
    ax.plot([0, 1], [med_a, med_b], color="#26323a", linewidth=3, zorder=3,
            label=f"Median ({med_a:.0f}s → {med_b:.0f}s)")

    ax.set_xticks([0, 1])
    ax.set_xticklabels(["Arm A — avatar", "Arm B — text"])
    ax.set_xlim(-0.35, 1.35)
    ax.set_ylabel("Median time on task (seconds)")
    ax.set_title(f"Time on task, paired by participant (n = {len(pairs)})")
    ax.legend(loc="upper right", framealpha=0.9)
    style(ax)
    fig.tight_layout()
    out = FIG_DIR / "fig4_time_on_task.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)}")


def fig_sus():
    rows = [r for r in read("sus.csv") if num(r.get("sus")) is not None]
    if not rows:
        print("skip fig 5 — no scored SUS")
        return

    by_arm = {"A": [], "B": []}
    for r in rows:
        if r["arm"] in by_arm:
            by_arm[r["arm"]].append(num(r["sus"]))

    fig, ax = plt.subplots(figsize=(9, 6.2))
    # The conventional average. Drawn as a reference, not a pass mark.
    ax.axhline(68, color=C_MUTED, linestyle="--", linewidth=1.4, zorder=0,
               label="68 — conventional average")

    for i, (arm, colour, label) in enumerate(
            [("A", C_ARM_A, "Arm A — avatar"), ("B", C_ARM_B, "Arm B — text")]):
        vals = by_arm[arm]
        if not vals:
            continue
        # Jitter horizontally so overlapping scores stay countable.
        xs = [i + (j - (len(vals) - 1) / 2) * 0.035 for j in range(len(vals))]
        ax.plot(xs, vals, "o", color=colour, markersize=10, alpha=0.85,
                zorder=2, label=label)
        m = median(vals)
        ax.plot([i - 0.22, i + 0.22], [m, m], color="#26323a", linewidth=3,
                zorder=3)
        ax.text(i + 0.26, m, f"median {m:.1f}", va="center", color="#26323a",
                fontweight="bold", fontsize=10)

    ax.set_xticks([0, 1])
    ax.set_xticklabels(["Arm A — avatar", "Arm B — text"])
    ax.set_xlim(-0.5, 1.6)
    ax.set_ylim(0, 105)
    ax.set_ylabel("System Usability Scale (0–100)")
    ax.set_title(f"SUS by interface, every participant shown "
                 f"(n = {len(by_arm['A'])} / {len(by_arm['B'])})")
    ax.legend(loc="lower right", framealpha=0.9)
    style(ax)
    fig.tight_layout()
    out = FIG_DIR / "fig5_sus.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)}")


def fig_task_success():
    tasks = [t for t in read("tasks.csv") if t.get("rubric_score")]
    if not tasks:
        print("skip fig 6 — tasks.csv has no rubric_score yet")
        return

    grades = ["complete", "partial", "failed"]
    arms = [("A", "Arm A — avatar", C_ARM_A), ("B", "Arm B — text", C_ARM_B)]
    width = 0.38

    fig, ax = plt.subplots(figsize=(9, 6.2))
    for i, (arm, label, colour) in enumerate(arms):
        rows = [t for t in tasks if t["arm"] == arm]
        counts = [sum(1 for t in rows if t["rubric_score"] == g) for g in grades]
        xs = [j + (i - 0.5) * width for j in range(len(grades))]
        ax.bar(xs, counts, width=width, color=colour, zorder=2, label=label)
        for x, c in zip(xs, counts):
            ax.text(x, c + 0.15, str(c), ha="center", va="bottom", color=colour,
                    fontweight="bold", fontsize=11)

    ax.set_xticks(range(len(grades)))
    ax.set_xticklabels([g.capitalize() for g in grades])
    ax.set_ylabel("Tasks")
    ax.set_title(f"Task success by arm (n = {len(tasks)} scored tasks)")
    ax.legend(loc="upper right", framealpha=0.9)
    style(ax)
    fig.tight_layout()
    out = FIG_DIR / "fig6_task_success.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"wrote {out.relative_to(ROOT)}")


FIGURES = {4: fig_time_on_task, 5: fig_sus, 6: fig_task_success}


def main():
    if not RESULTS.exists():
        print(f"No {RESULTS.relative_to(ROOT)} — run scripts/study/export-study-data.mjs first.")
        return 1
    wanted = set(FIGURES)
    if "--only" in sys.argv:
        wanted = {int(n) for n in sys.argv[sys.argv.index("--only") + 1].split(",")}
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    for n in sorted(wanted):
        FIGURES[n]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
