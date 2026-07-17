/**
 * ============================================================
 * 不随便煎饼 - 浏览器兼容层 (browser-game.js) v2
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

class Game {
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.state = 'menu';       // menu / tutorial / playing / gameover / paused / influencer
    this.topOffset = 28;
    this.lastTime = Date.now();
    this.touchX = 0;
    this.touchY = 0;
    this.floatingTexts = [];
    this.reset();
    this.initLayout();
  }

  // ===================== 数据重置 =====================

  reset() {
    this.wave = 1;
    this.resources = { gold: CONFIG.GAME.initialGold, batter: CONFIG.GAME.initialBatter };
    // 动态添加小料资源
    CONFIG.GAME.toppings.forEach(t => { this.resources[t.id] = 3; });

    this.upgrades = { slot: 0, speed: 0, patience: 0, price: 0, container: 0 };
    this.container = [];
    this.containerMax = 0; // 初始没有托盘，需购买解锁
    this.heldFromContainer = -1;
    this.customers = [];
    this.particles = [];
    this.floatingTexts = [];
    this.heldPancake = null;
    this.heldFromPan = -1;
    this.heldIngredient = null; // 手持原料（拖动上锅）
    this.score = 0;

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
    this.panY = Math.min(this.height * 0.34, this.height - 320);
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
    const bh = 28, gap = 4, cols = 4;
    const startX = (w - (bw * cols + gap * (cols - 1))) / 2;
    // 按钮区域在锅位下方，根据大圆半径动态调整，避免重叠
    const baseY = Math.min(this.panY + this.panRadius + 35, h - 210);

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

    // Row 1: 剩余小料（4~6）+ 进货按钮
    toppingList.slice(3, 6).forEach((t, i) => {
      addBtn(1, i, t.id, t.name, 'topping', { toppingId: t.id });
    });
    addBtn(1, 3, 'buyBatter', '买面', 'buy', { item: 'batter', cost: CONFIG.GAME.toppings[0]?.cost || 2 });

    // Row 2: 买蛋/买肠/升级
    addBtn(2, 0, 'buyEgg', '买蛋', 'buy', { item: 'egg', cost: 5 });
    addBtn(2, 1, 'buyHam', '买肠', 'buy', { item: 'ham', cost: 6 });
    addBtn(2, 2, 'upSlot', '大锅', 'upgrade', { upId: 'slot' });

    // Row 3: 更多升级
    addBtn(3, 0, 'upSpeed', '技巧', 'upgrade', { upId: 'speed' });
    addBtn(3, 1, 'upPatience', '微笑', 'upgrade', { upId: 'patience' });
    addBtn(3, 2, 'upPrice', '招牌', 'upgrade', { upId: 'price' });
    addBtn(3, 3, 'upContainer', '托盘', 'upgrade', { upId: 'container' });

    // 菜单/结束按钮
    this.menuBtn = { x: w / 2 - 80, y: h / 2 + 140, w: 160, h: 50, label: '开始摆摊' };
    this.reviewTutorialBtn = { x: w / 2 - 80, y: h / 2 + 200, w: 160, h: 40, label: '回顾教程' };
    this.restartBtn = { x: w / 2 - 80, y: h / 2 + 60, w: 160, h: 50, label: '再来一局' };

    // 垃圾桶
    this.trashCan = { x: w - 58, y: this.panY - 45, w: 50, h: 50, label: '🗑️' };

    // 暂停按钮
    this.pauseBtn = { x: w - 48, y: 48 + this.topOffset, w: 40, h: 30, label: '⏸️' };
    this.resumeBtn = { x: w / 2 - 80, y: h / 2 - 60, w: 160, h: 50, label: '继续游戏' };
    this.pauseRestartBtn = { x: w / 2 - 80, y: h / 2 + 10, w: 160, h: 50, label: '重新开始' };
    this.pauseMenuBtn = { x: w / 2 - 80, y: h / 2 + 80, w: 160, h: 50, label: '回到主界面' };

    // 网红探店按钮
    this.influencerAcceptBtn = { x: w / 2 - 140, y: h / 2 + 40, w: 120, h: 46, label: '接受' };
    this.influencerRejectBtn = { x: w / 2 + 20, y: h / 2 + 40, w: 120, h: 46, label: '拒绝' };
  }

  // ===================== 升级计算 =====================

  getCookTime() { return CONFIG.GAME.cookTime * (1 - this.upgrades.speed * 0.15); }
  getSide2Time() { return CONFIG.GAME.secondSideTime * (1 - this.upgrades.speed * 0.15); }
  getPatience() { return CONFIG.GAME.basePatience * (1 + this.upgrades.patience * 0.2); }

  getPrice(base) { return Math.floor(base * (1 + this.upgrades.price * 0.15)); }

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
    this.tutorialCustomer = new Customer(Date.now(), [], 999999, Math.min(100, this.width - 40), 100,
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

    if (this.state === 'tutorial') {
      this.pans.forEach(pan => {
        if (pan.pancake && !pan.pancake.held) {
          pan.pancake.update(dt);
          pan.pancake.x = pan.x; pan.pancake.y = pan.y;
        }
      });
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
        this.state = 'gameover';
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

    let patience = this.getPatience() * typeInfo.patienceMult;
    // 确保等待时间不低于最短制作时间（加一点余量）
    const minTime = this.getMinServeTime() + 5000;
    patience = Math.max(patience, minTime);

    const idx = this.customers.length;
    const x = 40 + idx * 65;
    const y = 140;
    const c = new Customer(Date.now(), orderToppings, patience, Math.min(x, this.width - 40), y, typeInfo);
    this.customers.push(c);
  }

  spawnParticles(x, y, color, speed, count) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color, speed, 600));
  }
  spawnText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, life: 1400, vy: -0.9 });
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
    this.state = 'playing';
    this.lastTime = Date.now(); // 防止 dt 爆炸
  }

  // ===================== 输入处理 =====================

  handleTouch(x, y) {
    this.touchX = x; this.touchY = y;

    if (this.state === 'menu') {
      if (this.hit(x, y, this.menuBtn)) this.start();
      else if (this.hit(x, y, this.reviewTutorialBtn)) this.startTutorial();
      return;
    }

    if (this.state === 'gameover') {
      if (this.hit(x, y, this.restartBtn)) this.startGame();
      return;
    }

    if (this.state === 'paused') {
      if (this.hit(x, y, this.resumeBtn)) { this.state = 'playing'; this.lastTime = Date.now(); }
      else if (this.hit(x, y, this.pauseRestartBtn)) this.startGame();
      else if (this.hit(x, y, this.pauseMenuBtn)) { this.state = 'menu'; this.reset(); }
      return;
    }

    if (this.state === 'influencer') {
      if (this.hit(x, y, this.influencerAcceptBtn)) this.handleInfluencerChoice(true);
      else if (this.hit(x, y, this.influencerRejectBtn)) this.handleInfluencerChoice(false);
      return;
    }

    if (this.state === 'tutorial') { this.handleTutorialTouch(x, y); return; }

    if (this.hit(x, y, this.pauseBtn)) { this.state = 'paused'; return; }
    if (this.heldPancake) return;
    if (this.heldIngredient) return; // 手持原料时，由 handleTouchEnd 处理下锅/加料

    // 尝试从锅位取饼或翻面
    for (let i = 0; i < this.pans.length; i++) {
      const pan = this.pans[i];
      const dist = Math.hypot(x - pan.x, y - pan.y);
      if (dist < 45 && pan.pancake && !pan.pancake.held) {
        const p = pan.pancake;
        // 需要翻面时点击 = 翻面
        if (p.needsFlip && p.phase === 'first') {
          const wasPerfect = p.flip();
          if (wasPerfect) {
            this.spawnText(pan.x, pan.y - 50, p.flipPerfect ? '完美翻面!' : '翻面', p.flipPerfect ? '#FFD700' : '#42A5F5');
            this.spawnParticles(pan.x, pan.y, p.flipPerfect ? '#FFD700' : '#42A5F5', 4, 8);
          }
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
        // 糊了的也可以取（去丢弃）
        if (p.state === 'burnt') {
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
      const baseY = this.buttons[0] ? this.buttons[0].y : this.height - 200;
      const trayY = baseY + 140;
      const slotW = 50, slotH = 45, slotGap = 8;
      const totalW = this.containerMax * slotW + (this.containerMax - 1) * slotGap;
      const startX = (this.width - totalW) / 2;
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
    
    // 步骤3：点击继续按钮
    if (step === 3) {
      const btn = this.tutorialContinueBtn;
      if (btn && this.hit(x, y, btn)) {
        try { wx.setStorageSync('hasPlayedTutorial', true); } catch (e) {}
        this.startGame();
      }
      return;
    }
    
    // 如果正在手持煎饼，不处理其他交互（由 handleTouchEnd 处理）
    if (this.heldPancake) return;
    
    // 如果正在手持原料，不处理按钮（由 handleTutorialTouchEnd 处理）
    if (this.heldIngredient) return;
    
    if (step === 0) {
      // 步骤0：点击面饼按钮生成手持面糊
      const btn = this.buttons.find(b => b.id === 'batter');
      if (btn && this.hit(x, y, btn)) { this.onButton(btn); }
    } else if (step === 1) {
      // 步骤1：点击锅位翻面
      for (let i = 0; i < this.pans.length; i++) {
        const pan = this.pans[i];
        const dist = Math.hypot(x - pan.x, y - pan.y);
        if (dist < 45 && pan.pancake && !pan.pancake.held && pan.pancake.needsFlip) {
          pan.pancake.flip(); return;
        }
      }
    } else if (step === 2) {
      // 步骤2：从锅位取已翻面的饼
      for (let i = 0; i < this.pans.length; i++) {
        const pan = this.pans[i];
        const dist = Math.hypot(x - pan.x, y - pan.y);
        if (dist < 45 && pan.pancake && !pan.pancake.held && pan.pancake.phase === 'second') {
          const p = pan.pancake;
          p.held = true;
          this.heldPancake = p;
          this.heldFromPan = i;
          p.targetScale = 1.2;
          return;
        }
      }
    }
  }

  handleTouchMove(x, y) { this.touchX = x; this.touchY = y; }

  handleTouchEnd() {
    if (this.state === 'tutorial') { this.handleTutorialTouchEnd(); return; }
    if (this.state !== 'playing') return;
    
    // 处理手持原料拖到锅位
    if (this.heldIngredient) {
      const ing = this.heldIngredient;
      // 检查是否拖到锅位
      let hitPan = null;
      for (let i = 0; i < this.pans.length; i++) {
        const pan = this.pans[i];
        const dist = Math.hypot(this.touchX - pan.x, this.touchY - pan.y);
        if (dist < 45) { hitPan = pan; break; }
      }
      if (hitPan) {
        if (ing.type === 'batter') {
          // 面饼下锅：需要空锅位
          if (!hitPan.pancake) {
            for (const [res, need] of Object.entries(ing.need)) { this.resources[res] -= need; }
            hitPan.pancake = new Pancake(this.getCookTime(), this.getSide2Time());
            hitPan.pancake.x = hitPan.x; hitPan.pancake.y = hitPan.y;
            this.spawnParticles(hitPan.x, hitPan.y, '#FFF', 3, 5);
          }
        } else if (ing.type === 'topping') {
          // 小料加料：需要翻面后的锅位且未糊
          if (hitPan.pancake && hitPan.pancake.phase === 'second' && !hitPan.pancake.held && hitPan.pancake.state !== 'burnt') {
            if (hitPan.pancake.addTopping(ing.toppingId)) {
              this.resources[ing.toppingId]--;
              const tcfg = CONFIG.GAME.toppings.find(t => t.id === ing.toppingId);
              this.spawnParticles(hitPan.x, hitPan.y, tcfg ? CONFIG.COLOR[tcfg.colorKey] : '#999', 3, 5);
            }
          }
        }
      }
      this.heldIngredient = null;
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
    const baseY = this.buttons[0] ? this.buttons[0].y : this.height - 200;
    const trayY = baseY + 140;
    const slotW = 50, slotH = 45, slotGap = 8;
    const totalW = this.containerMax * slotW + (this.containerMax - 1) * slotGap;
    const startX = (this.width - totalW) / 2;
    if (this.touchY >= trayY - 15 && this.touchY <= trayY + slotH + 15 &&
        this.touchX >= startX - 15 && this.touchX <= startX + totalW + 15) {
      if (this.heldFromContainer >= 0) {
        // 在容器内移动，直接放下
        this.heldPancake.held = false;
        this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
        return;
      }
      if (this.container.length < this.containerMax) {
        this.heldPancake.held = false;
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
        this.state = 'gameover';
      }

      // 清空来源
      if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
      if (this.heldFromContainer >= 0) this.container.splice(this.heldFromContainer, 1);
      this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
      return;
    }

    // 4. 放回原处
    this.heldPancake.held = false;
    this.heldPancake = null; this.heldFromPan = -1; this.heldFromContainer = -1;
  }

  handleTutorialTouchEnd() {
    // 教程中也处理原料拖到锅位
    if (this.heldIngredient) {
      const ing = this.heldIngredient;
      for (let i = 0; i < this.pans.length; i++) {
        const pan = this.pans[i];
        const dist = Math.hypot(this.touchX - pan.x, this.touchY - pan.y);
        if (dist < 45) {
          if (ing.type === 'batter' && !pan.pancake) {
            for (const [res, need] of Object.entries(ing.need)) { this.resources[res] -= need; }
            pan.pancake = new Pancake(this.getCookTime(), this.getSide2Time());
            pan.pancake.x = pan.x; pan.pancake.y = pan.y;
            this.heldIngredient = null;
            if (this.tutorial.step === 0) this.tutorial.step = 1;
            return;
          }
          if (ing.type === 'topping' && pan.pancake && pan.pancake.phase === 'second' && !pan.pancake.held && pan.pancake.state !== 'burnt') {
            if (pan.pancake.addTopping(ing.toppingId)) {
              this.resources[ing.toppingId]--;
              this.heldIngredient = null;
              return;
            }
          }
        }
      }
      this.heldIngredient = null;
      return;
    }
    if (this.tutorial.step !== 2) return;
    if (!this.heldPancake) return;
    const target = this.customers.find(c => c.state === 'waiting' && this.hit(this.touchX, this.touchY, {
      x: c.x - c.width / 2, y: c.y - c.height / 2, w: c.width, h: c.height
    }));
    if (target) {
      const priceMap = { base: this.getPrice(CONFIG.PRICES.base), toppings: {} };
      CONFIG.GAME.toppings.forEach(t => { priceMap.toppings[t.id] = this.getPrice(CONFIG.TOPPING_PRICES[t.id] || 0); });
      target.serve(this.heldPancake, priceMap, {});
      if (this.heldFromPan >= 0) this.pans[this.heldFromPan].pancake = null;
      this.heldPancake = null; this.heldFromPan = -1;
      this.tutorial.step = 3; return;
    }
    this.heldPancake.held = false; this.heldPancake = null; this.heldFromPan = -1;
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
      this.spawnText(btn.x + btn.w / 2, btn.y - 10, btn.label + '+1', '#AB47BC');
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
    if (this.state === 'tutorial') { this.renderTutorial(ctx); return; }

    this.renderGame(ctx);
    if (this.state === 'gameover') this.renderGameOver(ctx);
    if (this.state === 'paused') this.renderPaused(ctx);
    if (this.state === 'influencer') this.renderInfluencer(ctx);
  }

  renderGame(ctx) {
    const w = this.width, h = this.height;

    // ---------- 顶部 HUD ----------
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, this.topOffset, w, 52);
    ctx.fillStyle = CONFIG.COLOR.text;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 第一行：金币 + 材料
    ctx.fillText('💰 ' + this.resources.gold, 10, 16 + this.topOffset);
    ctx.fillText('面' + this.resources.batter, 90, 16 + this.topOffset);

    let matX = 145;
    CONFIG.GAME.toppings.slice(0, 3).forEach(t => {
      ctx.fillText(t.name + this.resources[t.id], matX, 16 + this.topOffset);
      matX += 38;
    });

    // 第二行：波次 + 接待 + 人气 + 倍数
    ctx.fillStyle = '#5D4037';
    ctx.font = '12px sans-serif';
    ctx.fillText(`第${this.wave}波`, 10, 38 + this.topOffset);
    ctx.fillStyle = CONFIG.COLOR.popularity;
    ctx.fillText(`🔥人气${this.popularity}`, 70, 38 + this.topOffset);
    ctx.fillStyle = '#AB47BC';
    ctx.fillText(`已接待${this.customersServed}位`, 155, 38 + this.topOffset);
    if (this.streakMultiplier > 1) {
      ctx.fillStyle = '#FF9800';
      ctx.fillText(`x${this.streakMultiplier}`, 245, 38 + this.topOffset);
    }

    // 暂停按钮
    const pb = this.pauseBtn;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    fillRoundRect(ctx, pb.x, pb.y, pb.w, pb.h, 6);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2;
    strokeRoundRect(ctx, pb.x, pb.y, pb.w, pb.h, 6);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pb.label, pb.x + pb.w / 2, pb.y + pb.h / 2);

    // ---------- 顾客区域 ----------
    this.customers.forEach((c, i) => {
      c.x = 40 + i * 65;
      c.y = 140;
      c.draw(ctx);
    });

    // ---------- 锅位背景 ----------
    const panY = this.panY;
    ctx.fillStyle = CONFIG.COLOR.pan;
    ctx.beginPath(); ctx.arc(w / 2, panY, this.panRadius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 4; ctx.stroke();

    // ---------- 锅位与煎饼 ----------
    this.pans.forEach(pan => {
      if (pan.pancake) {
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
      else if (btn.type === 'buy') color = '#42A5F5';
      else if (btn.type === 'topping') color = CONFIG.COLOR.btnTopping;

      if (btn.type === 'ingredient') {
        for (const [res, need] of Object.entries(btn.need)) { if (this.resources[res] < need) disabled = true; }
      } else if (btn.type === 'topping') {
        const hasPan = this.pans.some(p => p.pancake && p.pancake.phase === 'second' && !p.pancake.held && p.pancake.state !== 'burnt');
        if (!hasPan || (this.resources[btn.toppingId] || 0) < 1) disabled = true;
        // 未解锁
        const tcfg = CONFIG.GAME.toppings.find(t => t.id === btn.toppingId);
        if (tcfg && tcfg.unlockWave > this.wave) disabled = true;
      } else if (btn.type === 'buy') {
        if (this.resources.gold < btn.cost) disabled = true;

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
          btn._lockedLabel = '🔒';
        } else {
          btn._lockedLabel = null;
        }
      }

      ctx.fillStyle = color;
      fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
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
        ctx.fillStyle = disabled ? '#EF5350' : '#FFEB3B';
        ctx.fillText('×' + qty, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
      } else if (btn.type === 'buy') {
        ctx.fillStyle = disabled ? '#EEE' : '#FFEB3B';
        const amount = btn.item === 'batter' ? 5 : 3;
        ctx.fillText(btn.cost + '金+' + amount, btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);

      } else if (btn.type === 'upgrade') {
        if (btn.upId === 'container') {
          const maxLevel = CONFIG.GAME.containerMaxSlots.length - 1;
          const lvl = this.upgrades.container;
          ctx.fillStyle = (disabled || lvl >= maxLevel) ? '#EEE' : '#FFEB3B';
          ctx.fillText(lvl >= maxLevel ? 'MAX' : CONFIG.GAME.containerUpgradeCosts[lvl] + '金', btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
        } else {
          const up = CONFIG.UPGRADES.find(u => u.id === btn.upId);
          const lvl = this.upgrades[btn.upId];
          ctx.fillStyle = (disabled || lvl >= up.max) ? '#EEE' : '#FFEB3B';
          ctx.fillText(lvl >= up.max ? 'MAX' : up.cost + '金', btn.x + btn.w / 2, btn.y + btn.h / 2 + 8);
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
    const tc = this.trashCan;
    ctx.fillStyle = '#78909C'; fillRoundRect(ctx, tc.x, tc.y, tc.w, tc.h, 10);
    ctx.strokeStyle = '#455A64'; ctx.lineWidth = 2; strokeRoundRect(ctx, tc.x, tc.y, tc.w, tc.h, 10);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tc.label, tc.x + tc.w / 2, tc.y + tc.h / 2);

    // ---------- 提示 ----------
    if (this.heldPancake) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('拖到顾客/托盘上菜，拖到🗑️丢弃', w / 2, h - 15);
    } else if (this.heldIngredient) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('拖到锅位上放料', w / 2, h - 15);
    }
  }

  renderContainer(ctx) {
    if (this.containerMax <= 0) return;
    const w = this.width;
    const baseY = this.buttons[0] ? this.buttons[0].y : this.height - 200;
    const trayY = baseY + 140;
    const slotW = 50, slotH = 45, slotGap = 8;
    const totalW = this.containerMax * slotW + (this.containerMax - 1) * slotGap;
    const startX = (w - totalW) / 2;

    // 托盘背景
    ctx.fillStyle = 'rgba(121,85,72,0.15)';
    fillRoundRect(ctx, startX - 6, trayY - 6, totalW + 12, slotH + 12, 10);
    ctx.strokeStyle = CONFIG.COLOR.panBorder;
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, startX - 6, trayY - 6, totalW + 12, slotH + 12, 10);

    // 标签
    ctx.fillStyle = CONFIG.COLOR.panBorder;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('托盘', w / 2, trayY - 10);

    // 每个槽位
    for (let i = 0; i < this.containerMax; i++) {
      const x = startX + i * (slotW + slotGap);
      const p = this.container[i];
      if (p) {
        p.x = x + slotW / 2;
        p.y = trayY + slotH / 2;
        p.draw(ctx);
      } else {
        ctx.strokeStyle = 'rgba(121,85,72,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x + slotW / 2, trayY + slotH / 2, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  renderMenu(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = CONFIG.COLOR.bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px sans-serif'; ctx.fillText('🥞 不随便煎饼', w / 2, h / 2 - 100);
    ctx.font = '17px sans-serif'; ctx.fillStyle = '#5D4037'; ctx.fillText('摊煎饼 · 攒人气 · 撑过饥荒', w / 2, h / 2 - 55);
    ctx.font = '13px sans-serif';
    ctx.fillText('1. 点击【面饼】生成面糊，拖到锅位下锅', w / 2, h / 2 - 30);
    ctx.fillText('2. 出现【★】时点击锅位翻面', w / 2, h / 2 - 10);
    ctx.fillText('3. 翻面后点击小料，拖到锅位加料', w / 2, h / 2 + 10);
    ctx.fillText('4. 第二面煎好拖给顾客', w / 2, h / 2 + 30);
    ctx.fillText('⚠️ 别让任何顾客等太久！', w / 2, h / 2 + 55);

    const btn = this.menuBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 3; strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(btn.label, w / 2, btn.y + btn.h / 2);

    const reviewBtn = this.reviewTutorialBtn;
    ctx.fillStyle = '#FFF'; fillRoundRect(ctx, reviewBtn.x, reviewBtn.y, reviewBtn.w, reviewBtn.h, 10);
    ctx.strokeStyle = CONFIG.COLOR.panBorder; ctx.lineWidth = 2; strokeRoundRect(ctx, reviewBtn.x, reviewBtn.y, reviewBtn.w, reviewBtn.h, 10);
    ctx.fillStyle = CONFIG.COLOR.text; ctx.font = 'bold 16px sans-serif';
    ctx.fillText('📖 回顾教程', w / 2, reviewBtn.y + reviewBtn.h / 2);
  }

  renderGameOver(ctx) {
    const w = this.width, h = this.height;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 32px sans-serif'; ctx.fillText('💀 撑不住了', w / 2, h / 2 - 80);
    ctx.font = '20px sans-serif';
    ctx.fillText(`挺过了 ${this.wave} 波饥荒`, w / 2, h / 2 - 35);
    ctx.fillText(`得分: ${this.score}`, w / 2, h / 2);
    ctx.fillText(`人气: ${this.popularity}`, w / 2, h / 2 + 35);
    ctx.fillText(`接待: ${this.customersServed}位`, w / 2, h / 2 + 70);
    const btn = this.restartBtn;
    ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 3; strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(btn.label, w / 2, btn.y + btn.h / 2);
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
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, w, h);
    const boxW = Math.min(w - 40, 340), boxH = step === 3 ? 180 : 140, boxX = (w - boxW) / 2, boxY = h * 0.16;
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; fillRoundRect(ctx, boxX, boxY, boxW, boxH, 16);
    ctx.strokeStyle = '#FF7043'; ctx.lineWidth = 3; strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 16);
    ctx.fillStyle = '#3E2723'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const stepTexts = [
      '👋 欢迎来到煎饼摊！\n点击【面饼】按钮，然后把面糊拖到锅位下锅',
      '🔥 饼在慢慢变熟...\n等出现【★】时，点击锅位翻面',
      '🍽️ 顾客要的是基础饼！\n从锅位取出饼，拖到顾客身上完成上菜',
      '🎉 完美上菜！\n材料不够时记得进货，\n金币足够还可以升级锅位\n准备好迎接真正的挑战了吗？'
    ];
    const lines = stepTexts[step].split('\n');
    ctx.font = 'bold 15px sans-serif';
    lines.forEach((line, i) => { ctx.fillText(line, w / 2, boxY + 18 + i * 24); });
    if (step === 3) {
      const btnW = 160, btnH = 46, btnX = (w - btnW) / 2, btnY = boxY + boxH - 58;
      this.tutorialContinueBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
      ctx.fillStyle = CONFIG.COLOR.btn; fillRoundRect(ctx, btnX, btnY, btnW, btnH, 10);
      ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 2; strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 10);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('开始营业', w / 2, btnY + btnH / 2);
    }
    const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.strokeStyle = 'rgba(255, 215, 0, ' + pulse + ')'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    let targetRect = null;
    if (step === 0) { const btn = this.buttons.find(b => b.id === 'batter'); if (btn) targetRect = { x: btn.x - 6, y: btn.y - 6, w: btn.w + 12, h: btn.h + 12 }; }
    else if (step === 1) { const pan = this.pans.find(p => p.pancake); if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 }; }
    else if (step === 2) { const pan = this.pans.find(p => p.pancake && p.pancake.phase === 'second'); if (pan) targetRect = { x: pan.x - 42, y: pan.y - 42, w: 84, h: 84 }; }
    if (targetRect) { ctx.beginPath(); ctx.strokeRect(targetRect.x, targetRect.y, targetRect.w, targetRect.h); }
    ctx.setLineDash([]);
  }
}


