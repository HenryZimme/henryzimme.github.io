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
    fov_deg: 3.0, // LMC field, wide enough to show context
    simbad_id: "OGLE+LMC+CEP+1347",
    card_url: "#card-cep1347",
    type: "Binary Cepheid Variable  |  Large Magellanic Cloud",
    writeup: "My primary research target. I analyzed six years of OGLE photometry for this double-overtone binary Cepheid in the LMC, built a pipeline to isolate residual signals, and found that a candidate rotational signature consistent with merger spindown was a 1/yr sampling alias of the ground-based cadence. I am now Co-Investigator and primary author of the Science Justification for a VLT/ESPRESSO proposal with Dr. Bogumił Pilecki to test the merger scenario through chemical abundances."
  },
  {
    name: "U Sagittarii | v = 6.68",
    ra_deg: 277.972,
    dec_deg: -19.125,
    fov_deg: 0.5, // tight on M25 cluster
    simbad_id: "U+Sgr",
    card_url: "#card-usgr",
    type: "Classical Cepheid Variable  |  Open Cluster M25",
    writeup: "My first independent research target. U Sgr sits inside M25, a loose open cluster you can just resolve in binoculars, which made it a good starting point: bright enough to work with a modest telescope, with enough nearby cluster stars to build a reliable differential photometry reference frame. What I didn't expect was how cleanly dust extinction would separate the V-band error from the I-band."
  },
  {
    name: "7605 Cindygraber | v = 16.0",
    ra_deg: 163.5,
    dec_deg: 14.2,
    catalog_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=7605&view=VOP",
    image_url: "/images/cindygraber_sub.jpeg",
    card_url: "#card-cindygraber",
    type: "Main-Belt Asteroid  |  Indicative sky position",
    writeup: "7605 Cindygraber has no confirmed synodic rotation period. I picked it partly for that reason: it's a gap in the catalog that's measurable with modest aperture if you get the cadence right. The asteroid's near-12-hour period meant that a single site campaigns would fail on it, which is why the scheduler mattered as much as the telescope time. Marker position and magnitude are indicative."
  },
  {
    name: "19243 Bunting | v = 15.9",
    ra_deg: 210.0,
    dec_deg: 8.5,
    catalog_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=19243&view=VOP",
    image_url: "/images/bunting_sub.jpeg",
    card_url: "#card-cindygraber",
    type: "Main-Belt Asteroid  |  Indicative sky position",
    writeup: "19243 Bunting has no confirmed synodic rotation period. In my astronomy research class, we are determining it through multi-band photometry, using the same open-source scheduler and pipeline as my parallel campaign on 7605 Cindygraber. Marker position and magnitude are indicative."
  },
  {
    name: "4715 Medesicaste | v = 15.5",
    ra_deg: 88.05,
    dec_deg: 41.03,
    catalog_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=4715&view=VOP",
    image_url: "/images/4715_shape_model.png",
    // card_url: "#card-astcadence", // uncomment when research card is live
    type: "Jupiter Trojan, L5 Trailing Camp  |  Indicative sky position",
    writeup: "4715 Medesicaste is the asteroid that started a question I couldn\u2019t let go of. Lam et al. (2023) showed that non-uniform sampling suppressed aliased Fourier period solutions for this L5 trojan more effectively than the quasi-uniform WISE cadence, but no framework existed to empirically optimize that cadence for the single-night ground-based case. I built one. It runs in two phases: window function minimization, then a multi-stage CMA-ES search trained and validated on ALCDEF light curves with injected Gaussian noise. The largest gains show up consistently in the 8\u201316 hr period bin, the regime that contains Medesicaste\u2019s 8.8 hr rotation period and the most densely populated period range among asteroids. Paper in preparation. Marker position is from MPC/RECON astrometry (2026 Sep 7) magnitude is indicative."
  },
  {
    name: "HD 344787 | v = 9.32",
    ra_deg: 295.872,
    dec_deg: 23.178,
    fov_deg: 0.5,
    simbad_id: "HD344787",
    pipeline: true,
    type: "Active Investigation  |  Northern Sky",
    writeup: "At the 247th AAS meeting, I watched Dupree et al. present evidence that Betelgeuse has a hidden companion star, detected not by seeing it directly but by watching it stir up the giant star's atmosphere as it orbits (<a href=\"https://ui.adsabs.harvard.edu/abs/2026ApJ...998...50D/abstract\" target=\"_blank\" rel=\"noopener\" style=\"color:#d4693a\">ApJ 998, 50</a>). That talk left me with a question: if you can find a hidden companion in Betelgeuse that way, what about a quiet star like HD 344787, a low-amplitude Cepheid that looks a lot like Polaris (<a href=\"https://doi.org/10.1051/0004-6361/202040123\" target=\"_blank\" rel=\"noopener\" style=\"color:#d4693a\">Ripepi et al. 2021</a>)? Is it alone, or is something else there, invisible and waiting to be found?"
  }
];

// single source of truth for featured object colors, indexed parallel to featured_objects.
// used in build_featured_only / build_stars_staged (canvas markers), draw_canvas_legend, and legend_items.
const FEATURED_COLORS = ['#c4a258', '#8ab8ff', '#5ecfbf', '#b07ecf', '#d4693a', '#e8c97a'];

// rendering state
let star_data = [];
let bg_stars_by_color = {}; // pre-grouped background stars, built once in build_stars
let bg_bright_stars = []; // pre-filtered background stars (size > 1.0) for core dot pass
let named_stars   = []; // pre-filtered; avoids full scan on touch events
let featured_stars = []; // pre-filtered; avoids full scan on touch events
let mouse = { x: -9999, y: -9999 };
let hover_star = null;

// touch disambiguation: distinguishes taps from scrolls
let touch_start_x = 0;
let touch_start_y = 0;
let touch_is_scroll = false;
const TOUCH_SLOP = 8; // px of movement before treating gesture as a scroll
let last_touch_action_ts = -1000; // suppresses synthetic click fired after touchend
let time_s = 0;
let catalog_loaded = false;
let raf_id = null;
let hero_visible = true;
let twinkle_active = false; // false until profile image fully loads; loop deferred to keep TBT low
let cursor_is_pointer = false; // track to avoid per-frame style writes
let tooltip_tw = 160, tooltip_th = 28; // cached tooltip dims (avoids forced reflow on mousemove)
let tooltip_last_content = '';
let popover_pw = 0, popover_ph = 0; // cached popover dims (measure once, reuse)
let last_frame_ts = 0;
const FRAME_INTERVAL = 1000 / 30; // target 30fps, star field needs no more

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

