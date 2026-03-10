const canvas = document.getElementById('star-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('star-tooltip');
const modal = document.getElementById('object-modal');
const popover = document.getElementById('star-popover');
const popover_name = document.getElementById('star-popover-name');
const popover_btn = document.getElementById('star-popover-btn');

document.getElementById('modal-close-btn').addEventListener('click', close_modal);
modal.addEventListener('click', e => { if (e.target === modal) close_modal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { close_modal(); close_popover(); } });

// featured research objects, open modal on click, pulse gold on canvas
const featured_objects = [
  {
    name: "OGLE-LMC-CEP-1347 | v = 17.08",
    ra_deg: 83.625,
    dec_deg: -69.27,
    simbad_id: "OGLE+LMC+CEP+1347",
    type: "Binary Cepheid Variable  |  Large Magellanic Cloud",
    writeup: "My primary research target: a double-overtone binary Cepheid in the Large Magellanic Cloud with the shortest known orbital period among binary Cepheids (~59 days). Using a custom prewhitening and Light-Travel Time Effect correction pipeline, I recovered a frequency triplet with spacing $\Delta f \approx 0.0074$ c/d, initially suggesting an asynchronous rotation period of ~135 days. Since tidal synchronization precedes circularization, finding asynchronous rotation in a circular orbit would indicate a recent merger spindown. However, my subsequent window function analysis revealed this triplet is a 1/yr sampling alias, and the predicted 0.2% tidal signal remains buried below the OGLE noise floor. To bypass these photometric limits, I am now Co-Investigator and Author of a VLT/ESPRESSO proposal with Dr. Bogumił Pilecki to resolve the system’s merger history through high-resolution spectroscopy."
  },
  {
    name: "U Sagittarii | v = 6.68",
    ra_deg: 277.972,
    dec_deg: -19.125,
    simbad_id: "U+Sgr",
    type: "Classical Cepheid Variable  |  Open Cluster M25",
    writeup: "My first independent research target. U Sgr is a classical Cepheid variable embedded in open cluster M25, with a pulsation period of ~6.745 days driven by the kappa-mechanism. Using multi-band (V\u2212I) differential photometry from remotely scheduled nightly observations, I measured a distance modulus with 1.9% error, within the 4% margin set by the M25 Hipparcos parallax. I characterized dust extinction along the line of sight by comparing V-band and I-band distance moduli, and cross-validated against literature values. The project expanded into an investigation of metallicity-dependent corrections to the Cepheid period-luminosity relation and their implications for the cosmic distance scale."
  },
  {
    name: "7605 Cindygraber | v = 16.0",
    ra_deg: 163.5,
    dec_deg: 14.2,
    catalog_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=7605&view=VOP",
    type: "Main-Belt Asteroid  |  Indicative sky position",
    writeup: "My ongoing asteroid rotation project. 7605 Cindygraber has no confirmed synodic rotation period in the literature. I trained machine learning models on the ALCDEF Light Curve Database to predict period convergence requirements as a function of observing cadence, wrote a formal multi-site observing proposal supported by a statistical analysis, and am coordinating photometric observations across sites in Chile, Australia, and the Canary Islands using my open-source asteroid observing scheduler. I am also extracting and stacking spectra from diffraction grating images of the asteroid to constrain its taxonomic classification. Note: the marker position shown here and the visual magnitude is indicative, as asteroid sky coordinates and brightness change. Follow the GitHub link to the live ephemeris scheduler."
  },
  {
    name: "19243 Bunting | v = 15.9",
    ra_deg: 210.0,
    dec_deg: 8.5,
    catalog_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=19243&view=VOP",
    type: "Main-Belt Asteroid  |  Indicative sky position",
    writeup: "A second target in the same multi-site observing campaign. I am determining the first confirmed synodic rotation period for 19243 Bunting in parallel with Cindygraber, using the same photometric pipeline and open-source scheduler. Observations are coordinated across sites in Chile, Australia, and the Canary Islands. Note: the marker position shown here and the visual magnitude is indicative, as asteroid sky coordinates and brightness change."
  },
  {
    name: "HD 344787 | v = 9.32",
    ra_deg: 295.872,
    dec_deg: 23.178,
    simbad_id: "HD344787",
    pipeline: true,
    type: "Active Investigation  |  Northern Sky",
    writeup: "At the 247th AAS meeting, I watched Dupree &amp; MacLeod present evidence that Betelgeuse has a hidden companion star, detected not by seeing it directly but by watching it stir up the giant star's atmosphere as it orbits (<a href=\"https://ui.adsabs.harvard.edu/abs/2026ApJ...998...50D/abstract\" target=\"_blank\" rel=\"noopener\" style=\"color:#d4693a\">ApJ 998, 50</a>). That talk left me with a question: if you can find a hidden companion in Betelgeuse that way, what about a quiet star like HD 344787, a low-amplitude Cepheid that looks a lot like Polaris? Is it alone, or is something else there, invisible and waiting to be found?"
  }
];

// rendering state
let star_data = [];
let bg_stars_by_color = {}; // pre-grouped background stars, built once in build_stars
let mouse = { x: -9999, y: -9999 };
let hover_star = null;
let time_s = 0;
let catalog_loaded = false;
let raf_id = null;
let hero_visible = true;
let cursor_is_pointer = false; // track to avoid per-frame style writes
let last_frame_ts = 0;
const FRAME_INTERVAL = 1000 / 30; // target 30fps — star field needs no more

// deterministic rng, used only for per-star twinkle phase assignment
function make_rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0xffffffff;
  };
}

