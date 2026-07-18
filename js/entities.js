/**
 * ============================================================
 * 不随便煎饼 - 实体类定义 (entities.js) v2
 * ============================================================
 * 新增：
 *   - Pancake: 翻面机制（第一面/第二面）、小料系统
 *   - Customer: 多样化类型、饼+小料订单
 *   - 保留 Particle 粒子特效
 * ============================================================
 */

const CONFIG = require('./config.js');
const { fillRoundRect, strokeRoundRect } = require('./utils.js');

// ===================== Pancake 煎饼类 =====================

class Pancake {
  constructor(cookTime, side2Time) {
    this.toppings = [];       // 已加小料 ID 数组
    this.state = 'raw';       // 当前面状态：raw / cooking / perfect / burnt
    this.phase = 'first';     // first(第一面) / second(第二面) / ready(可出锅)
    this.cookTime = cookTime; // 第一面总时长
    this.side2Time = side2Time || CONFIG.GAME.secondSideTime; // 第二面时长
    this.elapsed = 0;         // 当前面已烹饪时间
    this.flipped = false;     // 是否已翻面
    this.flipPerfect = false; // 是否完美翻面
    this.needsFlip = false;   // 是否显示翻面星星
    this.x = 0; this.y = 0;
    this.radius = 35;
    this.held = false;
    this.scale = 1;
    this.targetScale = 1;
    this.bounce = 0;
    this.flipFlash = 0;       // 翻面星星脉冲动画
  }

  update(dt) {
    if (this.held) return;

    if (this.phase === 'first') {
      this.elapsed += dt;
      const progress = this.elapsed / this.cookTime;

      if (this.elapsed >= this.cookTime + CONFIG.GAME.burnGraceTime) {
        this.state = 'burnt';
        this.needsFlip = false;
      } else if (progress >= CONFIG.GAME.flipPerfectStart && progress <= CONFIG.GAME.flipPerfectEnd) {
        this.state = 'perfect';
        this.needsFlip = true;
      } else if (progress >= CONFIG.GAME.flipHintStart) {
        this.state = 'cooking';
        this.needsFlip = true;
      } else {
        this.state = 'raw';
        this.needsFlip = false;
      }
    } else if (this.phase === 'second') {
      this.elapsed += dt;
      const progress = this.elapsed / this.side2Time;

      if (this.elapsed >= this.side2Time + CONFIG.GAME.burnGraceTime) {
        this.state = 'burnt';
      } else if (progress >= CONFIG.GAME.perfectStart && progress <= CONFIG.GAME.perfectEnd) {
        this.state = 'perfect';
      } else if (progress > CONFIG.GAME.perfectEnd) {
        this.state = 'cooking';
      } else {
        this.state = 'raw';
      }
    }

    this.scale += (this.targetScale - this.scale) * 0.2;
    this.bounce = Math.sin(Date.now() * 0.01) * 2;
    if (this.needsFlip) {
      this.flipFlash = Math.sin(Date.now() * 0.008) * 0.4 + 0.6;
    }
  }

  /**
   * flip - 执行翻面
   * @returns {boolean} 是否成功
   */
  flip(forcePerfect = false) {
    if (this.phase !== 'first') return false;
    this.flipPerfect = forcePerfect || (this.state === 'perfect');
    this.phase = 'second';
    this.flipped = true;
    this.elapsed = 0;
    this.needsFlip = false;
    this.state = 'raw';
    return true;
  }

  canAddTopping(toppingId) {
    if (this.state === 'burnt') return false;
    if (this.toppings.includes(toppingId)) return false;
    return toppingId === 'egg' ? this.phase === 'first' : this.phase === 'second';
  }

  /**
   * addTopping - 鸡蛋在翻面前加入，其余配料在翻面后加入
   * @param {string} toppingId - 小料 ID
   * @returns {boolean} 是否成功
   */
  addTopping(toppingId) {
    if (!this.canAddTopping(toppingId)) return false;
    this.toppings.push(toppingId);
    return true;
  }

