/**
 * ============================================================
 * 不随便煎饼 - 微信小游戏主入口 (game.js)
 * ============================================================
 * 作用：
 *   1. 获取微信小游戏运行环境（屏幕尺寸、DPR）。
 *   2. 创建 Canvas 并适配高清屏（物理像素缩放）。
 *   3. 实例化 Game 核心类，绑定触摸事件，启动游戏主循环。
 * ============================================================
 */

const Game = require('./js/core.js');

// 获取系统信息，用于计算画布尺寸与像素比
const sysInfo = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 设备像素比（DPR），解决高清屏模糊问题
const dpr = sysInfo.pixelRatio;
const width = sysInfo.windowWidth;
const height = sysInfo.windowHeight;

// 按 DPR 放大画布实际像素，再通过 scale 缩小逻辑坐标系，
// 保证在 Retina 屏上渲染清晰
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);

// 实例化游戏核心，传入已缩放后的上下文与逻辑宽高
const game = new Game(ctx, width, height);

// ------------------- 触摸事件绑定 -------------------

/**
 * wx.onTouchStart - 手指按下
 * 将触摸坐标转发给 game.handleTouch，用于按钮点击、
 * 锅位拾取煎饼等交互。
 */
wx.onTouchStart((e) => {
  if (e.touches && e.touches[0]) {
    game.handleTouch(e.touches[0].clientX, e.touches[0].clientY);
  }
});

/**
 * wx.onTouchMove - 手指移动
 * 主要用于拖动煎饼到顾客或垃圾桶。
 */
wx.onTouchMove((e) => {
  if (e.touches && e.touches[0]) {
    game.handleTouchMove(e.touches[0].clientX, e.touches[0].clientY);
  }
});

/**
 * wx.onTouchEnd - 手指抬起
 * 触发上菜判定、丢弃判定，或把煎饼放回锅里。
 */
wx.onTouchEnd(() => {
  game.handleTouchEnd();
});

// ------------------- 游戏主循环 -------------------

/**
 * loop - 游戏主循环
 * 每帧调用 game.update() 更新逻辑，再调用 game.render() 绘制画面。
 * 使用 requestAnimationFrame 保证与屏幕刷新率同步。
 */
function loop() {
  game.update();
  game.render();
  requestAnimationFrame(loop);
}

// 启动主循环
requestAnimationFrame(loop);
