#!/usr/bin/env python3
"""Share images (1200x630) for every matter page, plus the site default
(2026-10-14).

Every page used to share the same generic image, so a LinkedIn post of a
ruling looked like every other CREdocket post, and Google Discover only
features pages with a large image of their own. This draws one card per
matter: category and status, the search title (the building, company or city
people know), and the date, court and amount, in the site's dark style. It
also redraws img/og-image.png, the site-wide default, without counts that go
stale.

Output: img/og/<id>.png (stale files removed) and img/og-image.png. PNG
output is deterministic for the same text and fonts, so an unchanged matter
is not re-committed. Fonts: on the build server, Ubuntu's Noto Serif, Inter
and IBM Plex Mono packages (prerender.yml installs them); locally, macOS
fallbacks. Run by .github/workflows/prerender.yml before
build_matter_pages.ts; locally: python3 scripts/build_og_images.py [--only live-087]
"""

import glob
import json
import pathlib
import subprocess
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "og"
W, H = 1200, 630
PAD = 84
BG_TOP, BG_BOTTOM = (15, 23, 42), (10, 14, 24)  # site's dark navy
TEXT, MUTED, FAINT, ACCENT = (241, 245, 249), (160, 170, 190), (100, 112, 135), (108, 132, 255)
CAT_COLORS = {"landlord-tenant": "#00a0bc", "zoning-land-use": "#59a050", "reit-securities": "#bf7b0f",
              "construction-defect": "#d16a52", "lending-foreclosure": "#897dd9", "environmental": "#00a68a",
              "eminent-domain": "#cc668a", "lease-disputes": "#989006", "premises-liability": "#b36ebb"}

FONT_CANDIDATES = {
    "serif": ["/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf", "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Bold.ttf",
              "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"],
    "sans": ["/usr/share/fonts/opentype/inter/Inter-Medium.otf", "/usr/share/fonts/truetype/inter/Inter-Medium.ttf",
             "/usr/share/fonts/opentype/inter/InterVariable.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
             "/System/Library/Fonts/Supplemental/Arial.ttf"],
    "mono": ["/usr/share/fonts/opentype/ibm-plex/IBMPlexMono-Medium.otf", "/usr/share/fonts/truetype/ibm-plex/IBMPlexMono-Medium.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"],
}


def font_path(kind):
    for p in FONT_CANDIDATES[kind]:
        if pathlib.Path(p).exists():
            return p
    hits = glob.glob(f"/usr/share/fonts/**/{'NotoSerif-Bold' if kind == 'serif' else 'Inter*' if kind == 'sans' else 'IBMPlexMono-Medium'}.*", recursive=True)
    if hits:
        return hits[0]
    sys.exit(f"no {kind} font found; install fonts-noto-core fonts-inter fonts-ibm-plex")