// ---
// called immediately at init() so the canvas is never blank while stars.json loads.
// featured_objects is hardcoded in JS; nothing here touches the catalog.
function build_featured_only() {
  star_data = [];
  for (let fi = 0; fi < featured_objects.length; fi++) {
    const obj = featured_objects[fi];
    const pos = project(obj.ra_deg, obj.dec_deg);
    const rng2 = make_rng(99999 + fi * 7);
    const f_phase    = rng2() * Math.PI * 2;
    const f_freq     = 1.2 + fi * 0.2;
    const f_bucket_f = (f_freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * (TWINKLE_BUCKETS - 1);
    const f_bucket   = Math.min(TWINKLE_BUCKETS - 2, Math.max(0, Math.floor(f_bucket_f)));
    const f_lerp     = Math.min(1, Math.max(0, f_bucket_f - f_bucket));
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
      color: FEATURED_COLORS[fi] || FEATURED_COLORS[0],
      rgba_glow0: hex_to_rgba(FEATURED_COLORS[fi] || FEATURED_COLORS[0], 1),
      rgba_full:  hex_to_rgba(FEATURED_COLORS[fi] || FEATURED_COLORS[0], 1)
    });
  }
  featured_stars  = star_data.slice(); // all entries are featured at this point
  named_stars     = [];
  bg_stars_by_color = {};
  bg_bright_stars = [];
}

// shared helper: rebuild all pre-filtered index arrays from current star_data.
// called after each phase so draw loop and touch handlers stay consistent.
function rebuild_indexes() {
  bg_stars_by_color = {};
  for (const s of star_data) {
    if (s.featured || s.name) continue;
    if (!bg_stars_by_color[s.color]) bg_stars_by_color[s.color] = [];
    bg_stars_by_color[s.color].push(s);
  }
  featured_stars  = star_data.filter(s => s.featured);
  named_stars     = star_data.filter(s => s.name && !s.featured);
  bg_bright_stars = star_data.filter(s => !s.featured && !s.name && s.size > 1.0);
  build_named_grad_cache();
}

// pre-build CanvasGradient objects for each named star × GRAD_BUCKETS twinkle levels.
// geometry (x, y, radius) is fixed after projection; only alpha varies with twinkle.
// quantising twinkle into GRAD_BUCKETS slots eliminates createRadialGradient() every frame.
// must be called again after reproject() since star positions change.
function build_named_grad_cache() {
  for (const s of named_stars) {
    const gr = Math.max(s.size * 3.4, 2.5);
    s._grads = Array.from({ length: GRAD_BUCKETS }, (_, b) => {
      const tw = 0.56 + (b / (GRAD_BUCKETS - 1)) * 0.44;
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
      grd.addColorStop(0,    `rgba(255,255,255,${(0.90 + 0.10 * tw).toFixed(2)})`);
      grd.addColorStop(0.12, hex_to_rgba(s.color, 0.70 + 0.30 * tw));
      grd.addColorStop(0.40, hex_to_rgba(s.color, 0.30 * tw));
      grd.addColorStop(1,    hex_to_rgba(s.color, 0));
      return grd;
    });
  }
}

// ---
// catalog entry format: [ra_deg, dec_deg, vmag, color_hex, name_or_null]
// single rng instance shared across named and bg phases so twinkle assignments
// are deterministic and match the previous single-fetch ordering.
let catalog_rng = null;

function _add_entries(entries) {
  for (const [ra_deg, dec_deg, vmag, color, name] of entries) {
    const pos  = project(ra_deg, dec_deg);
    const size = Math.max(0.4, (7.2 - vmag) * 0.38);
    const is_named = name !== null;
    const phase = catalog_rng() * Math.PI * 2;
    const freq  = 0.3 + catalog_rng() * 1.4;
    const bucket_f   = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * (TWINKLE_BUCKETS - 1);
    const freq_bucket = Math.min(TWINKLE_BUCKETS - 2, Math.floor(bucket_f));
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
}

function build_named(named) {
  // named is already sorted brightest-first by the split script
  _add_entries(named);
  rebuild_indexes();
  // static phase: new stars arrived — paint one frame
  if (!twinkle_active && hero_visible && !raf_id) raf_id = requestAnimationFrame(draw);
}

function build_bg(bg) {
  // bg is already sorted brightest-first by the split script
  _add_entries(bg);
  rebuild_indexes();
  pick_hint_target(); // revalidate now that full star field is present
  // static phase: full catalog now loaded — paint one frame
  if (!twinkle_active && hero_visible && !raf_id) raf_id = requestAnimationFrame(draw);
}

// Binary chunked loader for stars_bg.bin.
// Format:
//   [0-3]  magic 'STBG'
//   [4]    version u8
//   [5-8]  num_stars u32 LE
//   [9]    num_colors u8
//   [10..] color table: num_colors × 7 ASCII bytes (e.g. '#adc4ff')
//   then:  num_stars × 13 bytes — ra f32LE, dec f32LE, vmag f32LE, color_idx u8
//
// Stars arrive sorted brightest-first (same order as the old JSON).
// Each chunk of CHUNK_SIZE stars is added and painted immediately so the sky
// populates progressively rather than all-at-once after the full file arrives.
async function load_bg_binary(resp) {
  const RECORD_BYTES = 13; // 3×f32 + 1×u8
  const CHUNK_STARS  = 1500;
  const decoder      = new TextDecoder('ascii');

  // Accumulate raw bytes from the ReadableStream.
  const reader  = resp.body.getReader();
  let buf       = new Uint8Array(0);

  function append(chunk) {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf);
    next.set(chunk, buf.length);
    buf = next;
  }

  // Read at least `need` total bytes into buf.
  async function read_until(need) {
    while (buf.length < need) {
      const { value, done } = await reader.read();
      if (done) break;
      append(value);
    }
  }

  // ---
  const HEADER_FIXED = 10; // magic(4) + ver(1) + num_stars(4) + num_colors(1)
  await read_until(HEADER_FIXED);

  if (decoder.decode(buf.slice(0, 4)) !== 'STBG')
    throw new Error('stars_bg.bin: bad magic');

  const hdr_view  = new DataView(buf.buffer, buf.byteOffset);
  const num_stars  = hdr_view.getUint32(5, /*LE=*/true);
  const num_colors = buf[9];
  const palette_end = HEADER_FIXED + num_colors * 7;

  // ---
  await read_until(palette_end);
  const colors = [];
  for (let i = 0; i < num_colors; i++) {
    colors.push(decoder.decode(buf.slice(HEADER_FIXED + i * 7, HEADER_FIXED + (i + 1) * 7)));
  }

  // ---
  let offset = palette_end;
  let processed = 0;

  while (processed < num_stars) {
    const remaining   = num_stars - processed;
    const batch_count = Math.min(CHUNK_STARS, remaining);
    await read_until(offset + batch_count * RECORD_BYTES);

    // Build entries array from raw bytes, feeding into the same _add_entries pipeline.
    const view    = new DataView(buf.buffer, buf.byteOffset + offset);
    const entries = new Array(batch_count);
    for (let i = 0; i < batch_count; i++) {
      const b = i * RECORD_BYTES;
      entries[i] = [
        view.getFloat32(b,      true), // ra_deg
        view.getFloat32(b + 4,  true), // dec_deg
        view.getFloat32(b + 8,  true), // vmag
        colors[buf[offset + b + 12]],  // color hex
        null,                          // name (all null in bg catalog)
      ];
    }

    _add_entries(entries);
    rebuild_indexes();
    if (!twinkle_active && hero_visible && !raf_id) raf_id = requestAnimationFrame(draw);

    offset    += batch_count * RECORD_BYTES;
    processed += batch_count;

    // Yield to the browser between chunks so each batch paints before the next arrives.
    if (processed < num_stars) await new Promise(r => setTimeout(r, 0));
  }

  pick_hint_target(); // revalidate with full catalog
}

