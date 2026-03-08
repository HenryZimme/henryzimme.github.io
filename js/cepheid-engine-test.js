(function () {
  // ── Config ────────────────────────────────────────────────────────────────
  const MODES         = new Set(['orbital', 'pulsation']);
  const COMPANION_RAD = 12.51;   // R☉  (Espinoza-Arancibia & Pilecki 2025)
  const FALLBACK_COL  = '#ffe066';

  // Orbital RV amplitudes — circular orbit, i = 57°
  const R_SUN_KM  = 695700;
  const P_ORB_S   = 58.85 * 86400;
  const P_PULS_D  = 0.6900;
  const SIN_I     = Math.sin(57 * Math.PI / 180);
  const K1        = (2 * Math.PI * 42 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~30.3 km/s
  const K2        = (2 * Math.PI * 76 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~54.8 km/s
  const RV_THRESH = 40;    // km/s — ESPRESSO ΔRV separation requirement
  const RV_N      = 2400;

  // ESPRESSO pulsation quiescence window [Pilecki et al. 2022 + VLT proposal]
  // φ₁ ∈ [0.50, 0.70]: minimum-radius phase, v_turb ~ 3 km/s
  const PULS_MIN = 0.50;
  const PULS_MAX = 0.70;

  // HUD value colors — each spectrally distinct from the others and from
  // constraint green/red. Phase is dynamic (changes with constraint state).
  const COL_TEFF    = '#fdba74';   // warm amber
  const COL_RAD     = '#67e8f9';   // cyan
  const COL_OK      = '#86efac';   // constraint-met green
  const COL_WARN    = '#f87171';   // constraint-not-met red
  const COL_PHASE_DEFAULT = '#c4b5fd';  // soft violet when ESPRESSO off

  let data           = null;
  let currentMode    = 'orbital';
  let frameIdx       = 0;
  let maxR1          = 1;
  let showConstraints = false;

  // ── RV arrays ─────────────────────────────────────────────────────────────
  // rv1_orb, rv2: pure orbital sinusoids.  rvDelta uses these (not rv1+puls)
  // because the ESPRESSO ΔRV criterion reflects mean stellar separation, not
  // the pulsation-perturbed snapshot.  The previous code folded one pulsation
  // cycle uniformly onto the full orbit (posIdx = round(φ·N)), wrong by factor
  // P_orb/P_puls ≈ 85, inflating rvDelta near orbital nodes → always-green bug.
  // vpuls_arr: per-frame dr1/dt (km/s), used for Cepheid breathing glow.
  let rv1_orb   = [];
  let rv2       = [];
  let rvDelta   = [];
  let vpuls_arr = [];
  let vpuls_rms = 0;

  // ── DOM ───────────────────────────────────────────────────────────────────
  const simCanvas  = document.getElementById('simCanvas');
  const ctx        = simCanvas ? simCanvas.getContext('2d') : null;
  const preview    = document.getElementById('sim-preview');
  const plotUI     = document.getElementById('hud-plot-container');
  const plotLabel  = plotUI ? plotUI.querySelector('[data-plot-label]') : null;
  // The outer section element whose border we'll animate for constraint status
  const simSection = document.getElementById('cepheid-sim')
                     || (simCanvas && simCanvas.closest('section'))
                     || (simCanvas && simCanvas.parentElement);

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

  function isMobile() { return window.innerWidth <= 700; }

  // ── Simulation border: reflects constraint status ─────────────────────────
  // Instead of a ring on the star, the entire section border transitions
  // between green (constraint met) and red (not met) when overlay is active.
  let _lastBorderState = null;
  function updateSimBorder(constraintOk) {
    if (!simSection) return;
    const next = showConstraints ? (constraintOk ? 'ok' : 'warn') : 'off';
    if (next === _lastBorderState) return;   // skip redundant DOM writes
    _lastBorderState = next;
    if (!showConstraints) {
      simSection.style.boxShadow = '';
      return;
    }
    simSection.style.transition = 'box-shadow 0.35s ease';
    simSection.style.boxShadow  = constraintOk
      ? 'inset 0 0 0 2px rgba(134,239,172,0.55), 0 0 32px rgba(134,239,172,0.07)'
      : 'inset 0 0 0 2px rgba(239,68,68,0.40),  0 0 24px rgba(239,68,68,0.06)';
  }

  // ── Mobile responsive UI ──────────────────────────────────────────────────
  function setupResponsiveUI() {
    const uiLayer  = document.getElementById('ui-layer');
    const hudTable = document.getElementById('hud-table');
    const plotCont = document.getElementById('hud-plot-container');
    if (!uiLayer) return;

    const topRow     = uiLayer.querySelector(':scope > div');
    const leftPanel  = topRow ? topRow.querySelector(':scope > div') : null;
    const verboseEls = leftPanel
      ? leftPanel.querySelectorAll('p[style*="italic"], a[style*="border"]') : [];

    if (isMobile()) {
      uiLayer.style.padding = '1rem 1rem 0.75rem';
      if (topRow) topRow.style.gap = '0.5rem';
      if (leftPanel) {
        leftPanel.style.maxWidth = '55%';
        verboseEls.forEach(el => { el.style.display = 'none'; });
      }
      if (hudTable) {
        hudTable.style.width    = 'auto';
        hudTable.style.minWidth = '120px';
        hudTable.style.padding  = '8px 10px';
      }
      if (plotCont) plotCont.style.height = '90px';
    } else {
      uiLayer.style.padding = '2.5rem 2.5rem 2rem';
      if (topRow) topRow.style.gap = '1.5rem';
      if (leftPanel) {
        leftPanel.style.maxWidth = '420px';
        verboseEls.forEach(el => { el.style.display = ''; });
      }
      if (hudTable) {
        hudTable.style.width    = '250px';
        hudTable.style.minWidth = '';
        hudTable.style.padding  = '1.25rem 1.5rem';
      }
      // Reduced from 160 → 120px: gives more vertical space to the orbital canvas
      if (plotCont) plotCont.style.height = '120px';
    }

    // Static HUD colors (set once, survive re-renders)
    if (hud.teff) hud.teff.style.color = COL_TEFF;
    if (hud.rad)  hud.rad.style.color  = COL_RAD;
  }

  // ── ESPRESSO constraint toggle ────────────────────────────────────────────
  function injectConstraintToggle() {
    if (document.getElementById('btn-constraints')) return;
    const pill = document.querySelector('#ui-layer .btn-mode')?.parentElement;
    if (!pill) return;

    const btn = document.createElement('button');
    btn.id        = 'btn-constraints';
    btn.className = 'btn-mode';
    btn.textContent = 'ESPRESSO';

    const applyBtnStyle = () => {
      btn.style.background = showConstraints ? 'rgba(134,239,172,0.18)' : 'transparent';
      btn.style.color      = showConstraints ? '#86efac'                : 'rgba(255,255,255,0.38)';
      btn.style.boxShadow  = showConstraints ? 'inset 0 0 0 1px rgba(134,239,172,0.5)' : 'none';
    };
    btn.onclick = () => {
      showConstraints = !showConstraints;
      applyBtnStyle();
      if (!showConstraints) {
        _lastBorderState = null;
        if (simSection) simSection.style.boxShadow = '';
        if (hud.phase) hud.phase.style.color = COL_PHASE_DEFAULT;
      }
    };
    Object.assign(btn.style, {
      border: 'none', padding: '0.45rem 1.4rem', borderRadius: '999px',
      fontSize: '10.5px', cursor: 'pointer',
      transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
      letterSpacing: '0.1em', fontFamily: '\'JetBrains Mono\', monospace',
    });
    applyBtnStyle();
    pill.appendChild(btn);
  }

  // ── RV precomputation ─────────────────────────────────────────────────────
  function buildRV() {
    rv1_orb = []; rv2 = []; rvDelta = [];

    // Pure orbital sinusoids — correct basis for rvDelta / constraint shading
    for (let k = 0; k < RV_N; k++) {
      const phi = k / RV_N;
      const v1  =  K1 * Math.sin(2 * Math.PI * phi);
      const v2  = -K2 * Math.sin(2 * Math.PI * phi);
      rv1_orb.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));   // = (K1+K2)|sin φ|, zero at nodes
    }

    // Pulsation velocity per frame (breathing glow)
    const r1arr = data.physics_frames.r1;
    const N     = r1arr.length;
    const dt    = (data.metadata && data.metadata.dt)
      ? data.metadata.dt
      : (Array.isArray(data.physics_frames.t) && data.physics_frames.t.length > 1
          ? data.physics_frames.t[1] - data.physics_frames.t[0]
          : P_PULS_D / 120);
    const conv = R_SUN_KM / 86400;

    vpuls_arr = r1arr.map((_, i) => {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      return ((r1arr[next] - r1arr[prev]) / (2 * dt)) * conv;
    });
    vpuls_rms = Math.sqrt(vpuls_arr.reduce((s, v) => s + v * v, 0) / Math.max(1, N));
  }

  // ── init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const r = await fetch('data/master_data.json');
      data = await r.json();
      const p = data.physics_frames;
      for (const k of ['v_mag','x1','y1','z1','x2','y2','z2','r1'])
        if (!Array.isArray(p[k])) throw new Error(`Missing: physics_frames.${k}`);
      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));
      maxR1     = Math.max(...p.r1);

      buildRV();
      injectConstraintToggle();

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';

      window.addEventListener('resize', resize);
      resize();
      setMode('orbital');
      animate();
    } catch (e) { console.error('Cepheid engine init error:', e); }
  }

  // ── mode switching ────────────────────────────────────────────────────────
  window.setMode = function (mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;
    if (plotUI) plotUI.style.opacity = '1';
    if (plotLabel) plotLabel.textContent = (mode === 'orbital')
      ? 'ORBITAL RADIAL VELOCITIES · KM S\u207B\u00B9'
      : 'V-BAND LIGHT CURVE · PULSATION PHASE';

    document.querySelectorAll('.btn-mode').forEach(b => {
      if (b.id === 'btn-constraints') return;
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
    setupResponsiveUI();
  }

  // ── plot box in canvas-space pixels ──────────────────────────────────────
  function getPlotRect() {
    if (!plotUI) return null;
    const pr = plotUI.getBoundingClientRect();
    const sr = simCanvas.getBoundingClientRect();
    return { px: pr.left - sr.left, py: pr.top - sr.top, pw: pr.width, ph: pr.height };
  }

  // ── RV plot (orbital mode) ────────────────────────────────────────────────
  function drawRVPlot(frameI) {
    const box = getPlotRect();
    if (!box || !rv1_orb.length) return;
    const { px, py, pw, ph } = box;

    const rvI    = Math.round(frameI / data.physics_frames.x1.length * RV_N) % RV_N;
    const inset  = 18;
    const padTop = 22;
    const drawH  = ph - padTop - 8;
    const midY   = py + padTop + drawH / 2;
    const RVMAX  = (K1 + K2) * 1.15;
    const yScale = (drawH / 2) / RVMAX;
    const nPts   = 200;
    const step   = (pw - inset * 2) / nPts;
    const mobile = isMobile();

    ctx.save();

    // Background constraint shading
    if (showConstraints) {
      ctx.fillStyle = 'rgba(239,68,68,0.07)';
      ctx.fillRect(px + inset, py + padTop, pw - inset * 2, drawH);
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        if (rvDelta[idx] >= RV_THRESH) {
          ctx.fillStyle = 'rgba(134,239,172,0.13)';
          ctx.fillRect(px + pw / 2 + k * step, py + padTop, step + 0.5, drawH);
        }
      }
    } else {
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        if (rvDelta[idx] >= RV_THRESH) {
          ctx.fillStyle = 'rgba(134,239,172,0.06)';
          ctx.fillRect(px + pw / 2 + k * step, py + padTop, step + 0.5, drawH);
        }
      }
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px + inset, midY); ctx.lineTo(px + pw - inset, midY);
    ctx.stroke();

    // ΔRV threshold lines
    ctx.strokeStyle = showConstraints ? 'rgba(134,239,172,0.55)' : 'rgba(134,239,172,0.28)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    const half = (RV_THRESH / 2) * yScale;
    for (const yy of [midY - half, midY + half]) {
      ctx.beginPath(); ctx.moveTo(px + inset, yy); ctx.lineTo(px + pw - inset, yy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ±σ_puls envelope (shaded band around orbital curve)
    if (vpuls_rms > 0.5) {
      ctx.fillStyle = 'rgba(255,228,160,0.07)';
      ctx.beginPath();
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x = px + pw / 2 + k * step;
        const y = midY - (rv1_orb[idx] + vpuls_rms) * yScale;
        k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      for (let k = nPts / 2; k >= -nPts / 2; k--) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x = px + pw / 2 + k * step;
        const y = midY - (rv1_orb[idx] - vpuls_rms) * yScale;
        ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }

    // RV curves
    const drawCurve = (arr, color, width) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        const x = px + pw / 2 + k * step;
        const y = midY - arr[idx] * yScale;
        k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawCurve(rv1_orb, '#ffe4a0', 2.5);
    drawCurve(rv2,     '#f87171', 2.5);

    // Current-phase dots
    const curX = px + pw / 2;
    [[rv1_orb[rvI], '#ffe4a0'], [rv2[rvI], '#f87171']].forEach(([v, col]) => {
      ctx.beginPath(); ctx.arc(curX, midY - v * yScale, 4, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // Constraint status readout
    if (showConstraints) {
      const meetsRV  = rvDelta[rvI] >= RV_THRESH;
      const deltaVal = rvDelta[rvI].toFixed(0);
      ctx.font = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = meetsRV ? 'rgba(134,239,172,0.9)' : 'rgba(239,68,68,0.85)';
      ctx.fillText(
        meetsRV
          ? `\u0394RV\u2009=\u2009${deltaVal}\u2009km/s  \u2713  orbital window`
          : `\u0394RV\u2009=\u2009${deltaVal}\u2009km/s  \u2717  need \u226540\u2009km/s`,
        px + pw / 2, py + padTop + 2
      );
    }

    // Y-axis ticks
    const tickVals = mobile
      ? [Math.round(K1 + K2), 0, -Math.round(K1 + K2)]
      : [Math.round(K1 + K2), Math.round((K1 + K2) / 2), 0,
         -Math.round((K1 + K2) / 2), -Math.round(K1 + K2)];
    ctx.font = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const v of tickVals) {
      const ly = midY - v * yScale;
      if (ly > py + padTop + 4 && ly < py + ph - 6)
        ctx.fillText((v > 0 ? '+' : '') + v, px + inset, ly);
    }

    // Legend + attribution (desktop only)
    if (!mobile) {
      const lr = px + pw - inset;
      let   lt = py + padTop + 2;
      if (showConstraints) lt += 14;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.font = '9px \'JetBrains Mono\', monospace';
      ctx.fillStyle = '#ffe4a0';                ctx.fillText('Cepheid (orbital)', lr, lt);
      ctx.fillStyle = 'rgba(255,228,160,0.38)'; ctx.fillText(`\u00b1\u03c3 puls \u2248 ${vpuls_rms.toFixed(0)} km/s`, lr, lt + 12);
      ctx.fillStyle = '#f87171';                ctx.fillText('Companion', lr, lt + 24);
      ctx.fillStyle = showConstraints ? 'rgba(134,239,172,0.9)' : 'rgba(134,239,172,0.6)';
                                                ctx.fillText('\u0394RV \u2265 40 km/s', lr, lt + 36);
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.font = '8px \'JetBrains Mono\', monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('model — no observational RVs shown', px + inset, py + ph - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillText('circular orbit, i=57°, K\u2081\u224830.3 km/s, K\u2082\u224854.8 km/s — Espinoza-Arancibia & Pilecki 2025', px + inset, py + ph - 19);
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
    const drawH    = ph - padTop - 8;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    const midMag   = (bounds.minV + bounds.maxV) / 2;
    const nPts     = 120;
    const step     = (pw - inset * 2) / nPts;
    const N        = magArr.length;
    const mobile   = isMobile();

    ctx.save();

    if (showConstraints) {
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx   = (frameI + Math.round(k) + N) % N;
        const phase = idx / N;
        const inWin = phase >= PULS_MIN && phase <= PULS_MAX;
        ctx.fillStyle = inWin ? 'rgba(134,239,172,0.13)' : 'rgba(239,68,68,0.06)';
        ctx.fillRect(px + pw / 2 + k * step, py, step + 0.5, ph);
      }

      // Boundary markers
      [PULS_MIN, PULS_MAX].forEach(tp => {
        const kOff = ((Math.round(tp * N) - frameI + N) % N);
        const kC   = kOff > N / 2 ? kOff - N : kOff;
        if (Math.abs(kC) > nPts / 2) return;
        const x = px + pw / 2 + kC * step;
        ctx.strokeStyle = 'rgba(134,239,172,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, py + 14); ctx.lineTo(x, py + ph - 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(134,239,172,0.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = '8px \'JetBrains Mono\', monospace';
        ctx.fillText(`\u03c6=${tp.toFixed(2)}`, x, py + 16);
      });

      // Phase status
      const cp    = frameI / N;
      const inWin = cp >= PULS_MIN && cp <= PULS_MAX;
      ctx.font = `${mobile ? 8 : 9}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = inWin ? 'rgba(134,239,172,0.9)' : 'rgba(239,68,68,0.85)';
      ctx.fillText(
        inWin
          ? `\u03c6\u2081\u2009=\u2009${cp.toFixed(2)}  \u2713  quiescent window`
          : `\u03c6\u2081\u2009=\u2009${cp.toFixed(2)}  \u2717  outside [0.50\u20130.70]`,
        px + pw / 2, py + 2
      );
    }

    // Light curve
    ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (let k = -nPts / 2; k <= nPts / 2; k++) {
      const idx = (frameI + k + N) % N;
      const x   = px + pw / 2 + k * step;
      const y   = py + padTop + drawH / 2 - ((magArr[idx] - midMag) * (drawH / magRange) * 0.72);
      k === -nPts / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current-phase dot
    const curY = py + padTop + drawH / 2 - ((magArr[frameI] - midMag) * (drawH / magRange) * 0.72);
    ctx.beginPath(); ctx.arc(px + pw / 2, curY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#60a5fa'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();

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

    // ── Constraint evaluation ─────────────────────────────────────────────
    const rvI       = Math.round(i / p.x1.length * RV_N) % RV_N;
    const orbOk     = rvDelta[rvI] >= RV_THRESH;
    const pulsPhase = i / p.r1.length;
    const pulsOk    = pulsPhase >= PULS_MIN && pulsPhase <= PULS_MAX;
    const constraintOk = currentMode === 'orbital' ? orbOk : pulsOk;

    // ── Border ────────────────────────────────────────────────────────────
    updateSimBorder(constraintOk);

    // ── Zoom + center ─────────────────────────────────────────────────────
    // Increased zoom factors + adjusted cy to use space freed by shorter plot panel.
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      zoom = (Math.min(w, h) * (mobile ? 0.11 : 0.17)) / maxR1;
      cx   = w / 2;
      cy   = mobile ? h * 0.22 : h * 0.30;
    } else {
      zoom = (Math.min(w, h) * (mobile ? 0.23 : 0.40)) / bounds.a2;
      cx   = mobile ? w * 0.44 : w / 2;
      cy   = mobile ? h * 0.36 : h * 0.43;
    }

    // ── Orbital ellipses ──────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const inc = 0.545;
      ctx.save();
      ctx.lineWidth = mobile ? 1.5 : 2; ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(248,113,113,0.65)';
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*inc, 0, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = 'rgba(196,162,88,0.65)';
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a1*zoom, bounds.a1*zoom*inc, 0, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();

      // Barycenter crosshair
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx-5,cy); ctx.lineTo(cx+5,cy); ctx.moveTo(cx,cy-5); ctx.lineTo(cx,cy+5);
      ctx.stroke(); ctx.restore();

      // ESPRESSO: color the Cepheid orbit arc green/red per ΔRV
      if (showConstraints) {
        const a1px = bounds.a1 * zoom;
        const b1px = bounds.a1 * zoom * inc;
        ctx.save(); ctx.lineWidth = 3.5;
        for (let k = 0; k < 360; k++) {
          const phi1 = (k     / 360) * Math.PI * 2;
          const phi2 = ((k+1) / 360) * Math.PI * 2;
          const idx  = Math.round((k / 360) * RV_N) % RV_N;
          ctx.beginPath();
          ctx.strokeStyle = rvDelta[idx] >= RV_THRESH ? 'rgba(134,239,172,0.65)' : 'rgba(239,68,68,0.30)';
          ctx.ellipse(cx, cy, a1px, b1px, 0, phi1, phi2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Draw stars ────────────────────────────────────────────────────────
    // PULSATION VISUALIZATION: breathing glow.
    // shadowBlur scales with |vpuls| so the star visually "breathes" —
    // glow is strongest at peak expansion/contraction velocity, minimal
    // at the turning points. No extra geometry needed.
    const vpNow     = vpuls_arr[i % Math.max(1, vpuls_arr.length)] || 0;
    const vpNorm    = vpuls_rms > 0 ? Math.min(1, Math.abs(vpNow) / (vpuls_rms * 2)) : 0;

    const drawStar = (sx, sy, r, col, isPulsating) => {
      const spx = cx + sx * zoom, spy = cy + sy * zoom;
      const pr  = Math.max(2, r * zoom);
      ctx.save();
      ctx.fillStyle = col || FALLBACK_COL;
      // Base glow always on; pulsation adds up to 2× extra blur
      ctx.shadowBlur  = pr * (isPulsating ? (1.2 + vpNorm * 2.2) : 1.0);
      ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(spx, spy, pr, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    };

    if (z1 < z2) {
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
    }

    // ── Star labels — brighter, hidden on mobile ──────────────────────────
    if (currentMode !== 'pulsation' && !mobile) {
      const lx1  = cx + x1 * zoom, ly1 = cy + y1 * zoom;
      const lx2  = cx + x2 * zoom, ly2 = cy + y2 * zoom;
      const dist = Math.hypot(lx1 - lx2, ly1 - ly2);
      const minD = (r1 + COMPANION_RAD) * zoom * 2.2;
      // Minimum alpha 0.72 — labels are always legible when stars are separated
      const alpha = Math.min(1, Math.max(0.72, (dist - minD) / (minD * 0.6)));
      if (dist > minD * 0.4) {
        ctx.save();
        ctx.font = '11px \'JetBrains Mono\', monospace';
        ctx.textBaseline = 'middle'; ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffe4a0';
        ctx.fillText('Cepheid',   lx1 + r1 * zoom + 8,             ly1 - r1 * zoom * 0.5);
        ctx.fillStyle = '#f87171';
        ctx.fillText('Companion', lx2 + COMPANION_RAD * zoom + 8,   ly2 - COMPANION_RAD * zoom * 0.5);
        ctx.globalAlpha = 1; ctx.restore();
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (hud.mag)  hud.mag.innerText  = mag.toFixed(1);
    if (hud.teff) hud.teff.innerText = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)  hud.rad.innerText  = `${r1.toFixed(1)} R\u2609`;

    // φ_orb: color shifts green↔red with constraint state when overlay is on
    if (hud.phase) {
      hud.phase.innerText  = (i / p.x1.length).toFixed(3);
      hud.phase.style.color = showConstraints
        ? (constraintOk ? COL_OK : COL_WARN)
        : COL_PHASE_DEFAULT;
    }

    requestAnimationFrame(animate);
  }

  init();
})();
