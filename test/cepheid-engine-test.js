(function() {
  // ── config ──────────────────────────────────────────────────────────────────
  var MODES         = new Set(['orbital', 'pulsation']);
  var COMPANION_RAD = 12.51;   // R_sun (Espinoza-Arancibia & Pilecki 2025)
  var FALLBACK_COL  = '#ffe066';
  var R_SUN_KM      = 695700;
  var P_ORB_D       = 58.85;
  var P_ORB_S       = P_ORB_D * 86400;
  var P_PULS        = 0.69001; // days
  var T0_ORB        = 2459050.0; // orbital reference epoch HJD (Pilecki+ 2022 Table 1)
  var T0_PULS       = 2459510.64947; // pulsation reference epoch HJD (Fourier r=2 fit to Pilecki RVs)
  var SIN_I         = Math.sin(57 * Math.PI / 180);
  var K1            = 28.5;   // km/s (Pilecki+ 2022 Table 1)
  var K2            = 51.56;  // km/s (Pilecki+ 2022 Table 1)
  var RV_THRESH     = 40;
  var RV_N          = 2400;
  var TRAIL_LEN     = 80;
  var GAMMA_SYS     = 239.97; // km/s (Pilecki+ 2022 Table 1)

  // ── embedded observational data ────────────────────────────────────────────
  // 187 OGLE-IV V-band observations [hjd-2450000, v_mag, err]
  var OGLE_V_RAW = [
    [5260.65957,17.078,0.008],[5267.58314,17.150,0.007],[5446.91815,17.057,0.008],
    [5459.83597,16.916,0.006],[5477.76899,16.889,0.006],[5485.80179,17.254,0.007],
    [5492.80569,17.192,0.008],[5493.82817,17.016,0.008],[5494.80475,17.232,0.008],
    [5495.76190,16.884,0.007],[5497.85791,16.874,0.007],[5499.76516,17.170,0.007],
    [5502.85632,17.102,0.006],[5503.79358,17.214,0.007],[5505.76030,17.245,0.007],
    [5507.79578,17.207,0.007],[5509.76198,17.143,0.006],[5510.79597,17.166,0.006],
    [5511.80606,17.100,0.007],[5512.81494,17.171,0.007],[5514.81718,17.239,0.007],
    [5515.79436,16.902,0.006],[5516.81975,17.241,0.007],[5517.78078,16.905,0.006],
    [5521.76864,17.176,0.010],[5522.76706,16.943,0.007],[5523.72738,17.263,0.009],
    [5524.73678,16.881,0.006],[5525.70272,17.203,0.007],[5526.73953,16.975,0.006],
    [5527.80058,17.217,0.007],[5528.67496,17.202,0.007],[5529.65538,16.971,0.006],
    [5530.73352,17.191,0.007],[5531.81659,17.097,0.006],[5532.72558,17.244,0.006],
    [5533.74548,16.883,0.006],[5534.77892,17.270,0.007],[5535.67971,17.090,0.006],
    [5536.75827,17.227,0.007],[5539.76703,17.205,0.007],[5546.73411,17.026,0.007],
    [5547.79317,17.208,0.007],[5548.76495,17.160,0.007],[5549.78511,17.159,0.007],
    [5550.80713,17.178,0.008],[5553.68434,16.910,0.007],[5556.72571,17.168,0.007],
    [5557.70759,17.165,0.007],[5558.70713,17.076,0.007],[5559.75050,17.174,0.007],
    [5561.65181,17.241,0.007],[5562.77438,16.919,0.006],[5563.70387,17.255,0.007],
    [5565.71040,17.199,0.007],[5566.73995,17.031,0.006],[5582.72890,16.836,0.007],
    [5589.67657,16.963,0.006],[5592.69597,17.262,0.007],[5596.66782,17.054,0.006],
    [5598.64893,16.971,0.006],[5614.61509,17.097,0.007],[5619.60705,17.239,0.006],
    [5622.60546,17.156,0.007],[5623.56815,17.082,0.006],[5625.56129,16.901,0.006],
    [5627.63124,16.935,0.006],[5629.57132,16.905,0.006],[5633.55797,17.180,0.007],
    [5647.55292,16.898,0.006],[5650.54864,17.131,0.006],[5652.55008,17.082,0.006],
    [5656.51796,16.875,0.006],[5659.54757,17.172,0.007],[5670.50101,17.054,0.008],
    [5674.52737,16.858,0.006],[5679.51660,17.109,0.006],[5685.51210,16.786,0.006],
    [5693.47271,17.261,0.007],[5825.84308,17.217,0.007],[5843.88726,17.229,0.007],
    [5854.79544,17.178,0.006],[5863.75821,17.160,0.006],[5867.77492,16.895,0.005],
    [5875.74444,17.180,0.007],[5880.81056,16.933,0.007],[5883.80062,17.203,0.007],
    [5886.81874,17.164,0.007],[5892.78162,17.156,0.006],[5897.77018,17.234,0.007],
    [5910.73680,17.152,0.007],[5924.73350,17.188,0.006],[5932.69733,17.077,0.007],
    [5940.72735,17.034,0.006],[5952.73776,17.086,0.006],[5961.67663,16.985,0.006],
    [5970.63305,16.946,0.006],[5972.71011,17.052,0.006],[5994.53416,17.031,0.008],
    [5994.67369,16.935,0.007],[5995.52897,17.088,0.007],[5995.67303,17.181,0.010],
    [5996.51279,17.209,0.007],[5996.65647,16.913,0.008],[5997.51132,17.040,0.006],
    [5997.66473,17.230,0.008],[5998.54367,17.186,0.006],[5998.66807,17.161,0.007],
    [5999.53890,16.827,0.005],[5999.66103,17.073,0.006],[6000.49175,17.235,0.010],
    [6000.65559,17.172,0.006],[6001.49642,17.076,0.007],[6001.61660,16.897,0.006],
    [6006.54369,17.114,0.006],[6013.58322,17.205,0.006],[6020.55695,17.234,0.007],
    [6193.89478,17.166,0.006],[6226.85738,17.211,0.006],[6229.85812,17.071,0.007],
    [6236.83182,16.851,0.005],[6292.78911,16.889,0.006],[6317.66143,16.991,0.006],
    [6333.65492,17.156,0.006],[6344.62146,17.030,0.005],[6592.83432,16.827,0.005],
    [6600.74469,17.187,0.005],[6685.59638,17.161,0.006],[6687.69604,17.214,0.006],
    [6688.62904,17.156,0.006],[6689.65282,17.054,0.005],[6690.65529,17.154,0.005],
    [6691.67804,17.001,0.005],[6692.69787,17.219,0.005],[6693.64409,16.909,0.004],
    [6694.68977,17.235,0.005],[6695.63489,16.848,0.005],[6696.62245,17.164,0.006],
    [6697.68051,17.097,0.005],[6698.68090,17.166,0.007],[6699.52519,17.218,0.007],
    [6700.55428,16.843,0.005],[6700.67819,17.002,0.006],[6701.54620,17.264,0.007],
    [6701.68172,17.185,0.007],[6702.55196,16.960,0.007],[6702.68457,16.978,0.007],
    [6703.56258,17.194,0.008],[6704.56320,17.050,0.006],[6704.70883,16.895,0.007],
    [6705.55212,17.111,0.005],[6706.63145,17.126,0.006],[6707.64413,17.163,0.006],
    [6708.63181,17.182,0.005],[6709.62621,16.992,0.005],[6710.63554,17.201,0.005],
    [6711.62247,16.915,0.005],[6712.57312,17.265,0.005],[6997.80230,17.160,0.008],
    [7007.75349,17.090,0.006],[7063.65587,17.103,0.006],[7064.71928,17.142,0.006],
    [7065.70435,17.021,0.006],[7066.70004,17.206,0.006],[7067.69589,16.997,0.005],
    [7068.67172,17.243,0.006],[7069.68134,16.848,0.005],[7070.71694,17.213,0.006],
    [7071.72318,16.851,0.005],[7072.70390,17.202,0.007],[7075.64953,17.184,0.006],
    [7076.65465,16.941,0.005],[7077.63346,17.245,0.006],[7078.63331,16.909,0.006],
    [7110.50625,17.025,0.006],[7111.52920,17.212,0.007],[7112.52721,16.945,0.007],
    [7113.52238,17.204,0.007],[7114.53109,16.812,0.006],[7115.52542,17.233,0.007],
    [7116.51354,17.089,0.009],[7117.54233,17.197,0.007],[7118.51542,17.152,0.007],
    [7119.50233,17.018,0.006],[7137.49852,17.102,0.006],[7332.74904,17.095,0.006],
    [7366.72606,17.236,0.006]
  ];

  // 9 spectroscopic RVs from Pilecki et al. (2022, ApJ 940 L48)
  // [hjd-2450000, rv_cepheid, err1, rv_companion, err2]
  var PILECKI_RV_RAW = [
    [9510.80498,271.408,0.148,195.142,0.397],
    [9541.61089,222.409,0.113,281.004,0.479],
    [9556.62074,246.214,0.124,207.792,0.542],
    [9558.63776,251.270,0.128,200.067,0.553],
    [9563.71814,280.680,0.128,188.181,0.397],
    [9566.72085,261.271,0.183,189.594,0.514],
    [9579.64289,255.698,0.292,239.801,0.335],
    [9589.71976,206.661,0.109,285.529,0.421],
    [9604.62569,231.395,0.159,263.152,0.546]
  ];

  // ── state ──────────────────────────────────────────────────────────────────
  var data        = null;
  var currentMode = 'orbital';
  var frameIdx    = 0;
  var maxR1       = 1;

  var rv1 = [], rv2 = [], rvDelta = [];
  var rv_abs_min = 0, rv_abs_max = 0;
  var v_puls_cycle = [];

  var ogle_phased    = [];
  var pilecki_phased = [];
  var phase_offset   = 0;

  var trail1 = [], trail2 = [];

  // ── dom ────────────────────────────────────────────────────────────────────
  var simCanvas = document.getElementById('simCanvas');
  var ctx       = simCanvas ? simCanvas.getContext('2d') : null;
  var preview   = document.getElementById('sim-preview');
  var plotUI    = document.getElementById('hud-plot-container');

  var hud = {
    mag:        document.getElementById('hud-mag'),
    teff:       document.getElementById('hud-teff'),
    rad:        document.getElementById('hud-rad'),
    phase:      document.getElementById('hud-phase'),
    phaseLabel: document.getElementById('hud-phase-label'),
  };

  var bounds = { a1: 0, a2: 0, minV: 99, maxV: -99 };

  // ── helpers ────────────────────────────────────────────────────────────────

  function safeGet(arr, idx, fb) {
    return (arr && arr[idx] !== undefined) ? arr[idx] : fb;
  }

  function hexToRgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function getPlotRect() {
    if (!plotUI) return null;
    var pr = plotUI.getBoundingClientRect();
    var sr = simCanvas.getBoundingClientRect();
    return { px: pr.left - sr.left, py: pr.top - sr.top, pw: pr.width, ph: pr.height };
  }

  function getStarArea() {
    var dpr = window.devicePixelRatio || 1;
    var w = simCanvas.width / dpr;
    var h = simCanvas.height / dpr;
    if (window.innerWidth <= 740) {
      var plot = getPlotRect();
      var star_h = plot ? plot.py - 30 : h * 0.6;
      return { w: w, h: star_h, full_h: h, mobile: true };
    }
    return { w: w, h: h, full_h: h, mobile: false };
  }

  // ── rv precomputation ──────────────────────────────────────────────────────

  function buildRV() {
    rv1 = []; rv2 = []; rvDelta = [];

    // pulsation RV model: Fourier r=2 fit directly to Pilecki RV residuals (R²=0.927)
    // coeffs: [a0, a1, b1, a2, b2] from chi2-minimised fit over phi0 grid
    var PULS_C = [0.1623, 3.3790, -15.6020, -4.3673, -3.2070];
    var Np = 120;
    v_puls_cycle = [];
    for (var i = 0; i < Np; i++) {
      var ph = i / Np;
      var v = PULS_C[0]
            + PULS_C[1] * Math.cos(2 * Math.PI * ph)
            + PULS_C[2] * Math.sin(2 * Math.PI * ph)
            + PULS_C[3] * Math.cos(4 * Math.PI * ph)
            + PULS_C[4] * Math.sin(4 * Math.PI * ph);
      v_puls_cycle.push(v);
    }

    // orbital-only model curves (no pulsation in model lines)
    for (var k = 0; k < RV_N; k++) {
      var phi = k / RV_N;
      var v1 = K1 * Math.sin(2 * Math.PI * phi);
      var v2 = -K2 * Math.sin(2 * Math.PI * phi);
      rv1.push(v1);
      rv2.push(v2);
      rvDelta.push(Math.abs(v1 - v2));
    }

    // y-axis bounds from model + pulsation-corrected Pilecki points
    rv_abs_min = Infinity; rv_abs_max = -Infinity;
    for (var j = 0; j < RV_N; j++) {
      var a1 = rv1[j] + GAMMA_SYS;
      var a2 = rv2[j] + GAMMA_SYS;
      if (a1 < rv_abs_min) rv_abs_min = a1;
      if (a1 > rv_abs_max) rv_abs_max = a1;
      if (a2 < rv_abs_min) rv_abs_min = a2;
      if (a2 > rv_abs_max) rv_abs_max = a2;
    }
    for (var pi = 0; pi < PILECKI_RV_RAW.length; pi++) {
      var row = PILECKI_RV_RAW[pi];
      // pulsation-corrected Cepheid RV for bounds check
      var hjd_pi = row[0] + 2450000.0;
      var pp = (((hjd_pi - T0_PULS) % P_PULS) / P_PULS + 1) % 1;
      var pidx = Math.round(pp * Np) % Np;
      var rv1_corr = row[1] - v_puls_cycle[pidx];
      if (rv1_corr < rv_abs_min) rv_abs_min = rv1_corr;
      if (rv1_corr > rv_abs_max) rv_abs_max = rv1_corr;
      if (row[3] < rv_abs_min) rv_abs_min = row[3];
      if (row[3] > rv_abs_max) rv_abs_max = row[3];
    }
    rv_abs_min -= 12;
    rv_abs_max += 12;
  }

  // ── phase-fold observational data ──────────────────────────────────────────

  function prepareObservationalData() {
    // 1. phase-fold Pilecki data on orbital period, fine-tune offset from companion
    var raw_phases = [];
    for (var i = 0; i < PILECKI_RV_RAW.length; i++) {
      var hjd = PILECKI_RV_RAW[i][0] + 2450000.0;
      raw_phases.push((((hjd - T0_ORB) % P_ORB_D) / P_ORB_D + 1) % 1);
    }

    var best_d = 0, best_sse = Infinity;
    for (var d = 0; d < 1000; d++) {
      var delta = d / 1000;
      var sse = 0;
      for (var j = 0; j < PILECKI_RV_RAW.length; j++) {
        var phi = (raw_phases[j] + delta) % 1;
        var model = -K2 * Math.sin(2 * Math.PI * phi) + GAMMA_SYS;
        var res = model - PILECKI_RV_RAW[j][3];
        sse += res * res;
      }
      if (sse < best_sse) { best_sse = sse; best_d = delta; }
    }
    phase_offset = best_d;

    // 2. store pulsation-corrected Cepheid RVs and raw companion RVs
    var Np = v_puls_cycle.length;
    pilecki_phased = [];
    for (var pi = 0; pi < PILECKI_RV_RAW.length; pi++) {
      var row = PILECKI_RV_RAW[pi];
      var hjd_pi = row[0] + 2450000.0;
      // pulsation phase at this observation using fitted T0_PULS
      var pp = (((hjd_pi - T0_PULS) % P_PULS) / P_PULS + 1) % 1;
      var pidx = Math.round(pp * Np) % Np;
      var rv1_corrected = row[1] - v_puls_cycle[pidx];
      pilecki_phased.push({
        display_phase: (raw_phases[pi] + phase_offset) % 1,
        rv1: rv1_corrected,  // pulsation-subtracted Cepheid RV
        rv2: row[3]          // companion unchanged
      });
    }

    // 3. OGLE V-band scatter phase-folded at P_puls
    var weights = [];
    var max_w = 0;
    for (var oi = 0; oi < OGLE_V_RAW.length; oi++) {
      var w = 1 / (OGLE_V_RAW[oi][2] * OGLE_V_RAW[oi][2]);
      weights.push(w);
      if (w > max_w) max_w = w;
    }
    ogle_phased = [];
    for (var oi2 = 0; oi2 < OGLE_V_RAW.length; oi2++) {
      var r = OGLE_V_RAW[oi2];
      ogle_phased.push({
        phase: (((r[0] + 2450000) % P_PULS) / P_PULS + 1) % 1,
        mag:   r[1],
        alpha: 0.08 + 0.52 * (weights[oi2] / max_w)
      });
    }
  }

  // ── rv plot (orbital mode) ─────────────────────────────────────────────────

  function drawRVPlot(frameI) {
    var box = getPlotRect();
    if (!box || !rv1.length) return;
    var px = box.px, py = box.py, pw = box.pw, ph = box.ph;

    var N = data.physics_frames.x1.length;
    var rawPhi = frameI / N;
    var currentPhi = (rawPhi + phase_offset) % 1;
    var rvI = Math.round(currentPhi * RV_N) % RV_N;

    var inset = 28, padTop = 26, padBottom = 36;
    var drawH = ph - padTop - padBottom;
    var range = rv_abs_max - rv_abs_min;
    var yScale = drawH / range;
    var plotW = pw - 2 * inset;
    var nPts = 600;
    var step = plotW / nPts;

    var rvToY = function(v) { return py + padTop + (rv_abs_max - v) * yScale; };

    ctx.save();

    // ── RV color bands between curves ──
    // approach band (rv1 > rv2 -> Cepheid approaching faster): warm amber tint
    // recession band (rv2 > rv1): cool red tint
    for (var kb = 0; kb < nPts; kb++) {
      var ri_b = Math.round(kb / nPts * RV_N) % RV_N;
      var y1b = rvToY(rv1[ri_b] + GAMMA_SYS);
      var y2b = rvToY(rv2[ri_b] + GAMMA_SYS);
      var yTop = Math.min(y1b, y2b);
      var yBot = Math.max(y1b, y2b);
      var bandH = yBot - yTop;
      if (bandH < 1) continue;
      // amber where Cepheid is above companion (rv1>rv2), red otherwise
      var col_b = (rv1[ri_b] > rv2[ri_b])
        ? 'rgba(196,162,88,0.07)'
        : 'rgba(248,113,113,0.07)';
      ctx.fillStyle = col_b;
      ctx.fillRect(px + inset + kb * step, yTop, step + 0.5, bandH);
    }

    // delta-rv >= 40 green shading (on top of color bands)
    for (var k = 0; k < nPts; k++) {
      var ri = Math.round(k / nPts * RV_N) % RV_N;
      if (rvDelta[ri] >= RV_THRESH) {
        ctx.fillStyle = 'rgba(134,239,172,0.07)';
        ctx.fillRect(px + inset + k * step, py + padTop, step + 0.5, drawH);
      }
    }

    // gamma line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px + inset, rvToY(GAMMA_SYS));
    ctx.lineTo(px + pw - inset, rvToY(GAMMA_SYS));
    ctx.stroke();
    ctx.setLineDash([]);

    // model curves
    var drawCurve = function(arr, color) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (var k2 = 0; k2 <= nPts; k2++) {
        var ri2 = Math.round(k2 / nPts * RV_N) % RV_N;
        var cx2 = px + inset + k2 * step;
        var cy2 = rvToY(arr[ri2] + GAMMA_SYS);
        k2 === 0 ? ctx.moveTo(cx2, cy2) : ctx.lineTo(cx2, cy2);
      }
      ctx.stroke();
    };
    drawCurve(rv1, '#ffe4a0');
    drawCurve(rv2, '#f87171');

    // pilecki scatter
    for (var pi2 = 0; pi2 < pilecki_phased.length; pi2++) {
      var pp = pilecki_phased[pi2];
      var dpx = px + inset + pp.display_phase * plotW;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(dpx, rvToY(pp.rv1), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe4a0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(dpx, rvToY(pp.rv2), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f87171';
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // cursor line at current orbital phase
    var curX = px + inset + currentPhi * plotW;
    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,0.65)';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(curX, py + padTop);
    ctx.lineTo(curX, py + ph - padBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── tracking dots on cursor ──
    // Companion: orbital model only
    var compY = rvToY(rv2[rvI] + GAMMA_SYS);
    ctx.beginPath();
    ctx.arc(curX, compY, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f87171';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cepheid: orbital model + pulsation RV from Fourier model at current pulsation phase
    var dt_meta = (data.metadata && data.metadata.dt) ? data.metadata.dt : P_PULS / 120;
    var t_now = frameI * dt_meta;
    var puls_ph = (((t_now - T0_PULS + 2450000) % P_PULS) / P_PULS + 1) % 1;
    var PULS_C = [0.1623, 3.3790, -15.6020, -4.3673, -3.2070];
    var v_puls_now = PULS_C[0]
      + PULS_C[1] * Math.cos(2 * Math.PI * puls_ph)
      + PULS_C[2] * Math.sin(2 * Math.PI * puls_ph)
      + PULS_C[3] * Math.cos(4 * Math.PI * puls_ph)
      + PULS_C[4] * Math.sin(4 * Math.PI * puls_ph);
    var cepY = rvToY(rv1[rvI] + GAMMA_SYS + v_puls_now);
    ctx.beginPath();
    ctx.arc(curX, cepY, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe4a0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // y-axis ticks — brighter, larger font
    ctx.font = '10px \'JetBrains Mono\', monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    var ts = 20;
    for (var tv = Math.ceil(rv_abs_min / ts) * ts; tv <= Math.floor(rv_abs_max / ts) * ts; tv += ts) {
      var tly = rvToY(tv);
      if (tly > py + padTop + 6 && tly < py + ph - padBottom - 4)
        ctx.fillText(tv.toFixed(0), px + inset - 4, tly);
    }

    // x-axis phase labels
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px \'JetBrains Mono\', monospace';
    for (var xp = 0; xp <= 1; xp += 0.25) {
      ctx.fillText('\u03C6=' + xp.toFixed(2), px + inset + xp * plotW, py + ph - padBottom + 5);
    }

    // attribution
    ctx.font = '9px \'JetBrains Mono\', monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText('orbital model, i=57\u00B0, pulsation-corrected \u00B7 Pilecki+ 2022', px + inset, py + ph - 8);

    // legend — bottom left above attribution, dark pill background
    var legends = [
      { label: 'Cepheid',        col: '#ffe4a0' },
      { label: 'Companion',      col: '#f87171' },
      { label: '\u2022 Pilecki+ 2022', col: 'rgba(255,255,255,0.5)' },
    ];
    ctx.font = '10px \'JetBrains Mono\', monospace';
    ctx.textBaseline = 'middle';
    var legX = px + inset;
    var legY = py + padTop + 12;
    var legSpacing = 18;
    for (var li = 0; li < legends.length; li++) {
      var leg = legends[li];
      var lw = ctx.measureText(leg.label).width + 10;
      ctx.fillStyle = 'rgba(7,9,26,0.65)';
      ctx.beginPath();
      ctx.roundRect(legX - 2, legY + li*legSpacing - 8, lw, 16, 2);
      ctx.fill();
      ctx.fillStyle = leg.col;
      ctx.fillText(leg.label, legX + 3, legY + li * legSpacing);
    }

    // title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '10px \'JetBrains Mono\', monospace';
    ctx.fillStyle = 'rgba(96,165,250,0.65)';
    ctx.fillText('ORBITAL RADIAL VELOCITIES \u00B7 KM S\u207B\u00B9', px + inset, py + 8);

    ctx.restore();
  }

  // ── light curve (pulsation mode) ───────────────────────────────────────────

  function drawLightCurve(magArr, frameI) {
    var box = getPlotRect();
    if (!box || !magArr) return;
    var px = box.px, py = box.py, pw = box.pw, ph = box.ph;

    var inset = 16, padTop = 22, padBottom = 10;
    var drawH = ph - padTop - padBottom;
    var magRange = Math.max(0.1, bounds.maxV - bounds.minV);
    var midMag = (bounds.minV + bounds.maxV) / 2;
    var nPts = 240;
    var step = (pw - inset * 2) / nPts;

    var dt = (data.metadata && data.metadata.dt) ? data.metadata.dt : P_PULS / 120;
    var fpp = Math.round(P_PULS / dt); // frames per pulsation cycle
    var t_cur = frameI * dt;
    var phi_cur = (t_cur % P_PULS) / P_PULS;

    var magToY = function(m) {
      return py + padTop + drawH / 2 - ((m - midMag) * (drawH / magRange) * 0.72);
    };

    ctx.save();

    // ogle scatter (behind curve)
    for (var oi = 0; oi < ogle_phased.length; oi++) {
      var op = ogle_phased[oi];
      var dp = op.phase - phi_cur;
      dp = dp - Math.round(dp); // wrap to [-0.5, 0.5]
      var df = dp * fpp;

      for (var c = -3; c <= 3; c++) {
        var off = df + c * fpp;
        if (off >= -nPts / 2 && off <= nPts / 2) {
          var ox = px + pw / 2 + off * step;
          var oy = magToY(op.mag);
          ctx.beginPath();
          ctx.arc(ox, oy, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#60a5fa';
          ctx.globalAlpha = op.alpha;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // fourier fit curve
    ctx.beginPath();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (var k = -nPts / 2; k <= nPts / 2; k++) {
      var fi = (frameI + k + magArr.length) % magArr.length;
      var lx = px + pw / 2 + k * step;
      var ly = magToY(magArr[fi]);
      k === -nPts / 2 ? ctx.moveTo(lx, ly) : ctx.lineTo(lx, ly);
    }
    ctx.stroke();

    // center cursor
    ctx.save();
    ctx.strokeStyle = 'rgba(96,165,250,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#60a5fa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + pw / 2, py + padTop);
    ctx.lineTo(px + pw / 2, py + ph - padBottom);
    ctx.stroke();
    ctx.restore();

    // title
    ctx.font = '9px \'JetBrains Mono\', monospace';
    ctx.fillStyle = 'rgba(96,165,250,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('V-BAND LIGHT CURVE \u00B7 PULSATION PHASE', px + 12, py + 14);

    // legend
    ctx.textAlign = 'right';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('Fourier fit', px + pw - inset, py + padTop + 10);
    ctx.fillStyle = 'rgba(96,165,250,0.5)';
    ctx.fillText('\u2022 OGLE photometry', px + pw - inset, py + padTop + 22);

    ctx.restore();
  }

  // ── star drawing with tasteful linear bloom ───────────────────────────────

  function drawStar(spx, spy, pr, col, is_cepheid, brightness) {
    ctx.save();
    var c = col || FALLBACK_COL;
    var b = (brightness !== undefined) ? Math.max(0, Math.min(1, brightness)) : 0.5;

    // bloom: fixed radius, linear alpha only, single gradient pass
    var bloom_r = pr * 3.2;
    var bloom_a = is_cepheid ? (0.07 + b * 0.13) : 0.06;
    var grad = ctx.createRadialGradient(spx, spy, pr * 0.5, spx, spy, bloom_r);
    grad.addColorStop(0,   hexToRgba(c, bloom_a));
    grad.addColorStop(0.5, hexToRgba(c, bloom_a * 0.35));
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(spx, spy, bloom_r, 0, Math.PI * 2);
    ctx.fill();

    // subtle core glow
    ctx.shadowBlur  = pr * (is_cepheid ? 1.8 + b * 1.2 : 1.4);
    ctx.shadowColor = c;

    // disc
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(spx, spy, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── main loop ──────────────────────────────────────────────────────────────

  function animate() {
    if (!data || !data.physics_frames) return;
    var p = data.physics_frames;
    var dpr = window.devicePixelRatio || 1;
    var cw = simCanvas.width / dpr;
    var ch = simCanvas.height / dpr;

    ctx.clearRect(0, 0, cw, ch);

    var i = Math.floor(frameIdx) % p.x1.length;
    frameIdx += (currentMode === 'pulsation' ? 0.4 : 0.8);

    var x1, y1, z1, x2, y2, z2, r1, mag, teff, col1;

    if (currentMode === 'pulsation') {
      x1 = 0; y1 = 0; z1 = 0;
      x2 = 99999; y2 = 0; z2 = -1;
      r1 = p.r1[i]; mag = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(p.color1, i, FALLBACK_COL);
    } else {
      x1 = p.x1[i]; y1 = p.y1[i]; z1 = p.z1[i];
      x2 = p.x2[i]; y2 = p.y2[i]; z2 = p.z2[i];
      r1 = p.r1[i]; mag = p.v_mag[i];
      teff = safeGet(p.teff, i, null);
      col1 = safeGet(p.color1, i, FALLBACK_COL);
    }

    // brightness for bloom
    var mag_range = bounds.maxV - bounds.minV;
    var brightness = mag_range > 0 ? 1 - (mag - bounds.minV) / mag_range : 0.5;

    // star drawing area
    var star = getStarArea();
    var sw = star.w, sh = star.h;

    var zoom, cx, cy;
    if (currentMode === 'pulsation') {
      zoom = (Math.min(sw, sh) * 0.14) / maxR1;
      cx = sw / 2;
      cy = sh * 0.35;
    } else {
      zoom = (Math.min(sw, sh) * 0.32) / bounds.a2;
      cx = sw / 2;
      cy = sh / 2;
    }

    // screen positions
    var s1x = cx + x1 * zoom, s1y = cy + y1 * zoom;
    var s2x = cx + x2 * zoom, s2y = cy + y2 * zoom;
    var pr1 = Math.max(2, r1 * zoom);
    var pr2 = Math.max(2, COMPANION_RAD * zoom);

    // ── orbital ellipses ──
    if (currentMode !== 'pulsation') {
      var inc = 0.545;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(248,113,113,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a2 * zoom, bounds.a2 * zoom * inc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196,162,88,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, bounds.a1 * zoom, bounds.a1 * zoom * inc, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // barycenter
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
      ctx.stroke();
      ctx.restore();
    }

    // ── plots ──
    if (currentMode === 'pulsation') {
      drawLightCurve(p.v_mag, i);
    } else {
      drawRVPlot(i);
    }

    // ── trails: cinematic tapered lines ──
    if (currentMode !== 'pulsation') {
      trail1.push({ x: s1x, y: s1y, col: col1 || FALLBACK_COL });
      trail2.push({ x: s2x, y: s2y });
      if (trail1.length > TRAIL_LEN) trail1.shift();
      if (trail2.length > TRAIL_LEN) trail2.shift();

      ctx.save();
      // Cepheid trail — temperature-coloured tapered stroke
      if (trail1.length > 2) {
        for (var ti = 1; ti < trail1.length; ti++) {
          var tf = ti / trail1.length;           // 0=tail, 1=head
          var tw = tf * tf * 3.5;               // quadratic taper: thin tail, thick head
          var ta = tf * tf * 0.55;
          ctx.beginPath();
          ctx.moveTo(trail1[ti-1].x, trail1[ti-1].y);
          ctx.lineTo(trail1[ti].x,   trail1[ti].y);
          ctx.strokeStyle = hexToRgba(trail1[ti].col, ta);
          ctx.lineWidth   = tw;
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
      }
      // Companion trail — red, same taper
      if (trail2.length > 2) {
        for (var ti2 = 1; ti2 < trail2.length; ti2++) {
          var tf2 = ti2 / trail2.length;
          var tw2 = tf2 * tf2 * 2.8;
          var ta2 = tf2 * tf2 * 0.45;
          ctx.beginPath();
          ctx.moveTo(trail2[ti2-1].x, trail2[ti2-1].y);
          ctx.lineTo(trail2[ti2].x,   trail2[ti2].y);
          ctx.strokeStyle = 'rgba(248,113,113,' + ta2.toFixed(3) + ')';
          ctx.lineWidth   = tw2;
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── stars (z-sorted) ──
    if (z1 < z2) {
      drawStar(s2x, s2y, pr2, '#f87171', false, 0);
      drawStar(s1x, s1y, pr1, col1, true, brightness);
    } else {
      drawStar(s1x, s1y, pr1, col1, true, brightness);
      drawStar(s2x, s2y, pr2, '#f87171', false, 0);
    }

    // ── star labels: always-on, dark pill background ──
    if (currentMode !== 'pulsation') {
      ctx.save();
      ctx.font = '12px \'JetBrains Mono\', monospace';
      ctx.textBaseline = 'middle';

      var drawLabel = function(lx, ly, text, fgCol) {
        var pad = 5, tw = ctx.measureText(text).width;
        var rx = lx, ry = ly - 9, rw = tw + pad*2, rh = 18;
        ctx.fillStyle = 'rgba(7,9,26,0.72)';
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 3);
        ctx.fill();
        ctx.fillStyle = fgCol;
        ctx.globalAlpha = 0.92;
        ctx.fillText(text, lx + pad, ly);
        ctx.globalAlpha = 1;
      };

      drawLabel(s1x + pr1 + 9, s1y, 'Cepheid',   '#ffe4a0');
      drawLabel(s2x + pr2 + 9, s2y, 'Companion', '#f87171');
      ctx.restore();
    }

    // ── mobile separator ──
    if (star.mobile) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, sh + 10);
      ctx.lineTo(sw, sh + 10);
      ctx.stroke();
      ctx.restore();
    }

    // ── hud ──
    if (hud.mag) hud.mag.innerText = mag.toFixed(1);
    if (hud.teff) hud.teff.innerText = teff !== null ? Math.round(teff) + ' K' : '~6490 K';
    if (hud.rad) hud.rad.innerText = r1.toFixed(1) + ' R\u2609';

    if (currentMode === 'pulsation') {
      if (hud.phaseLabel) hud.phaseLabel.innerHTML = '\u03C6<sub>puls</sub> Pulsation phase';
      var pdt = (data.metadata && data.metadata.dt) ? data.metadata.dt : P_PULS / 120;
      var pp = ((i * pdt) % P_PULS) / P_PULS;
      if (hud.phase) hud.phase.innerText = pp.toFixed(3);
    } else {
      if (hud.phaseLabel) hud.phaseLabel.innerHTML = '\u03C6<sub>orb</sub> Orbital phase';
      if (hud.phase) hud.phase.innerText = (i / p.x1.length).toFixed(3);
    }

    requestAnimationFrame(animate);
  }

  // ── mode switching ─────────────────────────────────────────────────────────

  window.setMode = function(mode) {
    if (!MODES.has(mode)) return;
    currentMode = mode;
    trail1 = []; trail2 = [];

    document.querySelectorAll('.btn-mode').forEach(function(b) {
      b.style.background = 'transparent';
      b.style.color = 'rgba(255,255,255,0.4)';
      b.style.boxShadow = 'none';
    });
    var btn = document.getElementById('btn-' + mode);
    if (btn) {
      btn.style.background = 'rgba(255,255,255,0.18)';
      btn.style.color = '#ffffff';
      btn.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.3)';
    }
  };

  // ── resize ─────────────────────────────────────────────────────────────────

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var rect = simCanvas.getBoundingClientRect();
    simCanvas.width = rect.width * dpr;
    simCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trail1 = []; trail2 = [];
  }

  // ── init ───────────────────────────────────────────────────────────────────

  async function init() {
    if (!simCanvas || !ctx) return;
    try {
      // stage 1: boot JSON — starts sim immediately
      var scriptEl = document.querySelector('script[data-boot-json]');
      var bootUrl  = (scriptEl && scriptEl.dataset.bootJson) || '/data/master_data_boot.json';
      var fullUrl  = (scriptEl && scriptEl.dataset.fullJson) || '/data/master_data.json';

      var r = await fetch(bootUrl);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' loading boot JSON');
      data = await r.json();
      var p = data.physics_frames;
      var req = ['v_mag', 'x1', 'y1', 'z1', 'x2', 'y2', 'z2', 'r1'];
      for (var ri = 0; ri < req.length; ri++) {
        if (!Array.isArray(p[req[ri]])) throw new Error('Missing: physics_frames.' + req[ri]);
      }

      for (var mi = 0; mi < p.v_mag.length; mi++) {
        if (p.v_mag[mi] < bounds.minV) bounds.minV = p.v_mag[mi];
        if (p.v_mag[mi] > bounds.maxV) bounds.maxV = p.v_mag[mi];
      }
      bounds.a1 = Math.max.apply(null, p.x1.map(Math.abs));
      bounds.a2 = Math.max.apply(null, p.x2.map(Math.abs));
      maxR1 = Math.max.apply(null, p.r1);

      buildRV();
      prepareObservationalData();

      if (preview) preview.style.display = 'none';
      simCanvas.style.opacity = '1';
      if (plotUI) plotUI.style.opacity = '1';

      window.addEventListener('resize', resize);
      resize();
      setMode('orbital');
      animate();

      // stage 2: fetch full JSON in background, swap seamlessly
      fetch(fullUrl).then(function(r2) {
        if (!r2.ok) return;
        return r2.json();
      }).then(function(fullData) {
        if (!fullData) return;
        data = fullData;
        var p2 = data.physics_frames;
        bounds.minV = 99; bounds.maxV = -99;
        for (var mi2 = 0; mi2 < p2.v_mag.length; mi2++) {
          if (p2.v_mag[mi2] < bounds.minV) bounds.minV = p2.v_mag[mi2];
          if (p2.v_mag[mi2] > bounds.maxV) bounds.maxV = p2.v_mag[mi2];
        }
        bounds.a1 = Math.max.apply(null, p2.x1.map(Math.abs));
        bounds.a2 = Math.max.apply(null, p2.x2.map(Math.abs));
        maxR1 = Math.max.apply(null, p2.r1);
        buildRV();
        prepareObservationalData();
      }).catch(function(e) {
        console.warn('Full data load failed, running on boot data:', e);
      });

    } catch (e) {
      console.error('Cepheid sim init error:', e);
    }
  }

  init();
})();