// equirectangular projection: ra [0, 360) degrees -> x, dec [-90, 90] -> y
function project(ra_deg, dec_deg) {
  return {
    x: (ra_deg / 360) * canvas.width,
    y: (1 - (dec_deg + 90) / 180) * canvas.height
  };
}

// rebuild pixel coordinates after resize, ra/dec stored on each star
function reproject() {
  for (const s of star_data) {
    const p = project(s.ra_deg, s.dec_deg);
    s.x = p.x;
    s.y = p.y;
  }
}

// build internal star_data from parsed catalog array
// catalog entry format: [ra_deg, dec_deg, vmag, color_hex, name_or_null]
function build_stars(catalog) {
  star_data = [];
  const rng = make_rng(31415);

  // sort: named stars first (interactive layer loads first), then by magnitude
  // ascending (brightest = lowest vmag first) within each group.
  // O(n log n) once at load time — zero runtime cost.
  const sorted = catalog.slice().sort((a, b) => {
    const a_named = a[4] !== null ? 0 : 1;
    const b_named = b[4] !== null ? 0 : 1;
    if (a_named !== b_named) return a_named - b_named;
    return a[2] - b[2]; // vmag ascending (brighter first)
  });

  for (const [ra_deg, dec_deg, vmag, color, name] of sorted) {
    const pos = project(ra_deg, dec_deg);
    const size = Math.max(0.4, (7.2 - vmag) * 0.38);
    const is_named = name !== null;
    const phase = rng() * Math.PI * 2;
    const freq  = 0.3 + rng() * 1.4;
    // floor bucket + fractional remainder for LUT interpolation
    const bucket_f = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * (TWINKLE_BUCKETS - 1);
    const freq_bucket = Math.min(TWINKLE_BUCKETS - 2, Math.floor(bucket_f)); // -2 so bucket+1 is always valid
    const freq_lerp   = bucket_f - freq_bucket;

    star_data.push({
      x: pos.x,
      y: pos.y,
      ra_deg,
      dec_deg,
      size,
      mag: vmag,
      name: is_named ? name : null,
      simbad_id: is_named ? name : null,
      freq_bucket,
      freq_lerp,
      sin_phase: Math.sin(phase),
      cos_phase: Math.cos(phase),
      featured: false,
      color,
      rgba_glow0: hex_to_rgba(color, 0.20),
      rgba_full:  hex_to_rgba(color, 1)
    });
  }

  // add featured research objects on top
  const featured_colors = ['#c4a258', '#8ab8ff', '#5ecfbf', '#b07ecf', '#d4693a'];
  for (let fi = 0; fi < featured_objects.length; fi++) {
    const obj = featured_objects[fi];
    const pos = project(obj.ra_deg, obj.dec_deg);
    const rng2 = make_rng(99999 + fi * 7);
    const f_phase  = rng2() * Math.PI * 2;
    const f_freq   = 1.2 + fi * 0.2;
    const f_bucket_f = (f_freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * (TWINKLE_BUCKETS - 1);
    const f_bucket   = Math.min(TWINKLE_BUCKETS - 2, Math.max(0, Math.floor(f_bucket_f)));
    const f_lerp     = f_bucket_f - f_bucket;
    star_data.push({
      x: pos.x,
      y: pos.y,
      ra_deg: obj.ra_deg,
      dec_deg: obj.dec_deg,
      size: 3.5,
      mag: 0,
      name: obj.name,
      simbad_id: obj.simbad_id,
      freq_bucket: f_bucket,
      freq_lerp:   f_lerp,
      sin_phase: Math.sin(f_phase),
      cos_phase: Math.cos(f_phase),
      featured: true,
      obj_data: obj,
      color: featured_colors[fi] || '#c4a258',
      rgba_glow0: hex_to_rgba(featured_colors[fi] || '#c4a258', 1),
      rgba_full:  hex_to_rgba(featured_colors[fi] || '#c4a258', 1)
    });
  }

  // pre-group background stars by color so draw loop doesn't rebuild every frame
  bg_stars_by_color = {};
  for (const s of star_data) {
    if (s.featured || s.name) continue;
    if (!bg_stars_by_color[s.color]) bg_stars_by_color[s.color] = [];
    bg_stars_by_color[s.color].push(s);
  }
}

// ── twinkle lookup table ──────────────────────────────────────────────────────
// Instead of Math.sin(time_s * freq + phase) per star (~9000 calls/frame),
// we quantize frequencies into TWINKLE_BUCKETS bins and use the angle-addition
// identity: sin(t*f + p) = sin(t*f)*cos(p) + cos(t*f)*sin(p).
// Per frame: compute sin/cos for each bucket (64 calls total).
// Per star: one lookup + 2 multiplies + 1 add. No per-star trig.
const TWINKLE_BUCKETS = 64;
const FREQ_MIN = 0.3, FREQ_MAX = 1.7;
const twinkle_sin_lut = new Float32Array(TWINKLE_BUCKETS); // sin(time_s * bucket_freq)
const twinkle_cos_lut = new Float32Array(TWINKLE_BUCKETS); // cos(time_s * bucket_freq)

function update_twinkle_lut() {
  for (let i = 0; i < TWINKLE_BUCKETS; i++) {
    const f = FREQ_MIN + (i / (TWINKLE_BUCKETS - 1)) * (FREQ_MAX - FREQ_MIN);
    const a = time_s * f;
    twinkle_sin_lut[i] = Math.sin(a);
    twinkle_cos_lut[i] = Math.cos(a);
  }
}

// twinkle value for a star: lerps between adjacent LUT buckets using freq_lerp.
// Each star gets a unique effective frequency within its bin — full variation,
// zero per-star trig. Cost: 2 LUT lookups + 1 lerp (3 multiplies, 2 adds).
function star_twinkle(s) {
  const i = s.freq_bucket;
  const t = s.freq_lerp;
  const sin_f = twinkle_sin_lut[i] + t * (twinkle_sin_lut[i + 1] - twinkle_sin_lut[i]);
  const cos_f = twinkle_cos_lut[i] + t * (twinkle_cos_lut[i + 1] - twinkle_cos_lut[i]);
  return 0.78 + 0.22 * (sin_f * s.cos_phase + cos_f * s.sin_phase);
}



// convert #rrggbb to rgba(r,g,b,a) string
function hex_to_rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// batched background star drawing — uses pre-grouped color buckets built at catalog load.
// Sets fillStyle once per color group instead of once per star (~9000 → handful of state changes).
function draw_background_stars_batched() {
  const TWO_PI = Math.PI * 2;
  for (const color in bg_stars_by_color) {
    ctx.fillStyle = color;
    for (const s of bg_stars_by_color[color]) {
      const twinkle = star_twinkle(s);
      ctx.globalAlpha = 0.32 + 0.24 * twinkle;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, TWO_PI);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function draw_named_star(s) {
  const twinkle = star_twinkle(s);
  // soft glow for brighter stars
  if (s.size > 1.6) {
    const gr = s.size * 3.4;
    const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
    grd.addColorStop(0, hex_to_rgba(s.color, 0.20 * twinkle));
    grd.addColorStop(1, hex_to_rgba(s.color, 0));
    ctx.beginPath();
    ctx.arc(s.x, s.y, gr, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
  ctx.fillStyle = s.color;
  ctx.globalAlpha = 0.70 + 0.30 * twinkle;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function draw_featured_star(s) {
  const is_pipeline = s.obj_data && s.obj_data.pipeline;
  // featured stars use the LUT-based twinkle as their pulse
  const pulse = star_twinkle(s);
  const glow_r = 16 + pulse * 5;
  const c = s.color;
  const glow_alpha = is_pipeline ? 0.22 : 0.45;
  const ring_base  = is_pipeline ? 0.12 : 0.28;
  const ring_pulse = is_pipeline ? 0.22 : 0.45;

  // radial glow — use hex_to_rgba only for the variable alpha (pulse-dependent)
  const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow_r);
  grd.addColorStop(0, hex_to_rgba(c, glow_alpha * pulse));
  grd.addColorStop(1, hex_to_rgba(c, 0));
  ctx.beginPath();
  ctx.arc(s.x, s.y, glow_r, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // orbit ring
  ctx.beginPath();
  ctx.arc(s.x, s.y, 8 + pulse * 2.5, 0, Math.PI * 2);
  ctx.strokeStyle = hex_to_rgba(c, ring_base + pulse * ring_pulse);
  ctx.lineWidth = 1;
  ctx.stroke();

  // core dot
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
}

function draw_hover_ring(s) {
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size + 5, 0, Math.PI * 2);
  ctx.strokeStyle = s.featured
    ? hex_to_rgba(s.color, 0.85)
    : 'rgba(200,215,245,0.60)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// pre-computed legend items — built once, not every frame
const legend_colors = ['#c4a258', '#8ab8ff', '#5ecfbf', '#b07ecf', '#d4693a'];
const legend_items = featured_objects.map((obj, i) => ({
  label: obj.name,
  color: legend_colors[i] || '#c4a258'
}));
let legend_col_w = 0; // measured once after font loads

function draw_canvas_legend() {
  const items = legend_items;
  ctx.save();
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';

  const dot_r = 4;
  const row_h = 18;
  const pad_x = 14;
  const pad_y = 12;
  const gap = 8;

  // measure col_w once (font must be set first)
  if (!legend_col_w) {
    const widths = items.map(it => ctx.measureText(it.label).width);
    legend_col_w = dot_r * 2 + gap + Math.max(...widths) + 20;
  }

  let x = pad_x;
  const y = canvas.height - pad_y - row_h / 2;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cx = x + dot_r;

    // pulsing dot — use bucket 0..4 mapped across LUT for variety
    const lut_i = Math.round(i * (TWINKLE_BUCKETS - 1) / (legend_items.length - 1));
    const pulse = 0.5 + 0.5 * twinkle_sin_lut[lut_i];
    const glow = ctx.createRadialGradient(cx, y, 0, cx, y, dot_r * 3);
    glow.addColorStop(0, hex_to_rgba(it.color, 0.35 * pulse));
    glow.addColorStop(1, hex_to_rgba(it.color, 0));
    ctx.beginPath();
    ctx.arc(cx, y, dot_r * 3, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, y, dot_r, 0, Math.PI * 2);
    ctx.fillStyle = it.color;
    ctx.globalAlpha = 0.8 + 0.2 * pulse;
    ctx.fill();
    ctx.globalAlpha = 1;

    // label
    ctx.fillStyle = 'rgba(200,215,245,0.52)';
    ctx.fillText(it.label, cx + dot_r + gap, y);

    x += legend_col_w;
  }

  // 'click to explore' load hint
  if (hint_alpha > 0) {
    ctx.save();
    ctx.font = '300 10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(196,162,88,' + hint_alpha * 0.6 + ')';
    ctx.fillText('click to explore', pad_x, canvas.height - pad_y - row_h / 2 - 22);
    ctx.restore();
  }
  ctx.restore(); // matches ctx.save() at top of draw_canvas_legend
}

// ── main render loop ──────────────────────────────────────────────────────────

function draw(ts) {
  // throttle to ~30fps — star field doesn't benefit from 60fps
  if (ts - last_frame_ts < FRAME_INTERVAL) {
    if (hero_visible) raf_id = requestAnimationFrame(draw);
    else raf_id = null;
    return;
  }
  last_frame_ts = ts;

  time_s = ts * 0.001;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!catalog_loaded) {
    if (hero_visible) raf_id = requestAnimationFrame(draw);
    else raf_id = null;
    return;
  }

  update_twinkle_lut(); // 64 sin/cos calls instead of ~9000

  hover_star = null;
  let min_d = 14;

  // draw all background stars batched by color (pre-grouped at catalog load)
  draw_background_stars_batched();

  for (const s of star_data) {
    if (s.featured) {
      draw_featured_star(s);
    } else if (s.name) {
      draw_named_star(s);
      // hover detection only for named + featured stars
      const dx = mouse.x - s.x, dy = mouse.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < min_d) { min_d = d; hover_star = s; }
    }
  }

  // featured hover detection (drawn after named so they win proximity ties)
  for (const s of star_data) {
    if (!s.featured) continue;
    const dx = mouse.x - s.x, dy = mouse.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 20) { hover_star = s; }
  }

  if (hover_star) {
    draw_hover_ring(hover_star);
    if (!cursor_is_pointer) { canvas.style.cursor = 'pointer'; cursor_is_pointer = true; }
  } else {
    if (cursor_is_pointer) { canvas.style.cursor = 'default'; cursor_is_pointer = false; }
  }

  draw_canvas_legend();
  if (hero_visible) {
    raf_id = requestAnimationFrame(draw);
  } else {
    raf_id = null;
  }
}

// ── interaction ───────────────────────────────────────────────────────────────

function canvas_exposed_at(x, y) {
  // canvas is only interactable when the cursor is over #hero,
  // the only section without an opaque background panel
  const rect = document.getElementById('hero').getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function on_mouse_move(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;

  if (hover_star && canvas_exposed_at(e.clientX, e.clientY)) {
    const mag_str = hover_star.featured
      ? ''
      : `  | v = ${hover_star.mag.toFixed(2)}`;
    tooltip.textContent = `${hover_star.name}${mag_str}`;
    tooltip.style.left = (e.clientX + 16) + 'px';
    tooltip.style.top  = (e.clientY - 28) + 'px';
    tooltip.classList.add('visible');
  } else {
    tooltip.classList.remove('visible');
    // dismiss stale popover once cursor leaves all named stars
    if (!hover_star) close_popover();
  }
}

function on_click(e) {
  // ignore clicks that originated on UI elements layered above the canvas
  if (e.target.closest('.book-spine') || e.target.closest('#star-popover') || e.target.closest('.project-card')) return;
  if (!hover_star) { close_popover(); return; }
  if (!canvas_exposed_at(e.clientX, e.clientY)) return;
  if (hover_star.featured) {
    close_popover();
    open_modal(hover_star.obj_data);
  } else {
    // ctrl/cmd+click: bypass confirmation and open directly
    if (e.ctrlKey || e.metaKey) {
      const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(hover_star.simbad_id)}`;
      window.open(url, '_blank', 'noopener');
      return;
    }
    const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(hover_star.simbad_id)}`;
    open_popover(hover_star.name, url, e.clientX, e.clientY);
  }
}

// touch handler for canvas: direct tap-to-open, no hover needed
function on_touch_start(e) {
  // don't process canvas taps when modal or mobile nav is open
  if (modal.classList.contains('visible')) return;
  if (mobile_nav.classList.contains('open')) return;

  const touch = e.changedTouches[0];
  const tx = touch.clientX;
  const ty = touch.clientY;

  if (!canvas_exposed_at(tx, ty)) return;

  // update mouse position so render loop reflects touch
  mouse.x = tx;
  mouse.y = ty;

  // check featured stars first (larger tap target)
  let best = null;
  let best_d = 38;
  for (const s of star_data) {
    if (!s.featured) continue;
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best_d) { best_d = d; best = s; }
  }

  if (best) {
    e.preventDefault();
    open_modal(best.obj_data);
    return;
  }

  // fallback: named catalog stars with slightly wider radius than mouse
  let best_named = null;
  let best_nd = 22;
  for (const s of star_data) {
    if (!s.name || s.featured) continue;
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best_nd) { best_nd = d; best_named = s; }
  }

  if (best_named) {
    e.preventDefault();
    const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(best_named.simbad_id)}`;
    open_popover(best_named.name, url, tx, ty);
  }
}

function open_popover(name, url, cx, cy) {
  popover_name.textContent = name;
  popover_btn.href = url;

  // position near click, clamped to viewport
  popover.style.left = '0px';
  popover.style.top  = '0px';
  popover.classList.add('visible');
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;
  const left = Math.min(cx + 14, window.innerWidth  - pw - 12);
  const top  = Math.min(cy - 8,  window.innerHeight - ph - 12);
  popover.style.left = Math.max(8, left) + 'px';
  popover.style.top  = Math.max(8, top)  + 'px';
}

function close_popover() {
  popover.classList.remove('visible');
}

function open_modal(obj) {
  document.getElementById('modal-type').textContent = obj.type;
  document.getElementById('modal-name').textContent = obj.name;
  document.getElementById('modal-body').innerHTML = obj.writeup;
  const link = document.getElementById('modal-simbad');
  if (obj.catalog_url) {
    link.href = obj.catalog_url;
    link.textContent = 'View on JPL Small-Body Database';
  } else {
    link.href = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(obj.simbad_id)}`;
    link.textContent = 'View on SIMBAD';
  }
  modal.classList.add('visible');
}

