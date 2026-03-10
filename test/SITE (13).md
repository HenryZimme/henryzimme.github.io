# SITE.md — Henry Zimmerman Portfolio Documentation

Read this file at the start of any editing session before touching any file in the repo.

---

## Repository Structure

```
/
├── index.html              # portfolio site — HTML shell, no inline JS/CSS
├── css/
│   └── style.css           # all site styles (shared variables, sections, sim, bookshelf)
├── js/
│   ├── main.js             # canvas starfield, nav, scroll-spy, bookshelf layout, interactions
│   └── cepheid-engine.js   # binary Cepheid simulation (IIFE, lazy-loaded via IntersectionObserver)
├── data/
│   ├── stars.json           # Yale Bright Star Catalog, fetched at runtime by init()
│   └── master_data.json     # Keplerian + pulsation frames for CEP-1347 sim (from Colab notebook)
├── images/
│   ├── HSZ_Headshot_BW.jpeg # profile photo
│   ├── sim-placeholder.jpg  # loading placeholder for simulation section
│   └── og-preview.jpg       # social media preview image
├── docs/
│   └── asteroid_3d.html     # interactive asteroid orbital model
├── template.html            # master article template for academic papers (see Paper Templating below)
├── japan.html               # Japan labor/immigration policy article (Fall 2024)
├── muralism.html            # Siqueiros muralism essay (Spring 2025)
├── baghdad.html             # Abbasid Caliphate essay (Spring 2024)
├── descartes.html           # Descartes essay (February 2025)
├── jane.html                # Jane Eyre moral autonomy essay (Fall 2025)
├── U_Sgr_abs.html           # U Sagittarii abstract & poster
├── 1347_methods.html        # CEP-1347 methods and diagnostic analysis appendix
├── favicon.svg              # browser tab icon
└── SITE.md                  # this file
```

Hosted on GitHub Pages at `henryzimme.github.io`. No build step. No dependencies beyond Google Fonts and MathJax (both CDN-loaded).

---

## Known Recurring Problems — Read First

### Problem 1: Cloudflare injection (legacy — low risk in multi-file setup)

When the monolithic `index.html` contained inline email addresses, Cloudflare would inject an email-decode script. The email is now assembled via a JS IIFE in `js/main.js`, so this is unlikely. If it recurs, search for `/cdn-cgi/` or `__cf_email__` and remove.

### Problem 2: File truncation (legacy — low risk in multi-file setup)

Previously occurred when the entire site was a single file. With JS now in separate files, truncation of `index.html` is far less likely. If editing `js/main.js`, verify that `init();` is the last statement in the file.

---

## Editing Rules

**Never rewrite a whole file.** Always use `str_replace` with a unique surrounding anchor. Line numbers shift with every edit; use distinctive text as anchors instead.

**One logical change per message.** Bundling multiple edits is how corruption cascades.

**Know which file to edit.** Styles go in `css/style.css`, starfield/nav/interaction logic in `js/main.js`, simulation logic in `js/cepheid-engine.js`, and structural HTML in `index.html`. The simulation section's inline styles live in `index.html` (not in `style.css`).

---

## File Architecture

### `<head>` (index.html)

- `<meta name="description">` — plain text description for Google
- `og:title`, `og:description`, `og:type`, `og:image`, `twitter:image` — social preview (og:image points to `https://www.henryzimmerman.net/og-preview.jpg`)
- `twitter:card` — Twitter/X card type
- Google Fonts: **EB Garamond** (headings, nav name, modal), **JetBrains Mono** (labels, tags, code), **Spectral** (body text) — preloaded with `onload` swap
- `favicon.svg` — browser tab icon
- `css/style.css` — preloaded with `onload` swap
- MathJax v3 — lazy-loaded via IntersectionObserver on `#research` section (300px rootMargin)

### CSS Variables (css/style.css)

```css
--bg:           #07091a          /* deep navy background */
--gold:         #c4a258          /* primary accent */
--gold-dim:     rgba(196,162,88,0.25)
--text:         #e2ddd4          /* off-white body text */
--text-dim:     rgba(226,221,212,0.72)
--panel:        rgba(7,9,26,0.84) /* opaque section background */
--panel-border: rgba(196,162,88,0.18)
--blue:         #78a5d2          /* tag color, links */
```

These same variables are used verbatim in `template.html` and all article pages.

### HTML Structure (`<body>` in index.html)

```
<canvas id="star-canvas">        fixed, z-index 0, full viewport
<div id="star-tooltip">          fixed, z-index 100, JetBrains Mono tooltip
<div id="star-popover">          fixed, z-index 150, SIMBAD confirmation overlay (named catalog stars)
<div id="object-modal">          fixed, z-index 200, backdrop blur modal
<nav>                            fixed top, desktop links + hamburger button
<nav class="nav-mobile">         fixed full-screen overlay, mobile only
<main>
  <section id="hero">            100vh, transparent — canvas visible here only
  <section id="about">           opaque panel
  <section id="research">        opaque panel — MathJax lazy-loaded here
  <section id="cepheid-sim">     flex column on mobile, 100vh absolute on desktop
    <div id="sim-info">          description block, absolute top-left desktop / flow on mobile
    <div id="hud-table">         telemetry HUD, absolute top-right desktop / flow on mobile
    <div id="sim-stage">         canvas + plot wrapper, absolute on desktop / relative 530px on mobile
      <canvas id="simCanvas">
      <div id="hud-plot-container">  empty — all plot content drawn on canvas
      <div id="sim-preview">     loading placeholder, hidden on data load
    <div id="sim-controls">      mode buttons + params, absolute bottom desktop / flow on mobile  <section id="writing">         opaque panel
  <section id="highlights">      opaque panel
  <section id="bookshelf">       opaque panel — 21 spines in #bookshelf-pool
</main>
<footer>                         name left, 4 links right
<button id="back-to-top">        fixed bottom-right, z-index 300
<script src="js/main.js" defer>  starfield, nav, bookshelf, interactions
<script> (inline)                IntersectionObserver to lazy-load cepheid-engine.js
<script> (inline)                IntersectionObserver to lazy-load MathJax
```

