/**
 * ============================================================
 * 煎饼摊求生 - 绘图工具函数 (utils.js)
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

module.exports = { fillRoundRect, strokeRoundRect };