  /**
   * getToppingKey - 用于订单匹配的小料排序键
   */
  getToppingKey() {
    return [...this.toppings].sort().join('+');
  }

  /**
   * getQuality - 最终出锅质量
   * perfectFlip: 完美翻面 + 第二面完美
   * perfect: 第二面完美
   * cooking: 熟了
   * burnt: 糊了
   */
  getQuality() {
    if (this.state === 'burnt') return 'burnt';
    if (this.flipPerfect && this.state === 'perfect') return 'perfectFlip';
    if (this.state === 'perfect') return 'perfect';
    return 'cooking';
  }

  /**
   * canServe - 是否可以出锅（已翻面且非糊）
   */
  canServe() {
    return this.phase === 'second' && this.state !== 'burnt';
  }

  getColor() {
    switch (this.state) {
      case 'raw': return CONFIG.COLOR.batter;
      case 'cooking': return CONFIG.COLOR.cooked;
      case 'perfect': return CONFIG.COLOR.cooked;
      case 'burnt': return CONFIG.COLOR.burnt;
      default: return CONFIG.COLOR.batter;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + this.bounce);
    ctx.scale(this.scale, this.scale);

    // 1. 煎饼主体：中心受光、边缘焦香，避免纯色圆片感
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    const baseColor = this.getColor();
    const pancakeGradient = ctx.createRadialGradient(-10, -12, 3, 0, 0, this.radius);
    pancakeGradient.addColorStop(0, this.state === 'burnt' ? '#7A594B' : '#FFF0A8');
    pancakeGradient.addColorStop(0.68, baseColor);
    pancakeGradient.addColorStop(1, this.state === 'raw' ? '#E8DCC7' : (this.state === 'burnt' ? '#382823' : '#C9852E'));
    ctx.fillStyle = pancakeGradient;
    ctx.shadowColor = 'rgba(23,35,39,0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = CONFIG.COLOR.panBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.state !== 'raw') {
      const spots = [[-17, -5, 3], [13, -15, 2], [18, 10, 3], [-6, 18, 2], [2, -2, 2]];
      ctx.fillStyle = this.state === 'burnt' ? 'rgba(30,20,17,0.42)' : 'rgba(161,91,29,0.24)';
      spots.forEach(([sx, sy, sr]) => {
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      });
    }

    // 翻面标记：第一面翻过的饼略深色描边
    if (this.flipped) {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius - 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(62,39,35,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. 绘制小料
    const toppingCfg = CONFIG.GAME.toppings;
    const positions = [
      { x: -12, y: -12 },
      { x: 12, y: -12 },
      { x: -12, y: 12 },
      { x: 12, y: 12 },
      { x: 0, y: -16 },
      { x: 0, y: 16 }
    ];
    this.toppings.forEach((tid, i) => {
      const tcfg = toppingCfg.find(t => t.id === tid);
      const pos = positions[i % positions.length];
      ctx.fillStyle = tcfg ? CONFIG.COLOR[tcfg.colorKey] : '#999';
      if (tid === 'egg') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2); ctx.fill();
      } else if (tid === 'ham') {
        ctx.fillRect(pos.x - 8, pos.y - 4, 16, 8);
      } else if (tid === 'lettuce') {
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      } else if (tid === 'crispy') {
        ctx.fillRect(pos.x - 7, pos.y - 7, 14, 14);
      } else if (tid === 'scallion') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2); ctx.fill();
      } else if (tid === 'sauce') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    });

    // 3. 状态图标
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.needsFlip && this.phase === 'first') {
      ctx.globalAlpha = this.flipFlash;
      ctx.fillStyle = CONFIG.COLOR.star;
      ctx.fillText('★', 0, -this.radius - 10);
      ctx.globalAlpha = 1;
    } else if (this.phase === 'second' && this.state === 'perfect') {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('✓', 0, -this.radius - 10);
    } else if (this.state === 'burnt') {
      ctx.fillStyle = '#333';
      ctx.fillText('糊', 0, -this.radius - 10);
    }

    ctx.restore();
  }
}

