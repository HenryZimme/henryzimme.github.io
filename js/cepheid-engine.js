(function() {
  // --- Configuration ---
  const MODES = new Set(['orbital', 'composite', 'pulsation']);
  const COMPANION_RAD = 12.51;
  const CEPHEID_FALLBACK_COLOR = '#ffe066';

  let data    = null;
  let currentMode = 'orbital';
  let frameIdx    = 0;
  let maxR1       = 1; // precomputed for pulsation zoom

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

      // Set initial button state properly via styles
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

    // Direct style manipulation — class-based Tailwind won't work without compiler
    document.querySelectorAll('.btn-mode').forEach(b => {
      b.style.background = 'transparent';
      b.style.color      = 'rgba(255,255,255,0.4)';
      b.style.boxShadow  = 'none';
    });
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) {
      btn.style.background = 'rgba(255,255,255,0.18)';
      btn.style.color      = '#ffffff';
      btn.style.boxShadow  = 'inset 0 0 0 1px rgba(255,255,255,0.25)';
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

  // ── light curve plot ──────────────────────────────────────────────────────
  function drawCenteredPlot(pData, currentIdx) {
    if (!plotUI || !pData) return;
    const rect  = plotUI.getBoundingClientRect();
    const sRect = simCanvas.getBoundingClientRect();

    const px = rect.left - sRect.left;
    const py = rect.top  - sRect.top;
    const pw = rect.width;
    const ph = rect.height;

    // Inset so line doesn't clip the container border
    const inset = 12;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';

    const points   = 120;
    const step     = (pw - inset * 2) / points;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    const midMag   = (bounds.minV + bounds.maxV) / 2;

    for (let k = -points / 2; k <= points / 2; k++) {
      const idx = (currentIdx + k + pData.length) % pData.length;
      const val = pData[idx];
      const x   = px + pw / 2 + k * step;
      // INVERTED: lower mag (brighter) plots HIGHER on screen
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

    let i = Math.floor(frameIdx) % p.x1.length;
    frameIdx += (currentMode === 'pulsation' ? 0.4 : 0.8);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    // ── per-mode data selection ──
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

    // ── zoom ──
    // Pulsation: star center sits in upper 38% of canvas, sized to leave room for graph
    // Orbital: fit the full orbit with padding
    let zoom, starCenterX, starCenterY;
    if (currentMode === 'pulsation') {
      // Reserve bottom ~220px for plot + buttons, star sits in the space above
      const availH = h * 0.60;           // 60% of height for the star area
      const maxPxR = availH * 0.42;      // star radius can use up to 42% of that space
      zoom         = maxPxR / maxR1;
      starCenterX  = w / 2;
      starCenterY  = h * 0.36;           // shifted toward upper portion
    } else {
      zoom        = (w * 0.28) / bounds.a2;
      starCenterX = w / 2;
      starCenterY = h / 2;
    }

    // ── draw orbits (orbital/composite only) ──
    if (currentMode !== 'pulsation') {
      // inclination ≈ 57° → cos(57°) ≈ 0.545 for the y-axis scale
      const incFactor = 0.545;

      // Companion orbit (larger)
      ctx.strokeStyle = 'rgba(248,113,113,0.25)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.ellipse(starCenterX, starCenterY,
                  bounds.a2 * zoom, bounds.a2 * zoom * incFactor,
                  0, 0, Math.PI * 2);
      ctx.stroke();

      // Cepheid orbit (smaller, around barycenter)
      ctx.strokeStyle = 'rgba(196,162,88,0.25)';
      ctx.beginPath();
      ctx.ellipse(starCenterX, starCenterY,
                  bounds.a1 * zoom, bounds.a1 * zoom * incFactor,
                  0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]); // reset dash

      // Barycenter dot
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(starCenterX, starCenterY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── draw stars ──
    const drawStar = (sx, sy, r, col, glow) => {
      const px = starCenterX + sx * zoom;
      const py = starCenterY + sy * zoom;
      const pr = Math.max(1.5, r * zoom);
      ctx.fillStyle = col || CEPHEID_FALLBACK_COLOR;
      if (glow) {
        ctx.shadowBlur  = pr * 2.2;
        ctx.shadowColor = col;
      }
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    // FIX: flip z comparison — positive z in this notebook convention = farther from viewer
    if (z1 < z2) {
      // Star 1 is closer → draw companion first (behind), Cepheid on top
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      // Star 2 is closer → draw Cepheid first (behind), companion on top
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
    }

    // ── HUD ──
    if (hud.mag)   hud.mag.innerText   = mag.toFixed(3);
    if (hud.teff)  hud.teff.innerText  = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)   hud.rad.innerText   = `${r1.toFixed(2)} R☉`;
    if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(3);

    requestAnimationFrame(animate);
  }

  init();
})();
