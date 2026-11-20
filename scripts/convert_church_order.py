"""Convert CRCA Book of Church Order 2022.docx to clean Markdown and verify integrity."""

from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCX_PATH = REPO_ROOT / "CRCA Book of Church Order 2022.docx"
OUT_PATH = REPO_ROOT / "Church Order" / "01 - CRCA Church Order (2022).md"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"
NS = {"w": W_NS}

PART_TITLE_MAP = {
    "PART I": "Part I",
    "PART II": "Part II",
    "PART III": "Part III",
    "PART IV": "Part IV",
    "CONCLUSION": "Conclusion",
}


def extract_paragraph_text(p_elem: ET.Element, fn_map: dict[str, int]) -> str:
    """Extract paragraph text including tabs and footnote references."""
    parts: list[str] = []
    for elem in p_elem.iter():
        tag = elem.tag.split("}")[-1]
        if tag == "t" and elem.text:
            parts.append(elem.text)
        elif tag in ("tab", "br"):
            parts.append(" ")
        elif tag == "footnoteReference":
            fid = elem.attrib.get(W + "id", "")
            if fid not in fn_map:
                fn_map[fid] = len(fn_map) + 1
            parts.append(f"[^{fn_map[fid]}]")
    text = "".join(parts)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    return text


def load_footnotes_xml(z: zipfile.ZipFile) -> dict[str, str]:
    if "word/footnotes.xml" not in z.namelist():
        return {}
    fn_root = ET.fromstring(z.read("word/footnotes.xml"))
    out: dict[str, str] = {}
    for fn in fn_root.findall("w:footnote", NS):
        fid = fn.attrib.get(W + "id", "")
        if fid in ("-1", "0"):
            continue
        text = "".join(t.text or "" for t in fn.findall(".//w:t", NS)).strip()
        text = re.sub(r"\s+", " ", text)
        if text:
            out[fid] = text
    return out


def title_case_part(sub: str) -> str:
    minor = {"of", "the", "and"}
    words = sub.lower().split()
    out = []
    for i, w in enumerate(words):
        out.append(w.capitalize() if (i == 0 or w not in minor) else w)
    return " ".join(out)


def clean_clause_typos(text: str, current_art: int, last_clause_letter: str | None) -> tuple[str, str | None]:
    """Fix known .docx source typos deterministically and track clause letter progression."""
    text = text.replace("Part Ill:", "Part III:")
    text = text.replace("ordinarily' be held", "ordinarily be held")
    text = text.replace("(See Art 23.ƒ)", "(See Art 23.f)")

    # Art 23f: "f equip and encourage..." missing period
    if current_art == 23 and re.match(r"^f\s+equip\b", text):
        text = "f. " + text[2:].lstrip()

    m_alpha = re.match(r"^([a-z])\.\s*(.+)$", text)
    if m_alpha:
        letter = m_alpha.group(1)
        rest = m_alpha.group(2).strip()
        # Art 31 has two consecutive "d." clauses; second should be "e."
        if current_art == 31 and letter == "d" and last_clause_letter == "d":
            letter = "e"
        # Art 78 has "a.", "c.", "c." in .docx where official CRCA text is "a.", "b.", "c."
        elif current_art == 78 and letter == "c" and last_clause_letter == "a":
            letter = "b"
        return f"**{letter}.** {rest}", letter
    return text, last_clause_letter


