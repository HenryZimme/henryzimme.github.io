(function() {
  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');
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
    } catch (e) { console.error("Load Error:", e); }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    plotUI.classList.toggle('opacity-100', mode === 'pulsation');
    plotUI.classList.toggle('opacity-0', mode !== 'pulsation');
    
    document.querySelectorAll('.btn-mode').forEach(b => {
      b.classList.remove('bg-white/5', 'text-white');
      b.classList.add('text-white/40');
    });
    const activeBtn = document.getElementById(`btn-${mode}`);
    activeBtn.classList.add('bg-white/5', 'text-white');
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = starCanvas.getBoundingClientRect();
    starCanvas.width = rect.width * dpr;
    starCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function drawWidePlot(w, h, pData, currentIdx) {
    const rect = plotUI.getBoundingClientRect();
    // Offset relative to the actual simulation canvas
    const simRect = starCanvas.getBoundingClientRect();
    const px = rect.left - simRect.left;
    const py = rect.top - simRect.top;
    const pw = rect.width;
    const ph = rect.height;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';

    const points = (w < 768) ? 80 : 150; // Fewer points on mobile for performance
    const step = pw / points;
    const magRange = bounds.maxV - bounds.minV;

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

  function animate() {
    if (!data) return;
    const p = data.physics_frames;
    const c = data.composite_frames;
    const dpr = window.devicePixelRatio || 1;
    const w = starCanvas.width / dpr;
    const h = starCanvas.height / dpr;
    const cx = w/2, cy = h/2;
    ctx.clearRect(0, 0, w, h);

    let i, x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;
    
    // 1. SELECT DATA
    if (currentMode === 'pulsation') {
      i = Math.floor(frameIdx) % p.x1.length;
      frameIdx += 0.4; // Fixed cinematic speed
      x1 = 0; y1 = 0; z1 = 0; x2 = 5000;
      r1 = p.r1[i]; mag = p.v_mag[i]; teff = p.teff[i]; col1 = p.color1[i];
      drawWidePlot(w, h, p.v_mag, i);
    } else {
      i = Math.floor(frameIdx) % p.x1.length;
      frameIdx += (currentMode === 'composite' ? 0.7 : 1.2);
      const isComp = currentMode === 'composite';
      const src = isComp ? c : p;
      const sIdx = i % src.r1.length;
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = src.r1[sIdx]; mag = src.v_mag[sIdx]; col1 = src.color1[sIdx];
      teff = p.teff ? p.teff[i] : 6490;
    }

    // 2. DYNAMIC SCALING
    // Orbital Zoom adapts to screen width
    const baseZoom = (w < 768) ? (w * 0.45) : (w * 0.3);
    const zoom = (currentMode === 'pulsation') ? (w * 0.025) : baseZoom / bounds.a2;

    // 3. DRAW ORBITS
    if (currentMode !== 'pulsation') {
      const orbitScale = 0.54;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a2*zoom, bounds.a2*zoom*orbitScale, 0, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, bounds.a1*zoom, bounds.a1*zoom*orbitScale, 0, 0, Math.PI*2); ctx.stroke();
    }

    // 4. DRAW STARS
    const draw = (x, y, r, col, glow) => {
      ctx.fillStyle = col;
      if(glow) { ctx.shadowBlur = r*zoom*1.2; ctx.shadowColor = col; }
      ctx.beginPath(); ctx.arc(cx+x*zoom, cy+y*zoom, Math.max(1, r*zoom), 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (z1 > z2) { 
      draw(x2, y2, 12.51, '#f87171', false); 
      draw(x1, y1, r1, col1, true); 
    } else { 
      draw(x1, y1, r1, col1, true); 
      draw(x2, y2, 12.51, '#f87171', false); 
    }

    // 5. UPDATE UI
    document.getElementById('hud-mag').innerText = mag.toFixed(2);
    document.getElementById('hud-teff').innerText = `${Math.round(teff)} K`;
    document.getElementById('hud-rad').innerText = `${r1.toFixed(2)}`;
    document.getElementById('hud-phase').innerText = (i / p.x1.length).toFixed(2);

    requestAnimationFrame(animate);
  }
  init();
})();
