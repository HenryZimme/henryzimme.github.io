(function() {
  /**
   * Binary Cepheid Engine v1.9
   * Fixes: ID Mismatch, Dual-Barycentric Orbits, and Pulsation Focus Zoom.
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  // FIXED: IDs now match index.html ('star-canvas' and 'preview')
  const starCanvas = document.getElementById('star-canvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  const COLORS = {
    cepheid: '#60a5fa',   // Pulsating Blue
    companion: '#f87171', // Static Red
    orbit1: 'rgba(96, 165, 250, 0.15)', // Orbit for Star 1
    orbit2: 'rgba(248, 113, 113, 0.15)'  // Orbit for Star 2
  };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      data = await response.json();
      
      // Force hide the sync message
      if (preview) preview.style.display = 'none';
      starCanvas.style.opacity = '1';
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) { console.error("Load Error:", e); }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    frameIdx = 0; // Reset sync
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) btn.classList.add('active');
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = starCanvas.getBoundingClientRect();
    starCanvas.width = rect.width * dpr;
    starCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function animate() {
    if (!data) return;

    const p = data.physics_frames;
    const c = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const w = starCanvas.width / dpr;
    const h = starCanvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // 1. Data Selection & Speed
    let i, x1, y1, z1, x2, y2, z2, r1, col1;
    const orbitScale = 0.54; // Matches the 57-degree inclination

    if (currentMode === 'orbital') {
      i = frameIdx % p.x1.length;
      frameIdx += 2; 
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = p.r1[i];
      col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    } else if (currentMode === 'composite') {
      i = frameIdx % c.r1.length;
      frameIdx += 1;
      const pi = i % p.x1.length;
      x1 = p.x1[pi]; y1 = p.y1[pi]; z1 = p.z1[pi];
      x2 = p.x2[pi]; y2 = p.y2[pi]; z2 = p.z2[pi];
      r1 = c.r1[i];
      col1 = c.color1 ? c.color1[i] : COLORS.cepheid;
    } else { // Pulsation Focus
      i = frameIdx % p.x1.length;
      frameIdx += 1;
      x1 = 0; y1 = 0; z1 = 0; // Center Cepheid
      x2 = 2000; // Hide Companion
      r1 = p.r1[i];
      col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    }

    // 2. Zoom Logic
    const zoom = (currentMode === 'pulsation') 
      ? (Math.min(w, h) * 0.015)  // 5x zoom (reasonable)
      : (Math.min(w, h) * 0.4) / 160;

    // 3. Dual Barycentric Orbits (Static Paths)
    if (currentMode !== 'pulsation') {
      ctx.setLineDash([3, 6]);
      
      // Larger Orbit (Companion)
      ctx.strokeStyle = COLORS.orbit2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 120 * zoom, 120 * zoom * orbitScale, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Smaller Orbit (Massive Cepheid)
      ctx.strokeStyle = COLORS.orbit1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 35 * zoom, 35 * zoom * orbitScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }

    // 4. Render Stars
    const drawStar = (x, y, r, col, glow) => {
      ctx.fillStyle = col;
      if (glow) {
        ctx.shadowBlur = r * zoom * 1.5;
        ctx.shadowColor = col;
      }
      ctx.beginPath();
      ctx.arc(cx + x * zoom, cy + y * zoom, r * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    if (z1 > z2) {
      drawStar(x2, y2, 12.51, COLORS.companion, false);
      drawStar(x1, y1, r1, col1, true);
    } else {
      drawStar(x1, y1, r1, col1, true);
      drawStar(x2, y2, 12.51, COLORS.companion, false);
    }

    // 5. Update UI Stats
    if (document.getElementById('hud-mag')) {
      document.getElementById('hud-mag').innerText = `MAG: ${data.physics_frames.v_mag[i].toFixed(2)}`;
      document.getElementById('hud-rad').innerText = `RAD: ${r1.toFixed(2)} R☉`;
    }

    requestAnimationFrame(animate);
  }

  init();
})();