def convert_church_order() -> str:
    if not DOCX_PATH.exists():
        raise FileNotFoundError(f"Source docx missing: {DOCX_PATH}")

    with zipfile.ZipFile(DOCX_PATH) as z:
        doc_root = ET.fromstring(z.read("word/document.xml"))
        fn_defs_by_id = load_footnotes_xml(z)

    body = doc_root.find("w:body", NS)
    if body is None:
        raise ValueError("No <w:body> found in docx")

    fn_map: dict[str, int] = {}
    raw_items: list[tuple[str, str]] = []
    for child in body:
        if child.tag != W + "p":
            continue
        pStyle = child.find("w:pPr/w:pStyle", NS)
        sname = pStyle.attrib.get(W + "val", "Normal") if pStyle is not None else "Normal"
        txt = extract_paragraph_text(child, fn_map)
        if txt:
            raw_items.append((sname, txt))

    if len(raw_items) < 5 or raw_items[0][1] != "CHURCH ORDER":
        raise ValueError(f"Unexpected docx opening: {raw_items[:4]}")

    blocks: list[str] = [
        "# Church Order of the Christian Reformed Churches of Australia",
        "*As approved at Synod 2022*",
    ]

    i = 4
    current_art = 0
    last_clause_letter: str | None = None
    bullet_buf: list[str] = []

    def flush_bullets() -> None:
        nonlocal bullet_buf
        if bullet_buf:
            blocks.append("\n".join(bullet_buf))
            bullet_buf = []

    while i < len(raw_items):
        style, txt = raw_items[i]

        # Skip duplicate Article 3 single-paragraph stub after verifying verbatim match with clause a.
        if (
            style == "2COArticle"
            and txt.startswith("Article 3 ")
            and i + 3 < len(raw_items)
            and raw_items[i + 1][0] == "2CObody"
            and raw_items[i + 2][0] == "2COArticle"
            and raw_items[i + 2][1] == txt
            and raw_items[i + 3][0] == "2COa-list"
        ):
            stub_body = raw_items[i + 1][1]
            clause_a = re.sub(r"^a\.\s*", "", raw_items[i + 3][1]).strip()
            if stub_body != clause_a:
                raise ValueError(
                    f"Article 3 stub differs from clause a:\n  stub: {stub_body}\n  a:    {clause_a}"
                )
            i += 2
            continue

        if style == "2COPartTitle":
            flush_bullets()
            last_clause_letter = None
            part_label = PART_TITLE_MAP.get(txt.upper(), title_case_part(txt))
            if i + 1 < len(raw_items) and raw_items[i + 1][0] in ("1Middletitle14", "2COPartTitle"):
                sub = title_case_part(raw_items[i + 1][1])
                blocks.append(f"## {part_label}: {sub}")
                i += 2
            else:
                blocks.append(f"## {part_label}")
                i += 1
            continue

        if style == "2COSectionTitle":
            flush_bullets()
            last_clause_letter = None
            sec_title = re.sub(r"\s+-\s+", " — ", txt)
            blocks.append(f"## {sec_title}")
            i += 1
            continue

        if style == "2COArticle":
            flush_bullets()
            last_clause_letter = None
            art_title = re.sub(r"^(Article\s+\d+)\s*[-–—]\s*", r"\1 — ", txt)
            m_art = re.match(r"^Article\s+(\d+)\b", art_title)
            current_art = int(m_art.group(1)) if m_art else current_art
            blocks.append(f"### {art_title}")
            i += 1
            continue

        if style == "2COa-list":
            formatted, new_letter = clean_clause_typos(txt, current_art, last_clause_letter)
            if formatted.startswith("**"):
                flush_bullets()
                last_clause_letter = new_letter
                blocks.append(formatted)
            else:
                bullet_buf.append(f"- {formatted}")
            i += 1
            continue

        if style == "2COi-list":
            cleaned = txt.replace("Part Ill:", "Part III:")
            m_roman = re.match(r"^([ivxlcdm]+)\.\s*(.+)$", cleaned, re.I)
            if m_roman:
                bullet_buf.append(f"- **{m_roman.group(1).lower()}.** {m_roman.group(2).strip()}")
            else:
                bullet_buf.append(f"- {cleaned}")
            i += 1
            continue

        flush_bullets()
        cleaned, _ = clean_clause_typos(txt, current_art, None)
        blocks.append(cleaned)
        i += 1

    flush_bullets()

    if fn_map:
        blocks.append("---")
        fn_lines = []
        for fid, num in sorted(fn_map.items(), key=lambda kv: kv[1]):
            if fid not in fn_defs_by_id:
                raise KeyError(f"Missing footnote text for w:id={fid}")
            fn_lines.append(f"[^{num}]: {fn_defs_by_id[fid]}")
        blocks.append("\n".join(fn_lines))

    return "\n\n".join(blocks) + "\n"


def verify_church_order(md_path: Path = OUT_PATH) -> int:
    errors: list[str] = []
    if not md_path.exists():
        print(f"ERROR: Missing {md_path}", file=sys.stderr)
        return 1

    raw = md_path.read_text(encoding="utf-8")
    if "\n---\n" in raw:
        body, fn_sec = raw.rsplit("\n---\n", 1)
    else:
        body, fn_sec = raw, ""

    arts = [int(m) for m in re.findall(r"^### Article (\d+) —", body, re.M)]
    if arts != list(range(1, 87)):
        errors.append(f"Expected Articles 1..86 in order, got len={len(arts)} diff={set(range(1,87)) ^ set(arts)}")

    refs = set(re.findall(r"\[\^([^\]]+)\](?!:)", body))
    defs = set(re.findall(r"^\[\^([^\]]+)\]:", fn_sec, re.M))
    if refs != {"1", "2", "3"} or defs != {"1", "2", "3"}:
        errors.append(f"Footnote mismatch: refs={sorted(refs)}, defs={sorted(defs)}")

    for bad in ("Ill:", "ƒ", "ordinarily'"):
        if bad in raw:
            errors.append(f"Found stray source typo: {bad!r}")

    missing_spaces = re.findall(r"^\*\*[a-z]\.\*\*[A-Za-z]", raw, re.M)
    if missing_spaces:
        errors.append(f"Missing spaces after clause markers: {missing_spaces}")

    # Check duplicate consecutive clause letters within any article
    cur_art = ""
    prev_letter = None
    for line in body.splitlines():
        if line.startswith("### Article "):
            cur_art = line
            prev_letter = None
        else:
            m = re.match(r"^\*\*([a-z])\.\*\*\s+", line)
            if m:
                if m.group(1) == prev_letter:
                    errors.append(f"Duplicate consecutive clause '{m.group(1)}.' in {cur_art}")
                prev_letter = m.group(1)

    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        return 1

    print(f"Church Order verified: {len(arts)} articles (1..86), {len(defs)} footnotes -> {md_path.relative_to(REPO_ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert CRCA Book of Church Order 2022.docx to Markdown.")
    parser.add_argument("--verify", action="store_true", help="Verify generated Markdown structure and footnotes.")
    args = parser.parse_args()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    md = convert_church_order()
    OUT_PATH.write_text(md, encoding="utf-8")
    print(f"Generated {OUT_PATH.relative_to(REPO_ROOT)} ({OUT_PATH.stat().st_size:,} bytes)")

    if args.verify:
        return verify_church_order(OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
