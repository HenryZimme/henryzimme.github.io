/**
 * Binary Cepheid Engine v1.0
 * Handles 60FPS rendering of precomputed physics data.
 */

let data = null;
let currentMode = 'orbital';
let frameIdx = 0;
const canvas = document.getElementById('starCanvas');
const ctx = canvas.getContext('2d');
const preview = document.getElementById('preview');

// Configuration
const COLORS = {
  companion: '#3b82f6',
  orbit: 'rgba(255, 255, 255, 0.08)',
  label: '#94a3b8'
};

async function init() {
  try {
    const response = await fetch('data/master_data.json');
    data = await response.json();
    
    // Hide preview, show canvas
    preview.classList.add('hidden');
    canvas.classList.replace('opacity-0', 'opacity-100');
    
    window.addEventListener('resize', resize);
    resize();
    animate();
  } catch (e) {
    console.error("Data load failed:", e);
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
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

// Logic to show 2 sig figs or 0 decimals
const formatVal = (val) => {
  if (val >= 100) return Math.round(val);
  return val.toPrecision(2);
};

function animate() {
  if (!data) return;

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  const physics = data.physics_frames;
  const comp = data.composite_frames;
  const meta = data.metadata;

  // 1. Mode Indexing
  let i;
  if (currentMode === 'pulsation') {
    // Loop only the first pulsation cycle (120 frames)
    i = frameIdx % 120;
  } else {
    i = frameIdx % physics.t.length;
  }
  frameIdx++;

  // 2. Adaptive Zoom Logic
  // Find the max orbital reach to keep everything in view
  const maxExtent = Math.max(...physics.x2.map(Math.abs)) * 1.5;
  const zoom = Math.min(w, h) / (maxExtent * 2);
  const cx = w / 2;
  const cy = h / 2;

  // 3. Extract Frame Data
  const isComp = currentMode === 'composite';
  const r1 = isComp ? comp.r1_composite[i] : physics.r1[i];
  const mag = isComp ? comp.v_mag_composite[i] : physics.v_mag[i];
  const color = physics.colors[i];

  // 4. Update HUD
  document.getElementById('hud-mag').innerText = `MAG: ${formatVal(mag)}`;
  document.getElementById('hud-teff').innerText = `TEFF: ${formatVal(physics.teff[i])} K`;
  document.getElementById('hud-rad').innerText = `RAD: ${formatVal(r1)} R☉`;

  // 5. Draw Orbits (Static)
  ctx.strokeStyle = COLORS.orbit;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  // Simplified circular projection for the orbit trail
  ctx.ellipse(cx, cy, (maxExtent/1.5) * zoom, (maxExtent/1.5) * zoom * Math.cos(57 * Math.PI/180), 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6. Draw Stars (Z-Sorted)
  const drawCepheid = () => {
    const x = cx + physics.x1[i] * zoom;
    const y = cy + physics.y1[i] * zoom;
    const rad = r1 * zoom;
    
    // Core
    ctx.shadowBlur = rad * 1.5;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const drawCompanion = () => {
    const x = cx + physics.x2[i] * zoom;
    const y = cy + physics.y2[i] * zoom;
    const rad = meta.r2_scaled * zoom;
    
    ctx.fillStyle = COLORS.companion;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI*2);
    ctx.fill();
  };

  // Depth Sort based on Z
  if (physics.z1[i] > physics.z2[i]) {
    drawCompanion(); drawCepheid();
  } else {
    drawCepheid(); drawCompanion();
  }

  requestAnimationFrame(animate);
}

init();