Scripts: `js/main.js` is loaded with `defer`. `js/cepheid-engine.js` is loaded dynamically when `#cepheid-sim` enters the viewport (200px rootMargin). MathJax loaded when `#research` enters viewport (300px rootMargin).

### Canvas Interaction (js/main.js)

The `#star-canvas` is fixed full-viewport behind all content. Stars are only interactive (hover tooltip, click to SIMBAD/modal) when the cursor is inside the `#hero` bounding rect. This is enforced by `canvas_exposed_at(x, y)`, which uses `getBoundingClientRect()` on `#hero`.

**Do not change this to `elementFromPoint` — that was the original buggy approach that caused click bleed-through into lower sections.**

**Touch support:** `on_touch_start` is registered on the canvas with `{ passive: false }`. It maps a tap's `clientX/Y` through `canvas_exposed_at`, then checks featured stars first (38px tap radius) and named catalog stars second (22px tap radius). On a hit it calls `e.preventDefault()` to suppress the synthetic mouse event and fires `open_modal` or `open_popover` directly. The existing `on_click` handler is untouched and remains the mouse path.

**Star popover (added 2026-03-04):** Named catalog stars (non-featured) no longer immediately redirect to SIMBAD on click or tap. Instead they open `#star-popover`, a small interactive overlay (`z-index: 150`) with the star name and a "View on SIMBAD ↗" anchor button. `open_popover(name, url, cx, cy)` positions the element near the click point and clamps it to the viewport. `close_popover()` removes the `.visible` class. The popover is dismissed by: clicking outside it, hovering off all named stars (mouse path), pressing Escape, or opening a research modal. Desktop power users can bypass the confirmation with Ctrl/Cmd+Click, which opens SIMBAD directly. The `#star-popover-btn` uses an `<a>` tag (`target="_blank" rel="noopener"`) rather than `window.open` so browser-native middle-click / open-in-background-tab works without custom handling.

**Mobile modal touch guard (added 2026-03-04):** `on_touch_start` returns immediately if `modal.classList.contains('visible')`, preventing canvas interactions from firing while the modal is open. `modal_inner` has `touchstart` and `touchmove` listeners with `{ passive: true }` and `stopPropagation()`. The `.modal-inner` base CSS gained `max-height: 85vh`, `overflow-y: auto`, and `-webkit-overflow-scrolling: touch`.

**Mobile nav touch guard (added 2026-03-04):** `on_touch_start` also returns immediately if `mobile_nav.classList.contains('open')`. Required because `on_touch_start` is on `window` -- `stopPropagation` on the overlay never reaches window listeners, so the only reliable gate is an explicit open-state check inside the handler itself.

**Duplicate section heading fix (added 2026-03-04):** The `::before` gold label and the `<h2>` text were both rendering the same word (e.g., "About" / "ABOUT"). The `<h2>` text content in all 5 section headings is now wrapped in `<span class="sr-only">` so it is visually hidden but remains in the DOM for SEO and screen readers. The gold JetBrains Mono `::before` label is the sole visible heading. A `.sr-only` CSS class was added: `position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap`.

**Section label refactor (added 2026-03-04):** Removed all `<div class="section-label">` elements. The label text is now generated via `.section-heading::before { content: attr(data-label) }`. Each `<h2 class="section-heading">` carries a `data-label="..."` attribute (e.g. `data-label="Writing"`). The decorative rule beneath the label is rendered via `.section-heading::after`. `.section-heading` is `position: sticky; top: 20px` so it pins while scrolling through long sections. Background is `var(--panel)` to prevent text bleed-through.

**Back-to-top button (added 2026-03-04):** `<button id="back-to-top">` is inserted just before `</body>`. It fades in (`opacity: 1`, `.visible` class) once `window.scrollY > 500`, and scrolls to top on click. CSS: `position: fixed; bottom: 32px; right: 32px; z-index: 300`. JS variable: `back_to_top_btn`.

**Canvas event leak fixes (added 2026-03-04):** `toggle_mobile_nav()` now sets `canvas.style.pointerEvents = open ? 'none' : 'auto'` so the starfield is dead while the hamburger menu is open. `on_click()` gained an early-return gatekeeper: `if (e.target.closest('.book-spine') || e.target.closest('#star-popover') || e.target.closest('.project-card')) return;` preventing book/card clicks from bleeding through to the canvas.

**Research card hover lift (added 2026-03-04):** `.research-card:hover` now includes `transform: translateY(-6px); box-shadow: 0 20px 40px rgba(0,0,0,0.35)` in addition to the existing border-color transition.

---

## Section Reference (index.html)

### Hero (`#hero`)

```html
<section id="hero">
  <p class="hero-eyebrow">Phillips Academy Andover, Class of 2027</p>
  <h1 class="hero-name">Henry<br>Zimmerman</h1>
  <p class="hero-tagline">I follow questions wherever they lead.</p>
  <div class="hero-arrow">...</div>   <!-- bouncing chevron SVG -->
</section>
```

To edit the tagline, use `hero-tagline` text as the str_replace anchor.

### About (`#about`)

Two-column grid. Left: `.about-text` (5 `<p>` tags, first is `.about-lead`). Right: `.about-meta` (profile image + 4 `.meta-item` blocks).

### Research (`#research`)

Three `.research-card` elements inside `.research-cards`.

**Research card template:**
```html
<div class="research-card">
  <div class="card-id">STATUS</div>
  <h3 class="card-title">TITLE</h3>
  <p class="card-body">DESCRIPTION</p>
  <!-- optional: <a class="card-link" href="URL" target="_blank" rel="noopener">LINK TEXT</a> -->
  <div class="card-tags">
    <span class="tag">TAG1</span>
    <span class="tag">TAG2</span>
  </div>
</div>
```

