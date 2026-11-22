"""Fetch and convert CRCNA 'Our World Belongs to God' (2008) to clean Markdown."""

from __future__ import annotations

import argparse
import html as html_lib
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = "https://www.crcna.org/welcome/beliefs/contemporary-testimony/our-world-belongs-god"
OUT_PATH = (
    REPO_ROOT
    / "Creeds and Confessions"
    / "03 - Contemporary Testimony"
    / "01 - Our World Belongs to God.md"
)

EXPECTED_HEADINGS = [
    "Introduction",
    "Preamble",
    "Creation",
    "Fall",
    "Redemption",
    "Christ",
    "The Spirit",
    "Revelation",
    "God's New People",
    "The Mission of God's People",
    "New Creation",
]

CREDIT_LINE = (
    "© 2008, Christian Reformed Church in North America, Grand Rapids MI. "
    "www.crcna.org. Reprinted with permission."
)


def strip_tags(fragment: str) -> str:
    txt = html_lib.unescape(re.sub(r"<[^>]+>", "", fragment))
    txt = txt.replace("\u00a0", " ")
    return re.sub(r"[ \t\r\n]+", " ", txt).strip()


def fetch_source_html(url: str = SOURCE_URL) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_stanza_lines(inner_html: str, expected_num: int) -> list[str]:
    raw_lines = re.split(r"<br\s*/?>", inner_html, flags=re.I)
    lines = [strip_tags(seg) for seg in raw_lines]
    lines = [ln for ln in lines if ln]
    prefix = f"{expected_num}. "
    if not lines or not lines[0].startswith(prefix):
        raise ValueError(f"Expected stanza {expected_num} prefix, got: {lines[:1]}")
    lines[0] = f"**{expected_num}.** " + lines[0][len(prefix):]
    return lines


def convert_owbg(source_html: str) -> str:
    body_blocks = re.findall(
        r'<div class="field field-text-body">(.*?)</div>', source_html, re.S | re.I
    )
    if not body_blocks:
        raise ValueError("Could not locate text-body blocks on CRCNA page")

    main_block = next((b for b in body_blocks if "<h2>Preamble</h2>" in b), None)
    bg_block = next((b for b in body_blocks if "<h3>Background</h3>" in b), None)
    copy_block = next(
        (b for b in body_blocks if "<h3>Copyright and Permissions</h3>" in b), None
    )
    if not main_block or not bg_block or not copy_block:
        raise ValueError("Missing expected Preamble, Background, or Copyright blocks")

    bg_paras = re.findall(r"<p[^>]*>(.*?)</p>", bg_block, re.S | re.I)
    if not bg_paras:
        raise ValueError("Missing Background paragraph")
    bg_text = strip_tags(bg_paras[0]).replace(
        "Our World Belongs to God", "*Our World Belongs to God*", 1
    )

    copy_text = strip_tags(copy_block)
    if "Christian Reformed Church in North America" not in copy_text or "2008" not in copy_text:
        raise ValueError(f"Unexpected copyright text: {copy_text}")

    blocks: list[str] = [
        "# Our World Belongs to God: A Contemporary Testimony",
        "## Introduction",
        bg_text,
        f"> {CREDIT_LINE}",
    ]

    elems = re.findall(r"<(h2|p)[^>]*>(.*?)</\1>", main_block, re.S | re.I)
    footnotes: list[tuple[int, str]] = []
    expected_num = 1
    i = 0

    while i < len(elems):
        tag, inner = elems[i]
        if tag.lower() == "h2":
            heading = strip_tags(inner)
            blocks.append(f"## {heading}")
            i += 1
            continue

        plain_start = strip_tags(inner)
        m_num = re.match(r"^(\d+)\.\s+", plain_start)
        if not m_num:
            raise ValueError(f"Unexpected non-stanza paragraph at index {i}: {plain_start[:80]}")

        num = int(m_num.group(1))
        if num != expected_num:
            raise ValueError(f"Expected stanza {expected_num}, found {num}")
        expected_num += 1

        stanza_lines = parse_stanza_lines(inner, num)

        if i + 1 < len(elems) and elems[i + 1][0].lower() == "p":
            next_plain = strip_tags(elems[i + 1][1])
            if not re.match(r"^\d+\.\s+", next_plain):
                footnotes.append((num, next_plain))
                stanza_lines[-1] = f"{stanza_lines[-1]}[^{num}]"
                i += 1

        blocks.append("  \n".join(stanza_lines))
        i += 1

    if expected_num != 59:
        raise ValueError(f"Expected 58 stanzas, processed {expected_num - 1}")

    blocks.append("---")
    blocks.append("\n".join(f"[^{num}]: {note}" for num, note in footnotes))
    return "\n\n".join(blocks) + "\n"


def verify_owbg(md_path: Path = OUT_PATH) -> int:
    errors: list[str] = []
    if not md_path.exists():
        print(f"ERROR: Missing {md_path}", file=sys.stderr)
        return 1

    raw = md_path.read_text(encoding="utf-8")
    if "\n---\n" not in raw:
        print("ERROR: Missing footnote separator ---", file=sys.stderr)
        return 1

    body, fn_sec = raw.rsplit("\n---\n", 1)
    headings = re.findall(r"^##\s+(.+)$", body, re.M)
    if headings != EXPECTED_HEADINGS:
        errors.append(f"Headings mismatch: {headings} != {EXPECTED_HEADINGS}")

    stanzas = [int(m) for m in re.findall(r"^\*\*(\d+)\.\*\*\s+", body, re.M)]
    if stanzas != list(range(1, 59)):
        errors.append(f"Expected stanzas 1..58, got {stanzas}")

    expected_fns = [n for n in range(1, 59) if n != 6]
    refs = [int(m) for m in re.findall(r"\[\^(\d+)\](?!:)", body)]
    defs = [int(m) for m in re.findall(r"^\[\^(\d+)\]:\s+\S", fn_sec, re.M)]
    if refs != expected_fns:
        errors.append(f"Footnote refs mismatch: len={len(refs)} diff={set(expected_fns) ^ set(refs)}")
    if defs != expected_fns:
        errors.append(f"Footnote defs mismatch: len={len(defs)} diff={set(expected_fns) ^ set(defs)}")

    if CREDIT_LINE not in body:
        errors.append("Missing required CRCNA credit line")

    for bad in ("<br", "<p>", "&nbsp;", "\u00a0", "\ufffd"):
        if bad in raw:
            errors.append(f"Found unexpected artifact {bad!r}")

    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        return 1

    print(
        f"OWBG verified: {len(headings)} headings, {len(stanzas)} stanzas, {len(defs)} footnotes -> {md_path.relative_to(REPO_ROOT)}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert CRCNA Our World Belongs to God to Markdown.")
    parser.add_argument("--verify", action="store_true", help="Verify generated Markdown structure.")
    args = parser.parse_args()

    source_html = fetch_source_html()
    md = convert_owbg(source_html)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="\n") as f:
        f.write(md)
    print(f"Generated {OUT_PATH.relative_to(REPO_ROOT)} ({OUT_PATH.stat().st_size:,} bytes)")

    if args.verify:
        return verify_owbg(OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
