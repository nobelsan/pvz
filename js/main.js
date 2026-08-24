/* by：弦云孤赫——David Yang
** github - https://github.com/yangyunhe369
*/
/**
 * 游戏运行主函数
 */
class Main {
  constructor () {
    let m = {
      allSunVal: 100,                           // 阳光总数量（v9：初始 200→100，开局只能 1 棵豌豆，逼玩家答题攒阳光）
      loading: null,                            // loading 动画对象
      sunnum: null,                             // 阳光实例对象
      cars: [],                                 // 实例化除草车对象数组
      cars_info: {                              // 初始化参数
        x: 170,                                 // x 轴坐标
        y: 102,                                 // y 轴坐标
        position: [
          {row: 1},
          {row: 2},
          {row: 3},
          {row: 4},
          {row: 5},
        ],                                 
      },
      cards: [],                                // 实例化植物卡片对象数组
      cards_info: {                             // 初始化参数
        x: 0,                                   // x 轴坐标
        y: 0,                                   // y 轴坐标
        position: [
          {name: 'shovel', row: 1, sun_val: 0, timer_spacing: 1 * 1000},
          {name: 'wallnut', row: 2, sun_val: 50, timer_spacing: 12 * 1000},
          {name: 'peashooter', row: 3, sun_val: 100, timer_spacing: 7 * 1000},
          {name: 'repeater', row: 4, sun_val: 150, timer_spacing: 10 * 1000},
          {name: 'gatlingpea', row: 5, sun_val: 200, timer_spacing: 15 * 1000},
          {name: 'chomper', row: 6, sun_val: 200, timer_spacing: 15 * 1000},
          {name: 'cherrybomb', row: 7, sun_val: 250, timer_spacing: 25 * 1000},
        ]
      },
      plants: [],                               // 实例化植物对象数组
      zombies: [],                              // 实例化僵尸对象数组
      plants_info: {                            // 初始化参数
        type: 'plant',                          // 角色类型
        x: 250,                                 // 初始 x 轴坐标，递增量 80
        y: 92,                                  // 初始 y 轴坐标，递增量 100
        position: [                             // section：植物类别，row：横行坐标（最大值为 5），col：竖列坐标（最大值为 9）
          // 设置初始数据：{section: 'sunflower', row: 1, col: 1},
        ]
      },
      zombies_info: {                           // 初始化参数
        type: 'zombie',                         // 角色类型
        x: 170,                                 // x轴坐标
        y: 15,                                  // y轴坐标
        position: [                             // section：僵尸类别，row：横行坐标（最大值为 5），col：竖列坐标（最大值为 13）
          // 设置初始数据：{section: 'zombie', row: 1, col: 1},
        ]
      },
      zombies_idx: 0,                            // 随机生成僵尸 idx
      zombies_row: 0,                            // 随机生成僵尸的行坐标
      zombies_iMax: 70,                          // 随机生成僵尸数量上限（学习层拉长单局：50→70）
      sunTimer: null,                            // 全局定时器，用于控制全局定时生成阳光
      sunTimer_difference: 20,                   // 定时生成阳光时间差值（单位：秒）
      zombieTimer: null,                         // 全局定时器，用于控制全局定时生成僵尸
      zombieTimer_difference: 13,                // 定时生成僵尸时间差值（单位：秒，学习层拉长单局：12→13）
      game: null,                                // 游戏引擎对象
      fps: 60,
    }
    Object.assign(this, m)
  }
  // 设置随机生成僵尸信息
  setZombiesInfo () {
    let self = this,
        iMax = self.zombies_iMax
    for (let i = 0; i < iMax; i++) {
      let row = Math.ceil(Math.random() * 4 + 1)
      self.zombies_info.position.push({
        section: 'zombie',
        row: row,
        col: 11 + Number(Math.random().toFixed(1))
      })
    }
  }
  // 清除全局定时器
  clearTiemr () {
    let self = this
    // 清除全局阳光生成定时器
    clearInterval(self.sunTimer)
    // 清除全局僵尸生成定时器
    clearInterval(self.zombieTimer)
    // v7：清除波次预告的延迟激活定时器（startLevel 重建时会清掉）
    if (self._waveTimer) {
      clearTimeout(self._waveTimer)
      self._waveTimer = null
    }
    // v9：重置出场节奏段位（下次 setTimer 从第一档开始）
    self._paceTier = undefined
    // v15：重置波首横幅防重入标志（startLevel 重建不残留）
    self._waveBannerShown = false
    // 清除向日葵的阳光生成定时器
    for (let plant of self.plants) {
      if (plant.section === 'sunflower') {
        plant.clearSunTimer()
      }
    }
  }
  // 设置全局阳光、僵尸生成定时器
  setTimer () {
    let self = this,
        zombies = self.zombies
    // 设置全局阳光定时器
    self.sunTimer = setInterval(function () {
      // 生成全局阳光动画
      let left = parseInt(window.getComputedStyle(document.getElementsByClassName('systemSun')[0],null).left), // 获取当前元素left值
          top = '-100px',
          keyframes1 = [
            { transform: 'translate(0,0)', opacity: 0 },
            { offset: .5,transform: 'translate(0,300px)', opacity: 1 },
            { offset: .75,transform: 'translate(0,300px)', opacity: 1 },
            { offset: 1,transform: 'translate(-'+ (left - 110) +'px,50px)',opacity: 0 }
          ]
      document.getElementsByClassName('systemSun')[0].animate(keyframes1,keyframesOptions)
      setTimeout(function () {
        // 增加阳光数量
        self.sunnum.changeSunNum()
        // 重新设置系统阳光定位
        document.getElementsByClassName('systemSun')[0].style.left = Math.floor(Math.random() * 200 + 300) + 'px'
        document.getElementsByClassName('systemSun')[0].style.top = '-100px'
      }, 2700)
    }, 1000 * self.sunTimer_difference)
    // 设置生成僵尸定时器（v9：tick 递归 + 段位加速——僵尸进度越过 1/3、2/3 段后自动加密出场节奏）
    const tickZombie = function () {
      if (self.zombies_idx === self.zombies_iMax) { // 僵尸生成数量达到最大值，清除定时器
        return clearInterval(self.zombieTimer)
      }
      // v7 波次预告：每 waveSize 只一波，波首先出"下一波来袭"横幅，延迟 4s 再激活
      const ws = window.wordStudy
      const waveSize = (ws && ws.config && ws.config.waveSize) || 8
      const spawnOne = function () {
        if (self.zombies_idx >= self.zombies_iMax) return
        const idx = self.zombies_iMax - self.zombies_idx - 1
        if (self.zombies[idx]) {
          self.zombies[idx].state = self.zombies[idx].state_RUN // 僵尸开始移动
        }
        self.zombies_idx++
      }
      if (self.zombies_idx % waveSize === 0) {
        // v15：横幅已显示且延迟激活未执行（4s 窗口内再次命中波首）→ 静默等待，不重复弹横幅、不重置定时器
        // 根因：段位加速后 tick 间隔可压到 4s（封底），与波首 4s 延迟激活竞争——旧实现每次都重弹横幅并
        // clearTimeout 取消延迟激活，僵尸卡死不激活、横幅无限闪现（用户实测"一直提示第 6 波来袭"）
        if (self._waveBannerShown) return
        self._waveBannerShown = true
        // 本波首只：先亮预告横幅（第几波 / 共几波 / 本波几只 / 本波血与速），再放僵尸
        const waveIndex = Math.floor(self.zombies_idx / waveSize) + 1
        const totalWaves = Math.ceil(self.zombies_iMax / waveSize)
        const count = Math.min(waveSize, self.zombies_iMax - waveSize * (waveIndex - 1))
        let blood = 0, speed = 1
        // v16fix：wi 必须声明在 if 外（v16 曾用块级 const wi 并在块外引用 wi.type → ReferenceError
        // → 波首 tick 抛错中断、setTimeout 不设置、banner 置位后被 L149 永久拦截 → 僵尸卡死不激活，用户实测"不答题没僵尸"）
        let wi = null
        if (ws && ws.waveInfo) {
          // v10：传本波首只 order（= zombies_idx）→ 横幅血量与段位跳档精确一致
          wi = ws.waveInfo(waveIndex, self.zombies_idx)
          blood = wi.blood
          speed = wi.speed
        }
        if (window.answerUI && window.answerUI.showWaveBanner) {
          // v16：横幅带本波最强者类型（boss/cone/bucket），Boss 波有专属提示文案
          window.answerUI.showWaveBanner(waveIndex, totalWaves, count, blood, speed, (wi && wi.type) || 'normal')
        }
        if (self._waveTimer) clearTimeout(self._waveTimer)
        self._waveTimer = setTimeout(function () {
          self._waveBannerShown = false   // v15：激活后清除标志，允许下一波正常预告
          spawnOne()
        }, 4000)
        return
      }
      spawnOne()
      // v9 段位加速：越过段位 → 重建定时器（节奏越打越密，后期僵尸压力拉满）
      if (self.zombies_iMax > 0) {
        const progress = self.zombies_idx / self.zombies_iMax
        const tier = progress < 1 / 3 ? 0 : (progress < 2 / 3 ? 1 : 2)
        if (tier !== self._paceTier) {
          self._paceTier = tier
          const newInterval = Math.max(4, self.zombieTimer_difference - [0, 2, 3.5][tier])
          clearInterval(self.zombieTimer)
          self.zombieTimer = setInterval(tickZombie, 1000 * newInterval)
        }
      }
    }
    self.zombieTimer = setInterval(tickZombie, 1000 * self.zombieTimer_difference)
  }
  // 创建除草车对象初始化数组
  setCars (cars_info) {
    let self = this
    for (let car of cars_info.position) {
      let info = {
        x: cars_info.x,
        y: cars_info.y + 100 * (car.row - 1),
        row: car.row,
      }
      self.cars.push(Car.new(info))
    }
  }
  // 创建卡片对象初始化数组
  setCards (cards_info) {
    let self = this
    for (let card of cards_info.position) {
      /**
       * 卡片初始化信息
       * name: 卡片名称
       * row: 卡片行坐标
       * sun_val: 阳光消耗数量
       * timer_spacing: 卡片冷却时间
       * y: y 轴坐标
       */
      let info = {
        name: card.name,
        row: card.row,
        sun_val: card.sun_val,
        timer_spacing: card.timer_spacing,
        y: cards_info.y + 60 * (card.row - 1),
      }
      self.cards.push(Card.new(info))
    }
  }
  // 创建初始信息包含角色
  setRoles (roles_info) {
    let self = this,
        type = roles_info.type
    // 根据坐标创建对应角色坐标数组
    for (let role of roles_info.position) {
      /**
       * 角色初始化信息
       * type: 角色类型
       * x: x 轴坐标
       * y: y 轴坐标
       * col: 列坐标
       * row: 行坐标
       */
      let info = {
        type: roles_info.type,
        section: role.section,
        x: roles_info.x + 80 * (role.col - 1),
        y: roles_info.y + 100 * (role.row - 1),
        col: role.col,
        row: role.row,
      }
      // 由角色坐标数组创建对应角色
      if (type === 'plant') {
        self.plants.push(Plant.new(info))
      } else if (type === 'zombie') {
        self.zombies.push(Zombie.new(info))
      }
    }

  }
  // 游戏启动程序
  start () {
    let self = this
    // 创建 loading 对象，绘制 loading 画面
    self.loading = Animation.new({type: 'loading'}, 'write', 55)
    // 创建 阳光 实例对象
    self.sunnum = SunNum.new()
    // 生成僵尸数组信息
    self.setZombiesInfo()
    // 创建 除草车 实例对象数组，可清除一整行僵尸
    self.setCars(self.cars_info)
    // 创建 卡片 实例对象数组，左上角可放置植物卡片
    self.setCards(self.cards_info)
    // 创建 植物 实例对象数组，绘制植物
    self.setRoles(self.plants_info)
    // 创建 僵尸 实例对象数组，绘制僵尸
    self.setRoles(self.zombies_info)
    // 创建游戏引擎类
    self.game = Game.new()
  }
}
window._main = new Main()
window._main.start()