FONTS = {k: font_path(k) for k in FONT_CANDIDATES}
font = lambda kind, size: ImageFont.truetype(FONTS[kind], size)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def background():
    im = Image.new("RGB", (W, H), BG_BOTTOM)
    px = ImageDraw.Draw(im)
    for y in range(H):  # vertical gradient
        t = y / H
        px.line([(0, y), (W, y)], fill=tuple(round(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3)))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(420, 0, -6):  # soft blue glow, top right
        a = int(38 * (1 - r / 420))
        gd.ellipse([900 - r, -160 - r, 900 + r, -160 + r], fill=(a // 3, a // 2, a))
    return ImageChops.add(im, glow)


def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=f) <= width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_title(draw, text, width, max_lines=4):
    for size in (68, 62, 56, 50, 46, 42, 38):
        f = font("serif", size)
        lines = wrap(draw, text, f, width)
        if len(lines) <= max_lines:
            return f, lines, size
    f = font("serif", 38)
    lines = wrap(draw, text, f, width)[:max_lines]
    lines[-1] = lines[-1].rstrip(".,;:") + "…"
    return f, lines, 38


def brand(draw):
    draw.text((PAD, 64), "CREdocket", font=font("serif", 36), fill=ACCENT)
    x = PAD + draw.textlength("CREdocket", font=font("serif", 36)) + 28
    draw.text((x, 78), "CRE LITIGATION INTELLIGENCE", font=font("mono", 15), fill=FAINT)


def matter_card(c, cats, statuses):
    im = background()
    d = ImageDraw.Draw(im)
    brand(d)
    color = hex_rgb(CAT_COLORS.get(c["category"], "#6c84ff"))
    label = cats.get(c["category"], c["category"]).upper()
    y = 150
    d.rounded_rectangle([PAD, y, PAD + 10, y + 10], radius=5, fill=color)
    mono = font("mono", 18)
    d.text((PAD + 22, y - 6), label, font=mono, fill=color)
    sx = PAD + 22 + d.textlength(label, font=mono) + 26
    d.text((sx, y - 6), "·  " + statuses.get(c["status"], c["status"]).upper(), font=mono, fill=MUTED)
    title = c.get("seoTitle") or c["title"]
    f, lines, size = fit_title(d, title, W - 2 * PAD)
    ty = 200
    for ln in lines:
        d.text((PAD, ty), ln, font=f, fill=TEXT)
        ty += int(size * 1.18)
    meta = [m for m in (c.get("dateLabel"), c.get("jurisdiction"), c.get("amount")) if m]
    sans = font("sans", 24)
    my = H - 118
    line = "   ·   ".join(meta)
    while d.textlength(line, font=sans) > W - 2 * PAD and len(meta) > 1:
        meta = meta[:-1]
        line = "   ·   ".join(meta)
    if d.textlength(line, font=sans) > W - 2 * PAD:
        while d.textlength(line + "…", font=sans) > W - 2 * PAD:
            line = line[:-1]
        line += "…"
    d.line([(PAD, my - 26), (PAD + 56, my - 26)], fill=ACCENT, width=4)
    d.text((PAD, my), line, font=sans, fill=MUTED)
    d.text((PAD, H - 66), "credocket.com", font=font("mono", 18), fill=FAINT)
    return im


def default_card():
    im = background()
    d = ImageDraw.Draw(im)
    brand(d)
    d.line([(PAD, 150), (PAD + 56, 150)], fill=ACCENT, width=4)
    f, lines, size = fit_title(d, "Where commercial real estate meets the courtroom.", W - 2 * PAD, max_lines=2)
    for i, ln in enumerate(lines):
        d.text((PAD, 196 + i * int(size * 1.18)), ln, font=f, fill=TEXT)
    sans = font("sans", 28)
    for i, ln in enumerate(["Foreclosures, receiverships, lease fights, zoning and data center",
                            "battles, condemnation and REIT suits, with plain-English write-ups."]):
        d.text((PAD, 410 + i * 42), ln, font=sans, fill=MUTED)
    d.text((PAD, H - 66), "credocket.com", font=font("mono", 18), fill=FAINT)
    return im


def load():
    out = subprocess.run(["deno", "eval", 'const s=Deno.readTextFileSync("js/data.js");'
                          'const d=new Function(s+";return RELAW_DATA;")();'
                          'console.log(JSON.stringify({cases:d.cases,categories:d.categories,statuses:d.statuses}))'],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    import datetime as dt
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    data = load()
    cats = {c["id"]: c["label"] for c in data["categories"]}
    statuses = {s["id"]: s["label"] for s in data["statuses"]}
    OUT.mkdir(parents=True, exist_ok=True)
    keep = set()
    for c in data["cases"]:
        if only and c["id"] != only:
            continue
        try:
            c["dateLabel"] = dt.date.fromisoformat(c["date"]).strftime("%B %-d, %Y")
        except ValueError:
            c["dateLabel"] = c.get("date")
        path = OUT / f"{c['id']}.png"
        keep.add(path.name)
        matter_card(c, cats, statuses).save(path, optimize=True)
    removed = 0
    if not only:
        for p in OUT.glob("*.png"):
            if p.name not in keep:
                p.unlink()
                removed += 1
        default_card().save(ROOT / "img" / "og-image.png", optimize=True)
    print(f"{len(keep)} share images written, {removed} removed; fonts: {', '.join(pathlib.Path(p).name for p in FONTS.values())}")


if __name__ == "__main__":
    main()
