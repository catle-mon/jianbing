/**
 * 不随便煎饼 - 教程与核心交互回归测试
 * 用法：node test-tutorial.js
 */

global.wx = {
  getStorageSync: () => false,
  setStorageSync: () => {}
};

const assert = require('assert');
const Game = require('./js/core.js');
const { Pancake } = require('./js/entities.js');

let passed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push('  ✅ ' + name);
  } catch (error) {
    results.push('  ❌ ' + name + '\n     ' + error.message);
  }
}

function tick(game, dt) {
  game.lastTime = Date.now() - dt;
  game.update();
}

function buttonCenter(game, id) {
  const button = game.buttons.find(item => item.id === id);
  return { x: button.x + button.w / 2, y: button.y + button.h / 2 };
}

function panCenter(game, index = 0) {
  return { x: game.pans[index].x, y: game.pans[index].y };
}

function customerCenter(game) {
  const customer = game.customers[0];
  return { x: customer.x, y: customer.y };
}

function newTutorialGame() {
  const game = new Game(null, 375, 667);
  game.startTutorial();
  return game;
}

function createMockContext() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const texts = [];
  return {
    texts,
    clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arcTo: noop,
    arc: noop, ellipse: noop, fill: noop, stroke: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setLineDash: noop, fillText: text => { texts.push(String(text)); },
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient
  };
}

function enterPractice(game) {
  game.tutorialContinueBtn = { x: 0, y: 0, w: 100, h: 50 };
  game.handleTutorialTouch(10, 10);
  assert.strictEqual(game.tutorial.step, 1, '开场确认后应进入面糊步骤');
}

function placeTutorialBatter(game, mode = 'drag') {
  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTutorialTouch(batter.x, batter.y);
  if (mode === 'drag') {
    game.handleTouchMove(pan.x, pan.y);
    game.handleTutorialTouchEnd();
  } else {
    game.handleTutorialTouchEnd();
    assert.ok(game.heldIngredient, '点选面糊后应保留选择');
    game.handleTutorialTouch(pan.x, pan.y);
  }
  assert.ok(game.pans[0].pancake, '面糊应进入锅位');
  assert.strictEqual(game.tutorial.step, 2, '下锅后应进入加蛋步骤');
}

function advanceToFlip(game, eggMode = 'drag') {
  enterPractice(game);
  placeTutorialBatter(game);
  addTutorialEgg(game, eggMode);
  return game.pans[0].pancake;
}

function addTutorialEgg(game, mode = 'drag') {
  const egg = buttonCenter(game, 'egg');
  const pan = panCenter(game);
  game.handleTutorialTouch(egg.x, egg.y);
  if (mode === 'drag') {
    game.handleTouchMove(pan.x, pan.y);
    game.handleTutorialTouchEnd();
  } else {
    game.handleTutorialTouchEnd();
    assert.ok(game.heldIngredient, '点选鸡蛋后应保留选择');
    game.handleTutorialTouch(pan.x, pan.y);
  }
  assert.deepStrictEqual(game.pans[0].pancake.toppings, ['egg']);
  assert.strictEqual(game.tutorial.step, 3, '加鸡蛋后应进入翻面步骤');
}

function advanceToServing(game) {
  const pancake = advanceToFlip(game);
  pancake.elapsed = pancake.cookTime * 0.5;
  tick(game, 16);
  const pan = panCenter(game);
  game.handleTutorialTouch(pan.x, pan.y);
  assert.strictEqual(game.tutorial.step, 4, '翻面后应进入上菜步骤');
  assert.strictEqual(pancake.phase, 'second');
  game.flipAnimations.forEach(animation => { animation.start -= animation.duration; });
  tick(game, 16);
  pancake.elapsed = pancake.side2Time * 0.4;
  tick(game, 16);
  assert.strictEqual(pancake.state, 'perfect');
  return pancake;
}

console.log('不随便煎饼 · 教程与核心交互回归测试\n');

