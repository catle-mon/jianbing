/**
 * ============================================================
 * 不随便煎饼 - 游戏配置文件 (config.js) v2
 * ============================================================
 * 新增：
 *   - 翻面机制配置
 *   - 小料系统（随关卡解锁）
 *   - 人气系统
 *   - 多样化顾客类型
 * ============================================================
 */

module.exports = {
  COLOR: {
    bg: '#FFF8E1',
    pan: '#795548',
    panBorder: '#3E2723',
    batter: '#FFFFFF',
    egg: '#FFD54F',
    ham: '#FF8A80',
    lettuce: '#66BB6A',
    crispy: '#FFB74D',
    scallion: '#81C784',
    sauce: '#8D6E63',
    cooked: '#FFCA28',
    burnt: '#5D4037',
    customerBody: '#90CAF9',
    customerFace: '#FFFFFF',
    text: '#3E2723',
    btn: '#FF7043',
    btnActive: '#F4511E',
    btnDisabled: '#BCAAA4',
    btnTopping: '#66BB6A',
    barGreen: '#66BB6A',
    barYellow: '#FFA726',
    barRed: '#EF5350',
    gold: '#FFC107',
    popularity: '#E91E63',
    star: '#FFD700'
  },

  GAME: {
    initialGold: 50,
    initialBatter: 10,

    // 翻面与烹饪
    cookTime: 4000,          // 第一面基础烹饪时长（毫秒）
    secondSideTime: 3000,    // 第二面基础烹饪时长（毫秒）
    flipHintStart: 0.40,     // 出现翻面提示的开始比例
    flipHintEnd: 0.60,       // 翻面提示结束比例（之后强制可翻）
    flipPerfectStart: 0.46,  // 完美翻面区间开始
    flipPerfectEnd: 0.54,    // 完美翻面区间结束
    perfectStart: 0.35,      // 第二面完美出锅区间开始
    perfectEnd: 0.65,        // 第二面完美出锅区间结束

    // 顾客
    basePatience: 18000,     // 顾客基础耐心（毫秒）
    maxCustomers: 6,         // 同屏最大顾客数
    startWaveCustomers: 3,
    waveCustomerInc: 2,
    waveIntervalBase: 10000,
    waveIntervalMin: 3000,
    waveIntervalDec: 800,

    // 小料系统（随 wave 解锁）
    toppings: [
      { id: 'egg', name: '蛋', colorKey: 'egg', unlockWave: 1, cost: 4, buyAmount: 3 },
      { id: 'ham', name: '肠', colorKey: 'ham', unlockWave: 1, cost: 6, buyAmount: 3 },
      { id: 'lettuce', name: '菜', colorKey: 'lettuce', unlockWave: 3, cost: 2, buyAmount: 3 },
      { id: 'crispy', name: '脆', colorKey: 'crispy', unlockWave: 5, cost: 3, buyAmount: 3 },
      { id: 'scallion', name: '葱', colorKey: 'scallion', unlockWave: 7, cost: 1, buyAmount: 3 },
      { id: 'sauce', name: '酱', colorKey: 'sauce', unlockWave: 9, cost: 2, buyAmount: 3 }
    ],

    // 顾客类型（随 wave 解锁）
    customerTypes: [
      { id: 'normal', name: '市民', patienceMult: 1.0, color: '#90CAF9', unlockWave: 1, weight: 35 },
      { id: 'worker', name: '上班族', patienceMult: 0.70, color: '#B39DDB', unlockWave: 1, weight: 20 },
      { id: 'student', name: '学生', patienceMult: 0.85, color: '#A5D6A7', unlockWave: 1, weight: 20 },
      { id: 'kid', name: '小孩', patienceMult: 0.55, color: '#F48FB1', unlockWave: 2, weight: 10 },
      { id: 'foodie', name: '老饕', patienceMult: 1.20, color: '#FFCC80', unlockWave: 4, weight: 8 },
      { id: 'elder', name: '老人', patienceMult: 1.40, color: '#BCAAA4', unlockWave: 5, weight: 7 }
    ],

    // 人气系统
    popularityBase: 5,           // 每接待一位基础人气
    popularityPerfectBonus: 10,  // 完美出锅额外人气
    popularityPerfectFlipBonus: 8, // 完美翻面额外人气
    popularityWrong: -10,        // 上错菜失去人气
    popularityTimeout: -20,      // 顾客超时离开失去人气（双倍）
    streakThresholds: [3, 6, 10, 15, 20], // 连续正确达到后提升倍数
    streakMultipliers: [1, 1.5, 2, 3, 5, 8], // 对应倍数
    influencerThreshold: 120,    // 触发网红探店的人气阈值
    influencerGoldCost: 30,      // 接受探店失去金币
    influencerPopGain: 80,       // 接受探店获得人气
    influencerRefusePopLoss: 15, // 拒绝探店失去人气
    influencerRefuseChance: 0.3, // 拒绝后失去人气的概率
    retryOrderChance: 0.25,      // 上错菜后顾客要求重做的概率
    praiseChance: 0.35,          // 完美翻面煎饼触发夸赞概率
    doubleOrderChance: 0.20,     // 完美翻面煎饼触发"再来一份"概率

    // 丢弃返还
    trashRefundChance: 0.3,      // 丢弃煎饼返还金币概率
    trashRefundRatio: 0.4,       // 返还比例（售价的40%）
    popularityBurnt: -5,         // 糊了失去人气

    // 容器升级
    containerUpgradeCosts: [40, 60, 100],
    containerMaxSlots: [1, 2, 3, 4],

    // 订单复杂度随波数增长
    orderComplexity: {
      wave1: { maxToppings: 1 },
      wave3: { maxToppings: 2 },
      wave6: { maxToppings: 3 },
      wave10: { maxToppings: 4 }
    }
  },

  PRICES: {
    base: 8,       // 基础饼售价
    flipPerfectBonus: 1.5,  // 完美翻面售价倍率
    perfectBonus: 1.3       // 完美出锅售价倍率
  },

  TOPPING_PRICES: {
    egg: 5,
    ham: 6,
    lettuce: 2,
    crispy: 3,
    scallion: 1,
    sauce: 2
  },

  UPGRADES: [
    { id: 'slot', name: '大锅', desc: '锅位+1', cost: 80, max: 3, value: 1 },
    { id: 'speed', name: '快手', desc: '烹饪-15%', cost: 60, max: 5, value: 0.15 },
    { id: 'patience', name: '微笑', desc: '耐心+20%', cost: 50, max: 5, value: 0.2 },
    { id: 'price', name: '招牌', desc: '售价+15%', cost: 40, max: 5, value: 0.15 }
  ]
};
