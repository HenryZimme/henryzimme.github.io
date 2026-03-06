(function() {
  // --- Configuration ---
  const MODES = new Set(['orbital', 'composite', 'pulsation']);
  const COMPANION_RAD = 12.51;
  const CEPHEID_FALLBACK_COLOR = '#ffe066';

  let data    = null;
  let currentMode = 'orbital';
  let frameIdx    = 0;
  let maxR1       = 1;

  // --- DOM Elements ---
  const simCanvas = document.getElementById('simCanvas');
  const ctx       = simCanvas ? simCanvas.getContext('2d') : null;
  const preview   = document.getElementById('sim-preview');
  const plotUI    = document.getElementById('hud-plot-container');

  const hud = {
    mag:   document.getElementById('hud-mag'),
    teff:  document.getElementById('hud-teff'),
    rad:   document.getElementById('hud-rad'),
    phase: document.getElementById('hud-phase')
  };

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  function safeGet(arr, idx, fallback) {
    return (arr && arr[idx] !== undefined) ? arr[idx] : fallback;
  }

  // ── init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      data = await response.json();

      const p = data.physics_frames;
      const required = ['v_mag', 'x1', 'y1', 'z1', 'x2', 'y2', 'z2', 'r1'];
      for (const key of required) {
        if (!p || !Array.isArray(p[key]))
          throw new Error(`Invalid Data Structure: physics_frames.${key} missing`);
      }

      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));
      maxR1     = Math.max(...p.r1);

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';

      setMode('orbital');
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error('Initialization Error:', e);
    }
  }

  // ── mode switching ────────────────────────────────────────────────────────
  window.setMode = function(mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;

    if (plotUI) {
      plotUI.style.opacity = (mode === 'pulsation') ? '1' : '0';
    }

    document.querySelectorAll('.btn-mode').forEach(b => {
      b.style.background = 'transparent';
      b.style.color      = 'rgba(255,255,255,0.4)';
      b.style.boxShadow  = 'none';
    });
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) {
      btn.style.background = 'rgba(255,255,255,0.18)';
      btn.style.color      = '#ffffff';
      btn.style.boxShadow  = 'inset 0 0 0 1px rgba(255,255,255,0.3)';
    }
  };

  // ── resize ────────────────────────────────────────────────────────────────
  function resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width  = rect.width  * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── light curve (drawn on canvas at the div's screen position) ────────────
  function drawCenteredPlot(pData, currentIdx) {
    if (!plotUI || !pData) return;
    const rect  = plotUI.getBoundingClientRect();
    const sRect = simCanvas.getBoundingClientRect();

    const px = rect.left - sRect.left;
    const py = rect.top  - sRect.top;
    const pw = rect.width;
    const ph = rect.height;
    const inset = 16;

    ctx.save();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.beginPath();

    const points   = 120;
    const step     = (pw - inset * 2) / points;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    const midMag   = (bounds.minV + bounds.maxV) / 2;

    for (let k = -points / 2; k <= points / 2; k++) {
      const idx = (currentIdx + k + pData.length) % pData.length;
      const val = pData[idx];
      const x   = px + pw / 2 + k * step;
      // Inverted y: lower mag = brighter = higher on screen
      const y   = py + ph / 2 - ((val - midMag) * (ph / magRange) * 0.72);
      if (k === -points / 2) ctx.moveTo(x, y);
      else                   ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── main animation loop ───────────────────────────────────────────────────
  function animate() {
    if (!data || !data.physics_frames) return;

    const p   = data.physics_frames;
    const c   = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const w   = simCanvas.width  / dpr;
    const h   = simCanvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const i = Math.floor(frameIdx) % p.x1.length;
    frameIdx += (currentMode === 'pulsation' ? 0.4 : 0.8);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      x1 = 0; y1 = 0; z1 = 0; x2 = 99999; y2 = 0; z2 = -1;
      r1   = p.r1[i];
      mag  = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(p.color1, i, CEPHEID_FALLBACK_COLOR);
      drawCenteredPlot(p.v_mag, i);
    } else {
      const isComp = (currentMode === 'composite' && c && c.r1);
      const src    = isComp ? c : p;
      const sIdx   = i % src.r1.length;
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1   = src.r1[sIdx];
      mag  = src.v_mag[sIdx];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(src.color1, sIdx, CEPHEID_FALLBACK_COLOR);
    }

    // ── zoom & star center position ──────────────────────────────────────────
    // Pulsation: cap star diameter to 28% of the shorter dimension so it fits
    // cleanly in the upper portion of the canvas. The plot div lives ~60-85%
    // down the page, so cy = h*0.28 gives a clear vertical gap.
    // Orbital: scale so the full companion orbit fits with padding.
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      const shortSide = Math.min(w, h);
      const maxPxR    = shortSide * 0.14;  // radius cap: 14% of shorter dimension
      zoom = maxPxR / maxR1;
      cx   = w / 2;
      cy   = h * 0.28;
    } else {
      zoom = (Math.min(w, h) * 0.32) / bounds.a2;
      cx   = w / 2;
      cy   = h / 2;
    }

    // ── orbital tracks (drawn first — behind stars) ──────────────────────────
    if (currentMode !== 'pulsation') {
      const incFactor = 0.545; // cos(57°) — matches notebook inclination

      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);

      // Companion orbit — salmon/red, larger ellipse
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2 * zoom, bounds.a2 * zoom * incFactor, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cepheid orbit — gold, smaller ellipse
      ctx.strokeStyle = 'rgba(196, 162, 88, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1 * zoom, bounds.a1 * zoom * incFactor, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.restore();

      // Barycenter crosshair
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      const b = 5;
      ctx.beginPath();
      ctx.moveTo(cx - b, cy); ctx.lineTo(cx + b, cy);
      ctx.moveTo(cx, cy - b); ctx.lineTo(cx, cy + b);
      ctx.stroke();
      ctx.restore();
    }

    // ── stars ────────────────────────────────────────────────────────────────
    const drawStar = (sx, sy, r, col, glow) => {
      const px = cx + sx * zoom;
      const py = cy + sy * zoom;
      const pr = Math.max(2, r * zoom);
      ctx.save();
      ctx.fillStyle = col || CEPHEID_FALLBACK_COLOR;
      if (glow) {
        ctx.shadowBlur  = pr * 2.5;
        ctx.shadowColor = col;
      }
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Notebook z-convention: positive z = farther from viewer.
    // z1 < z2 → star1 is closer → draw companion first (behind), Cepheid last (front).
    if (z1 < z2) {
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
    }


    // ── star labels (orbital/composite only) ────────────────────────────────
    // Labels fade out when stars are within 2× the larger star's radius of each other
    if (currentMode !== 'pulsation') {
      const px1 = cx + x1 * zoom,  py1 = cy + y1 * zoom;
      const px2 = cx + x2 * zoom,  py2 = cy + y2 * zoom;
      const dist = Math.hypot(px1 - px2, py1 - py2);
      const minDist = (r1 + COMPANION_RAD) * zoom * 2.2;
      const labelAlpha = Math.min(1, Math.max(0, (dist - minDist) / (minDist * 0.6)));

      if (labelAlpha > 0.01) {
        ctx.save();
        ctx.font = '11px \'JetBrains Mono\', monospace';
        ctx.textBaseline = 'middle';

        // Cepheid label — offset above and right of star
        ctx.globalAlpha = labelAlpha * 0.85;
        ctx.fillStyle = '#ffe4a0';
        ctx.fillText('Cepheid', px1 + r1 * zoom + 8, py1 - r1 * zoom * 0.5);

        // Companion label
        ctx.fillStyle = '#f87171';
        ctx.fillText('Companion', px2 + COMPANION_RAD * zoom + 8, py2 - COMPANION_RAD * zoom * 0.5);

        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    // ── HUD ──────────────────────────────────────────────────────────────────
    if (hud.mag)   hud.mag.innerText   = mag.toFixed(1);
    if (hud.teff)  hud.teff.innerText  = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)   hud.rad.innerText   = `${r1.toFixed(1)} R☉`;
    if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(3);

    requestAnimationFrame(animate);
  }

  init();
})();