function close_modal() {
  modal.classList.remove('visible');
}

// prevent touches on the modal from reaching the canvas touch handler
const modal_inner = document.querySelector('.modal-inner');
modal_inner.addEventListener('touchstart', (e) => {
  e.stopPropagation();
}, { passive: true });
modal_inner.addEventListener('touchmove', (e) => {
  e.stopPropagation(); // lets modal scroll without moving star field
}, { passive: true });

// close popover when clicking outside it (on non-star areas)
document.addEventListener('click', (e) => {
  if (!popover.contains(e.target) && e.target !== canvas) close_popover();
});

// ── resize ───────────────────────────────────────────────────────────────────

function on_resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  legend_col_w = 0; // remeasure legend on next draw
  reproject();
}

// ── init: fetch catalog, build stars, start loop ───────────────
function init() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  // pause render loop when hero is off-screen, resume when it returns
  const hero_observer = new IntersectionObserver((entries) => {
    hero_visible = entries[0].isIntersecting;
    if (hero_visible && !raf_id) {
      raf_id = requestAnimationFrame(draw);
    }
  }, { threshold: 0 });
  hero_observer.observe(document.getElementById('hero'));

  // start render loop immediately — draw() guards on catalog_loaded internally
  raf_id = requestAnimationFrame(draw);

  fetch('/data/stars.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(catalog => {
      build_stars(catalog);
      catalog_loaded = true;
    })
    .catch(err => console.error('Star catalog load error:', err));
}

