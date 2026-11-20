"""Generate crisp antialiased PNG icons for the Chrome extension (pure Python stdlib)."""

import struct
import zlib
from pathlib import Path


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)


def _write_png(path: Path, width: int, height: int, rgba_rows: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in rgba_rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, level=9)
    png = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def _rounded_rect_sdf(x: float, y: float, cx: float, cy: float, hw: float, hh: float, r: float) -> float:
    dx = max(abs(x - cx) - (hw - r), 0.0)
    dy = max(abs(y - cy) - (hh - r), 0.0)
    return (dx * dx + dy * dy) ** 0.5 - r


def _blend(bg: tuple[int, int, int, int], fg: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    fa = fg[3] / 255.0
    ba = bg[3] / 255.0
    out_a = fa + ba * (1.0 - fa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    r = int(round((fg[0] * fa + bg[0] * ba * (1.0 - fa)) / out_a))
    g = int(round((fg[1] * fa + bg[1] * ba * (1.0 - fa)) / out_a))
    b = int(round((fg[2] * fa + bg[2] * ba * (1.0 - fa)) / out_a))
    return (r, g, b, int(round(out_a * 255)))


def _sample_icon(u: float, v: float) -> tuple[int, int, int, int]:
    """Sample icon color at normalized coordinates u, v in [0, 1]."""
    navy = (27, 54, 93, 255)       # #1B365D
    navy_dark = (18, 38, 68, 255)  # subtle depth
    gold = (204, 164, 79, 255)     # #CCA44F
    cream = (252, 249, 242, 255)   # #FCF9F2
    page_shade = (229, 222, 206, 255)

    # Outer rounded square badge
    d_outer = _rounded_rect_sdf(u, v, 0.5, 0.5, 0.46, 0.46, 0.19)
    if d_outer > 0.0:
        return (0, 0, 0, 0)

    color = navy if v < 0.65 else (
        int(navy[0] + (navy_dark[0] - navy[0]) * ((v - 0.65) / 0.35)),
        int(navy[1] + (navy_dark[1] - navy[1]) * ((v - 0.65) / 0.35)),
        int(navy[2] + (navy_dark[2] - navy[2]) * ((v - 0.65) / 0.35)),
        255,
    )

    # Subtle inner gold border ring
    d_inner = _rounded_rect_sdf(u, v, 0.5, 0.5, 0.415, 0.415, 0.155)
    if d_outer <= -0.02 and d_inner >= 0.0:
        color = _blend(color, (gold[0], gold[1], gold[2], 170))

    # Cross emblem at top center
    cross_v = abs(u - 0.5) <= 0.036 and 0.17 <= v <= 0.41
    cross_h = 0.23 <= v <= 0.295 and abs(u - 0.5) <= 0.105
    if cross_v or cross_h:
        color = gold

    # Open book at lower half (two gently curved pages)
    if 0.21 <= u <= 0.79:
        dx_center = abs(u - 0.5)
        # Gentle arch upward away from spine
        arch = 0.045 * (1.0 - (dx_center / 0.29 - 0.5) ** 2 * 4.0) if dx_center > 0.015 else -0.02
        top_y = 0.49 - arch * 0.55
        bot_y = 0.78 - arch * 0.55
        if top_y <= v <= bot_y:
            if dx_center < 0.018:
                color = page_shade
            else:
                color = cream
                # Subtle page lines
                if (0.56 <= v <= 0.585 or 0.63 <= v <= 0.655 or 0.70 <= v <= 0.725) and 0.055 <= dx_center <= 0.23:
                    color = (180, 190, 206, 255)
        # Gold book cover rim underneath
        elif bot_y < v <= bot_y + 0.042 and 0.19 <= u <= 0.81:
            color = gold

    return color


def render_icon(size: int, ss: int = 4) -> list[bytes]:
    rows: list[bytes] = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r_sum = g_sum = b_sum = a_sum = 0
            samples = ss * ss
            for sy in range(ss):
                for sx in range(ss):
                    u = (x + (sx + 0.5) / ss) / size
                    v = (y + (sy + 0.5) / ss) / size
                    r, g, b, a = _sample_icon(u, v)
                    # Premultiplied accumulation for clean AA edges
                    r_sum += r * a
                    g_sum += g * a
                    b_sum += b * a
                    a_sum += a
            avg_a = a_sum / samples
            if avg_a > 0:
                r_out = int(round(r_sum / a_sum))
                g_out = int(round(g_sum / a_sum))
                b_out = int(round(b_sum / a_sum))
                a_out = int(round(avg_a))
            else:
                r_out = g_out = b_out = a_out = 0
            row.extend((r_out, g_out, b_out, a_out))
        rows.append(bytes(row))
    return rows


def main() -> None:
    icons_dir = Path(__file__).resolve().parent.parent / "extension" / "icons"
    for size in (16, 48, 128):
        rows = render_icon(size, ss=4)
        out_path = icons_dir / f"icon{size}.png"
        _write_png(out_path, size, size, rows)
        print(f"Generated {out_path} ({out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
