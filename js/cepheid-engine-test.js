(function () {
  // ── Config ────────────────────────────────────────────────────────────────
  const MODES         = new Set(['orbital', 'pulsation']);
  const COMPANION_RAD = 12.51;   // R☉  (Espinoza-Arancibia & Pilecki 2025)
  const FALLBACK_COL  = '#ffe066';

  // Orbital RV amplitudes — circular orbit, i = 57°
  // K = 2π · a_i · sin(i) / P_orb
  // a₁ = 42 R☉ (Cepheid), a₂ = 76 R☉ (companion)  [Espinoza-Arancibia & Pilecki 2025]
  // P_orb = 58.85 d  [Pilecki et al. 2022, ApJ 940 L48]
  const R_SUN_KM   = 695700;
  const P_ORB_D    = 58.85;
  const P_PULS_D   = 0.6900;
  const P_ORB_S    = P_ORB_D * 86400;
  const SIN_I      = Math.sin(57 * Math.PI / 180);
  const K1         = (2 * Math.PI * 42 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~30.3 km/s
  const K2         = (2 * Math.PI * 76 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~54.8 km/s
  const RV_THRESH  = 40;    // km/s — ESPRESSO ΔRV requirement
  const RV_N       = 2400;

  // ESPRESSO pulsation-phase quiescence window  [Pilecki et al. 2022 + proposal]
  const PULS_MIN = 0.50;
  const PULS_MAX = 0.70;

  let data           = null;
  let currentMode    = 'orbital';
  let frameIdx       = 0;
  let maxR1          = 1;
  let showConstraints = true;  // ESPRESSO window toggle state

  // ── RV arrays ─────────────────────────────────────────────────────────────
  // rv1_orb: pure orbital sine (K1·sin φ) — the physically correct Cepheid
  //   radial-velocity curve in the absence of pulsation.
  // rv2:     companion orbital (−K2·sin φ).
  // rvDelta: |rv1_orb − rv2| = (K1+K2)|sin φ|, used for ΔRV shading.
  // vpuls_arr: pulsation velocity at each frame (dr1/dt, km/s) — used as a
  //   ±RMS envelope drawn around rv1_orb so the viewer can see the pulsation
  //   contribution without it distorting the orbital shape.
  //
  // WHY NOT ADD vpuls INTO rv1?
  //   P_orb / P_puls ≈ 85.3, so the pulsation cycles 85 times per orbit.
  //   The previous code mapped pulsation phase 1-to-1 onto orbital phase
  //   (posIdx = round(φ·N)), effectively stretching one pulsation cycle across
  //   the full orbit. This produced a distorted shape that looked like pure
  //   pulsation RV. The correct combined curve would show 85 rapid oscillations
  //   (~15 km/s sawtooth) riding on the 85 km/s orbital sine — unresolvable at
  //   RV_N = 2400 and visually confusing. Showing the orbital sine + a shaded
  //   ±σ_puls band is more honest and more useful for scheduling.
  let rv1_orb   = [];
  let rv2       = [];
  let rvDelta   = [];
  let vpuls_arr = [];   // one entry per physics_frame

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

  // ── Mobile helpers ────────────────────────────────────────────────────────
  function isMobile() { return window.innerWidth < 640; }

  // Inject responsive overrides for the HTML overlay so it doesn't cover the
  // canvas on narrow screens. We do this in JS because the HTML is not ours to
  // edit here.
  function applyMobileOverrides() {
    const styleId = 'cep-mobile-overrides';
    if (document.getElementById(styleId)) return;  // already injected
    const el = document.createElement('style');
    el.id = styleId;
    el.textContent = `
      @media (max-width: 639px) {
        /* Shrink HUD table so it doesn't eat half the canvas */
        #hud-table {
          width: 130px !important;
          padding: 0.55rem 0.7rem !important;
          font-size: 9px !important;
        }
        /* Hide the long prose description on small screens */
        #ui-layer > div:first-child > p[style] {
          display: none !important;
        }
        /* Make the sim header text smaller */
        #ui-layer h2 {
          font-size: 18px !important;
        }
        #ui-layer p.eyebrow, #ui-layer > div:first-child > p {
          font-size: 11px !important;
        }
      }
    `;
    document.head.appendChild(el);
  }

  // ── RV precomputation ─────────────────────────────────────────────────────
  function buildRV() {
    rv1_orb = []; rv2 = []; rvDelta = [];

    // Pure orbital sinusoids over one full orbit
    for (let k = 0; k < RV_N; k++) {
      const phi = k / RV_N;
      const v1  =  K1 * Math.sin(2 * Math.PI * phi);
      const v2  = -K2 * Math.sin(2 * Math.PI * phi);
      rv1_orb.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));
    }

    // Pulsation velocity at each physics frame via central finite differences
    // dr1/dt in R☉/day → km/s via R_SUN_KM / 86400
    const r1arr = data.physics_frames.r1;
    const N     = r1arr.length;
    const dt    = (data.metadata && data.metadata.dt)
      ? data.metadata.dt
      : (Array.isArray(data.physics_frames.t) && data.physics_frames.t.length > 1
          ? data.physics_frames.t[1] - data.physics_frames.t[0]
          : P_PULS_D / 120);
    const conv = R_SUN_KM / 86400;  // R☉/day → km/s

    vpuls_arr = r1arr.map((_, i) => {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      return ((r1arr[next] - r1arr[prev]) / (2 * dt)) * conv;
    });
  }

  // ── Inject ESPRESSO-constraints toggle button ─────────────────────────────
  function injectConstraintsButton() {
    // The mode-button pill lives in a flex column; find that container and append.
    const modeBtn = document.getElementById('btn-orbital') || document.getElementById('btn-pulsation');
    if (!modeBtn) return;
    const pillRow = modeBtn.parentElement;   // the pill div
    const column  = pillRow ? pillRow.parentElement : null;  // the flex column
    if (!column) return;

    const btn = document.createElement('button');
    btn.id = 'btn-constraints';
    btn.textContent = 'ESPRESSO WINDOWS  ON';
    const activeStyle = `
      pointer-events: auto;
      background: rgba(134,239,172,0.15);
      border: 1px solid rgba(134,239,172,0.40);
      color: rgba(134,239,172,0.95);
      padding: 0.28rem 1.0rem;
      border-radius: 999px;
      font-size: 9px;
      cursor: pointer;
      letter-spacing: 0.13em;
      font-family: 'JetBrains Mono', monospace;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    `;
    const inactiveStyle = `
      pointer-events: auto;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.28);
      padding: 0.28rem 1.0rem;
      border-radius: 999px;
      font-size: 9px;
      cursor: pointer;
      letter-spacing: 0.13em;
      font-family: 'JetBrains Mono', monospace;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    `;
    btn.style.cssText = activeStyle;

    btn.addEventListener('click', () => {
      showConstraints = !showConstraints;
      btn.textContent  = showConstraints ? 'ESPRESSO WINDOWS  ON' : 'ESPRESSO WINDOWS  OFF';
      btn.style.cssText = showConstraints ? activeStyle : inactiveStyle;
    });

    column.appendChild(btn);
  }

  // ── init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!simCanvas || !ctx) return;
    applyMobileOverrides();
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
      injectConstraintsButton();

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';

      window.addEventListener('resize', resize);
      resize();
      setMode('orbital');
      animate();
    } catch (e) {
      console.error('Cepheid engine init error:', e);
    }
  }

  // ── mode switching ────────────────────────────────────────────────────────
  window.setMode = function (mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;

    if (plotUI) plotUI.style.opacity = '1';
    if (plotLabel) {
      plotLabel.textContent = (mode === 'orbital')
        ? 'ORBITAL RADIAL VELOCITIES · KM S⁻¹'
        : 'V-BAND LIGHT CURVE · PULSATION PHASE';
    }

    document.querySelectorAll('.btn-mode').forEach(b => {
      b.style.background = 'transparent';
      b.style.color      = 'rgba(255,255,255,0.38)';
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

  // ── plot box coordinates ──────────────────────────────────────────────────
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
    if (!box || !rv1_orb.length) return;
    const { px, py, pw, ph } = box;

    // Map animation frame → orbital-phase index in rv arrays
    const rvI    = Math.round(frameI / data.physics_frames.x1.length * RV_N) % RV_N;
    const inset  = 18;
    const padTop = 22;
    const drawH  = ph - padTop - 10;
    const midY   = py + padTop + drawH / 2;
    const RVMAX  = (K1 + K2) * 1.15;
    const yScale = (drawH / 2) / RVMAX;
    const nPts   = 200;
    const step   = (pw - inset * 2) / nPts;
    const mobile = isMobile();

    // RMS of pulsation velocity — used for the ±σ envelope
    const vpuls_rms = Math.sqrt(
      vpuls_arr.reduce((s, v) => s + v * v, 0) / Math.max(1, vpuls_arr.length)
    );

    ctx.save();

    // ── Background constraint shading ──────────────────────────────────────
    // Green where ΔRV ≥ 40 km/s (ESPRESSO can cleanly separate spectra)
    // Red-tinted where ΔRV < 40 km/s (spectra blended — avoid)
    if (showConstraints) {
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        ctx.fillStyle = rvDelta[idx] >= RV_THRESH
          ? 'rgba(134,239,172,0.10)'
          : 'rgba(239,68,68,0.07)';
        ctx.fillRect(x, py + padTop, step + 0.5, drawH);
      }
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px + inset, midY);
    ctx.lineTo(px + pw - inset, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // ΔRV = 40 threshold dashed lines
    if (showConstraints) {
      ctx.strokeStyle = 'rgba(134,239,172,0.35)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 6]);
      const half = (RV_THRESH / 2) * yScale;
      for (const yy of [midY - half, midY + half]) {
        ctx.beginPath();
        ctx.moveTo(px + inset, yy);
        ctx.lineTo(px + pw - inset, yy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── Pulsation-velocity ±RMS envelope around Cepheid orbital curve ──────
    // Shaded band shows how much the observed RV can deviate from the pure
    // orbital model at any phase due to pulsation (σ ≈ 8–12 km/s typically).
    if (vpuls_rms > 0.5) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,228,160,0.07)';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        const y   = midY - (rv1_orb[idx] + vpuls_rms) * yScale;
        k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      for (let k = nPts / 2; k >= -nPts / 2; k--) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        const y   = midY - (rv1_orb[idx] - vpuls_rms) * yScale;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // ── Orbital RV curves ─────────────────────────────────────────────────
    const drawCurve = (arr, color, lw = 2.5) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.lineJoin    = 'round';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x   = px + pw / 2 + k * step;
        const y   = midY - arr[idx] * yScale;
        k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawCurve(rv1_orb, '#ffe4a0');
    drawCurve(rv2,     '#f87171');

    // ── Current-phase dots ────────────────────────────────────────────────
    // Solid dot = pure orbital RV; hollow dot = orbital + instantaneous vpuls
    const curX     = px + pw / 2;
    const pulsIdx  = Math.round((frameI / data.physics_frames.r1.length) * vpuls_arr.length) % vpuls_arr.length;
    const vp_now   = vpuls_arr[pulsIdx] || 0;

    // Orbital dot — Cepheid
    ctx.beginPath();
    ctx.arc(curX, midY - rv1_orb[rvI] * yScale, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#ffe4a0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Pulsation-offset dot — lighter, shows instantaneous position
    ctx.beginPath();
    ctx.arc(curX, midY - (rv1_orb[rvI] + vp_now) * yScale, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,228,160,0.5)';
    ctx.fill();

    // Orbital dot — Companion
    ctx.beginPath();
    ctx.arc(curX, midY - rv2[rvI] * yScale, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#f87171';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Y-axis tick labels ────────────────────────────────────────────────
    const tickVals = mobile
      ? [Math.round(K1 + K2), 0, -Math.round(K1 + K2)]
      : [Math.round(K1 + K2), Math.round((K1 + K2) / 2), 0,
         -Math.round((K1 + K2) / 2), -Math.round(K1 + K2)];
    ctx.font         = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    for (const v of tickVals) {
      const ly = midY - v * yScale;
      if (ly > py + padTop + 4 && ly < py + ph - 6) {
        ctx.fillText((v > 0 ? '+' : '') + v, px + inset, ly);
      }
    }

    // ── Legend ────────────────────────────────────────────────────────────
    ctx.textAlign = 'right';
    ctx.font      = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
    const lx = px + pw - inset;
    let   ly = py + padTop + 10;
    ctx.fillStyle = '#ffe4a0';
    ctx.fillText('Cepheid (orbital RV)', lx, ly); ly += 12;
    ctx.fillStyle = 'rgba(255,228,160,0.4)';
    ctx.fillText(`± pulsation σ ≈ ${vpuls_rms.toFixed(0)} km/s`, lx, ly); ly += 12;
    ctx.fillStyle = '#f87171';
    ctx.fillText('Companion', lx, ly); ly += 12;
    if (showConstraints) {
      ctx.fillStyle = 'rgba(134,239,172,0.85)';
      ctx.fillText('ΔRV ≥ 40 km/s ✓', lx, ly);
    }

    // ── Bottom attribution (desktop only) ────────────────────────────────
    if (!mobile) {
      ctx.font      = '8px \'JetBrains Mono\', monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('orbital model — no observational RVs shown', px + inset, py + ph - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillText(
        'circular orbit, i = 57°, K₁ ≈ 30.3 km/s, K₂ ≈ 54.8 km/s — Espinoza-Arancibia & Pilecki 2025',
        px + inset, py + ph - 19
      );
    }

    ctx.restore();
  }

  // ── Light curve (pulsation mode) ──────────────────────────────────────────
  function drawLightCurve(magArr, frameI) {
    const box = getPlotRect();
    if (!box || !magArr) return;
    const { px, py, pw, ph } = box;

    const inset    = 16;
    const padTop   = 22;
    const drawH    = ph - padTop - 10;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    const midMag   = (bounds.minV + bounds.maxV) / 2;
    const nPts     = 120;
    const step     = (pw - inset * 2) / nPts;
    const N        = magArr.length;
    const mobile   = isMobile();

    ctx.save();

    // ── Background constraint shading ──────────────────────────────────────
    // Green where pulsation phase φ₁ ∈ [0.50, 0.70] — ESPRESSO quiescence window
    // (minimum turbulence, minimum atmospheric jitter, vturb ~3 km/s)
    if (showConstraints) {
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx   = (frameI + Math.round(k) + N) % N;
        const phase = idx / N;
        const x     = px + pw / 2 + k * step;
        ctx.fillStyle = (phase >= PULS_MIN && phase <= PULS_MAX)
          ? 'rgba(134,239,172,0.13)'
          : 'rgba(239,68,68,0.06)';
        ctx.fillRect(x, py + padTop, step + 0.5, drawH);
      }
    }

    // ── Light curve ───────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    for (let k = -nPts / 2; k <= nPts / 2; k++) {
      const idx = (frameI + k + N) % N;
      const x   = px + pw / 2 + k * step;
      const y   = py + padTop + drawH / 2
                  - ((magArr[idx] - midMag) * (drawH / magRange) * 0.72);
      k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current-phase dot
    const curY = py + padTop + drawH / 2
                 - ((magArr[frameI] - midMag) * (drawH / magRange) * 0.72);
    ctx.beginPath();
    ctx.arc(px + pw / 2, curY, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#60a5fa';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Phase-axis tick labels ────────────────────────────────────────────
    ctx.font         = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'center';
    for (const ph of [0, 0.25, 0.50, 0.70, 0.75, 1.0]) {
      const phIdx   = Math.round(ph * N);
      const kOffset = ((phIdx - frameI + N) % N);
      const kWrap   = kOffset > N / 2 ? kOffset - N : kOffset;
      if (Math.abs(kWrap) <= nPts / 2) {
        const x = px + pw / 2 + kWrap * step;
        // Highlight the quiescence boundary ticks
        if ((ph === PULS_MIN || ph === PULS_MAX) && showConstraints) {
          ctx.fillStyle = 'rgba(134,239,172,0.7)';
          ctx.fillText(ph.toFixed(2), x, py + padTop + drawH + 2);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
        } else {
          ctx.fillText(ph.toFixed(2), x, py + padTop + drawH + 2);
        }
      }
    }

    // ── Legend + constraint label ─────────────────────────────────────────
    if (showConstraints) {
      ctx.font      = `${mobile ? 7.5 : 8.5}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(134,239,172,0.75)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('φ₁ ∈ [0.50, 0.70]  ESPRESSO quiescence window', px + inset, py + ph - 8);
    }

    ctx.restore();
  }

  // ── main loop ─────────────────────────────────────────────────────────────
  function animate() {
    if (!data || !data.physics_frames) return;
    const p   = data.physics_frames;
    const dpr = window.devicePixelRatio || 1;
    const w   = simCanvas.width  / dpr;
    const h   = simCanvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const i      = Math.floor(frameIdx) % p.x1.length;
    const mobile = isMobile();
    frameIdx += (currentMode === 'pulsation' ? 0.4 : 0.8);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      // Companion off-screen; only Cepheid rendered
      x1 = 0; y1 = 0; z1 = 0; x2 = 99999; y2 = 0; z2 = -1;
      r1   = p.r1[i];
      mag  = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(p.color1, i, FALLBACK_COL);
      drawLightCurve(p.v_mag, i);
    } else {
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1   = p.r1[i];
      mag  = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(p.color1, i, FALLBACK_COL);
      drawRVPlot(i);
    }

    // ── Zoom + center — mobile-responsive ────────────────────────────────
    // On mobile, the HUD table (now ~130px) sits top-right, and the plot
    // panel sits at the bottom. We shift cy upward and reduce zoom so the
    // stars occupy the clear centre-left zone.
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      zoom = (Math.min(w, h) * (mobile ? 0.09 : 0.14)) / maxR1;
      cx   = w / 2;
      cy   = mobile ? h * 0.18 : h * 0.28;
    } else {
      zoom = (Math.min(w, h) * (mobile ? 0.19 : 0.32)) / bounds.a2;
      cx   = mobile ? w * 0.42 : w / 2;   // shift left slightly on mobile to clear HUD
      cy   = mobile ? h * 0.36 : h / 2;   // shift up to clear bottom plot panel
    }

    // ── Orbital ellipses ─────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const inc = 0.545; // cos 57°
      ctx.save();
      ctx.lineWidth = mobile ? 1.5 : 2;
      ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(248,113,113,0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2 * zoom, bounds.a2 * zoom * inc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196,162,88,0.65)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1 * zoom, bounds.a1 * zoom * inc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Barycenter crosshair
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
      ctx.stroke();
      ctx.restore();
    }

    // ── Draw stars ────────────────────────────────────────────────────────
    const drawStar = (sx, sy, r, col, glow) => {
      const spx = cx + sx * zoom;
      const spy = cy + sy * zoom;
      const pr  = Math.max(2, r * zoom);
      ctx.save();
      ctx.fillStyle = col || FALLBACK_COL;
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

    // ── ESPRESSO constraint ring on star ──────────────────────────────────
    // A green ring glows around the Cepheid when the current orbital/pulsation
    // phase satisfies the ESPRESSO scheduling constraint for that mode.
    if (showConstraints) {
      let constraintOk = false;
      let starPx, starPy, starR;

      if (currentMode === 'orbital') {
        const rvI = Math.round(i / p.x1.length * RV_N) % RV_N;
        constraintOk = rvDelta[rvI] >= RV_THRESH;
        starPx = cx + x1 * zoom;
        starPy = cy + y1 * zoom;
        starR  = Math.max(2, r1 * zoom);
      } else {
        const phase  = i / p.r1.length;
        constraintOk = (phase >= PULS_MIN && phase <= PULS_MAX);
        starPx = cx;
        starPy = cy;
        starR  = Math.max(2, r1 * zoom);
      }

      ctx.save();
      ctx.strokeStyle = constraintOk
        ? 'rgba(134,239,172,0.70)'
        : 'rgba(239,68,68,0.35)';
      ctx.lineWidth   = constraintOk ? 2 : 1;
      ctx.shadowBlur  = constraintOk ? 8 : 0;
      ctx.shadowColor = 'rgba(134,239,172,0.5)';
      ctx.beginPath();
      ctx.arc(starPx, starPy, starR + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Star labels (hidden on mobile to avoid clutter) ───────────────────
    if (currentMode !== 'pulsation' && !mobile) {
      const lx1  = cx + x1 * zoom, ly1 = cy + y1 * zoom;
      const lx2  = cx + x2 * zoom, ly2 = cy + y2 * zoom;
      const dist = Math.hypot(lx1 - lx2, ly1 - ly2);
      const minD = (r1 + COMPANION_RAD) * zoom * 2.2;
      const alpha = Math.min(1, Math.max(0, (dist - minD) / (minD * 0.6)));
      if (alpha > 0.01) {
        ctx.save();
        ctx.font         = '11px \'JetBrains Mono\', monospace';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha  = alpha * 0.85;
        ctx.fillStyle    = '#ffe4a0';
        ctx.fillText('Cepheid',   lx1 + r1 * zoom + 8,           ly1 - r1 * zoom * 0.5);
        ctx.fillStyle = '#f87171';
        ctx.fillText('Companion', lx2 + COMPANION_RAD * zoom + 8, ly2 - COMPANION_RAD * zoom * 0.5);
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