// ---
// Instead of Math.sin(time_s * freq + phase) per star (~9000 calls/frame),
// we quantize frequencies into TWINKLE_BUCKETS bins and use the angle-addition
// identity: sin(t*f + p) = sin(t*f)*cos(p) + cos(t*f)*sin(p).
// Per frame: compute sin/cos for each bucket (64 calls total).
// Per star: one lookup + 2 multiplies + 1 add. No per-star trig.
const TWINKLE_BUCKETS = 64;
const GRAD_BUCKETS = 8; // named-star gradient cache: quantise twinkle [0.56,1.0] into 8 slots
const FREQ_MIN = 0.3, FREQ_MAX = 1.7;
const twinkle_sin_lut = new Float32Array(TWINKLE_BUCKETS); // sin(time_s * bucket_freq)
const twinkle_cos_lut = new Float32Array(TWINKLE_BUCKETS); // cos(time_s * bucket_freq)

// opt 5: pre-computed per-bucket frequencies, eliminates 64 multiply-adds every frame
const twinkle_bucket_freqs = new Float32Array(TWINKLE_BUCKETS);
for (let i = 0; i < TWINKLE_BUCKETS; i++) {
  twinkle_bucket_freqs[i] = FREQ_MIN + (i / (TWINKLE_BUCKETS - 1)) * (FREQ_MAX - FREQ_MIN);
}

function update_twinkle_lut() {
  for (let i = 0; i < TWINKLE_BUCKETS; i++) {
    const a = time_s * twinkle_bucket_freqs[i]; // freq is pre-computed, no multiply-add
    twinkle_sin_lut[i] = Math.sin(a);
    twinkle_cos_lut[i] = Math.cos(a);
  }
}

// twinkle value for a star: lerps between adjacent LUT buckets using freq_lerp.
// each star gets a unique effective frequency within its bin, full variation, zero per-star trig. Cost: 2 LUT lookups + 1 lerp (3 multiplies, 2 adds).
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

// opt 1: alpha-bucket batching, star_twinkle() returns [0.56, 1.0], so alpha = 0.32 + 0.24 * t ∈ [BG_ALPHA_MIN, BG_ALPHA_MAX].
// quantising into BG_ALPHA_BUCKETS steps lets us batch all stars at the same (color, alpha) into one compound path, reducing fill() calls 9000 -> ~40.
const BG_ALPHA_BUCKETS = 8;
const BG_ALPHA_MIN   = 0.32 + 0.24 * 0.56; // ≈ 0.4544
const BG_ALPHA_MAX   = 0.32 + 0.24 * 1.00; // = 0.56
const BG_ALPHA_RANGE = BG_ALPHA_MAX - BG_ALPHA_MIN;
// pre-allocated bucket arrays, cleared each frame with .length = 0, no GC churn
const _bg_buckets = Array.from({ length: BG_ALPHA_BUCKETS }, () => []);

