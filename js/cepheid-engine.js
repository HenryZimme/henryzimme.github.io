(function() {
  /**
   * Binary Cepheid Engine v1.5
   * Parameters: Cepheid (Star 1, Blue, 13.65 R_sun), Companion (Star 2, Red, 12.51 R_sun)
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  // PHYSICAL CONFIGURATION
  const COLORS = {
    cepheid_default: '#60a5fa', // Blue
    companion_default: '#f87171', // Red
    orbit: 'rgba(255, 255, 255, 0.4)'
  };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error("Could not find master_data.json");
      data = await response.json();
      
      if (preview) preview.classList.add('hidden');
      starCanvas.classList.remove('opacity-0');
      starCanvas.classList.add('opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Engine Load Error:", e);
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

  const formatVal = (val, dec = 1) => {
    if (val == null || isNaN(val) || val === 0) return '---';
    return val > 100 ? Math.round(val).toLocaleString() : Number(val).toFixed(dec);
  };

  function animate() {
    if (!data || !data.physics_frames) return;

    const p = data.physics_frames;
    const c = data.composite_frames;
    const meta = data.metadata || {};
    const dpr = window.devicePixelRatio || 1;
    const w = starCanvas.width / dpr;
    const h = starCanvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const frameCount = p.x1.length;
    let i = frameIdx % frameCount;
    frameIdx++;

    // 1. DYNAMIC SCALING (Based on orbital separation)
    // Using x2 (Companion) to determine the orbit's width
    let maxOrbitalDist = 0;
    for (let j = 0; j < p.x2.length; j += 10) {
        let d = Math.sqrt(p.x2[j]**2 + p.y2[j]**2);
        if (d > maxOrbitalDist) maxOrbitalDist = d;
    }
    const zoom = (Math.min(w, h) * 0.4) / (maxOrbitalDist || 100);
    const cx = w / 2;
    const cy = h / 2;

    // 2. DATA EXTRACTION
    const isComp = currentMode === 'composite' && c;
    
    // Star 1 (Cepheid) - Pulsating Blue
    const r1 = (isComp ? c.r1[i] : p.r1[i]) || 13.65;
    const color1 = (isComp ? c.color1[i] : p.color1[i]) || COLORS.cepheid_default;
    const mag = (isComp ? c.v_mag[i] : p.v_mag[i]);

    // Star 2 (Companion) - Static Red
    const r2 = meta.r2 || 12.51;
    const color2 = meta.color2 || COLORS.companion_default;

    // Teff logic: Map to metadata or calculation if missing
    const teff = p.teff ? p.teff[i] : 6450; 

    // 3. UI UPDATES
    document.getElementById('hud-mag').innerText = `MAG: ${formatVal(mag, 2)}`;
    document.getElementById('hud-teff').innerText = `TEFF: ${formatVal(teff, 0)} K`;
    document.getElementById('hud-rad').innerText = `RAD: ${formatVal(r1, 2)} R☉`;

    // 4. DRAW ORBIT (Tilted Ellipse)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.orbit;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    // Inclination from metadata (57 deg)
    const incFactor = Math.cos(57 * Math.PI / 180);
    ctx.ellipse(cx, cy, maxOrbitalDist * zoom, maxOrbitalDist * zoom * incFactor, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Z-SORTED RENDERING (Layering by Z-depth)
    const drawStar = (x, y, radius, color, isCepheid) => {
      const sx = cx + x * zoom;
      const sy = cy + y * zoom;
      const sr = radius * zoom;

      if (isCepheid) {
        ctx.shadowBlur = sr * 1.5;
        ctx.shadowColor = color;
      }
      
      ctx.fillStyle = color;
      ctx.beginPath();
      // Ensure stars don't become points; min size 5px
      ctx.arc(sx, sy, Math.max(5, sr), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    // Physics mapping: Star 1 (x1, y1, z1), Star 2 (x2, y2, z2)
    if (p.z1[i] > p.z2[i]) {
      drawStar(p.x2[i], p.y2[i], r2, color2, false);
      drawStar(p.x1[i], p.y1[i], r1, color1, true);
    } else {
      drawStar(p.x1[i], p.y1[i], r1, color1, true);
      drawStar(p.x2[i], p.y2[i], r2, color2, false);
    }

    requestAnimationFrame(animate);
  }

  init();
})();
