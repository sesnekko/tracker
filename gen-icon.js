const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 512;

  // Background - warm paper tone
  ctx.fillStyle = '#eae8e3';
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, 112 * s);
  ctx.fill();

  // Subtle radial warmth
  const grad = ctx.createRadialGradient(size * 0.25, size * 0.25, 0, size * 0.5, size * 0.5, size * 0.75);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.02)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, 112 * s);
  ctx.fill();

  // Clip to rounded rect
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, 112 * s);
  ctx.clip();

  // Flowing waves - organic, abstract, not chart-like
  const waves = [
    { yBase: 0.62, amp: 0.035, freq: 0.8, phase: 0,    color: '#1a1a18', alpha: 0.05, width: 0 },
    { yBase: 0.55, amp: 0.04,  freq: 0.7, phase: 0.5,  color: '#1a1a18', alpha: 0.06, width: 0 },
    { yBase: 0.47, amp: 0.045, freq: 0.9, phase: 1.2,  color: '#1a1a18', alpha: 0.07, width: 0 },
    { yBase: 0.38, amp: 0.05,  freq: 0.6, phase: 2.0,  color: '#3a5e42', alpha: 0.08, width: 0 },
    { yBase: 0.30, amp: 0.04,  freq: 1.0, phase: 0.8,  color: '#1a1a18', alpha: 0.04, width: 0 },
    // Accent lines (stroked, no fill)
    { yBase: 0.44, amp: 0.06,  freq: 0.55, phase: 1.5, color: '#1a1a18', alpha: 0.18, width: 2.5, fill: false },
    { yBase: 0.35, amp: 0.05,  freq: 0.75, phase: 0.3, color: '#3a5e42', alpha: 0.14, width: 1.8, fill: false },
    { yBase: 0.56, amp: 0.04,  freq: 0.65, phase: 2.2, color: '#6e3b30', alpha: 0.10, width: 1.2, fill: false },
  ];

  waves.forEach(wave => {
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = -20 * s + t * (size + 40 * s);
      const y = size * wave.yBase +
        Math.sin(t * Math.PI * 2 * wave.freq + wave.phase) * size * wave.amp +
        Math.sin(t * Math.PI * 3.3 * wave.freq + wave.phase * 1.7) * size * wave.amp * 0.4;
      pts.push({ x, y });
    }

    ctx.beginPath();
    drawSmoothLine(ctx, pts);

    if (wave.fill !== false) {
      // Filled wave band
      ctx.lineTo(size + 20 * s, size + 20 * s);
      ctx.lineTo(-20 * s, size + 20 * s);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(wave.color, wave.alpha);
      ctx.fill();
    } else {
      // Stroked line
      ctx.strokeStyle = hexToRgba(wave.color, wave.alpha);
      ctx.lineWidth = wave.width * s;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  });

  ctx.restore();

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log(`✓ ${filename} (${size}x${size})`);
}

function drawSmoothLine(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const cp = (pts[i + 1].x - pts[i].x) * 0.4;
    ctx.bezierCurveTo(
      pts[i].x + cp, pts[i].y,
      pts[i + 1].x - cp, pts[i + 1].y,
      pts[i + 1].x, pts[i + 1].y
    );
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');
