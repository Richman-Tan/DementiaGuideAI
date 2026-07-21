#!/usr/bin/env python3
"""
Convert the mid-year report Markdown draft into an IEEE single-column Word (.docx).

Handles the Markdown subset this draft uses: ATX headings, inline **bold** /
*italic* / `code`, pipe tables, images (with their figure captions), blockquotes,
horizontal rules, and bullet/numbered lists. Not a general Markdown engine —
scoped to docs/report/results-discussion-conclusion-draft.md.

Styling follows the IEEE single-column manuscript convention: Times New Roman,
10 pt justified body, bold numbered headings, centred title/author block, and
figures/tables sized to the text column.

Usage:  python3 scripts/report-to-docx.py [input.md] [output.docx]
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
IN = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/report/results-discussion-conclusion-draft.md"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "docs/report/DementiaGuide_MidYear_Report.docx"

FONT = "Times New Roman"
COL_WIDTH_IN = 6.5  # letter (8.5) minus 1" margins each side

INLINE = re.compile(r"(\*\*.+?\*\*|\*[^*]+?\*|`[^`]+?`)")
IMG = re.compile(r"^!\[.*?\]\((.+?)\)\s*$")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def set_font(run, size=None, bold=None, italic=None, mono=False, color=None):
    run.font.name = "Consolas" if mono else FONT
    # ensure east-asian/complex runs also use the font
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs"):
        rfonts.set(qn(attr), "Consolas" if mono else FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if color is not None:
        run.font.color.rgb = color


def add_inline(paragraph, text, size=10, base_bold=None, base_italic=None):
    """Render inline markdown (**bold**, *italic*, `code`) into a paragraph."""
    for tok in INLINE.split(text):
        if not tok:
            continue
        if tok.startswith("**") and tok.endswith("**") and len(tok) > 4:
            r = paragraph.add_run(tok[2:-2]); set_font(r, size, bold=True, italic=base_italic)
        elif tok.startswith("`") and tok.endswith("`") and len(tok) > 2:
            r = paragraph.add_run(tok[1:-1]); set_font(r, size - 0.5, mono=True, italic=base_italic)
        elif tok.startswith("*") and tok.endswith("*") and len(tok) > 2:
            r = paragraph.add_run(tok[1:-1]); set_font(r, size, bold=base_bold, italic=True)
        else:
            r = paragraph.add_run(tok); set_font(r, size, bold=base_bold, italic=base_italic)


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def main():
    lines = IN.read_text().splitlines()
    doc = Document()

    # Base document styling.
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10)
    for sec in doc.sections:
        sec.top_margin = sec.bottom_margin = Inches(1)
        sec.left_margin = sec.right_margin = Inches(1)

    caption_re = re.compile(r"^\*\*(Figure|Table)\s")
    i = 0
    in_title_block = True
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # blank
        if not stripped:
            i += 1
            continue

        # horizontal rule
        if re.match(r"^-{3,}$", stripped):
            in_title_block = False
            i += 1
            continue

        # heading
        m = HEADING.match(stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2)
            p = doc.add_paragraph()
            if level == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_after = Pt(6)
                add_inline(p, text, size=18, base_bold=True)
            else:
                p.paragraph_format.space_before = Pt(10)
                p.paragraph_format.space_after = Pt(4)
                add_inline(p, text, size=12 if level == 2 else 11, base_bold=True)
            i += 1
            continue

        # image  ->  centred picture (+ following caption paragraph)
        im = IMG.match(stripped)
        if im:
            path = (IN.parent / im.group(1)).resolve()
            if path.exists():
                p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(str(path), width=Inches(COL_WIDTH_IN))
            i += 1
            continue

        # blockquote (possibly multi-line)
        if stripped.startswith(">"):
            buff = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buff.append(lines[i].strip()[1:].strip())
                i += 1
            text = " ".join(x for x in buff if x)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            p.paragraph_format.right_indent = Inches(0.3)
            p.paragraph_format.space_after = Pt(6)
            add_inline(p, text, size=9, base_italic=True)
            continue

        # table
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?[\s:|-]+\|?$", lines[i + 1].strip()):
            header = split_row(lines[i])
            i += 2  # skip header + separator
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            ncol = len(header)
            table = doc.add_table(rows=1, cols=ncol)
            table.style = "Table Grid"
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            for c, cell_text in enumerate(header):
                cell = table.rows[0].cells[c]
                cell.paragraphs[0].text = ""
                add_inline(cell.paragraphs[0], cell_text, size=9, base_bold=True)
            for row in rows:
                cells = table.add_row().cells
                for c in range(ncol):
                    cell = cells[c]
                    cell.paragraphs[0].text = ""
                    add_inline(cell.paragraphs[0], row[c] if c < len(row) else "", size=9)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
            continue

        # list item(s)
        if re.match(r"^(\-|\d+\.)\s+", stripped):
            while i < len(lines) and re.match(r"^(\-|\d+\.)\s+", lines[i].strip()):
                item = lines[i].strip()
                ordered = bool(re.match(r"^\d+\.", item))
                content = re.sub(r"^(\-|\d+\.)\s+", "", item)
                p = doc.add_paragraph(style="List Number" if ordered else "List Bullet")
                add_inline(p, content, size=10)
                i += 1
            continue

        # plain paragraph (caption / author block get special alignment)
        p = doc.add_paragraph()
        if caption_re.match(stripped):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            add_inline(p, stripped, size=9)
        elif in_title_block and (stripped.startswith("**Author:**") or stripped.startswith("**Report:**")):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            add_inline(p, stripped, size=11)
        else:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            add_inline(p, stripped, size=10)
        i += 1

    doc.save(OUT)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