// batched background star drawing, uses pre-grouped color buckets built at catalog load.
// sets fillStyle once per color group instead of once per star (~9000 → handful of state changes).
function draw_background_stars_batched() {
  const TWO_PI = Math.PI * 2;
  for (const color in bg_stars_by_color) {
    // Distribute this color's stars into alpha buckets
    for (let b = 0; b < BG_ALPHA_BUCKETS; b++) _bg_buckets[b].length = 0;
    for (const s of bg_stars_by_color[color]) {
      const twinkle = star_twinkle(s);
      const alpha   = 0.32 + 0.24 * twinkle;
      const b = Math.min(BG_ALPHA_BUCKETS - 1,
                  Math.max(0, Math.floor((alpha - BG_ALPHA_MIN) / BG_ALPHA_RANGE * BG_ALPHA_BUCKETS)));
      _bg_buckets[b].push(s);
    }
    // one compound path + one fill() per non-empty (color, alpha-bucket) pair
    ctx.fillStyle = color;
    for (let b = 0; b < BG_ALPHA_BUCKETS; b++) {
      const group = _bg_buckets[b];
      if (!group.length) continue;
      ctx.globalAlpha = BG_ALPHA_MIN + (b + 0.5) / BG_ALPHA_BUCKETS * BG_ALPHA_RANGE;
      ctx.beginPath();
      for (const s of group) {
        ctx.moveTo(s.x + s.size, s.y); // moveTo avoids connecting lines between arcs
        ctx.arc(s.x, s.y, s.size, 0, TWO_PI);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // white hot core pass, one compound path + one fill for all qualifying bg stars.
  // size * 0.32 keeps the core sub-pixel on faint stars and a clean pinpoint on brighter ones.
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.62;
  ctx.beginPath();
  for (const s of bg_bright_stars) {
    const r = s.size * 0.32;
    ctx.moveTo(s.x + r, s.y);
    ctx.arc(s.x, s.y, r, 0, TWO_PI);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function draw_named_star(s) {
  const twinkle = star_twinkle(s);
  // look up pre-built gradient for this twinkle level — no allocation per frame
  const bucket = Math.min(GRAD_BUCKETS - 1, Math.floor((twinkle - 0.56) / 0.44 * GRAD_BUCKETS));
  const grd = s._grads ? s._grads[bucket] : (() => {
    // fallback: build inline if cache is missing (e.g. during resize race)
    const gr = Math.max(s.size * 3.4, 2.5);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
    g.addColorStop(0,    `rgba(255,255,255,${(0.90 + 0.10 * twinkle).toFixed(2)})`);
    g.addColorStop(0.12, hex_to_rgba(s.color, 0.70 + 0.30 * twinkle));
    g.addColorStop(0.40, hex_to_rgba(s.color, 0.30 * twinkle));
    g.addColorStop(1,    hex_to_rgba(s.color, 0));
    return g;
  })();
  const gr = Math.max(s.size * 3.4, 2.5);
  ctx.beginPath();
  ctx.arc(s.x, s.y, gr, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
}

function draw_featured_star(s) {
  const is_pipeline = s.obj_data && s.obj_data.pipeline;
  const pulse = Math.max(0, Math.min(1, (star_twinkle(s) - 0.56) / 0.44));
  const glow_r = 16 + pulse * 5;
  const c = s.color;
  const glow_alpha = is_pipeline ? 0.22 : 0.45;
  const ring_base  = is_pipeline ? 0.12 : 0.28;
  const ring_pulse = is_pipeline ? 0.22 : 0.45;

  // radial glow, use hex_to_rgba only for the variable alpha (pulse-dependent)
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

// pre-computed legend items, built once, not every frame
const legend_items = featured_objects.map((obj, i) => ({
  label: obj.name,
  color: FEATURED_COLORS[i] || FEATURED_COLORS[0]
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

  const total_legend_w = items.length * legend_col_w;
  const two_rows = legend_col_w > 0 && total_legend_w > canvas.width - pad_x * 2;
  const items_per_row = two_rows ? Math.ceil(items.length / 2) : items.length;
  let x = pad_x;
  const y_bottom = canvas.height - pad_y - row_h / 2;
  const y_top    = two_rows ? y_bottom - row_h - 4 : y_bottom;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (two_rows && i === items_per_row) x = pad_x;
    const row_y = (two_rows && i >= items_per_row) ? y_bottom : y_top;
    const cx = x + dot_r;

    // pulsing dot, use bucket 0..4 mapped across LUT for variety
    const lut_i = legend_items.length > 1 ? Math.round(i * (TWINKLE_BUCKETS - 1) / (legend_items.length - 1)) : 0;
    const pulse = 0.5 + 0.5 * twinkle_sin_lut[lut_i];
    const glow = ctx.createRadialGradient(cx, row_y, 0, cx, row_y, dot_r * 3);
    glow.addColorStop(0, hex_to_rgba(it.color, 0.35 * pulse));
    glow.addColorStop(1, hex_to_rgba(it.color, 0));
    ctx.beginPath();
    ctx.arc(cx, row_y, dot_r * 3, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, row_y, dot_r, 0, Math.PI * 2);
    ctx.fillStyle = it.color;
    ctx.globalAlpha = 0.8 + 0.2 * pulse;
    ctx.fill();
    ctx.globalAlpha = 1;

    // label
    ctx.fillStyle = 'rgba(200,215,245,0.52)';
    ctx.fillText(it.label, cx + dot_r + gap, row_y);

    x += legend_col_w;
  }

  // arrow hint pointing at a randomly chosen safe featured star
  if (hint_alpha > 0 && hint_target) {
    const s = hint_target;
    const sx = s.x, sy = s.y;
    const is_mobile = canvas.width <= 740;

    // scale everything for mobile vs desktop
    const font_name  = is_mobile ? '500 13px "JetBrains Mono", monospace' : '500 12px "JetBrains Mono", monospace';
    const font_sub   = is_mobile ? '400 12px "JetBrains Mono", monospace' : '400 11px "JetBrains Mono", monospace';
    const label_w    = is_mobile ? 138 : 124;
    const label_h    = is_mobile ? 40  : 36;
    const offset     = is_mobile ? 100 : 92;  // px from star center to label center
    const glow_gap   = is_mobile ? 26  : 24;  // tip clearance from star center
    const ah         = is_mobile ? 9   : 7;   // arrowhead size
    const shaft_w    = is_mobile ? 1.6 : 1.2;
    const head_w     = is_mobile ? 2.0 : 1.5;

    // place label left of star if on right half of canvas, otherwise right
    const label_left = sx > canvas.width * 0.55;
    const lx = label_left
      ? Math.max(label_w / 2 + 8, sx - offset)
      : Math.min(canvas.width - label_w / 2 - 8, sx + offset);
    const ly = sy - 42;
    const short_name = (s.obj_data.name || '').split(' | ')[0].trim();

    // tail starts from label bottom-center, tip stops outside glow ring
    const tail_x = lx, tail_y = ly + label_h / 2 + 4;
    const dx = sx - tail_x, dy = sy - tail_y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const tip_x = tail_x + dx * (1 - glow_gap / dist);
    const tip_y = tail_y + dy * (1 - glow_gap / dist);
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.globalAlpha = hint_alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // backdrop pill, slightly more opaque for visibility
    ctx.fillStyle = 'rgba(7,9,26,0.72)';
    ctx.beginPath();
    ctx.roundRect(lx - label_w / 2, ly - label_h / 2, label_w, label_h, 5);
    ctx.fill();

    // thin border on pill for extra definition
    ctx.strokeStyle = 'rgba(196,162,88,0.22)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // star name in its legend color
    ctx.font = font_name;
    ctx.fillStyle = s.color;
    ctx.fillText(short_name, lx, ly - 9);

    // subtitle
    ctx.font = font_sub;
    ctx.fillStyle = 'rgba(226,221,212,0.92)';
    ctx.fillText(is_mobile ? 'tap to explore' : 'click to explore', lx, ly + 9);

    // arrow shaft
    ctx.beginPath();
    ctx.moveTo(tail_x, tail_y);
    ctx.lineTo(tip_x, tip_y);
    ctx.strokeStyle = 'rgba(196,162,88,0.88)';
    ctx.lineWidth = shaft_w;
    ctx.stroke();

    // arrowhead
    ctx.beginPath();
    ctx.moveTo(tip_x, tip_y);
    ctx.lineTo(tip_x - ah * Math.cos(angle - 0.42), tip_y - ah * Math.sin(angle - 0.42));
    ctx.moveTo(tip_x, tip_y);
    ctx.lineTo(tip_x - ah * Math.cos(angle + 0.42), tip_y - ah * Math.sin(angle + 0.42));
    ctx.strokeStyle = 'rgba(196,162,88,1.0)';
    ctx.lineWidth = head_w;
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore(); // matches ctx.save() at top of draw_canvas_legend
}

// ---

// Shared render pass used by both the static phase and the animated loop.
// Clears canvas, draws stars + hover ring + legend, updates hover_star.
// Twinkle LUT should be updated before calling this in animated mode;
// in static mode the LUT stays at zero → stars render at fixed brightness (0.78).
function draw_frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!catalog_loaded) return;

  hover_star = null;
  let min_d = 14;

  draw_background_stars_batched();

  for (const s of star_data) {
    if (s.featured) {
      draw_featured_star(s);
    } else if (s.name) {
      draw_named_star(s);
      const dx = mouse.x - s.x, dy = mouse.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < min_d) { min_d = d; hover_star = s; }
    }
  }

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
}

function draw(ts) {
  // Static phase: twinkle loop deferred until profile image fully loads.
  // Each trigger (catalog build, resize, mousemove) fires exactly one frame —
  // no rescheduling. Keeps every frame well under the 50ms long-task threshold
  // during FCP→TTI, eliminating TBT accumulation.
  if (!twinkle_active) {
    draw_frame();
    raf_id = null;
    return;
  }

  // Animated phase: throttle to ~30fps, star field doesn't benefit from 60fps
  if (ts - last_frame_ts < FRAME_INTERVAL) {
    if (hero_visible) raf_id = requestAnimationFrame(draw);
    else raf_id = null;
    return;
  }
  last_frame_ts = ts;

  time_s = ts * 0.001;

  if (!catalog_loaded) {
    if (hero_visible) raf_id = requestAnimationFrame(draw);
    else raf_id = null;
    return;
  }

  update_twinkle_lut(); // 64 sin/cos calls instead of ~9000
  draw_frame();
  if (hero_visible) {
    raf_id = requestAnimationFrame(draw);
  } else {
    raf_id = null;
  }
}

// ---

// cache hero element + derived measurements so neither
// getElementById nor getBoundingClientRect runs on every mousemove or scroll.
// hero_rect_cache is refreshed on scroll (layout already dirty) and resize.
// hero_scroll_bottom is stable between resizes, uses offsetTop + offsetHeight.
let hero_el         = null;
let hero_rect_cache = null;  // viewport-relative rect for canvas_exposed_at
let hero_scroll_bottom  = 0;  // doc-absolute bottom edge for scroll spy
let research_scroll_top = 0;  // doc-absolute top of #research for back-to-top visibility
const nav_el = document.querySelector('nav');

function refresh_hero_cache() {
  if (!hero_el) hero_el = document.getElementById('hero');
  hero_rect_cache    = hero_el.getBoundingClientRect();
  hero_scroll_bottom = hero_el.offsetTop + hero_el.offsetHeight; // stable until resize
  const research_el  = document.getElementById('research');
  if (research_el) research_scroll_top = research_el.offsetTop;
}

function canvas_exposed_at(x, y) {
  // use cached rect, no forced reflow on every mousemove
  const r = hero_rect_cache;
  return r !== null && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function on_mouse_move(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;

  // In the static phase the loop isn't running; schedule one frame so hover
  // rings repaint as the cursor moves across the star field.
  if (!twinkle_active && hero_visible && !raf_id && catalog_loaded) {
    raf_id = requestAnimationFrame(draw);
  }

  if (hover_star && canvas_exposed_at(e.clientX, e.clientY)) {
    const mag_str = hover_star.featured
      ? ''
      : `  | v = ${hover_star.mag.toFixed(2)}`;
    const content = `${hover_star.name}${mag_str}`;
    tooltip.textContent = content;
    tooltip.classList.add('visible');
    // Use cached dims to avoid forced reflow after DOM writes
    const tw = tooltip_tw;
    const th = tooltip_th;
    tooltip.style.left = Math.max(8, Math.min(e.clientX + 16, window.innerWidth  - tw - 8)) + 'px';
    tooltip.style.top  = Math.max(8, Math.min(e.clientY - 28, window.innerHeight - th - 8)) + 'px';
    // Refresh cache on content change (deferred to next frame to avoid reflow)
    if (content !== tooltip_last_content) {
      tooltip_last_content = content;
      requestAnimationFrame(() => {
        if (tooltip.classList.contains('visible')) {
          tooltip_tw = tooltip.offsetWidth || 160;
          tooltip_th = tooltip.offsetHeight || 28;
        }
      });
    }
  } else {
    tooltip.classList.remove('visible');
    // dismiss stale popover once cursor leaves all named stars
    if (!hover_star) close_popover();
  }
}

function on_click(e) {
  // suppress the synthetic click the browser fires ~300ms after touchend
  if (performance.now() - last_touch_action_ts < 600) return;
  // ignore clicks that originated on UI elements layered above the canvas
  if (e.target.closest('.book-spine') || e.target.closest('#star-popover') || e.target.closest('.project-card')) return;
  if (!canvas_exposed_at(e.clientX, e.clientY)) return;

  // fresh inline scan for featured stars, hover_star may be stale from previous
  // render frame (draw() runs at 30fps; a fast click can arrive between frames)
  const cx = e.clientX, cy = e.clientY;
  let best_f = null, best_fd = 20;
  for (const s of featured_stars) {
    const dx = cx - s.x, dy = cy - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best_fd) { best_fd = d; best_f = s; }
  }
  if (best_f) {
    close_popover();
    dismiss_hint();
    open_modal(best_f.obj_data);
    return;
  }

  // named catalog stars, hover_star is fine here (popover is less time-sensitive)
  if (!hover_star) { close_popover(); return; }
  const simbad_url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(hover_star.simbad_id)}`;
  // ctrl/cmd+click: bypass confirmation and open directly
  if (e.ctrlKey || e.metaKey) {
    window.open(simbad_url, '_blank', 'noopener');
    return;
  }
  open_popover(hover_star.name, simbad_url, cx, cy);
}

// ---
// touchstart only records position, no action taken yet.
// touchmove flags the gesture as a scroll if movement exceeds TOUCH_SLOP.
// touchend acts only if the gesture was not a scroll.
// This ensures page scrolling is never intercepted.

function on_touch_start(e) {
  const touch = e.changedTouches[0];
  touch_start_x = touch.clientX;
  touch_start_y = touch.clientY;
  touch_is_scroll = false;
}

function on_touch_move(e) {
  if (touch_is_scroll) return; // already decided
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touch_start_x;
  const dy = touch.clientY - touch_start_y;
  if (Math.sqrt(dx * dx + dy * dy) > TOUCH_SLOP) touch_is_scroll = true;
}

function on_touch_end(e) {
  if (touch_is_scroll) return;
  if (modal.classList.contains('visible')) return;
  if (mobile_nav.classList.contains('open')) return;

  const touch = e.changedTouches[0];
  const tx = touch.clientX;
  const ty = touch.clientY;

  // don't intercept taps on UI elements layered above the canvas, popover is fixed-position over the hero and would otherwise trigger star detection
  const el = document.elementFromPoint(tx, ty);
  if (el && (el.closest('#star-popover') || el.closest('.book-spine') || el.closest('.project-card'))) return;

  if (!canvas_exposed_at(tx, ty)) return;

  // update mouse position so render loop reflects touch
  mouse.x = tx;
  mouse.y = ty;

  // check featured stars first (larger tap target), opt 4: use pre-built array
  let best = null;
  let best_d = 38;
  for (const s of featured_stars) {
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best_d) { best_d = d; best = s; }
  }

  if (best) {
    e.preventDefault(); // suppress synthetic click, more reliable than a time-based guard
    last_touch_action_ts = performance.now();
    dismiss_hint();
    open_modal(best.obj_data);
    return;
  }

  // fallback: named catalog stars with slightly wider radius than mouse, opt 4: pre-built array again
  let best_named = null;
  let best_nd = 22;
  for (const s of named_stars) {
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best_nd) { best_nd = d; best_named = s; }
  }

  if (best_named) {
    e.preventDefault(); // suppress synthetic click
    last_touch_action_ts = performance.now();
    dismiss_hint();
    const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(best_named.simbad_id)}`;
    open_popover(best_named.name, url, best_named.x, best_named.y);
  }
}

function open_popover(name, url, cx, cy) {
  popover_name.textContent = name;
  popover_btn.href = url;

  // position near tap/click, clamped to visible viewport
  popover.style.left = '0px';
  popover.style.top  = '0px';
  popover.classList.add('visible');
  // Cache after first measure; popover CSS is fixed-size so cache stays valid
  const pw = popover_pw || (popover_pw = popover.offsetWidth);
  const ph = popover_ph || (popover_ph = popover.offsetHeight);
  // visualViewport accounts for mobile browser chrome (address bar, home indicator)
  const vw = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const left = Math.max(8, Math.min(cx + 14, vw - pw - 8));
  const top  = Math.max(8, Math.min(cy -  8, vh - ph - 8));
  popover.style.left = left + 'px';
  popover.style.top  = top  + 'px';
}

function close_popover() {
  popover.classList.remove('visible');
}

// returns the canonical external URL for a featured object, JPL for solar system bodies, & SIMBAD for everything else.
function get_external_url(obj) {
  return obj.catalog_url
    || `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(obj.simbad_id || '')}`;
}

// cached at init, avoids getElementById + conditional insertBefore on every open_modal call
let modal_img_wrap = null;

function open_modal(obj) {
  document.getElementById('modal-type').textContent = obj.type;
  document.getElementById('modal-name').textContent = obj.name;
  document.getElementById('modal-body').innerHTML = obj.writeup;

  // ---
  // provided image (asteroids) or DSS2 sky cutout (stellar objects with real coords)
  const fov = obj.fov_deg || 0.8; // per-object field of view; 0.8° default for point sources
  const img_src = obj.image_url || (
    obj.ra_deg != null && obj.dec_deg != null
      ? `https://alasky.u-strasbg.fr/hips-image-services/hips2fits`
        + `?hips=CDS%2FP%2FDSS2%2Fcolor&width=480&height=280`
        + `&fov=${fov}&projection=TAN&coordsys=icrs`
        + `&ra=${obj.ra_deg}&dec=${obj.dec_deg}&format=jpg`
      : null
  );

  if (img_src) {
    modal_img_wrap.innerHTML = '<div id="modal-img-loading">loading image\u2026</div>';
    modal_img_wrap.style.display = '';
    const img = new Image();
    img.onload = () => {
      modal_img_wrap.innerHTML = '';
      img.alt = obj.name;
      img.id = 'modal-img';
      modal_img_wrap.appendChild(img);
      requestAnimationFrame(() => requestAnimationFrame(() => { img.style.opacity = '1'; }));
    };
    img.onerror = () => { modal_img_wrap.style.display = 'none'; };
    img.src = img_src;
  } else {
    modal_img_wrap.style.display = 'none';
  }

  const link = document.getElementById('modal-simbad');
  link.href = get_external_url(obj);
  link.textContent = obj.catalog_url ? 'View on JPL Small-Body Database' : 'View on SIMBAD';

  // show "View Research Card" link if this object maps to a card
  const card_link = document.getElementById('modal-card-link');
  if (obj.card_url) {
    card_link.href = obj.card_url;
    card_link.style.display = '';
    card_link.onclick = (e) => {
      e.preventDefault();
      close_modal();
      const card_el = document.querySelector(obj.card_url);
      if (card_el) {
        card_el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // expand the card if not already open
        if (!card_el.classList.contains('card-open')) {
          const toggle = card_el.querySelector('.card-toggle');
          if (toggle) toggle.click();
        }
      }
    };
  } else {
    card_link.style.display = 'none';
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

// ---

function on_resize() {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  canvas.width  = iw;
  canvas.height = ih;
  legend_col_w = 0; // remeasure legend on next draw
  reproject();
  build_named_grad_cache(); // star positions changed — rebuild gradient cache
  refresh_hero_cache(); // re-measure after layout change
  if (catalog_loaded) pick_hint_target(); // revalidate hint target after viewport change
  // In static phase the loop isn't running; trigger one repaint after resize
  if (!twinkle_active && hero_visible && !raf_id) raf_id = requestAnimationFrame(draw);
}

// ---
function init() {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  canvas.width  = iw;
  canvas.height = ih;

  refresh_hero_cache(); // seed cache before first mousemove or scroll

  // cache modal_img_wrap once, open_modal reuses it on every click
  modal_img_wrap = document.getElementById('modal-img-wrap');
  if (!modal_img_wrap) {
    modal_img_wrap = document.createElement('div');
    modal_img_wrap.id = 'modal-img-wrap';
    const modal_body = document.getElementById('modal-body');
    modal_body.parentNode.insertBefore(modal_img_wrap, modal_body);
  }

  // pause render loop when hero is off-screen, resume when it returns
  const hero_observer = new IntersectionObserver((entries) => {
    hero_visible = entries[0].isIntersecting;
    if (hero_visible && !raf_id) {
      raf_id = requestAnimationFrame(draw);
    }
  }, { threshold: 0 });
  hero_observer.observe(document.getElementById('hero'));

  // phase 0: featured objects are hardcoded in JS — render them immediately,
  // no network dependency. sets catalog_loaded = true so draw() starts painting.
  build_featured_only();
  catalog_loaded = true;
  pick_hint_target();
  raf_id = requestAnimationFrame(draw);

  // seed shared RNG once here so named and bg phases draw from the same sequence
  catalog_rng = make_rng(31415);

  // fetch named and bg in parallel; process named first (RNG order), then bg.
  // stars_named.json is preloaded — arrives near-instantly.
  // stars_bg.bin is binary (66% smaller than JSON) and streams in chunked.
  const named_p = fetch('/data/stars_named.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

  // Kick off binary fetch immediately so it's in flight while named processes.
  const bg_resp_p = fetch('/data/stars_bg.bin')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; });

  named_p
    .then(named => {
      build_named(named);
      // yield to let the browser paint named stars, then stream bg binary
      setTimeout(() => {
        bg_resp_p
          .then(resp => load_bg_binary(resp))
          .catch(err => console.error('Star catalog (bg) load error:', err));
      }, 0);
    })
    .catch(err => console.error('Star catalog (named) load error:', err));
}

window.addEventListener('mousemove', on_mouse_move);
window.addEventListener('click', on_click);
window.addEventListener('resize', on_resize);
window.addEventListener('touchstart', on_touch_start, { passive: true });
window.addEventListener('touchmove',  on_touch_move,  { passive: true });
window.addEventListener('touchend',   on_touch_end);

// -- tab visibility: restart rAF loop and refresh caches on tab return --
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // viewport rect may be stale after tab switch
  refresh_hero_cache();
  // IntersectionObserver can fire isIntersecting:false while tab is
  // hidden, killing the rAF loop. Re-derive hero_visible from actual geometry
  // and restart the loop if it died.
  if (hero_el) {
    const r = hero_el.getBoundingClientRect();
    const in_view = r.bottom > 0 && r.top < window.innerHeight;
    hero_visible = in_view;
    if (hero_visible && !raf_id) {
      raf_id = requestAnimationFrame(draw);
    }
  }
});

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

  // helper: batch-read container inner width (no pending writes when called)
  function get_container_inner_w() {
    const rect = rows_el.parentElement.getBoundingClientRect();
    const cs = window.getComputedStyle(rows_el.parentElement);
    return rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  // hoist: read container dims BEFORE spine height writes to avoid forced reflow
  const initial_container_inner_w = get_container_inner_w();

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

  function layout_shelves(cached_inner_w) {
    const is_mobile = window.innerWidth <= 740;
    const w_col = is_mobile ? 40 : 46;
    const w_exp = is_mobile ? 150 : 172;
    const gap = 5;

    // Use cached dims on first call (after spine writes) to skip forced reflow;
    // re-read on subsequent calls (resize / fonts.ready) where no spine writes are pending.
    const container_inner_w = cached_inner_w != null
      ? cached_inner_w
      : get_container_inner_w();

    // n_per_row: fit 1 expanded + (n-1) collapsed + (n-1) gaps within the container.
    // on mobile subtract a small extra margin so books aren't flush to the edge.
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

  layout_shelves(initial_container_inner_w);
  // re-run after first paint, container may have width 0 at parse time;
  // read width here (before callback) so no getBoundingClientRect fires
  // after the pending spine.style.height writes → avoids 79ms forced reflow.
  requestAnimationFrame(() => {
    const w = get_container_inner_w();
    layout_shelves(w);
  });
  // re-run after async fonts settle, eb garamond load shifts container dimensions
  document.fonts.ready.then(() => {
    const w = get_container_inner_w();
    layout_shelves(w);
  });

  let resize_timer;
  window.addEventListener('resize', () => {
    clearTimeout(resize_timer);
    resize_timer = setTimeout(layout_shelves, 120);
  });
})();

// -- scroll-spy & url updater --
const nav_sections = ['hero','about', 'research', 'cepheid-sim', 'writing', 'highlights', 'bookshelf'];
const nav_links_array = Array.from(document.querySelectorAll('.nav-links a'));

const observer_options = {
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
      history.replaceState(null, null, id === 'hero' ? '/' : '#' + id);
    }
  });
}, observer_options);

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
  hamburger_btn.setAttribute('aria-expanded', open ? 'true' : 'false');
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
  back_to_top_btn.classList.toggle('visible', window.scrollY >= research_scroll_top);

  // compare scrollY against cached doc-absolute bottom, no getElementById or getBoundingClientRect
  nav_el.classList.toggle('nav--scrolled', window.scrollY >= hero_scroll_bottom);

  // refresh viewport rect on scroll (layout is already dirty here) so
  // canvas_exposed_at never calls getBoundingClientRect on mousemove
  if (hero_el) hero_rect_cache = hero_el.getBoundingClientRect();
}, { passive: true });
back_to_top_btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// -- canvas hint: arrow pointing at a randomly chosen safe featured star --
let hint_alpha = 0;
let hint_dismissed = false;
let hint_target = null; // set once in pick_hint_target after catalog loads

