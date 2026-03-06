/**
 * Binary Cepheid Engine v2.0
 * Refactored for performance, transform stability, and data robustness.
 */
(function() {
  // --- CONSTANTS & CONFIGURATION ---
  const MODES = new Set(['orbital', 'pulsation', 'composite']);
  const ORBIT_FRAME_SPEED = 0.8;
  const PULSATION_FRAME_SPEED = 0.35;
  const COMPANION_RADIUS_RSUN = 12.51; // Fixed radius for the red companion
  const ORBIT_ASPECT_RATIO = 0.54;
  const PLOT_POINTS_MOBILE = 80;
  const PLOT_POINTS_DESKTOP = 160;
  const DEFAULT_TEFF = 6500;

  // --- STATE ---
  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;
  let running = true;

  // --- DOM CACHING ---
  const simCanvas = document.getElementById('simCanvas'); 
  const ctx = simCanvas ? simCanvas.getContext('2d') : null;
  const preview = document.getElementById('sim-preview');
  const plotUI = document.getElementById('hud-plot-container');

  const hud = {
    mag: document.getElementById('hud-mag'),
    teff: document.getElementById('hud-teff'),
    rad: document.getElementById('hud-rad'),
    phase: document.getElementById('hud-phase')
  };

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  /**
   * Initialization and Data Guarding
   */
  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      data = await response.json();
      const p = data.physics_frames;

      // Robustness Guard: Ensure required physics arrays exist
      if (!p || !Array.isArray(p.x1) || p.x1.length === 0 || 
          !Array.isArray(p.v_mag) || !Array.isArray(p.x2)) {
        throw new Error("Malformed Physics Data: Missing required frames");
      }

      // Pre-calculate bounds for scaling
      p.v_mag.forEach(v => {
        if (v < bounds.minV) bounds.minV = v;
        if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));

      if (preview) preview.style.display = 'none';
      simCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) { 
      console.error("Simulation failed to initialize:", e);
      if (preview) {
        preview.innerText = "Error Loading Data. Check Console.";
        preview.style.color = "#f87171";
      }
      if (simCanvas) simCanvas.style.display = 'none';
    }
  }

  /**
   * Mode Switching with Constraints
   */
  window.setMode = function(mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;
    
    if (plotUI) {
      plotUI.classList.toggle('opacity-100', mode === 'pulsation');
      plotUI.classList.toggle('opacity-0', mode !== 'pulsation');
    }
    
    document.querySelectorAll('.btn-mode').forEach(b => {
      b.classList.remove('bg-white/5', 'text-white');
      b.classList.add('text-white/40');
    });
    
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('bg-white/5', 'text-white');
  };

  /**
   * Scaling Fix: Resetting transform on resize
   */
  function resize() {
    if (!simCanvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width = rect.width * dpr;
    simCanvas.height = rect.height * dpr;
    
    // Use setTransform to prevent compounding scale on resize
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Drawing Helper: Light Curve Plot
   */
  function renderLightCurve(width, height, pData, currentIdx) {
    if (!plotUI || !Array.isArray(pData) || pData.length === 0) return;

    const rect = plotUI.getBoundingClientRect();
    const simRect = simCanvas.getBoundingClientRect();
    const px = rect.left - simRect.left;
    const py = rect.top - simRect.top;
    const pw = rect.width;
    const ph = rect.height;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;

    const points = (width < 768) ? PLOT_POINTS_MOBILE : PLOT_POINTS_DESKTOP; 
    const step = pw / points;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);

    for (let k = -points/2; k < points/2; k++) {
      const idx = (currentIdx + k + pData.length) % pData.length;
      const val = pData[idx];
      const x = px + (pw/2) + (k * step);
      const y = py + (ph/2) + ((val - ((bounds.minV + bounds.maxV)/2)) * (ph / magRange) * 0.7);
      
      if (k === -points/2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Drawing Helper: Star Rendering
   */
  function drawStar(cx, cy, zoom, x, y, r, col, glow) {
    ctx.fillStyle = col;
    if (glow) {
      ctx.shadowBlur = r * zoom * 1.5;
      ctx.shadowColor = col;
    }
    ctx.beginPath(); 
    ctx.arc(cx + x * zoom, cy + y * zoom, Math.max(1.5, r * zoom), 0, Math.PI * 2); 
    ctx.fill();
    // Reset shadow state immediately
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  /**
   * Main Animation Loop
   */
  function animate() {
    if (!running || !ctx || !simCanvas || !data || !data.physics_frames) return;

    const physics = data.physics_frames;
    const composite = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const width = simCanvas.width / dpr;
    const height = simCanvas.height / dpr;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Update index with data length guard
    const frameLen = physics.x1.length;
    let i = Math.floor(frameIdx) % frameLen;
    frameIdx += (currentMode === 'pulsation' ? PULSATION_FRAME_SPEED : ORBIT_FRAME_SPEED);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      x1 = 0; y1 = 0; z1 = 0; x2 = 9999; // Offset companion
      r1 = physics.r1[i]; 
      mag = physics.v_mag[i]; 
      teff = physics.teff ? physics.teff[i] : DEFAULT_TEFF; 
      col1 = physics.color1[i];
      renderLightCurve(width, height, physics.v_mag, i);
    } else {
      const isComp = currentMode === 'composite' && composite;
      const src = isComp ? composite : physics;
      const sIdx = i % src.r1.length;
      
      x1 = physics.x1[i]; y1 = physics.y1[i]; z1 = physics.z1[i];
      x2 = physics.x2[i]; y2 = physics.y2[i]; z2 = physics.z2[i];
      r1 = src.r1[sIdx]; 
      mag = src.v_mag[sIdx]; 
      col1 = src.color1[sIdx];
      teff = physics.teff ? physics.teff[i] : DEFAULT_TEFF;
    }

    // Responsive Scaling
    const responsiveZoom = (width < 768) ? (width * 0.4) : (width * 0.28);
    const zoom = (currentMode === 'pulsation') ? (width * 0.022) : responsiveZoom / Math.max(1, bounds.a2);

    // Render Orbits
    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); 
      ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*ORBIT_ASPECT_RATIO, 0, 0, Math.PI*2); 
      ctx.stroke();
    }

    // Z-Sorting Rendering
    if (z1 > z2) { 
      drawStar(cx, cy, zoom, x2, y2, COMPANION_RADIUS_RSUN, '#f87171', false); 
      drawStar(cx, cy, zoom, x1, y1, r1, col1, true); 
    } else { 
      drawStar(cx, cy, zoom, x1, y1, r1, col1, true); 
      drawStar(cx, cy, zoom, x2, y2, COMPANION_RADIUS_RSUN, '#f87171', false); 
    }

    // Cached UI Updates
    if (hud.mag) hud.mag.innerText = mag.toFixed(2);
    if (hud.teff) hud.teff.innerText = `${Math.round(teff)} K`;
    if (hud.rad) hud.rad.innerText = r1.toFixed(2);
    if (hud.phase) hud.phase.innerText = (i / frameLen).toFixed(2);

    requestAnimationFrame(animate);
  }

  // Handle Visibility API to pause when tab is inactive
  document.addEventListener("visibilitychange", () => {
    running = (document.visibilityState === "visible");
    if (running) animate();
  });

  init();
})();
