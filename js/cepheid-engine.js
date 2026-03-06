(function() {
  /**
   * Binary Cepheid Engine v1.0
   * Handles 60FPS rendering of precomputed physics data.
   * Wrapped in IIFE to prevent global namespace conflicts with index.html
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  // Grab DOM elements - ID updated to match 'starCanvas' in index.html
  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  // Configuration
  const COLORS = {
    companion: '#3b82f6',
    orbit: 'rgba(255, 255, 255, 0.08)',
    label: '#94a3b8',
    defaultStar: '#fbbf24' // Fallback color
  };

  async function init() {
    if (!starCanvas || !ctx) {
      console.error("Canvas element 'starCanvas' not found or 2D context unavailable.");
      return;
    }

    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      data = await response.json();
      
      // Hide preview, show canvas
      if (preview) preview.classList.add('hidden');
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Data load failed:", e);
    }
  }

  /**
   * Attached to window so HTML onclick events can access it from
   * inside this private scope.
   */
  window.setMode = function(mode) {
    console.log("Switching to mode:", mode);
    currentMode = mode;
    
    // Update button visuals
    document.querySelectorAll('.btn-mode').forEach(b => {
      b.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    frameIdx = 0; // Restart animation cycle for the new mode
  };

  function resize() {
    if (!starCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = starCanvas.getBoundingClientRect();
    starCanvas.width = rect.width * dpr;
    starCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  const formatVal = (val) => {
    if (val == null || isNaN(val)) return 'N/A';
    if (val >= 100) return Math.round(val).toString();
    return Number(val.toPrecision(2)).toString();
  };

  function updateHUD(mag, teff, rad) {
    const magEl = document.getElementById('hud-mag');
    const teffEl = document.getElementById('hud-teff');
    const radEl = document.getElementById('hud-rad');

    if (magEl) magEl.innerText = `MAG: ${formatVal(mag)}`;
    if (teffEl) teffEl.innerText = `TEFF: ${formatVal(teff)} K`;
    if (radEl) radEl.innerText = `RAD: ${formatVal(rad)} R☉`;
  }

  function animate() {
    if (!data || !data.physics_frames) return;

    const dpr = window.devicePixelRatio || 1;
    const w = starCanvas.width / dpr;
    const h = starCanvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const physics = data.physics_frames;
    const comp = data.composite_frames;
    const meta = data.metadata || {};

    // 1. Mode Indexing
    let i;
    if (currentMode === 'pulsation') {
      i = frameIdx % 120; // Loop first pulsation cycle
    } else {
      const maxFrames = physics.t ? physics.t.length : 1;
      i = frameIdx % maxFrames;
    }
    frameIdx++;

    // 2. Adaptive Zoom
    let maxExtent = 1;
    if (physics.x2 && physics.x2.length > 0) {
      maxExtent = Math.max(...physics.x2.map(Math.abs)) * 1.5 || 1; 
    }
    
    const zoom = Math.min(w, h) / (maxExtent * 2);
    const cx = w / 2;
    const cy = h / 2;

    // 3. Extract Frame Data
    const isComp = currentMode === 'composite' && comp;
    const r1 = isComp ? (comp.r1_composite[i] || 1) : (physics.r1[i] || 1);
    const mag = isComp ? comp.v_mag_composite[i] : physics.v_mag[i];
    const teff = physics.teff ? physics.teff[i] : null;
    const color = (physics.colors && physics.colors[i]) ? physics.colors[i] : COLORS.defaultStar;

    // 4. Update UI
    updateHUD(mag, teff, r1);

    // 5. Draw Orbit Trail
    ctx.strokeStyle = COLORS.orbit;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, (maxExtent / 1.5) * zoom, (maxExtent / 1.5) * zoom * Math.cos(57 * Math.PI / 180), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Draw Stars (Z-Sorted)
    const x1 = physics.x1 ? physics.x1[i] : 0;
    const y1 = physics.y1 ? physics.y1[i] : 0;
    const z1 = physics.z1 ? physics.z1[i] : 0;
    const x2 = physics.x2 ? physics.x2[i] : 0;
    const y2 = physics.y2 ? physics.y2[i] : 0;
    const z2 = physics.z2 ? physics.z2[i] : 0;
    const r2_scaled = meta.r2_scaled || 0.5;

    const drawCepheid = () => {
      const x = cx + x1 * zoom;
      const y = cy + y1 * zoom;
      const rad = r1 * zoom;
      ctx.shadowBlur = rad * 1.5;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.1, rad), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const drawCompanion = () => {
      const x = cx + x2 * zoom;
      const y = cy + y2 * zoom;
      const rad = r2_scaled * zoom;
      ctx.fillStyle = COLORS.companion;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.1, rad), 0, Math.PI * 2);
      ctx.fill();
    };

    if (z1 > z2) {
      drawCompanion(); 
      drawCepheid();
    } else {
      drawCepheid(); 
      drawCompanion();
    }

    requestAnimationFrame(animate);
  }

  init();
})();