// pick a random featured star whose label zone won't overlap nav, hero text, or legend.
// safe zone: y between 90 and canvas.height-90, label box clears hero text column
// (left ~42% of canvas, bottom 55% of height).
function pick_hint_target() {
  if (!featured_stars.length) { hint_target = null; return; }
  const is_mobile = canvas.width <= 740;
  const label_w = is_mobile ? 138 : 124;
  const label_h = is_mobile ? 40  : 36;
  const offset  = is_mobile ? 100 : 92;
  const safe = featured_stars.filter(s => {
    // exclude HD 344787 from hint callout
    if (s.name && s.name.startsWith('HD 344787')) return false;
    // vertical: clear nav (90px) and legend (90px from bottom)
    if (s.y < 90 || s.y > canvas.height - 90) return false;
    // compute label x based on which side has room
    const label_left = s.x > canvas.width * 0.55;
    const lx = label_left
      ? Math.max(label_w / 2 + 8, s.x - offset)
      : Math.min(canvas.width - label_w / 2 - 8, s.x + offset);
    const label_bot      = s.y - 42 + label_h / 2;
    const label_left_edge = lx - label_w / 2;
    // hero text occupies roughly left 42% of canvas, below 45% of height
    const in_hero_col  = label_left_edge < canvas.width * 0.42;
    const in_hero_vert = label_bot > canvas.height * 0.45;
    if (in_hero_col && in_hero_vert) return false;
    return true;
  });
  const eligible = featured_stars.filter(s => !(s.name && s.name.startsWith('HD 344787')));
  const pool = safe.length ? safe : (eligible.length ? eligible : featured_stars);
  hint_target = pool[Math.floor(Math.random() * pool.length)];
}

