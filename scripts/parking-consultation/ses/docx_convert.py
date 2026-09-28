"""The technical report (.docx) as chapters and articles of markdown, plus its tables and figures.

Headings carry their number in the text ("4.4.\tΣτάθμευση ΑΜΕΑ") and use the Heading 1 / Heading 2
styles: level 1 is a chapter, level 2 an article. Everything before the first Heading 1 (cover, table
of contents) is skipped.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.hyperlink import Hyperlink
from docx.text.paragraph import Paragraph

HEADING_RE = re.compile(r"^\s*(\d+)(?:\.(\d+))?\.?\s*(.+?)\s*$")
CAPTION_RE = re.compile(r"^\s*(Εικόνα|Πίνακας)\s+(\d+)\.(\d+)\s*:?\s*(.*)$")
LOOSE_NUMBERED_RE = re.compile(r"^\s*\d+(\.\d+)?\.?\s+\S")


def _style_name(paragraph: Paragraph) -> str:
    return (paragraph.style.name if paragraph.style is not None else "") or ""


def _heading_level(paragraph: Paragraph) -> int | None:
    match = re.match(r"^Heading (\d)$", _style_name(paragraph))
    return int(match.group(1)) if match else None


def _list_level(paragraph: Paragraph) -> int | None:
    ppr = paragraph._p.pPr
    if ppr is not None and ppr.numPr is not None:
        ilvl = ppr.numPr.ilvl
        return int(ilvl.val) if ilvl is not None and ilvl.val is not None else 0
    if _style_name(paragraph).startswith("List"):
        return 0
    return None


def _formatted(text: str, bold: bool, italic: bool) -> str:
    """Markers around the words only; the run's own leading and trailing spaces stay outside."""
    core = text.strip()
    if not core or not (bold or italic):
        return text
    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    marker = "**" if bold else "*"
    return f"{lead}{marker}{core}{marker}{trail}"


def _paragraph_markdown(paragraph: Paragraph) -> str:
    # Word splits one formatted phrase into several runs; merge neighbours with the same formatting
    # so the markers wrap the phrase once.
    groups: list[tuple[bool, bool, str]] = []
    for item in paragraph.iter_inner_content():
        if isinstance(item, Hyperlink):
            label = item.text.strip()
            groups.append((False, False, f"[{label}]({item.address})" if item.address and label else label))
            continue
        key = (bool(item.bold), bool(item.italic))
        if groups and groups[-1][:2] == key:
            groups[-1] = (key[0], key[1], groups[-1][2] + item.text)
        else:
            groups.append((key[0], key[1], item.text))
    text = "".join(_formatted(t, b, i) for b, i, t in groups)
    return re.sub(r"[ \t]+", " ", text).strip()


def _image_blobs(paragraph: Paragraph, document) -> list[tuple[bytes, str]]:
    blobs = []
    for rid in paragraph._p.xpath(".//a:blip/@r:embed"):
        part = document.part.related_parts[rid]
        blobs.append((part.blob, part.partname.ext.lstrip(".") or "png"))
    return blobs


def _table_rows(table: Table) -> list[list[str]]:
    rows = []
    for row in table.rows:
        seen = set()
        cells = []
        for cell in row.cells:
            if id(cell._tc) in seen:  # a merged cell repeats across the columns it spans
                continue
            seen.add(id(cell._tc))
            cells.append(re.sub(r"\s+", " ", cell.text.replace("|", "\\|").replace("\n", "; ")).strip())
        rows.append(cells)
    return rows


def _table_markdown(title: str | None, header: list[str], rows: list[list[str]]) -> str:
    width = max(len(header), *(len(r) for r in rows)) if rows else len(header)
    pad = lambda cells: cells + [""] * (width - len(cells))  # noqa: E731
    lines = []
    if title:
        lines += [f"**{title}**", ""]
    lines.append("| " + " | ".join(pad(header)) + " |")
    lines.append("|" + "---|" * width)
    lines += ["| " + " | ".join(pad(r)) + " |" for r in rows]
    return "\n".join(lines)


PHOTO_JPEG_THRESHOLD_BYTES = 400_000


def _save_figure(blob: bytes, ext: str, figures_dir: Path, stem: str) -> str:
    """Charts stay PNG; a large photographic figure (satellite image) is re-encoded as JPEG."""
    if len(blob) > PHOTO_JPEG_THRESHOLD_BYTES:
        with Image.open(io.BytesIO(blob)) as image:
            name = f"{stem}.jpg"
            image.convert("RGB").save(figures_dir / name, "JPEG", quality=85, optimize=True)
            return name
    name = f"{stem}.{ext}"
    (figures_dir / name).write_bytes(blob)
    return name


