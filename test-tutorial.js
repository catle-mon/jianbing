/**
 * ============================================================
 * 煎饼摊求生 - 新手教程回归测试 (test-tutorial.js)
 * ============================================================
 * 用法：node test-tutorial.js
 * 说明：mock wx 后直接 require core.js，以 new Game(null, 375, 667)
 *       驱动纯逻辑路径（构造函数不触 ctx），覆盖教程全部关键场景。
 * ============================================================
 */

// ---- wx mock（需在调用涉及 wx 的方法前就绪）----
global.wx = {
  getStorageSync: () => false,
  setStorageSync: () => {}
};

const assert = require('assert');
const Game = require('./js/core.js');

let passed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push('  ✅ ' + name);
  } catch (e) {
    results.push('  ❌ ' + name + '\n     ' + e.message);
  }
}

// ---- 工具函数 ----
function newTutorialGame() {
  const g = new Game(null, 375, 667);
  g.startTutorial();
  return g;
}
function batterBtnCenter(g) {
  const b = g.buttons.find(b => b.id === 'batter');
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
function panCenter(g, i = 0) {
  return { x: g.pans[i].x, y: g.pans[i].y };
}
function customerCenter(g) {
  const c = g.customers[0];
  return { x: c.x, y: c.y };
}
// 强制 update 产生指定 dt（update 内部用 Date.now() - lastTime）
function tick(g, dt) {
  g.lastTime = Date.now() - dt;
  g.update();
}
// 把教程推进到 step 2（下锅 → 饼熟 → 翻面）
function advanceToStep2(g) {
  const bb = batterBtnCenter(g);
  g.handleTutorialTouch(bb.x, bb.y);
  const pc = panCenter(g);
  g.handleTouchMove(pc.x, pc.y);
  g.handleTutorialTouchEnd();
  assert.strictEqual(g.tutorial.step, 1, '下幕后应进入 step 1');
  const pancake = g.pans[0].pancake;
  pancake.elapsed = pancake.cookTime * 0.5;
  tick(g, 16);
  assert.strictEqual(pancake.needsFlip, true, '进度 50% 时应出现翻面星');
  g.handleTutorialTouch(pc.x, pc.y);
  assert.strictEqual(g.tutorial.step, 2, '翻面后应进入 step 2');
  return g.pans[0].pancake;
}

console.log('煎饼摊求生 · 新手教程回归测试\n');

// 1. 拖拽主流程：面饼按钮 → 拖到锅位松开 → 下锅、step=1
test('1. 拖拽主流程（拿面糊 → 拖到锅位松开下锅）', () => {
  const g = newTutorialGame();
  assert.strictEqual(g.state, 'tutorial');
  assert.strictEqual(g.tutorial.step, 0);
  const bb = batterBtnCenter(g);
  g.handleTutorialTouch(bb.x, bb.y);
  assert.ok(g.heldIngredient, '点击面饼按钮后应手持面糊');
  const pc = panCenter(g);
  g.handleTouchMove(pc.x, pc.y);
  g.handleTutorialTouchEnd();
  assert.ok(g.pans[0].pancake, '锅位里应有饼');
  assert.strictEqual(g.tutorial.step, 1);
  assert.strictEqual(g.heldIngredient, null, '下锅后手持应清空');
});

// 2. 点按流程：松手不在锅位 → 面糊保留；再点空锅位 → 下锅
test('2. 点按流程（sticky 原料，松手不丢，点锅位下锅）', () => {
  const g = newTutorialGame();
  const bb = batterBtnCenter(g);
  g.handleTutorialTouch(bb.x, bb.y);
  assert.ok(g.heldIngredient);
  // 原地松手（不在锅位上）
  g.handleTutorialTouchEnd();
  assert.ok(g.heldIngredient, '松手位置无效时面糊应保留');
  assert.strictEqual(g.tutorial.step, 0);
  // 直接点击空锅位
  const pc = panCenter(g);
  g.handleTutorialTouch(pc.x, pc.y);
  assert.ok(g.pans[0].pancake, '点按锅位后锅里应有饼');
  assert.strictEqual(g.tutorial.step, 1);
  assert.strictEqual(g.heldIngredient, null);
});

// 3. 早翻面提示：饼还生时点锅位 → 不翻面，给提示
test('3. 早翻面提示（未出★时点锅位不翻面）', () => {
  const g = newTutorialGame();
  const bb = batterBtnCenter(g);
  g.handleTutorialTouch(bb.x, bb.y);
  const pc = panCenter(g);
  g.handleTouchMove(pc.x, pc.y);
  g.handleTutorialTouchEnd();
  assert.strictEqual(g.tutorial.step, 1);
  g.pans[0].pancake.elapsed = 0; // 确保还是生的
  const textCount = g.floatingTexts.length;
  g.handleTutorialTouch(pc.x, pc.y);
  assert.strictEqual(g.tutorial.step, 1, '步骤不应推进');
  assert.strictEqual(g.pans[0].pancake.phase, 'first', '不应翻面');
  assert.ok(g.floatingTexts.length > textCount, '应出现提示浮字');
  assert.strictEqual(g.floatingTexts[g.floatingTexts.length - 1].text, '等★出现再翻面');
});

// 4. 翻面推进（核心回归）：翻面后 tutorial.step 必须变为 2
test('4. 翻面推进（核心回归：翻面后 step=2）', () => {
  const g = newTutorialGame();
  const bb = batterBtnCenter(g);
  g.handleTutorialTouch(bb.x, bb.y);
  const pc = panCenter(g);
  g.handleTouchMove(pc.x, pc.y);
  g.handleTutorialTouchEnd();
  const pancake = g.pans[0].pancake;
  pancake.elapsed = pancake.cookTime * 0.5;
  tick(g, 16);
  assert.strictEqual(pancake.needsFlip, true, '完美窗口内应有翻面星');
  g.handleTutorialTouch(pc.x, pc.y);
  assert.strictEqual(pancake.phase, 'second', '应翻到第二面');
  assert.strictEqual(g.tutorial.step, 2, '关键回归：翻面后 step 必须为 2');
});

// 5. 教程不煎糊：进度钳制在 99.9%，永远不 burnt
test('5. 教程不煎糊（进度钳制，永远不 burnt）', () => {
  const g = newTutorialGame();
  advanceToStep2(g); // 已在第二面
  const pancake = g.pans[0].pancake;
  pancake.elapsed = pancake.side2Time * 0.999;
  for (let i = 0; i < 20; i++) {
    tick(g, 5000); // 超大 dt
    assert.notStrictEqual(pancake.state, 'burnt', '教程中饼不应煎糊');
  }
  // 第一面同样验证
  const g2 = newTutorialGame();
  const bb = batterBtnCenter(g2);
  g2.handleTutorialTouch(bb.x, bb.y);
  const pc = panCenter(g2);
  g2.handleTouchMove(pc.x, pc.y);
  g2.handleTutorialTouchEnd();
  const p2 = g2.pans[0].pancake;
  for (let i = 0; i < 20; i++) {
    tick(g2, 5000);
    assert.notStrictEqual(p2.state, 'burnt', '第一面也不应煎糊');
  }
  assert.strictEqual(p2.needsFlip, true, '钳制在 99.9% 时应始终可翻');
});

// 6. 拖拽上菜：取饼 → 拖到顾客松开 → step=3、顾客 eating
test('6. 拖拽上菜（取饼 → 拖到顾客松开）', () => {
  const g = newTutorialGame();
  advanceToStep2(g);
  const pc = panCenter(g);
  g.handleTutorialTouch(pc.x, pc.y);
  assert.ok(g.heldPancake, '应拿起已翻面的饼');
  const cc = customerCenter(g);
  g.handleTouchMove(cc.x, cc.y);
  g.handleTutorialTouchEnd();
  assert.strictEqual(g.tutorial.step, 3, '上菜后应进入 step 3');
  assert.strictEqual(g.customers[0].state, 'eating', '顾客应在就餐');
  assert.strictEqual(g.heldPancake, null);
});

// 7. 点按上菜：取饼后直接点击顾客 → step=3
test('7. 点按上菜（取饼后点击顾客）', () => {
  const g = newTutorialGame();
  advanceToStep2(g);
  const pc = panCenter(g);
  g.handleTutorialTouch(pc.x, pc.y);
  assert.ok(g.heldPancake);
  const cc = customerCenter(g);
  g.handleTutorialTouch(cc.x, cc.y);
  assert.strictEqual(g.tutorial.step, 3, '点按顾客应完成上菜');
  assert.strictEqual(g.customers[0].state, 'eating');
});

// 8. 跳过教程：点击跳过按钮 → 直接开局
test('8. 跳过教程（跳过按钮 → playing）', () => {
  const g = newTutorialGame();
  const sb = g.tutorialSkipBtn;
  assert.ok(sb, '跳过按钮应已定义');
  g.handleTutorialTouch(sb.x + sb.w / 2, sb.y + sb.h / 2);
  assert.strictEqual(g.state, 'playing', '跳过后应直接开局');
});

// 9. 完成教程：step 3 点击「开始营业」→ playing
test('9. 完成教程（step 3 点开始营业 → playing）', () => {
  const g = newTutorialGame();
  g.tutorial.step = 3;
  g.tutorialContinueBtn = { x: 0, y: 0, w: 100, h: 50 };
  g.handleTutorialTouch(10, 10);
  assert.strictEqual(g.state, 'playing');
});

// 10. 浮动文字不再冻结：update 后 y 变化、life 减少
test('10. 浮动文字不再冻结（教程中 update 会推进浮字）', () => {
  const g = newTutorialGame();
  g.spawnText(100, 100, '测试', '#FFF');
  const t = g.floatingTexts[0];
  const y0 = t.y, life0 = t.life;
  tick(g, 100);
  assert.ok(t.y !== y0, '浮字 y 应变化');
  assert.ok(t.life < life0, '浮字 life 应减少');
});

// ---- 汇总 ----
console.log(results.join('\n'));
console.log('\n通过 ' + passed + ' / ' + results.length + ' 个用例');
if (passed !== results.length) {
  process.exit(1);
} else {
  console.log('🎉 全部通过');
}