function dismiss_hint() {
  if (hint_dismissed) return;
  hint_dismissed = true;
  const t1 = performance.now();
  (function fade_out(t) {
    hint_alpha = Math.max(0, 1 - (t - t1) / 500);
    if (hint_alpha > 0) requestAnimationFrame(fade_out);
  })(t1);
}

setTimeout(() => {
  const t0 = performance.now();
  (function fade_in(t) {
    if (hint_dismissed) return;
    hint_alpha = Math.min(1, (t - t0) / 700);
    if (hint_alpha < 1) requestAnimationFrame(fade_in);
  })(t0);
  setTimeout(() => {
    dismiss_hint();
  }, 2500);
}, 1200);

(function() {
  const u = ['henry.s.zimmer', 'man', '@gmail.com'].join(''); // 3mAiI 0bfusciati0n
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

// research card expand/collapse
document.querySelectorAll('.card-toggle').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const card = btn.closest('.research-card');
    const expand = card.querySelector('.card-expand');
    const open = card.classList.toggle('card-open');
    expand.style.maxHeight = open ? expand.scrollHeight + 'px' : '0';
    btn.textContent = open ? 'Read less \u2191' : 'Read more \u2193';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});

// on-load hash routing for direct research card links (e.g. henryzimmerman.net/#card-cep1347)
const card_ids = ['card-cep1347', 'card-cindygraber', 'card-usgr'];
const hash_target = window.location.hash.slice(1); // strip leading #
if (card_ids.includes(hash_target)) {
  const card_el = document.getElementById(hash_target);
  if (card_el) {
    // slight delay so page layout is stable before scrolling
    setTimeout(() => {
      card_el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!card_el.classList.contains('card-open')) {
        const toggle = card_el.querySelector('.card-toggle');
        if (toggle) toggle.click();
      }
    }, 300);
  }
}

