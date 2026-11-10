/* chart.js — hand-drawn <canvas> charts. No library, no CDN, no external requests. */
(function () {
  'use strict';

  function setup(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 358;
    var h = canvas.clientHeight || 160;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function niceNum(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a >= 1) return '$' + v.toFixed(2);
    if (a >= 0.0001) return '$' + v.toFixed(4);
    return '$' + v.toExponential(2);
  }

  function drawGrid(g, min, max) {
    var ctx = g.ctx, padL = 52, padR = 8, padT = 8, padB = 20;
    var iw = g.w - padL - padR, ih = g.h - padT - padB;
    ctx.strokeStyle = '#2c2c2e'; ctx.fillStyle = '#8e8e93';
    ctx.lineWidth = 1; ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var i = 0; i <= 3; i++) {
      var v = min + (max - min) * i / 3;
      var y = padT + ih - ih * i / 3;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
      ctx.fillText(niceNum(v), 4, y);
    }
    return { padL: padL, padR: padR, padT: padT, padB: padB, iw: iw, ih: ih };
  }

  // Home line chart: points [{ts, value}], marks [{ts, mint, kind}]
  function drawLine(canvas, points, marks) {
    var g = setup(canvas), ctx = g.ctx;
    ctx.clearRect(0, 0, g.w, g.h);
    if (!points || points.length === 0) {
      ctx.fillStyle = '#8e8e93'; ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('No data yet', g.w / 2, g.h / 2);
      return;
    }
    var vals = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.1; min -= pad; max += pad;
    var box = drawGrid(g, min, max);
    var t0 = Date.parse(points[0].ts), t1 = Date.parse(points[points.length - 1].ts);
    if (!(t1 > t0)) t1 = t0 + 60000;
    function X(ts) { return box.padL + box.iw * (Date.parse(ts) - t0) / (t1 - t0); }
    function Y(v) { return box.padT + box.ih * (1 - (v - min) / (max - min)); }
    var up = vals[vals.length - 1] >= vals[0];
    ctx.strokeStyle = up ? '#34c759' : '#ff3b30'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.beginPath();
    points.forEach(function (p, i) { i ? ctx.lineTo(X(p.ts), Y(p.value)) : ctx.moveTo(X(p.ts), Y(p.value)); });
    ctx.stroke();
    (marks || []).forEach(function (m) {
      var x = X(m.ts), y = Y(m.value != null ? m.value : vals[vals.length - 1]);
      ctx.fillStyle = m.kind === 'bought' ? '#34c759' : '#ff3b30';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    var lp = points[points.length - 1];
    ctx.fillStyle = up ? '#34c759' : '#ff3b30';
    ctx.beginPath(); ctx.arc(X(lp.ts), Y(lp.value), 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // Coin chart: candles [{ts, price, volume_m5}] drawn as a price line
  // (per-candle OHLC is not stored in the writer JSON).
  function drawCandles(canvas, candles) {
    var pts = (candles || []).map(function (c) { return { ts: c.ts, value: c.price }; });
    drawLine(canvas, pts, []);
  }

  window.GrokCharts = { drawLine: drawLine, drawCandles: drawCandles };
})();
