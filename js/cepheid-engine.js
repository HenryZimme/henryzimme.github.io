(function() {
  // ── Config ────────────────────────────────────────────────────────────────
  const MODES         = new Set(['orbital', 'composite', 'pulsation']);
  const COMPANION_RAD = 12.51;   // R☉  (Espinoza-Arancibia & Pilecki 2025)
  const FALLBACK_COL  = '#ffe066';

  // Orbital RV amplitudes — circular orbit, i = 57°
  // K = 2π · a_i · sin(i) / P_orb
  // a₁ = 42 R☉ (Cepheid), a₂ = 76 R☉ (companion)  [Espinoza-Arancibia & Pilecki 2025]
  // P_orb = 58.85 d  [Pilecki et al. 2022, ApJ 940 L48]
  const R_SUN_KM  = 695700;
  const P_ORB_S   = 58.85 * 86400;
  const SIN_I     = Math.sin(57 * Math.PI / 180);
  const K1        = (2 * Math.PI * 42 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~30.3 km/s
  const K2        = (2 * Math.PI * 76 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~54.8 km/s
  const RV_THRESH = 40;   // km/s — ESPRESSO ΔRV requirement
  const RV_N      = 1200;

  let data        = null;
  let currentMode = 'orbital';
  let frameIdx    = 0;
  let maxR1       = 1;

  // Precomputed RV arrays
  // rv1/rv2/rvDelta: analytic circular-orbit model (K1, K2)
  // rvPos1/rvPos2: derived from dz/dt on the position arrays in master_data.json
  //   These encode the same circular model but computed directly from the projected
  //   positions, and would diverge from the analytic curves if the orbit were eccentric
  //   or if the inclination used in the notebook differed from 57°.
  //   NOTE: Proprietary spectroscopic RVs from Pilecki et al. (in prep.) are not
  //   shown here; the curves below are model-extrapolated, not observational.
  let rv1 = [], rv2 = [], rvDelta = [];
  let rvPos1 = [], rvPos2 = [];  // position-derived RVs

  // ── DOM ───────────────────────────────────────────────────────────────────
  const simCanvas = document.getElementById('simCanvas');
  const ctx       = simCanvas ? simCanvas.getContext('2d') : null;
  const preview   = document.getElementById('sim-preview');
  const plotUI    = document.getElementById('hud-plot-container');
  const plotLabel = plotUI ? plotUI.querySelector('[data-plot-label]') : null;

  const hud = {
    mag:   document.getElementById('hud-mag'),
    teff:  document.getElementById('hud-teff'),
    rad:   document.getElementById('hud-rad'),
    phase: document.getElementById('hud-phase'),
  };

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  function safeGet(arr, idx, fb) {
    return (arr && arr[idx] !== undefined) ? arr[idx] : fb;
  }

  // ── RV curve precomputation ───────────────────────────────────────────────
  // rv1 includes both orbital (K1·sin φ) and pulsation (dr1/dt) contributions.
  // The pulsation term is computed from finite differences on physics_frames.r1,
  // mapped onto the RV_N orbital-phase grid. This adds the ~10–20 km/s sawtooth
  // pulsation velocity riding on top of the orbital sine.
  // Companion rv2 is orbital only (r2 = const = 12.51 R☉).
  function buildRV() {
    rv1 = []; rv2 = []; rvDelta = [];

    // Pulsation velocity from r1 array ─────────────────────────────────────
    // dr1/dt in R☉/day → km/s via R_SUN_KM / 86400
    const r1arr = data.physics_frames.r1;
    const N     = r1arr.length;
    // dt in days — metadata or fallback
    const dt = (data.metadata && data.metadata.dt)
      ? data.metadata.dt
      : (Array.isArray(data.physics_frames.t) && data.physics_frames.t.length > 1
          ? data.physics_frames.t[1] - data.physics_frames.t[0]
          : 0.6900 / 120);
    const pulsConv = R_SUN_KM / 86400;  // R☉/day → km/s

    // Build pulsation RV array at the native frame resolution
    const vPuls = r1arr.map((_, i) => {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      return ((r1arr[next] - r1arr[prev]) / (2 * dt)) * pulsConv;
    });

    // Build combined arrays on RV_N orbital-phase grid ─────────────────────
    for (let k = 0; k < RV_N; k++) {
      const phi  = k / RV_N;
      const vorb =  K1 * Math.sin(2 * Math.PI * phi);  // orbital
      // Map orbital phase → r1 frame index
      const posIdx = Math.round(phi * N) % N;
      const vpuls  = vPuls[posIdx];                     // pulsation contribution
      const v1 = vorb + vpuls;
      const v2 = -K2 * Math.sin(2 * Math.PI * phi);    // companion orbital only
      rv1.push(v1); rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));
    }
  }

  // ── RV from z-positions (dz/dt via central finite differences) ─────────────
  // z is the line-of-sight depth in R☉; positive = farther from viewer.
  // Velocity sign convention: positive z-velocity = receding = positive RV.
  // dt comes from metadata if available, otherwise inferred from t array spacing.
  function buildRVFromPositions() {
    const p  = data.physics_frames;
    const n  = p.z1.length;
    // dt in days — try metadata first, fall back to t-array diff, then hardcode
    let dt = (data.metadata && data.metadata.dt)
      ? data.metadata.dt
      : (Array.isArray(p.t) && p.t.length > 1 ? p.t[1] - p.t[0] : null);
    if (!dt) {
      // Last resort: P_puls / 120 frames per cycle — matches notebook default
      dt = 0.6900 / 120;
    }
    // Convert R☉/day → km/s
    const convFactor = R_SUN_KM / 86400;  // 1 R☉/day in km/s ≈ 8.048 km/s

    rvPos1 = []; rvPos2 = [];
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;
      // Central difference; dz positive = moving away = positive RV
      const vz1 = (p.z1[next] - p.z1[prev]) / (2 * dt) * convFactor;
      const vz2 = (p.z2[next] - p.z2[prev]) / (2 * dt) * convFactor;
      rvPos1.push(vz1);
      rvPos2.push(vz2);
    }
  }

  // ── init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const r = await fetch('data/master_data.json');
      data = await r.json();
      const p = data.physics_frames;
      for (const k of ['v_mag','x1','y1','z1','x2','y2','z2','r1']) {
        if (!Array.isArray(p[k])) throw new Error(`Missing: physics_frames.${k}`);
      }
      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));
      maxR1     = Math.max(...p.r1);

      buildRV();
      buildRVFromPositions();

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';

      window.addEventListener('resize', resize);
      resize();
      setMode('orbital');
      animate();
    } catch (e) {
      console.error('Init error:', e);
    }
  }

  // ── mode switching ────────────────────────────────────────────────────────
  window.setMode = function(mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;

    // Plot container: show for orbital (RV) and pulsation (light curve)
    if (plotUI) {
      plotUI.style.opacity = (mode === 'composite') ? '0' : '1';
    }
    if (plotLabel) {
      plotLabel.textContent = (mode === 'orbital')
        ? 'ORBITAL RADIAL VELOCITIES · KM S\u207B\u00B9'
        : 'V-BAND LIGHT CURVE · PULSATION PHASE';
    }

    // Button active state via direct .style (no Tailwind compiler)
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
    const dpr = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width  = rect.width  * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── shared: plot box coordinates ──────────────────────────────────────────
  // Returns {px, py, pw, ph} of the plot container in canvas-space pixels.
  function getPlotRect() {
    if (!plotUI) return null;
    const pr = plotUI.getBoundingClientRect();
    const sr = simCanvas.getBoundingClientRect();
    return {
      px: pr.left - sr.left,
      py: pr.top  - sr.top,
      pw: pr.width,
      ph: pr.height,
    };
  }

  // ── RV plot (orbital mode) ────────────────────────────────────────────────
  function drawRVPlot(frameI) {
    const box = getPlotRect();
    if (!box || !rv1.length) return;
    const { px, py, pw, ph } = box;

    // Map frame index to RV phase
    const rvI    = Math.round(frameI / data.physics_frames.x1.length * RV_N) % RV_N;
    const inset  = 18;
    const padTop = 22;
    const drawH  = ph - padTop - 8;
    const midY   = py + padTop + drawH / 2;
    const RVMAX  = Math.max(K1 + K2 + 10, Math.max(...rv1.map(Math.abs), ...rv2.map(Math.abs)) * 1.1);
    const yScale = (drawH / 2) / RVMAX;
    const nPts   = 200;
    const step   = (pw - inset * 2) / nPts;

    ctx.save();

    // ΔRV ≥ 40 shading
    for (let k = -nPts / 2; k < nPts / 2; k++) {
      const idx = (rvI + Math.round(k) + RV_N) % RV_N;
      if (rvDelta[idx] >= RV_THRESH) {
        ctx.fillStyle = 'rgba(134,239,172,0.08)';
        ctx.fillRect(px + pw / 2 + k * step, py + padTop, step + 0.5, drawH);
      }
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px + inset, midY); ctx.lineTo(px + pw - inset, midY);
    ctx.stroke();

    // ΔRV threshold dashed lines (each star's half-contribution)
    ctx.strokeStyle = 'rgba(134,239,172,0.3)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 6]);
    const half = (RV_THRESH / 2) * yScale;
    for (const yy of [midY - half, midY + half]) {
      ctx.beginPath();
      ctx.moveTo(px + inset, yy); ctx.lineTo(px + pw - inset, yy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // RV curves
    const drawCurve = (arr, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        const y   = midY - arr[idx] * yScale;
        k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawCurve(rv1, '#ffe4a0');  // Cepheid — gold
    drawCurve(rv2, '#f87171');  // Companion — red

    // Current-phase dots on cursor
    const curX = px + pw / 2;
    [[rv1[rvI], '#ffe4a0'], [rv2[rvI], '#f87171']].forEach(([v, col]) => {
      ctx.beginPath();
      ctx.arc(curX, midY - v * yScale, 4, 0, Math.PI * 2);
      ctx.fillStyle   = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // Y-axis tick labels
    ctx.font         = '9px \'JetBrains Mono\', monospace';
    ctx.fillStyle    = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    for (const v of [Math.round(K1+K2), Math.round((K1+K2)/2), 0,
                     -Math.round((K1+K2)/2), -Math.round(K1+K2)]) {
      const ly = midY - v * yScale;
      if (ly > py + padTop + 4 && ly < py + ph - 6) {
        ctx.fillText((v > 0 ? '+' : '') + v, px + inset, ly);
      }
    }

    // Position-derived RV overlay — dotted, same colors, lower opacity
    // These are computed from dz/dt on the notebook's position arrays.
    // They match the analytic curves for a circular orbit; any divergence
    // would indicate eccentricity or inclination inconsistency in the model.
    if (rvPos1.length) {
      const N = data.physics_frames.z1.length;
      const drawPosCurve = (posArr, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([2, 5]);
        for (let k = -nPts / 2; k <= nPts / 2; k++) {
          const phiFrac = ((rvI + Math.round(k) + RV_N) % RV_N) / RV_N;
          const posIdx  = Math.round(phiFrac * N) % N;
          const x = px + pw / 2 + k * step;
          const y = midY - posArr[posIdx] * yScale;
          k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      };
      drawPosCurve(rvPos1, '#ffe4a0');
      drawPosCurve(rvPos2, '#f87171');
    }

    // Bottom annotations
    ctx.font      = '8.5px \'JetBrains Mono\', monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText('model prediction — no observational RVs shown', px + inset, py + ph - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillText('circular orbit + pulsation dr/dt, i = 57° — Espinoza-Arancibia & Pilecki 2025', px + inset, py + ph - 19);

    // Legend
    ctx.textAlign = 'right';
    ctx.font      = '9px \'JetBrains Mono\', monospace';
    ctx.fillStyle = '#ffe4a0';              ctx.fillText('Cepheid',            px + pw - inset, py + padTop + 10);
    ctx.fillStyle = '#f87171';              ctx.fillText('Companion',          px + pw - inset, py + padTop + 22);
    ctx.fillStyle = 'rgba(134,239,172,0.7)'; ctx.fillText('\u0394RV \u2265 40 km/s', px + pw - inset, py + padTop + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText('\u22ef pos-derived',       px + pw - inset, py + padTop + 46);

    ctx.restore();
  }

  // ── light curve (pulsation mode) ──────────────────────────────────────────
  function drawLightCurve(magArr, frameI) {
    const box = getPlotRect();
    if (!box || !magArr) return;
    const { px, py, pw, ph } = box;

    const inset    = 16;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    const midMag   = (bounds.minV + bounds.maxV) / 2;
    const nPts     = 120;
    const step     = (pw - inset * 2) / nPts;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';

    for (let k = -nPts / 2; k <= nPts / 2; k++) {
      const idx = (frameI + k + magArr.length) % magArr.length;
      const x   = px + pw / 2 + k * step;
      // Inverted: lower mag (brighter) = higher on screen
      const y   = py + ph / 2 - ((magArr[idx] - midMag) * (ph / magRange) * 0.72);
      k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── main loop ─────────────────────────────────────────────────────────────
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
      col1 = safeGet(p.color1, i, FALLBACK_COL);
      // ── draw light curve FIRST so star renders on top ──
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
      col1 = safeGet(src.color1, sIdx, FALLBACK_COL);
      // ── RV plot only in orbital mode ──
      if (currentMode === 'orbital') drawRVPlot(i);
    }

    // ── zoom + center ─────────────────────────────────────────────────────
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      zoom = (Math.min(w, h) * 0.14) / maxR1;
      cx   = w / 2;
      cy   = h * 0.28;
    } else {
      zoom = (Math.min(w, h) * 0.32) / bounds.a2;
      cx   = w / 2;
      cy   = h / 2;
    }

    // ── orbital ellipses ─────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const inc = 0.545; // cos 57°
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(248,113,113,0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*inc, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196,162,88,0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1*zoom, bounds.a1*zoom*inc, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // Barycenter crosshair
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx-5,cy); ctx.lineTo(cx+5,cy);
      ctx.moveTo(cx,cy-5); ctx.lineTo(cx,cy+5);
      ctx.stroke();
      ctx.restore();
    }

    // ── draw stars ────────────────────────────────────────────────────────
    const drawStar = (sx, sy, r, col, glow) => {
      const spx = cx + sx*zoom, spy = cy + sy*zoom;
      const pr  = Math.max(2, r*zoom);
      ctx.save();
      ctx.fillStyle = col || FALLBACK_COL;
      if (glow) { ctx.shadowBlur = pr*2.5; ctx.shadowColor = col; }
      ctx.beginPath();
      ctx.arc(spx, spy, pr, 0, Math.PI*2);
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
      const lx1 = cx+x1*zoom, ly1 = cy+y1*zoom;
      const lx2 = cx+x2*zoom, ly2 = cy+y2*zoom;
      const dist = Math.hypot(lx1-lx2, ly1-ly2);
      const minD = (r1+COMPANION_RAD)*zoom*2.2;
      const alpha = Math.min(1, Math.max(0, (dist-minD)/(minD*0.6)));
      if (alpha > 0.01) {
        ctx.save();
        ctx.font = '11px \'JetBrains Mono\', monospace';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha  = alpha * 0.85;
        ctx.fillStyle = '#ffe4a0';
        ctx.fillText('Cepheid',   lx1+r1*zoom+8,          ly1-r1*zoom*0.5);
        ctx.fillStyle = '#f87171';
        ctx.fillText('Companion', lx2+COMPANION_RAD*zoom+8, ly2-COMPANION_RAD*zoom*0.5);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (hud.mag)   hud.mag.innerText   = mag.toFixed(1);
    if (hud.teff)  hud.teff.innerText  = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)   hud.rad.innerText   = `${r1.toFixed(1)} R\u2609`;
    if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(3);

    requestAnimationFrame(animate);
  }

  init();
})();