// -- epilepsy modal --
const epilepsy_modal = document.getElementById('epilepsy-modal');
document.getElementById('btn-realtime').addEventListener('click', () => {
  epilepsy_modal.classList.add('visible');
});
document.getElementById('epilepsy-cancel').addEventListener('click', () => {
  epilepsy_modal.classList.remove('visible');
});
document.getElementById('epilepsy-confirm').addEventListener('click', () => {
  epilepsy_modal.classList.remove('visible');
  window.setMode('realtime');
});

// ---
// Load HSZ_Headshot_BW_small.webp immediately (set in HTML src).
// When the about section nears the viewport, preload the full-res version in
// the background and swap it in once cached — no layout shift, no flash.
(function() {
  const img = document.getElementById('profile-img');
  if (!img || !img.dataset.fullWebp) return;

  let fullLoaded = false;

  function swapToFull() {
    if (fullLoaded) return;
    fullLoaded = true;
    // Prefer WebP; fall back to JPEG if the data attr is missing
    img.src = img.dataset.fullWebp || img.dataset.fullJpeg || img.src;
    img.classList.remove('profile-img-lqip');
    // Profile image is loaded — start the animated star loop now.
    // Until this point stars were drawn statically to keep TBT near zero.
    twinkle_active = true;
    if (hero_visible && !raf_id) raf_id = requestAnimationFrame(draw);
  }

  // Start preloading full-res as soon as the about section approaches the viewport
  const aboutSection = document.getElementById('about');
  if (aboutSection && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        // If LQIP already visible, preload full-res then swap
        const fullSrc = img.dataset.fullWebp || img.dataset.fullJpeg;
        if (fullSrc) {
          const preloader = new Image();
          preloader.onload = swapToFull;
          preloader.onerror = swapToFull; // swap anyway — LQIP is better than broken
          preloader.src = fullSrc;
        }
        break;
      }
    }, { rootMargin: '0px' }); // start loading when section enters the viewport
    io.observe(aboutSection);
  } else {
    // IntersectionObserver not available — swap immediately
    swapToFull();
  }
})();

