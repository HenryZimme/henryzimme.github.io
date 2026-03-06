(function() {
  // --- Configuration ---
  const MODES        = new Set(['orbital', 'composite', 'pulsation']);
  const COMPANION_RAD = 12.51;
  const CEPHEID_FALLBACK_COLOR = '#ffe066';

  // Orbital RV physics (circular orbit, i = 57°)
  // K = 2π · a · sin(i) / P_orb
  // a in R☉, P_orb in seconds
  const P_ORB_S    = 58.85 * 86400;           // 58.85 days → seconds
  const R_SUN_KM   = 695700;                  // km per R☉
  const SIN_I      = Math.sin(Math.PI / 180 * 57);
  const K1_KMS     = (2 * Math.PI * 42 * R_SUN_KM * SIN_I) / P_ORB_S;  // Cepheid
  const K2_KMS     = (2 * Math.PI * 76 * R_SUN_KM * SIN_I) / P_ORB_S;  // Companion
  const RV_THRESH  = 40;   // km/s — ESPRESSO ΔRV requirement from proposal
  const RV_N       = 500;  // points in precomputed RV arrays

  let data    = null;
  let currentMode = 'orbital';
  let frameIdx    = 0;
  let maxR1       = 1;

  // Precomputed RV curves (filled after data loads)
  let rv1 = [], rv2 = [], rvDelta = [];

  // --- DOM ---
  const simCanvas = document.getElementById('simCanvas');
  const ctx       = simCanvas ? simCanvas.getContext('2d') : null;
  const preview   = document.getElementById('sim-preview');
  const plotUI    = document.getElementById('hud-plot-container');
  const plotLabel = plotUI ? plotUI.querySelector('[data-plot-label]') : null;

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

  // ── precompute RV curves ──────────────────────────────────────────────────
  function buildRVCurves() {
    rv1     = [];
    rv2     = [];
    rvDelta = [];
    for (let k = 0; k < RV_N; k++) {
      const phi  = k / RV_N;
      const sinPhi = Math.sin(2 * Math.PI * phi);
      const v1  =  K1_KMS * sinPhi;   // Cepheid moves toward us at φ=0.25
      const v2  = -K2_KMS * sinPhi;   // Companion opposite
      rv1.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));
    }
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
          throw new Error(`physics_frames.${key} missing`);
      }

      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));
      maxR1     = Math.max(...p.r1);

      buildRVCurves();

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

    // Show plot in both orbital AND pulsation; hide in composite
    if (plotUI) {
      const showPlot = (mode === 'pulsation' || mode === 'orbital');
      plotUI.style.opacity = showPlot ? '1' : '0';
    }

    // Update plot label if the element exists
    if (plotLabel) {
      plotLabel.textContent = (mode === 'orbital')
        ? 'ORBITAL RADIAL VELOCITIES · KM S⁻¹'
        : 'V-BAND LIGHT CURVE · PULSATION PHASE';
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

  // ── RV plot ───────────────────────────────────────────────────────────────
  function drawRVPlot(currentIdx) {
    if (!plotUI || !rv1.length) return;
    const rect  = plotUI.getBoundingClientRect();
    const sRect = simCanvas.getBoundingClientRect();

    const px = rect.left - sRect.left;
    const py = rect.top  - sRect.top;
    const pw = rect.width;
    const ph = rect.height;
    const inset   = 16;
    const padTop  = 22;   // room for label
    const padBot  = 10;
    const plotH   = ph - padTop - padBot;
    const midY    = py + padTop + plotH / 2;

    const RV_MAX  = K1_KMS + K2_KMS + 8;   // axis range with headroom
    const yScale  = (plotH / 2) / RV_MAX;

    // Phase fraction for the current frame → map into RV_N
    const rvIdx = Math.round(currentIdx / (data.physics_frames.x1.length) * RV_N) % RV_N;

    ctx.save();

    // ── ΔRV ≥ 40 shading ─────────────────────────────────────────────────
    // Draw shaded bands where |ΔRV| >= threshold, across the full scrolling window
    const points = 200;
    const step   = (pw - inset * 2) / points;

    // Build filled region above threshold line first (behind curves)
    ctx.beginPath();
    let inShade = false;
    for (let k = -points / 2; k <= points / 2; k++) {
      const idx = (rvIdx + k + RV_N) % RV_N;
      const delta = rvDelta[idx];
      const x = px + pw / 2 + k * step;
      const threshY = midY - RV_THRESH * yScale;

      if (delta >= RV_THRESH) {
        if (!inShade) { ctx.moveTo(x, threshY); inShade = true; }
        ctx.lineTo(x, threshY);
      } else if (inShade) {
        ctx.lineTo(x, threshY);
        inShade = false;
      }
    }
    // Shade is a horizontal strip; fill the ΔRV window by drawing it as a rect overlay instead
    // (cleaner approach: fill per-column)
    ctx.restore();
    ctx.save();

    for (let k = -points / 2; k <= points / 2; k++) {
      const idx   = (rvIdx + k + RV_N) % RV_N;
      const delta = rvDelta[idx];
      const x     = px + pw / 2 + k * step;
      if (delta >= RV_THRESH) {
        ctx.fillStyle = 'rgba(134, 239, 172, 0.07)';
        ctx.fillRect(x, py + padTop, step + 0.5, plotH);
      }
    }

    // ── zero line ─────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(px + inset, midY);
    ctx.lineTo(px + pw - inset, midY);
    ctx.stroke();

    // ── ΔRV = 40 threshold lines ──────────────────────────────────────────
    ctx.strokeStyle = 'rgba(134, 239, 172, 0.35)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    // Label territory: ΔRV threshold shown as symmetric lines at ±20 km/s
    // (since ΔRV = |v1−v2| and they're symmetric, the individual crossings
    //  happen when one star hits ±20 km/s — but simpler to just label midline)
    // Instead draw a band boundary at the ΔRV / 2 level from midY
    const threshOffset = (RV_THRESH / 2) * yScale;
    ctx.beginPath();
    ctx.moveTo(px + inset, midY - threshOffset);
    ctx.lineTo(px + pw - inset, midY - threshOffset);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + inset, midY + threshOffset);
    ctx.lineTo(px + pw - inset, midY + threshOffset);
    ctx.stroke();

    ctx.setLineDash([]);

    // ── RV curves ─────────────────────────────────────────────────────────
    const drawCurve = (rvArr, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      for (let k = -points / 2; k <= points / 2; k++) {
        const idx = (rvIdx + k + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        const y   = midY - rvArr[idx] * yScale;
        if (k === -points / 2) ctx.moveTo(x, y);
        else                   ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawCurve(rv1, '#ffe4a0');   // Cepheid — gold
    drawCurve(rv2, '#f87171');   // Companion — red

    // ── cursor ────────────────────────────────────────────────────────────
    // (the DOM cursor line handles this; just draw current-phase dots)
    const curX = px + pw / 2;
    [
      [rv1[rvIdx], '#ffe4a0'],
      [rv2[rvIdx], '#f87171'],
    ].forEach(([val, col]) => {
      const dotY = midY - val * yScale;
      ctx.beginPath();
      ctx.arc(curX, dotY, 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // ── axis labels ───────────────────────────────────────────────────────
    ctx.font      = '9px \'JetBrains Mono\', monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    const labelKms = [Math.round(K1_KMS + K2_KMS), Math.round((K1_KMS + K2_KMS)/2), 0, -Math.round((K1_KMS + K2_KMS)/2), -Math.round(K1_KMS + K2_KMS)];
    labelKms.forEach(v => {
      const ly = midY - v * yScale;
      if (ly > py + padTop + 6 && ly < py + ph - padBot - 4) {
        ctx.fillText((v > 0 ? '+' : '') + v, px + inset, ly);
      }
    });

    // ── legend ────────────────────────────────────────────────────────────
    ctx.font      = '9px \'JetBrains Mono\', monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe4a0';
    ctx.fillText('Cepheid', px + pw - inset, py + padTop + 10);
    ctx.fillStyle = '#f87171';
    ctx.fillText('Companion', px + pw - inset, py + padTop + 22);
    ctx.fillStyle = 'rgba(134,239,172,0.6)';
    ctx.fillText('ΔRV ≥ 40 km/s', px + pw - inset, py + padTop + 34);

    ctx.restore();
  }

  // ── light curve plot ──────────────────────────────────────────────────────
  function drawLightCurve(pData, currentIdx) {
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
      drawLightCurve(p.v_mag, i);
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
      if (currentMode === 'orbital') drawRVPlot(i);
    }

    // ── zoom & center ──────────────────────────────────────────────────────
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      const shortSide = Math.min(w, h);
      zoom = (shortSide * 0.14) / maxR1;
      cx   = w / 2;
      cy   = h * 0.28;
    } else {
      zoom = (Math.min(w, h) * 0.32) / bounds.a2;
      cx   = w / 2;
      cy   = h / 2;
    }

    // ── orbital tracks ────────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const incFactor = 0.545;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2 * zoom, bounds.a2 * zoom * incFactor, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196, 162, 88, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1 * zoom, bounds.a1 * zoom * incFactor, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

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

    // ── stars ─────────────────────────────────────────────────────────────
    const drawStar = (sx, sy, r, col, glow) => {
      const spx = cx + sx * zoom;
      const spy = cy + sy * zoom;
      const pr  = Math.max(2, r * zoom);
      ctx.save();
      ctx.fillStyle = col || CEPHEID_FALLBACK_COLOR;
      if (glow) { ctx.shadowBlur = pr * 2.5; ctx.shadowColor = col; }
      ctx.beginPath();
      ctx.arc(spx, spy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    if (z1 < z2) {
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
    }

    // ── star labels ───────────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const px1 = cx + x1 * zoom, py1 = cy + y1 * zoom;
      const px2 = cx + x2 * zoom, py2 = cy + y2 * zoom;
      const dist    = Math.hypot(px1 - px2, py1 - py2);
      const minDist = (r1 + COMPANION_RAD) * zoom * 2.2;
      const alpha   = Math.min(1, Math.max(0, (dist - minDist) / (minDist * 0.6)));
      if (alpha > 0.01) {
        ctx.save();
        ctx.font = '11px \'JetBrains Mono\', monospace';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha  = alpha * 0.85;
        ctx.fillStyle = '#ffe4a0';
        ctx.fillText('Cepheid', px1 + r1 * zoom + 8, py1 - r1 * zoom * 0.5);
        ctx.fillStyle = '#f87171';
        ctx.fillText('Companion', px2 + COMPANION_RAD * zoom + 8, py2 - COMPANION_RAD * zoom * 0.5);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (hud.mag)   hud.mag.innerText   = mag.toFixed(1);
    if (hud.teff)  hud.teff.innerText  = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)   hud.rad.innerText   = `${r1.toFixed(1)} R☉`;
    if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(3);

    requestAnimationFrame(animate);
  }

  init();
})();