### Writing (`#writing`)

Seven `.writing-item` blocks in `.writing-list`. Below `.writing-item` grid is 200px/1fr on desktop, 1fr on mobile (≤740px). Each has `.writing-meta` (venue + date) and `.writing-content` with an `<h3><a>` title and `<p>` description.

Current writing items (8 total):
1. The Phillipian — "Why I'm Not 'All In'..." (Oct 2025)
2. Academic Essay — "Moral Autonomy and the Due North: Agency in Jane Eyre" (Fall 2025)
3. Academic Essay — "Muerte al Invasor: Examining Siqueiros's Activist Muralism" (Spring 2025)
4. The Revere — "What's at Stake in Greenland?" (March 2025)
5. Academic Essay — "Disproving Descartes' Divine Definition Divination" (Feb 2025)
6. The Revere — "Germany's Far-Right Comeback" (Feb 2025)
7. The Japan Periodical — "Changes in Japan's Labor and Immigration Policy" (Fall 2024)
8. Academic Essay — "Power, Money, and Knowledge: the Abbasid Caliphate" (Spring 2024)

**Writing item template:**
```html
<div class="writing-item">
  <div class="writing-meta">
    <div class="writing-venue">VENUE NAME</div>
    <div class="writing-date">MONTH YEAR</div>
  </div>
  <div class="writing-content">
    <h3><a href="URL" target="_blank" rel="noopener">TITLE</a></h3>
    <p>ONE SENTENCE DESCRIPTION</p>
  </div>
</div>
```

### Highlights (`#highlights`)

Eight `.highlights-row` blocks in order (year, title):
1. 2025 — Writing Center Tutor
2. 2025 — Machine Learning, NYU Tandon
3. 2025 — SHAD Canada
4. 2025 — The Webster Award
5. 2025 — Believing Belief
6. 2024 — RenewBlue
7. 2024 — Cleanhill Partners
8. 2023– — Varsity Cross-Country Captain (always last)

**The Cross-Country Captain row must always be last.** Insert new rows by finding the unique `h4` text of the row you want to insert before and using that as a str_replace anchor.

**Highlights row template:**
```html
<div class="highlights-row">
  <div class="highlights-year">YEAR</div>
  <div class="highlights-item">
    <h4>TITLE</h4>
    <p>DESCRIPTION</p>
  </div>
</div>
```

### Bookshelf (`#bookshelf`)

Section label: `Reading`. Section heading: `All-Time Favorites`. Uses the `.section` class for shared panel styles, plus additional `#bookshelf`-specific CSS for the shelf layout, book spines, and intro paragraph.

Intro paragraph links to `https://curius.app/henry-zimmerman`.

21 `.book-spine` elements inside `#bookshelf-pool` (a `display:none` staging area). `layout_shelves()` (in `js/main.js`) distributes them into `.book-shelf` rows inside `#bookshelf-rows` on DOMContentLoaded and on debounced resize (120ms). `n_per_row` is calculated from container width assuming one expanded spine.

Heights vary per spine via `:nth-child` rules (208–240px range) for indices 1–20. The 21st spine falls back to the default `height: 220px`. Add a `:nth-child(21)` rule if a custom height is wanted.

**Touch / click toggle:** Each `.book-spine` has a `click` event listener (registered in JS after DOMContentLoaded) that toggles `.active` on it and removes `.active` from all siblings. CSS rules for `.book-spine.active`, `.book-spine.active .spine-title`, and `.book-spine.active .spine-panel` are identical to the `:hover` rules, so the expanded state is visually the same on mouse and touch. Tap once to expand, tap again to collapse, or tap a different spine to switch. Desktop `:hover` is completely unaffected.

**Book spine template:**
```html
<div class="book-spine" role="listitem">
  <div class="spine-title"><span>SHORT TITLE</span></div>
  <div class="spine-panel">
    <div class="spine-book-title">FULL TITLE</div>
    <div class="spine-author">AUTHOR</div>
    <div class="spine-impact">ONE LINE IMPACT.</div>
  </div>
</div>
```

After adding a spine, add a `:nth-child(N)` height rule in the range 205–240px. No other CSS changes needed.

`.book-shelf-surface` is a sibling div below `.book-shelf` — a thin gold gradient line that acts as the shelf. Do not remove it.

**Current bookshelf inventory (21 books):**

| # | Short Spine Title | Full Title | Author | Impact (truncated) |
|---|---|---|---|---|
| 1 | Misbehaving | Misbehaving: The Making of Behavioral Economics | Richard Thaler | People aren't perfectly rational... |
| 2 | The Rain God | The Rain God | Arturo Islas | Martyrdom cannot be aspirational... |
| 3 | Cry, the Beloved Country | Cry, the Beloved Country | Alan Paton | A lament for a country being devoured... |
| 4 | Man's Search for Meaning | Man's Search for Meaning | Viktor Frankl | The will to find meaning survives... |
| 5 | Walking | Walking | Henry David Thoreau | Intense thought requires the freedom of the woods... |
| 6 | Encounters with the Archdruid | Encounters with the Archdruid | John McPhee | This book pits the conservationist against the engineer... |
| 7 | 20,000 Leagues | 20,000 Leagues Under the Sea | Jules Verne | Captain Nemo is the epitome of the independent researcher... |
| 8 | The Words That Made Us | The Words That Made Us | Akhil Reed Amar | The Constitution is might be a document but it's also a cent... |
| 9 | Manufacturing Consent | Manufacturing Consent | Noam Chomsky & Edward S. Herman | A great reminder that in politics, as in science, the observer... |
| 10 | 1984 | 1984 | George Orwell | A study on the fragility of objective truth... |
| 11 | For Whom the Bell Tolls | For Whom the Bell Tolls | Ernest Hemingway | Roberto's commitment to fulfilling his purpose... |
| 12 | Jane Eyre | Jane Eyre | Charlotte Brontë | Moral self-possession made into the engine of a whole novel... |
| 13 | Wide Sargasso Sea | Wide Sargasso Sea | Jean Rhys | Everything the canonical story erased gets its voice back... |
| 14 | The Idiot | The Idiot | Elif Batuman | Over-education and under-certainty... |
| 15 | The Road to Character | The Road to Character | David Brooks | As I wrote in 7th grade, Brooks made me realize... |
| 16 | Meditations on First Philosophy | Meditations on First Philosophy | René Descartes | Even the greatest thinkers can falter... |
| 17 | The Histories | The Histories | Herodotus | The first act of genuine curiosity about the human past... |
| 18 | The Hitchhiker's Guide | The Hitchhiker's Guide to the Galaxy (Series) | Douglas Adams | The universe is absurd and indifferent... |
| 19 | Ender's Game (Series) | The Ender Quintet | Orson Scott Card | The first book taught me strategy. The sequels taught me that... |
| 20 | Kavalier & Clay | The Amazing Adventures of Kavalier & Clay | Michael Chabon | Imagination as defiance, myth-making as survival... |
| 21 | Cloud Cuckoo Land | Cloud Cuckoo Land | Anthony Doerr | A love letter to storytelling itself... |