test('1. 开场会讲订单，示范顾客实际需要鸡蛋', () => {
  const game = newTutorialGame();
  assert.strictEqual(game.tutorial.step, 0);
  assert.deepStrictEqual(game.customers[0].orderToppings, ['egg']);
  enterPractice(game);
});

test('2. 教程支持拖动面糊下锅', () => {
  const game = newTutorialGame();
  enterPractice(game);
  placeTutorialBatter(game, 'drag');
});

test('3. 教程支持先点面糊再点锅位', () => {
  const game = newTutorialGame();
  enterPractice(game);
  placeTutorialBatter(game, 'tap');
});

test('4. 第一面火候不足时不能提前翻面', () => {
  const game = newTutorialGame();
  const pancake = advanceToFlip(game);
  const pan = panCenter(game);
  pancake.elapsed = 0;
  game.handleTutorialTouch(pan.x, pan.y);
  assert.strictEqual(game.tutorial.step, 3);
  assert.strictEqual(pancake.phase, 'first');
  assert.strictEqual(game.floatingTexts.at(-1).text, '等★出现再翻面');
});

test('5. 加蛋后翻面会进入上菜步骤并创建铲子动画', () => {
  const game = newTutorialGame();
  const pancake = advanceToFlip(game);
  pancake.elapsed = pancake.cookTime * 0.5;
  tick(game, 16);
  const pan = panCenter(game);
  game.handleTutorialTouch(pan.x, pan.y);
  assert.strictEqual(game.tutorial.step, 4);
  assert.strictEqual(pancake.flipPerfect, true);
  assert.strictEqual(game.flipAnimations.length, 1);
});

test('6. 教程支持拖动鸡蛋加料', () => {
  const game = newTutorialGame();
  enterPractice(game);
  placeTutorialBatter(game);
  addTutorialEgg(game, 'drag');
});

test('7. 教程支持先点鸡蛋再点锅位', () => {
  const game = newTutorialGame();
  enterPractice(game);
  placeTutorialBatter(game);
  addTutorialEgg(game, 'tap');
});

test('8. 教程第一面和第二面都不会煎糊', () => {
  const game = newTutorialGame();
  enterPractice(game);
  placeTutorialBatter(game);
  const firstSide = game.pans[0].pancake;
  for (let i = 0; i < 10; i++) tick(game, 5000);
  assert.notStrictEqual(firstSide.state, 'burnt');

  const game2 = newTutorialGame();
  const secondSide = advanceToFlip(game2);
  secondSide.elapsed = secondSide.cookTime * 0.5;
  tick(game2, 16);
  const pan = panCenter(game2);
  game2.handleTutorialTouch(pan.x, pan.y);
  for (let i = 0; i < 10; i++) tick(game2, 5000);
  assert.notStrictEqual(secondSide.state, 'burnt');
});

test('9. 教程支持拖动成品上菜', () => {
  const game = newTutorialGame();
  advanceToServing(game);
  const pan = panCenter(game);
  game.handleTutorialTouch(pan.x, pan.y);
  const customer = customerCenter(game);
  game.handleTouchMove(customer.x, customer.y);
  game.handleTutorialTouchEnd();
  assert.strictEqual(game.tutorial.step, 5);
  assert.strictEqual(game.customers[0].state, 'eating');
});

test('10. 教程支持先点成品再点顾客上菜', () => {
  const game = newTutorialGame();
  advanceToServing(game);
  const pan = panCenter(game);
  game.handleTutorialTouch(pan.x, pan.y);
  assert.ok(game.heldPancake);
  const customer = customerCenter(game);
  game.handleTutorialTouch(customer.x, customer.y);
  assert.strictEqual(game.tutorial.step, 5);
  assert.strictEqual(game.customers[0].state, 'eating');
});

