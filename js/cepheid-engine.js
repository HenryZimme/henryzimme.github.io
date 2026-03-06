(function() {
  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');
  
  // UI Elements
  const tableUI = document.getElementById('hud-table');
  const plotUI = document.getElementById('hud-plot-container');

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  async function init() {
    if (!starCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      data = await response.json();
      
      const p = data.physics_frames;
      p.v_mag.forEach(v => {
          if (v < bounds.minV) bounds.minV = v;
          if (v > bounds.maxV) bounds.maxV = v;
      });
      bounds.a1 = Math.max(...p.x1.map(Math.abs));
      bounds.a2 = Math.max(...p.x2.map(Math.abs));

      if (preview) preview.style.display = 'none';
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) { console.error(e); }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    // UI Toggle
    if (mode === 'pulsation') {
        tableUI.classList.add('opacity-0');
        plotUI.classList.replace('opacity-0', 'opacity-100');
    } else {
        tableUI.classList.remove('opacity-0');
        plotUI.classList.replace('opacity-100', 'opacity-0');
    }
    
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('bg-white/10', 'text-white'));
    document.getElementById(`btn-${mode}`).classList.add('bg-white/10', 'text-white');
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = starCanvas.getBoundingClientRect();
    starCanvas.width = rect.width * dpr;
    starCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function drawRollingPlot(w, h, pData, currentIdx) {
      // Draw directly on the main canvas in the plot container's position
      const rect = plotUI.getBoundingClientRect();
      const px = rect.left;
      const py = rect.top;
      const pw = rect.width;
      const ph = rect.height;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
      ctx.lineWidth = 2;

      const halfWidth = pw / 2;
      const points = 100; // number of points to show
      const step = pw / points;

      for (let k = -points/2; k < points/2; k++) {
          const idx = (currentIdx + k + pData.length) % pData.length;
          const val = pData[idx];
          
          const x = px + halfWidth + (k * step);
          const y = py + ph/2 + ((val - ((bounds.minV + bounds.maxV)/2)) * (ph / (bounds.maxV - bounds.minV)) * 0.8);
          
          if (k === -points/2) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Pulsing "Now" Dot
      ctx.beginPath();
      ctx.arc(px + halfWidth, py + ph/2 + ((pData[currentIdx] - ((bounds.minV + bounds.maxV)/2)) * (ph / (bounds.maxV - bounds.minV)) * 0.8), 3, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
  }

  function animate() {
    if (!data) return;
    const p = data.physics_frames;
    const c = data.composite_frames;
    const w = starCanvas.width / (window.devicePixelRatio || 1);
    const h = starCanvas.height / (window.devicePixelRatio || 1);
    const cx = w/2, cy = h/2;
    ctx.clearRect(0, 0, w, h);

    let i, x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;
    const orbitScale = 0.54;

    if (currentMode === 'pulsation') {
      i = Math.floor(frameIdx) % p.x1.length;
      frameIdx += 0.4; // SLOWED for cinematic comfort
      x1 = 0; y1 = 0; z1 = 0; x2 = 2000;
      r1 = p.r1[i]; mag = p.v_mag[i]; col1 = p.color1[i];
      drawRollingPlot(w, h, p.v_mag, i);
    } else {
      i = Math.floor(frameIdx) % p.x1.length;
      frameIdx += (currentMode === 'composite' ? 1 : 1.5);
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = (currentMode === 'composite') ? c.r1[i % c.r1.length] : p.r1[i];
      mag = (currentMode === 'composite') ? c.v_mag[i % c.v_mag.length] : p.v_mag[i];
      col1 = (currentMode === 'composite') ? c.color1[i % c.color1.length] : p.color1[i];
      teff = p.teff ? p.teff[i] : 6490;
      
      // Update Table
      document.getElementById('hud-mag').innerText = mag.toFixed(3);
      document.getElementById('hud-teff').innerText = `${Math.round(teff)} K`;
      document.getElementById('hud-rad').innerText = `${r1.toFixed(2)} R☉`;
    }

    const zoom = (currentMode === 'pulsation') ? (Math.min(w, h) * 0.02) : (Math.min(w, h) * 0.35) / bounds.a2;

    // Draw Orbits
    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*orbitScale, 0, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a1*zoom, bounds.a1*zoom*orbitScale, 0, 0, Math.PI*2); ctx.stroke();
    }

    // Render Stars (Z-Sorted)
    const draw = (x, y, r, col, glow) => {
        ctx.fillStyle = col;
        if(glow) { ctx.shadowBlur = r*zoom*1.2; ctx.shadowColor = col; }
        ctx.beginPath(); ctx.arc(cx+x*zoom, cy+y*zoom, Math.max(2, r*zoom), 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    if (z1 > z2) { draw(x2, y2, 12.51, '#f87171', false); draw(x1, y1, r1, col1, true); }
    else { draw(x1, y1, r1, col1, true); draw(x2, y2, 12.51, '#f87171', false); }

    requestAnimationFrame(animate);
  }
  init();
})();
