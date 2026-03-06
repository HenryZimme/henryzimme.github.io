(function() {
  /**
   * Binary Cepheid Engine v1.2 - Physical Accuracy Update
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  const COLORS = {
    companion: '#60a5fa', 
    orbit: 'rgba(255, 255, 255, 0.4)', // Higher visibility
    defaultStar: '#fbbf24'
  };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error("JSON path incorrect");
      data = await response.json();
      
      if (preview) preview.classList.add('hidden');
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Cepheid Engine Error:", e);
    }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');
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
    if (val == null || isNaN(val) || val === 0) return '---';
    return val >= 100 ? Math.round(val).toLocaleString() : val.toFixed(2);
  };

  function animate() {
    if (!data || !data.physics_frames) return;

    const dpr = window.devicePixelRatio || 1;
    const w = starCanvas.width / dpr;
    const h = starCanvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const p = data.physics_frames;
    const c = data.composite_frames;
    
    // Cycle through frames
    const frameCount = p.t ? p.t.length : 120;
    let i = frameIdx % frameCount;
    if (currentMode === 'pulsation') i = frameIdx % 120;
    frameIdx++;

    // Dynamic Scaling: Center the system based on max orbital extent
    const maxExtent = Math.max(...p.x2.map(Math.abs)) || 100; 
    const zoom = (Math.min(w, h) * 0.45) / maxExtent; 
    const cx = w / 2;
    const cy = h / 2;

    // Data Extraction (Physics-based)
    const isComp = currentMode === 'composite' && c;
    const r1 = isComp ? (c.r1_composite[i] || 13.8) : (p.r1[i] || 13.8);
    
    // Physical Fix: If r2 isn't in data, use the 0.88 ratio from your research
    const r2 = p.r2 ? p.r2[i] : (r1 * 0.88); 
    
    const mag = isComp ? c.v_mag_composite[i] : p.v_mag[i];
    
    // Teff "Fuzzy" Match
    const teff = p.teff ? p.teff[i] : (p.Teff ? p.Teff[i] : (p.temperature ? p.temperature[i] : null));
    
    const color = (p.colors && p.colors[i]) ? p.colors[i] : COLORS.defaultStar;

    // Update UI
    const magEl = document.getElementById('hud-mag');
    const teffEl = document.getElementById('hud-teff');
    const radEl = document.getElementById('hud-rad');
    if (magEl) magEl.innerText = `MAG: ${formatVal(mag)}`;
    if (teffEl) teffEl.innerText = `TEFF: ${formatVal(teff)} K`;
    if (radEl) radEl.innerText = `RAD: ${formatVal(r1)} R☉`;

    // Draw Orbit Path
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.orbit;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    // 0.5 inclination factor for 3D perspective
    ctx.ellipse(cx, cy, maxExtent * zoom, maxExtent * zoom * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Stars (Z-Sorted for Depth)
    const drawStar = (x, y, radius, col, glow) => {
      const screenX = cx + x * zoom;
      const screenY = cy + y * zoom;
      const visualRad = radius * zoom;

      if (glow) {
        ctx.shadowBlur = visualRad * 1.2;
        ctx.shadowColor = col;
      }
      
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(screenX, screenY, visualRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const z1 = p.z1 ? p.z1[i] : 0;
    const z2 = p.z2 ? p.z2[i] : 0;

    if (z1 > z2) {
      drawStar(p.x2[i], p.y2[i], r2, COLORS.companion, false);
      drawStar(p.x1[i], p.y1[i], r1, color, true);
    } else {
      drawStar(p.x1[i], p.y1[i], r1, color, true);
      drawStar(p.x2[i], p.y2[i], r2, COLORS.companion, false);
    }

    requestAnimationFrame(animate);
  }

  init();
})();
