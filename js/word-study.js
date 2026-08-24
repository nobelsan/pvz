/* word-study.js — 学习层核心（GDD-03 §三）
** 职责：词库加载 / 简化 FSRS 调度 / 错题权重 / localStorage 持久化 / 出题与奖励回调
** 依赖：window.WORD_BANK（data/*.js 注册的词库）、window.answerUI（可选，无 UI 时 console 输出）
** 设计原则：纯逻辑部分不依赖 DOM；答题与游戏层解耦（游戏继续运行，仅答题是额外动作）
*/
(function () {
  'use strict'

  const LS_KEY = 'pvz-ws-state-v1'
  const LS_MODE_KEY = 'pvz-ws-mode-v1'          // 难度模式（答题题型）持久化 key
  const LS_DIFF_KEY = 'pvz-ws-diff-v1'          // 游戏难度档位持久化 key
  const LS_ENDLESS_KEY = 'pvz-ws-endless-v1'    // v16：无尽模式开关持久化 key
  const LS_BEST_KEY = 'pvz-ws-best-level-v1'    // v16：最高关卡记录持久化 key
  const LS_CUSTOM_KEY = 'pvz-ws-custom-v1'      // v34：用户导入的自定义单词持久化 key（换浏览器失效）
  const DAY = 86400000

  // 游戏难度档位（关卡系统 v4）：每关僵尸数 / 出场间隔 / 基础血量 / 血量升档步长 / 血量封顶 / 速度系数
  // 关卡递进：每关 +10 只（封顶 110）、间隔 -1s（封底 7s）、基础血 +2（封顶 lifeMax-5）
  const DIFF_CFG = {
    // v10 血量全面上调：normal 第 1 关僵尸 20 血（原 10）——击杀 1 只需 ~6 棵豌豆，
    // 答题扩军成为刚需；lifeMax 30→80（配合波次 +4/波 × 段位跳档，后期顶格血）
    easy:   { label: '简单', zombies: 45, interval: 10, baseLife: 12, lifeStep: 6,  lifeMax: 50, speed: 0.85 },
    normal: { label: '普通', zombies: 60, interval: 8,  baseLife: 20, lifeStep: 6,  lifeMax: 80, speed: 1 },
    hard:   { label: '困难', zombies: 75, interval: 6,  baseLife: 26, lifeStep: 4,  lifeMax: 120, speed: 1.15 },
  }

  const DEFAULT_CONFIG = {
    unitFiles: ['words-3B-all'],                // 当前册词库（按 window.WORD_BANK 的 key）：三下全册单词表（去短语，仅单词）
    mode: 'spell',                              // 答题难度模式：'spell' 拼词模式（默认）| 'easy' 简单模式
    difficulty: 'normal',                       // 游戏难度档位：'easy' | 'normal' | 'hard'（关卡系统，持久化）
    newWordsPerGame: 5,                         // （v27 起废弃硬限流，保留字段兼容外部配置）原意"新词 ≤5/局"，已与 FSRS 调度冲突，见 pickWord ③ 注释
    firstAskDelay: 8,                           // 开局首题延迟（秒，缩短等待）
    askInterval: [12, 18],                      // 两次出题间隔 12-18s（原 30-45s，太拖）
    skipRetry: [20, 40],                        // 跳过词 20-40s 内复现
    stubbornThreshold: 3,                       // 顽固词 = 错误 ≥3
    fsrsIntervalDays: [1, 2, 4, 7, 14],         // 低龄封顶版 FSRS
    // 拼写题型权重（仅拼词模式用）：听音拼写 35% / 看图拼写 30% / 选意拼写 25% / 综合拼写 10%
    typeWeights: { listen: 0.35, picture: 0.3, cn2en: 0.25, spell: 0.1 },
    hardMode: false,                            // 进阶开关：阳光上限锁死（默认关）
    sunCap: 200,                                // hardMode 用
    startingSun: 100,                           // v9：开局初始阳光（原 200，收紧后开局只能 1 棵豌豆）
    waveSize: 6,                                // v10：每 6 只一波（原 8）——大波题更早触发，答题救场循环更快建立
    zombieLifeBoost: true,                      // 后期僵尸增强：越晚出场血越厚（拉长单局）
    comboBonusSun: 50,                          // 连击 ≥3 额外阳光
    endless: false,                             // v16：无尽模式（默认关）——关卡递进去掉封顶，僵尸无限变强
    // v17：收集动机——皮肤解锁阈值（答对词数）。星光 10 词 → 植物头顶金⭐；皇冠 25 词 → 金色皇冠（纯视觉零资源）
    // rationale：低龄孩子"答对 = 集卡 = 换皮肤"的动机链（原版收集欲），阈值定低（10/25）保证 1-2 局内可见正反馈
    skinStarAt: 10,
    skinCrownAt: 25,
  }

  function rand (a, b) { return a + Math.random() * (b - a) }
  function randInt (a, b) { return Math.floor(rand(a, b + 1)) }
  function shuffle (arr) {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = a[i]; a[i] = a[j]; a[j] = t
    }
    return a
  }

  const wordStudy = {
    config: Object.assign({}, DEFAULT_CONFIG),
    words: [],                 // 词库数组
    state: {},                 // 记忆状态 map wordId -> {s,last,next,right,wrong,skipCount}
    grantCallback: null,       // 答对普通题 → 阳光 + buff（游戏侧注入）
    bigWaveCallback: null,     // 答对大波题 → 全场减速 10s（v12 起不再清屏，游戏侧注入）
    onModeChange: null,        // 答题难度模式切换回调（UI 同步按钮显示）
    onLevelChange: null,       // 关卡开始回调（UI 更新关卡徽章）
    onDifficultyChange: null,  // 游戏难度档位切换回调（UI 同步按钮显示）
    onEndlessChange: null,     // v16：无尽模式切换回调（UI 同步按钮显示）

    // 运行时状态
    level: 1,                  // 当前关卡（无尽递进）
    bestLevel: 0,              // v16：历史最高关卡（localStorage 持久化）
    _levelClearing: false,     // 清场 → 下一关的过渡标志（防重复触发）
    _timer: null,
    _nextAskAt: 0,             // 下次普通出题时间戳
    _newWordsUsed: 0,          // 本局已上新词数（v27 起仅作统计，不再作为出题上限）
    _skipQueue: [],            // 跳过复现队列 [{wordId, at}]
    _pendingWave: false,       // 场上僵尸攒够后待触发的大波（答题中 → 答完补）
    _waveCooldownAt: 0,        // 大波题冷却时间戳（触发后 20s 内不重复弹）
    _asking: false,            // 是否正在答题（防重入）
    _sunWrapped: false,        // hardMode 阳光包装是否已生效
    _combo: 0,                 // 连击数：答对 +1，答错清零（跳过不清）
    _breachShown: false,       // v9：防线失守卡片是否已弹出（幂等）
    retrain: null,             // 重练模式 {ids: [], done: {}}
    _skinCache: null,          // v17：当前皮肤缓存（scene.js 每帧查询，submit 后失效）

    // ================= 生命周期 =================
    init (cfg) {
      this.config = Object.assign({}, DEFAULT_CONFIG, cfg || {})
      // 恢复持久化的答题难度模式（默认拼词模式）与游戏难度档位（默认普通）
      try {
        const m = localStorage.getItem(LS_MODE_KEY)
        if (m === 'easy' || m === 'spell') this.config.mode = m
        const d = localStorage.getItem(LS_DIFF_KEY)
        if (DIFF_CFG[d]) this.config.difficulty = d
        // v16：无尽模式开关 + 最高关卡记录
        this.config.endless = localStorage.getItem(LS_ENDLESS_KEY) === '1'
        this.bestLevel = parseInt(localStorage.getItem(LS_BEST_KEY) || '0', 10) || 0
      } catch (e) {}
      this._mergeCustomWords()   // v34：合并用户导入的自定义单词（在 loadWords 之前）
      this.loadWords()
      this.load()
      this._nextAskAt = Date.now() + (this.config.firstAskDelay || 8) * 1000
      this._pendingWave = false
      this._newWordsUsed = 0
      this._combo = 0
      this.level = 1
      this.startScheduler()
      if (this.config.hardMode) this._wrapSunCap()
      this.startLevel(1)   // 应用第一关数值并重建僵尸（含增强与速度因子）
      console.log('[word-study] init ok · words:', this.words.length, '· mode:', this.config.mode, '· difficulty:', this.config.difficulty)
    },
    loadWords () {
      this.words = []
      ;(this.config.unitFiles || []).forEach(function (f) {
        const bank = window.WORD_BANK && window.WORD_BANK[f]
        if (bank && bank.length) { wordStudy.words = wordStudy.words.concat(bank) }
        else { console.warn('[word-study] 未找到词库：', f) }
      })
    },
    // ================= v34：导入单词 / 重置游戏 =================
    // 合并持久化的自定义单词进激活词库（word 去重，大小写不敏感）。在 loadWords 前调用
    _mergeCustomWords () {
      try {
        const raw = localStorage.getItem(LS_CUSTOM_KEY)
        if (!raw) return
        const list = JSON.parse(raw)
        if (!Array.isArray(list) || !list.length) return
        const bank = window.WORD_BANK && window.WORD_BANK['words-3B-all']
        if (!bank) return
        const seen = {}
        bank.forEach(w => { seen[String(w.word).toLowerCase()] = true })
        let added = 0
        list.forEach(function (c) {
          if (!c || !c.word) return
          const word = String(c.word).trim().toLowerCase()
          if (!word || seen[word]) return
          seen[word] = true
          bank.push({
            id: 'custom-' + (c.id || ('m' + (1000 + added))),
            unit: 1, word: word, phonetic: '', meaning: c.meaning || '',
            pos: c.pos || '', emoji: c.emoji || '', img: '', audio: '',
            diff: typeof c.diff === 'number' ? c.diff : (word.length <= 3 ? 0 : word.length <= 5 ? 1 : word.length <= 7 ? 2 : 3),
            spellable: word.length < 9,
            tags: ['custom'],
          })
          added++
        })
        if (added) console.log('[word-study] 合并自定义单词', added, '个')
      } catch (e) { console.warn('[word-study] 自定义单词加载失败', e) }
    },
    // 导入单词：list = [{word, meaning}]。合并进激活词库并持久化，返回新增条数
    importWords (list) {
      if (!list || !list.length) return 0
      const bank = window.WORD_BANK && window.WORD_BANK['words-3B-all']
      if (!bank) return 0
      const seen = {}
      bank.forEach(w => { seen[String(w.word).toLowerCase()] = true })
      let added = 0
      const saved = []
      const now = Date.now().toString(36)
      list.forEach(function (c) {
        if (!c || !c.word) return
        const word = String(c.word).trim().toLowerCase()
        if (!word || seen[word]) return
        seen[word] = true
        const item = {
          id: 'custom-' + now + '-' + added,
          unit: 1, word: word, phonetic: '', meaning: c.meaning || '',
          pos: c.pos || '', emoji: '', img: '', audio: '',
          diff: word.length <= 3 ? 0 : word.length <= 5 ? 1 : word.length <= 7 ? 2 : 3,
          spellable: word.length < 9,
          tags: ['custom'],
        }
        bank.push(item)
        saved.push(item)
        added++
      })
      if (added) {
        try {
          const prev = JSON.parse(localStorage.getItem(LS_CUSTOM_KEY) || '[]')
          localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(prev.concat(saved)))
        } catch (e) { console.warn('[word-study] 自定义单词保存失败', e) }
        this.loadWords()
        console.log('[word-study] 导入自定义单词', added, '个，词库共', this.words.length, '词')
      }
      return added
    },
    // v34：重置游戏（注意不能叫 resetAll——word-study.js 已有同名方法会被对象字面量覆盖）——清空全部本地学习数据后刷新页面
    resetGame () {
      try {
        ;[LS_KEY, LS_MODE_KEY, LS_DIFF_KEY, LS_ENDLESS_KEY, LS_BEST_KEY, LS_CUSTOM_KEY].forEach(function (k) {
          localStorage.removeItem(k)
        })
      } catch (e) {}
      this.state = {}
      this.bestLevel = 0
      this.retrain = null
      this.config.mode = DEFAULT_CONFIG.mode
      this.config.difficulty = DEFAULT_CONFIG.difficulty
      this.config.endless = false
      location.reload()
    },
    startScheduler () {
      if (this._timer) clearInterval(this._timer)
      this._timer = setInterval(function () { wordStudy.tick() }, 1000)
    },
    stopScheduler () {
      if (this._timer) { clearInterval(this._timer); this._timer = null }
    },

    // ================= 出题调度（每秒 tick）=================
    tick () {
      const m = window._main
      if (!m || !m.game) return
      if (this._checkBreach()) return            // ① 防线失守（僵尸进房子，优先于一切）
      if (m.game.state !== m.game.state_RUNNING) return
      if (this._checkWave()) return            // ② 大波优先（含 pending 补触发）
      if (this._checkSkipQueue(Date.now())) return  // ③ 跳过词复现
      if (!this._asking && Date.now() >= this._nextAskAt) {  // ④ 普通出题
        const w = this.pickWord({})
        if (w) this._ask(w, { wave: false })
      }
    },
    // v9 防线失守：僵尸进房子（game.state === state_ZOMBIEWON）→ 弹失败卡片，只弹一次
    _checkBreach () {
      const m = window._main
      if (!m || !m.game) return false
      if (m.game.state !== m.game.state_ZOMBIEWON) return false
      if (this._breachShown) return true
      this._breachShown = true
      if (window.answerUI && window.answerUI.showLevelFail) window.answerUI.showLevelFail(this.level)
      return true
    },
    // v9 重打当前关：清植物/僵尸/除草车 → 阳光回初始 → 恢复运行态 → 本关重建（学习进度保留，零惩罚）
    retryLevel () {
      const m = window._main
      if (!m || !m.game) return
      m.plants.length = 0
      m.zombies.length = 0
      m.zombies_info.position.length = 0
      m.zombies_idx = 0
      m.cars.length = 0
      if (m.setCars) m.setCars(m.cars_info)      // 除草车复位（每行 1 辆）
      m.allSunVal = this.config.startingSun
      if (m.sunnum) m.sunnum.sun_num = m.allSunVal
      m.game.state = m.game.state_RUNNING
      this._breachShown = false
      this._combo = 0
      this._asking = false
      this._pendingWave = false
      this._waveCooldownAt = 0
      this.startLevel(this.level)
      if (window.answerUI && window.answerUI.hideFail) window.answerUI.hideFail()
      console.log('[word-study] 第', this.level, '关重打（防线失守）')
    },
    // 大波检测（v8 重写：按"场上活跃僵尸数"触发——已激活且未死亡 ≥ waveSize 才是真"救场"。
    // 历史：v2-v7 按激活计数每 8 只固定触发 + 全屏清场（emergencyClear）会把未出场的僵尸也炸掉，
    // 导致关卡被大波题提前清空结束；v8 起只按场上活跃计数，v12 起大波题答对改为全场减速（清屏已删除）。
    // 答题中过阈值 → pending 延迟补触发，防普通题插队；
    // 大波冷却：触发后 20s 内不重复弹（答错/跳过时僵尸还在场上，避免连环强制答题））
    _checkWave () {
      const m = window._main
      if (!m || !m.zombies) return false
      if (this._waveCooldownAt && Date.now() < this._waveCooldownAt) return false
      let active = 0
      m.zombies.forEach(function (z) {
        if (!z.isDel && z.state === z.state_RUN && z.life > 0) active++
      })
      if (active >= this.config.waveSize) this._pendingWave = true
      if (!this._pendingWave) return false
      if (this._asking) return true            // 正在答题，暂缓（本 tick 不出普通题）
      this._pendingWave = false
      this._waveCooldownAt = Date.now() + 20000   // 大波题冷却 20s
      const w = this.pickWord({ reviewOnly: true }) || this.pickWord({})
      if (w) this._ask(w, { wave: true })
      return true
    },
    _checkSkipQueue (now) {
      if (!this._skipQueue.length) return false
      const q = this._skipQueue[0]
      if (now < q.at) return false
      this._skipQueue.shift()
      if (this._asking) return true
      const w = this._byId(q.wordId)
      if (w) this._ask(w, { wave: false, skipRetry: true })
      return true
    },
    _ask (w, meta) {
      const q = this.buildQuestion(w, meta.wave)
      this._asking = true
      if (window.answerUI && window.answerUI.show) {
        window.answerUI.show(q, meta)
      } else {
        // 无 UI（node 测试 / 降级环境）：自动判对走通流程
        console.log('[word-study] 出题：', q.type, q.word.word, '选项：', q.options.map(function (o) { return o.word }))
        this.submit(w.id, Math.random() < 0.8, meta)
      }
    },

    // ================= 选词与题型 =================
    pickWord (opts) {
      opts = opts || {}
      const now = Date.now()
      // 重练模式：只出未完成词
      if (this.retrain) {
        const left = this.retrain.ids.filter(id => !this.retrain.done[id])
        if (!left.length) return null
        return this._byId(left[randInt(0, left.length - 1)])
      }
      // ① 到期的顽固词（wrong ≥ 3）
      const dueStubborn = this.words.filter(x => this.isStubborn(x.id) && (this.state[x.id].next || 0) <= now)
      if (dueStubborn.length) return this._pickWeighted(dueStubborn)
      // ② 到期的复习词
      const dueReview = this.words.filter(x => this.state[x.id] && !this.isStubborn(x.id) && (this.state[x.id].next || 0) <= now)
      if (dueReview.length) return this._pickWeighted(dueReview)
      // ③ 新词（大波/救场题只复习不学新词）
      // v27fix：取消"每局 ≤newWordsPerGame"硬限流。单局内已学词答对后 next 均为未来（1-14 天），
      // ① ② 永远不会命中；若 ③ 再被 5 个限流卡死，出题源立即落到 ④ 已学词随机——
      // 整局反复打同一批 5 个词、永不见新词（用户实测）。FSRS 复习由跨局 next 到期保证（GDD-03 §3.3）。
      // 现在只要还有未学词就持续上新，学完整本词库才回落 ④ 随机复习。
      if (!opts.reviewOnly) {
        const unseen = this.words.filter(x => !this.state[x.id]).sort((a, b) => a.diff - b.diff)
        if (unseen.length) { this._newWordsUsed++; return unseen[0] }
      }
      // ④ 兜底：已学词随机 / 任意词
      const learned = this.words.filter(x => this.state[x.id])
      if (learned.length) return learned[randInt(0, learned.length - 1)]
      if (this.words.length) return this.words[randInt(0, this.words.length - 1)]
      return null
    },
    _pickWeighted (list) {
      // 简单加权：错误越多的词越优先（权重 = 1 + wrong）
      let total = 0
      const ws = list.map(x => { const w = 1 + (this.state[x.id].wrong || 0); total += w; return { x, w } })
      let r = Math.random() * total
      for (const it of ws) { r -= it.w; if (r <= 0) return it.x }
      return ws[ws.length - 1].x
    },
    // 难度模式切换（持久化 + 通知 UI）
    setMode (mode) {
      const next = mode === 'easy' ? 'easy' : 'spell'
      this.config.mode = next
      try { localStorage.setItem(LS_MODE_KEY, next) } catch (e) { console.warn('[word-study] 模式保存失败', e) }
      if (this.onModeChange) this.onModeChange(next)
      console.log('[word-study] 难度模式：', next === 'easy' ? '简单（听音/选意选择题）' : '拼词（全部拼写才算对）')
      return next
    },
    pickType (w) {
      // 难度模式：
      // - spell 拼词模式（默认）：所有词一律拼写题（听音拼写/看图拼写/选意拼写/综合拼写），
      //   拼正确才算对——不做再认缓冲，新词、超长词（spellable:false）也直接拼
      // - easy 简单模式：只出选择题（听音选词 50% / 选意选词 50%），答对即算
      const r = Math.random()
      if (this.config.mode === 'easy') {
        return r < 0.5 ? 'listen' : 'cn2en'
      }
      const wt = this.config.typeWeights
      if (r < wt.listen) return 'listen'
      if (r < wt.listen + wt.picture) return 'picture'
      if (r < wt.listen + wt.picture + wt.cn2en) return 'cn2en'
      return 'spell'
    },
    buildQuestion (w, wave) {
      return { word: w, type: this.pickType(w), options: this.genOptions(w), wave: !!wave }
    },
    genOptions (w) {
      // 正确 1 + 干扰 3（同单元、diff 相近、音形相近优先）
      const others = this.words.filter(x => x.id !== w.id)
      let cand = others.filter(x => x.unit === w.unit && Math.abs(x.diff - w.diff) <= 1)
      if (cand.length < 3) cand = others.filter(x => x.unit === w.unit)
      if (cand.length < 3) cand = others
      cand = cand.slice().sort((a, b) => this._sim(b, w) - this._sim(a, w))
      return shuffle([w].concat(shuffle(cand).slice(0, 3)))
    },
    _sim (a, b) {
      // 音形相似度：首字母 / diff 同级 / 音标首字符
      let s = 0
      if (a.word[0] === b.word[0]) s += 2
      if (a.diff === b.diff) s += 1
      if ((a.phonetic || '')[0] === (b.phonetic || '')[0]) s += 1
      return s
    },

    // ================= 作答 =================
    submit (wordId, ok, meta) {
      meta = meta || {}
      const st = this._st(wordId)
      const now = Date.now()
      st.last = now
      if (ok) {
        st.right = (st.right || 0) + 1
        st.s = Math.min((st.s || 0) + 1, 5)
        st.next = now + (this.config.fsrsIntervalDays[st.s - 1] || 14) * DAY
        if (this.retrain) this.retrain.done[wordId] = true
        this._combo++
      } else {
        st.wrong = (st.wrong || 0) + 1
        st.next = now + DAY                      // 1 天后复习；s 不降级（低龄零挫败，P3）
        this._combo = 0                          // 连击中断
      }
      this._asking = false
      if (ok) {
        this._invalidateSkin()                   // v17：答对点亮新词 → 皮肤缓存失效
        if (meta.wave) {
          if (this.bigWaveCallback) this.bigWaveCallback()   // 大波题：全场减速（救场，v12）
          if (this.grantCallback) this.grantCallback(this._combo)  // v24fix：大波题也送阳光，保持"答对就送"动机链
        } else if (this.grantCallback) this.grantCallback(this._combo)
      }
      this._nextAskAt = now + rand(this.config.askInterval[0], this.config.askInterval[1]) * 1000
      this.save()
      this._checkWave()
      // 重练完成检测
      if (this.retrain && this.retrain.ids.every(id => this.retrain.done[id])) {
        const n = this.retrain.ids.length
        this.retrain = null
        if (window.errorBook && window.errorBook.onRetrainDone) window.errorBook.onRetrainDone(n)
      }
    },
    skip (wordId, meta) {
      meta = meta || {}
      const st = this._st(wordId)
      st.skipCount = (st.skipCount || 0) + 1
      this._asking = false
      this.save()
      if (meta.wave) {
        // 大波跳过：放弃救场，正常推进（P5 语义：跳过=放弃，无惩罚不复现）
      } else {
        const t = Date.now() + rand(this.config.skipRetry[0], this.config.skipRetry[1]) * 1000
        this._skipQueue.push({ wordId, at: t })
      }
      this._nextAskAt = Date.now() + rand(this.config.askInterval[0], this.config.askInterval[1]) * 1000
      this._checkWave()
    },

    // ================= 状态与持久化 =================
    _st (id) {
      if (!this.state[id]) this.state[id] = { s: 0, last: 0, next: 0, right: 0, wrong: 0, skipCount: 0 }
      return this.state[id]
    },
    _byId (id) {
      for (const w of this.words) { if (w.id === id) return w }
      return null
    },
    isStubborn (id) {
      const st = this.state[id]
      return !!(st && (st.wrong || 0) >= this.config.stubbornThreshold)
    },
    wrongWords () {
      // 错题本数据：wrong ≥ 1 的词（带状态）
      const out = []
      for (const id in this.state) {
        const st = this.state[id]
        if ((st.wrong || 0) >= 1) {
          const w = this._byId(id)
          if (w) out.push({ word: w, state: st })
        }
      }
      out.sort((a, b) => (b.state.wrong || 0) - (a.state.wrong || 0))
      return out
    },
    startRetrain (ids) {
      this.retrain = { ids: ids.slice(), done: {} }
      this._nextAskAt = 0                        // 下一 tick 立即出题
    },
    stopRetrain () { this.retrain = null },
    clearWrongCounts () {
      // 错题本"清空"：只清 wrong 计数，保留熟练度与下次复习安排
      for (const id in this.state) {
        this.state[id].wrong = 0
      }
      this.save()
    },
    save () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)) } catch (e) { console.warn('[word-study] 保存失败', e) }
    },
    load () {
      try {
        const raw = localStorage.getItem(LS_KEY)
        this.state = raw ? JSON.parse(raw) : {}
      } catch (e) { this.state = {} }
    },
    resetAll () {
      this.state = {}
      this._newWordsUsed = 0
      this._skipQueue = []
      this._invalidateSkin()                     // v17：重置后皮肤缓存失效
      this.save()
    },

    // ================= v17：单词图鉴 + 皮肤奖励（收集动机，纯逻辑可测）=================
    // 已点亮 = 答对过（right ≥ 1）；单元集齐 = 该 unit 全部词点亮 → 徽章
    // 皮肤 = 累计点亮词数达阈值（star 10 / crown 25），纯视觉叠加（scene.js Plant.draw）
    collectedCount () {
      let n = 0
      for (const w of this.words) {
        const st = this.state[w.id]
        if (st && (st.right || 0) >= 1) n++
      }
      return n
    },
    unitProgress () {
      // 按 unit 分组：{ unit: { total, collected, done } }
      const out = {}
      for (const w of this.words) {
        const u = w.unit || 1
        if (!out[u]) out[u] = { unit: u, total: 0, collected: 0, done: false }
        out[u].total++
        const st = this.state[w.id]
        if (st && (st.right || 0) >= 1) out[u].collected++
      }
      Object.keys(out).forEach(function (k) {
        out[k].done = out[k].collected >= out[k].total
      })
      return out
    },
    // 当前皮肤：star（星光，点亮 ≥10）→ crown（皇冠，点亮 ≥25）；返回最高档
    // 带缓存：scene.js Plant.draw 每帧对每棵植物查询，避免每帧遍历词库
    currentSkin () {
      if (this._skinCache) return this._skinCache
      const n = this.collectedCount()
      this._skinCache = n >= this.config.skinCrownAt ? 'crown' : (n >= this.config.skinStarAt ? 'star' : 'none')
      return this._skinCache
    },
    _invalidateSkin () { this._skinCache = null },
    // 皮肤进度：{ star: {cur, at}, crown: {cur, at} }（HUD 进度条用）
    skinProgress () {
      const n = this.collectedCount()
      return {
        star: { cur: Math.min(n, this.config.skinStarAt), at: this.config.skinStarAt },
        crown: { cur: Math.min(n, this.config.skinCrownAt), at: this.config.skinCrownAt },
      }
    },

    // ================= hardMode：阳光上限锁死（进阶开关，默认关）=================
    _wrapSunCap () {
      const m = window._main
      if (!m || !m.sunnum || this._sunWrapped) return
      this._sunWrapped = true
      const cap = this.config.sunCap
      m.sunnum.changeSunNum = function (num = 25) {
        // 截断到 [0, sunCap]：收入到顶即锁死，扣减不受影响；同步显示值（SunNum.draw 读 sun_num）
        m.allSunVal = Math.max(0, Math.min((m.allSunVal || 0) + num, cap))
        m.sunnum.sun_num = m.allSunVal
      }
      console.log('[word-study] hardMode 已开启：阳光上限锁死', cap)
    },

    // v16：精英/Boss 类型判定（确定性规则，波次可预测、低龄可学习、测试可断言）
    //  - 每 10 波（waveIndex % 10 === 0）的波首（波内第 1 只）→ boss：血 ×3、速 ×0.6、体型 ×1.3（scene.js 绘制）
    //  - 第 3 波起，波内第 3 只 → cone 路障：血 ×2、速 ×0.95
    //  - 第 6 波起，波内第 5 只 → bucket 铁桶：血 ×3、速 ×0.85
    //  rationale：精英血厚但速度更慢 → 低龄孩子"看得见打得着"（用时间换输出窗口），
    //  同时答题 buff（攻速/减速）对精英收益更大 → 强化"答题 = 开挂"动机链；确定性规则避免随机性挫败感
    _zombieTypeOf (waveIndex, inWave) {
      if (waveIndex % 10 === 0 && inWave === 0) return { type: 'boss', lifeMulti: 3, speedMulti: 0.6 }
      if (waveIndex >= 6 && inWave === 4) return { type: 'bucket', lifeMulti: 3, speedMulti: 0.85 }
      if (waveIndex >= 3 && inWave === 2) return { type: 'cone', lifeMulti: 2, speedMulti: 0.95 }
      return { type: 'normal', lifeMulti: 1, speedMulti: 1 }
    },

    // ================= 后期僵尸增强 + 难度速度因子（关卡系统 v4 / v9 波次递增 / v10 段位跳档 / v16 精英Boss）=================
    _boostZombies () {
      if (!this.config.zombieLifeBoost) return
      const m = window._main
      if (!m || !m.zombies || !m.zombies.length) return
      const iMax = m.zombies_iMax || m.zombies.length
      const cfg = this.levelCfg()
      const d = DIFF_CFG[this.config.difficulty]
      const waveSize = this.config.waveSize || 6
      // v10 段位跳档（与 main.js 出场节奏段位同边界）：进度过 1/3 血 ×1.5、过 2/3 ×2
      const tierTwo = Math.ceil(iMax * 2 / 3)
      const tierOne = Math.ceil(iMax / 3)
      m.zombies.forEach((z, i) => {
        // 激活顺序是倒序（main.js：idx = iMax - zombies_idx - 1），数组尾部先出场
        // → order 越小越早出场。v10：每 waveSize 只一波，血 +2/波，再乘段位跳档（封顶 lifeMax）
        // 三档压力：前段 20-26（3-4 棵可守）/ 中段 ×1.5 39-45（火力不足→攒 6 只触发大波题）
        //           / 后段 ×2 64-76（种满也守不住 → 答题减速缓兵 + 扩军是唯一活路；v12 大波题不再清屏）
        const order = Math.max(0, iMax - 1 - i)
        const waveIndex = Math.floor(order / waveSize) + 1
        const inWave = order % waveSize
        const tier = order >= tierTwo ? 2 : (order >= tierOne ? 1.5 : 1)
        // v16：精英/Boss 在基础血之上乘倍率（可突破 lifeMax——精英就是"血厚"），速度乘倍率
        const zt = this._zombieTypeOf(waveIndex, inWave)
        z.zombieType = zt.type
        z._maxLife = Math.min(Math.ceil((cfg.baseLife + 2 * (waveIndex - 1)) * tier), d.lifeMax)
        z.life = z._maxLife * zt.lifeMulti
        // 速度复合因子 = 难度因子（easy 0.85 / hard 1.15）× 波次因子（每波 +12%，封顶 ×1.9）× 精英/Boss 倍率
        // 与减速 buff（__wsFactor）共用包裹层：getter = base × 减速因子 × 复合因子
        // v10：无条件包裹（含 factor=1 的波 1），保证所有僵尸吃同一套访问器
        const waveSpeed = Math.min(1 + 0.12 * (waveIndex - 1), 1.9)
        z.__wsDiffFactor = cfg.speed * waveSpeed * zt.speedMulti
        if (!z.__wsSpeedWrapped) {
          z.__wsSpeedWrapped = true
          // v12：base 回归 3（v10 误降 1.5）。真实位移 = speed/17 px/帧（scene.js Zombie.update `x -= speed/17`）
          //   → base 3 = 10.6px/s（横穿约 87s，原版手感）；base 1.5 = 5.3px/s（174s，僵尸慢到"看不见"，
          //     用户实测：横幅每波都弹但场上没有僵尸）。压力改由血量承担（v10 的 ×2 起步 + 段位跳档保留）
          let base = 3
          Object.defineProperty(z, 'speed', {
            configurable: true, enumerable: true,
            get: function () {
              // canMove=false（咬植物滞留）时，原版靠 Zombie.update 里 speed=0 生效；setter 被吞后这里兜底返回 0，防"边咬边走"
              if (this.canMove === false) return 0
              return base * (this.__wsFactor !== undefined ? this.__wsFactor : 1) * (this.__wsDiffFactor !== undefined ? this.__wsDiffFactor : 1)
            },
            set: function () {},
          })
        }
      })
      console.log('[word-study] 第', this.level, '关僵尸增强：life', cfg.baseLife, '起 · 每波+2 · 段位 ×1.5/×2 · 精英/Boss ×', '2/3/3 · 速度 ×', cfg.speed, '× 波次')
    },
    // v9/v10/v16：第 k 波僵尸强度信息（波次预告横幅用，与 _boostZombies 公式保持一致）
    waveInfo (waveIndex, order) {
      const cfg = this.levelCfg()
      const d = DIFF_CFG[this.config.difficulty]
      const k = Math.max(1, waveIndex | 0)
      const waveSize = this.config.waveSize || 6
      const iMax = (window._main && (window._main.zombies_iMax || 0)) || Math.ceil(waveSize * k)
      // 段位跳档与 _boostZombies 一致；order 缺省时取本波中间只近似（横幅/测试用）
      const o = order !== undefined ? order : Math.floor((k - 0.5) * waveSize)
      const tier = o >= Math.ceil(iMax * 2 / 3) ? 2 : (o >= Math.ceil(iMax / 3) ? 1.5 : 1)
      // v16：横幅带本波最强者信息（Boss 波首 / 精英），孩子提前知道"这波有硬骨头"
      const strongest = (k % 10 === 0) ? 'boss' : (k >= 6 ? 'bucket' : (k >= 3 ? 'cone' : 'normal'))
      return {
        blood: Math.min(Math.ceil((cfg.baseLife + 2 * (k - 1)) * tier), d.lifeMax),
        speed: Math.min(1 + 0.12 * (k - 1), 1.9),
        type: strongest,
      }
    },

    // ================= 关卡系统（v4：无尽递进关 + 难度档位）=================
    difficultyCfg () {
      return DIFF_CFG[this.config.difficulty] || DIFF_CFG.normal
    },
    // 当前关卡数值：每关 +10 只（封顶 110）、间隔 -1s（封底 7s）、基础血 +2（封顶 lifeMax-5）
    // v16 无尽模式：封顶全部移除——僵尸每关 +5 只（不封顶）、血 +2（不封顶）、间隔封底 4s
    //   rationale：封顶是"单关时长的软上限"（原版 110 只 ≈ 20min）；无尽模式牺牲单关时长换"无限变强"，
    //   与精英/Boss（血倍率）叠加后后期单只僵尸可达数百血，答题 buff 成为唯一活路（动机链闭环）
    levelCfg (n) {
      n = n || this.level || 1
      const d = this.difficultyCfg()
      if (this.config.endless) {
        return {
          zombies: d.zombies + (n - 1) * 5,
          interval: Math.max(d.interval - (n - 1), 4),
          baseLife: d.baseLife + (n - 1) * 2,
          lifeStep: d.lifeStep,
          speed: d.speed,
        }
      }
      return {
        zombies: Math.min(d.zombies + (n - 1) * 10, 110),
        interval: Math.max(d.interval - (n - 1), 4),
        baseLife: Math.min(d.baseLife + (n - 1) * 2, d.lifeMax - 5),
        lifeStep: d.lifeStep,
        speed: d.speed,
      }
    },
    // 切换游戏难度档位：持久化 + 按新难度重打当前关
    setDifficulty (d) {
      if (!DIFF_CFG[d]) return this.config.difficulty
      this.config.difficulty = d
      try { localStorage.setItem(LS_DIFF_KEY, d) } catch (e) { console.warn('[word-study] 难度保存失败', e) }
      this.startLevel(this.level || 1)
      if (this.onDifficultyChange) this.onDifficultyChange(d)
      console.log('[word-study] 游戏难度：', DIFF_CFG[d].label)
      return d
    },
    // v16：无尽模式开关——持久化 + 按新规则重打当前关（关卡递进去封顶，僵尸无限变强）
    setEndless (v) {
      this.config.endless = !!v
      try { localStorage.setItem(LS_ENDLESS_KEY, this.config.endless ? '1' : '0') } catch (e) { console.warn('[word-study] 无尽模式保存失败', e) }
      this.startLevel(this.level || 1)
      if (this.onEndlessChange) this.onEndlessChange(this.config.endless)
      console.log('[word-study] 无尽模式：', this.config.endless ? '开' : '关')
      return this.config.endless
    },
    // 开始第 n 关：应用关卡数值 → 清空并重建僵尸（植物与阳光保留 = 跨关建设）→ 重置学习层 → 重启定时器
    startLevel (n) {
      n = Math.max(1, n | 0)
      this.level = n
      const m = window._main
      if (!m) return
      const cfg = this.levelCfg()
      m.zombies_iMax = cfg.zombies
      m.zombieTimer_difference = cfg.interval
      // 重建僵尸：清空数组与生成信息 → 重新预生成 → 重新实例化
      m.clearTiemr()
      m.zombies.length = 0
      m.zombies_info.position.length = 0
      m.zombies_idx = 0
      m.setZombiesInfo()
      m.setRoles(m.zombies_info)
      // clearTiemr 会清掉向日葵的阳光生成定时器，需恢复
      m.plants.forEach(function (p) {
        if (p.section === 'sunflower' && p.setSunTimer) p.setSunTimer()
      })
      // 学习层状态重置（大波按场上活跃计数触发，无需阈值字段；pending/冷却清掉防跨关残留）
      this._pendingWave = false
      this._waveCooldownAt = 0
      this._breachShown = false      // v9：失败卡片状态重置（过关/切难度/重打后允许再次弹出）
      this._boostZombies()
      // 重启全局定时器（LOADING 阶段尚未开局，由"开始游戏"按钮接管）
      if (m.game && m.game.state >= m.game.state_START) m.setTimer()
      if (this.onLevelChange) this.onLevelChange(n, cfg)
      console.log('[word-study] 第', n, '关开始：僵尸', cfg.zombies, '· 间隔', cfg.interval + 's', '· 血', cfg.baseLife, '起')
    },
    // 清场接管：game.js 检测到 zombies 清空时调用。
    // 返回 true = 学习层接管（进入下一关，不置 PLANTWON）；false/undefined = 走原版胜利
    onZombiesCleared () {
      if (this._levelClearing) return false
      this._levelClearing = true
      const clearedLevel = this.level
      // v16：记录历史最高关卡（localStorage 持久化，首页/无尽模式展示"最高第 N 关"）
      if (clearedLevel > this.bestLevel) {
        this.bestLevel = clearedLevel
        try { localStorage.setItem(LS_BEST_KEY, String(clearedLevel)) } catch (e) {}
      }
      const self = this
      setTimeout(function () {
        self._levelClearing = false
        self.startLevel(clearedLevel + 1)
        if (window.answerUI && window.answerUI.showLevelClear) window.answerUI.showLevelClear(clearedLevel)
      }, 1200)   // 留 1.2s 让清场画面播完
      return true
    },
  }

  window.wordStudy = wordStudy
})()