test('11. 教程可以跳过，也可以从总结页开始营业', () => {
  const skipped = newTutorialGame();
  const skip = skipped.tutorialSkipBtn;
  skipped.handleTutorialTouch(skip.x + skip.w / 2, skip.y + skip.h / 2);
  assert.strictEqual(skipped.state, 'playing');

  const completed = newTutorialGame();
  completed.tutorial.step = 5;
  completed.tutorialContinueBtn = { x: 0, y: 0, w: 100, h: 50 };
  completed.handleTutorialTouch(10, 10);
  assert.strictEqual(completed.state, 'playing');
});

test('12. 教程中的粒子文字会继续更新', () => {
  const game = newTutorialGame();
  game.spawnText(100, 100, '测试', '#FFF');
  const text = game.floatingTexts[0];
  const oldY = text.y;
  const oldLife = text.life;
  tick(game, 100);
  assert.notStrictEqual(text.y, oldY);
  assert.ok(text.life < oldLife);
});

test('13. 正式游戏支持拖动和点选两种面糊下锅方式', () => {
  const dragged = new Game(null, 375, 667);
  dragged.startGame();
  const batterA = buttonCenter(dragged, 'batter');
  const panA = panCenter(dragged);
  dragged.handleTouch(batterA.x, batterA.y);
  dragged.handleTouchMove(panA.x, panA.y);
  dragged.handleTouchEnd();
  assert.ok(dragged.pans[0].pancake);

  const tapped = new Game(null, 375, 667);
  tapped.startGame();
  const batterB = buttonCenter(tapped, 'batter');
  const panB = panCenter(tapped);
  tapped.handleTouch(batterB.x, batterB.y);
  tapped.handleTouchEnd();
  assert.ok(tapped.heldIngredient);
  tapped.handleTouch(panB.x, panB.y);
  tapped.handleTouchEnd();
  assert.ok(tapped.pans[0].pancake);
  assert.strictEqual(tapped.heldIngredient, null);
});

test('14. 正式游戏支持拖动和点选两种配料上锅方式', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTouch(batter.x, batter.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  const pancake = game.pans[0].pancake;

  const egg = buttonCenter(game, 'egg');
  game.handleTouch(egg.x, egg.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  assert.ok(pancake.toppings.includes('egg'));

  pancake.elapsed = pancake.cookTime * 0.5;
  tick(game, 16);
  game.handleTouch(pan.x, pan.y);
  game.flipAnimations.forEach(animation => { animation.start -= animation.duration; });
  tick(game, 16);

  const ham = buttonCenter(game, 'ham');
  game.handleTouch(ham.x, ham.y);
  game.handleTouchEnd();
  assert.ok(game.heldIngredient);
  game.handleTouch(pan.x, pan.y);
  game.handleTouchEnd();
  assert.ok(pancake.toppings.includes('ham'));
});

test('15. 正式游戏点一下取饼后可以再点顾客上菜', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  game.spawnCustomer();
  const customer = game.customers[0];
  customer.orderToppings = [];
  customer.orderKey = '';

  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTouch(batter.x, batter.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  const pancake = game.pans[0].pancake;
  pancake.phase = 'second';
  pancake.state = 'perfect';
  game.handleTouch(pan.x, pan.y);
  game.handleTouchEnd();
  assert.ok(game.heldPancake, '点一下锅位后应保持拿起状态');
  game.handleTouch(customer.x, customer.y);
  game.handleTouchEnd();
  assert.strictEqual(customer.state, 'eating');
  assert.strictEqual(game.heldPancake, null);
  assert.ok(game.score > 0, '成功上菜后实时得分应同步增加');
});

test('16. 图鉴可以从菜单和游戏内打开并返回原状态', () => {
  const game = new Game(null, 375, 667);
  game.openCatalog('menu');
  assert.strictEqual(game.state, 'catalog');
  game.closeCatalog();
  assert.strictEqual(game.state, 'menu');
  game.startGame();
  game.openCatalog('playing');
  game.closeCatalog();
  assert.strictEqual(game.state, 'playing');
});

test('17. 同屏顾客达到上限后暂停刷新', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  game.customers = new Array(6).fill({ state: 'waiting' });
  game.lastSpawnTime = 0;
  game.updateWave(16);
  assert.strictEqual(game.customers.length, 6);
  assert.strictEqual(game.customersSpawned, 0);
});