// ===================== Customer 顾客类 =====================

class Customer {
  constructor(id, orderToppings, patience, x, y, typeInfo, dislikedTopping) {
    this.id = id;
    this.orderToppings = orderToppings; // 订单小料数组（可能为空）
    this.orderKey = [...orderToppings].sort().join('+'); // 用于匹配
    this.maxPatience = patience;
    this.patience = patience;
    this.x = x;
    this.y = y;
    this.width = 68;
    this.height = 88;
    this.state = 'waiting'; // waiting / eating / leaving / retry
    this.animTime = 0;
    this.shake = 0;
    this.mouth = 'smile';
    this.typeInfo = typeInfo; // { id, name, color, patienceMult }
    this.dislikedTopping = dislikedTopping || null;
    this.orderBubbleOffset = 0;
    this.eatingTimer = 0;     // 吃完动画计时
    this.praised = false;     // 是否已触发夸赞
    this.doubleOrder = false; // 是否再来一份
  }

  update(dt) {
    if (this.state === 'eating') {
      this.eatingTimer += dt;
      if (this.eatingTimer > 1500) {
        if (this.doubleOrder) {
          // 再来一份：重置为等待状态
          this.state = 'waiting';
          this.patience = this.maxPatience;
          this.doubleOrder = false;
          this.animTime = 0;
          this.mouth = 'smile';
          this.eatingTimer = 0;
        } else {
          this.state = 'done';
        }
      }
      return;
    }
    if (this.state !== 'waiting') return;

    this.patience -= dt;
    this.animTime += dt;

    const ratio = this.patience / this.maxPatience;
    if (ratio < 0.25) {
      this.shake = Math.sin(this.animTime * 0.03) * 3;
      this.mouth = 'sad';
    } else if (ratio < 0.55) {
      this.shake = Math.sin(this.animTime * 0.015) * 1;
      this.mouth = 'flat';
    } else {
      this.shake = 0;
      this.mouth = 'smile';
    }

    if (this.patience <= 0) {
      this.state = 'leaving';
      this.mouth = 'sad';
    }
  }

  /**
   * serve - 上菜判定
   * @param {Pancake} pancake - 递上的煎饼
   * @param {Object} priceMap - 售价表
   * @param {Object} popData - 人气数据（用于判定完美翻面效果）
   * @returns {Object} { gold, text, popularity, perfectFlip, retry, doubleOrder }
   */
  serve(pancake, priceMap, popData) {
    if (this.state !== 'waiting') {
      return { gold: 0, text: '', popularity: 0, perfectFlip: false, retry: false, doubleOrder: false };
    }

    const pToppings = [...pancake.toppings].sort();
    const oToppings = [...this.orderToppings].sort();
    const matchToppings = pToppings.length === oToppings.length &&
      pToppings.every((v, i) => v === oToppings[i]);
    const violatesDislike = !!this.dislikedTopping && pToppings.includes(this.dislikedTopping);

    let price = 0;
    let text = '';
    let popularity = 0;
    let perfectFlip = false;
    let retry = false;
    let doubleOrder = false;

    if (pancake.state === 'burnt') {
      // 糊了
      price = 0;
      text = '糊了!';
      popularity = CONFIG.GAME.popularityBurnt;
      retry = false;
    } else if (!violatesDislike && matchToppings && pancake.canServe()) {
      const quality = pancake.getQuality();
      // 基础售价
      let basePrice = priceMap.base;
      pToppings.forEach(tid => {
        basePrice += (priceMap.toppings[tid] || 0);
      });

      if (quality === 'perfectFlip') {
        price = Math.floor(basePrice * CONFIG.PRICES.flipPerfectBonus);
        text = '完美翻面!';
        popularity = CONFIG.GAME.popularityPerfectBonus + CONFIG.GAME.popularityPerfectFlipBonus;
        perfectFlip = true;
        // 概率触发夸赞或再来一份
        if (Math.random() < CONFIG.GAME.doubleOrderChance) {
          doubleOrder = true;
        } else if (Math.random() < CONFIG.GAME.praiseChance) {
          text = '太好吃了!';
        }
      } else if (quality === 'perfect') {
        price = Math.floor(basePrice * CONFIG.PRICES.perfectBonus);
        text = '完美!';
        popularity = CONFIG.GAME.popularityPerfectBonus;
      } else if (quality === 'cooking') {
        price = basePrice;
        text = '还行';
        popularity = CONFIG.GAME.popularityBase;
      }
    } else {
      // 上错菜
      price = 0;
      text = violatesDislike ? '加了忌口!' : '上错了!';
      popularity = CONFIG.GAME.popularityWrong;
      // 小概率顾客要求重做
      if (Math.random() < CONFIG.GAME.retryOrderChance) {
        retry = true;
        text = violatesDislike ? '忌口，重做!' : '重做一份!';
        this.patience = Math.min(this.patience + this.maxPatience * 0.3, this.maxPatience);
      }
    }

    if (retry) {
      // 重做：顾客不离开，继续等待
      return { gold: 0, text, popularity, perfectFlip, retry, doubleOrder };
    }

    this.state = 'eating';
    this.doubleOrder = doubleOrder;
    this.eatingTimer = 0;
    return { gold: price, text, popularity, perfectFlip, retry, doubleOrder };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.shake, this.y);

