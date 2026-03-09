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
  const RV_THRESH    = 40;    // km/s — ESPRESSO ΔRV separation requirement
  const RV_N         = 2400;
  // Pulsation cycles per orbit: 58.85 d / 0.690 d ≈ 85.3.
  // Converts frame index i (0…N-1, one full orbit) to pulsation phase:
  //   φ_puls(i) = (i / N × PULS_PER_ORB) % 1
  const PULS_PER_ORB = P_ORB_S / (P_PULS_D * 86400);   // ≈ 85.3

  // ESPRESSO pulsation quiescence window [Pilecki et al. 2022 + VLT proposal]
  const PULS_MIN = 0.50;
  const PULS_MAX = 0.70;

  // HUD value colors
  const COL_TEFF          = '#fdba74';
  const COL_RAD           = '#67e8f9';
  const COL_OK            = '#86efac';
  const COL_WARN          = '#f87171';
  const COL_PHASE_DEFAULT = '#c4b5fd';

  // ── Observational RV data — Pilecki et al. 2022 (ApJ 940 L48), Table B3 ─
  // Columns: [HJD − 2450000, RVel1_abs, e_RVel1, RVel2_abs, e_RVel2]
  // Systemic velocity γ = 237.0 km/s; orbital T₀ = HJD 2459549.0 (phase=0 ascending node)
  // These are absolute heliocentric RVs from UVES and MIKE spectrographs.
  const OBS_P_ORB  = 58.85;      // days
  const OBS_T0     = 9549.0;     // HJD − 2450000 at φ = 0 (ascending node)
  const OBS_GAM    = 237.0;      // km/s systemic (barycentric) velocity
  const OBS_DATA = [
    // [hjd_m2450000, rv1_abs, e_rv1, rv2_abs, e_rv2]
    [9510.80498, 271.408, 0.148, 195.142, 0.397],
    [9541.61089, 222.409, 0.113, 281.004, 0.479],
    [9556.62074, 246.214, 0.124, 207.792, 0.542],
    [9558.63776, 251.270, 0.128, 200.067, 0.553],
    [9563.71814, 280.680, 0.128, 188.181, 0.397],
    [9566.72085, 261.271, 0.183, 189.594, 0.514],
    [9579.64289, 255.698, 0.292, 239.801, 0.335],
    [9589.71976, 206.661, 0.109, 285.529, 0.421],
    [9604.62569, 231.395, 0.159, 263.152, 0.546],
  ];

  let data           = null;
  let currentMode    = 'orbital';
  let frameIdx       = 0;
  let maxR1          = 1;
  let showConstraints = false;

  // ── RV arrays ─────────────────────────────────────────────────────────────
  // rv1_orb, rv2: pure orbital sinusoids.
  // rvDelta uses pure orbital (not rv1+puls) because the ESPRESSO ΔRV criterion
  // reflects mean stellar separation, not the pulsation-perturbed snapshot.
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
  const simSection = document.getElementById('cepheid-sim')
                     || (simCanvas && simCanvas.closest('section'))
                     || (simCanvas && simCanvas.parentElement);

  const hud = {
    mag:        document.getElementById('hud-mag'),
    teff:       document.getElementById('hud-teff'),
    rad:        document.getElementById('hud-rad'),
    phase:      document.getElementById('hud-phase'),
    phaseLabel: document.getElementById('hud-phase-label'),
  };

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  function safeGet(arr, idx, fb) {
    return (arr && arr[idx] !== undefined) ? arr[idx] : fb;
  }

  function isMobile() { return window.innerWidth <= 700; }

  // ── Simulation border: reflects ESPRESSO constraint status ────────────────
  let _lastBorderState = null;
  function updateSimBorder(constraintOk) {
    if (!simSection) return;
    const next = showConstraints ? (constraintOk ? 'ok' : 'warn') : 'off';
    if (next === _lastBorderState) return;
    _lastBorderState = next;
    if (!showConstraints) { simSection.style.boxShadow = ''; return; }
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
      if (topRow)     topRow.style.gap    = '0.5rem';
      if (leftPanel)  leftPanel.style.maxWidth = '55%';
      verboseEls.forEach(el => { el.style.display = 'none'; });
      if (hudTable) {
        hudTable.style.width    = 'auto';
        hudTable.style.minWidth = '120px';
        hudTable.style.padding  = '8px 10px';
      }
      if (plotCont) plotCont.style.height = '90px';
    } else {
      uiLayer.style.padding = '2.5rem 2.5rem 2rem';
      if (topRow)     topRow.style.gap   = '1.5rem';
      if (leftPanel)  leftPanel.style.maxWidth = '420px';
      verboseEls.forEach(el => { el.style.display = ''; });
      if (hudTable) {
        hudTable.style.width    = '250px';
        hudTable.style.minWidth = '';
        hudTable.style.padding  = '1.25rem 1.5rem';
      }
      if (plotCont) plotCont.style.height = '120px';
    }

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
        if (hud.phase)  hud.phase.style.color = COL_PHASE_DEFAULT;
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

    // ── Correct RV phase convention ───────────────────────────────────────
    // Position: x1(φ) = a1·cos(2πφ),  z1(φ) = −a1·sin(2πφ)·sin(i)
    // Radial velocity = dz/dt:
    //   dz1/dt = −a1·(2π/P)·sin(i)·cos(2πφ)  = −K1·cos(2πφ)
    //   dz2/dt = +K2·cos(2πφ)                  (companion, opposite sign)
    //
    // Consequence: at φ=0 (stars on opposite sides of screen, max x-separation)
    //   rv1 = −K1 (Cepheid approaching), rv2 = +K2 (Companion receding)  → largest |ΔRV|
    // At φ=0.25 (stars at conjunction/opposition along line of sight):
    //   rv1 = rv2 = 0  (moving perpendicular to line of sight)
    //
    // The old sin formula gave rv=0 at φ=0, which contradicted the on-screen
    // positions and produced "same point" dots whenever stars were side-by-side.
    for (let k = 0; k < RV_N; k++) {
      const phi = k / RV_N;
      const v1  = -K1 * Math.cos(2 * Math.PI * phi);   // Cepheid
      const v2  = +K2 * Math.cos(2 * Math.PI * phi);   // Companion
      rv1_orb.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));  // = (K1+K2)|cos φ|, max when stars face each other ✓
    }

    // Pulsation velocity per frame (breathing glow + σ envelope)
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
    if (plotUI)    plotUI.style.opacity = '1';
    if (plotLabel) plotLabel.textContent = (mode === 'orbital')
      ? 'ORBITAL RADIAL VELOCITIES · KM S\u207B\u00B9'
      : 'V-BAND LIGHT CURVE · PULSATION PHASE';
    // Update HUD phase row label to match the phase being displayed
    if (hud.phaseLabel) hud.phaseLabel.textContent = (mode === 'orbital')
      ? '\u03c6\u1d52\u1d3f\u1d47 orbital'
      : '\u03c6\u2081 pulsation';

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

  // ── Wrap-safe moveTo/lineTo helper ────────────────────────────────────────
  // When iterating a circular array of length N centered on some offset,
  // the index wraps from N-1 back to 0. If the data is not exactly periodic
  // at that boundary, a raw ctx.lineTo draws a spurious diagonal slash.
  // Use this helper: call moveTo at the first point AND at every wrap.
  function circPt(ctx, x, y, isFirst, idx, prevIdx) {
    const isWrap = !isFirst && idx < prevIdx;
    isFirst || isWrap ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
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

    // ── Background constraint shading ─────────────────────────────────────
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

    // ── Zero line ─────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px + inset, midY); ctx.lineTo(px + pw - inset, midY);
    ctx.stroke();

    // ── ΔRV threshold lines ───────────────────────────────────────────────
    ctx.strokeStyle = showConstraints ? 'rgba(134,239,172,0.55)' : 'rgba(134,239,172,0.28)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    const half = (RV_THRESH / 2) * yScale;
    for (const yy of [midY - half, midY + half]) {
      ctx.beginPath(); ctx.moveTo(px + inset, yy); ctx.lineTo(px + pw - inset, yy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── ±σ_puls envelope (shaded band around orbital Cepheid curve) ───────
    // FIX: added wrap detection (circPt) so the band closure doesn't slash
    if (vpuls_rms > 0.5) {
      ctx.fillStyle = 'rgba(255,228,160,0.07)';
      ctx.beginPath();
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) - 1 + RV_N) % RV_N;
        const x = px + pw / 2 + k * step;
        const y = midY - (rv1_orb[idx] + vpuls_rms) * yScale;
        circPt(ctx, x, y, k === -nPts / 2, idx, prev);
      }
      for (let k = nPts / 2; k >= -nPts / 2; k--) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) + 1 + RV_N) % RV_N;  // reversed direction
        const x = px + pw / 2 + k * step;
        const y = midY - (rv1_orb[idx] - vpuls_rms) * yScale;
        circPt(ctx, x, y, k === nPts / 2, idx, prev);
      }
      ctx.closePath(); ctx.fill();
    }

    // ── RV curves — wrap-safe ─────────────────────────────────────────────
    // FIX: use circPt so that when the circular buffer index wraps from
    // RV_N-1 back to 0, a moveTo is used instead of a lineTo. Without this,
    // any discontinuity at the boundary (even a fraction of a km/s for
    // the pure sinusoids near φ=0 due to floating-point rounding) draws a
    // spurious diagonal line across the entire plot width.
    const drawCurve = (arr, color, width) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) - 1 + RV_N) % RV_N;
        const x    = px + pw / 2 + k * step;
        const y    = midY - arr[idx] * yScale;
        circPt(ctx, x, y, k === -nPts / 2, idx, prev);
      }
      ctx.stroke();
    };
    drawCurve(rv1_orb, '#ffe4a0', 2.5);
    drawCurve(rv2,     '#f87171', 2.5);

    // ── Current-phase dots ────────────────────────────────────────────────
    const curX = px + pw / 2;
    [[rv1_orb[rvI], '#ffe4a0'], [rv2[rvI], '#f87171']].forEach(([v, col]) => {
      ctx.beginPath(); ctx.arc(curX, midY - v * yScale, 4, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // ── Observational RV data points (Pilecki et al. 2022) ────────────────
    // Each observation is placed at its orbital phase relative to the current
    // animation phase (rvI). Points within the visible window scroll with
    // the animation, showing where on the orbit each measurement was taken.
    OBS_DATA.forEach(([hjd, rv1_abs, e1, rv2_abs, e2]) => {
      const phi    = ((hjd - OBS_T0) % OBS_P_ORB + OBS_P_ORB) % OBS_P_ORB / OBS_P_ORB;
      const obsIdx = Math.round(phi * RV_N) % RV_N;
      // kOff: how many steps this observation is from the center of the display
      let kOff = (obsIdx - rvI + RV_N) % RV_N;
      if (kOff > RV_N / 2) kOff -= RV_N;
      if (Math.abs(kOff) > nPts / 2) return;   // off screen, skip

      const ox = px + pw / 2 + kOff * step;
      const v1r = rv1_abs - OBS_GAM;
      const v2r = rv2_abs - OBS_GAM;

      // Draw pairs: Cepheid (gold circle) and Companion (red circle)
      const drawObsPt = (vRel, eV, col) => {
        const oy  = midY - vRel * yScale;
        const ey  = eV * yScale;
        // Error bar (too small to see for these tiny formal errors, but drawn for rigor)
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(ox, oy - ey); ctx.lineTo(ox, oy + ey);
        ctx.stroke();
        // Data point dot
        ctx.beginPath(); ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle   = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.85;
        ctx.fill(); ctx.stroke();
        ctx.restore();
      };
      drawObsPt(v1r, e1, '#ffe4a0');
      drawObsPt(v2r, e2, '#f87171');
    });

    // ── Constraint status readout ─────────────────────────────────────────
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

    // ── Y-axis ticks ──────────────────────────────────────────────────────
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

    // ── Legend + attribution (desktop only) ───────────────────────────────
    if (!mobile) {
      const lr = px + pw - inset;
      let   lt = py + padTop + 2;
      if (showConstraints) lt += 14;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.font = '9px \'JetBrains Mono\', monospace';
      ctx.fillStyle = '#ffe4a0';                ctx.fillText('Cepheid (orbital model)', lr, lt);
      ctx.fillStyle = 'rgba(255,228,160,0.38)'; ctx.fillText(`\u00b1\u03c3 puls \u2248 ${vpuls_rms.toFixed(0)} km/s`, lr, lt + 12);
      ctx.fillStyle = '#f87171';                ctx.fillText('Companion (orbital model)', lr, lt + 24);
      ctx.fillStyle = showConstraints ? 'rgba(134,239,172,0.9)' : 'rgba(134,239,172,0.6)';
                                                ctx.fillText('\u0394RV \u2265 40 km/s', lr, lt + 36);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('\u2022 obs. RVs — Pilecki et al. 2022', lr, lt + 48);
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.font = '8px \'JetBrains Mono\', monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('model — circular orbit, i=57°, K\u2081\u224830.3 km/s, K\u2082\u224854.8 km/s', px + inset, py + ph - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillText('Espinoza-Arancibia & Pilecki 2025 · Pilecki et al. 2022', px + inset, py + ph - 19);
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

    // Helper: pulsation phase for a given frame index
    const pulsP = idx => (idx / N * PULS_PER_ORB) % 1;

    ctx.save();

    if (showConstraints) {
      // Shade each column by whether its pulsation phase is in the quiescent window
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx   = (frameI + Math.round(k) + N) % N;
        const inWin = pulsP(idx) >= PULS_MIN && pulsP(idx) <= PULS_MAX;
        ctx.fillStyle = inWin ? 'rgba(134,239,172,0.13)' : 'rgba(239,68,68,0.06)';
        ctx.fillRect(px + pw / 2 + k * step, py, step + 0.5, ph);
      }

      // Boundary markers: scan visible window for φ-crossings at 0.50 and 0.70.
      // Because there are ~85 pulsation cycles per orbit, each ~42-frame span
      // of the visible window (120 frames wide) covers ~1.4 pulsation cycles
      // and may contain 2–4 boundary crossings.
      let prevInWin = pulsP((frameI - nPts / 2 + N) % N) >= PULS_MIN
                   && pulsP((frameI - nPts / 2 + N) % N) <= PULS_MAX;
      for (let k = -nPts / 2 + 1; k <= nPts / 2; k++) {
        const idx   = (frameI + Math.round(k) + N) % N;
        const inWin = pulsP(idx) >= PULS_MIN && pulsP(idx) <= PULS_MAX;
        if (inWin !== prevInWin) {
          const x = px + pw / 2 + k * step;
          ctx.strokeStyle = 'rgba(134,239,172,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(x, py + 14); ctx.lineTo(x, py + ph - 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        prevInWin = inWin;
      }

      // Phase status — use real pulsation phase of the current frame
      const cp    = pulsP(frameI);
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

    // Light curve — FIX: wrap detection so Fourier-fit periodicity seam
    // (frame N-1 → frame 0) doesn't produce a spurious diagonal stroke.
    ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (let k = -nPts / 2; k <= nPts / 2; k++) {
      const idx  = (frameI + Math.round(k)     + N) % N;
      const prev = (frameI + Math.round(k) - 1 + N) % N;
      const x    = px + pw / 2 + k * step;
      const y    = py + padTop + drawH / 2 - ((magArr[idx] - midMag) * (drawH / magRange) * 0.72);
      circPt(ctx, x, y, k === -nPts / 2, idx, prev);
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
    const N      = p.x1.length;
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
    const rvI        = Math.round(i / N * RV_N) % RV_N;
    const orbOk      = rvDelta[rvI] >= RV_THRESH;
    // Real pulsation phase: the data spans one full orbit containing ~85.3
    // pulsation cycles.  i/N gives orbital phase (0–1), not pulsation phase.
    const pulsPhase  = (i / N * PULS_PER_ORB) % 1;
    const pulsOk     = pulsPhase >= PULS_MIN && pulsPhase <= PULS_MAX;
    const constraintOk = currentMode === 'orbital' ? orbOk : pulsOk;

    updateSimBorder(constraintOk);

    // ── Zoom + center ─────────────────────────────────────────────────────
    // On mobile the section is now 180vh (CSS), giving much more vertical room.
    // cy values are calibrated so stars sit in the clear middle band between
    // the top UI stack and the bottom plot+buttons stack.
    let zoom, cx, cy;
    if (currentMode === 'pulsation') {
      zoom = (Math.min(w, h) * (mobile ? 0.11 : 0.17)) / maxR1;
      cx   = w / 2;
      cy   = mobile ? h * 0.50 : h * 0.30;
    } else {
      zoom = (Math.min(w, h) * (mobile ? 0.23 : 0.40)) / bounds.a2;
      cx   = mobile ? w * 0.44 : w / 2;
      cy   = mobile ? h * 0.52 : h * 0.43;
    }

    // ── Orbital ellipses ──────────────────────────────────────────────────
    if (currentMode !== 'pulsation') {
      const inc = 0.545; // cos 57°
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

      // ── ESPRESSO orbit arc: colored by actual ΔRV per orbital phase ──────
      // FIX: the previous code colored arc segments by VISUAL ANGLE (k/360),
      // which doesn't match the RV phase because inclination projects y ≠ z.
      // The correct approach: iterate the actual position-frame data and draw
      // each segment colored by the corresponding rvDelta. Frame j maps to
      // rvDelta[round(j/N * RV_N)] — the same mapping used everywhere else,
      // so the coloring is consistent with the RV plot and constraint readout.
      if (showConstraints) {
        ctx.save(); ctx.lineWidth = 3.5;
        for (let j = 0; j < N; j++) {
          const jNext = (j + 1) % N;
          const rvIdx = Math.round(j / N * RV_N) % RV_N;
          ctx.beginPath();
          ctx.strokeStyle = rvDelta[rvIdx] >= RV_THRESH
            ? 'rgba(134,239,172,0.65)'
            : 'rgba(239,68,68,0.30)';
          ctx.moveTo(cx + p.x1[j]     * zoom, cy + p.y1[j]     * zoom);
          ctx.lineTo(cx + p.x1[jNext] * zoom, cy + p.y1[jNext] * zoom);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Draw stars ────────────────────────────────────────────────────────
    // Breathing glow: shadowBlur scales with |vpuls| so the Cepheid visually
    // "breathes" — glow peaks at max expansion/contraction velocity.
    const vpNow  = vpuls_arr[i % Math.max(1, vpuls_arr.length)] || 0;
    const vpNorm = vpuls_rms > 0 ? Math.min(1, Math.abs(vpNow) / (vpuls_rms * 2)) : 0;

    const drawStar = (sx, sy, r, col, isPulsating) => {
      const spx = cx + sx * zoom, spy = cy + sy * zoom;
      const pr  = Math.max(2, r * zoom);
      ctx.save();
      ctx.fillStyle  = col || FALLBACK_COL;
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

    // ── Star labels — desktop only ────────────────────────────────────────
    if (currentMode !== 'pulsation' && !mobile) {
      const lx1  = cx + x1 * zoom, ly1 = cy + y1 * zoom;
      const lx2  = cx + x2 * zoom, ly2 = cy + y2 * zoom;
      const dist = Math.hypot(lx1 - lx2, ly1 - ly2);
      const minD = (r1 + COMPANION_RAD) * zoom * 2.2;
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

    if (hud.phase) {
      // Show pulsation phase in pulsation mode (cycles ~85× per orbit),
      // orbital phase in orbital mode.
      const phaseVal = currentMode === 'pulsation'
        ? pulsPhase          // already computed as (i/N × PULS_PER_ORB) % 1
        : (i / N);
      hud.phase.innerText   = phaseVal.toFixed(3);
      hud.phase.style.color = showConstraints
        ? (constraintOk ? COL_OK : COL_WARN)
        : COL_PHASE_DEFAULT;
    }

    requestAnimationFrame(animate);
  }

  init();
})();
