(function() {
  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const simCanvas = document.getElementById('simCanvas'); 
  const ctx = simCanvas ? simCanvas.getContext('2d') : null;
  const preview = document.getElementById('sim-preview');
  const plotUI = document.getElementById('hud-plot-container');

  let bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error("Data file not found");
      data = await response.json();
      
      const p = data.physics_frames;
      // Guard: Ensure physics frames exist
      if (!p || !p.x1 || p.x1.length === 0) throw new Error("Malformed Physics Data");

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
      console.error("Sim Initialization Error:", e);
      if (preview) preview.innerText = "Error Loading Data";
    }
  }

  window.setMode = function(mode) {
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

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = simCanvas.getBoundingClientRect();
    simCanvas.width = rect.width * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function drawCenteredPlot(w, h, pData, currentIdx) {
    const rect = plotUI.getBoundingClientRect();
    const simRect = simCanvas.getBoundingClientRect();
    
    // Relative positioning to the main canvas
    const px = rect.left - simRect.left;
    const py = rect.top - simRect.top;
    const pw = rect.width;
    const ph = rect.height;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;

    const points = (w < 768) ? 80 : 160; 
    const step = pw / points;
    const magRange = Math.max(0.1, bounds.maxV - bounds.minV);

    for (let k = -points/2; k < points/2; k++) {
      const idx = (currentIdx + k + pData.length) % pData.length;
      const val = pData[idx];
      // Centers current index exactly at the midpoint of the plot container
      const x = px + (pw/2) + (k * step);
      const y = py + (ph/2) + ((val - ((bounds.minV + bounds.maxV)/2)) * (ph / magRange) * 0.7);
      
      if (k === -points/2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function animate() {
    if (!data || !data.physics_frames) return;
    const p = data.physics_frames;
    const c = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const w = simCanvas.width / dpr;
    const h = simCanvas.height / dpr;
    const cx = w/2, cy = h/2;
    
    ctx.clearRect(0, 0, w, h);

    // Frame indexing with modulo safety
    let i = Math.floor(frameIdx) % p.x1.length;
    frameIdx += (currentMode === 'pulsation' ? 0.35 : 0.8);

    let x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      x1 = 0; y1 = 0; z1 = 0; x2 = 9999; // Move companion out of view
      r1 = p.r1[i]; 
      mag = p.v_mag[i]; 
      teff = p.teff ? p.teff[i] : 6500; 
      col1 = p.color1[i];
      drawCenteredPlot(w, h, p.v_mag, i);
    } else {
      const isComp = currentMode === 'composite' && c;
      const src = isComp ? c : p;
      const sIdx = i % src.r1.length;
      
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = src.r1[sIdx]; 
      mag = src.v_mag[sIdx]; 
      col1 = src.color1[sIdx];
      teff = p.teff ? p.teff[i] : 6500;
    }

    // Dynamic Scaling logic
    const responsiveZoom = (w < 768) ? (w * 0.4) : (w * 0.28);
    const zoom = (currentMode === 'pulsation') ? (w * 0.022) : responsiveZoom / Math.max(1, bounds.a2);

    if (currentMode !== 'pulsation') {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); 
      ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*0.54, 0, 0, Math.PI*2); 
      ctx.stroke();
    }

    const drawStar = (x, y, r, col, glow) => {
      ctx.fillStyle = col;
      if(glow) { ctx.shadowBlur = r*zoom*1.5; ctx.shadowColor = col; }
      ctx.beginPath(); 
      ctx.arc(cx+x*zoom, cy+y*zoom, Math.max(1.5, r*zoom), 0, Math.PI*2); 
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Z-Sorting (rendering star further away first)
    if (z1 > z2) { 
      drawStar(x2, y2, 12.51, '#f87171', false); 
      drawStar(x1, y1, r1, col1, true); 
    } else { 
      drawStar(x1, y1, r1, col1, true); 
      drawStar(x2, y2, 12.51, '#f87171', false); 
    }

    // UI Updates (with existence checks)
    const magEl = document.getElementById('hud-mag');
    const teffEl = document.getElementById('hud-teff');
    const radEl = document.getElementById('hud-rad');
    const phaseEl = document.getElementById('hud-phase');

    if (magEl) magEl.innerText = mag.toFixed(2);
    if (teffEl) teffEl.innerText = `${Math.round(teff)} K`;
    if (radEl) radEl.innerText = r1.toFixed(2);
    if (phaseEl) phaseEl.innerText = (i / p.x1.length).toFixed(2);

    requestAnimationFrame(animate);
  }
  init();
})();
