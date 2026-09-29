#!/usr/bin/env python3
"""
Check the final-report skeleton in docs/report/final/ (read-only).

Reports, per chapter, the words written against the budget declared in the
chapter's `<!-- TEMPLATE: Budget ≈N words … -->` note, and the open TODO( markers.
Fails on:
  - a backticked repository path, or a relative markdown link, that does not
    resolve;
  - a `[@key]` citation whose key is not defined in 08-references.md;
  - budgets for the counted chapters that sum past PLAN_WORDS.
Words written exclude HTML comments, TODO( lines, headings, and table rows.

Usage:  python3 scripts/report/check-template.py [--final]

--final also fails if any TODO(, [@key] or TEMPLATE note remains. Run it on the
assembled text before submission.
"""
import glob
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FINAL = ROOT / "docs/report/final"
COUNTED = ["01-introduction.md", "02-literature-review.md", "03-system-design.md",
           "04-methodology.md", "05-results.md", "06-discussion.md",
           "07-conclusions-future-work.md"]
PLAN_WORDS = 10_200          # README.md budget table
HARD_MAX, MIN_WORDS = 13_000, 8_000  # Canvas assignment page

COMMENT = re.compile(r"<!--.*?-->", re.S)
BUDGET = re.compile(r"Budget ≈([\d,]+) words")
TODO = re.compile(r"TODO\((\w+)")
CITE = re.compile(r"\[@([\w-]+)\]")
KEY_ROW = re.compile(r"^\|\s*`([\w-]+)`\s*\|", re.M)
TICK = re.compile(r"`([^`\s]+)`")
INLINE_CODE = re.compile(r"`[^`\n]+`")
LINK = re.compile(r"\]\(([^)\s#]+)(?:#[^)]*)?\)")
TOP = {p.name for p in ROOT.iterdir()}


def words_written(text):
    kept = []
    for line in COMMENT.sub("", text).splitlines():
        s = line.strip()
        if not s or s.startswith(("#", "|")) or "TODO(" in s:
            continue
        kept.append(s)
    return len(" ".join(kept).split())


def resolves(rel, base):
    rel = re.sub(r":\d+(-\d+)?$", "", rel)          # path:12 or path:12-30
    path = (base / rel) if not rel.split("/")[0] in TOP else ROOT / rel
    return bool(glob.glob(str(path))) if "*" in rel else path.exists()


def ignored(rel):
    r = subprocess.run(["git", "check-ignore", "-q", rel], cwd=ROOT)
    return r.returncode == 0


def main():
    final = "--final" in sys.argv[1:]
    files = sorted(FINAL.glob("*.md"))
    keys = set(KEY_ROW.findall((FINAL / "08-references.md").read_text()))
    errors, warnings = [], []

    print(f"{'file':34} {'budget':>7} {'written':>8}  open TODOs")
    total_budget = total_written = 0
    for f in files:
        text = f.read_text()
        m = BUDGET.search(text)
        budget = int(m.group(1).replace(",", "")) if m else None
        written = words_written(text)
        prose = INLINE_CODE.sub("", text)    # `TODO(…)` / `[@key]` in backticks are examples
        todos = TODO.findall(prose)
        if f.name in COUNTED:
            if budget is None:
                errors.append(f"{f.name}: counted chapter has no 'Budget ≈N words' note")
            total_budget += budget or 0
            total_written += written
        tally = ", ".join(f"{k}×{todos.count(k)}" for k in sorted(set(todos))) or "—"
        print(f"{f.name:34} {budget if budget else '':>7} {written:>8}  {tally}")

        for rel in TICK.findall(text):
            head = rel.split("/")[0]
            if head in TOP and "/" in rel or rel in TOP and "." in rel:
                if not resolves(rel, f.parent):
                    errors.append(f"{f.name}: path does not resolve: {rel}")
                elif not rel.startswith(".") and ignored(re.sub(r":\d+(-\d+)?$", "", rel).rstrip("/")):
                    warnings.append(f"{f.name}: git-ignored (not in a clone): {rel}")
        for rel in LINK.findall(text):
            if not rel.startswith(("http:", "https:", "mailto:")) and not (f.parent / rel).exists():
                errors.append(f"{f.name}: link does not resolve: {rel}")
        for key in CITE.findall(prose):
            if key not in keys:
                errors.append(f"{f.name}: citation key not in 08-references.md: {key}")
        if final:
            for marker, what in (("TODO(", "TODO marker"), ("[@", "unresolved citation"),
                                 ("TEMPLATE:", "template note")):
                if marker in prose:
                    errors.append(f"{f.name}: {what} remains")

    print(f"\ncounted chapters: budget {total_budget:,} words (plan {PLAN_WORDS:,}; "
          f"Canvas {MIN_WORDS:,}–{HARD_MAX:,}), written {total_written:,}")
    if total_budget > PLAN_WORDS:
        errors.append(f"chapter budgets sum to {total_budget:,}, over the plan of {PLAN_WORDS:,}")
    if total_written > HARD_MAX:
        errors.append(f"written core is {total_written:,} words, over the {HARD_MAX:,} hard limit")
    if final and total_written < MIN_WORDS:
        errors.append(f"written core is {total_written:,} words, under the {MIN_WORDS:,} minimum")

    for w in dict.fromkeys(warnings):
        print("warning:", w)
    for e in dict.fromkeys(errors):
        print("error:", e)
    print("OK" if not errors else f"{len(set(errors))} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