// ---
(function () {
  const LS_FOUND = 'trailFound';

  // derive word list from DOM — single source of truth
  const WORDS = Array.from(document.querySelectorAll('.trail-word'))
    .map(function (s) { return s.dataset.word; })
    .filter(function (w, i, a) { return a.indexOf(w) === i; });
  const TOTAL = WORDS.length;

  // found stored in discovery order
  let found     = JSON.parse(sessionStorage.getItem(LS_FOUND) || '[]');
  let active    = false;
  let dismissed = false;
  let observer  = null;

  const toggle     = document.getElementById('trail-toggle');
  const card       = document.getElementById('trail-card');
  const dismiss    = document.getElementById('trail-dismiss');
  const hintText   = document.getElementById('trail-hint-text');
  const nEl        = document.getElementById('trail-n');
  const totalEl    = document.getElementById('trail-total');
  const dotsEl     = document.getElementById('trail-dots');
  const listEl     = document.getElementById('trail-words-list');
  const completeEl = document.getElementById('trail-complete');

  if (!toggle || !card) return;

  // set total count from DOM
  if (totalEl) totalEl.textContent = TOTAL;

  // build dots — one per word, progress indicator only
  WORDS.forEach(function () {
    const dot = document.createElement('div');
    dot.className = 'trail-dot';
    dotsEl.appendChild(dot);
  });

  function save() {
    sessionStorage.setItem(LS_FOUND, JSON.stringify(found));
  }

  function render() {
    nEl.textContent = found.length;

    // dots: fill left-to-right by count
    Array.from(dotsEl.children).forEach(function (dot, i) {
      dot.classList.toggle('trail-dot-lit', i < found.length);
    });

    // word list: discovery order — rebuild from found[]
    listEl.innerHTML = '';
    found.forEach(function (w) {
      const el = document.createElement('div');
      el.className = 'trail-found-word';
      el.textContent = w;
      el.title = 'Jump to this passage';
      el.addEventListener('click', function () {
        const target = document.querySelector('.trail-word[data-word="' + w + '"]');
        if (!target) return;
        hideCard();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('trail-scroll-highlight');
        setTimeout(function () { target.classList.remove('trail-scroll-highlight'); }, 1600);
      });
      listEl.appendChild(el);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add('trail-word-show'); });
      });
    });

    if (found.length === TOTAL) {
      completeEl.classList.add('trail-complete-show');
      card.classList.add('trail-flash');
      const msgEl = document.getElementById('trail-connect-msg');
      const emailEl = document.getElementById('trail-connect-email');
      if (msgEl && !msgEl.textContent) {
        msgEl.textContent = "You made it this far, so I'd love to know what you thought.";
        const u = ['henry.s.zimmer', 'man', '@gmail.com'].join('');
        const a = document.createElement('a');
        a.href = 'mailto:' + u;
        a.textContent = u;
        a.className = 'trail-connect-link';
        emailEl.appendChild(a);
        document.getElementById('trail-connect').classList.add('trail-connect-show');
      }
    }
  }

  function markSpans() {
    document.querySelectorAll('.trail-word').forEach(function (span) {
      span.classList.toggle('found', found.indexOf(span.dataset.word) !== -1);
    });
  }

  function onWordClick(e) {
    if (!active) showCard();
    const word = e.currentTarget.dataset.word;
    if (found.indexOf(word) !== -1) return;
    // remove first-word hint from clicked element
    e.currentTarget.classList.remove('trail-first');
    dismissHint();
    found.push(word);
    save();
    document.querySelectorAll('.trail-word[data-word="' + word + '"]').forEach(function (s) {
      s.classList.add('found');
    });
    render();
  }

  function activateListeners() {
    document.querySelectorAll('.trail-word').forEach(function (span) {
      span.addEventListener('click', onWordClick);
    });
  }


  function dismissHint() {
    if (hintText) hintText.classList.add('trail-hint-gone');
    if (observer) { observer.disconnect(); observer = null; }
  }

  function showCard() {
    active = true;
    document.body.classList.add('trail-active');
    toggle.classList.add('trail-on');
    card.classList.add('trail-card-visible');
    markSpans();
    // pulse the first unclicked word as a hint
    var firstUnfound = document.querySelector('.trail-word:not(.found)');
    if (firstUnfound) {
      firstUnfound.classList.remove('trail-first');
      // force reflow so re-opening re-triggers the animation
      void firstUnfound.offsetWidth;
      firstUnfound.classList.add('trail-first');
    }
    render();
  }

  function hideCard() {
    active = false;
    document.body.classList.remove('trail-active');
    toggle.classList.remove('trail-on');
    card.classList.remove('trail-card-visible');
    if (observer) { observer.disconnect(); observer = null; }
  }

  toggle.addEventListener('click', function () {
    if (active) hideCard(); else showCard();
  });

  dismiss.addEventListener('click', function () {
    dismissed = true;
    hideCard();
    toggle.classList.remove('trail-ready');
    toggle.style.opacity = '0';
    toggle.style.pointerEvents = 'none';
  });

  activateListeners();

  function activateToggle() {
    toggle.classList.add('trail-ready');
  }

  var aboutEl = document.getElementById('about');
  if (aboutEl && 'IntersectionObserver' in window) {
    var aboutIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          aboutIO.disconnect();
          setTimeout(activateToggle, 1800);
          break;
        }
      }
    }, { rootMargin: '0px 0px -72px 0px', threshold: 0 });
    aboutIO.observe(aboutEl);
  } else {
    setTimeout(activateToggle, 1800);
  }

  if (found.length > 0) markSpans();

})();

init();