    const bodyColor = this.typeInfo ? this.typeInfo.color : CONFIG.COLOR.customerBody;
    const typeId = this.typeInfo ? this.typeInfo.id : 'normal';

    // 1. 地面投影与身体
    ctx.fillStyle = 'rgba(23,35,39,0.16)';
    ctx.beginPath(); ctx.ellipse(0, this.height / 2 + 10, 28, 8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = bodyColor;
    fillRoundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    fillRoundRect(ctx, -this.width / 2 + 4, -this.height / 2 + 4, 10, this.height - 8, 5);
    ctx.strokeStyle = CONFIG.COLOR.panBorder;
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 7);

    // 2. 顾客类型标签
    if (this.typeInfo) {
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      fillRoundRect(ctx, -24, -this.height / 2 + 5, 48, 15, 5);
      ctx.fillStyle = CONFIG.COLOR.text;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.typeInfo.name, 0, -this.height / 2 + 12.5);
    }

    // 3. 脸部
    const faceGradient = ctx.createRadialGradient(-5, -25, 2, 0, -18, 20);
    faceGradient.addColorStop(0, '#FFFDF8');
    faceGradient.addColorStop(1, '#F2D5BC');
    ctx.fillStyle = faceGradient;
    ctx.beginPath();
    ctx.arc(0, -this.height / 4 + 3, typeId === 'kid' ? 18 : 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(38,50,56,0.28)'; ctx.lineWidth = 1; ctx.stroke();

    // 发型和能快速辨认身份的小配件
    ctx.fillStyle = typeId === 'elder' ? '#ECEFF1' : '#3E3531';
    ctx.beginPath();
    ctx.arc(0, -23, 17, Math.PI, Math.PI * 2);
    ctx.fill();
    if (typeId === 'worker') {
      ctx.fillStyle = '#F4F6F7'; ctx.fillRect(-8, 2, 16, 8);
      ctx.fillStyle = '#C94C4C';
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-4, 14); ctx.lineTo(0, 20); ctx.lineTo(4, 14); ctx.closePath(); ctx.fill();
    } else if (typeId === 'student') {
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, 2); ctx.lineTo(0, 12); ctx.lineTo(12, 2); ctx.stroke();
    } else if (typeId === 'kid') {
      ctx.fillStyle = '#3E3531';
      ctx.beginPath(); ctx.moveTo(-13, -29); ctx.lineTo(-6, -38); ctx.lineTo(-2, -28); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, -29); ctx.lineTo(10, -38); ctx.lineTo(14, -27); ctx.fill();
    } else if (typeId === 'elder') {
      ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(-7, -21, 5, 0, Math.PI * 2); ctx.arc(7, -21, 5, 0, Math.PI * 2); ctx.moveTo(-2, -21); ctx.lineTo(2, -21); ctx.stroke();
    }

    // 4. 眼睛
    ctx.fillStyle = CONFIG.COLOR.panBorder;
    const eyeY = -this.height / 4 + 1 + (this.mouth === 'sad' ? 2 : 0);
    ctx.beginPath();
    ctx.arc(-7, eyeY, 3, 0, Math.PI * 2);
    ctx.arc(7, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 5. 嘴巴
    ctx.beginPath();
    ctx.strokeStyle = CONFIG.COLOR.panBorder;
    ctx.lineWidth = 2;
    if (this.mouth === 'smile') {
      ctx.arc(0, -this.height / 4 + 11, 5, 0.2, Math.PI - 0.2);
    } else if (this.mouth === 'flat') {
      ctx.moveTo(-5, -this.height / 4 + 13);
      ctx.lineTo(5, -this.height / 4 + 13);
    } else {
      ctx.arc(0, -this.height / 4 + 18, 5, Math.PI + 0.2, -0.2);
    }
    ctx.stroke();

    if (typeId === 'foodie') {
      ctx.fillStyle = '#5D4037';
      ctx.beginPath(); ctx.ellipse(-4, -8, 5, 2, -0.2, 0, Math.PI * 2); ctx.ellipse(4, -8, 5, 2, 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // 6. 等待中显示订单 + 耐心条
    if (this.state === 'waiting') {
      let orderText = '🫓';
      const tmap = { egg: '🥚', ham: '🌭', lettuce: '🥬', crispy: '🥨', scallion: '🟢', sauce: '🟤' };
      this.orderToppings.forEach(tid => {
        orderText += tmap[tid] || '?';
      });

      const bubbleW = Math.max(54, Math.min(92, 34 + orderText.length * 10));
      const bubbleH = this.dislikedTopping ? 36 : 26;
      const bubbleY = -this.height / 2 - bubbleH + 2 + this.orderBubbleOffset;
      ctx.fillStyle = 'rgba(255,253,248,0.96)';
      fillRoundRect(ctx, -bubbleW / 2, bubbleY, bubbleW, bubbleH, 8);
      ctx.strokeStyle = 'rgba(23,35,39,0.32)';
      ctx.lineWidth = 1.5;
      strokeRoundRect(ctx, -bubbleW / 2, bubbleY, bubbleW, bubbleH, 8);
      ctx.fillStyle = 'rgba(255,253,248,0.96)';
      ctx.beginPath();
      ctx.moveTo(-8, bubbleY + bubbleH - 1);
      ctx.lineTo(2, bubbleY + bubbleH + 7);
      ctx.lineTo(10, bubbleY + bubbleH - 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = CONFIG.COLOR.panBorder;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(orderText, 0, bubbleY + 13);

      if (this.dislikedTopping) {
        ctx.fillStyle = '#C62828';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('忌口 ' + (tmap[this.dislikedTopping] || '?'), 0, bubbleY + 27);
      }

      // 耐心条背景
      const barW = 52;
      const barH = 6;
      const ratio = Math.max(0, this.patience / this.maxPatience);
      ctx.fillStyle = '#BCAAA4';
      ctx.fillRect(-barW / 2, this.height / 2 + 8, barW, barH);

      // 耐心条前景
      let color = CONFIG.COLOR.barGreen;
      if (ratio < 0.55) color = CONFIG.COLOR.barYellow;
      if (ratio < 0.25) color = CONFIG.COLOR.barRed;
      ctx.fillStyle = color;
      ctx.fillRect(-barW / 2, this.height / 2 + 8, barW * ratio, barH);
    }

    ctx.restore();
  }
}

// ===================== Particle 粒子类 =====================

class Particle {
  constructor(x, y, color, speed, life) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.vx = (Math.random() - 0.5) * speed;
    this.vy = (Math.random() - 0.5) * speed - 2;
    this.life = life;
    this.maxLife = life;
    this.size = Math.random() * 3 + 2;
  }

  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1;
    this.life -= dt;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

module.exports = { Pancake, Customer, Particle };