window.addEventListener('mousemove', on_mouse_move);
window.addEventListener('click', on_click);
window.addEventListener('resize', on_resize);
window.addEventListener('touchstart', on_touch_start, { passive: false });

// -- bookshelf touch toggle --
// tap to expand; tap again or tap another spine to collapse
document.querySelectorAll('.book-spine').forEach(spine => {
  spine.addEventListener('click', () => {
    const is_active = spine.classList.contains('active');
    document.querySelectorAll('.book-spine.active').forEach(s => s.classList.remove('active'));
    if (!is_active) spine.classList.add('active');
  });
});

// -- bookshelf adaptive layout --
(function() {
  const pool = document.getElementById('bookshelf-pool');
  const rows_el = document.getElementById('bookshelf-rows');
  if (!pool || !rows_el) return;

  // grab all spines once; moving a node preserves its event listeners
  const spines = Array.from(pool.children);

  // content-driven heights: measure text length across title + author + impact,
  // map linearly to 190–250px range. Applied as inline style so nth-child
  // scope doesn't matter (nth-child resets per parent row, not pool).
  spines.forEach(spine => {
    const title  = spine.querySelector('.spine-book-title');
    const author = spine.querySelector('.spine-author');
    const impact = spine.querySelector('.spine-impact');
    const len = (title  ? title.textContent.length  : 0)
              + (author ? author.textContent.length : 0)
              + (impact ? impact.textContent.length : 0);
    // clamp to 190–250px: shorter books are shorter spines
    const MIN_H = 190, MAX_H = 250, MIN_L = 30, MAX_L = 160;
    const clamped = Math.max(MIN_L, Math.min(MAX_L, len));
    const h = Math.round(MIN_H + (clamped - MIN_L) / (MAX_L - MIN_L) * (MAX_H - MIN_H));
    spine.style.height = h + 'px';
  });

  function layout_shelves() {
    const is_mobile = window.innerWidth <= 740;
    const w_col = is_mobile ? 40 : 46;
    const w_exp = is_mobile ? 150 : 172;
    const gap = 5;

    const container_rect = rows_el.parentElement.getBoundingClientRect();
    const computed_style = window.getComputedStyle(rows_el.parentElement);
    const padding_left = parseFloat(computed_style.paddingLeft);
    const padding_right = parseFloat(computed_style.paddingRight);
    const container_inner_w = container_rect.width - padding_left - padding_right;

    // n_per_row: fit 1 expanded + (n-1) collapsed + (n-1) gaps within the container.
    // On mobile we subtract a small extra margin so books aren't flush to the edge.
    const effective_w = is_mobile ? container_inner_w - 20 : container_inner_w;
    const n_per_row = Math.max(2, 1 + Math.floor((effective_w - w_exp) / (w_col + gap)));

    const total = spines.length;
    const n_rows = Math.ceil(total / n_per_row);
    const base = Math.floor(total / n_rows);
    const extra = total % n_rows; // first `extra` rows get one extra book

    rows_el.innerHTML = '';
    let idx = 0;
    for (let r = 0; r < n_rows; r++) {
      const count = base + (r < extra ? 1 : 0);
      const shelf = document.createElement('div');
      shelf.className = 'book-shelf';
      shelf.setAttribute('role', 'list');
      for (let j = 0; j < count; j++) {
        shelf.appendChild(spines[idx++]);
      }
      rows_el.appendChild(shelf);
      const surface = document.createElement('div');
      surface.className = 'book-shelf-surface';
      rows_el.appendChild(surface);
    }
  }

  layout_shelves();

  let resize_timer;
  window.addEventListener('resize', () => {
    clearTimeout(resize_timer);
    resize_timer = setTimeout(layout_shelves, 120);
  });
})();

