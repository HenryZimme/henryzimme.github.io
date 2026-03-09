(function () {
  // ── Config ────────────────────────────────────────────────────────────────
  const MODES         = new Set(['orbital', 'pulsation']);
  const COMPANION_RAD = 12.51;   // R☉  (Espinoza-Arancibia & Pilecki 2025)
  const FALLBACK_COL  = '#ffe066';

  // teff -> hex color: maps 4000K (orange #ff8c00) to 8000K (near-white #f4f6ff)
  // used as fallback when physics_frames.color1 is absent or non-string
  function teff_to_js_color(teff) {
    const t = Math.max(3000, Math.min(teff || 6490, 10000));
    const f = Math.max(0, Math.min(1, (t - 4000) / 4000));
    const r = Math.round(0xff + (0xf4 - 0xff) * f);
    const g = Math.round(0x8c + (0xf6 - 0x8c) * f);
    const b = Math.round(0x00 + (0xff - 0x00) * f);
    return `rgb(${r},${g},${b})`;
  }

  // Orbital RV amplitudes — circular orbit, i = 57°
  const R_SUN_KM  = 695700;
  const P_ORB_S   = 58.85 * 86400;
  const P_PULS_D  = 0.6900;
  const SIN_I     = Math.sin(57 * Math.PI / 180);
  const K1        = (2 * Math.PI * 42 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~30.3 km/s
  const K2        = (2 * Math.PI * 76 * R_SUN_KM * SIN_I) / P_ORB_S;  // ~54.8 km/s
  const RV_THRESH    = 40;    // km/s — ESPRESSO ΔRV separation requirement
  const RV_N         = 2400;

  // ESPRESSO pulsation quiescence window [Pilecki et al. 2022 + VLT proposal]
  // φ₁ ∈ [0.50, 0.70]: minimum-radius phase, v_turb ~ 3 km/s.
  // We use i/N as the pulsation phase (0→1 per animation loop); this is
  // the same convention used in master_data.json and the original engine.
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
  let rv1_orb     = [];
  let rv2         = [];
  let rvDelta     = [];
  let vpuls_arr   = [];
  let vpuls_rms   = 0;
  // Pulsation phase per animation frame — precomputed from master_data.json t[] array.
  // Python: puls_phase_real = (times % p_puls) / p_puls  — cycles ~85× per orbit.
  // NOT i/N (which cycles once per orbit and is the wrong physical quantity).
  let pulsPhaseArr = [];

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

  // ── Layout: apply mobile or desktop styles by directly overriding inline styles ──
  // CSS !important battles with inline styles are unreliable; JS wins by writing
  // element.style.* which IS the inline style.  This runs on init and on resize.
  function applyLayout() {
    const mob     = isMobile();
    const uiLayer = document.getElementById('ui-layer');
    const simTop  = document.getElementById('sim-top');
    const simBot  = document.getElementById('sim-bottom');
    const zone    = document.getElementById('sim-canvas-zone');
    const hudTbl  = document.getElementById('hud-table');
    const plotCnt = document.getElementById('hud-plot-container');
    const descDiv = simTop ? simTop.querySelector('div') : null;
    const italicP = descDiv  ? descDiv.querySelector('.sim-desc-italic') : null;

    if (mob) {
      // ── MOBILE: full HTML-restructure approach ──────────────────────────
      // canvas moves into document flow as a flex item inside #ui-layer.
      // section height is driven by stacked content — no overlap possible.

      if (simSection) {
        simSection.style.height   = 'auto';
        simSection.style.overflow = 'visible';
      }

      // ui-layer: relative, flex column, stacks children top-to-bottom
      if (uiLayer) {
        uiLayer.style.position       = 'relative';
        uiLayer.style.top            = 'auto';
        uiLayer.style.right          = 'auto';
        uiLayer.style.bottom         = 'auto';
        uiLayer.style.left           = 'auto';
        uiLayer.style.justifyContent = 'flex-start';
        uiLayer.style.gap            = '0';
        uiLayer.style.padding        = '1.1rem 0.9rem 1.25rem';
        uiLayer.style.width          = '100%';
        uiLayer.style.boxSizing      = 'border-box';
      }

      // canvas: pulled into flex flow as a block item (not absolute).
      // height:65vw gives the star area explicit dimension.
      if (simCanvas) {
        simCanvas.style.position   = 'relative';
        simCanvas.style.width      = '100%';
        simCanvas.style.height     = '65vw';
        simCanvas.style.flexShrink = '0';
        simCanvas.style.inset      = '';
        simCanvas.style.margin     = '0.5rem 0';
      }

      // zone spacer is irrelevant on mobile (canvas is the star area now)
      if (zone) zone.style.display = 'none';

      // sim-top: column layout, description over HUD
      if (simTop) {
        simTop.style.flexDirection  = 'column';
        simTop.style.alignItems     = 'stretch';
        simTop.style.gap            = '0.6rem';
        simTop.style.justifyContent = '';
        simTop.style.marginBottom   = '0';
      }

      // hide long italic paragraph on mobile — too much text
      if (italicP) italicP.style.display = 'none';
      if (descDiv) descDiv.style.maxWidth = '100%';

      // HUD table: full width
      if (hudTbl) {
        hudTbl.style.width      = '100%';
        hudTbl.style.flexShrink = '0';
        hudTbl.style.boxSizing  = 'border-box';
        hudTbl.style.padding    = '0.7rem 0.9rem';
      }

      // bottom block: full width
      if (simBot) {
        simBot.style.width      = '100%';
        simBot.style.alignItems = 'stretch';
        simBot.style.marginTop  = '0';
      }

      // plot shorter on mobile
      if (plotCnt) {
        plotCnt.style.maxWidth = '100%';
        plotCnt.style.height   = '110px';
      }

    } else {
      // ── DESKTOP: restore inline defaults ───────────────────────────────

      if (simSection) {
        simSection.style.height   = '100vh';
        simSection.style.overflow = 'hidden';
      }

      // canvas: back to position:absolute filling the section
      if (simCanvas) {
        simCanvas.style.position   = 'absolute';
        simCanvas.style.inset      = '0';
        simCanvas.style.width      = '100%';
        simCanvas.style.height     = '100%';
        simCanvas.style.flexShrink = '';
        simCanvas.style.margin     = '';
      }

      // restore zone spacer (desktop flex grow between sim-top and sim-bottom)
      if (zone) zone.style.display = '';

      if (uiLayer) {
        uiLayer.style.position       = 'absolute';
        uiLayer.style.top            = '0';
        uiLayer.style.right          = '0';
        uiLayer.style.bottom         = '0';
        uiLayer.style.left           = '0';
        uiLayer.style.justifyContent = 'space-between';
        uiLayer.style.gap            = '';
        uiLayer.style.padding        = '2.5rem 2.5rem 2rem';
        uiLayer.style.width          = '';
        uiLayer.style.boxSizing      = '';
      }

      if (simTop) {
        simTop.style.flexDirection  = '';
        simTop.style.alignItems     = 'flex-start';
        simTop.style.gap            = '1.5rem';
        simTop.style.justifyContent = 'space-between';
        simTop.style.marginBottom   = '';
      }

      if (italicP) italicP.style.display = '';
      if (descDiv) descDiv.style.maxWidth = '420px';

      if (hudTbl) {
        hudTbl.style.width      = '250px';
        hudTbl.style.flexShrink = '0';
        hudTbl.style.boxSizing  = '';
        hudTbl.style.padding    = '1.25rem 1.5rem';
      }

      if (simBot) {
        simBot.style.width      = '';
        simBot.style.alignItems = 'center';
        simBot.style.marginTop  = '';
      }

      if (plotCnt) {
        plotCnt.style.maxWidth = '820px';
        plotCnt.style.height   = '160px';
      }
    }

    // HUD colors — always
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
      if (showConstraints && data && pulsPhaseArr.length) {
        // jump to first frame where pulsPhase in quiescent window AND (orbital) ΔRV ≥ threshold
        const N = data.physics_frames.r1.length;
        let jumpIdx = -1;
        for (let j = 0; j < N; j++) {
          const ph = pulsPhaseArr[j];
          if (ph >= PULS_MIN && ph <= PULS_MAX) {
            if (currentMode !== 'orbital') { jumpIdx = j; break; }
            const ri = Math.round(j / N * RV_N) % RV_N;
            if (rvDelta[ri] >= RV_THRESH) { jumpIdx = j; break; }
          }
        }
        if (jumpIdx >= 0) {
          frameIdx = jumpIdx;
          _lastBorderState = null;   // force border repaint on next frame
        }
      }
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
    rv1_orb = []; rv2 = []; rvDelta = []; pulsPhaseArr = [];

    // ── Correct RV signs — derived directly from Python export script ─────
    // Python: theta = 2π·t/P_orb
    //   z1 = a1·sin(theta)·sin(i)   → dz1/dt = +K1·cos(theta)  Cepheid recedes at theta=0
    //   z2 = a2·sin(theta+π)·sin(i) → dz2/dt = −K2·cos(theta)  Companion approaches at theta=0
    //
    // At theta=0 (frame 0): stars on opposite sides of screen (x1=+a1, x2=−a2)
    //   rv1 = +K1 (Cepheid receding)  rv2 = −K2 (Companion approaching)
    //   ΔRV = K1+K2 = max  → GREEN for ESPRESSO ✓
    // At theta=π/2 (stars at top/bottom of screen):
    //   rv1 = 0  rv2 = 0  → RED for ESPRESSO ✓
    for (let k = 0; k < RV_N; k++) {
      const phi = k / RV_N;
      const v1  = +K1 * Math.cos(2 * Math.PI * phi);   // Cepheid: recedes at phi=0
      const v2  = -K2 * Math.cos(2 * Math.PI * phi);   // Companion: approaches at phi=0
      rv1_orb.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));  // = (K1+K2)|cos φ|, maximum at phi=0 and 0.5 ✓
    }

    // ── Pulsation phase array — match Python exactly ───────────────────────
    // Python: puls_phase_real = (times % p_puls) / p_puls
    // data.physics_frames.t[i] = time in days; data.metadata.p_puls = 0.69001 days
    // This cycles ~85.3 times per orbit.  Using i/N (once per orbit) is wrong.
    const tArr   = data.physics_frames.t;
    const p_puls = (data.metadata && data.metadata.p_puls) ? data.metadata.p_puls : P_PULS_D;
    for (let i = 0; i < tArr.length; i++) {
      pulsPhaseArr.push((tArr[i] % p_puls) / p_puls);
    }

    // Pulsation velocity per frame (breathing glow + σ envelope)
    const r1arr = data.physics_frames.r1;
    const N     = r1arr.length;
    const dt    = (data.metadata && data.metadata.dt) ? data.metadata.dt : p_puls / 120;
    const conv  = R_SUN_KM / 86400;

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
      applyLayout();

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
    applyLayout();
    void simCanvas.offsetHeight; // force layout reflow before measuring
    const dpr  = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width  = rect.width  * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── plot box in canvas-space pixels ──────────────────────────────────────
  function getPlotRect() {
    if (!plotUI) return null;
    const pr = plotUI.getBoundingClientRect();
    const sr = simCanvas.getBoundingClientRect();
    return { px: pr.left - sr.left, py: pr.top - sr.top, pw: pr.width, ph: pr.height };
  }

  // ── star-zone center in canvas pixels ────────────────────────────────────
  // On mobile, canvas is a flex item — use its own dimensions directly.
  // On desktop, #sim-canvas-zone is the transparent spacer in the absolute layout;
  // reading its bounding rect gives the correct star-area center.
  function getStarZone() {
    if (isMobile()) {
      const dpr = window.devicePixelRatio || 1;
      const w   = simCanvas.width  / dpr;
      const h   = simCanvas.height / dpr;
      return { cx: w / 2, cy: h / 2, w, h };
    }
    const zone = document.getElementById('sim-canvas-zone');
    if (!zone) return null;
    const zr = zone.getBoundingClientRect();
    const sr = simCanvas.getBoundingClientRect();
    return {
      cx: zr.left - sr.left + zr.width  / 2,
      cy: zr.top  - sr.top  + zr.height / 2,
      w:  zr.width,
      h:  zr.height,
    };
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

  // ── RV plot (orbital mode) — scrolling window centered on current phase ──
  // Z-order (back to front):
  //   1. Constraint shading
  //   2. Canvas center line (replaces the HTML line so canvas dots can sit above it)
  //   3. Zero line + ΔRV threshold lines
  //   4. σ-puls envelope
  //   5. Model curves
  //   6. Current-phase indicator dots (4 px)
  //   7. Obs data dots (6 px) — always topmost
  //   8. Constraint text
  function drawRVPlot(frameI) {
    const box = getPlotRect();
    if (!box || !rv1_orb.length) return;
    const { px, py, pw, ph } = box;

    const N      = data.physics_frames.x1.length;
    const rvI    = Math.round(frameI / N * RV_N) % RV_N;
    const inset  = 18;
    const padTop = 22;
    const drawH  = ph - padTop - 8;
    const midY   = py + padTop + drawH / 2;
    const RVMAX  = (K1 + K2) * 1.15;
    const yScale = (drawH / 2) / RVMAX;
    const nPts   = 200;
    const step   = (pw - inset * 2) / nPts;
    const mobile = isMobile();
    const rvY    = v => midY - v * yScale;
    const curX   = px + pw / 2;

    ctx.save();

    // 1. Constraint shading
    if (showConstraints) {
      ctx.fillStyle = 'rgba(239,68,68,0.07)';
      ctx.fillRect(px + inset, py + padTop, pw - inset * 2, drawH);
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        if (rvDelta[idx] >= RV_THRESH) {
          ctx.fillStyle = 'rgba(134,239,172,0.13)';
          ctx.fillRect(curX + k * step, py + padTop, step + 0.5, drawH);
        }
      }
    } else {
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx = (rvI + Math.round(k) + RV_N) % RV_N;
        if (rvDelta[idx] >= RV_THRESH) {
          ctx.fillStyle = 'rgba(134,239,172,0.06)';
          ctx.fillRect(curX + k * step, py + padTop, step + 0.5, drawH);
        }
      }
    }

    // 2. Canvas center line — drawn here so canvas dots are above it in z-order
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(96,165,250,0.55)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 6; ctx.shadowColor = '#60a5fa';
    ctx.beginPath(); ctx.moveTo(curX, py + padTop); ctx.lineTo(curX, py + ph - 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Zero line + ΔRV threshold lines
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.moveTo(px + inset, midY); ctx.lineTo(px + pw - inset, midY); ctx.stroke();

    ctx.strokeStyle = showConstraints ? 'rgba(134,239,172,0.55)' : 'rgba(134,239,172,0.28)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    const half = (RV_THRESH / 2) * yScale;
    for (const yy of [midY - half, midY + half]) {
      ctx.beginPath(); ctx.moveTo(px + inset, yy); ctx.lineTo(px + pw - inset, yy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 4. σ_puls envelope
    if (vpuls_rms > 0.5) {
      ctx.fillStyle = 'rgba(255,228,160,0.07)';
      ctx.beginPath();
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) - 1 + RV_N) % RV_N;
        const x = curX + k * step;
        const y = rvY(rv1_orb[idx] + vpuls_rms);
        circPt(ctx, x, y, k === -nPts / 2, idx, prev);
      }
      for (let k = nPts / 2; k >= -nPts / 2; k--) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) + 1 + RV_N) % RV_N;
        const x = curX + k * step;
        const y = rvY(rv1_orb[idx] - vpuls_rms);
        circPt(ctx, x, y, k === nPts / 2, idx, prev);
      }
      ctx.closePath(); ctx.fill();
    }

    // 5. Model RV curves (wrap-safe)
    const drawCurve = (arr, color, width) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      for (let k = -nPts / 2; k <= nPts / 2; k++) {
        const idx  = (rvI + Math.round(k)     + RV_N) % RV_N;
        const prev = (rvI + Math.round(k) - 1 + RV_N) % RV_N;
        const x    = curX + k * step;
        const y    = rvY(arr[idx]);
        circPt(ctx, x, y, k === -nPts / 2, idx, prev);
      }
      ctx.stroke();
    };
    drawCurve(rv1_orb, '#ffe4a0', 2.5);
    drawCurve(rv2,     '#f87171', 2.5);

    // 6. current-phase indicator dots on model curves at center line
    ctx.setLineDash([]);
    [[rv1_orb[rvI], '#ffe4a0'], [rv2[rvI], '#f87171']].forEach(([v, col]) => {
      ctx.beginPath(); ctx.arc(curX, rvY(v), 7, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // 7. Obs data dots (6 px) — TOPMOST, always visible above model curves
    OBS_DATA.forEach(([hjd, rv1_abs, e1, rv2_abs, e2]) => {
      const phi    = ((hjd - OBS_T0) % OBS_P_ORB + OBS_P_ORB) % OBS_P_ORB / OBS_P_ORB;
      const obsIdx = Math.round(phi * RV_N) % RV_N;
      let kOff     = (obsIdx - rvI + RV_N) % RV_N;
      if (kOff > RV_N / 2) kOff -= RV_N;
      if (Math.abs(kOff) > nPts / 2) return;
      const ox  = curX + kOff * step;
      const v1r = rv1_abs - OBS_GAM;
      const v2r = rv2_abs - OBS_GAM;

      const drawObsPt = (vRel, eV, col) => {
        const oy = rvY(vRel);
        const ey = Math.max(3, eV * yScale);
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 1.0;
        ctx.beginPath(); ctx.moveTo(ox, oy - ey); ctx.lineTo(ox, oy + ey); ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.restore();
      };
      drawObsPt(v1r, e1, '#ffe4a0');
      drawObsPt(v2r, e2, '#f87171');
    });

    // 8. Constraint status text
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
        px + pw / 2, py + 6
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
      const ly = rvY(v);
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
      ctx.fillStyle = '#ffe4a0';                ctx.fillText('Cepheid model', lr, lt);
      ctx.fillStyle = 'rgba(255,228,160,0.38)'; ctx.fillText(`\u00b1\u03c3\u209A\u2090 \u2248 ${vpuls_rms.toFixed(0)} km/s`, lr, lt + 12);
      ctx.fillStyle = '#f87171';                ctx.fillText('Companion model', lr, lt + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('\u25cf Pilecki+2022 obs.', lr, lt + 36);
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.font = '8px \'JetBrains Mono\', monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('circular orbit \u00b7 i=57\u00b0 \u00b7 K\u2081\u224830.3 \u00b7 K\u2082\u224854.8 km/s', px + inset, py + ph - 8);
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
      // Shade each column by the TRUE pulsation phase from pulsPhaseArr.
      // pulsPhaseArr[idx] = (t[idx] % p_puls) / p_puls — same formula as Python.
      for (let k = -nPts / 2; k < nPts / 2; k++) {
        const idx   = (frameI + Math.round(k) + N) % N;
        const phase = pulsPhaseArr.length ? pulsPhaseArr[idx] : (idx / N);
        const inWin = phase >= PULS_MIN && phase <= PULS_MAX;
        ctx.fillStyle = inWin ? 'rgba(134,239,172,0.13)' : 'rgba(239,68,68,0.06)';
        ctx.fillRect(px + pw / 2 + k * step, py, step + 0.5, ph);
      }

      // Boundary tick lines — find nearest frames where pulsPhase crosses 0.50 and 0.70
      // by scanning forward from frameI within the visible window.
      [PULS_MIN, PULS_MAX].forEach(tp => {
        for (let k = -nPts / 2; k < nPts / 2 - 1; k++) {
          const idxA = (frameI + Math.round(k)     + N) % N;
          const idxB = (frameI + Math.round(k) + 1 + N) % N;
          const phA  = pulsPhaseArr.length ? pulsPhaseArr[idxA] : (idxA / N);
          const phB  = pulsPhaseArr.length ? pulsPhaseArr[idxB] : (idxB / N);
          // Detect crossing — account for wrap from ~1 → ~0
          const cross = (phA < phB && phA <= tp && phB > tp) ||
                        (phA > phB && tp >= 0 && tp < phB);   // wrap crossing
          if (!cross) continue;
          const x = px + pw / 2 + (k + 0.5) * step;
          ctx.strokeStyle = 'rgba(134,239,172,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(x, py + 14); ctx.lineTo(x, py + ph - 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(134,239,172,0.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.font = '8px \'JetBrains Mono\', monospace';
          ctx.fillText(`\u03c6=${tp.toFixed(2)}`, x, py + 16);
          break;  // only show first crossing per boundary
        }
      });

      // Phase status text — TRUE pulsation phase at current frame
      const cp    = pulsPhaseArr.length ? pulsPhaseArr[frameI] : (frameI / N);
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

  // ── ESPRESSO constraint badge — drawn on canvas, always readable ─────────
  // Placed just below the star center so it's in the clear zone between
  // the stars and the plot panel.  Shows live constraint state each frame.
  function drawConstraintBadge(starCx, starCy, constraintOk, orbOk, pulsOk, pulsPhase, rvDeltaVal) {
    if (!showConstraints) return;
    const mobile = isMobile();
    const fs  = mobile ? 9 : 10;
    const bx  = starCx;
    const by  = starCy + (mobile ? 55 : 75);  // below star center

    ctx.save();
    ctx.font = `${fs}px 'JetBrains Mono', monospace`;

    const rvLine = currentMode === 'orbital'
      ? `\u0394RV\u2009=\u2009${rvDeltaVal}\u2009km/s\u2009\u2009${orbOk   ? '\u2713' : '\u2717'}`
      : null;
    const phLine = `\u03c6\u2081\u2009=\u2009${pulsPhase.toFixed(2)}\u2009\u2009${pulsOk ? '\u2713' : '\u2717'}`;
    const stLine = constraintOk ? 'ESPRESSO window  \u25cf  OPEN' : 'ESPRESSO window  \u25cb  CLOSED';

    const lines = [rvLine, phLine, stLine].filter(Boolean);
    const lineH = fs + 5;
    const maxW  = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    const boxW  = maxW + 28;
    const boxH  = lines.length * lineH + 14;
    const boxX  = bx - boxW / 2;
    const boxY  = by - 4;

    // Background
    ctx.fillStyle = 'rgba(7,9,26,0.78)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    // Border
    ctx.strokeStyle = constraintOk ? 'rgba(134,239,172,0.45)' : 'rgba(239,68,68,0.35)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Text lines
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((line, j) => {
      const y = boxY + 7 + j * lineH;
      if (line === stLine) {
        ctx.fillStyle = constraintOk ? 'rgba(134,239,172,0.95)' : 'rgba(239,68,68,0.90)';
      } else if (line === rvLine) {
        ctx.fillStyle = orbOk ? 'rgba(134,239,172,0.85)' : 'rgba(239,68,68,0.80)';
      } else {
        ctx.fillStyle = pulsOk ? 'rgba(134,239,172,0.85)' : 'rgba(239,68,68,0.80)';
      }
      ctx.fillText(line, boxX + 14, y);
    });

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
      col1 = (typeof safeGet(p.color1, i, null) === 'string') ? p.color1[i] : teff_to_js_color(teff || 6490);
      drawLightCurve(p.v_mag, i);
    } else {
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1   = p.r1[i];
      mag  = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = (typeof safeGet(p.color1, i, null) === 'string') ? p.color1[i] : teff_to_js_color(teff || 6490);
      drawRVPlot(i);
    }

    // ── Constraint evaluation ─────────────────────────────────────────────
    const rvI  = Math.round(i / N * RV_N) % RV_N;
    const orbOk = rvDelta[rvI] >= RV_THRESH;
    // TRUE pulsation phase from precomputed array: (t[i] % p_puls) / p_puls
    // This cycles ~85.3× per orbit — exactly as the Python export script computes it.
    const pulsPhase = pulsPhaseArr.length ? pulsPhaseArr[i] : (i / N);
    const pulsOk    = pulsPhase >= PULS_MIN && pulsPhase <= PULS_MAX;
    const constraintOk = currentMode === 'orbital' ? (orbOk && pulsOk) : pulsOk;

    updateSimBorder(constraintOk);

    // ── Zoom + center ─────────────────────────────────────────────────────
    // On mobile, canvas is a flow element with its own bounding rect — getStarZone()
    // returns canvas center directly (w/2, h/2). On desktop use zone bounding rect.
    let zoom, cx, cy;
    if (isMobile()) {
      const zone = getStarZone();
      cx = zone ? zone.cx : w / 2;
      cy = zone ? zone.cy : h * 0.50;
      zoom = currentMode === 'pulsation'
        ? (Math.min(zone ? zone.w : w, zone ? zone.h : h) * 0.11) / maxR1
        : (Math.min(zone ? zone.w : w, zone ? zone.h : h) * 0.23) / bounds.a2;
    } else if (currentMode === 'pulsation') {
      zoom = (Math.min(w, h) * 0.17) / maxR1;
      cx   = w / 2;
      cy   = h * 0.30;
    } else {
      zoom = (Math.min(w, h) * 0.40) / bounds.a2;
      cx   = w / 2;
      cy   = h * 0.43;
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

    // ── Constraint badge (on canvas, always readable) ─────────────────────
    if (showConstraints) {
      const rvDeltaVal = rvDelta[rvI].toFixed(0);
      drawConstraintBadge(cx, cy, constraintOk, orbOk, pulsOk, pulsPhase, rvDeltaVal);
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (hud.mag)  hud.mag.innerText  = mag.toFixed(1);
    if (hud.teff) hud.teff.innerText = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)  hud.rad.innerText  = `${r1.toFixed(1)} R\u2609`;

    if (hud.phase) {
      // Orbital mode: show orbital phase (i/N, 0→1 per orbit)
      // Pulsation mode: show true pulsation phase from pulsPhaseArr
      const displayPhase = currentMode === 'orbital' ? (i / N) : pulsPhase;
      hud.phase.innerText   = displayPhase.toFixed(3);
      hud.phase.style.color = showConstraints
        ? (constraintOk ? COL_OK : COL_WARN)
        : COL_PHASE_DEFAULT;
    }

    requestAnimationFrame(animate);
  }

  init();
})();