test('18. 主要界面可在常见长短屏尺寸完成绘制', () => {
  [[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
    const game = new Game(createMockContext(), width, height);
    game.render();
    game.openCatalog('menu');
    game.render();
    game.startTutorial();
    game.render();
    assert.ok(game.tutorialContinueBtn, '教程开场按钮应在绘制后生成');
    game.startGame();
    game.spawnCustomer();
    game.render();
    game.state = 'paused';
    game.render();
    game.state = 'influencer';
    game.render();
    game.state = 'gameover';
    game.render();
  });
});

test('19. 第一面煎糊后仍可取出并拖到垃圾桶丢弃', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTouch(batter.x, batter.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();

  const pancake = game.pans[0].pancake;
  pancake.phase = 'first';
  pancake.state = 'burnt';
  pancake.needsFlip = false;
  game.handleTouch(pan.x, pan.y);
  assert.strictEqual(game.heldPancake, pancake, '糊饼应能从锅上拿起');

  const trash = game.trashCan;
  game.handleTouchMove(trash.x + trash.w / 2, trash.y + trash.h / 2);
  game.handleTouchEnd();
  assert.strictEqual(game.pans[0].pancake, null, '丢弃后锅位应恢复为空');
  assert.strictEqual(game.heldPancake, null);
});

