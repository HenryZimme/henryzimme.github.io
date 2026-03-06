(function() {
  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  const COLORS = {
    cepheid: '#60a5fa', 
    companion: '#f87171',
    orbit: 'rgba(255, 255, 255, 0.2)'
  };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error("Data fetch failed");
      data = await response.json();
      
      // FORCE HIDE "Synchronizing Data"
      if (preview) {
        preview.style.display = 'none';
        preview.classList.add('hidden');
      }
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      renderPlot(); // Initialize the graph
      animate();
    } catch (e) {
      console.error("Initialization Error:", e);
      const hud = document.getElementById('hud-mag');
      if (hud) hud.innerText = "ERROR LOADING DATA";
    }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) btn.classList.add('active');
    frameIdx = 0; 
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = starCanvas.getBoundingClientRect();
    starCanvas.width = rect.width * dpr;
    starCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  // --- NEW: PLOT RENDERING ---
  function renderPlot() {
    const plotContainer = document.getElementById('lightcurve-plot');
    if (!plotContainer) return;
    // If you're using a library like Chart.js or Plotly, initialize it here.
    // For now, ensuring the container isn't hidden by the sync message:
    plotContainer.classList.remove('opacity-0');
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

    // Frame Speed & Selection Logic
    let i;
    let x1, y1, z1, x2, y2, z2, r1, r2, col1;

    if (currentMode === 'orbital') {
      i = frameIdx % p.x1.length;
      frameIdx += 2; // Increased speed
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = p.r1[i]; r2 = 12.51;
      col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    } else if (currentMode === 'composite') {
      i = frameIdx % c.r1.length;
      frameIdx += 1;
      const pIdx = i % p.x1.length;
      x1 = p.x1[pIdx]; y1 = p.y1[pIdx]; z1 = p.z1[pIdx];
      x2 = p.x2[pIdx]; y2 = p.y2[pIdx]; z2 = p.z2[pIdx];
      r1 = c.r1[i]; r2 = 12.51;
      col1 = c.color1 ? c.color1[i] : COLORS.cepheid;
    } else { // Pulsation Focus
      i = frameIdx % p.t.length;
      frameIdx += 1;
      x1 = 0; y1 = 0; z1 = 0; // Lock Cepheid to center
      x2 = 1000; // Move companion out of view
      r1 = p.r1[i]; r2 = 12.51;
      col1 = p.color1 ? p.color1[i] : COLORS.cepheid;
    }

    // Adjusted Zoom: Pulsation focus is now 5x rather than 100x
    const zoom = (currentMode === 'pulsation') ? (Math.min(w, h) * 0.012) : (Math.min(w, h) * 0.4) / 160;

    // Draw Orbit Trail (Inclined 57 degrees)
    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = COLORS.orbit;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 110 * zoom, 110 * zoom * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Stars
    const drawDisk = (x, y, r, col, glow) => {
      ctx.fillStyle = col;
      if (glow) {
        ctx.shadowBlur = r * zoom * 1.2;
        ctx.shadowColor = col;
      }
      ctx.beginPath();
      ctx.arc(cx + x * zoom, cy + y * zoom, r * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    if (z1 > z2) {
      drawDisk(x2, y2, r2, COLORS.companion, false);
      drawDisk(x1, y1, r1, col1, true);
    } else {
      drawDisk(x1, y1, r1, col1, true);
      drawDisk(x2, y2, r2, COLORS.companion, false);
    }

    requestAnimationFrame(animate);
  }

  init();
})();