### Footer

```html
<footer>
  <div class="footer-left">Henry Zimmerman, Phillips Academy Andover, Class of 2027</div>
  <div class="footer-links">
    <a href="https://github.com/HenryZimme/asteroid-scheduler" ...>Asteroid Scheduler</a>
    <a href="https://github.com/HenryZimme/lcdb-observing-strategy" ...>Asteroid Statistics</a>
    <a href="https://henryzimmerman.net/docs/asteroid_3d.html" ...>Asteroid Orbital Model</a>
    <a href="https://github.com/HenryZimme" ...>GitHub</a>
  </div>
</footer>
```

---

## JavaScript Reference

### Featured Objects Array (js/main.js)

Lives at the top of `js/main.js`, starting with `const featured_objects = [`. Five objects. Each renders as a pulsing colored dot on the canvas with a bottom-left legend entry. Clicking or tapping opens a modal.

**Object schema:**
```js
{
  name: "Display name",          // shown in legend, modal header, tooltip
  ra_deg: 83.625,                // right ascension in degrees (0–360)
  dec_deg: -69.27,               // declination in degrees (-90 to +90)
  type: "Type  |  Location",     // shown in modal subheader
  writeup: "Long description",   // shown in modal body via innerHTML — anchor tags are supported
  pipeline: true,                // optional — marks early-investigation objects
                                 // renders at 0.6x pulse speed, 0.22 max glow alpha
  simbad_id: "NAME+FOR+SIMBAD",  // use for stars (omit catalog_url)
  // OR:
  catalog_url: "https://ssd.jpl.nasa.gov/...",  // use for asteroids (omit simbad_id)
}
```

**Colors by index position in array:**
- 0: `#c4a258` (gold) — CEP-1347
- 1: `#8ab8ff` (blue) — U Sagittarii
- 2: `#5ecfbf` (teal) — Cindygraber
- 3: `#b07ecf` (purple) — Bunting
- 4: `#d4693a` (orange) — HD 344787 (pipeline)

Adding a 6th object: add a color to both `featured_colors` in `build_stars()` and the `items` color array in `draw_canvas_legend()`.

**For asteroids:** `ra_deg`/`dec_deg` are indicative only (asteroids move nightly). Note this in the writeup.

**Pipeline objects** (`pipeline: true`) pulse at 0.6x the normal frequency and at lower alpha, visually signaling an early-stage investigation. The `draw_featured_star()` function branches on `s.obj_data.pipeline`.

### Key Functions (js/main.js)

| Function | Purpose |
|---|---|
| `init()` | Called once on load. Sets canvas size, fetches `data/stars.json`, calls `build_stars`, starts rAF loop |
| `build_stars(catalog)` | Parses catalog array, builds `star_data`, appends featured objects |
| `draw(ts)` | Main rAF loop. Clears canvas, draws all stars, detects hover |
| `canvas_exposed_at(x, y)` | Returns true only if cursor/touch is inside `#hero` bounding rect |
| `on_click(e)` | Featured → `open_modal`; named star → `open_popover`. Guards with `canvas_exposed_at`. Early return if click is on `.book-spine`, `#star-popover`, or `.project-card` |
| `on_touch_start(e)` | Touch equivalent of `on_click`. Checks featured stars at 38px radius, named stars at 22px. Calls `e.preventDefault()` on hit to suppress ghost click. Registered on **window** with `{ passive: false }` |
| `open_modal(obj)` | Populates and shows `#object-modal`. Uses `catalog_url` if present, else `simbad_id`. Sets `modal-body` via `innerHTML` |
| `open_popover(name, url, cx, cy)` | Shows `#star-popover` near click point, clamped to viewport. Named catalog star confirmation step before SIMBAD redirect |
| `close_popover()` | Removes `.visible` from `#star-popover` |
| `reproject()` | Rebuilds pixel coords for all stars after window resize |
| `layout_shelves()` | Distributes `.book-spine` elements from `#bookshelf-pool` into `.book-shelf` rows inside `#bookshelf-rows`. Called on load and debounced resize (120ms) |
| `toggle_mobile_nav()` | Opens/closes mobile overlay, locks/unlocks body scroll |

### Scroll-Spy (js/main.js)

`IntersectionObserver` (variable name `observer`) on `['stars', 'about', 'research', 'cepheid-sim', 'writing', 'highlights', 'bookshelf']` with `rootMargin: '-20% 0px -60% 0px'` and `threshold: 0`. Adds `.active` class (gold color) to the matching `.nav-links a` on entry and calls `history.replaceState` to silently update the URL hash.

---

## Paper Templating Workflow

Academic papers live as standalone `.html` files built from `template.html`. The template carries the full site CSS (same variables, fonts, nav) but contains no article-specific content.