test('20. 托盘会收纳成品且绘制时不改写煎饼坐标', () => {
  const ctx = createMockContext();
  const game = new Game(ctx, 375, 667);
  game.startGame();
  game.containerMax = 1;
  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTouch(batter.x, batter.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  const pancake = game.pans[0].pancake;
  pancake.phase = 'second';
  pancake.state = 'perfect';
  game.handleTouch(pan.x, pan.y);
  const trayY = game.getTrayLayout().trayY;
  const controlsBottom = Math.max(...game.buttons.map(button => button.y + button.h));
  assert.ok(trayY - 13 - controlsBottom >= 18, '托盘标签与按钮区应留出明确间距');
  game.handleTouchMove(game.width / 2, trayY + 20);
  game.handleTouchEnd();
  assert.strictEqual(game.container.length, 1);
  const oldX = pancake.x;
  const oldY = pancake.y;
  game.render();
  assert.strictEqual(pancake.x, oldX);
  assert.strictEqual(pancake.y, oldY);
});

test('21. 资源、价格和升级名称使用明确一致的显示格式', () => {
  const ctx = createMockContext();
  const game = new Game(ctx, 375, 667);
  game.startGame();
  game.render();
  assert.ok(ctx.texts.includes('💰×50'));
  assert.ok(ctx.texts.includes('面×10'));
  assert.ok(ctx.texts.includes('蛋×3'));
  assert.ok(ctx.texts.includes('得分0'));
  assert.ok(ctx.texts.includes('💰4  +5'));
  assert.ok(ctx.texts.includes('💰5  +3'));
  assert.ok(ctx.texts.includes('技巧'));
  assert.ok(!ctx.texts.includes('快手'));
  assert.ok(!ctx.texts.includes('招牌'));
  assert.ok(ctx.texts.some(text => text.includes('耐心+20%')));
  assert.ok(ctx.texts.includes('菜'));
  assert.ok(ctx.texts.includes('第3波解锁'));
  assert.ok(ctx.texts.includes('小料进货'));
  assert.ok(ctx.texts.includes('第3波开放'));
});

test('22. 游戏结束记录只保存一次并能从本机存储重新载入', () => {
  const originalGet = wx.getStorageSync;
  const originalSet = wx.setStorageSync;
  const storage = {};
  wx.getStorageSync = key => storage[key];
  wx.setStorageSync = (key, value) => { storage[key] = value; };
  try {
    const game = new Game(null, 375, 667);
    game.startGame();
    game.score = 128;
    game.wave = 6;
    game.customersServed = 17;
    game.endGame();
    game.endGame();
    assert.strictEqual(storage.personalHistoryRecords.length, 1);
    assert.deepStrictEqual(
      { score: storage.personalHistoryRecords[0].score, wave: storage.personalHistoryRecords[0].wave, served: storage.personalHistoryRecords[0].served },
      { score: 128, wave: 6, served: 17 }
    );

    const reloaded = new Game(null, 375, 667);
    assert.strictEqual(reloaded.historyRecords.length, 1);
    assert.strictEqual(reloaded.historyRecords[0].score, 128);
  } finally {
    wx.getStorageSync = originalGet;
    wx.setStorageSync = originalSet;
  }
});

test('23. 一个切换按钮可在得分榜和波次榜之间改变顺序', () => {
  const ctx = createMockContext();
  const game = new Game(ctx, 375, 667);
  game.historyRecords = [
    { score: 300, wave: 3, served: 12, timestamp: 1 },
    { score: 180, wave: 8, served: 20, timestamp: 2 },
    { score: 240, wave: 5, served: 16, timestamp: 3 }
  ];
  game.rankingMode = 'score';
  assert.deepStrictEqual(game.getSortedHistory().map(record => record.score), [300, 240, 180]);
  game.render();
  assert.ok(ctx.texts.includes('个人历史'));
  assert.ok(ctx.texts.includes('得分榜 ⇄'));

  const toggle = game.rankingToggleBtn;
  game.handleTouch(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
  assert.strictEqual(game.rankingMode, 'wave');
  assert.deepStrictEqual(game.getSortedHistory().map(record => record.wave), [8, 5, 3]);
});

test('24. 长屏向下展开操作区，短屏仍给教程留出空间', () => {
  const shortGame = new Game(null, 320, 568);
  const shortBottom = Math.max(...shortGame.buttons.map(button => button.y + button.h));
  assert.strictEqual(shortGame.buttons[0].h, 28);
  assert.ok(shortBottom <= 568 - 122, '短屏按钮不能进入教程浮层区域');

  const tallGame = new Game(null, 375, 812);
  const tallBottom = Math.max(...tallGame.buttons.map(button => button.y + button.h));
  const tallTray = tallGame.getTrayLayout();
  assert.strictEqual(tallGame.buttons[0].h, 32);
  assert.ok(tallGame.buttons[0].y >= 812 * 0.54, '长屏操作区应明显下移');
  assert.ok(tallTray.trayY > tallBottom);
  assert.ok(tallTray.trayY + tallTray.slotH + 15 < 812, '托盘下方应保留操作提示空间');
  assert.ok(tallGame.menuCatalogBtn.y + tallGame.menuCatalogBtn.h < 812);
});

test('25. 只有鸡蛋能在翻面前加入，阶段和糊饼提示准确', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  const batter = buttonCenter(game, 'batter');
  const pan = panCenter(game);
  game.handleTouch(batter.x, batter.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();

  const ham = buttonCenter(game, 'ham');
  game.handleTouch(ham.x, ham.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  assert.strictEqual(game.floatingTexts.at(-1).text, '肠需要翻面后加入');
  game.heldIngredient = null;

  const pancake = game.pans[0].pancake;
  pancake.state = 'burnt';
  const egg = buttonCenter(game, 'egg');
  game.handleTouch(egg.x, egg.y);
  game.handleTouchMove(pan.x, pan.y);
  game.handleTouchEnd();
  assert.strictEqual(game.floatingTexts.at(-1).text, '饼已经糊了，请丢弃');

  const flipped = new Pancake(4000, 3000);
  flipped.phase = 'second';
  flipped.state = 'raw';
  assert.strictEqual(flipped.addTopping('egg'), false);
  assert.strictEqual(flipped.addTopping('ham'), true);
});

test('26. 小料进货横跨两格并为四种小料各补充三个', () => {
  const game = new Game(null, 375, 667);
  game.startGame();
  game.wave = 3;
  const buyBatter = game.buttons.find(button => button.id === 'buyBatter');
  const secondRowIds = game.buttons
    .filter(button => button.y === buyBatter.y)
    .sort((a, b) => a.x - b.x)
    .map(button => button.id);
  assert.deepStrictEqual(secondRowIds, ['buyBatter', 'crispy', 'scallion', 'sauce']);

  const bundle = game.buttons.find(button => button.id === 'buyToppings');
  const normalButton = game.buttons.find(button => button.id === 'buyEgg');
  assert.ok(bundle.w > normalButton.w * 1.9);
  assert.strictEqual(game.buttons.some(button => button.id === 'upPrice'), false);
  assert.strictEqual(game.buttons.find(button => button.id === 'upSlot').y, game.buttons.find(button => button.id === 'upSpeed').y);
  game.handleTouch(bundle.x + bundle.w / 2, bundle.y + bundle.h / 2);
  assert.strictEqual(game.resources.gold, 42);
  ['lettuce', 'crispy', 'scallion', 'sauce'].forEach(itemId => {
    assert.strictEqual(game.resources[itemId], 6);
  });
});

test('27. 顾客会随机生成已解锁小料忌口并给出专属错误', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    const game = new Game(null, 375, 667);
    game.startGame();
    game.wave = 3;
    game.spawnCustomer();
    const customer = game.customers[0];
    assert.strictEqual(customer.dislikedTopping, 'lettuce');
    assert.ok(!customer.orderToppings.includes('lettuce'));

    const pancake = new Pancake(4000, 3000);
    pancake.phase = 'second';
    pancake.state = 'perfect';
    pancake.addTopping('lettuce');
    Math.random = () => 0.99;
    const result = customer.serve(pancake, { base: 8, toppings: { lettuce: 2 } }, {});
    assert.strictEqual(result.text, '加了忌口!');
  } finally {
    Math.random = originalRandom;
  }
});

test('28. 营业结束界面使用合适文案并可返回主界面', () => {
  const ctx = createMockContext();
  const game = new Game(ctx, 375, 667);
  game.startGame();
  game.score = 88;
  game.wave = 4;
  game.endGame();
  game.render();
  assert.ok(ctx.texts.includes('本次营业结束'));
  assert.ok(ctx.texts.includes('再来一次'));
  assert.ok(ctx.texts.includes('返回主界面'));
  assert.ok(!ctx.texts.some(text => text.includes('饥荒') || text.includes('💀')));
  const menu = game.gameOverMenuBtn;
  game.handleTouch(menu.x + menu.w / 2, menu.y + menu.h / 2);
  assert.strictEqual(game.state, 'menu');
  assert.strictEqual(game.historyRecords.length, 1);
});

test('29. 删除招牌后会通过历史版本清空一次旧排行', () => {
  const originalGet = wx.getStorageSync;
  const originalSet = wx.setStorageSync;
  const storage = { personalHistoryRecords: [{ score: 999, wave: 9, served: 30, timestamp: 1 }] };
  wx.getStorageSync = key => storage[key];
  wx.setStorageSync = (key, value) => { storage[key] = value; };
  try {
    const game = new Game(null, 375, 667);
    assert.deepStrictEqual(game.historyRecords, []);
    assert.deepStrictEqual(storage.personalHistoryRecords, []);
    assert.strictEqual(storage.personalHistoryVersion, 2);
  } finally {
    wx.getStorageSync = originalGet;
    wx.setStorageSync = originalSet;
  }
});

console.log(results.join('\n'));
console.log('\n通过 ' + passed + ' / ' + results.length + ' 个用例');
if (passed !== results.length) {
  process.exit(1);
}
console.log('🎉 全部通过');
