/* by：弦云孤赫——David Yang
** github - https://github.com/yangyunhe369
*/
/**
 * 游戏引擎函数
 */
class Game {
  constructor () {
    let g = {
      actions: {},                                                  // 注册按键操作
      keydowns: {},                                                 // 按键事件对象
      cardSunVal: null,                                             // 当前选中植物卡片index以及需消耗阳光值
      cardSection: '',                                              // 绘制随鼠标移动植物类别
      shovelMode: false,                                            // v11：铲子模式（选中铲子后点击植物铲除）
      canDrawMousePlant: false,                                     // 能否绘制随鼠标移动植物
      canLayUp: false,                                              // 能否放置植物
      mousePlant: null,                                             // 鼠标绘制植物对象
      mouseX: 0,                                                    // 鼠标 x 轴坐标
      mouseY: 0,                                                    // 鼠标 y 轴坐标
      mouseRow: 0,                                                  // 鼠标移动至可种植植物区域的行坐标
      mouseCol: 0,                                                  // 鼠标移动至可种植植物区域的列坐标
      state: 0,                                                     // 游戏状态值，初始默认为 0
      state_LOADING: 0,                                             // 准备阶段
      state_START: 1,                                               // 开始游戏
      state_RUNNING: 2,                                             // 游戏开始运行
      state_STOP: 3,                                                // 暂停游戏
      state_PLANTWON: 4,                                            // 游戏结束，玩家胜利
      state_ZOMBIEWON: 5,                                           // 游戏结束，僵尸胜利
      canvas: document.getElementById("canvas"),                    // canvas元素
      context: document.getElementById("canvas").getContext("2d"),  // canvas画布
      timer: null,                                                  // 轮询定时器
      fps: window._main.fps,                                        // 动画帧数
    }
    Object.assign(this, g)
  }
  // 创建，并初始化当前对象
  static new () {
    let g = new this()
    g.init()
    return g
  }
  // 清除当前游戏定时器
  clearGameTimer () {
    let g = this
    clearInterval(g.timer)
  }
  // 绘制场景
  drawBg () {
    let g = this,
        cxt = g.context,
        sunnum = window._main.sunnum,               // 阳光数量对象
        cards = window._main.cards,                 // 植物卡片对象
        img = imageFromPath(allImg.bg)              // 背景图片对象
    // 绘制背景
    cxt.drawImage(img, 0, 0)
    // 绘制阳光数量框
    sunnum.draw(cxt)
  }
  // 绘制小汽车
  drawCars () {
    let g = this,
        cxt = g.context,
        cars = window._main.cars                    // 小汽车对象
    // 绘制植物卡片
    cars.forEach(function (car, idx) {
      if (car.x > 950) { // 移除使用过的小汽车
        cars.splice(idx, 1)
      }
      car.draw(g, cxt)
    })
  }
  // 绘制植物卡片
  drawCards () {
    let g = this,
        cxt = g.context,
        cards = window._main.cards                  // 植物卡片对象
    // 绘制植物卡片
    for (let card of cards) {
      card.draw(cxt)
    }
  }
  // 绘制玩家胜利动画
  drawPlantWon () {
    let g = this,
        cxt = g.context, 
        text = '恭喜玩家获得胜利！'          // 胜利文案
    // 绘制胜利动画
    cxt.fillStyle = 'red'
    cxt.font = '48px Microsoft YaHei'
    cxt.fillText(text, 354, 300)
  }
  // 绘制僵尸胜利动画
  drawZombieWon () {
    let g = this,
        cxt = g.context, 
        img = imageFromPath(allImg.zombieWon)          // 胜利图片对象
    // 绘制胜利动画
    cxt.drawImage(img, 293, 66)
  }
  // 绘制loading首屏画面
  drawLoading () {
    let g = this,
        cxt = g.context,
        img = imageFromPath(allImg.startBg)
    // 绘制loading图片
    cxt.drawImage(img, 119, 0)
  }
  // 绘制Start动画
  drawStartAnime () {
    let g = this,
        stateName = 'write',
        loading = window._main.loading,
        cxt = g.context,
        canvas_w = g.canvas.width,
        canvas_h = g.canvas.height,
        animateLen = allImg.loading[stateName].len     // 修改当前动画序列长度
    // 累加动画计数器
    if (loading.imgIdx !== animateLen) {
      loading.count += 1
    }
    // 设置角色动画运行速度
    loading.imgIdx = Math.floor(loading.count / loading.fps)
    // 一整套动画完成后重置动画计数器，并设置当前帧动画对象
    if (loading.imgIdx === animateLen) {
      loading.img = loading.images[loading.imgIdx - 1]
    } else {
      loading.img = loading.images[loading.imgIdx]
    }
    // 绘制Start动画
    cxt.drawImage(loading.img, 437, 246)
  }
  // 绘制所有子弹的函数
  drawBullets (plants) {
    let g = this,
        context = g.context,
        // v17.1：DPR 适配后 canvas.width 是物理像素（1400×dpr），射程判断必须用逻辑宽
        canvas_w = (g.logicW || 1400) - 440
    for (let item of plants) {
      item.bullets.forEach(function (bullet, idx, arr) {
        // 绘制子弹
        bullet.draw(g, context)
        // 移除超出射程的子弹
        if (bullet.x >= canvas_w) {
          arr.splice(idx, 1)
        }
      })
    }
  }
  // 绘制角色血量
  drawBlood (role) {
    let g = this,
        cxt = g.context,
        x = role.x,
        y = role.y
    cxt.fillStyle = 'red'
    cxt.font = '18px Microsoft YaHei'
    if (role.type === 'plant') {
      cxt.fillText(role.life, x + 30, y - 10)
    } else if (role.type === 'zombie') {
      cxt.fillText(role.life, x + 85, y + 10)
    }
  }
  // 更新角色状态
  updateImage (plants, zombies) {
    let g = this,
        cxt = g.context
    plants.forEach(function (plant, idx) {
      // v26：防御性 try/catch——与 drawImage 同款。updateImage 位于 clearRect 之后、绘制之前，
      // 单个角色在此抛错会中断整帧渲染（背景已清、角色全不画 = 用户所见"植物集体消失"）
      try {
        // 判断是否进入攻击状态
        plant.canAttack()
        // 更新状态
        plant.update(g)
      } catch (e) { console.warn('[plant update err]', plant.section, e.message) }
    })
    zombies.forEach(function (zombie, idx) {
      if (zombie.x < 50) { // 僵尸到达房屋，获得胜利
        g.state = g.state_ZOMBIEWON
      }
      try {
        // 判断是否进入攻击状态
        zombie.canAttack()
        // 更新状态
        zombie.update(g)
      } catch (e) { console.warn('[zombie update err]', zombie.zombieType, e.message) }
    })
  }
  // 绘制角色
  drawImage (plants, zombies) {
    let g = this,
        cxt = g.context,
        delPlantsArr = []             // 被删除植物元素集合
    plants.forEach(function (plant, idx, arr) {
      if (plant.isDel) { // 移除死亡对象
        delPlantsArr.push(plant)
        arr.splice(idx, 1)
      } else { // 绘制未死亡角色
        // v23：防御性 try/catch——单个 plant 抛错（如 img 加载未完/非图像）不中断整循环，避免"画面清空只剩背景"
        try { plant.draw(cxt) } catch (e) { console.warn('[plant draw err]', plant.section, e.message) }
        // g.drawBlood(plant)
      }
    })
    zombies.forEach(function (zombie, idx) {
      if (zombie.isDel) { // 移除死亡对象
        zombies.splice(idx, 1)
        // 当僵尸被消灭完，进入下一关（学习层接管）或玩家胜利
        if (zombies.length === 0) {
          const ws = window.wordStudy
          if (ws && ws.onZombiesCleared && ws.onZombiesCleared()) {
            // 学习层接管：进入下一关（word-study 负责重建僵尸、重启定时器）
          } else {
            g.state = g.state_PLANTWON
          }
        }
      } else { // 绘制未死亡角色
        // v23：防御性 try/catch——单个 zombie 抛错不中断整循环
        try { zombie.draw(cxt) } catch (e) { console.warn('[zombie draw err]', zombie.zombieType, e.message) }
        // g.drawBlood(zombie)
      }
      // 使僵尸在植物死亡后可正确移动
      for (let plant of delPlantsArr) {
        if (zombie.attackPlantID === plant.id) {
          zombie.canMove = true
          if (zombie.life > 2) {
            zombie.changeAnimation('run')
          }
        }
      }
    })
  }
  // 检测当前鼠标移动坐标，并处理相关事件
  getMousePos () {
    let g = this,
        _main = window._main,
        cxt = g.context,
        cards = _main.cards,
        x = g.mouseX,
        y = g.mouseY
    // v-fix：种植 + 铲子模式都需要行列坐标 → 统一在每帧计算（不受 canDrawMousePlant 限制，
    // 否则铲子模式下 mouseRow/mouseCol 始终停留在上次种植时的旧值，点击匹配不到植物 → 铲子失效）
    // v29：行列基准对齐网格实际起点（plants_info.x=250 / y=92，格宽 80 / 高 100）——
    // 旧基准 175/75 使列判定比网格提前 75px（≈一格宽），点格子中心会算成下一列 → 落点差一格
    g.mouseRow = Math.floor((y - 92) / 100) + 1
    g.mouseCol = Math.floor((x - 250) / 80) + 1
    // 鼠标移动绘制植物
    if (g.canDrawMousePlant) {
      g.mousePlantCallback(x, y)
    } else if (g.shovelMode) {
      // v11：铲子模式下跟手显示半透明 🪓
      cxt.font = '28px "Segoe UI Emoji","Apple Color Emoji","Microsoft YaHei"'
      cxt.textAlign = 'center'
      cxt.globalAlpha = 0.65
      cxt.fillText('🪓', x + 42, y - 18)
      cxt.globalAlpha = 1
      cxt.textAlign = 'start'
    }
  }
  // 鼠标移动绘制植物
  mousePlantCallback (x, y) {
    let g = this,
        _main = window._main,
        cxt = g.context,
        row = Math.floor((y - 92) / 100) + 1,               // v29：行基准对齐网格起点 y=92
        col = Math.floor((x - 250) / 80) + 1                // v29：列基准对齐网格起点 x=250（旧 175 差一格）
    // 绘制植物信息
    let plant_info = {
          type: 'plant',
          section: g.cardSection,
          x: _main.plants_info.x + 80 * (col - 1),
          y: _main.plants_info.y + 100 * (row - 1),
          row: row,
          col: col,
        }
    g.mouseRow = row
    g.mouseCol = col
    // 判断是否在可种植区域
    if (row >= 1 && row <= 5 && col >= 1 && col <= 9) {
      g.canLayUp = true
      // 判断当前位置是否可放置植物
      for (let plant of _main.plants) {
        if (row === plant.row && col === plant.col) {
          g.canLayUp = false
        }
      }
    } else {
      g.canLayUp = false
    }
    // 绘制随鼠标移动植物函数
    if (g.canDrawMousePlant) {
      g.drawMousePlant(plant_info)
    }
  }
  // 绘制随鼠标移动植物
  drawMousePlant (plant_info) {
    let g = this,
        cxt = g.context
    // v29：只画网格对齐的半透明落点幽灵（所见即所得：幽灵在哪，植物就落哪）。
    // 旧版还另画一个跟鼠标偏移 (+82,-40) 的全不透明植物叠在上面，与落点不同位 → "鼠标处一个、落点又一个"的错位观感
    if (g.canLayUp) {
      let plant = Plant.new(plant_info)
      plant.isHurt = true
      plant.update(g)
      plant.draw(cxt)
    }
  }
  // 注册事件
  registerAction (key, callback) {
    this.actions[key] = callback
  }
  // 设置逐帧动画
  setTimer (_main) {
    let g = this,
        plants = _main.plants,             // 植物对象数组
        zombies = _main.zombies            // 僵尸对象数组
    // 事件集合
    let actions = Object.keys(g.actions)
    for (let i = 0; i < actions.length; i++) {
      let key = actions[i]
      if(g.keydowns[key]) {
        // 如果按键被按下，调用注册的action
        g.actions[key]()
      }
    }
    // 清除画布
    g.context.clearRect(0, 0, g.canvas.width, g.canvas.height)
    if (g.state === g.state_LOADING) {
      // 绘制场景
      g.drawLoading()
    } else if (g.state === g.state_START) {
      // 绘制场景
      g.drawBg()
      // 绘制小汽车
      g.drawCars()
      // 绘制植物卡片
      g.drawCards()
      // 绘制 Start 动画
      g.drawStartAnime()
    } else if (g.state === g.state_RUNNING) {
      // 绘制场景
      g.drawBg()
      // 更新所有植物，僵尸状态
      g.updateImage(plants, zombies)
      // 绘制所有植物，僵尸
      g.drawImage(plants, zombies)
      // 绘制小汽车
      g.drawCars()
      // 绘制植物卡片
      g.drawCards()
      // 绘制所有子弹
      g.drawBullets(plants)
      // 绘制随鼠标移动植物
      g.getMousePos()
    } else if (g.state === g.state_STOP) {
      // 绘制场景
      g.drawBg()
      // 更新所有植物，僵尸状态
      g.updateImage(plants, zombies)
      // 绘制所有植物，僵尸
      g.drawImage(plants, zombies)
      // 绘制小汽车
      g.drawCars()
      // 绘制植物卡片
      g.drawCards()
      // 绘制所有子弹
      g.drawBullets(plants)
      // 清除全局生成阳光定时器
      _main.clearTiemr()
    } else if (g.state === g.state_PLANTWON) { // 玩家胜利
      // 绘制场景
      g.drawBg()
      // 绘制小汽车
      g.drawCars()
      // 绘制植物卡片
      g.drawCards()
      // 绘制玩家胜利画面
      g.drawPlantWon()
      // 清除全局生成阳光定时器
      _main.clearTiemr()
    } else if (g.state === g.state_ZOMBIEWON) { // 僵尸胜利
      // 绘制场景
      g.drawBg()
      // 绘制小汽车
      g.drawCars()
      // 绘制植物卡片
      g.drawCards()
      // 绘制僵尸胜利画面
      g.drawZombieWon()
      // 清除全局生成阳光定时器
      _main.clearTiemr()
    }
  }
  /**
   * 初始化函数
   * _main: 游戏入口函数对象
   */
  init () {
    let g = this,
        _main = window._main

    // v17.1：DPR 高清适配——物理分辨率 = 逻辑分辨率 × devicePixelRatio（封顶 2x），CSS 显示尺寸不变
    // 逻辑坐标体系（1400×600）与全部角色/绘制代码零改动，仅画布物理像素翻倍 → 高分屏更清晰
    // 注意：canvas.width 被 drawBullets 用于射程判断（已改逻辑宽），此处理论尺寸仅供 clearRect 用
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (dpr > 1) {
      const canvas = document.getElementById('canvas')
      canvas.width = 1400 * dpr
      canvas.height = 600 * dpr
      canvas.style.width = '1400px'
      canvas.style.height = '600px'
      g.context.scale(dpr, dpr)
      g.logicW = 1400
      g.logicH = 600
    } else {
      g.logicW = g.canvas.width
      g.logicH = g.canvas.height
    }

    // 设置键盘按下及松开相关注册函数
    window.addEventListener('keydown', function (event) {
      g.keydowns[event.keyCode] = 'down'
    })
    window.addEventListener('keyup', function (event) {
      g.keydowns[event.keyCode] = 'up'
    })
    g.registerAction = function (key, callback) {
      g.actions[key] = callback
    }
    // 设置轮询定时器
    g.timer = setInterval(function () {
      g.setTimer(_main)
    }, 1000/g.fps)
    // 注册鼠标移动事件
    document.getElementById('canvas').onmousemove = function (event) {
      let e = event || window.event,
          // v-fix：改用 getBoundingClientRect 取画布相对坐标，修正 #canvas「margin-left:-120px」+ 页面偏移导致的点击整体偏移
          rect = this.getBoundingClientRect(),
          scaleX = (g.logicW || 1400) / rect.width,
          scaleY = (g.logicH || 600) / rect.height
      g.mouseX = (e.clientX - rect.left) * scaleX
      g.mouseY = (e.clientY - rect.top) * scaleY
    }
    // 查看更新日志按钮点击事件
    document.querySelectorAll('.change-log-btn').forEach(function (el, idx) {
      el.onclick = function () {
        let updateLog = document.getElementsByClassName('update-log')[0]
        updateLog.style.display === 'none' ? updateLog.style.display = 'block' : updateLog.style.display = 'none'
      }
    })
    // 开始游戏按钮点击事件
    document.getElementById('js-startGame-btn').onclick = function () {
      // 播放Start动画
      g.state = g.state_START
      // 设置定时器，切换至开始游戏状态
      setTimeout(function () {
        g.state = g.state_RUNNING
        // 显示控制按钮
        document.getElementById('pauseGame').className += ' show'
        document.getElementById('restartGame').className += ' show'
        // 设置全局生成阳光、僵尸定时器
        _main.clearTiemr()
        _main.setTimer()
      }, 2500)
      // 显示卡片列表信息
      document.getElementsByClassName('cards-list')[0].className += ' show'
      // 显示控制按钮菜单
      document.getElementsByClassName('menu-box')[0].className += ' show'
      // 隐藏开始游戏按钮，查看更新日志按钮（v33：首页介绍说明已移除；v35：导入/重置按钮常驻右侧 HUD，不再隐藏）
      document.getElementById('js-startGame-btn').style.display = 'none'
      document.getElementById('js-log-btn').style.display = 'none'
      // v6：显示阳光规则提示（3.2s 后自动消失）
      var sunRule = document.querySelector('.pvz-sun-rule')
      if (sunRule) {
        sunRule.classList.add('show')
        // v22fix：补传第三个参数 sunRule（v13 同类漏网——缺参时回调 el 为 undefined，el.classList.remove 抛 TypeError，
        // 提示 DOM 永不消失；此错误虽在 setTimeout 回调内不影响主循环，但会污染控制台错误流）
        setTimeout(function (el) { el.classList.remove('show') }, 3200, sunRule)
      }
    }
    // 植物卡片点击事件
    document.querySelectorAll('.cards-item').forEach(function (card, idx) {
      card.onclick = function () {
        // v11：铲子——免费工具，点击切换铲除模式（不消耗阳光、不走冷却）
        if (this.dataset.section === 'shovel') {
          g.shovelMode = !g.shovelMode
          g.canDrawMousePlant = false
          g.cardSection = ''
          g.mousePlant = null
          // 铲子卡高亮切换（选中其他种植卡时清除）
          document.querySelectorAll('.cards-item').forEach(function (c) {
            c.classList.remove('pvz-card-active')
          })
          if (g.shovelMode) this.classList.add('pvz-card-active')
          return
        }
        // 选中种植卡时自动退出铲子模式
        g.shovelMode = false
        document.querySelectorAll('.cards-item').forEach(function (c) {
          c.classList.remove('pvz-card-active')
        })
        let plant = null,                                 // 鼠标放置植物对象
            cards = _main.cards
        // 当卡片可点击时
        if (cards[idx].canClick) {
          // 设置当前随鼠标移动植物类别
          g.cardSection = this.dataset.section
          // 可绘制随鼠标移动植物
          g.canDrawMousePlant = true
          // 设置当前选中植物卡片idx以及需消耗阳光数量
          g.cardSunVal = {
            idx: idx,
            val: cards[idx].sun_val,
          }
        }
      }
    })
    // 鼠标点击画布事件
    document.getElementById('canvas').onclick = function (event) {
      let plant = null,                                 // 鼠标放置植物对象
          cards = _main.cards,
          // v-fix：点击时从事件重新换算画布相对坐标与行列（不依赖上次 mousemove，并修正 canvas 偏移）
          rect = this.getBoundingClientRect(),
          scaleX = (g.logicW || 1400) / rect.width,
          scaleY = (g.logicH || 600) / rect.height
      g.mouseX = (event.clientX - rect.left) * scaleX
      g.mouseY = (event.clientY - rect.top) * scaleY
      // v29：行列基准对齐网格起点（250/92）
      g.mouseRow = Math.floor((g.mouseY - 92) / 100) + 1
      g.mouseCol = Math.floor((g.mouseX - 250) / 80) + 1
      let x = g.mouseX,
          y = g.mouseY,
          plant_info = {                                // 鼠标放置植物对象初始化信息
            type: 'plant',
            section: g.cardSection,
            x: _main.plants_info.x + 80 * (g.mouseCol - 1),
            y: _main.plants_info.y + 100 * (g.mouseRow - 1),
            row: g.mouseRow,
            col: g.mouseCol,
            canSetTimer: g.cardSection === 'sunflower' ? true : false,      // 能否设置阳光生成定时器
          }
      // v11：铲子模式——点击植物铲除（isDel 后主循环自动移除并解除僵尸锁定）；点击空白取消
      if (g.shovelMode) {
        let target = null
        for (let item of _main.plants) {
          if (g.mouseRow === item.row && g.mouseCol === item.col) {
            target = item
            break
          }
        }
        g.shovelMode = false
        document.querySelectorAll('.cards-item').forEach(function (c) {
          c.classList.remove('pvz-card-active')
        })
        if (target) {
          target.isDel = true
          if (typeof target.clearSunTimer === 'function') target.clearSunTimer()
          if (window.answerUI && window.answerUI.toast) {
            window.answerUI.toast('🪓 已铲除！种错了随时能调整布局')
          }
        }
        return
      }
      // 判断当前位置是否可放置植物
      for (let item of _main.plants) {
        if (g.mouseRow === item.row && g.mouseCol === item.col) {
          g.canLayUp = false
          g.mousePlant = null
        }
      }
      // 在可放置时，绘制植物
      if (g.canLayUp && g.canDrawMousePlant) {
        let cardSunVal = g.cardSunVal
        if (cardSunVal.val <= _main.allSunVal) { // 在阳光数量足够时绘制
          // 禁用当前卡片
          cards[cardSunVal.idx].canClick = false
          // 定时改变卡片可点击状态
          cards[cardSunVal.idx].changeState()
          // 绘制倒计时
          cards[cardSunVal.idx].drawCountDown()
          // 放置对应植物
          plant = Plant.new(plant_info)
          _main.plants.push(plant)
          // 改变阳光数量
          _main.sunnum.changeSunNum(-cardSunVal.val)
          // 禁止绘制随鼠标移动植物
          g.canDrawMousePlant = false
        } else { // 阳光数量不足
          // 禁止绘制随鼠标移动植物
          g.canDrawMousePlant = false
          // 清空随鼠标移动植物对象
          g.mousePlant = null
        }
      } else {
        // 禁止绘制随鼠标移动植物
        g.canDrawMousePlant = false
        // 清空随鼠标移动植物对象
        g.mousePlant = null
      }
    }
    // 暂停按钮事件
    document.getElementById('pauseGame').onclick = function (event) {
      g.state = g.state_STOP
    }
    // 重启游戏按钮事件
    document.getElementById('restartGame').onclick = function (event) {
      if (g.state === g.state_LOADING) { // 加载动画
        g.state = g.state_START
      } else {
        g.state = g.state_RUNNING
        // 开启向日葵的阳光生成定时器
        for (let plant of _main.plants) {
          if (plant.section === 'sunflower') {
            plant.setSunTimer()
          }
        }
      }
      // 设置全局生成阳光、僵尸定时器
      _main.setTimer()
    }
  }
  // ================= 学习层接口（GDD-03 追加：答题即开挂；以上原方法体零改动）=================
  // ① 阳光奖励（答对 +150；hardMode 开启时封顶 sunCap）
  grantSunReward (amount = 150) {
    let m = window._main,
        ws = window.wordStudy
    if (ws && ws.config && ws.config.hardMode) {
      m.allSunVal = Math.max(0, Math.min(m.allSunVal + amount, ws.config.sunCap))
      m.sunnum.sun_num = m.allSunVal          // 同步显示值（draw 读 sun_num）
    } else {
      m.sunnum.changeSunNum(amount)
    }
  }
  // ② 随机战斗 buff（v12：移除樱桃全屏清场——用户反馈"答对单词之后不要清屏僵尸"；
  // 概率重分配：攻速 40% / 减速 30% / 护盾 30%）
  grantRandomPlantBuff () {
    let r = Math.random(),
        m = window._main
    if (r < 0.40) { this.buffAttackSpeed(m) }
    else if (r < 0.70) { this.buffSlowZombies(m) }
    else { this.buffShield(m) }
  }
  // 攻速翻倍 30s：挂载点 = attack 动画 fps（fps 减半 → 动画走完一轮更快 → 射击更频繁）
  buffAttackSpeed (m, duration = 30000) {
    m.plants.forEach(function (p) {
      if (p.canShoot && p.attack) {
        // v25：原值只在首次生效时记录——连续答对叠加 buff 时原实现互相覆盖 _savedFps，
        // 30s 恢复定时器会把 fps 恢复到"半途值"而非原始值（攻速永久变快）
        if (p._savedFps == null) p._savedFps = p.attack.fps
        p.attack.fps = Math.max(1, Math.floor(p.attack.fps / 2))
      }
    })
    setTimeout(function () {
      m.plants.forEach(function (p) {
        if (p._savedFps != null && p.attack) {
          p.attack.fps = p._savedFps
          delete p._savedFps
        }
      })
    }, duration)
  }
  // 全场减速 10s：Zombie.update 每帧强制 speed=3（硬编码），直接改字段无效
  // → 用实例访问器属性包裹：setter 吞掉原版赋值，getter 返回 base × 减速因子 × 难度因子
  //   （难度因子 __wsDiffFactor 由 word-study 关卡系统设置：easy 0.85 / hard 1.15，二者可叠加）
  buffSlowZombies (m, duration = 10000) {
    m.zombies.forEach(function (z) {
      if (z.__wsSlow) return
      z.__wsSlow = true
      if (!z.__wsSpeedWrapped) {
        z.__wsSpeedWrapped = true
        let base = 3
        Object.defineProperty(z, 'speed', {
          configurable: true,
          enumerable: true,
          get: function () { return base * (this.__wsFactor !== undefined ? this.__wsFactor : 1) * (this.__wsDiffFactor !== undefined ? this.__wsDiffFactor : 1) },
          set: function () {},
        })
      }
      z.__wsFactor = 0.5
    })
    setTimeout(function () {
      m.zombies.forEach(function (z) {
        if (!z.__wsSlow) return
        delete z.__wsSlow
        delete z.__wsFactor
        if (z.__wsDiffFactor === undefined && z.__wsSpeedWrapped) {
          // 无难度因子：还原为普通数据属性
          delete z.__wsSpeedWrapped
          Object.defineProperty(z, 'speed', { configurable: true, enumerable: true, writable: true, value: 3 })
        }
        // 有难度因子：保留包裹（getter 继续乘 __wsDiffFactor，困难加速不丢失）
      })
    }, duration)
  }
  // 护盾：全植物 +3 血
  buffShield (m) {
    m.plants.forEach(function (p) { p.life += 3 })
  }
}