// -- scroll-spy & url updater --
const nav_sections = ['stars','about', 'research', 'cepheid-sim', 'writing', 'highlights', 'bookshelf'];
const nav_links_array = Array.from(document.querySelectorAll('.nav-links a'));

const observerOptions = {
  root: null,
  rootMargin: '-20% 0px -60% 0px', // Triggers when the section reaches the upper-middle of screen
  threshold: 0
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      
      // 1. Update the active class in the navigation
      nav_links_array.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
      });
      
      // 2. Silently update the browser's URL bar without jumping the page
      history.replaceState(null, null, '#' + id);
    }
  });
}, observerOptions);

nav_sections.forEach(id => {
  const el = document.getElementById(id);
  if (el) observer.observe(el);
});

// -- hamburger --
const hamburger_btn = document.getElementById('nav-hamburger');
const mobile_nav = document.getElementById('nav-mobile');
function toggle_mobile_nav() {
  const open = mobile_nav.classList.toggle('open');
  hamburger_btn.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
  // prevent starfield interaction while menu is open
  canvas.style.pointerEvents = open ? 'none' : 'auto';
}
hamburger_btn.addEventListener('click', (e) => { e.stopPropagation(); toggle_mobile_nav(); });
mobile_nav.addEventListener('click', (e) => e.stopPropagation());
mobile_nav.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
mobile_nav.querySelectorAll('.mobile-link').forEach(a => {
  a.addEventListener('click', () => {
    mobile_nav.classList.remove('open');
    hamburger_btn.classList.remove('open');
    document.body.style.overflow = '';
    canvas.style.pointerEvents = 'auto';
  });
});

