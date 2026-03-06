const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 512; // scale factor

  // Background - warm paper tone matching app
  ctx.fillStyle = '#eae8e3';
  ctx.beginPath();
  const r = 112 * s; // iOS rounded rect radius
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  // Subtle radial gradient overlay
  const grad = ctx.createRadialGradient(size * 0.3, size * 0.2, 0, size * 0.5, size * 0.5, size * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0.03)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  // Chart area
  const padL = 80 * s, padR = 60 * s;
  const padT = 140 * s, padB = 160 * s;
  const w = size - padL - padR;
  const h = size - padT - padB;

  // Three lines representing Nettovermögen, Assets, Liabilities
  const lines = [
    { // Main line (Nettovermögen) - bold, dark
      points: [0.45, 0.50, 0.42, 0.35, 0.28, 0.22, 0.18, 0.15, 0.12, 0.10, 0.13, 0.08],
      color: '#1a1a18',
      width: 3.5 * s,
      fillAlpha: 0.08,
      dots: true
    },
    { // Assets line - green tint, medium
      points: [0.55, 0.58, 0.52, 0.48, 0.40, 0.35, 0.30, 0.28, 0.25, 0.22, 0.26, 0.20],
      color: '#3a5e42',
      width: 2 * s,
      fillAlpha: 0.06,
      dots: false
    },
    { // Liabilities line - red tint, thin, bottom
      points: [0.82, 0.81, 0.80, 0.79, 0.78, 0.78, 0.77, 0.77, 0.76, 0.76, 0.77, 0.76],
      color: '#6e3b30',
      width: 1.5 * s,
      fillAlpha: 0.05,
      dots: false
    }
  ];

  // Draw fills first, then lines on top
  lines.forEach(line => {
    const pts = line.points.map((y, i) => ({
      x: padL + (i / (line.points.length - 1)) * w,
      y: padT + y * h
    }));

    // Fill
    ctx.beginPath();
    drawSmoothLine(ctx, pts);
    ctx.lineTo(padL + w, padT + h);
    ctx.lineTo(padL, padT + h);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(line.color, line.fillAlpha);
    ctx.fill();
  });

  lines.forEach(line => {
    const pts = line.points.map((y, i) => ({
      x: padL + (i / (line.points.length - 1)) * w,
      y: padT + y * h
    }));

    // Line
    ctx.beginPath();
    drawSmoothLine(ctx, pts);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots on main line
    if (line.dots) {
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * s, 0, Math.PI * 2);
        ctx.fillStyle = line.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#eae8e3';
        ctx.fill();
      });
    }
  });

  // Subtle horizontal grid lines
  ctx.strokeStyle = 'rgba(26,26,24,0.06)';
  ctx.lineWidth = 1 * s;
  for (let i = 1; i <= 3; i++) {
    const y = padT + (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
  }

  // Save
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log(`✓ ${filename} (${size}x${size})`);
}

function drawSmoothLine(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const cp = (pts[i + 1].x - pts[i].x) * 0.35;
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
