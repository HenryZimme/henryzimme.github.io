(function() {
  // --- Configuration ---
  const MODES = new Set(['orbital', 'composite', 'pulsation']);
  const COMPANION_RAD = 12.51;

  // Fallback colour for the Cepheid when color1 is absent from the JSON
  const CEPHEID_FALLBACK_COLOR = '#ffe066';

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  // --- DOM Elements ---
  const simCanvas = document.getElementById('simCanvas');
  const ctx = simCanvas ? simCanvas.getContext('2d') : null;
  const preview = document.getElementById('sim-preview');
  const plotUI = document.getElementById('hud-plot-container');

  const hud = {
    mag:   document.getElementById('hud-mag'),
    teff:  document.getElementById('hud-teff'),
    rad:   document.getElementById('hud-rad'),
    phase: document.getElementById('hud-phase')
  };

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  // Safe accessor: returns arr[idx] when arr exists, else fallback
  function safeGet(arr, idx, fallback) {
    return (arr && arr[idx] !== undefined) ? arr[idx] : fallback;
  }

  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      data = await response.json();

      const p = data.physics_frames;

      // Expanded validation: check every key animate() depends on
      const required = ['v_mag', 'x1', 'y1', 'z1', 'x2', 'y2', 'z2', 'r1'];
      for (const key of required) {
        if (!p || !Array.isArray(p[key])) {
          throw new Error(`Invalid Data Structure: physics_frames.${key} is missing or not an array`);
        }
      }
      // teff is optional — the JSON exporter doesn't currently emit it

      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';

      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Initialization Error:", e);
    }
  }

  window.setMode = function(mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;

    if (plotUI) {
      plotUI.style.opacity = (mode === 'pulsation') ? '1' : '0';
    }

    document.querySelectorAll('.btn-mode').forEach(b => {
      b.classList.remove('active', 'bg-white/10', 'text-white');
      b.classList.add('text-white/40');
    });
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) {
      btn.classList.add('active', 'bg-white/10', 'text-white');
    }
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width  = rect.width  * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawCenteredPlot(pData, currentIdx) {
    if (!plotUI || !pData) return;
    const rect  = plotUI.getBoundingClientRect();
    const sRect = simCanvas.getBoundingClientRect();

    const px = rect.left - sRect.left;
    const py = rect.top  - sRect.top;
    const pw = rect.width;
    const ph = rect.height;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;

    const points   = 100;
    const step     = pw / points;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);

    for (let k = -points / 2; k < points / 2; k++) {
      const idx = (currentIdx + k + pData.length) % pData.length;
      const val = pData[idx];
      const x = px + (pw / 2) + (k * step);
      const y = py + (ph / 2) + ((val - ((bounds.minV + bounds.maxV) / 2)) * (ph / magRange) * 0.7);

      if (k === -points / 2) ctx.moveTo(x, y);
      else                   ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function animate() {
    if (!data || !data.physics_frames) return;
    const p = data.physics_frames;
    const c = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const w = simCanvas.width  / dpr;
    const h = simCanvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    let i = Math.floor(frameIdx) % p.x1.length;
    frameIdx += (currentMode === 'pulsation' ? 0.4 : 0.8);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      x1 = 0; y1 = 0; z1 = 0; x2 = 9999;
      r1   = p.r1[i];
      mag  = p.v_mag[i];
      teff = safeGet(p.teff, i, null); // teff is optional in JSON
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
      teff = safeGet(p.teff, i, null); // teff is optional in JSON
      col1 = safeGet(src.color1, sIdx, CEPHEID_FALLBACK_COLOR);
    }

    const zoom = (currentMode === 'pulsation')
      ? (w * 0.022)
      : (w * 0.3) / bounds.a2;

    // Draw orbit ellipse
    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, bounds.a2 * zoom, bounds.a2 * zoom * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Render stars
    const drawStar = (x, y, r, col, glow) => {
      ctx.fillStyle = col || CEPHEID_FALLBACK_COLOR;
      if (glow) { ctx.shadowBlur = r * zoom * 1.5; ctx.shadowColor = col; }
      ctx.beginPath();
      ctx.arc(w / 2 + x * zoom, h / 2 + y * zoom, Math.max(1.5, r * zoom), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    if (z1 > z2) {
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, COMPANION_RAD, '#f87171', false);
    }

    // HUD Updates
    if (hud.mag)   hud.mag.innerText   = mag.toFixed(2);
    if (hud.teff)  hud.teff.innerText  = teff !== null ? `${Math.round(teff)} K` : '~6490 K';
    if (hud.rad)   hud.rad.innerText   = r1.toFixed(2);
    if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(2);

    requestAnimationFrame(animate);
  }

  init();
})();
