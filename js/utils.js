/**
 * ============================================================
 * 不随便煎饼 - 绘图工具函数 (utils.js)
 * ============================================================
 * 作用：提供 Canvas 2D 上下文的辅助绘图函数。
 *       目前主要封装圆角矩形的填充与描边，避免各模块重复实现。
 * ============================================================
 */

/**
 * fillRoundRect - 绘制并填充一个圆角矩形
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {number} x - 矩形左上角 X 坐标
 * @param {number} y - 矩形左上角 Y 坐标
 * @param {number} w - 矩形宽度
 * @param {number} h - 矩形高度
 * @param {number} r - 圆角半径
 * 说明：当矩形宽高不足以容纳直径为 2r 的圆时，自动缩小半径避免溢出。
 */
function fillRoundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * strokeRoundRect - 绘制圆角矩形描边（不填充）
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {number} x - 矩形左上角 X 坐标
 * @param {number} y - 矩形左上角 Y 坐标
 * @param {number} w - 矩形宽度
 * @param {number} h - 矩形高度
 * @param {number} r - 圆角半径
 */
function strokeRoundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawIngredientIcon(ctx, id, x, y, size = 20) {
  const s = size;
  if (ctx && Array.isArray(ctx._iconLog)) {
    ctx._iconLog.push({ kind: 'ingredient', id, x, y, size });
  }
  ctx.save();
  ctx.translate(x, y);

  if (id === 'batter' || id === 'base') {
    const r = s * 0.45;
    const gradient = ctx.createRadialGradient(-s * 0.12, -s * 0.14, 1, 0, 0, r);
    gradient.addColorStop(0, '#FFF4B8');
    gradient.addColorStop(0.74, '#F3C65C');
    gradient.addColorStop(1, '#C9852E');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7A4B32'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.stroke();
    ctx.fillStyle = 'rgba(128,72,31,0.22)';
    [[-0.16, -0.08], [0.16, 0.1], [0.05, -0.18]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.055, 0, Math.PI * 2); ctx.fill();
    });
  } else if (id === 'egg') {
    ctx.fillStyle = '#FFFDF4';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.38, s * 0.28, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#E0C99A'; ctx.lineWidth = Math.max(1, s * 0.06); ctx.stroke();
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath(); ctx.arc(s * 0.03, s * 0.01, s * 0.15, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'ham') {
    ctx.fillStyle = '#FF8A80';
    fillRoundRect(ctx, -s * 0.36, -s * 0.18, s * 0.72, s * 0.36, s * 0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    fillRoundRect(ctx, -s * 0.26, -s * 0.08, s * 0.52, s * 0.07, s * 0.03);
    ctx.strokeStyle = '#B74E48'; ctx.lineWidth = Math.max(1, s * 0.05);
    strokeRoundRect(ctx, -s * 0.36, -s * 0.18, s * 0.72, s * 0.36, s * 0.1);
  } else if (id === 'lettuce') {
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.38, s * 0.24, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.05); ctx.lineTo(s * 0.22, -s * 0.05); ctx.stroke();
  } else if (id === 'crispy') {
    ctx.save();
    ctx.rotate(0.18);
    ctx.fillStyle = '#FFB74D';
    fillRoundRect(ctx, -s * 0.28, -s * 0.28, s * 0.56, s * 0.56, s * 0.08);
    ctx.strokeStyle = '#A86418'; ctx.lineWidth = Math.max(1, s * 0.06);
    strokeRoundRect(ctx, -s * 0.28, -s * 0.28, s * 0.56, s * 0.56, s * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(-s * 0.18, 0); ctx.lineTo(s * 0.18, 0); ctx.stroke();
    ctx.restore();
  } else if (id === 'scallion') {
    ctx.fillStyle = '#81C784';
    [[-0.16, 0], [0.04, -0.12], [0.18, 0.08], [-0.02, 0.14]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.1, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.33, 0, Math.PI * 2); ctx.stroke();
  } else if (id === 'sauce') {
    ctx.fillStyle = '#8D6E63';
    ctx.beginPath();
    ctx.arc(-s * 0.12, -s * 0.02, s * 0.16, 0, Math.PI * 2);
    ctx.arc(s * 0.09, -s * 0.04, s * 0.19, 0, Math.PI * 2);
    ctx.arc(0, s * 0.13, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4E342E'; ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.restore();
}

function drawActionIcon(ctx, id, x, y, size = 20) {
  if (ctx && Array.isArray(ctx._iconLog)) {
    ctx._iconLog.push({ kind: 'action', id, x, y, size });
  }
  ctx.save();
  ctx.translate(x, y);
  const s = size;
  if (id === 'speed') {
    ctx.strokeStyle = '#FFF4D2'; ctx.lineWidth = Math.max(2, s * 0.12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.34, s * 0.2); ctx.lineTo(s * 0.18, -s * 0.05); ctx.stroke();
    ctx.fillStyle = '#F5F7F7';
    fillRoundRect(ctx, s * 0.08, -s * 0.18, s * 0.32, s * 0.22, s * 0.05);
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const r = i % 2 === 0 ? s * 0.2 : s * 0.09;
      ctx.lineTo(Math.cos(a) * r, -s * 0.3 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  } else if (id === 'patience') {
    ctx.fillStyle = '#FFE0B2';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263238';
    ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.07, s * 0.04, 0, Math.PI * 2); ctx.arc(s * 0.12, -s * 0.07, s * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#263238'; ctx.lineWidth = Math.max(1.4, s * 0.07);
    ctx.beginPath(); ctx.arc(0, s * 0.02, s * 0.16, 0.2, Math.PI - 0.2); ctx.stroke();
  } else if (id === 'slot') {
    ctx.fillStyle = '#26353A';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8EA0A5'; ctx.lineWidth = Math.max(2, s * 0.08); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(-s * 0.04, -s * 0.04, s * 0.3, Math.PI * 1.12, Math.PI * 1.75); ctx.stroke();
  } else if (id === 'container') {
    ctx.fillStyle = '#B7C5C8';
    fillRoundRect(ctx, -s * 0.42, -s * 0.22, s * 0.84, s * 0.44, s * 0.08);
    ctx.strokeStyle = '#40545A'; ctx.lineWidth = Math.max(1.5, s * 0.06);
    strokeRoundRect(ctx, -s * 0.42, -s * 0.22, s * 0.84, s * 0.44, s * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.06); ctx.lineTo(s * 0.28, -s * 0.06); ctx.stroke();
  } else if (id === 'purchase') {
    ctx.fillStyle = '#FFF7E2';
    fillRoundRect(ctx, -s * 0.32, -s * 0.1, s * 0.64, s * 0.42, s * 0.08);
    ctx.strokeStyle = '#8A6B22'; ctx.lineWidth = Math.max(1.5, s * 0.06);
    strokeRoundRect(ctx, -s * 0.32, -s * 0.1, s * 0.64, s * 0.42, s * 0.08);
    ctx.fillStyle = '#FFD54F';
    ctx.fillRect(-s * 0.2, -s * 0.28, s * 0.4, s * 0.12);
    ctx.strokeStyle = '#8A6B22'; ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.12, Math.PI, 0); ctx.stroke();
  }
  ctx.restore();
}

module.exports = { fillRoundRect, strokeRoundRect, drawIngredientIcon, drawActionIcon };