### Article page CSS additions (in `template.html` and all article pages)

- `.nav-back` — JetBrains Mono 11px back-link in nav, left of nav-name
- `.article-title` — EB Garamond 38px, max-width 720px
- `.article-meta` — JetBrains Mono 11px, letter-spacing 0.16em, gold
- `.article-byline` — JetBrains Mono 11px, text-dim
- `.article-body` — Spectral, 17px, line-height 1.82, max-width 660px
- `sup a` — gold color, subtle underline, hover fades to `--text`
- `section.footnotes` — top border, "Notes" heading via `::before`, smaller `--text-dim` type
- `a.footnote-back` — gold back-ref arrow

### Article pages inventory

| File | Publication | Date |
|---|---|---|
| `japan.html` | The Japan Periodical | Fall 2024 |
| `baghdad.html` | Academic Essay | Spring 2024 |
| `muralism.html` | Academic Essay | Spring 2025 |
| `descartes.html` | Academic Essay | February 2025 |
| `jane.html` | Academic Essay | Fall 2025 |
| `U_Sgr_abs.html` | Research Abstract & Poster | — |
| `1347_methods.html` | Methods Appendix (CEP-1347) | — |

---

## Audit Script

Run this to verify all features are present:

```python
with open('index.html') as f: html = f.read()
with open('js/main.js') as f: main_js = f.read()
with open('js/cepheid-engine.js') as f: sim_js = f.read()
with open('css/style.css') as f: css = f.read()

checks = {
    # index.html
    'ends </html>':             html.strip().endswith('</html>'),
    'og tags':                  'og:title' in html and 'og:image' in html,
    'email iife present':       "contact-email" in main_js and "henry.s.zimmer" in main_js,
    'CEP-1347 card':            'Merger Origin in a Binary Cepheid' in html,
    'Cindygraber card':         'Rotation Period and Taxonomy of 7605' in html,
    'U Sgr card':               'Distance Scale Calibration via U Sagittarii' in html,
    '8 writing items':          html.count('class="writing-item"') == 8,
    '21 bookshelf spines':      html.count('class="book-spine"') == 21,
    'bookshelf-pool':           'id="bookshelf-pool"' in html,
    'no section-label divs':    '<div class="section-label">' not in html,
    'data-label attrs':         html.count('data-label=') == 5,
    'back-to-top btn':          'id="back-to-top"' in html,
    'cepheid-sim section':      'id="cepheid-sim"' in html,
    'simCanvas':                'id="simCanvas"' in html,
    'sim-stage':                'id="sim-stage"' in html,
    'sim-info':                 'id="sim-info"' in html,
    'sim-controls':             'id="sim-controls"' in html,
    'hud-phase-label':          'id="hud-phase-label"' in html,
    'hamburger':                'id="nav-hamburger"' in html and 'id="nav-mobile"' in html,
    'star popover':             'id="star-popover"' in html,
    'profile image':            'HSZ_Headshot_BW.jpeg' in html,
    'mathjax lazy':             'mathjax' in html.lower(),
    'sim lazy-load':            'cepheid-engine.js' in html,

    # js/main.js
    'init() called':            main_js.strip().endswith('init();'),
    'hint_alpha':               'hint_alpha' in main_js,
    'layout_shelves fn':        'function layout_shelves' in main_js or 'layout_shelves' in main_js,
    'canvas pointer fix':       'canvas.style.pointerEvents' in main_js,
    'on_click gatekeeper':      "e.target.closest('.book-spine')" in main_js,
    '5 featured objects':       '19243 Bunting' in main_js and 'HD344787' in main_js,
    'HD 344787 pipeline':       'pipeline: true' in main_js,
    'hero rect click guard':    "getElementById('hero').getBoundingClientRect" in main_js,
    'scroll-spy observer':      'IntersectionObserver' in main_js,
    'on_touch_start fn':        'function on_touch_start' in main_js,
    'open_popover fn':          'function open_popover' in main_js,
    'bookshelf click toggle':   "querySelectorAll('.book-spine').forEach" in main_js,

    # js/cepheid-engine.js
    'sim init fn':              'async function init' in sim_js or 'function init' in sim_js,
    'setMode fn':               'window.setMode' in sim_js,
    'drawRVPlot fn':            'function drawRVPlot' in sim_js,
    'drawLightCurve fn':        'function drawLightCurve' in sim_js,
    'drawStar fn':              'function drawStar' in sim_js,
    'buildRV fn':               'function buildRV' in sim_js,
    'prepareObservationalData': 'function prepareObservationalData' in sim_js,
    'getStarArea fn':           'function getStarArea' in sim_js,
    'OGLE data embedded':       'OGLE_V_RAW' in sim_js,
    'Pilecki data embedded':    'PILECKI_RV_RAW' in sim_js,
    'GAMMA_SYS':                'GAMMA_SYS' in sim_js,
    'master_data.json fetch':   'master_data.json' in sim_js,
    'no composite mode':        'composite' not in sim_js.lower() or sim_js.lower().count('composite') == 0,

    # css/style.css
    'section-heading sticky':   'position: sticky' in css,
    'card hover lift':          'translateY(-6px)' in css,
    'book-spine active css':    '.book-spine.active' in css,
    'active spine-panel':       '.book-spine.active .spine-panel' in css,
    'sr-only class':            '.sr-only' in css,
    'sim-stage css':            '#sim-stage' in css,
    'sim mobile layout':        '#cepheid-sim' in css and 'flex-direction: column' in css,
    'btn-mode css':             '.btn-mode' in css,
    'bloom-related':            '.hud-val--purple' in css,
}

fail = False
for k, v in checks.items():
    print(f"  {'OK  ' if v else 'FAIL'} {k}")
    if not v: fail = True
print('\nALL OK' if not fail else '\nISSUES FOUND')
```

---

## Common Edit Patterns

### Change the hero tagline

