(function() {
  /**
   * Binary Cepheid Engine v1.7
   * Fixes: Mode switching, speed normalization, and single-star pulsation.
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  const COLORS = {
    cepheid: '#60a5fa',  // Blue (Pulsating)
    companion: '#f87171', // Red (Static)
    orbit: 'rgba(255, 255, 255, 0.15)'
  };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error("Data not found");
      data = await response.json();
      
      // Clear "Synchronizing Data" / Preview
      if (preview) preview.classList.add('hidden');
      starCanvas.classList.remove('opacity-0');
      starCanvas.classList.add('opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Engine Error:", e);
    }
  }

  // GLOBAL MODE SWITCHER
  window.setMode = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Reset index on mode change to prevent array overflows
    frameIdx = 0; 
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

    // 1. SPEED & FRAME LOGIC
    let i;
    let current_x1, current_y1, current_z1, current_x2, current_y2, current_z2, current_r1, current_col1;
    
    // Orbital Focus: Run at normal speed
    if (currentMode === 'orbital') {
      i = frameIdx % p.t.length;
      frameIdx += 1; // Increase for faster orbit
      current_x1 = p.x1[i]; current_y1 = p.y1[i]; current_z1 = p.z1[i];
      current_x2 = p.x2[i]; current_y2 = p.y2[i]; current_z2 = p.z2[i];
      current_r1 = p.r1[i];
      current_col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    } 
    // Composite Focus: Speed up pulsation relative to orbit
    else if (currentMode === 'composite') {
      i = frameIdx % c.r1.length;
      frameIdx += 1;
      current_x1 = p.x1[i % p.x1.length]; // Sync orbit with composite radius
      current_y1 = p.y1[i % p.y1.length];
      current_z1 = p.z1[i % p.z1.length];
      current_x2 = p.x2[i % p.x2.length];
      current_y2 = p.y2[i % p.y2.length];
      current_z2 = p.z2[i % p.z2.length];
      current_r1 = c.r1[i];
      current_col1 = c.color1 ? c.color1[i] : COLORS.cepheid;
    }
    // Pulsation Focus: High speed zoom on the Cepheid
    else {
      i = frameIdx % p.t.length;
      frameIdx += 2; 
      current_x1 = 0; current_y1 = 0; current_z1 = 0; // Center the Cepheid
      current_x2 = 5000; // Move companion off-screen
      current_r1 = p.r1[i];
      current_col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    }

    // 2. SCALING
    const zoom = (currentMode === 'pulsation') ? (Math.min(w, h) * 0.03) : (Math.min(w, h) * 0.4) / 150;

    // 3. DRAW ORBIT (Only in Orbital/Composite)
    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = COLORS.orbit;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 100 * zoom, 100 * zoom * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. DRAW STARS
    const drawStar = (x, y, r, col, isCepheid) => {
      ctx.fillStyle = col;
      if (isCepheid) {
        ctx.shadowBlur = r * zoom * 1.5;
        ctx.shadowColor = col;
      }
      ctx.beginPath();
      ctx.arc(cx + x * zoom, cy + y * zoom, r * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    // Z-Sort
    if (current_z1 > current_z2) {
      drawStar(current_x2, current_y2, 12.51, COLORS.companion, false);
      drawStar(current_x1, current_y1, current_r1, current_col1, true);
    } else {
      drawStar(current_x1, current_y1, current_r1, current_col1, true);
      drawStar(current_x2, current_y2, 12.51, COLORS.companion, false);
    }

    requestAnimationFrame(animate);
  }

  init();
})();
