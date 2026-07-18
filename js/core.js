/**
 * ============================================================
 * 不随便煎饼 - 核心游戏逻辑 (core.js) v2
 * ============================================================
 * 新增：
 *   - 翻面机制（点击锅位翻面）
 *   - 小料系统（翻面后添加）
 *   - 人气系统（连续、倍数、完美双倍、惩罚）
 *   - 网红探店事件
 *   - 多样化顾客
 *   - 新 UI：接待数、人气、倍数
 * ============================================================
 */

const CONFIG = require('./config.js');
const { Pancake, Customer, Particle } = require('./entities.js');
const { fillRoundRect, strokeRoundRect } = require('./utils.js');
const HISTORY_VERSION = 2;

class Game {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.state = 'menu';       // menu / tutorial / playing / gameover / paused / influencer / catalog
    this.topOffset = 28;
    this.lastTime = Date.now();
    this.touchX = 0;
    this.touchY = 0;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchMoved = false;
    this.floatingTexts = [];
    this.flipAnimations = [];
    this.catalogReturnState = 'menu';
    this.historyRecords = this.loadHistoryRecords();
    this.rankingMode = this.loadRankingMode();
    this.reset();
    this.initLayout();
  }

  loadHistoryRecords() {
    try {
      if (wx.getStorageSync('personalHistoryVersion') !== HISTORY_VERSION) {
        wx.setStorageSync('personalHistoryRecords', []);
        wx.setStorageSync('personalHistoryVersion', HISTORY_VERSION);
        return [];
      }
      const stored = wx.getStorageSync('personalHistoryRecords');
      if (!Array.isArray(stored)) return [];
      return stored
        .filter(record => record && Number.isFinite(Number(record.score)) && Number.isFinite(Number(record.wave)))
        .map(record => ({
          score: Math.max(0, Number(record.score) || 0),
          wave: Math.max(1, Number(record.wave) || 1),
          served: Math.max(0, Number(record.served) || 0),
          timestamp: Number(record.timestamp) || Date.now()
        }))
        .slice(-50);
    } catch (e) {
      return [];
    }
  }

  loadRankingMode() {
    try {
      return wx.getStorageSync('personalRankingMode') === 'wave' ? 'wave' : 'score';
    } catch (e) {
      return 'score';
    }
  }

  toggleRankingMode() {
    this.rankingMode = this.rankingMode === 'score' ? 'wave' : 'score';
    try { wx.setStorageSync('personalRankingMode', this.rankingMode); } catch (e) {}
  }

  getSortedHistory() {
    const mode = this.rankingMode;
    return [...this.historyRecords].sort((a, b) => {
      if (mode === 'wave') {
        return b.wave - a.wave || b.score - a.score || b.served - a.served || b.timestamp - a.timestamp;
      }
      return b.score - a.score || b.wave - a.wave || b.served - a.served || b.timestamp - a.timestamp;
    });
  }

  saveHistoryRecord() {
    if (this.historySaved) return;
    const record = {
      score: this.score,
      wave: this.wave,
      served: this.customersServed,
      timestamp: Date.now()
    };
    this.historyRecords = [...this.historyRecords, record].slice(-50);
    this.historySaved = true;
    try {
      wx.setStorageSync('personalHistoryVersion', HISTORY_VERSION);
      wx.setStorageSync('personalHistoryRecords', this.historyRecords);
    } catch (e) {}
  }

  endGame() {
    this.saveHistoryRecord();
    this.state = 'gameover';
  }

  formatHistoryDate(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return month + '/' + day;
  }

  // ===================== 数据重置 =====================

  reset() {
    this.wave = 1;
    this.resources = { gold: CONFIG.GAME.initialGold, batter: CONFIG.GAME.initialBatter };
    // 动态添加小料资源
    CONFIG.GAME.toppings.forEach(t => { this.resources[t.id] = 3; });

    this.upgrades = { slot: 0, speed: 0, patience: 0, container: 0 };
    this.container = [];
    this.containerMax = 0; // 初始没有托盘，需购买解锁
    this.heldFromContainer = -1;
    this.customers = [];
    this.particles = [];
    this.floatingTexts = [];
    this.flipAnimations = [];
    this.heldPancake = null;
    this.heldFromPan = -1;
    this.heldIngredient = null; // 手持原料（拖动上锅）
    this.score = 0;
    this.historySaved = false;

    // 人气系统
    this.popularity = 20;       // 初始人气
    this.customersServed = 0;     // 已接待数
    this.streakCount = 0;         // 连续正确数
    this.streakMultiplier = 1;    // 当前人气倍数
    this.lastServeCorrect = true; // 上次上菜是否正确

    // 网红探店
    this.influencerPending = false;
    this.influencerTriggered = false;
    this.influencerChoice = null; // accept / reject

    this.initPans();
    this.customersSpawned = 0;
    this.customersTotal = CONFIG.GAME.startWaveCustomers;
    this.waveInterval = CONFIG.GAME.waveIntervalBase;
    this.lastSpawnTime = 0;
    this.waveState = 'spawning';
    this.tutorial = { step: 0, active: false };
    this.tutorialCustomer = null;
    this.tutorialContinueBtn = null;
  }

  initPans() {
    const baseSlots = 2 + this.upgrades.slot;
    this.pans = [];
    // 锅位在屏幕中上部，预留按钮空间
    const panRatio = this.height < 620 ? 0.34 : 0.36;
    this.panY = Math.min(this.height * panRatio, this.height - 320);
    // 大圆半径根据锅位数量动态计算，确保能容纳所有锅位
    const totalWidth = (baseSlots - 1) * 70;
    this.panRadius = Math.max(90, totalWidth / 2 + 55);
    const startX = (this.width - totalWidth) / 2;
    for (let i = 0; i < baseSlots; i++) {
      this.pans.push({ pancake: null, x: startX + i * 70, y: this.panY });
    }
  }

  // ===================== 界面布局 =====================

  initLayout() {
    const w = this.width, h = this.height;
    const bw = Math.min(68, (w - 40) / 4);
    const tallScreen = h >= 760;
    const bh = tallScreen ? 32 : 28;
    const gap = tallScreen ? 6 : 4;
    const cols = 4;
    const startX = (w - (bw * cols + gap * (cols - 1))) / 2;
    // 长屏把操作区向下展开，短屏仍以不遮挡教程为优先。
    const minimumBaseY = this.panY + this.panRadius + 35;
    const desiredBaseY = h * 0.56;
    const baseY = Math.min(Math.max(minimumBaseY, desiredBaseY), h - 230);

    this.buttons = [];
    const addBtn = (row, col, id, label, type, extra) => {
      this.buttons.push({ id, label, type, x: startX + col * (bw + gap), y: baseY + row * (bh + gap), w: bw, h: bh, ...extra });
    };

    const toppingList = CONFIG.GAME.toppings;
    // Row 0: 【面饼】 + 小料（最多3个，前3种）
    addBtn(0, 0, 'batter', '面饼', 'ingredient', { need: { batter: 1 }, mode: 'batter' });
    toppingList.slice(0, 3).forEach((t, i) => {
      addBtn(0, i + 1, t.id, t.name, 'topping', { toppingId: t.id });
    });

    // Row 1: 买面 + 剩余小料（4~6）
    addBtn(1, 0, 'buyBatter', '买面', 'buy', { item: 'batter', cost: CONFIG.GAME.toppings[0]?.cost || 2 });
    toppingList.slice(3, 6).forEach((t, i) => {
      addBtn(1, i + 1, t.id, t.name, 'topping', { toppingId: t.id });
    });

    // Row 2: 买蛋/买肠/小料统一进货（横跨两格）
    addBtn(2, 0, 'buyEgg', '买蛋', 'buy', { item: 'egg', cost: 5 });
    addBtn(2, 1, 'buyHam', '买肠', 'buy', { item: 'ham', cost: 6 });
    addBtn(2, 2, 'buyToppings', '小料进货', 'buyBundle', {
      items: CONFIG.GAME.smallToppingIds, cost: 8, buyAmount: 3, unlockWave: 3, w: bw * 2 + gap
    });

    // Row 3: 升级
    addBtn(3, 0, 'upSpeed', '技巧', 'upgrade', { upId: 'speed' });
    addBtn(3, 1, 'upPatience', '微笑', 'upgrade', { upId: 'patience' });
    addBtn(3, 2, 'upSlot', '大锅', 'upgrade', { upId: 'slot' });
    addBtn(3, 3, 'upContainer', '托盘', 'upgrade', { upId: 'container' });

    // 主菜单内容整体居中分布，给历史排行留出固定区域。
    this.menuTop = Math.max(this.topOffset + 12, (h - 460) / 2);
    this.menuBtn = { x: w / 2 - 80, y: this.menuTop + 205, w: 160, h: 50, label: '开始摆摊' };
    this.rankingToggleBtn = { x: w - 122, y: this.menuTop + 263, w: 104, h: 28 };
    this.menuRankingTop = this.menuTop + 302;
    const secondaryGap = 10;
    const secondaryW = Math.min(160, (w - 42) / 2);
    const secondaryStartX = (w - (secondaryW * 2 + secondaryGap)) / 2;
    this.reviewTutorialBtn = { x: secondaryStartX, y: this.menuTop + 405, w: secondaryW, h: 40, label: '回顾教程' };
    this.menuCatalogBtn = { x: secondaryStartX + secondaryW + secondaryGap, y: this.menuTop + 405, w: secondaryW, h: 40, label: '顾客图鉴' };
    this.restartBtn = { x: w / 2 - 80, y: h / 2 + 62, w: 160, h: 46, label: '再来一次' };
    this.gameOverMenuBtn = { x: w / 2 - 80, y: h / 2 + 120, w: 160, h: 42, label: '返回主界面' };

    // 垃圾桶
    this.trashCan = { x: w - 58, y: this.panY - 45, w: 50, h: 50, label: '丢弃' };

    // 暂停按钮
    this.pauseBtn = { x: w - 48, y: 48 + this.topOffset, w: 40, h: 30, label: '⏸️' };
    this.catalogBtn = { x: w - 94, y: 48 + this.topOffset, w: 40, h: 30, label: '📖' };
    this.catalogBackBtn = { x: w / 2 - 70, y: h - 58, w: 140, h: 40, label: '返回' };

    // 教程跳过按钮（仅教程状态显示）
    this.tutorialSkipBtn = { x: w - 96, y: this.topOffset + 64, w: 88, h: 26, label: '跳过教程 ›' };
    this.resumeBtn = { x: w / 2 - 80, y: h / 2 - 60, w: 160, h: 50, label: '继续游戏' };
    this.pauseRestartBtn = { x: w / 2 - 80, y: h / 2 + 10, w: 160, h: 50, label: '重新开始' };
    this.pauseMenuBtn = { x: w / 2 - 80, y: h / 2 + 80, w: 160, h: 50, label: '回到主界面' };
    this.pauseCatalogBtn = { x: w / 2 - 80, y: h / 2 + 145, w: 160, h: 40, label: '顾客图鉴' };

    // 网红探店按钮
    this.influencerAcceptBtn = { x: w / 2 - 140, y: h / 2 + 40, w: 120, h: 46, label: '接受' };
    this.influencerRejectBtn = { x: w / 2 + 20, y: h / 2 + 40, w: 120, h: 46, label: '拒绝' };
  }

  // ===================== 升级计算 =====================

  getCookTime() { return CONFIG.GAME.cookTime; }
  getSide2Time() { return CONFIG.GAME.secondSideTime; }
  getPatience() { return CONFIG.GAME.basePatience * (1 + this.upgrades.patience * 0.2); }

  getPrice(base) { return base; }

  getMinServeTime() {
    // 最短制作时间 = 第一面到可翻 + 第二面煎到完美
    return this.getCookTime() * CONFIG.GAME.flipPerfectStart + this.getSide2Time() * CONFIG.GAME.perfectStart;
  }

  // ===================== 状态切换 =====================

  start() {
    try {
      const hasPlayed = wx.getStorageSync('hasPlayedTutorial');
      if (hasPlayed) { this.startGame(); return; }
    } catch (e) {}
    this.startTutorial();
  }

  startTutorial() {
    this.reset();
    this.state = 'tutorial';
    this.tutorial.active = true;
    this.tutorial.step = 0;
    this.resources = { gold: 999, batter: 99 };
    CONFIG.GAME.toppings.forEach(t => { this.resources[t.id] = 99; });
    this.tutorialCustomer = new Customer(Date.now(), ['egg'], 999999, Math.min(100, this.width - 40), 100,
      CONFIG.GAME.customerTypes[0]);
    this.customers = [this.tutorialCustomer];
    this.lastTime = Date.now();
  }

  startGame() {
    this.reset();
    this.state = 'playing';
    this.lastSpawnTime = Date.now();
    this.lastTime = Date.now();
  }

  // ===================== 主更新循环 =====================

  update() {
    const now = Date.now();
    const dt = now - this.lastTime;
    this.lastTime = now;
    this.flipAnimations = this.flipAnimations.filter(a => now - a.start < a.duration);

    if (this.state === 'tutorial') {
      this.pans.forEach(pan => {
        if (pan.pancake && !pan.pancake.held) {
          const pc = pan.pancake;
          // 教程中不会煎糊：把进度钳制在 99.9%，消除新手的时间压力，避免糊饼死锁
          const total = pc.phase === 'first' ? pc.cookTime : pc.side2Time;
          pc.update(Math.min(dt, Math.max(0, total * 0.999 - pc.elapsed)));
          pc.x = pan.x; pc.y = pan.y;
        }
      });
      // 教程顾客动画（耐心 999999，不会离场）
      this.customers.forEach(c => c.update(dt));
      this.customers = this.customers.filter(c => c.state !== 'done' && c.state !== 'leaving');
      // 粒子与浮动文字（此前教程里不更新，反馈会冻在屏幕上）
      this.particles.forEach(p => p.update(dt));
      this.particles = this.particles.filter(p => p.life > 0);
      this.floatingTexts.forEach(t => { t.y += t.vy; t.life -= dt; });
      this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);
      if (this.heldPancake) {
        this.heldPancake.x = this.touchX;
        this.heldPancake.y = this.touchY;
      }
      if (this.heldIngredient) {
        this.heldIngredient.x = this.touchX;
        this.heldIngredient.y = this.touchY;
      }
      return;
    }

    if (this.state === 'paused' || this.state === 'influencer') return;
    if (this.state !== 'playing') return;

    // 1. 锅位煎饼
    this.pans.forEach(pan => {
      if (pan.pancake && !pan.pancake.held) {
        pan.pancake.update(dt);
        pan.pancake.x = pan.x; pan.pancake.y = pan.y;
      }
    });

    // 2. 更新顾客
    this.customers.forEach(c => c.update(dt));

    // 3. 处理超时离场的顾客（扣双倍人气）
    const leavers = this.customers.filter(c => c.state === 'leaving');
    if (leavers.length > 0) {
      for (const c of leavers) {
        this.popularity += CONFIG.GAME.popularityTimeout;
        this.streakCount = 0;
        this.streakMultiplier = 1;
        this.lastServeCorrect = false;
        this.spawnText(c.x, c.y - 30, `人气${CONFIG.GAME.popularityTimeout}`, '#EF5350');
      }
      this.customers = this.customers.filter(c => c.state !== 'leaving');
      if (this.popularity <= 0) {
        this.endGame();
        return;
      }
    }

    // 4. 移除已吃完的顾客
    this.customers = this.customers.filter(c => c.state !== 'done');

    // 5. 波次管理
    this.updateWave(dt);

    // 6. 网红探店检测
    if (!this.influencerPending && this.popularity >= CONFIG.GAME.influencerThreshold && !this.influencerTriggered) {
      this.triggerInfluencer();
    }

    // 7. 粒子与文字
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => p.life > 0);
    this.floatingTexts.forEach(t => { t.y += t.vy; t.life -= dt; });
    this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);

    // 8. 拖动跟随
    if (this.heldPancake) {
      this.heldPancake.x = this.touchX;
      this.heldPancake.y = this.touchY;
    }
    // 手持原料跟随
    if (this.heldIngredient) {
      this.heldIngredient.x = this.touchX;
      this.heldIngredient.y = this.touchY;
    }
  }

  // ===================== 波次管理 =====================

  updateWave(dt) {
    const now = Date.now();
    if (this.waveState === 'spawning') {
      if (this.customersSpawned < this.customersTotal) {
        if (this.customers.length >= CONFIG.GAME.maxCustomers) return;
        if (now - this.lastSpawnTime > this.waveInterval) {
          this.spawnCustomer();
          this.lastSpawnTime = now;
          this.customersSpawned++;
        }
      } else {
        this.waveState = 'waiting_clear';
      }
    } else if (this.waveState === 'waiting_clear') {
      if (this.customers.length === 0) {
        this.wave++;
        this.customersSpawned = 0;
        this.customersTotal = CONFIG.GAME.startWaveCustomers + (this.wave - 1) * CONFIG.GAME.waveCustomerInc;
        this.waveInterval = Math.max(CONFIG.GAME.waveIntervalMin,
          CONFIG.GAME.waveIntervalBase - (this.wave - 1) * CONFIG.GAME.waveIntervalDec);
        this.waveState = 'spawning';
        this.lastSpawnTime = now;
        this.resources.gold += 5 + this.wave * 2;
        this.spawnText(this.width / 2, this.height / 2, `第 ${this.wave} 波!`, '#FF7043');
        this.spawnParticles(this.width / 2, this.height / 2, '#FFD700', 6, 20);
      }
    }
  }

  spawnCustomer() {
    const availableTypes = CONFIG.GAME.customerTypes.filter(ct => ct.unlockWave <= this.wave);
    const totalWeight = availableTypes.reduce((s, ct) => s + ct.weight, 0);
    let r = Math.random() * totalWeight;
    let typeInfo = availableTypes[0];
    for (const ct of availableTypes) {
      r -= ct.weight;
      if (r <= 0) { typeInfo = ct; break; }
    }

    // 订单复杂度
    let maxToppings = 0;
    const complexity = CONFIG.GAME.orderComplexity;
    if (this.wave >= 10) maxToppings = complexity.wave10.maxToppings;
    else if (this.wave >= 6) maxToppings = complexity.wave6.maxToppings;
    else if (this.wave >= 3) maxToppings = complexity.wave3.maxToppings;
    else maxToppings = complexity.wave1.maxToppings;

    const availableToppings = CONFIG.GAME.toppings.filter(t => t.unlockWave <= this.wave).map(t => t.id);
    const numToppings = Math.min(maxToppings, Math.floor(Math.random() * (maxToppings + 1)));
    const orderToppings = [];
    const pool = [...availableToppings];
    for (let i = 0; i < numToppings && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      orderToppings.push(pool.splice(idx, 1)[0]);
    }

    const dislikePool = CONFIG.GAME.smallToppingIds.filter(toppingId =>
      availableToppings.includes(toppingId) && !orderToppings.includes(toppingId));
    const dislikedTopping = dislikePool.length > 0 && Math.random() < CONFIG.GAME.dislikeChance
      ? dislikePool[Math.floor(Math.random() * dislikePool.length)]
      : null;

    let patience = this.getPatience() * typeInfo.patienceMult;
    // 确保等待时间不低于最短制作时间（加一点余量）
    const minTime = this.getMinServeTime() + 5000;
    patience = Math.max(patience, minTime);

    const idx = this.customers.length;
    const x = 40 + idx * 65;
    const y = 140;
    const c = new Customer(Date.now(), orderToppings, patience, Math.min(x, this.width - 40), y, typeInfo, dislikedTopping);
    this.customers.push(c);
  }

  spawnParticles(x, y, color, speed, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color, speed, 600));
  }
  spawnText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, life: 1400, vy: -0.9 });
  }

  getPanAt(x, y) {
    return this.pans.find(pan => Math.hypot(x - pan.x, y - pan.y) < 45) || null;
  }

  getTrayLayout() {
    const slotW = 50;
    const slotH = 45;
    const slotGap = 8;
    const controlsBottom = this.buttons.length
      ? Math.max(...this.buttons.map(button => button.y + button.h))
      : this.height - 76;
    const trayY = controlsBottom + 34;
    const totalW = this.containerMax > 0
      ? this.containerMax * slotW + (this.containerMax - 1) * slotGap
      : 0;
    return { trayY, slotW, slotH, slotGap, totalW, startX: (this.width - totalW) / 2 };
  }

  tryPlaceHeldIngredient(pan, tutorialMode) {
    const ing = this.heldIngredient;
    if (!ing || !pan) return false;

    if (ing.type === 'batter') {
      if (pan.pancake) {
        this.spawnText(pan.x, pan.y - 50, '这个锅位已经占用', '#D95F4C');
        return false;
      }
      for (const [res, need] of Object.entries(ing.need)) this.resources[res] -= need;
      pan.pancake = new Pancake(this.getCookTime(), this.getSide2Time());
      pan.pancake.x = pan.x;
      pan.pancake.y = pan.y;
      this.spawnParticles(pan.x, pan.y, '#FFF4C7', 3, 6);
      this.spawnText(pan.x, pan.y - 48, '面糊下锅', '#3F8F73');
      this.heldIngredient = null;
      if (tutorialMode && this.tutorial.step === 1) this.tutorial.step = 2;
      return true;
    }

    if (ing.type === 'topping') {
      const pancake = pan.pancake;
      const tcfg = CONFIG.GAME.toppings.find(t => t.id === ing.toppingId);
      const toppingName = tcfg ? tcfg.name : '小料';
      if (!pancake) {
        this.spawnText(pan.x, pan.y - 50, '先把面糊下锅', '#D95F4C');
        return false;
      }
      if (pancake.state === 'burnt') {
        this.spawnText(pan.x, pan.y - 50, '饼已经糊了，请丢弃', '#D95F4C');
        return false;
      }
      if (pancake.held) return false;
      if (this.isPanFlipping(pan)) {
        this.spawnText(pan.x, pan.y - 50, '等铲子翻完再加料', '#2D88A8');
        return false;
      }
      if (ing.toppingId === 'egg' && pancake.phase !== 'first') {
        this.spawnText(pan.x, pan.y - 50, '鸡蛋需要翻面前加入', '#D95F4C');
        return false;
      }
      if (ing.toppingId !== 'egg' && pancake.phase !== 'second') {
        this.spawnText(pan.x, pan.y - 50, toppingName + '需要翻面后加入', '#D95F4C');
        return false;
      }
      if (!pancake.addTopping(ing.toppingId)) {
        this.spawnText(pan.x, pan.y - 50, '已经加过这种料', '#D95F4C');
        return false;
      }
      this.resources[ing.toppingId]--;
      const color = tcfg ? CONFIG.COLOR[tcfg.colorKey] : '#999';
      this.spawnParticles(pan.x, pan.y, color, 3, 6);
      this.spawnText(pan.x, pan.y - 48, toppingName + '已加入', color);
      this.heldIngredient = null;
      if (tutorialMode && this.tutorial.step === 2 && ing.toppingId === 'egg') this.tutorial.step = 3;
      return true;
    }

    return false;
  }

  startPanFlip(pan) {
    const pancake = pan && pan.pancake;
    if (!pancake || pancake.phase !== 'first' || !pancake.needsFlip || this.isPanFlipping(pan)) return false;
    const wasPerfect = this.upgrades.speed > 0 || pancake.state === 'perfect';
    if (!pancake.flip(wasPerfect)) return false;
    this.flipAnimations.push({ pan, pancake, start: Date.now(), duration: 440, perfect: wasPerfect });
    this.spawnText(pan.x, pan.y - 54, wasPerfect ? '完美翻面!' : '翻面!', wasPerfect ? '#F2B705' : '#2D88A8');
    this.spawnParticles(pan.x, pan.y, wasPerfect ? '#F2B705' : '#64B5C4', 4, 9);
    return true;
  }

  isPanFlipping(pan) {
    return this.flipAnimations.some(a => a.pan === pan);
  }

  openCatalog(returnState) {
    this.catalogReturnState = returnState || 'menu';
    this.state = 'catalog';
  }

  closeCatalog() {
    this.state = this.catalogReturnState || 'menu';
    this.lastTime = Date.now();
  }

  // ===================== 网红探店 =====================

  triggerInfluencer() {
    this.influencerPending = true;
    this.influencerTriggered = true;
    this.state = 'influencer';
  }

  handleInfluencerChoice(accept) {
    if (accept) {
      this.resources.gold = Math.max(0, this.resources.gold - CONFIG.GAME.influencerGoldCost);
      this.popularity += CONFIG.GAME.influencerPopGain;
      this.spawnText(this.width / 2, this.height / 2 - 40, `网红探店! +${CONFIG.GAME.influencerPopGain}人气`, '#E91E63');
    } else {
      if (Math.random() < CONFIG.GAME.influencerRefuseChance) {
        this.popularity -= CONFIG.GAME.influencerRefusePopLoss;
        this.spawnText(this.width / 2, this.height / 2 - 40, `拒绝探店! -${CONFIG.GAME.influencerRefusePopLoss}人气`, '#EF5350');
      } else {
        this.spawnText(this.width / 2, this.height / 2 - 40, '拒绝探店', '#999');
      }
    }
    this.influencerPending = false;
    this.influencerChoice = accept ? 'accept' : 'reject';
    if (this.popularity <= 0) this.endGame();
    else this.state = 'playing';
    this.lastTime = Date.now(); // 防止 dt 爆炸
  }

  // ===================== 输入处理 =====================

  handleTouch(x, y) {
    this.touchX = x; this.touchY = y;
    this.touchStartX = x; this.touchStartY = y;
    this.touchMoved = false;

    if (this.state === 'menu') {
      if (this.hit(x, y, this.menuBtn)) this.start();
      else if (this.hit(x, y, this.reviewTutorialBtn)) this.startTutorial();
      else if (this.hit(x, y, this.menuCatalogBtn)) this.openCatalog('menu');
      else if (this.hit(x, y, this.rankingToggleBtn)) this.toggleRankingMode();
      return;
    }

    if (this.state === 'catalog') {
      if (this.hit(x, y, this.catalogBackBtn)) this.closeCatalog();
      return;
    }

    if (this.state === 'gameover') {
      if (this.hit(x, y, this.restartBtn)) this.startGame();
      else if (this.hit(x, y, this.gameOverMenuBtn)) {
        this.state = 'menu';
        this.reset();
        this.initLayout();
      }
      return;
    }

    if (this.state === 'paused') {
      if (this.hit(x, y, this.resumeBtn)) { this.state = 'playing'; this.lastTime = Date.now(); }
      else if (this.hit(x, y, this.pauseRestartBtn)) this.startGame();
      else if (this.hit(x, y, this.pauseMenuBtn)) { this.state = 'menu'; this.reset(); this.initLayout(); }
      else if (this.hit(x, y, this.pauseCatalogBtn)) this.openCatalog('paused');
      return;
    }

    if (this.state === 'influencer') {
      if (this.hit(x, y, this.influencerAcceptBtn)) this.handleInfluencerChoice(true);
      else if (this.hit(x, y, this.influencerRejectBtn)) this.handleInfluencerChoice(false);
      return;
    }

    if (this.state === 'tutorial') { this.handleTutorialTouch(x, y); return; }

    if (this.hit(x, y, this.catalogBtn)) { this.openCatalog('playing'); return; }
    if (this.hit(x, y, this.pauseBtn)) { this.state = 'paused'; return; }
    if (this.heldPancake) return;
    if (this.heldIngredient) {
      // 点选模式：再次点击锅位直接放料；点击当前食材按钮可取消选择。
      const selectedBtn = this.buttons.find(btn =>
        (btn.type === 'ingredient' || btn.type === 'topping') && this.hit(x, y, btn));
      if (selectedBtn) {
        const selectedId = this.heldIngredient.type === 'batter' ? 'batter' : this.heldIngredient.toppingId;
        if (selectedBtn.id === selectedId) {
          this.heldIngredient = null;
          this.spawnText(selectedBtn.x + selectedBtn.w / 2, selectedBtn.y - 8, '已取消', '#607D8B');
        } else {
          this.heldIngredient = null;
          this.onButton(selectedBtn);
        }
        return;
      }
      const targetPan = this.getPanAt(x, y);
      if (targetPan) {
        this.tryPlaceHeldIngredient(targetPan, false);
        this.heldIngredient = null;
        return;
      }
      this.heldIngredient = null;
      return;
    }

    // 尝试从锅位取饼或翻面
    for (let i = 0; i < this.pans.length; i++) {
      const pan = this.pans[i];
      const dist = Math.hypot(x - pan.x, y - pan.y);
      if (dist < 45 && pan.pancake && !pan.pancake.held) {
        if (this.isPanFlipping(pan)) return;
        const p = pan.pancake;
        // 需要翻面时点击 = 翻面
        if (p.needsFlip && p.phase === 'first') {
          this.startPanFlip(pan);
          return;
        }
        // 糊饼无论停在哪一面都必须能取出，否则会永久占住锅位。
        if (p.state === 'burnt') {
          p.held = true;
          this.heldPancake = p;
          this.heldFromPan = i;
          p.targetScale = 1.2;
          return;
        }
        // 生的第一面不能取
        if (p.phase === 'first' && p.state === 'raw') {
          p.targetScale = 0.9;
          setTimeout(() => { if (p) p.targetScale = 1; }, 100);
          return;
        }
        // 第一面未翻面不能取
        if (p.phase === 'first') {
          p.targetScale = 0.9;
          setTimeout(() => { if (p) p.targetScale = 1; }, 100);
          return;
        }
        // 第二面且未糊才能取
        if (p.phase === 'second' && p.state !== 'burnt') {
          p.held = true;
          this.heldPancake = p;
          this.heldFromPan = i;
          p.targetScale = 1.2;
          return;
        }
      }
    }

    // 尝试从容器取饼
    if (!this.heldPancake) {
      const { trayY, slotW, slotH, slotGap, startX } = this.getTrayLayout();
      for (let i = 0; i < this.container.length; i++) {
        const p = this.container[i];
        if (p && !p.held) {
          const px = startX + i * (slotW + slotGap) + slotW / 2;
          const py = trayY + slotH / 2;
          const dist = Math.hypot(x - px, y - py);
          if (dist < 30) {
            p.held = true;
            this.heldPancake = p;
            this.heldFromPan = -1;
            this.heldFromContainer = i;
            p.targetScale = 1.2;
            return;
          }
        }
      }
    }

    // 检测按钮（如果正在手持原料或煎饼，不响应按钮）
    if (!this.heldIngredient && !this.heldPancake) {
      for (const btn of this.buttons) {
        if (this.hit(x, y, btn)) { this.onButton(btn); return; }
      }
    }
  }

  handleTutorialTouch(x, y) {
    this.touchX = x; this.touchY = y;
    const step = this.tutorial.step;

    // 任意练习步骤可跳过教程（总结页除外）
    if (step < 5 && this.tutorialSkipBtn && this.hit(x, y, this.tutorialSkipBtn)) {
      this.finishTutorial();
      return;
    }

    // 步骤0先看懂订单；步骤5完成后开始营业
    if (step === 0) {
      const btn = this.tutorialContinueBtn;
      if (btn && this.hit(x, y, btn)) this.tutorial.step = 1;
      return;
    }
    if (step === 5) {
      const btn = this.tutorialContinueBtn;
      if (btn && this.hit(x, y, btn)) this.finishTutorial();
      return;
    }

    if (step === 1) {
      if (this.heldIngredient) {
        // 手持面糊时：点击空锅位直接下锅（点按式，无需拖拽）
        const pan = this.getPanAt(x, y);
        if (pan) this.tryPlaceHeldIngredient(pan, true);
        return;
      }
      const btn = this.buttons.find(b => b.id === 'batter');
      if (btn && this.hit(x, y, btn)) {
        this.touchStartX = x; this.touchStartY = y; this.touchMoved = false;
        this.onButton(btn);
        return;
      }
      // 直接点空锅位时给出引导提示
      const emptyPan = this.getPanAt(x, y);
      if (emptyPan) this.spawnText(emptyPan.x, emptyPan.y - 50, '先点【面饼】拿面糊', '#FF7043');
      return;
    }

    if (step === 2) {
      if (this.heldIngredient) {
        const pan = this.getPanAt(x, y);
        if (pan) this.tryPlaceHeldIngredient(pan, true);
        return;
      }
      const eggBtn = this.buttons.find(b => b.id === 'egg');
      if (eggBtn && this.hit(x, y, eggBtn)) {
        this.touchStartX = x; this.touchStartY = y; this.touchMoved = false;
        this.onButton(eggBtn);
        return;
      }
      const pan = this.getPanAt(x, y);
      if (pan) this.spawnText(pan.x, pan.y - 50, '先点【蛋】拿鸡蛋', '#FF7043');
      return;
    }

    if (step === 3) {
      for (const pan of this.pans) {
        if (Math.hypot(x - pan.x, y - pan.y) >= 45 || !pan.pancake || pan.pancake.held) continue;
        const p = pan.pancake;
        if (p.phase === 'first' && p.needsFlip) {
          if (this.startPanFlip(pan)) this.tutorial.step = 4;
        } else if (p.phase === 'first') {
          this.spawnText(pan.x, pan.y - 50, '等★出现再翻面', '#42A5F5');
        }
        return;
      }
      return;
    }

    if (step === 4) {
      if (this.heldPancake) {
        // 手持煎饼时：点击顾客直接上菜（点按式）
        const target = this.customers.find(c => c.state === 'waiting' && this.hit(x, y, {
          x: c.x - c.width / 2, y: c.y - c.height / 2, w: c.width, h: c.height
        }));
        if (target) this.tutorialServe(target);
        return;
      }
      // 从锅位取已翻面的饼
      for (let i = 0; i < this.pans.length; i++) {
        const pan = this.pans[i];
        if (Math.hypot(x - pan.x, y - pan.y) < 45 && pan.pancake && !pan.pancake.held && pan.pancake.phase === 'second') {
          const p = pan.pancake;
          if (this.isPanFlipping(pan)) return;
          if (p.state === 'raw') {
            this.spawnText(pan.x, pan.y - 50, '等✓出现再出锅', '#2D88A8');
            return;
          }
          p.held = true;
          this.heldPancake = p;
          this.heldFromPan = i;
          p.targetScale = 1.2;
          return;
        }
      }
      // 空手点顾客时给出引导提示
      const c = this.customers.find(cc => cc.state === 'waiting' && this.hit(x, y, {
        x: cc.x - cc.width / 2, y: cc.y - cc.height / 2, w: cc.width, h: cc.height
      }));
      if (c) this.spawnText(c.x, c.y - 55, '先从锅位取饼', '#FF7043');
      return;
    }
  }

  handleTouchMove(x, y) {
    this.touchX = x; this.touchY = y;
    if (Math.hypot(x - this.touchStartX, y - this.touchStartY) > 8) this.touchMoved = true;
  }

  handleTouchEnd() {
    if (this.state === 'tutorial') { this.handleTutorialTouchEnd(); return; }
    if (this.state !== 'playing') return;
    
    // 处理手持原料拖到锅位
    if (this.heldIngredient) {
      // 没有移动就是一次点选；第二次点锅已在 handleTouch 中完成放料。
      if (!this.touchMoved) return;
      const hitPan = this.getPanAt(this.touchX, this.touchY);
      if (hitPan) {
        this.tryPlaceHeldIngredient(hitPan, false);
        this.heldIngredient = null;
        return;
      }
      this.heldIngredient = null;
      this.spawnText(this.touchX, this.touchY - 30, '已放回料台', '#607D8B');
      return;
    }
    
    if (!this.heldPancake) return;

    // 1. 拖到垃圾桶
    if (this.hit(this.touchX, this.touchY, this.trashCan)) {
      if (this.heldPancake) {
        const basePrice = this.getPrice(CONFIG.PRICES.base);
        let toppingPrice = 0;
        this.heldPancake.toppings.forEach(tid => { toppingPrice += this.getPrice(CONFIG.TOPPING_PRICES[tid] || 0); });
        const totalPrice = basePrice + toppingPrice;
        if (Math.random() < CONFIG.GAME.trashRefundChance) {
          const refund = Math.max(1, Math.floor(totalPrice * CONFIG.GAME.trashRefundRatio));
          this.resources.gold += refund;
          this.spawnText(this.trashCan.x + this.trashCan.w / 2, this.trashCan.y - 30, `返还${refund}金`, '#FFD700');
        }
      }
      if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
      if (this.heldFromContainer >= 0) this.container.splice(this.heldFromContainer, 1);
      this.spawnParticles(this.trashCan.x + this.trashCan.w / 2, this.trashCan.y + this.trashCan.h / 2, '#555', 3, 8);
      this.spawnText(this.trashCan.x + this.trashCan.w / 2, this.trashCan.y - 10, '丢弃!', '#EF5350');
      this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1; return;
    }

    // 2. 拖到容器
    const { trayY, slotH, totalW, startX } = this.getTrayLayout();
    if (this.containerMax > 0 && this.touchY >= trayY - 15 && this.touchY <= trayY + slotH + 15 &&
        this.touchX >= startX - 15 && this.touchX <= startX + totalW + 15) {
      if (this.heldFromContainer >= 0) {
        // 在容器内移动，直接放下
        this.heldPancake.held = false;
        this.heldPancake.targetScale = 1;
        this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
        return;
      }
      if (this.container.length < this.containerMax) {
        this.heldPancake.held = false;
        this.heldPancake.targetScale = 1;
        this.container.push(this.heldPancake);
        if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
        this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
        return;
      }
    }

    // 3. 拖到顾客 → 上菜
    const target = this.customers.find(c => c.state === 'waiting' && this.hit(this.touchX, this.touchY, {
      x: c.x - c.width / 2, y: c.y - c.height / 2, w: c.width, h: c.height
    }));
    if (target) {
      const p = this.heldPancake;
      const priceMap = {
        base: this.getPrice(CONFIG.PRICES.base),
        toppings: {}
      };
      CONFIG.GAME.toppings.forEach(t => {
        priceMap.toppings[t.id] = this.getPrice(CONFIG.TOPPING_PRICES[t.id] || 0);
      });
      const result = target.serve(p, priceMap, { streak: this.streakCount });

      // 处理金币
      if (result.gold > 0) {
        this.resources.gold += result.gold;
        this.score += result.gold;
      }
      this.spawnText(target.x, target.y - 20, result.text, result.gold > 0 ? '#66BB6A' : '#EF5350');
      this.spawnParticles(target.x, target.y, result.gold > 0 ? '#FFD700' : '#555', result.gold > 0 ? 5 : 2, result.gold > 0 ? 12 : 6);

      // 处理人气
      let popGain = result.popularity;
      if (result.gold > 0) {
        this.customersServed++;
        this.streakCount++;
        this.lastServeCorrect = true;
        // 计算倍数
        let mult = 1;
        for (let i = 0; i < CONFIG.GAME.streakThresholds.length; i++) {
          if (this.streakCount >= CONFIG.GAME.streakThresholds[i]) mult = CONFIG.GAME.streakMultipliers[i + 1];
        }
        this.streakMultiplier = mult;
        // 完美翻面双倍人气
        if (result.perfectFlip) popGain *= 2;
        popGain = Math.floor(popGain * mult);
      } else if (!result.retry) {
        // 错误且不重做
        this.streakCount = 0;
        this.streakMultiplier = 1;
        this.lastServeCorrect = false;
      }
      this.popularity += popGain;
      if (popGain !== 0) {
        this.spawnText(target.x, target.y - 45, (popGain > 0 ? '+' : '') + popGain + '人气', popGain > 0 ? '#E91E63' : '#EF5350');
      }
      if (this.streakMultiplier > 1 && result.gold > 0) {
        this.spawnText(target.x, target.y - 65, `x${this.streakMultiplier}连击!`, '#AB47BC');
      }

      if (this.popularity <= 0) {
        this.endGame();
      }

      // 清空来源
      if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
      if (this.heldFromContainer >= 0) this.container.splice(this.heldFromContainer, 1);
      this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
      return;
    }

    // 4. 点一下取饼时保留手持状态，拖到无效位置才放回原处
    if (!this.touchMoved) return;
    this.heldPancake.held = false;
    this.heldPancake.targetScale = 1;
    this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
  }

  handleTutorialTouchEnd() {
    // 手持原料：拖到锅位松开 = 下锅/加料；松开位置不对则回到料台
    if (this.heldIngredient) {
      // 点选模式在按下时处理，抬手时只处理真正发生过移动的拖动。
      if (!this.touchMoved) return;
      const pan = this.getPanAt(this.touchX, this.touchY);
      if (pan) {
        this.tryPlaceHeldIngredient(pan, true);
        this.heldIngredient = null;
        return;
      }
      this.heldIngredient = null;
      this.spawnText(this.touchX, this.touchY - 30, '已放回料台', '#607D8B');
      return;
    }
    if (this.tutorial.step !== 4 || !this.heldPancake) return;
    const target = this.customers.find(c => c.state === 'waiting' && this.hit(this.touchX, this.touchY, {
      x: c.x - c.width / 2, y: c.y - c.height / 2, w: c.width, h: c.height
    }));
    if (target) { this.tutorialServe(target); return; }
    // 松手位置无效：放回锅位
    this.heldPancake.held = false; this.heldPancake.targetScale = 1;
    this.heldPancake = null; this.heldFromPan = -1;
  }

  // 教程：把面糊放进指定锅位
  tutorialPlaceBatter(pan) {
    this.tryPlaceHeldIngredient(pan, true);
  }

  // 教程：把手中煎饼上给指定顾客
  tutorialServe(target) {
    if (!this.heldPancake) return;
    const priceMap = { base: this.getPrice(CONFIG.PRICES.base), toppings: {} };
    CONFIG.GAME.toppings.forEach(t => { priceMap.toppings[t.id] = this.getPrice(CONFIG.TOPPING_PRICES[t.id] || 0); });
    const result = target.serve(this.heldPancake, priceMap, {});
    this.spawnText(target.x, target.y - 20, result.text || '上菜!', '#66BB6A');
    this.spawnParticles(target.x, target.y, '#FFD700', 5, 12);
    if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
    this.heldPancake = null; this.heldFromPan = -1;
    this.tutorial.step = 5;
  }

  // 教程完成（含跳过）：写入标记并直接开局
  finishTutorial() {
    try { wx.setStorageSync('hasPlayedTutorial', true); } catch (e) {}
    this.startGame();
  }

  // ===================== 按钮逻辑 =====================

  onButton(btn) {
    if (btn.type === 'ingredient') {
      // 点击面饼按钮：生成手持面饼原料
      for (const [res, need] of Object.entries(btn.need)) { if (this.resources[res] < need) return; }
      this.heldIngredient = { type: 'batter', need: btn.need };
      return;
    }

    if (btn.type === 'topping') {
      // 点击小料按钮：生成手持小料原料
      if (this.resources[btn.toppingId] < 1) return;
      const tcfg = CONFIG.GAME.toppings.find(t => t.id === btn.toppingId);
      if (tcfg && tcfg.unlockWave > this.wave) return;
      this.heldIngredient = { type: 'topping', toppingId: btn.toppingId };
      return;
    }

    if (btn.type === 'buy') {
      const cost = btn.cost;
      if (this.resources.gold < cost) return;
      this.resources.gold -= cost;
      this.resources[btn.item] += (btn.item === 'batter' ? 5 : 3);
      this.spawnParticles(btn.x + btn.w / 2, btn.y + btn.h / 2, '#FFD700', 2, 5);
      return;
    }

    if (btn.type === 'buyBundle') {
      if (this.wave < btn.unlockWave || this.resources.gold < btn.cost) return;
      this.resources.gold -= btn.cost;
      btn.items.forEach(itemId => { this.resources[itemId] += btn.buyAmount; });
      this.spawnParticles(btn.x + btn.w / 2, btn.y + btn.h / 2, '#FFD700', 3, 8);
      this.spawnText(btn.x + btn.w / 2, btn.y - 10, '小料各+' + btn.buyAmount, '#3F8F73');
      return;
    }

    if (btn.type === 'upgrade') {
      // 容器升级单独处理（不在 UPGRADES 配置中）
      if (btn.upId === 'container') {
        const maxLevel = CONFIG.GAME.containerMaxSlots.length - 1;
        if (this.upgrades.container >= maxLevel) return;
        const cost = CONFIG.GAME.containerUpgradeCosts[this.upgrades.container];
        if (this.resources.gold < cost) return;
        this.resources.gold -= cost;
        this.upgrades.container++;
        this.containerMax = CONFIG.GAME.containerMaxSlots[this.upgrades.container];
        this.spawnParticles(btn.x + btn.w / 2, btn.y + btn.h / 2, '#AB47BC', 4, 10);
        this.spawnText(btn.x + btn.w / 2, btn.y - 10, '托盘+' + this.containerMax, '#AB47BC');
        return;
      }
      const up = CONFIG.UPGRADES.find(u => u.id === btn.upId);
      if (!up || this.upgrades[btn.upId] >= up.max || this.resources.gold < up.cost) return;
      this.resources.gold -= up.cost;
      this.upgrades[btn.upId]++;
      this.spawnParticles(btn.x + btn.w / 2, btn.y + btn.h / 2, '#AB47BC', 4, 10);
      this.spawnText(btn.x + btn.w / 2, btn.y - 10, btn.upId === 'speed' ? '技巧生效' : btn.label + '+1', '#AB47BC');
      if (btn.upId === 'slot') {
        const oldPans = this.pans.map(p => p.pancake);
        this.initPans();
        oldPans.forEach((p, i) => {
          if (i < this.pans.length) {
            this.pans[i].pancake = p;
            if (p) { this.pans[i].pancake.x = this.pans[i].x; this.pans[i].pancake.y = this.pans[i].y; }
          }
        });
        this.initLayout(); // 锅位变化后重新计算按钮和垃圾桶位置
      }
      return;
    }
  }


  hit(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  // ===================== 渲染系统 =====================

  render() {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = CONFIG.COLOR.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.state === 'menu') { this.renderMenu(ctx); return; }
    if (this.state === 'catalog') { this.renderCatalog(ctx); return; }
    if (this.state === 'tutorial') { this.renderTutorial(ctx); return; }

    this.renderGame(ctx);
    if (this.state === 'gameover') this.renderGameOver(ctx);
    if (this.state === 'paused') this.renderPaused(ctx);
    if (this.state === 'influencer') this.renderInfluencer(ctx);
  }

  renderGame(ctx) {
    const w = this.width, h = this.height;
    const controlsY = (this.buttons[0] ? this.buttons[0].y : h - 210) - 14;

    // ---------- 摊位空间：冷色墙面、暖色台面、浅色操作区 ----------
    ctx.fillStyle = CONFIG.COLOR.wall;
    ctx.fillRect(0, 0, w, 198);
    ctx.strokeStyle = CONFIG.COLOR.wallLine;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, 198); ctx.stroke();
    }
    for (let y = 112; y < 198; y += 34) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = CONFIG.COLOR.counter;
    ctx.fillRect(0, 198, w, controlsY - 198);
    ctx.fillStyle = CONFIG.COLOR.counterEdge;
    ctx.fillRect(0, controlsY - 7, w, 9);
    ctx.fillStyle = CONFIG.COLOR.panel;
    ctx.fillRect(0, controlsY + 2, w, h - controlsY - 2);

    // ---------- 顶部 HUD ----------
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, this.topOffset, w, 52);
    ctx.fillStyle = 'rgba(23,35,39,0.16)';
    ctx.fillRect(0, this.topOffset + 52, w, 2);
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 第一行：金币 + 材料
    ctx.fillText('💰×' + this.resources.gold, 10, 16 + this.topOffset);
    const itemStartX = Math.max(82, w * 0.24);
    const itemGap = (w - 55 - itemStartX) / 2;
    ctx.fillText('面×' + this.resources.batter, itemStartX, 16 + this.topOffset);
    CONFIG.GAME.toppings.slice(0, 2).forEach((t, index) => {
      ctx.fillText(t.name + '×' + this.resources[t.id], itemStartX + (index + 1) * itemGap, 16 + this.topOffset);
    });

    // 第二行：波次 + 实时得分 + 人气 + 接待 + 倍数
    const metricY = 38 + this.topOffset;
    const metricFontSize = w < 350 ? 11 : 12;
    const scoreX = w * 0.16;
    const popularityX = w * 0.34;
    const servedX = w * 0.58;
    const streakX = w * 0.80;
    ctx.fillStyle = '#5D4037';
    ctx.font = metricFontSize + 'px sans-serif';
    ctx.fillText(`第${this.wave}波`, 10, metricY);
    ctx.fillStyle = '#D07A32';
    ctx.fillText(`得分${this.score}`, scoreX, metricY);
    ctx.fillStyle = CONFIG.COLOR.popularity;
    ctx.fillText(`🔥人气${this.popularity}`, popularityX, metricY);
    ctx.fillStyle = '#AB47BC';
    ctx.fillText(`接待${this.customersServed}位`, servedX, metricY);
    if (this.streakMultiplier > 1) {
      ctx.fillStyle = '#FF9800';
      ctx.fillText(`x${this.streakMultiplier}`, streakX, metricY);
    }

    // 图鉴与暂停按钮（教程里不可点，不绘制避免误导）
    if (this.state !== 'tutorial') {
      const cb = this.catalogBtn;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      fillRoundRect(ctx, cb.x, cb.y, cb.w, cb.h, 6);
      ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2;
      strokeRoundRect(ctx, cb.x, cb.y, cb.w, cb.h, 6);
      ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cb.label, cb.x + cb.w / 2, cb.y + cb.h / 2);

      const pb = this.pauseBtn;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      fillRoundRect(ctx, pb.x, pb.y, pb.w, pb.h, 6);
      ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2;
      strokeRoundRect(ctx, pb.x, pb.y, pb.w, pb.h, 6);
      ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pb.label, pb.x + pb.w / 2, pb.y + pb.h / 2);
    }

    // ---------- 顾客区域 ----------
    const customerGap = this.customers.length > 1
      ? Math.min(70, (w - 70) / (this.customers.length - 1))
      : 0;
    this.customers.forEach((c, i) => {
      c.x = this.customers.length === 1 ? Math.min(110, w / 2) : 35 + i * customerGap;
      c.y = 158;
      c.orderBubbleOffset = this.customers.length > 3 ? (i % 2) * 16 : 0;
      c.draw(ctx);
    });

    // ---------- 锅位背景 ----------
    const panY = this.panY;
    ctx.fillStyle = 'rgba(23,35,39,0.24)';
    ctx.beginPath(); ctx.ellipse(w / 2, panY + this.panRadius * 0.72, this.panRadius * 0.9, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CONFIG.COLOR.stove;
    ctx.beginPath(); ctx.arc(w / 2, panY, this.panRadius + 10, 0, Math.PI * 2); ctx.fill();
    const panGradient = ctx.createRadialGradient(w / 2 - 24, panY - 30, 8, w / 2, panY, this.panRadius);
    panGradient.addColorStop(0, '#53666C');
    panGradient.addColorStop(0.58, CONFIG.COLOR.pan);
    panGradient.addColorStop(1, '#172327');
    ctx.fillStyle = panGradient;
    ctx.beginPath(); ctx.arc(w / 2, panY, this.panRadius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2 - 4, panY - 4, this.panRadius - 10, Math.PI * 1.08, Math.PI * 1.82); ctx.stroke();

    // ---------- 锅位与煎饼 ----------
    this.pans.forEach(pan => {
      const flipAnimation = this.flipAnimations.find(a => a.pan === pan);
      if (flipAnimation) {
        this.drawFlipAnimation(ctx, flipAnimation);
      } else if (pan.pancake && !pan.pancake.held) {
        pan.pancake.draw(ctx);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(pan.x, pan.y, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    if (this.heldPancake) this.heldPancake.draw(ctx);

    // ---------- 容器（购买后才显示）----------
    if (this.containerMax > 0) this.renderContainer(ctx);

    // ---------- 按钮区 ----------
    this.buttons.forEach(btn => {
      let disabled = false;
      let color = CONFIG.COLOR.btn;
      if (btn.type === 'upgrade') color = '#AB47BC';
      else if (btn.type === 'buy' || btn.type === 'buyBundle') color = '#42A5F5';
      else if (btn.type === 'topping') color = CONFIG.COLOR.btnTopping;

      if (btn.type === 'ingredient') {
        for (const [res, need] of Object.entries(btn.need)) { if (this.resources[res] < need) disabled = true; }
      } else if (btn.type === 'topping') {
        const hasPan = this.pans.some(p => p.pancake && !p.pancake.held && p.pancake.canAddTopping(btn.toppingId));
        if (!hasPan || (this.resources[btn.toppingId] || 0) < 1) disabled = true;
        // 未解锁
        const tcfg = CONFIG.GAME.toppings.find(t => t.id === btn.toppingId);
        if (tcfg && tcfg.unlockWave > this.wave) disabled = true;
      } else if (btn.type === 'buy') {
        if (this.resources.gold < btn.cost) disabled = true;

      } else if (btn.type === 'buyBundle') {
        if (this.wave < btn.unlockWave || this.resources.gold < btn.cost) disabled = true;

      } else if (btn.type === 'upgrade') {
        if (btn.upId === 'container') {
          const maxLevel = CONFIG.GAME.containerMaxSlots.length - 1;
          if (this.upgrades.container >= maxLevel) disabled = true;
          else {
            const cost = CONFIG.GAME.containerUpgradeCosts[this.upgrades.container];
            if (this.resources.gold < cost) disabled = true;
          }
        } else {
          const up = CONFIG.UPGRADES.find(u => u.id === btn.upId);
          if (up && (this.upgrades[btn.upId] >= up.max || this.resources.gold < up.cost)) disabled = true;
        }
      }

      if (disabled) color = CONFIG.COLOR.btnDisabled;
      // 未解锁的小料按钮变灰
      if (btn.type === 'topping') {
        const tcfg = CONFIG.GAME.toppings.find(t => t.id === btn.toppingId);
        if (tcfg && tcfg.unlockWave > this.wave) {
          color = '#E0E0E0';
          btn._lockedLabel = btn.label;
        } else {
          btn._lockedLabel = null;
        }
      }

      ctx.fillStyle = color;
      fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
      const selectedId = this.heldIngredient
        ? (this.heldIngredient.type === 'batter' ? 'batter' : this.heldIngredient.toppingId)
        : null;
      if (selectedId === btn.id) {
        ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 4;
        strokeRoundRect(ctx, btn.x - 2, btn.y - 2, btn.w + 4, btn.h + 4, 8);
      }
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = btn._lockedLabel || btn.label;
      ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 5);

      // 副标签
      ctx.font = '9px sans-serif';
      if (btn.type === 'ingredient') {
        const resTexts = [];
        for (const [res, need] of Object.entries(btn.need)) {
          const resName = res === 'batter' ? '面' : res;
          resTexts.push(resName + this.resources[res]);
        }
        ctx.fillStyle = disabled ? '#EF5350' : '#FFEB3B';
        ctx.fillText(resTexts.join(' '), btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
      } else if (btn.type === 'topping') {
        const qty = this.resources[btn.toppingId] || 0;
        const tcfg = CONFIG.GAME.toppings.find(t => t.id === btn.toppingId);
        const locked = tcfg && tcfg.unlockWave > this.wave;
        ctx.fillStyle = disabled ? '#EF5350' : '#FFEB3B';
        ctx.font = locked ? '8px sans-serif' : '9px sans-serif';
        ctx.fillText(locked ? '第' + tcfg.unlockWave + '波解锁' : '×' + qty, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
      } else if (btn.type === 'buy') {
        ctx.fillStyle = disabled ? '#EEE' : '#FFEB3B';
        const amount = btn.item === 'batter' ? 5 : 3;
        ctx.fillText('💰' + btn.cost + '  +' + amount, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);

      } else if (btn.type === 'buyBundle') {
        ctx.fillStyle = disabled ? '#EEE' : '#FFEB3B';
        ctx.font = '8px sans-serif';
        const detail = this.wave < btn.unlockWave ? '第' + btn.unlockWave + '波开放' : '💰' + btn.cost + '  四种各+' + btn.buyAmount;
        ctx.fillText(detail, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);

      } else if (btn.type === 'upgrade') {
        ctx.font = '8px sans-serif';
        if (btn.upId === 'container') {
          const maxLevel = CONFIG.GAME.containerMaxSlots.length - 1;
          const lvl = this.upgrades.container;
          ctx.fillStyle = (disabled || lvl >= maxLevel) ? '#EEE' : '#FFEB3B';
          const detail = lvl >= maxLevel ? 'MAX' : '容量+1·💰' + CONFIG.GAME.containerUpgradeCosts[lvl];
          ctx.fillText(detail, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
        } else {
          const up = CONFIG.UPGRADES.find(u => u.id === btn.upId);
          const lvl = this.upgrades[btn.upId];
          ctx.fillStyle = (disabled || lvl >= up.max) ? '#EEE' : '#FFEB3B';
          ctx.fillText(lvl >= up.max ? 'MAX' : up.desc + '·💰' + up.cost, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
        }
      }
    });

    // ---------- 手持原料绘制 ----------
    if (this.heldIngredient) {
      const ing = this.heldIngredient;
      const hx = this.heldIngredient.x || this.touchX;
      const hy = this.heldIngredient.y || this.touchY;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      if (ing.type === 'batter') {
        ctx.fillStyle = '#FFF';
        ctx.fill();
        ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#3E2723'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('面糊', 0, 0);
      } else if (ing.type === 'topping') {
        const tcfg = CONFIG.GAME.toppings.find(t => t.id === ing.toppingId);
        ctx.fillStyle = tcfg ? CONFIG.COLOR[tcfg.colorKey] : '#999';
        ctx.fill();
        ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tcfg ? tcfg.name : '?', 0, 0);
      }
      ctx.restore();
    }

    // ---------- 浮动文字 ----------
    this.floatingTexts.forEach(t => {
      ctx.globalAlpha = Math.max(0, t.life / 1400);
      ctx.fillStyle = t.color; ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    });

    // ---------- 粒子 ----------
    this.particles.forEach(p => p.draw(ctx));

    // ---------- 垃圾桶 ----------
    this.renderTrashCan(ctx);

    // ---------- 提示 ----------
    if (this.heldPancake) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('拖到顾客或托盘上菜，拖到垃圾桶丢弃', w / 2, h - 15);
    } else if (this.heldIngredient) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('已选中：点锅位或拖到锅位；再点食材取消', w / 2, h - 15);
    }
  }

  renderTrashCan(ctx) {
    const tc = this.trashCan;
    const active = !!this.heldPancake && this.hit(this.touchX, this.touchY, tc);
    const centerX = tc.x + tc.w / 2;

    ctx.save();
    if (active) {
      ctx.fillStyle = 'rgba(242,183,5,0.22)';
      ctx.beginPath(); ctx.arc(centerX, tc.y + tc.h / 2, 34, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(23,35,39,0.22)';
    ctx.beginPath(); ctx.ellipse(centerX, tc.y + tc.h - 1, 21, 6, 0, 0, Math.PI * 2); ctx.fill();

    const bodyGradient = ctx.createLinearGradient(tc.x + 8, 0, tc.x + tc.w - 8, 0);
    bodyGradient.addColorStop(0, active ? '#E5B647' : '#73868C');
    bodyGradient.addColorStop(0.48, active ? '#FFE082' : '#C5D0D3');
    bodyGradient.addColorStop(1, active ? '#C88A19' : '#65777C');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(tc.x + 10, tc.y + 16);
    ctx.lineTo(tc.x + tc.w - 10, tc.y + 16);
    ctx.lineTo(tc.x + tc.w - 14, tc.y + tc.h - 4);
    ctx.lineTo(tc.x + 14, tc.y + tc.h - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = active ? '#8F6414' : '#40545A'; ctx.lineWidth = active ? 3 : 2; ctx.stroke();

    ctx.strokeStyle = active ? 'rgba(143,100,20,0.55)' : 'rgba(64,84,90,0.48)';
    ctx.lineWidth = 1.5;
    [19, 25, 31].forEach(offset => {
      ctx.beginPath(); ctx.moveTo(tc.x + offset, tc.y + 21); ctx.lineTo(tc.x + offset, tc.y + 39); ctx.stroke();
    });

    ctx.fillStyle = active ? '#F2B705' : '#8EA0A5';
    fillRoundRect(ctx, tc.x + 6, tc.y + 10, tc.w - 12, 8, 3);
    ctx.strokeStyle = active ? '#8F6414' : '#40545A'; ctx.lineWidth = 2;
    strokeRoundRect(ctx, tc.x + 6, tc.y + 10, tc.w - 12, 8, 3);
    ctx.strokeStyle = active ? '#8F6414' : '#40545A'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(centerX, tc.y + 10, 7, Math.PI, 0); ctx.stroke();

    ctx.fillStyle = active ? '#8F6414' : '#263238';
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tc.label, centerX, tc.y + tc.h - 9);
    ctx.restore();
  }

  drawFlipAnimation(ctx, animation) {
    const elapsed = Date.now() - animation.start;
    const t = Math.max(0, Math.min(1, elapsed / animation.duration));
    const eased = t * t * (3 - 2 * t);
    const lift = Math.sin(Math.PI * eased) * 34;
    const pan = animation.pan;
    const pancake = animation.pancake;

    ctx.save();
    ctx.translate(pan.x, pan.y);

    // 铲子先从左侧滑入，再抬起饼面。
    ctx.save();
    ctx.translate(-58 + eased * 38, 18 - lift * 0.42);
    ctx.rotate(-0.28 + eased * 0.42);
    ctx.strokeStyle = '#7A4B32'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-58, 18); ctx.lineTo(2, 0); ctx.stroke();
    const bladeGradient = ctx.createLinearGradient(0, -10, 34, 14);
    bladeGradient.addColorStop(0, '#F5F7F7');
    bladeGradient.addColorStop(1, '#8D9A9E');
    ctx.fillStyle = bladeGradient;
    fillRoundRect(ctx, -1, -10, 38, 23, 6);
    ctx.strokeStyle = '#60747A'; ctx.lineWidth = 1.5;
    strokeRoundRect(ctx, -1, -10, 38, 23, 6);
    ctx.restore();

    const originalX = pancake.x;
    const originalY = pancake.y;
    const originalBounce = pancake.bounce;
    pancake.x = 0;
    pancake.y = -lift;
    pancake.bounce = 0;
    ctx.rotate((eased - 0.5) * 0.14);
    ctx.scale(1, Math.max(0.12, Math.abs(Math.cos(Math.PI * eased))));
    pancake.draw(ctx);
    pancake.x = originalX;
    pancake.y = originalY;
    pancake.bounce = originalBounce;
    ctx.restore();
  }

  renderContainer(ctx) {
    if (this.containerMax <= 0) return;
    const w = this.width;
    const { trayY, slotW, slotH, slotGap, totalW, startX } = this.getTrayLayout();

    const trayX = startX - 9;
    const trayW = totalW + 18;
    const trayH = slotH + 14;
    const trayActive = !!this.heldPancake &&
      this.touchY >= trayY - 15 && this.touchY <= trayY + slotH + 15 &&
      this.touchX >= startX - 15 && this.touchX <= startX + totalW + 15;

    // 金属托盘：投影、侧把手、外沿和内槽分层绘制。
    ctx.fillStyle = 'rgba(23,35,39,0.2)';
    fillRoundRect(ctx, trayX + 2, trayY + 2, trayW, trayH, 8);
    const trayGradient = ctx.createLinearGradient(trayX, trayY - 8, trayX + trayW, trayY + trayH);
    trayGradient.addColorStop(0, trayActive ? '#FFE082' : '#E7EFF0');
    trayGradient.addColorStop(0.5, trayActive ? '#E5B647' : '#AEBCC0');
    trayGradient.addColorStop(1, trayActive ? '#C88A19' : '#7B8D92');
    ctx.fillStyle = trayGradient;
    fillRoundRect(ctx, trayX, trayY - 7, trayW, trayH, 8);
    ctx.strokeStyle = trayActive ? '#8F6414' : '#40545A'; ctx.lineWidth = trayActive ? 3 : 2;
    strokeRoundRect(ctx, trayX, trayY - 7, trayW, trayH, 8);

    ctx.fillStyle = trayActive ? '#D8A72E' : '#87999E';
    fillRoundRect(ctx, trayX - 8, trayY + 11, 11, 22, 4);
    fillRoundRect(ctx, trayX + trayW - 3, trayY + 11, 11, 22, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(trayX + 7, trayY - 2); ctx.lineTo(trayX + trayW - 7, trayY - 2); ctx.stroke();

    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('备餐托盘 ' + this.container.length + '/' + this.containerMax, w / 2, trayY - 13);

    // 每个槽位
    for (let i = 0; i < this.containerMax; i++) {
      const x = startX + i * (slotW + slotGap);
      const p = this.container[i];
      const slotGradient = ctx.createLinearGradient(x, trayY, x + slotW, trayY + slotH);
      slotGradient.addColorStop(0, 'rgba(61,78,84,0.34)');
      slotGradient.addColorStop(1, 'rgba(255,255,255,0.28)');
      ctx.fillStyle = slotGradient;
      fillRoundRect(ctx, x + 3, trayY + 4, slotW - 6, slotH - 8, 6);
      ctx.strokeStyle = 'rgba(64,84,90,0.55)'; ctx.lineWidth = 1.5;
      strokeRoundRect(ctx, x + 3, trayY + 4, slotW - 6, slotH - 8, 6);

      if (p && !p.held) {
        const originalX = p.x;
        const originalY = p.y;
        ctx.save();
        ctx.translate(x + slotW / 2, trayY + slotH / 2);
        ctx.scale(0.52, 0.52);
        p.x = 0; p.y = 0;
        p.draw(ctx);
        p.x = originalX; p.y = originalY;
        ctx.restore();
      } else if (!p) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(x + slotW / 2, trayY + slotH / 2, 15, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  renderMenu(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = CONFIG.COLOR.wall; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = CONFIG.COLOR.wallLine; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 54) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.62); ctx.stroke();
    }
    ctx.fillStyle = CONFIG.COLOR.counter; ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = CONFIG.COLOR.counterEdge; ctx.fillRect(0, h * 0.62, w, 8);

    const menuTop = this.menuTop;
    ctx.fillStyle = CONFIG.COLOR.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px sans-serif'; ctx.fillText('不随便煎饼', w / 2, menuTop + 28);
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#456069'; ctx.fillText('火候要稳，配料要准', w / 2, menuTop + 62);

    // 菜单主视觉：亮色煎饼置于深色鏊子上。
    const plateY = menuTop + 130;
    ctx.fillStyle = 'rgba(23,35,39,0.18)';
    ctx.beginPath(); ctx.ellipse(w / 2, plateY + 42, 65, 13, 0, 0, Math.PI * 2); ctx.fill();
    const menuPanGradient = ctx.createRadialGradient(w / 2 - 18, plateY - 18, 5, w / 2, plateY, 64);
    menuPanGradient.addColorStop(0, '#53666C'); menuPanGradient.addColorStop(1, '#172327');
    ctx.fillStyle = menuPanGradient;
    ctx.beginPath(); ctx.arc(w / 2, plateY, 61, 0, Math.PI * 2); ctx.fill();
    const menuCakeGradient = ctx.createRadialGradient(w / 2 - 12, plateY - 14, 3, w / 2, plateY, 42);
    menuCakeGradient.addColorStop(0, '#FFF0A8'); menuCakeGradient.addColorStop(0.72, '#F5B942'); menuCakeGradient.addColorStop(1, '#C9852E');
    ctx.fillStyle = menuCakeGradient;
    ctx.beginPath(); ctx.arc(w / 2, plateY, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD54F'; ctx.beginPath(); ctx.arc(w / 2 - 8, plateY - 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EF8B76'; ctx.fillRect(w / 2 + 3, plateY - 12, 22, 8);
    ctx.fillStyle = '#5FAE7C'; ctx.beginPath(); ctx.ellipse(w / 2 + 10, plateY + 12, 15, 6, -0.3, 0, Math.PI * 2); ctx.fill();

    const btn = this.menuBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 3; strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);

    // ---------- 本机历史前三名 ----------
    const headerY = menuTop + 278;
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('个人历史', 20, headerY);

    const toggle = this.rankingToggleBtn;
    ctx.fillStyle = '#2D88A8'; fillRoundRect(ctx, toggle.x, toggle.y, toggle.w, toggle.h, 7);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((this.rankingMode === 'score' ? '得分榜' : '波次榜') + ' ⇄', toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);

    const records = this.getSortedHistory().slice(0, 3);
    if (records.length === 0) {
      ctx.fillStyle = 'rgba(38,50,56,0.58)'; ctx.font = '12px sans-serif';
      ctx.fillText('完成一局后，这里会留下你的最好成绩', w / 2, this.menuRankingTop + 36);
    } else {
      const rankColors = ['#D8A72E', '#78909C', '#B86A42'];
      records.forEach((record, index) => {
        const rowY = this.menuRankingTop + index * 30;
        ctx.fillStyle = index % 2 === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.48)';
        ctx.fillRect(18, rowY, w - 36, 27);
        ctx.fillStyle = rankColors[index]; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('#' + (index + 1), 25, rowY + 14);
        const primary = this.rankingMode === 'score' ? record.score + '分' : '第' + record.wave + '波';
        const secondary = this.rankingMode === 'score'
          ? '第' + record.wave + '波 · 接待' + record.served
          : record.score + '分 · 接待' + record.served;
        ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 13px sans-serif';
        ctx.fillText(primary, 54, rowY + 14);
        ctx.fillStyle = '#60747A'; ctx.font = '11px sans-serif';
        ctx.fillText(secondary, 116, rowY + 14);
        ctx.textAlign = 'right'; ctx.fillText(this.formatHistoryDate(record.timestamp), w - 24, rowY + 14);
      });
    }

    const reviewBtn = this.reviewTutorialBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, reviewBtn.x, reviewBtn.y, reviewBtn.w, reviewBtn.h, 10);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2; strokeRoundRect(ctx, reviewBtn.x, reviewBtn.y, reviewBtn.w, reviewBtn.h, 10);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('📖 回顾教程', reviewBtn.x + reviewBtn.w / 2, reviewBtn.y + reviewBtn.h / 2);

    const catalogBtn = this.menuCatalogBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, catalogBtn.x, catalogBtn.y, catalogBtn.w, catalogBtn.h, 10);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2; strokeRoundRect(ctx, catalogBtn.x, catalogBtn.y, catalogBtn.w, catalogBtn.h, 10);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 14px sans-serif';
    ctx.fillText('👥 顾客图鉴', catalogBtn.x + catalogBtn.w / 2, catalogBtn.y + catalogBtn.h / 2);
  }

  renderCatalog(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = CONFIG.COLOR.wall; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2F464D'; ctx.fillRect(0, 0, w, this.topOffset + 70);
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px sans-serif'; ctx.fillText('顾客图鉴', w / 2, this.topOffset + 25);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#D7E6E3';
    ctx.fillText('耐心以市民为标准，越短越需要优先照顾', w / 2, this.topOffset + 51);

    const types = CONFIG.GAME.customerTypes;
    const top = this.topOffset + 82;
    const gap = 6;
    const rowH = Math.max(54, Math.min(68, (h - top - 82 - gap * (types.length - 1)) / types.length));
    types.forEach((type, index) => {
      const x = 14;
      const y = top + index * (rowH + gap);
      const rowW = w - 28;
      ctx.fillStyle = 'rgba(23,35,39,0.12)';
      fillRoundRect(ctx, x + 2, y + 3, rowW, rowH, 7);
      ctx.fillStyle = '#FFFDF8';
      fillRoundRect(ctx, x, y, rowW, rowH, 7);
      ctx.fillStyle = type.color;
      fillRoundRect(ctx, x, y, 7, rowH, 4);
      this.drawCatalogAvatar(ctx, type, x + 34, y + rowH / 2);

      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(type.name + ' · ' + type.trait, x + 62, y + rowH * 0.34);
      ctx.fillStyle = '#60747A'; ctx.font = '11px sans-serif';
      ctx.fillText(type.desc, x + 62, y + rowH * 0.68);
      ctx.textAlign = 'right'; ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = type.color;
      ctx.fillText('第' + type.unlockWave + '波', x + rowW - 10, y + rowH * 0.34);
    });

    const back = this.catalogBackBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, back.x, back.y, back.w, back.h, 8);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(back.label, back.x + back.w / 2, back.y + back.h / 2);
  }

  drawCatalogAvatar(ctx, type, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = type.color; fillRoundRect(ctx, -20, -21, 40, 44, 7);
    ctx.fillStyle = '#F4D7BE'; ctx.beginPath(); ctx.arc(0, -7, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = type.id === 'elder' ? '#ECEFF1' : '#3E3531';
    ctx.beginPath(); ctx.arc(0, -11, 11, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.beginPath(); ctx.arc(-4, -8, 1.5, 0, Math.PI * 2); ctx.arc(4, -8, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CONFIG.COLOR.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -3, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }

  renderGameOver(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px sans-serif'; ctx.fillText('本次营业结束', w / 2, h / 2 - 120);
    ctx.font = '18px sans-serif';
    ctx.fillText(`到达第 ${this.wave} 波`, w / 2, h / 2 - 76);
    ctx.fillText(`得分：${this.score}`, w / 2, h / 2 - 42);
    ctx.fillText(`人气：${this.popularity}`, w / 2, h / 2 - 8);
    ctx.fillText(`接待：${this.customersServed}位`, w / 2, h / 2 + 26);
    const btn = this.restartBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 2; strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    const menuBtn = this.gameOverMenuBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, menuBtn.x, menuBtn.y, menuBtn.w, menuBtn.h, 10);
    ctx.strokeStyle = '#B8C5C8'; ctx.lineWidth = 2; strokeRoundRect(ctx, menuBtn.x, menuBtn.y, menuBtn.w, menuBtn.h, 10);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(menuBtn.label, menuBtn.x + menuBtn.w / 2, menuBtn.y + menuBtn.h / 2);
  }

  renderPaused(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 32px sans-serif'; ctx.fillText('⏸️ 游戏暂停', w / 2, h / 2 - 120);
    const btn1 = this.resumeBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn1.x, btn1.y, btn1.w, btn1.h, 12);
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 3; strokeRoundRect(ctx, btn1.x, btn1.y, btn1.w, btn1.h, 12);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(btn1.label, w / 2, btn1.y + btn1.h / 2);
    const btn2 = this.pauseRestartBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn2.x, btn2.y, btn2.w, btn2.h, 12);
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 3; strokeRoundRect(ctx, btn2.x, btn2.y, btn2.w, btn2.h, 12);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(btn2.label, w / 2, btn2.y + btn2.h / 2);
    const btn3 = this.pauseMenuBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, btn3.x, btn3.y, btn3.w, btn3.h, 12);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 3; strokeRoundRect(ctx, btn3.x, btn3.y, btn3.w, btn3.h, 12);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 20px sans-serif'; ctx.fillText(btn3.label, w / 2, btn3.y + btn3.h / 2);
    const btn4 = this.pauseCatalogBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, btn4.x, btn4.y, btn4.w, btn4.h, 10);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2; strokeRoundRect(ctx, btn4.x, btn4.y, btn4.w, btn4.h, 10);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 16px sans-serif'; ctx.fillText('👥 ' + btn4.label, w / 2, btn4.y + btn4.h / 2);
  }

  renderInfluencer(ctx) {
    const w = this.width, h = this.height;
    // 底层继续绘制游戏画面（半透明）
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);

    // 弹窗
    const boxW = Math.min(w - 40, 340), boxH = 200, boxX = (w - boxW) / 2, boxY = h * 0.22;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    fillRoundRect(ctx, boxX, boxY, boxW, boxH, 16);
    ctx.strokeStyle = '#E91E63'; ctx.lineWidth = 3; strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 16);

    ctx.fillStyle = '#3E2723'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('📸 网红探店!', w / 2, boxY + 18);
    ctx.font = '14px sans-serif';
    ctx.fillText(`一位美食博主想在你的摊位拍视频`, w / 2, boxY + 52);
    ctx.fillText(`接受：-${CONFIG.GAME.influencerGoldCost}金币  +${CONFIG.GAME.influencerPopGain}人气`, w / 2, boxY + 80);
    ctx.fillText(`拒绝：有${Math.floor(CONFIG.GAME.influencerRefuseChance * 100)}%概率 -${CONFIG.GAME.influencerRefusePopLoss}人气`, w / 2, boxY + 108);

    // 按钮
    const btnA = this.influencerAcceptBtn;
    ctx.fillStyle = '#E91E63'; fillRoundRect(ctx, btnA.x, btnA.y, btnA.w, btnA.h, 10);
    ctx.strokeStyle = '#880E4F'; ctx.lineWidth = 2; strokeRoundRect(ctx, btnA.x, btnA.y, btnA.w, btnA.h, 10);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btnA.label, btnA.x + btnA.w / 2, btnA.y + btnA.h / 2);

    const btnR = this.influencerRejectBtn;
    ctx.fillStyle = '#EEE'; fillRoundRect(ctx, btnR.x, btnR.y, btnR.w, btnR.h, 10);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2; strokeRoundRect(ctx, btnR.x, btnR.y, btnR.w, btnR.h, 10);
    ctx.fillStyle = '#666'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(btnR.label, btnR.x + btnR.w / 2, btnR.y + btnR.h / 2);
  }

  renderTutorial(ctx) {
    const w = this.width, h = this.height, step = this.tutorial.step;
    this.renderGame(ctx);
    ctx.fillStyle = 'rgba(18,30,34,0.24)'; ctx.fillRect(0, 0, w, h);

    // 开场与总结居中；实际操作步骤固定在底部，不遮挡顾客和锅位。
    const isBookend = step === 0 || step === 5;
    const boxW = Math.min(w - 40, 340);
    const boxH = isBookend ? 224 : 116;
    const boxX = (w - boxW) / 2;
    const boxY = isBookend ? (h - boxH) / 2 - 12 : h - boxH - 6;
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; fillRoundRect(ctx, boxX, boxY, boxW, boxH, 16);
    ctx.strokeStyle = CONFIG.COLOR.btn; ctx.lineWidth = 3; strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 16);

    // 步骤指示
    ctx.fillStyle = '#B0BEC5'; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText((step + 1) + ' / 6', boxX + boxW - 12, boxY + 10);

    ctx.fillStyle = '#3E2723'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const stepTexts = [
      '先看懂顾客的订单\n顾客头顶气泡显示所需配料\n下方耐心条会由绿变黄、变红\n超时离开会扣人气\n这一单是：面饼 + 鸡蛋',
      '第一步 · 面糊下锅\n方式A：按住【面饼】拖到空锅\n方式B：点【面饼】，再点空锅\n发光虚线框就是下一目标',
      '第二步 · 翻面前加鸡蛋\n拖【蛋】到锅，或先点【蛋】再点锅\n鸡蛋是唯一需要翻面前加入的配料\n同一种配料不能重复添加',
      '第三步 · 看火翻面\n★出现时点击煎饼\n金色火候区间翻面收益更高\n教程不会煎糊，可以先观察',
      '第四步 · 出锅上菜\n✓出现代表第二面火候最佳\n点煎饼再点顾客，或直接拖给顾客\n成品配料必须与订单完全一致',
      '第一单完成\n蛋在翻面前加，其他配料翻面后加\n菜脆葱酱用【小料进货】统一补充\n红色忌口绝对不能加入\n技巧让本局可翻面时必定完美'
    ];
    const lines = stepTexts[step].split('\n');
    ctx.font = 'bold ' + (isBookend ? 14 : 13) + 'px sans-serif';
    const lineGap = isBookend ? 24 : 20;
    lines.forEach((line, i) => { ctx.fillText(line, w / 2, boxY + 14 + i * lineGap); });

    // 开场确认与教程完成按钮
    this.tutorialContinueBtn = null;
    if (isBookend) {
      const btnW = 160, btnH = 46, btnX = (w - btnW) / 2, btnY = boxY + boxH - 58;
      this.tutorialContinueBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
      ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btnX, btnY, btnW, btnH, 10);
      ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 2; strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 10);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(step === 0 ? '开始练习' : '开始营业', w / 2, btnY + btnH / 2);
    }

    // 跳过教程按钮（练习完成前显示）
    if (step < 5 && this.tutorialSkipBtn) {
      const sb = this.tutorialSkipBtn;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; fillRoundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8);
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1; strokeRoundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8);
      ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sb.label, sb.x + sb.w / 2, sb.y + sb.h / 2);
    }

    // 高亮当前目标（根据手中状态切换：拿起面糊→高亮锅位，拿起饼→高亮顾客）
    const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.strokeStyle = 'rgba(255, 215, 0, ' + pulse + ')'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    let targetRect = null;
    if (step === 0) {
      const c = this.customers[0];
      if (c) targetRect = { x: c.x - 36, y: c.y - 55, w: 72, h: 112 };
    } else if (step === 1) {
      if (this.heldIngredient) {
        const pan = this.pans.find(p => !p.pancake);
        if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 };
      } else {
        const btn = this.buttons.find(b => b.id === 'batter');
        if (btn) targetRect = { x: btn.x - 6, y: btn.y - 6, w: btn.w + 12, h: btn.h + 12 };
      }
    } else if (step === 2) {
      if (this.heldIngredient) {
        const pan = this.pans.find(p => p.pancake && p.pancake.phase === 'first');
        if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 };
      } else {
        const btn = this.buttons.find(b => b.id === 'egg');
        if (btn) targetRect = { x: btn.x - 6, y: btn.y - 6, w: btn.w + 12, h: btn.h + 12 };
      }
    } else if (step === 3) {
      const pan = this.pans.find(p => p.pancake);
      if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 };
    } else if (step === 4) {
      if (this.heldPancake) {
        const c = this.customers.find(cc => cc.state === 'waiting');
        if (c) targetRect = { x: c.x - 36, y: c.y - 46, w: 72, h: 92 };
      } else {
        const pan = this.pans.find(p => p.pancake && p.pancake.phase === 'second');
        if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 };
      }
    }
    if (targetRect) { ctx.beginPath(); ctx.strokeRect(targetRect.x, targetRect.y, targetRect.w, targetRect.h); }
    ctx.setLineDash([]);
  }
}

module.exports = Game;