```python
# str_replace anchor: the full <p class="hero-tagline"> line
old = '<p class="hero-tagline">I follow questions wherever they lead.</p>'
new = '<p class="hero-tagline">NEW TAGLINE HERE</p>'
```

### Add a paragraph to About

```python
# anchor: the closing </p> of the paragraph you want to insert after
# e.g. after the "Outside research..." paragraph:
old = '''  <p>Outside research, I captain the cross-country team, play jazz guitar, and founded RenewBlue, a campus sustainability initiative. I am drawn to problems that require patience, precision, and a willingness to tear down a model when the data demands it.</p>'''
new = old + '\n          <p>NEW PARAGRAPH.</p>'
```

### Add a highlights row before Cross-Country Captain (always last)

```python
old = '''        <div class="highlights-row">
          <div class="highlights-year">2023 &ndash;</div>
          <div class="highlights-item">
            <h4>Varsity Cross-Country Captain</h4>'''

new = '''        <div class="highlights-row">
          <div class="highlights-year">YEAR</div>
          <div class="highlights-item">
            <h4>NEW ENTRY TITLE</h4>
            <p>Description.</p>
          </div>
        </div>

        <div class="highlights-row">
          <div class="highlights-year">2023 &ndash;</div>
          <div class="highlights-item">
            <h4>Varsity Cross-Country Captain</h4>'''
```

### Add a featured object to the canvas

Add a new entry to `featured_objects` in the JS. Use the unique `name` field of an adjacent object as the str_replace anchor. If adding a 6th+ object, also add a color to both `featured_colors` in `build_stars()` and the inline color array in `draw_canvas_legend()`.

### Update a research card's body text

Use the `card-id` status string (e.g. `"Primary Research, In Preparation"`) as the leading anchor — it is unique per card.

---

## Fonts Reference

| Family | Usage |
|---|---|
| EB Garamond | `.hero-name`, `.nav-name`, `.section-heading`, `.card-title`, `.modal-name`, `.highlights-item h4`, `.footer-left`, `.article-title`, `h2`/`h3` in article body, `.spine-title span`, `.spine-book-title` |
| JetBrains Mono | `.hero-eyebrow`, `.nav-links`, `.section-heading::before` (generated label), `.card-id`, `.tag`, `.modal-type`, `.modal-simbad`, `.highlights-year`, `.writing-venue`, `.writing-date`, `.card-link`, `.highlights-cta`, `.footer-links`, `.about-footnote`, `.meta-label`, tooltip, canvas legend, `.article-meta`, `.article-byline`, `.nav-back`, figcaption |
| Spectral | `body` (default), `.hero-tagline`, `.card-body`, `.modal-body`, `.writing-content p`, `.spine-author`, `.spine-impact`, `.article-body` prose |

## Font Size Reference (JetBrains Mono elements — minimum 11px as of 2025-03-04)

| Element | Size |
|---|---|
| `.hero-eyebrow` | 12px |
| `.nav-links a` | 12px |
| `#star-tooltip` | 12px |
| `.modal-type` | 12px |
| `.modal-simbad` | 11.5px |
| `.section-heading::before` (generated label) | 18px |
| `.highlights-cta` | 11.5px |
| `.footer-links a` | 11.5px |
| `.about-footnote` | 11.5px |
| `.meta-label` | 11px |
| `.card-id` | 11px |
| `.tag` | 11px |
| `.card-link` | 11px |
| `.writing-venue` | 11px |
| `.writing-date` | 11px |
| `.highlights-year` | 12.5px |
| `.spine-title span` | 12px (EB Garamond) |
| `.spine-author` | 12px (Spectral) |
| `.spine-impact` | 12px (Spectral) |

**Policy:** No rendered text below 11px anywhere in the CSS. The aesthetic compression effect comes from `letter-spacing`, not from tiny type sizes.

---

## Links in the File

| Label | URL |
|---|---|
| Believing Belief | https://believingbelief.online/ |
| Curius reading list | https://curius.app/henry-zimmerman |
| Asteroid Scheduler (GitHub) | https://github.com/HenryZimme/asteroid-scheduler |
| Asteroid Statistics (GitHub) | https://github.com/HenryZimme/lcdb-observing-strategy |
| Asteroid Orbital Model | https://henryzimmerman.net/docs/asteroid_3d.html |
| GitHub profile | https://github.com/HenryZimme |
| OG image | `https://www.henryzimmerman.net/og-preview.jpg` — live in `<head>` |
| Profile photo | `images/HSZ_Headshot_BW.jpeg` — rendered in `.profile-frame` in about sidebar |
| CEP-1347 SIMBAD | via simbad_id: `OGLE+LMC+CEP+1347` |
| U Sgr SIMBAD | via simbad_id: `U+Sgr` |
| HD 344787 SIMBAD | via simbad_id: `HD344787` |
| HD 344787 paper | https://ui.adsabs.harvard.edu/abs/2026ApJ...998...50D/abstract |
| Cindygraber JPL | https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=7605 |
| Bunting JPL | https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=19243 |
| Espinoza-Arancibia & Pilecki 2025 | https://doi.org/10.3847/2041-8213/adb96b |
| Pilecki et al. 2022 | https://doi.org/10.3847/2041-8213/ac9fcc |
| Phillipian article | https://phillipian.net/2025/10/03/why-im-not-all-in-on-the-in-class-onslaught/ |
| Revere — Greenland | https://the-revere.com/2025/03/whats-at-stake-in-greenland/ |
| Revere — AfD | https://the-revere.com/2025/02/germanys-far-right-comeback-why-you-should-be-worried-about-the-afd/ |
| Jane Eyre essay | jane.html (local) |
| Japan Periodical | japan.html (local) |
| Muralism essay | muralism.html (local) |
| Baghdad essay | baghdad.html (local) |
| Descartes essay | descartes.html (local) |
| U Sgr abstract | U_Sgr_abs.html (local) |
| CEP-1347 methods | 1347_methods.html (local) |

---

