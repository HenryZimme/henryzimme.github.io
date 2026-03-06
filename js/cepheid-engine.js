(function() {
  /**
   * Binary Cepheid Engine v1.0
   * Handles 60FPS rendering of precomputed physics data.
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  // Grab DOM elements - Matched to index.html IDs
  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  const COLORS = {
    companion: '#3b82f6',
    orbit: 'rgba(255, 255, 255, 0.08)',
    label: '#94a3b8',
    defaultStar: '#fbbf24'
  };

  /**
   * Robust Initialization
   * Fetches data as text first to verify content before parsing.
   */
  async function init() {
    if (!starCanvas || !ctx) return;

    try {
      const response = await fetch('data/master_data.json');
      
      if (!response.ok) {
        throw new Error(`File not found (Status: ${response.status})`);
      }

      const text = await response.text(); 
      if (!text || text.trim().length === 0) {
        throw new Error("The JSON file is empty.");
      }

      data = JSON.parse(text); 
      
      // Update UI state
      if (preview) preview.classList.add('hidden');
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Cepheid Engine Error:", e.message);
      const magEl = document.getElementById('hud-mag');
      if (magEl) magEl.innerText = "DATA ERROR";
    }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode').forEach(b => {
      b.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
    frameIdx = 0; 
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

    // Mode Indexing
    let i = (currentMode === 'pulsation') ? (frameIdx % 120) : (frameIdx % (physics.t ? physics.t.length : 1));
    frameIdx++;

    // Adaptive Zoom
    let maxExtent = 1;
    if (physics.x2 && physics.x2.length > 0) {
      maxExtent = Math.max(...physics.x2.map(Math.abs)) * 1.5 || 1; 
    }
    
    const zoom = Math.min(w, h) / (maxExtent * 2);
    const cx = w / 2;
    const cy = h / 2;

    const isComp = currentMode === 'composite' && comp;
    const r1 = isComp ? (comp.r1_composite[i] || 1) : (physics.r1[i] || 1);
    const mag = isComp ? comp.v_mag_composite[i] : physics.v_mag[i];
    const teff = physics.teff ? physics.teff[i] : null;
    const color = (physics.colors && physics.colors[i]) ? physics.colors[i] : COLORS.defaultStar;

    updateHUD(mag, teff, r1);

    // Draw Orbit Trail
    ctx.strokeStyle = COLORS.orbit;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, (maxExtent / 1.5) * zoom, (maxExtent / 1.5) * zoom * Math.cos(57 * Math.PI / 180), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const drawCepheid = () => {
      const x = cx + (physics.x1[i] || 0) * zoom;
      const y = cy + (physics.y1[i] || 0) * zoom;
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
      const x = cx + (physics.x2[i] || 0) * zoom;
      const y = cy + (physics.y2[i] || 0) * zoom;
      const rad = (meta.r2_scaled || 0.5) * zoom;
      ctx.fillStyle = COLORS.companion;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.1, rad), 0, Math.PI * 2);
      ctx.fill();
    };

    // Depth Sorting
    if ((physics.z1 ? physics.z1[i] : 0) > (physics.z2 ? physics.z2[i] : 0)) {
      drawCompanion(); 
      drawCepheid();
    } else {
      drawCepheid(); 
      drawCompanion();
    }

    requestAnimationFrame(animate);
  }

  // Start the engine
  init();

})();
