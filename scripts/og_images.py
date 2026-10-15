"""Render 1200x630 og:image JPEGs for subpages.

usage: python3 scripts/og_images.py http://127.0.0.1:8000
"""
import io, sys, pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

W, H, DSF = 1200, 630, 2
ASPECT = W / H
OUT = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'og'

# page: (selector, mode, wait_ms, viewport)
PAGES = {
    'index':             ('#hero', 'viewport', 4000, (W, H)),
    'cep1347':           ('#simCanvas', 'viewport', 4000, (W, H)),
    '1347_methods':      ('picture', 'fit', 0, (1440, 900)),
    'astcadence':        ('.hero-wrap', 'fit', 2500, (1440, 900)),
    'U_Sgr_abs':         ('#usgr-canvas', 'fit', 3000, (1440, 900)),
    'asteroid_observer': ('#canvas', 'fit', 3000, (W, 900)),
    'ccd_calibration':   ('header', 'text', 0, (1440, 900)),
    'calls':             ('header', 'text', 0, (1440, 900)),
    'japan':             ('picture', 'fit', 0, (1440, 900)),
    'muralism':          ('picture', 'cover', 0, (1440, 900)),
    'descartes':         ('header', 'text', 0, (1440, 900)),
    'borderlands':       ('header', 'text', 0, (1440, 900)),
    'lisbon':            ('header', 'text', 0, (1440, 900)),
    'afonso':            ('header', 'text', 0, (1440, 900)),
    'believingbelief':   ('header', 'text', 0, (1440, 900)),
}
HIDE = 'nav, .back-to-top, #back-to-top, .site-nav, #trail-card { visibility: hidden !important; }'
TEXT_BOX = """sel => {
  const el = document.querySelector(sel), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim() || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) {
      x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom);
    }
  }
  return {x: x0 + scrollX, y: y0 + scrollY, width: x1 - x0, height: y1 - y0};
}"""
ISOLATE = """sel => {
  for (let n = document.querySelector(sel); n && n !== document.body; n = n.parentElement)
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) s.style.visibility = 'hidden';
}"""


def clip_for(box, mode, page_w, pad=0.08):
    x, y, w, h = box['x'], box['y'], box['width'], box['height']
    cx, cy = x + w / 2, y + h / 2
    if mode == 'text':
        cw = max(w + 2 * 72, (h + 2 * 72) * ASPECT)
        ch = cw / ASPECT
        return {'x': max(0, x - (cw - w) / 2), 'y': max(0, cy - ch / 2), 'width': cw, 'height': ch}
    if mode == 'cover':
        cw = w
        ch = cw / ASPECT
        if ch > h:
            ch = h
            cw = ch * ASPECT
    else:
        cw = max(w, h * ASPECT) * (1 + pad)
        ch = cw / ASPECT
    cw = min(cw, page_w)
    ch = cw / ASPECT
    return {'x': max(0, min(cx - cw / 2, page_w - cw)), 'y': max(0, cy - ch / 2), 'width': cw, 'height': ch}


def main(base):
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--force-color-profile=srgb'])
        for slug, (sel, mode, wait, (vw, vh)) in PAGES.items():
            ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=DSF,
                                reduced_motion='no-preference', service_workers='block')
            pg = ctx.new_page()
            pg.goto(f'{base}/{slug}.html', wait_until='networkidle')
            pg.add_style_tag(content=HIDE)
            el = pg.locator(sel).first
            el.scroll_into_view_if_needed()
            if mode == 'text':
                pg.evaluate(ISOLATE, sel)
                pg.add_style_tag(content='body { margin-top: 600px !important; }')
            pg.evaluate('document.fonts.ready')
            pg.wait_for_timeout(wait + 500)
            if mode == 'viewport':
                pg.evaluate('window.scrollTo(0, 0)')
                pg.wait_for_timeout(300)
                png = pg.screenshot()
            else:
                pg.evaluate('window.scrollTo(0, 0)')
                box = pg.evaluate(TEXT_BOX, sel) if mode == 'text' else pg.evaluate(f"""() => {{
                    const r = document.querySelector({sel!r}).getBoundingClientRect();
                    return {{x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height}}; }}""")
                page_w = pg.evaluate('document.documentElement.clientWidth')
                png = pg.screenshot(full_page=True, clip=clip_for(box, mode, page_w))
            img = Image.open(io.BytesIO(png)).convert('RGB').resize((W, H), Image.LANCZOS)
            dst = OUT / f'{slug}.jpg'
            img.save(dst, 'JPEG', quality=86, optimize=True, progressive=True)
            print(f'{slug:18s} {dst.stat().st_size // 1024} KB')
            ctx.close()
        b.close()


if __name__ == '__main__':
    main(sys.argv[1].rstrip('/'))