## Cepheid Simulation Engine — Architecture (last updated 2026-03-09)

### Files
- `js/cepheid-engine.js` — IIFE, lazy-loaded via IntersectionObserver when `#cepheid-sim` enters viewport (200px rootMargin). Observer defined in inline `<script>` at bottom of `index.html`.
- `css/style.css` — all sim layout CSS (no more inline styles on sim elements)
- `data/master_data.json` — Keplerian + pulsation frames from Colab notebook
- `index.html` — simulation section `#cepheid-sim` with named sub-blocks: `#sim-info`, `#hud-table`, `#sim-stage`, `#sim-controls`

### Section layout (index.html, #cepheid-sim)

**Desktop (>740px):** `position: relative; height: 100vh; background: #000; isolation: isolate`
- `#sim-info` — absolute top-left, max-width 420px, z-index 20
- `#hud-table` — absolute top-right, 250px wide, z-index 20
- `#sim-stage` — absolute inset 0, z-index 1 (contains canvas + plot + preview)
- `#sim-controls` — absolute bottom-center, z-index 20

**Mobile (<=740px):** `height: auto; display: flex; flex-direction: column`
- `#sim-info` — relative, in-flow, padded
- `#hud-table` — relative, full-width, in-flow
- `#sim-stage` — relative, 530px height (320px stars + 30px gap + 180px plot)
- `#sim-controls` — relative, in-flow

All inline `style=""` attributes removed from sim elements. Zero inline styles remain.

### Modes (2 exposed, composite removed)
- `orbital` — both stars orbiting barycenter, RV plot (full period), orbital trails, star labels
- `pulsation` — isolates Cepheid, pulsation light curve with OGLE scatter, bloom effect

`setMode(mode)` clears trail buffers, updates button active styles via direct `.style` manipulation.

### Key functions (js/cepheid-engine.js)

| Function | Purpose |
|---|---|
| `init()` | Fetches `data/master_data.json`, validates arrays, computes bounds, calls `buildRV()` and `prepareObservationalData()`, starts animation loop |
| `buildRV()` | Precomputes `rv1[]`, `rv2[]`, `rvDelta[]` on a `RV_N=2400` phase grid. rv1 includes orbital (K1·sin φ) + pulsation (dr1/dt). rv2 is orbital only. Computes `rv_abs_min`/`rv_abs_max` bounds for plot Y-axis |
| `prepareObservationalData()` | Phase-folds OGLE V-band (187 pts) at P_puls with 1/err² alpha weighting. Phase-folds Pilecki RV (9 pts) at P_orb with grid-search phase offset alignment |
| `getPlotRect()` | Returns `{px, py, pw, ph}` of `#hud-plot-container` in canvas-space pixels |
| `getStarArea()` | Returns `{w, h, full_h, mobile}` — drawable area for stars. On mobile, constrained to above plot with 30px gap |
| `drawRVPlot(frameI)` | Full-period orbital RV plot. Model curves shifted by GAMMA_SYS. Pilecki scatter overlay. Green ΔRV≥40 shading. Moving cursor at current phase. Phase labels on x-axis |
| `drawLightCurve(magArr, frameI)` | 2-cycle pulsation light curve. OGLE scatter at weighted alpha behind Fourier fit curve. Centered cursor |
| `drawStar(spx, spy, pr, col, is_cepheid, brightness)` | Renders star disc with optional bloom (radial gradient + shadowBlur modulated by V-mag brightness fraction) |
| `animate()` | Main rAF loop. Draws ellipses, plots, trails, stars (z-sorted), labels, mobile separator. Updates HUD including phase label switching between φ_orb and φ_puls |
| `setMode(mode)` | Exposed on `window`. Switches mode, clears trails, updates button styles |
| `resize()` | DPR-aware canvas resizing, clears trail buffers |
| `hexToRgba(hex, alpha)` | Converts 7-char hex string to rgba() for gradient/alpha operations |

### Embedded observational data (in cepheid-engine.js)
- `OGLE_V_RAW` — 187 V-band photometric observations [hjd-2450000, mag, err]
- `PILECKI_RV_RAW` — 9 spectroscopic RV measurements [hjd-2450000, rv1, e1, rv2, e2]
- `GAMMA_SYS = 240.4` — systemic velocity in km/s
- `phase_offset` — computed at runtime via grid search on companion RV residuals (~0.651)

### Physical constants
```
COMPANION_RAD = 12.51 R☉        (Espinoza-Arancibia & Pilecki 2025)
P_ORB_D       = 58.85 d         (Pilecki et al. 2022, ApJ 940 L48)
P_PULS        = 0.69001 d
T0_ORB        = 2459000.0 HJD   (orbital reference epoch)
SIN_I         = sin(57°)
K1            ≈ 30.3 km/s
K2            ≈ 54.8 km/s
RV_THRESH     = 40 km/s         (ESPRESSO ΔRV requirement)
GAMMA_SYS     = 240.4 km/s      (systemic velocity)
TRAIL_LEN     = 40 frames
```

### RV model notes
- `rv1` includes orbital and pulsation contributions. Values are relative to systemic (centered on 0).
- `rv2` is orbital only (companion radius is constant).
- Plot draws curves shifted by `GAMMA_SYS` so they appear in the absolute RV frame.
- Pilecki data points are plotted at their observed absolute RVs with phase correction.
- Position-derived RV overlay removed; replaced by Pilecki observational scatter.
- Full orbital period shown (not sliding window). Moving cursor marks current phase.

### Bloom effect
- Cepheid star rendered with radial gradient bloom modulated by V-magnitude.
- `brightness = 1 - (mag - minV) / (maxV - minV)` — 0 at faintest, 1 at brightest.
- Bloom radius: `pr * (2.0 + b * 4.0)` — 2x to 6x star radius.
- Bloom alpha: `0.10 + b * 0.35`.
- Core glow: `shadowBlur = pr * (1.5 + b * 3.0)`.
- Companion has no bloom effect.

