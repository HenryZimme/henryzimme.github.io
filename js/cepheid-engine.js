(function() {
  /**
   * Binary Cepheid Engine v2.0
   * Fixes: ID Mismatch, Live Lightcurve Plotting, Dynamic Orbits, HUD Telemetry.
   */

  let data = null;
  let currentMode = 'orbital';
  let frameIdx = 0;

  // CRITICAL FIX: Targeting 'starCanvas' (camelCase) to match the HTML
  const starCanvas = document.getElementById('starCanvas'); 
  const ctx = starCanvas ? starCanvas.getContext('2d') : null;
  const preview = document.getElementById('preview');

  // Pre-calculated bounds for the plot and orbits
  let bounds = { a1: 0, a2: 0, minMag: 999, maxMag: -999 };

  const COLORS = {
    cepheid: '#60a5fa',   // Blue
    companion: '#f87171', // Red
    orbit1: 'rgba(96, 165, 250, 0.25)', 
    orbit2: 'rgba(248, 113, 113, 0.25)',
    plotLine: '#2ecc71',
    plotDot: '#e74c3c'
  };

  async function init() {
    if (!starCanvas || !ctx) {
      console.error("Cepheid Canvas not found!");
      return;
    }

    try {
      const response = await fetch('data/master_data.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}: Data not found.`);
      data = await response.json();
      
      const p = data.physics_frames;
      
      // Calculate global bounds once for orbits and plotting
      for (let i = 0; i < p.x1.length; i++) {
        if (Math.abs(p.x1[i]) > bounds.a1) bounds.a1 = Math.abs(p.x1[i]);
        if (Math.abs(p.x2[i]) > bounds.a2) bounds.a2 = Math.abs(p.x2[i]);
        if (p.v_mag[i] < bounds.minMag) bounds.minMag = p.v_mag[i];
        if (p.v_mag[i] > bounds.maxMag) bounds.maxMag = p.v_mag[i];
      }

      // Force hide the sync message and reveal canvas
      if (preview) {
        preview.style.opacity = '0';
        setTimeout(() => preview.style.display = 'none', 500);
      }
      starCanvas.classList.replace('opacity-0', 'opacity-100');
      
      window.addEventListener('resize', resize);
      resize();
      animate();
    } catch (e) {
      console.error("Engine Load Error:", e);
      if (preview) {
        preview.innerHTML = `<div class="text-red-500 font-mono text-xs text-center">ERROR LOADING DATA<br>${e.message}</div>`;
      }
    }
  }

  window.setMode = function(mode) {
    currentMode = mode;
    frameIdx = 0; 
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

  function drawLightCurvePlot(w, h, currentMag, phase, dataArray) {
    const plotW = Math.min(220, w * 0.3);
    const plotH = 60;
    const plotX = w - plotW - 24; 
    const plotY = h - plotH - 35; // Positioned right above the text

    // Background for plot
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // Draw full light curve path
    ctx.beginPath();
    ctx.strokeStyle = COLORS.plotLine;
    ctx.lineWidth = 1.5;
    
    const magRange = bounds.maxMag - bounds.minMag;
    
    for (let j = 0; j < dataArray.length; j += 2) {
      const px = plotX + (j / dataArray.length) * plotW;
      // Invert Y: Lower magnitude is brighter (higher up on graph)
      const normalizedY = (dataArray[j] - bounds.minMag) / magRange;
      const py = plotY + (normalizedY * plotH);
      
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw current position indicator dot
    const dotX = plotX + phase * plotW;
    const normalizedDotY = (currentMag - bounds.minMag) / magRange;
    const dotY = plotY + (normalizedDotY * plotH);

    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.plotDot;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
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
    let i, x1, y1, z1, x2, y2, z2, r1, mag, teff;
    const orbitScale = Math.cos(57 * Math.PI / 180); // 57-degree inclination

    if (currentMode === 'orbital') {
      i = frameIdx % p.x1.length;
      frameIdx += 2; 
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = p.r1[i];
      mag = p.v_mag[i];
      teff = p.teff ? p.teff[i] : 6490;
    } else if (currentMode === 'composite') {
      i = frameIdx % c.r1.length;
      frameIdx += 1;
      const pi = i % p.x1.length;
      x1 = p.x1[pi]; y1 = p.y1[pi]; z1 = p.z1[pi];
      x2 = p.x2[pi]; y2 = p.y2[pi]; z2 = p.z2[pi];
      r1 = c.r1[i];
      mag = c.v_mag[i];
      teff = p.teff ? p.teff[pi] : 6490;
    } else { // Pulsation Focus
      i = frameIdx % p.x1.length;
      frameIdx += 1;
      x1 = 0; y1 = 0; z1 = 0; // Lock Cepheid to center
      x2 = 2000; // Hide Companion
      r1 = p.r1[i];
      mag = p.v_mag[i];
      teff = p.teff ? p.teff[i] : 6490;
    }

    // 2. Zoom Logic
    const zoom = (currentMode === 'pulsation') 
      ? (Math.min(w, h) * 0.018)  // Zoomed in for pulsation
      : (Math.min(w, h) * 0.4) / bounds.a2;

    // 3. Dynamic Dual Barycentric Orbits
    if (currentMode !== 'pulsation') {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      
      // Orbit for Star 2 (Companion)
      ctx.strokeStyle = COLORS.orbit2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2 * zoom, bounds.a2 * zoom * orbitScale, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Orbit for Star 1 (Cepheid)
      ctx.strokeStyle = COLORS.orbit1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1 * zoom, bounds.a1 * zoom * orbitScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }

    // 4. Render Stars
    const drawStar = (x, y, r, baseColor, isCepheid) => {
      // Create a slight color shift based on radius to simulate pulsation hue
      let finalColor = baseColor;
      if (isCepheid) {
        // Brighten the blue slightly when compressed (smaller radius = hotter)
        const radFactor = (r - 13.0) / 1.5; 
        ctx.shadowBlur = r * zoom * (1.2 - radFactor*0.2);
        ctx.shadowColor = baseColor;
      }
      
      ctx.fillStyle = finalColor;
      ctx.beginPath();
      ctx.arc(cx + x * zoom, cy + y * zoom, Math.max(3, r * zoom), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    if (z1 > z2) {
      drawStar(x2, y2, 12.51, COLORS.companion, false);
      drawStar(x1, y1, r1, COLORS.cepheid, true);
    } else {
      drawStar(x1, y1, r1, COLORS.cepheid, true);
      drawStar(x2, y2, 12.51, COLORS.companion, false);
    }

    // 5. Update HUD Telemetry
    if (document.getElementById('hud-mag')) {
      document.getElementById('hud-mag').innerText = `MAG: ${mag.toFixed(2)}`;
      document.getElementById('hud-teff').innerText = `TEFF: ${Math.round(teff)} K`;
      document.getElementById('hud-rad').innerText = `RAD: ${r1.toFixed(2)} R☉`;
    }

    // 6. Draw On-Canvas Lightcurve Plot
    const phase = (i / p.x1.length);
    const plotData = (currentMode === 'composite') ? c.v_mag : p.v_mag;
    drawLightCurvePlot(w, h, mag, phase, plotData);

    requestAnimationFrame(animate);
  }

  init();
})();