// -- back to top --
const back_to_top_btn = document.getElementById('back-to-top');
window.addEventListener('scroll', () => {
  back_to_top_btn.classList.toggle('visible', window.scrollY > 500);

  // mobile only: make nav opaque once user scrolls past the hero section
  const hero_bottom = document.getElementById('hero').getBoundingClientRect().bottom;
  document.querySelector('nav').classList.toggle('nav--scrolled', hero_bottom <= 0);
}, { passive: true });
back_to_top_btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// -- canvas hint: "click to explore" fades in then out --
let hint_alpha = 0;
setTimeout(() => {
  const t0 = performance.now();
  (function fade_in(t) {
    hint_alpha = Math.min(1, (t - t0) / 900);
    if (hint_alpha < 1) requestAnimationFrame(fade_in);
  })(t0);
  setTimeout(() => {
    const t1 = performance.now();
    (function fade_out(t) {
      hint_alpha = Math.max(0, 1 - (t - t1) / 1100);
      if (hint_alpha > 0) requestAnimationFrame(fade_out);
    })(t1);
  }, 3000);
}, 2200);

(function() {
  const u = ['henry.s.zimmer', 'man', '@gmail.com'].join('');
  const el = document.getElementById('contact-email');
  if (el) {
    const a = document.createElement('a');
    a.href = 'mailto:' + u;
    a.textContent = u;
    a.style.color = 'var(--blue)';
    a.style.textDecoration = 'none';
    a.addEventListener('mouseenter', () => a.style.textDecoration = 'underline');
    a.addEventListener('mouseleave', () => a.style.textDecoration = 'none');
    el.appendChild(a);
  }
})();

init();