### Orbital trails
- Last 40 positions stored in `trail1[]`, `trail2[]` (screen-space).
- Drawn as 1.5px dots with fading alpha (0 at oldest, 0.35 at newest).
- Cleared on resize and mode switch.

### Known issues / bugs in cepheid-sim

**1. HUD Unicode label errors — FIXED (2026-03-09)**
Replaced garbled Unicode subscript/modifier characters with proper `<sub>` tags. Phase label now has `id="hud-phase-label"` and is dynamically updated by JS to show φ_orb or φ_puls depending on mode.

**2. Cindygraber research card: missing `card-tags` wrapper and extra `</div>` (index.html)**
The 6 `<span class="tag">` elements after the `card-links` div are not wrapped in a `<div class="card-tags">`. Additionally, there is an extra `</div>` after them that prematurely closes the `<div class="research-cards">` container, causing the U Sgr card to become a DOM sibling of `research-cards` rather than a child.
Fix: wrap the tags in `<div class="card-tags">...</div>` and remove the extra `</div>`.

**3. Highlights section: extra closing `</div>` tags (index.html)**
After the Varsity Cross-Country Captain row, there are 4 `</div>` tags where only 2 are needed (to close `.highlights-table` and `.section-inner`). The 2 extra `</div>` tags prematurely close ancestor elements.
Fix: remove 2 of the 4 `</div>` tags between the last highlights row and `</section>`.

**4. Canvas text below 11px policy (js/cepheid-engine.js)**
The RV plot annotations use 8.5px and 9px font sizes for model disclaimer text and Y-axis tick labels. These are canvas-drawn, not CSS, so they're outside the CSS font-size policy. Whether to raise them to 11px is a design judgment call (they're intentionally small to avoid visual clutter on the plot).

**5. Composite mode code — FIXED (2026-03-09)**
Composite mode and `buildRVFromPositions()` removed entirely. MODES set now contains only 'orbital' and 'pulsation'.

**6. ESPRESSO constraint callout — FIXED (2026-03-09)**
The ΔRV ≥ 40 km/s constraint is now clearly visualized in the orbital RV plot with green shading. The pulsation phase constraint is still not explicitly visualized but the Pilecki data overlay provides observational grounding.

**7. Frame-to-phase mapping assumes JSON phase alignment (js/cepheid-engine.js)**
`drawRVPlot` computes `rvI = Math.round(frameI / N * RV_N) % RV_N`, and the HUD displays phase as `i / p.x1.length`. Both assume frame 0 in `master_data.json` corresponds to orbital phase 0. Pilecki data alignment uses a grid-search `phase_offset` (~0.651) to compensate for any T0 mismatch. Verify with the Colab notebook that frame 0 = phi = 0.

**8. Stars not rendering; animation loop trapped inside fetch — FIXED (2026-03-10)**
`requestAnimationFrame(draw)` was called only inside the `fetch(...).then(...)` success handler. If `stars.json` fetched fine, the featured research objects still wouldn't render until the promise resolved. Fixed: `requestAnimationFrame(draw)` is now called unconditionally at the top of `init()`, before the fetch. `draw()` already has a `catalog_loaded` guard that skips rendering background stars until the catalog arrives. Also added `r.ok` check and `.catch()` to the stars fetch.

**9. Cepheid sim silently failing on HTTP error — FIXED (2026-03-10)**
`fetch('master_data.json')` was missing an `r.ok` check. A 404 response body is HTML, and `r.json()` on HTML throws a `SyntaxError` that was swallowed by the existing `try/catch`, leaving the sim frozen on the loading placeholder with no console message. Fixed: added `if (!r.ok) throw new Error('HTTP ' + r.status + ' loading master_data.json');` between the `await fetch` and `await r.json()` lines.

**10. GitHub link in mobile hamburger menu — FIXED (2026-03-10)**
The `<nav class="nav-mobile">` contained a bare `<a href="https://github.com/HenryZimme">GitHub</a>` link that violated the requirement. Removed. The GitHub link remains in the desktop footer.

**11. Sticky section headings overlapping mobile nav — FIXED (2026-03-10)**
`.section-heading` had `top: 20px` but the mobile nav bar is ~57px tall. Sticky headings slid behind the nav, causing text-on-text overlap. Fixed: added `@media (max-width: 740px) { .section-heading { top: 60px; } }` in `style.css`.

**12. Mobile nav not opaque after hero — FIXED (2026-03-10)**
The `<nav>` had a permanent semi-transparent gradient background on all breakpoints. Added a `.nav--scrolled` CSS class that applies `background: var(--panel)` with backdrop blur and a bottom border, scoped to `@media (max-width: 740px)`. A scroll listener in `main.js` toggles the class when `#hero`'s bottom edge scrolls above the viewport. Desktop appearance unchanged.

**13. Bookshelf `n_per_row` ignoring expanded width — FIXED (2026-03-10)**
The old formula `Math.floor(container_inner_w / (w_col + gap))` packed as many collapsed spines as possible, making no allowance for an expanded book. On a 375px phone, expanding a spine would overflow invisibly (hidden scrollbar). Fixed: formula now reserves space for 1 expanded spine on both breakpoints: `Math.max(2, 1 + Math.floor((effective_w - w_exp) / (w_col + gap)))`. Mobile uses `effective_w = container_inner_w - 20` for extra breathing room.

**14. `:nth-child()` height rules resetting per shelf row — FIXED (2026-03-10)**
`layout_shelves()` moves spines into dynamically created `.book-shelf` rows. CSS `:nth-child()` counts position within the current parent, so every row repeated the same short height cycle (books 8–21 always got the heights of positions 1–7 or 8 in their row). The static lookup table has been removed from CSS. Heights are now computed in JS from content length (spine-book-title + spine-author + spine-impact character count, mapped linearly to 190–250px) and applied as inline `style.height` on each spine once at IIFE initialization, before any rows are built.