def convert_docx(source: Path, figures_dir: Path, figure_url_prefix: str) -> dict:
    document = Document(str(source))
    chapters: list[dict] = []
    tables: list[dict] = []
    anomalies: list[str] = []
    figures_dir.mkdir(parents=True, exist_ok=True)

    current_chapter: dict | None = None
    current_article: dict | None = None
    pending_images: list[tuple[bytes, str]] = []
    figure_seq = 0
    section = ""

    def target() -> list[str] | None:
        if current_article is not None:
            return current_article["_lines"]
        if current_chapter is not None:
            return current_chapter["_prelude"]
        return None

    def flush_images(caption: str | None, number: str | None) -> None:
        nonlocal figure_seq
        lines = target()
        for blob, ext in pending_images:
            figure_seq += 1
            stem = f"fig-{number.replace('.', '-')}" if number else f"fig-{figure_seq}"
            name = _save_figure(blob, ext, figures_dir, stem)
            if lines is not None:
                lines.append(f"![{caption or name}]({figure_url_prefix}/{name})")
        pending_images.clear()

    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:tbl"):
            if current_chapter is None:
                continue
            rows = _table_rows(Table(child, document))
            rows = [r for r in rows if any(c for c in r)]
            if not rows:
                continue
            title = None
            if len(rows) > 1 and len(rows[0]) == 1:
                title, rows = rows[0][0], rows[1:]
            header, body_rows = rows[0], rows[1:]
            tables.append({"section": section, "title": title, "header": header, "rows": body_rows})
            lines = target()
            if lines is not None:
                lines.append(_table_markdown(title, header, body_rows))
            continue
        if child.tag != qn("w:p"):
            continue
        paragraph = Paragraph(child, document)
        level = _heading_level(paragraph)
        text = paragraph.text.strip()
        images = _image_blobs(paragraph, document)
        if images:
            pending_images.extend(images)
            if not text:
                continue

        if level in (1, 2):
            # Images waiting for a caption belong to the section that is ending, not the next one.
            if pending_images:
                flush_images(None, None)
            match = HEADING_RE.match(text)
            if not match:
                anomalies.append(f"heading without a number: '{text}'")
                continue
            if level == 1:
                current_chapter = {"num": int(match.group(1)), "title": match.group(3), "_prelude": [], "articles": []}
                current_article = None
                chapters.append(current_chapter)
                section = match.group(1)
            else:
                if current_chapter is None:
                    anomalies.append(f"article before any chapter: '{text}'")
                    continue
                num = int(match.group(2)) if match.group(2) else len(current_chapter["articles"]) + 1
                current_article = {"num": num, "title": match.group(3), "_lines": []}
                current_chapter["articles"].append(current_article)
                section = f"{match.group(1)}.{num}"
            continue
        if current_chapter is None:
            continue  # cover page and table of contents

        if level is not None and level >= 3 and text:
            lines = target()
            if lines is not None:
                lines.append(f"#### {text}")
            continue

        caption = CAPTION_RE.match(text)
        if caption:
            number = f"{caption.group(2)}.{caption.group(3)}"
            if caption.group(1) == "Εικόνα" and pending_images:
                flush_images(f"Εικόνα {number}", number)
            lines = target()
            if lines is not None:
                lines.append(f"*{text}*")
            continue
        if pending_images:
            flush_images(None, None)
        if not text:
            continue
        if LOOSE_NUMBERED_RE.match(text) and _list_level(paragraph) is None and len(text) < 80:
            anomalies.append(f"numbered paragraph without a heading style in §{section}: '{text}'")
        markdown = _paragraph_markdown(paragraph)
        list_level = _list_level(paragraph)
        lines = target()
        if lines is None:
            continue
        if list_level is not None:
            lines.append("  " * list_level + "- " + markdown)
        else:
            lines.append(markdown)

    if pending_images:
        flush_images(None, None)

    def join(lines: list[str]) -> str:
        out: list[str] = []
        for line in lines:
            if line.startswith("- ") or line.startswith("  "):
                out.append(line)
            else:
                if out and (out[-1].startswith("- ") or out[-1].startswith("  ")):
                    out.append("")
                out.append(line)
                out.append("")
        return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"

    for chapter in chapters:
        chapter["preludeMd"] = join(chapter.pop("_prelude"))
        for article in chapter["articles"]:
            article["bodyMd"] = join(article.pop("_lines"))

    numbers = [c["num"] for c in chapters]
    if numbers != list(range(1, len(numbers) + 1)):
        anomalies.append(f"chapter numbering is {numbers}")
    return {
        "source": {"file": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()},
        "chapters": chapters,
        "tables": tables,
        "anomalies": anomalies,
    }


def write_report(report: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
