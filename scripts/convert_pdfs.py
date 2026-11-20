"""Convert the 3 CRCA Confession PDFs to clean Markdown and verify Creeds & Confessions."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

import pymupdf

REPO_ROOT = Path(__file__).resolve().parent.parent
CREEDS_DIR = REPO_ROOT / "Creeds and Confessions" / "01 - Ecumenical Creeds"
CONFESSIONS_DIR = REPO_ROOT / "Creeds and Confessions" / "02 - Reformed Confessions"

KEEP_HYPHEN_COMPOUNDS = {"office-bearers", "self-assured"}


def clean_str(s: str) -> str:
    return s.replace("\xad", "").replace("\xa0", " ")


def join_prose_lines(lines: list[str]) -> str:
    """Join wrapped PDF lines into clean prose, handling soft line-break hyphens and em-dashes."""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if not out:
            out = line
            continue
        m_prev = re.search(r"([A-Za-z]+)-$", out)
        m_next = re.match(r"^([A-Za-z]+)", line)
        if m_prev and m_next:
            compound = f"{m_prev.group(1)}-{m_next.group(1)}".lower()
            if compound in KEEP_HYPHEN_COMPOUNDS:
                out += line
            else:
                out = out[:-1] + line
        elif out.endswith("—") and not out.endswith(" —"):
            out += line
        else:
            out += " " + line
    out = re.sub(r" {2,}", " ", out).strip()
    return out


def extract_page_lines(page: pymupdf.Page, merge_same_y: bool = False) -> list[dict[str, Any]]:
    """Extract normalized text lines from a PyMuPDF page dict, sorted top-to-bottom."""
    raw_lines: list[dict[str, Any]] = []
    d = page.get_text("dict")
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = []
            for sp in line.get("spans", []):
                txt = clean_str(sp["text"])
                if not txt:
                    continue
                if "SC700" in sp["font"]:
                    txt = txt.upper()
                spans.append(
                    {
                        "text": txt,
                        "size": round(sp["size"], 2),
                        "flags": sp["flags"],
                        "font": sp["font"],
                        "x0": sp["bbox"][0],
                        "y0": sp["bbox"][1],
                        "origin_y": sp["origin"][1],
                    }
                )
            if not spans:
                continue
            full_text = "".join(s["text"] for s in spans)
            if not full_text.strip():
                continue
            baseline_y = max(s["origin_y"] for s in spans)
            raw_lines.append(
                {
                    "y0": line["bbox"][1],
                    "y1": line["bbox"][3],
                    "origin_y": baseline_y,
                    "x0": spans[0]["x0"],
                    "spans": spans,
                    "text": full_text,
                }
            )

    raw_lines.sort(key=lambda r: (round(r["origin_y"], 1), round(r["x0"], 1)))

    if not merge_same_y or not raw_lines:
        return raw_lines

    merged: list[dict[str, Any]] = [raw_lines[0]]
    for ln in raw_lines[1:]:
        prev = merged[-1]
        if abs(ln["origin_y"] - prev["origin_y"]) <= 2.0:
            combined_spans = sorted(prev["spans"] + ln["spans"], key=lambda s: s["x0"])
            prev["spans"] = combined_spans
            prev["text"] = "".join(s["text"] for s in combined_spans)
            prev["x0"] = combined_spans[0]["x0"]
            prev["y0"] = min(prev["y0"], ln["y0"])
            prev["y1"] = max(prev["y1"], ln["y1"])
        else:
            merged.append(ln)
    return merged


# ---------------------------------------------------------------------------
# 1. BELGIC CONFESSION
# ---------------------------------------------------------------------------

def _belgic_render_line(line: dict[str, Any], art_ctx: int) -> str:
    parts: list[str] = []
    for sp in line["spans"]:
        t = sp["text"]
        sz = sp["size"]
        if sz == 5.83 and t.strip().isdigit():
            parts.append(f"[^{t.strip()}]")
        else:
            if art_ctx == 4 and "Jeremiah*" in t:
                t = t.replace("Jeremiah*", "Jeremiah[^art4-note]")
            elif art_ctx == 36:
                t = t.replace("[RCA only***", "[RCA only[^art36-3]")
                t = t.replace("[CRC only**", "[CRC only[^art36-2]")
                t = t.replace("[RCA only*", "[RCA only[^art36-1]")
            parts.append(t)
    return "".join(parts).strip()


def convert_belgic() -> str:
    doc = pymupdf.open(REPO_ROOT / "CRCA BelgicConfession.pdf")
    footnotes: dict[str, str] = {}
    body_events: list[tuple[str, Any]] = []

    current_fn_key: str | None = None
    art_ctx = 0
    in_art4_list = False
    in_art6_list = False

    prev_page_last_y: float | None = None
    prev_page_last_text = ""

    for pno, page in enumerate(doc):
        lines = extract_page_lines(page, merge_same_y=True)
        prev_body_y: float | None = None
        first_body_on_page = True

        for ln in lines:
            y0 = ln["origin_y"]
            x0 = ln["x0"]
            txt = ln["text"].strip()
            sizes = {s["size"] for s in ln["spans"]}
            fonts = {s["font"] for s in ln["spans"]}

            if sizes == {7.0} and ln["y0"] > 615 and txt.isdigit():
                continue
            if pno == 0 and sizes == {18.0}:
                continue

            if sizes <= {4.37, 4.66, 7.5}:
                first_sp = ln["spans"][0]
                if first_sp["size"] in (4.37, 4.66) and first_sp["text"].strip().isdigit():
                    fn_num = first_sp["text"].strip()
                    rest = "".join(s["text"] for s in ln["spans"][1:]).strip()
                    current_fn_key = fn_num
                    footnotes[current_fn_key] = rest
                elif txt.startswith("***"):
                    current_fn_key = "art36-3"
                    footnotes[current_fn_key] = txt[3:].strip()
                elif txt.startswith("**"):
                    current_fn_key = "art36-2"
                    footnotes[current_fn_key] = txt[2:].strip()
                elif txt.startswith("*"):
                    current_fn_key = "art4-note" if pno < 10 else "art36-1"
                    footnotes[current_fn_key] = txt[1:].strip()
                elif current_fn_key is not None:
                    footnotes[current_fn_key] = join_prose_lines([footnotes[current_fn_key], txt])
                continue

            current_fn_key = None

            is_semibold = fonts == {"StoneSerifLT-Semibold"} and sizes == {10.0}
            if is_semibold and (txt == "Introduction" or re.match(r"^Article\s+\d+:", txt)):
                in_art4_list = False
                in_art6_list = False
                if txt == "Introduction":
                    body_events.append(("h2", "Introduction"))
                else:
                    art_ctx = int(re.match(r"^Article\s+(\d+):", txt).group(1))
                    body_events.append(("h2", txt))
                prev_body_y = y0
                first_body_on_page = False
                continue

            rendered = _belgic_render_line(ln, art_ctx)

            is_new_para = False
            if first_body_on_page and prev_page_last_text:
                ends_sentence = bool(re.search(r'[.?!”"\]](\[\^[^\]]+\])?$', prev_page_last_text))
                if (
                    prev_page_last_y is not None
                    and prev_page_last_y < 570
                    and ends_sentence
                ) or rendered.startswith("[RCA only") or rendered.startswith("[CRC only"):
                    is_new_para = True
                elif ends_sentence and (
                    rendered.startswith("For ")
                    or rendered.startswith("All these")
                    or rendered.startswith("Moses says")
                    or rendered.startswith("Moreover")
                    or rendered.startswith("But Jesus")
                    or rendered.startswith("In fact")
                    or rendered.startswith("Yet ")
                    or rendered.startswith("Therefore")
                    or rendered.startswith("By this")
                    or rendered.startswith("The other")
                    or rendered.startswith("And as for")
                    or rendered.startswith("The Son ")
                    or rendered.startswith("This is also")
                    or rendered.startswith("These are")
                    or rendered.startswith("And so")
                ):
                    is_new_para = True
            elif prev_body_y is not None and (y0 - prev_body_y) >= 18.0:
                is_new_para = True
            elif art_ctx == 0 and x0 >= 53.0:
                is_new_para = True

            # Article 4 (canonical books) list formatting
            if art_ctx == 4:
                if txt.startswith("In the Old Testament") or txt.startswith("In the New Testament"):
                    in_art4_list = True
                    body_events.append(("para_break", None))
                    body_events.append(("line", rendered))
                    prev_body_y = y0
                    first_body_on_page = False
                    continue
                if in_art4_list:
                    if x0 <= 50 and not txt.startswith("and then"):
                        body_events.append(("list_item", rendered))
                    elif x0 <= 50 and txt.startswith("and then"):
                        body_events.append(("list_item", rendered))
                    elif x0 <= 55 and txt.startswith("the ") or txt.startswith("and the Revelation"):
                        body_events.append(("list_item", rendered))
                    else:
                        body_events.append(("list_cont", rendered))
                    prev_body_y = y0
                    first_body_on_page = False
                    continue

            # Article 6 (apocryphal books) list formatting
            if art_ctx == 6:
                if txt == "which are the third and fourth books of Esdras;":
                    in_art6_list = True
                    body_events.append(("line", rendered))
                    prev_body_y = y0
                    first_body_on_page = False
                    continue
                if in_art6_list:
                    if txt.startswith("The church may"):
                        in_art6_list = False
                        body_events.append(("para_break", None))
                    else:
                        body_events.append(("list_item", rendered))
                        prev_body_y = y0
                        first_body_on_page = False
                        continue

            if is_new_para:
                body_events.append(("para_break", None))

            body_events.append(("line", rendered))
            prev_body_y = y0
            first_body_on_page = False

        body_only = [
            ln for ln in lines
            if not (({s["size"] for s in ln["spans"]} <= {4.37, 4.66, 7.5}) or ({s["size"] for s in ln["spans"]} == {7.0} and ln["y0"] > 615))
        ]
        if body_only:
            prev_page_last_y = body_only[-1]["origin_y"]
            prev_page_last_text = _belgic_render_line(body_only[-1], art_ctx)

    md_blocks: list[str] = ["# The Belgic Confession"]
    line_buf: list[str] = []
    list_buf: list[str] = []
    in_variant_quote: str | None = None

    def flush_prose() -> None:
        nonlocal line_buf, in_variant_quote
        if not line_buf:
            return
        text = join_prose_lines(line_buf)
        line_buf = []
        if not text:
            return

        m_var = re.match(r"^\[(RCA only|CRC only)(\[\^art36-\d+\])\s*(.*)$", text)
        if m_var:
            label, fn_ref, rest = m_var.group(1), m_var.group(2), m_var.group(3)
            in_variant_quote = label
            if rest.endswith("]"):
                rest = rest[:-1].rstrip()
                in_variant_quote = None
            quote_lines = [f"> *[{label}]*{fn_ref}"]
            if rest:
                quote_lines.append(">")
                quote_lines.append(f"> {rest}")
            md_blocks.append("\n".join(quote_lines))
            return

        if in_variant_quote:
            if text.endswith("]"):
                text = text[:-1].rstrip()
                in_variant_quote = None
            md_blocks[-1] += f"\n>\n> {text}"
            return

        md_blocks.append(text)

    def flush_list() -> None:
        nonlocal list_buf
        if not list_buf:
            return
        md_blocks.append("\n".join(list_buf))
        list_buf = []

    for kind, val in body_events:
        if kind == "h2":
            flush_prose()
            flush_list()
            in_variant_quote = None
            md_blocks.append(f"## {val}")
        elif kind == "para_break":
            flush_prose()
            flush_list()
        elif kind == "line":
            flush_list()
            line_buf.append(val)
        elif kind == "list_item":
            flush_prose()
            list_buf.append(f"- {val}")
        elif kind == "list_cont":
            if list_buf:
                list_buf[-1] = join_prose_lines([list_buf[-1], val])
            else:
                line_buf.append(val)

    flush_prose()
    flush_list()

    md_blocks.append("---")
    fn_lines: list[str] = []
    for n in range(1, 88):
        k = str(n)
        if k in footnotes:
            fn_lines.append(f"[^{k}]: {footnotes[k]}")
    for k in ("art4-note", "art36-1", "art36-2", "art36-3"):
        if k in footnotes:
            fn_lines.append(f"[^{k}]: {footnotes[k]}")
    md_blocks.append("\n".join(fn_lines))

    return "\n\n".join(md_blocks) + "\n"


# ---------------------------------------------------------------------------
# 2. HEIDELBERG CATECHISM
# ---------------------------------------------------------------------------

def convert_heidelberg() -> str:
    doc = pymupdf.open(REPO_ROOT / "CRCA HeidelbergCatechism.pdf")
    footnotes: list[tuple[str, str]] = []
    footnote_map: dict[str, str] = {}

    def add_fn(key: str, text: str) -> None:
        if key not in footnote_map:
            footnote_map[key] = text
            footnotes.append((key, text))

    def update_fn(key: str, text: str) -> None:
        footnote_map[key] = text
        for i, (k, _) in enumerate(footnotes):
            if k == key:
                footnotes[i] = (key, text)
                break

    current_q = 0
    current_fn_key: str | None = None
    state = "intro"

    md_blocks: list[str] = ["# The Heidelberg Catechism"]
    buf_lines: list[str] = []

    def render_hb_line(ln: dict[str, Any], qnum: int, is_q_start: bool = False) -> str:
        parts: list[str] = []
        for idx, sp in enumerate(ln["spans"]):
            t = sp["text"]
            sz = sp["size"]
            if sz == 5.83 and t.strip().isdigit():
                parts.append(f"[^q{qnum}-{t.strip()}]")
            elif sz == 5.83 and t.strip() == "*":
                parts.append("[^q80-note1]")
            else:
                if qnum == 77:
                    t = t.replace("[broken]*", "[broken][^q77-note]")
                elif qnum == 80:
                    if is_q_start and "80*" in t:
                        t = t.replace("80*", "80")
                    t = t.replace("idolatry.]**", "idolatry.][^q80-note2]").replace("]*", "][^q80-note2]")
                elif qnum == 119:
                    t = t.replace("evil one.*", "evil one.[^q119-note1]")
                    if t.strip() == "**" and idx > 0:
                        t = "[^q119-note2]"
                    else:
                        t = t.replace("Amen.1**", "Amen.[^q119-1][^q119-note2]")
                        t = t.replace("**", "[^q119-note2]")
                parts.append(t)
        return "".join(parts)

    def flush_buf() -> None:
        nonlocal buf_lines, state
        if not buf_lines:
            return
        if state == "intro":
            md_blocks.append(join_prose_lines(buf_lines))
        elif state == "q":
            q_text = join_prose_lines(buf_lines)
            # Extract trailing footnotes so bold wraps only the question text
            m_tail_fn = re.search(r"((\[\^[^\]]+\])+)$", q_text)
            if m_tail_fn:
                core = q_text[: m_tail_fn.start()].rstrip()
                tail = m_tail_fn.group(1)
                md_blocks.append(f"**Q. {current_q}. {core}**{tail}")
            elif current_q == 80:
                md_blocks.append(f"**Q. {current_q}.**[^q80-note1] **{q_text}**")
            else:
                md_blocks.append(f"**Q. {current_q}. {q_text}**")
        elif state == "a":
            if current_q in (23, 119):
                lines_clean = [re.sub(r" {2,}", " ", l).strip() for l in buf_lines if l.strip()]
                if lines_clean:
                    md_blocks.append("  \n".join(lines_clean))
            elif current_q == 92:
                joined: list[str] = []
                for l in buf_lines:
                    s = re.sub(r" {2,}", " ", l).strip()
                    if re.match(r"^THE\s+\w+\s+COMMANDMENT$", s):
                        if joined:
                            md_blocks.append("  \n".join(joined))
                            joined = []
                        md_blocks.append(f"**{s}**")
                    elif s.startswith("**A.**"):
                        md_blocks.append(s)
                    else:
                        joined.append(s)
                if joined:
                    md_blocks.append("  \n".join(joined))
            else:
                md_blocks.append(join_prose_lines(buf_lines))
        buf_lines = []

    prev_page_last_y: float | None = None
    prev_page_last_text = ""

    for pno, page in enumerate(doc):
        lines = extract_page_lines(page, merge_same_y=True)
        prev_body_y: float | None = None
        first_body_on_page = True

        for ln in lines:
            y0 = ln["origin_y"]
            x0 = ln["x0"]
            txt = ln["text"].strip()
            sizes = {s["size"] for s in ln["spans"]}
            fonts = {s["font"] for s in ln["spans"]}

            if sizes == {7.0} and ln["y0"] > 615 and txt.isdigit():
                continue
            if pno == 0 and sizes == {18.0}:
                continue

            # Detect footnote blocks: standard (4.37/4.66/7.5/8.0) OR rare (5.83 + 10.0 at left margin)
            is_rare_fn = (
                x0 <= 48.0
                and len(ln["spans"]) >= 2
                and ln["spans"][0]["size"] == 5.83
                and ln["spans"][0]["text"].strip().isdigit()
                and ln["spans"][1]["text"].startswith(" ")
            )
            if sizes <= {4.37, 4.66, 7.5, 8.0} or is_rare_fn:
                first_sp = ln["spans"][0]
                if first_sp["size"] in (4.37, 4.66, 5.83) and first_sp["text"].strip().isdigit():
                    fn_num = first_sp["text"].strip()
                    rest = "".join(s["text"] for s in ln["spans"][1:]).strip()
                    current_fn_key = f"q{current_q}-{fn_num}"
                    add_fn(current_fn_key, rest)
                elif txt.startswith("**"):
                    current_fn_key = "q80-note2" if current_q == 80 else "q119-note2"
                    add_fn(current_fn_key, txt[2:].strip())
                elif txt.startswith("*"):
                    if current_q == 77:
                        current_fn_key = "q77-note"
                    elif current_q == 80:
                        current_fn_key = "q80-note1"
                    elif current_q == 119:
                        current_fn_key = "q119-note1"
                    add_fn(current_fn_key, txt[1:].strip())
                elif current_fn_key is not None:
                    if txt.startswith("The Reformed Church in America") and current_fn_key == "q80-note2":
                        update_fn(current_fn_key, footnote_map[current_fn_key] + " " + txt)
                    else:
                        update_fn(current_fn_key, join_prose_lines([footnote_map[current_fn_key], txt]))
                continue

            current_fn_key = None

            if pno == 0 and fonts == {"StoneSerifLT-Semibold"} and txt == "Introduction":
                md_blocks.append("## Introduction")
                state = "intro"
                prev_body_y = y0
                first_body_on_page = False
                continue

            if fonts == {"StoneSerifLT-SemiboldIta"}:
                flush_buf()
                md_blocks.append(f"## {txt}")
                prev_body_y = y0
                first_body_on_page = False
                continue

            if fonts == {"StoneSerifLT-Semibold"} and re.match(r"^LORD’S DAY\s+\d+$", txt):
                flush_buf()
                ld_num = re.search(r"\d+", txt).group(0)
                md_blocks.append(f"### Lord's Day {ld_num}")
                prev_body_y = y0
                first_body_on_page = False
                continue

            m_q = re.match(r"^(\d+)(\*?)\s+Q\.\s*(.*)$", txt)
            if m_q and ln["spans"][0]["font"] == "StoneSerifLT-Semibold":
                flush_buf()
                current_q = int(m_q.group(1))
                state = "q"
                rendered = render_hb_line(ln, current_q, is_q_start=True)
                rendered_q = re.sub(r"^\d+\*?\s+Q\.\s*", "", rendered).strip()
                buf_lines.append(rendered_q)
                prev_body_y = y0
                first_body_on_page = False
                continue

            m_a = re.match(r"^A\.\s*(.*)$", txt)
            if m_a and ln["spans"][0]["font"] == "StoneSerifLT-Semibold":
                flush_buf()
                state = "a"
                rendered = render_hb_line(ln, current_q)
                rendered_a = re.sub(r"^A\.\s*", "", rendered).strip()
                buf_lines.append(f"**A.** {rendered_a}" if rendered_a else "**A.**")
                prev_body_y = y0
                first_body_on_page = False
                continue

            rendered = render_hb_line(ln, current_q)

            if state == "q":
                buf_lines.append(rendered)
            elif state == "intro":
                if (prev_body_y is not None and (y0 - prev_body_y) >= 18.0) or (buf_lines and x0 >= 53.0):
                    flush_buf()
                buf_lines.append(rendered)
            elif state == "a":
                is_para_break = False
                if current_q == 92 and re.match(r"^THE\s+\w+\s+COMMANDMENT$", txt):
                    is_para_break = True
                elif prev_body_y is not None and (y0 - prev_body_y) >= 18.0:
                    is_para_break = True
                elif first_body_on_page and prev_page_last_text and current_q != 92:
                    ends_sent = bool(re.search(r'[.?!”"](\[\^[^\]]+\])?$', prev_page_last_text))
                    if prev_page_last_y is not None and prev_page_last_y < 570 and ends_sent:
                        is_para_break = True
                    elif ends_sent and (
                        rendered.startswith("Second,")
                        or rendered.startswith("Third,")
                        or rendered.startswith("But it means")
                        or rendered.startswith("But more important")
                        or rendered.startswith("Rather, by grace")
                        or rendered.startswith("Even though")
                        or rendered.startswith("Hypocrites")
                        or rendered.startswith("The kingdom")
                        or rendered.startswith("God’s judgment")
                        or rendered.startswith("Such persons")
                        or rendered.startswith("In addition")
                        or rendered.startswith("Such oaths")
                        or rendered.startswith("And it means")
                        or rendered.startswith("Second, so that")
                    ):
                        is_para_break = True
                if is_para_break:
                    flush_buf()
                buf_lines.append(rendered)

            prev_body_y = y0
            first_body_on_page = False

        body_only = [
            ln for ln in lines
            if not (({s["size"] for s in ln["spans"]} <= {4.37, 4.66, 7.5, 8.0}) or ({s["size"] for s in ln["spans"]} == {7.0} and ln["y0"] > 615))
        ]
        if body_only:
            prev_page_last_y = body_only[-1]["origin_y"]
            prev_page_last_text = render_hb_line(body_only[-1], current_q)

    flush_buf()

    md_blocks.append("---")
    md_blocks.append("\n".join(f"[^{k}]: {v}" for k, v in footnotes))
    return "\n\n".join(md_blocks) + "\n"


# ---------------------------------------------------------------------------
# 3. CANONS OF DORT
# ---------------------------------------------------------------------------

def _dort_render_line(ln: dict[str, Any]) -> str:
    tokens: list[tuple[str, str]] = []
    for sp in ln["spans"]:
        t = sp["text"]
        sz = sp["size"]
        fl = sp["flags"]
        if sz == 6.96 and t.strip().isdigit():
            tokens.append(("fn", f"[^{int(t.strip()) - 460}]"))
        else:
            is_ital = bool(fl & 2) and sz >= 9.0
            kind = "ital" if is_ital else "norm"
            if tokens and tokens[-1][0] == kind:
                tokens[-1] = (kind, tokens[-1][1] + t)
            else:
                tokens.append((kind, t))

    out: list[str] = []
    for kind, t in tokens:
        if kind == "ital":
            stripped = t.strip()
            if not stripped:
                out.append(t)
            else:
                lead = t[: len(t) - len(t.lstrip())]
                trail = t[len(t.rstrip()) :]
                out.append(f"{lead}*{stripped}*{trail}")
        else:
            out.append(t)
    return "".join(out).strip()


def _fix_dort_typos(text: str) -> str:
    text = text.replace("entire -human", "entire human")
    text = text.replace("un-stable", "unstable")
    text = text.replace("Matthew 11:25 26", "Matthew 11:25-26")
    text = text.replace("Deuteronomy 10:14 15", "Deuteronomy 10:14-15")
    text = re.sub(r"\*\s+\*", " ", text)
    # Clean stray italic markers touching leading punctuation like "Likewise*: It" -> "Likewise: *It"
    text = re.sub(r"\*([,:;]+)\s+", r"\1 *", text)
    return text


def convert_dort() -> str:
    doc = pymupdf.open(REPO_ROOT / "CRCA CanonsofDort.pdf")
    footnotes: dict[int, str] = {}
    intro_paras: list[str] = []

    in_intro = False
    in_footnotes = False
    current_fn_num: int | None = None
    in_conclusion = False

    events: list[tuple[str, Any]] = []
    para_buf: list[str] = []
    expect_article_subtitle = False
    pending_article_num = ""
    pending_heading_lines: list[str] = []
    pending_heading_kind: str | None = None

    def flush_heading_lines() -> None:
        nonlocal pending_heading_lines, pending_heading_kind
        if not pending_heading_lines or not pending_heading_kind:
            return
        if pending_heading_kind == "main":
            first = re.sub(r"^The\s+", "", pending_heading_lines[0])
            rest = " ".join(pending_heading_lines[1:]).strip()
            events.append(("h2", f"{first}: {rest}" if rest else first))
        elif pending_heading_kind == "reject":
            events.append(("h3", " ".join(pending_heading_lines).strip()))
        elif pending_heading_kind == "conclusion":
            first = pending_heading_lines[0]
            rest = " ".join(pending_heading_lines[1:]).strip()
            events.append(("h2", f"{first}: {rest}" if rest else first))
        pending_heading_lines = []
        pending_heading_kind = None

    def flush_para() -> None:
        nonlocal para_buf
        if not para_buf:
            return
        text = _fix_dort_typos(join_prose_lines(para_buf))
        para_buf = []
        if not text:
            return
        if in_intro:
            intro_paras.append(text)
        else:
            events.append(("para", text))

    roman_re = re.compile(r"^(I|II|III|IV|V|VI|VII|VIII|IX)$")
    main_point_re = re.compile(r"^The\s+(First|Second|Third and Fourth|Fifth)\s+Main\s+Point")

    for pno, page in enumerate(doc):
        lines = extract_page_lines(page, merge_same_y=True)
        in_footnotes = False
        current_fn_num = None
        prev_body_y: float | None = None
        first_body_on_page = True

        for ln in lines:
            y0 = ln["origin_y"]
            x0 = ln["x0"]
            txt = ln["text"].strip()
            sizes = {s["size"] for s in ln["spans"]}
            fonts = {s["font"] for s in ln["spans"]}

            # Running header and page numbers (116..152)
            if sizes == {9.96} and txt == "The Canons of Dort" and ln["y0"] < 40:
                continue
            if sizes == {10.55} and txt.isdigit() and 116 <= int(txt) <= 152:
                continue
            if pno == 0 and ln["y0"] < 120:
                continue

            if txt.startswith("___"):
                in_footnotes = True
                continue

            if in_footnotes or (sizes & {6.48} and ln["spans"][0]["size"] == 6.48):
                in_footnotes = True
                first_sp = ln["spans"][0]
                if first_sp["size"] == 6.48 and first_sp["text"].strip().isdigit():
                    current_fn_num = int(first_sp["text"].strip()) - 460
                    rest = "".join(s["text"] for s in ln["spans"][1:]).strip()
                    footnotes[current_fn_num] = _fix_dort_typos(rest)
                elif current_fn_num is not None:
                    footnotes[current_fn_num] = _fix_dort_typos(
                        join_prose_lines([footnotes[current_fn_num], txt])
                    )
                continue

            if pno == 34 and txt == "." and x0 < 55:
                continue

            if sizes == {14.03} and "TimesNewRomanPS-BoldMT" in fonts:
                flush_para()
                in_intro = False
                if main_point_re.match(txt):
                    flush_heading_lines()
                    pending_heading_kind = "main"
                    pending_heading_lines.append(txt)
                elif txt.startswith("Rejection of the Errors"):
                    flush_heading_lines()
                    pending_heading_kind = "reject"
                    pending_heading_lines.append(txt)
                elif txt == "Conclusion":
                    flush_heading_lines()
                    in_conclusion = True
                    pending_heading_kind = "conclusion"
                    pending_heading_lines.append(txt)
                elif pending_heading_kind is not None:
                    pending_heading_lines.append(txt)
                prev_body_y = y0
                first_body_on_page = False
                continue

            flush_heading_lines()

            if pno == 0 and 180 <= ln["y0"] <= 250:
                if not events or events[-1][0] != "subtitle":
                    events.append(("subtitle", txt))
                else:
                    events[-1] = ("subtitle", events[-1][1] + " " + txt)
                prev_body_y = y0
                first_body_on_page = False
                continue

            if pno in (0, 1) and (txt.startswith("The Decisions of the Synod of Dort") or in_intro):
                if pno == 1 and fonts == {"TimesNewRomanPS-BoldMT"} and txt.startswith("Article "):
                    flush_para()
                    in_intro = False
                else:
                    in_intro = True
                    if (first_body_on_page and txt.startswith("Each of the main")) or (
                        not first_body_on_page and x0 >= 55 and para_buf
                    ):
                        flush_para()
                    elif prev_body_y is not None and (y0 - prev_body_y) >= 18.0:
                        flush_para()
                    para_buf.append(_dort_render_line(ln))
                    prev_body_y = y0
                    first_body_on_page = False
                    continue

            if fonts == {"TimesNewRomanPS-BoldMT"} and re.match(r"^Article\s+\d+$", txt):
                flush_para()
                pending_article_num = txt
                expect_article_subtitle = True
                prev_body_y = y0
                first_body_on_page = False
                continue

            if expect_article_subtitle:
                expect_article_subtitle = False
                events.append(("h3", f"{pending_article_num}: {txt}"))
                prev_body_y = y0
                first_body_on_page = False
                continue

            if fonts == {"TimesNewRomanPS-BoldMT"} and roman_re.match(txt):
                flush_para()
                events.append(("h4", f"Error {txt}"))
                prev_body_y = y0
                first_body_on_page = False
                continue

            if in_conclusion and txt.startswith("–"):
                flush_para()
                item_txt = _dort_render_line(ln).lstrip("–").strip()
                events.append(("bullet_start", item_txt))
                prev_body_y = y0
                first_body_on_page = False
                continue

            if in_conclusion and events and events[-1][0] == "bullet_start" and x0 >= 65:
                events[-1] = ("bullet_start", _fix_dort_typos(join_prose_lines([events[-1][1], _dort_render_line(ln)])))
                prev_body_y = y0
                first_body_on_page = False
                continue

            is_new_para = False
            if prev_body_y is not None and (y0 - prev_body_y) >= 18.0:
                is_new_para = True
            elif para_buf and (55 <= x0 <= 70 or (88 <= x0 <= 100 and txt.startswith(("Before the", "And so")))):
                is_new_para = True
            elif first_body_on_page and para_buf and x0 >= 55:
                is_new_para = True

            if is_new_para:
                flush_para()

            para_buf.append(_dort_render_line(ln))
            prev_body_y = y0
            first_body_on_page = False

    flush_heading_lines()
    flush_para()

    md_blocks: list[str] = [
        "# The Canons of Dort",
        "*Formally titled: The Decision of the Synod of Dort on the Five Main Points of Doctrine in Dispute in the Netherlands*",
        "## Introduction",
    ]
    md_blocks.extend(intro_paras)

    bullet_group: list[str] = []

    def flush_bullets() -> None:
        nonlocal bullet_group
        if bullet_group:
            md_blocks.append("\n".join(f"- {b}" for b in bullet_group))
            bullet_group = []

    for kind, val in events:
        if kind == "bullet_start":
            bullet_group.append(val)
            continue
        flush_bullets()
        if kind == "h2":
            md_blocks.append(f"## {val}")
        elif kind == "subtitle":
            md_blocks.append(f"*{val}*")
        elif kind == "h3":
            md_blocks.append(f"### {val}")
        elif kind == "h4":
            md_blocks.append(f"#### {val}")
        elif kind == "para":
            md_blocks.append(val)

    flush_bullets()

    md_blocks.append("---")
    md_blocks.append("\n".join(f"[^{n}]: {footnotes[n]}" for n in sorted(footnotes)))
    return "\n\n".join(md_blocks) + "\n"


# ---------------------------------------------------------------------------
# 4. VERIFICATION SUITE
# ---------------------------------------------------------------------------

def verify_file_footnotes(path: Path) -> tuple[int, list[str]]:
    text = path.read_text(encoding="utf-8")
    if "\n---\n" in text:
        body, fn_sec = text.rsplit("\n---\n", 1)
    else:
        body, fn_sec = text, ""
    refs = set(re.findall(r"\[\^([^\]]+)\](?!:)", body))
    defs = set(re.findall(r"^\[\^([^\]]+)\]:", fn_sec, re.M))
    errors: list[str] = []
    missing = sorted(refs - defs)
    orphaned = sorted(defs - refs)
    if missing:
        errors.append(f"{path.name}: missing footnote definitions: {missing}")
    if orphaned:
        errors.append(f"{path.name}: orphaned footnote definitions: {orphaned}")
    return len(defs), errors


def verify_all() -> int:
    errors: list[str] = []

    creed_files = [
        CREEDS_DIR / "01 - The Apostles' Creed.md",
        CREEDS_DIR / "02 - The Nicene Creed.md",
        CREEDS_DIR / "03 - The Athanasian Creed.md",
    ]
    conf_files = [
        CONFESSIONS_DIR / "01 - The Belgic Confession.md",
        CONFESSIONS_DIR / "02 - The Heidelberg Catechism.md",
        CONFESSIONS_DIR / "03 - The Canons of Dort.md",
    ]

    for p in creed_files + conf_files:
        if not p.exists():
            errors.append(f"Missing expected file: {p}")
            continue
        cnt, fn_errs = verify_file_footnotes(p)
        errors.extend(fn_errs)
        raw = p.read_text(encoding="utf-8")
        if "\xad" in raw or "\xa0" in raw:
            errors.append(f"{p.name}: contains stray \\xad or \\xa0")
        broken_hy = re.findall(r"\b[A-Za-z]+-\s+[A-Za-z]+\b", raw)
        if broken_hy:
            errors.append(f"{p.name}: potential broken hyphens: {broken_hy}")
        standalone_nums = re.findall(r"^\d+$", raw, re.M)
        if standalone_nums:
            errors.append(f"{p.name}: stray standalone numbers (page nums): {standalone_nums}")
        print(f"OK footnotes ({cnt:3d}): {p.relative_to(REPO_ROOT)}")

    belgic = (CONFESSIONS_DIR / "01 - The Belgic Confession.md").read_text(encoding="utf-8")
    articles = [int(m) for m in re.findall(r"^## Article (\d+):", belgic, re.M)]
    if articles != list(range(1, 38)):
        errors.append(f"Belgic articles mismatch: {articles}")
    fn_belgic = len(re.findall(r"^\[\^[^\]]+\]:", belgic, re.M))
    if fn_belgic != 91:
        errors.append(f"Belgic footnotes expected 91 (87 + 4 notes), got {fn_belgic}")
    print(f"Belgic verified: {len(articles)} articles, {fn_belgic} footnotes")

    hb = (CONFESSIONS_DIR / "02 - The Heidelberg Catechism.md").read_text(encoding="utf-8")
    lds = [int(m) for m in re.findall(r"^### Lord's Day (\d+)$", hb, re.M)]
    qs = [int(m) for m in re.findall(r"^\*\*Q\. (\d+)\.", hb, re.M)]
    if lds != list(range(1, 53)):
        errors.append(f"Heidelberg Lord's Days mismatch: len={len(lds)}")
    if qs != list(range(1, 130)):
        errors.append(f"Heidelberg Questions mismatch: len={len(qs)}")
    if "I am the LORD your God" not in hb:
        errors.append("Heidelberg small-caps LORD not converted in Q. 92")
    print(f"Heidelberg verified: {len(lds)} Lord's Days, {len(qs)} Q&As")

    dort = (CONFESSIONS_DIR / "03 - The Canons of Dort.md").read_text(encoding="utf-8")
    dort_arts = [int(m) for m in re.findall(r"^### Article (\d+):", dort, re.M)]
    dort_errs = re.findall(r"^#### Error [IVX]+$", dort, re.M)
    fn_dort = len(re.findall(r"^\[\^\d+\]:", dort, re.M))
    if len(dort_arts) != 59:
        errors.append(f"Dort articles expected 59, got {len(dort_arts)}")
    if len(dort_errs) != 34:
        errors.append(f"Dort errors expected 34, got {len(dort_errs)}")
    if fn_dort != 86:
        errors.append(f"Dort footnotes expected 86, got {fn_dort}")
    if "## Conclusion: Rejection of False Accusations" not in dort:
        errors.append("Dort missing Conclusion heading")
    print(f"Canons of Dort verified: {len(dort_arts)} articles, {len(dort_errs)} errors, {fn_dort} footnotes")

    if errors:
        print("\nVERIFICATION FAILED:")
        for e in errors:
            print("  ERROR:", e)
        return 1
    print("\nALL CREEDS & CONFESSIONS VERIFIED SUCCESSFULLY.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert CRCA Confession PDFs to Markdown.")
    parser.add_argument("--verify", action="store_true", help="Run verification assertions.")
    args = parser.parse_args()

    CONFESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    (CONFESSIONS_DIR / "01 - The Belgic Confession.md").write_text(convert_belgic(), encoding="utf-8")
    (CONFESSIONS_DIR / "02 - The Heidelberg Catechism.md").write_text(convert_heidelberg(), encoding="utf-8")
    (CONFESSIONS_DIR / "03 - The Canons of Dort.md").write_text(convert_dort(), encoding="utf-8")
    print("Converted all 3 Confession PDFs to Markdown.")

    if args.verify:
        return verify_all()
    return 0


if __name__ == "__main__":
    sys.exit(main())
