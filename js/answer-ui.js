/* answer-ui.js — 悬浮答题层（GDD-03 §四）
** 四题型：听音选词 / 看图选词 / 中选英 / 拼写挑战（字母块点选，不用键盘）
** 设计要点：
**  - layer pointer-events:none，仅答题卡片可点 → 弹窗期间游戏继续运行
**  - 按钮 ≥48px 触控区（低龄手指友好）
**  - 答对 → 绿框 + ☀️ 粒子 + TTS 鼓励；答错 → 温和橙色提示正确答案，无红叉动画（P3 零挫败）
**  - 大波模式：红色脉冲横幅 + 答对全场减速语义
*/
(function () {
  'use strict'

  // 题型标签（双模式）：
  // - 拼词模式（spell，默认）：listen/picture/cn2en/spell 全部拼写作答
  // - 简单模式（easy）：listen/cn2en 选择题（听音选词/选意选词），答对即算
  const TYPE_LABEL_SPELL = {
    listen: '🔊 听音拼写',
    picture: '🖼️ 看图拼写',
    cn2en: '🀄 选意拼写',
    spell: '✏️ 综合拼写',
    listenPick: '🔊 听一听，选一选',
  }
  const TYPE_LABEL_EASY = {
    listen: '🔊 听音选词',
    picture: '🖼️ 看图选词',
    cn2en: '🀄 选意选词',
    spell: '✏️ 综合拼写',
    listenPick: '🔊 听一听，选一选',
  }
  const PRAISE = ['Great!', 'Well done!', 'Awesome!', 'Nice work!']

  function randInt (a, b) { return Math.floor(a + Math.random() * (b - a + 1)) }
  function el (tag, cls, html) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }

  const STYLE = `
#pvz-ws-layer{position:fixed;inset:0;z-index:9999;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;user-select:none}
.pvz-ws-card{pointer-events:auto;position:fixed;right:10px;top:96px;width:min(400px,38vw);max-height:calc(100vh - 120px);overflow-y:auto;background:rgba(255,253,245,.96);border:4px solid #8bc34a;border-radius:20px;box-shadow:0 10px 32px rgba(0,0,0,.3);padding:14px 18px 12px;text-align:center;box-sizing:border-box}
.pvz-ws-card.wave{border-color:#ff5722;animation:pvzWavePulse 1s infinite}
@keyframes pvzWavePulse{0%,100%{box-shadow:0 0 0 0 rgba(255,87,34,.55)}50%{box-shadow:0 0 0 16px rgba(255,87,34,0)}}
.pvz-ws-card-idle{pointer-events:none;position:fixed;right:10px;top:96px;width:min(400px,38vw);background:rgba(240,238,228,.6);border:3px dashed #c9c2a8;border-radius:20px;padding:18px;text-align:center;color:#a89f82;font-size:15px;box-sizing:border-box;font-family:"Microsoft YaHei",sans-serif}
.pvz-ws-head{display:flex;justify-content:space-between;align-items:center}
.pvz-ws-type{font-size:15px;color:#7a6a3c;background:#f2e9d0;border-radius:999px;padding:3px 12px}
.pvz-ws-close{border:none;background:none;font-size:22px;color:#bbb;cursor:pointer;padding:2px 10px;line-height:1}
.pvz-ws-wave{margin:8px 0 4px;font-size:17px;font-weight:bold;color:#fff;background:#ff5722;border-radius:12px;padding:8px 10px;animation:pvzBlink .9s infinite}
@keyframes pvzBlink{50%{opacity:.7}}
.pvz-ws-prompt{font-size:17px;color:#666;margin:6px 0 2px;min-height:24px}
.pvz-ws-zh{font-size:26px;font-weight:bold;color:#e65100;margin:2px 0 4px;line-height:1.3}
.pvz-ws-phonetic{display:inline-block;font-size:22px;color:#5b4bc4;background:#efeafb;border-radius:999px;padding:4px 18px;margin:4px auto 2px;letter-spacing:.5px}
.pvz-ws-media{font-size:78px;line-height:1.2;margin:4px 0 6px}
.pvz-ws-media-btn{font-size:44px;background:#e8f5e9;border:3px solid #a5d6a7;border-radius:18px;padding:8px 26px;cursor:pointer;margin:6px auto}
.pvz-ws-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.pvz-ws-opt{font-size:26px;padding:14px 4px;min-height:56px;border:3px solid #e8e0c8;border-radius:14px;background:#fff;cursor:pointer;font-family:inherit;transition:transform .08s;line-height:1.2}
.pvz-ws-opt .pvz-ws-opt-emoji{font-size:30px;display:block}
.pvz-ws-opt:active{transform:scale(.96)}
.pvz-ws-opt.ok{border-color:#4caf50;background:#e8f5e9}
.pvz-ws-opt.bad{border-color:#ff9800;background:#fff3e0}
.pvz-ws-foot{display:flex;justify-content:center;align-items:center;margin-top:6px;min-height:30px}
.pvz-ws-skip{border:none;background:#f0e8d8;color:#8a7a4a;font-size:14px;border-radius:999px;padding:6px 18px;cursor:pointer}
.pvz-ws-msg{font-size:20px;font-weight:bold;margin-top:6px;min-height:28px}
.pvz-ws-msg.ok{color:#2e7d32}
.pvz-ws-msg.bad{color:#e65100}
.pvz-ws-particle{position:absolute;font-size:26px;pointer-events:none;animation:pvzRise .9s ease-out forwards;z-index:10000}
@keyframes pvzRise{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-90px) scale(1.5)}}
.pvz-ws-spell-zone{display:flex;flex-wrap:wrap;justify-content:center;margin:8px 0 4px}
.pvz-ws-letter{font-size:24px;min-width:46px;height:52px;border:2px solid #9ccc65;border-radius:10px;background:#f4fbea;margin:4px;cursor:pointer;text-transform:lowercase}
.pvz-ws-letter.used{opacity:.22;pointer-events:none}
.pvz-ws-slot{font-size:24px;min-width:42px;height:50px;border:2px dashed #b0a888;border-radius:10px;background:#fffdf5;margin:4px;cursor:pointer;text-transform:lowercase}
.pvz-ws-spell-input{width:min(250px,80%);height:46px;font-size:24px;text-align:center;letter-spacing:3px;border:2px solid #9ccc65;border-radius:12px;background:#fff;color:#2e7d32;margin:2px auto;display:block;text-transform:lowercase;outline:none;box-sizing:border-box;font-family:inherit}
.pvz-ws-spell-input:focus{border-color:#43a047;box-shadow:0 0 0 3px rgba(67,160,71,.22)}
.pvz-ws-spell-input:disabled{background:#f0f0f0;color:#999}
.pvz-ws-spell-actions{display:flex;gap:12px;justify-content:center;margin-top:8px}
.pvz-ws-btn{font-size:18px;padding:10px 24px;border:none;border-radius:12px;cursor:pointer;min-height:48px;font-family:inherit}
.pvz-ws-btn.confirm{background:#8bc34a;color:#fff}
.pvz-ws-btn.clear{background:#e8e8e8;color:#666}
.pvz-ws-hint{font-size:13px;color:#b0a888;margin-top:4px}
.pvz-ws-toast{pointer-events:none;position:fixed;left:50%;top:56%;transform:translateX(-50%);font-size:16px;font-weight:bold;color:#fff;background:rgba(46,125,50,.95);border-radius:999px;padding:10px 22px;box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:10002;animation:pvzToastIn .3s ease-out}
@keyframes pvzToastIn{0%{opacity:0;transform:translateX(-50%) translateY(8px)}100%{opacity:1;transform:translateX(-50%) translateY(0)}}
.pvz-ws-combo{pointer-events:none;position:fixed;left:50%;top:42%;transform:translateX(-50%);font-size:26px;font-weight:bold;color:#fff;background:linear-gradient(135deg,#ff9800,#f44336);border-radius:999px;padding:10px 26px;box-shadow:0 6px 24px rgba(244,67,54,.5);z-index:10001;animation:pvzComboPop 2.2s ease-out forwards}
@keyframes pvzComboPop{0%{opacity:0;transform:translateX(-50%) scale(.4) rotate(-6deg)}15%{opacity:1;transform:translateX(-50%) scale(1.15) rotate(2deg)}25%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-40px) scale(1.05)}}
.pvz-ws-wave-banner{pointer-events:none;position:absolute;left:50%;top:16%;transform:translate(-50%,0);font-size:21px;font-weight:bold;color:#ffe9b8;background:rgba(46,30,8,.92);border:2px solid #e8b64c;border-radius:14px;padding:10px 30px;letter-spacing:2px;box-shadow:0 6px 20px rgba(0,0,0,.4);white-space:nowrap;text-align:center;z-index:9995;animation:pvzWaveIn .45s ease-out,pvzWaveOut .5s ease-in 3.3s forwards}
.pvz-ws-wave-banner.last{border-color:#ff6a3d;background:rgba(90,18,6,.94);color:#ffd9c8;font-size:23px}
.pvz-ws-wave-banner.boss{border-color:#f7c948;background:rgba(60,38,4,.95);color:#ffe9a3;font-size:24px;box-shadow:0 6px 24px rgba(247,201,72,.45)}
@keyframes pvzWaveIn{from{transform:translate(-50%,-26px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes pvzWaveOut{from{transform:translate(-50%,0);opacity:1}to{transform:translate(-50%,-26px);opacity:0}}
#pvz-mode-btn,#pvz-diff-btn,#pvz-endless-btn,#pvz-collection-btn{cursor:pointer}
#pvz-mode-btn:hover,#pvz-diff-btn:hover,#pvz-endless-btn:hover,#pvz-collection-btn:hover{background:#fff;border-color:rgba(139,90,43,.5);box-shadow:0 3px 10px rgba(0,0,0,.12)}
#pvz-mode-btn.easy,#pvz-diff-btn.easy,#pvz-diff-btn.hard,#pvz-endless-btn.on{background:#ffe9b8;border-color:#c4a45a;color:#5d4037}
#pvz-level-hud,#pvz-mode-btn,#pvz-diff-btn,#pvz-endless-btn,#pvz-best-hud,#pvz-collection-btn,#pvz-skin-hud{position:fixed;top:14px;z-index:9998;font-size:13px;color:#5d4037;background:rgba(255,253,245,.95);border:1px solid rgba(139,90,43,.22);border-radius:18px;padding:0 14px;height:36px;box-shadow:0 2px 8px rgba(0,0,0,.08);box-sizing:border-box;display:inline-flex;align-items:center;letter-spacing:.3px;white-space:nowrap;transition:all .2s ease;font-family:"Microsoft YaHei",sans-serif;cursor:default}
#pvz-skin-hud{top:62px;right:14px}
#pvz-collection-btn{right:14px}
#pvz-best-hud{right:247px}
#pvz-endless-btn{right:379px}
#pvz-mode-btn{right:468px}
#pvz-diff-btn{right:584px}
#pvz-level-hud{right:673px}
#pvz-skin-hud{letter-spacing:.5px}
.pvz-ws-collection{pointer-events:auto;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,92vw);max-height:86vh;overflow-y:auto;background:#fff;border:4px solid #ab47bc;border-radius:24px;box-shadow:0 16px 50px rgba(0,0,0,.4);padding:22px 26px;box-sizing:border-box;z-index:10001;font-family:"Microsoft YaHei",sans-serif}
.pvz-ws-collection-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.pvz-ws-collection-title{font-size:26px;font-weight:bold;color:#6a1b9a}
.pvz-ws-collection-close{font-size:22px;background:#eee;border:none;border-radius:12px;padding:4px 14px;cursor:pointer;color:#555}
.pvz-ws-collection-close:hover{background:#ddd}
.pvz-ws-collection-summary{font-size:14px;color:#888;margin-bottom:14px}
.pvz-ws-col-unit{margin:16px 0 8px;display:flex;align-items:center;gap:10px}
.pvz-ws-col-unit-name{font-size:18px;font-weight:bold;color:#4a148c}
.pvz-ws-col-badge{font-size:13px;background:#ffd54f;color:#5d4037;border-radius:999px;padding:3px 12px;font-weight:bold}
.pvz-ws-col-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.pvz-ws-col-card{background:#f5f0e8;border:2px solid #e0d6c8;border-radius:12px;padding:10px 8px;text-align:center;box-sizing:border-box}
.pvz-ws-col-card.done{background:#fffde7;border-color:#f9a825}
.pvz-ws-col-emoji{font-size:26px;line-height:1.2}
.pvz-ws-col-word{font-size:15px;font-weight:bold;color:#333;margin-top:2px}
.pvz-ws-col-meaning{font-size:12px;color:#999}
.pvz-ws-col-card.locked .pvz-ws-col-emoji,.pvz-ws-col-card.locked .pvz-ws-col-word{filter:grayscale(1);opacity:.4}
.pvz-ws-col-skin{margin-top:16px;background:#fff8e1;border:2px dashed #f9a825;border-radius:14px;padding:12px 16px}
.pvz-ws-col-skin-title{font-size:14px;font-weight:bold;color:#795548;margin-bottom:8px}
.pvz-ws-skin-row{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px;color:#555}
.pvz-ws-skin-row .bar{flex:1;height:10px;background:#eee;border-radius:999px;overflow:hidden}
.pvz-ws-skin-row .fill{height:100%;background:#f9a825;border-radius:999px;transition:width .4s}
.pvz-ws-skin-row.unlocked .fill{background:#ab47bc}
.pvz-ws-skin-row.unlocked{color:#6a1b9a;font-weight:bold}
.pvz-ws-toast-skin{position:fixed;left:50%;top:30%;transform:translateX(-50%);background:linear-gradient(135deg,#6a1b9a,#ab47bc);color:#fff;font-size:19px;font-weight:bold;border-radius:16px;padding:14px 30px;box-shadow:0 10px 30px rgba(106,27,154,.5);z-index:10002;animation:pvzClearPop .5s ease-out;font-family:"Microsoft YaHei",sans-serif}
.pvz-ws-clear{pointer-events:auto;position:absolute;left:50%;top:30%;transform:translateX(-50%);width:min(480px,90vw);background:#fff;border:4px solid #ffd54f;border-radius:24px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:26px 30px;text-align:center;box-sizing:border-box;z-index:10000;animation:pvzClearPop .5s ease-out}
@keyframes pvzClearPop{0%{transform:translateX(-50%) scale(.5);opacity:0}60%{transform:translateX(-50%) scale(1.06)}100%{transform:translateX(-50%) scale(1)}}
.pvz-ws-clear-title{font-size:30px;color:#f9a825;font-weight:bold;margin-bottom:6px}
.pvz-ws-clear-info{font-size:16px;color:#666;margin-bottom:16px;line-height:1.6}
.pvz-ws-clear-btn{font-size:20px;padding:12px 34px;border:none;border-radius:14px;cursor:pointer;min-height:52px;background:#f9a825;color:#fff;font-family:inherit;box-shadow:0 4px 12px rgba(249,168,37,.4)}
.pvz-ws-clear-btn:active{transform:scale(.96)}
.pvz-ws-fail{pointer-events:auto;position:absolute;left:50%;top:30%;transform:translateX(-50%);width:min(500px,90vw);background:#fff;border:4px solid #ef5350;border-radius:24px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:26px 30px;text-align:center;box-sizing:border-box;z-index:10001;animation:pvzClearPop .5s ease-out}
.pvz-ws-fail-title{font-size:28px;color:#d32f2f;font-weight:bold;margin-bottom:6px}
.pvz-ws-fail-info{font-size:16px;color:#666;margin-bottom:16px;line-height:1.6}
.pvz-ws-fail-btn{font-size:20px;padding:12px 34px;border:none;border-radius:14px;cursor:pointer;min-height:52px;background:#ef5350;color:#fff;font-family:inherit;box-shadow:0 4px 12px rgba(239,83,80,.4)}
.pvz-ws-fail-btn:active{transform:scale(.96)}
`

  const answerUI = {
    layer: null,
    card: null,
    _clearCard: null,
    _failCard: null,       // v9：防线失守失败卡片
    _q: null,
    _meta: null,
    _closeTimer: null,
    _speakTimer: null,     // 朗读两遍的第二遍定时器（答题/跳过后及时清理，防串台）
    _letters: [],
    _picked: [],

    init () {
      if (document.getElementById('pvz-ws-style')) return
      document.head.appendChild(el('style', 'pvz-ws-style', STYLE))
      this.layer = el('div', 'pvz-ws-layer', '')
      this.layer.id = 'pvz-ws-layer'
      document.body.appendChild(this.layer)
      this._initModeBtn()
      this._initHud()
    },

    // ================= 难度模式切换按钮 =================
    _initModeBtn () {
      if (document.getElementById('pvz-mode-btn')) return
      const btn = el('button', '', '')
      btn.id = 'pvz-mode-btn'
      const self = this
      btn.onclick = function () {
        const ws = window.wordStudy
        if (ws && ws.setMode) ws.setMode(ws.config.mode === 'easy' ? 'spell' : 'easy')
      }
      document.body.appendChild(btn)
      this._modeBtn = btn
      this._syncModeBtn()
      const ws = window.wordStudy
      if (ws) ws.onModeChange = function () { self._syncModeBtn() }
    },
    _syncModeBtn () {
      if (!this._modeBtn) return
      const ws = window.wordStudy
      const easy = !!(ws && ws.config && ws.config.mode === 'easy')
      this._modeBtn.textContent = easy ? '👂 简单模式' : '🆎 拼词模式'
      this._modeBtn.className = easy ? 'easy' : ''
    },
    _isEasy () {
      const ws = window.wordStudy
      return !!(ws && ws.config && ws.config.mode === 'easy')
    },

    // ================= 关卡 HUD：难度档位按钮 + 关卡徽章（v4 关卡系统）=================
    _initHud () {
      const self = this
      if (!document.getElementById('pvz-diff-btn')) {
        const diff = el('button', '', '')
        diff.id = 'pvz-diff-btn'
        diff.onclick = function () {
          const ws = window.wordStudy
          if (!ws || !ws.setDifficulty) return
          const next = { easy: 'normal', normal: 'hard', hard: 'easy' }[ws.config.difficulty] || 'normal'
          ws.setDifficulty(next)
        }
        document.body.appendChild(diff)
        this._diffBtn = diff
      }
      if (!document.getElementById('pvz-level-hud')) {
        const hud = el('div', '', '')
        hud.id = 'pvz-level-hud'
        document.body.appendChild(hud)
        this._levelHud = hud
      }
      // v16：无尽模式开关按钮 + 历史最高关卡徽章
      if (!document.getElementById('pvz-endless-btn')) {
        const eb = el('button', '', '')
        eb.id = 'pvz-endless-btn'
        eb.onclick = function () {
          const ws = window.wordStudy
          if (!ws || !ws.setEndless) return
          ws.setEndless(!ws.config.endless)
        }
        document.body.appendChild(eb)
        this._endlessBtn = eb
      }
      if (!document.getElementById('pvz-best-hud')) {
        const bh = el('div', '', '')
        bh.id = 'pvz-best-hud'
        document.body.appendChild(bh)
        this._bestHud = bh
      }
      // v17：单词图鉴入口按钮 + 皮肤进度 HUD
      if (!document.getElementById('pvz-collection-btn')) {
        const cb = el('button', '', '📖 单词图鉴')
        cb.id = 'pvz-collection-btn'
        cb.onclick = function () { self.showCollection() }
        document.body.appendChild(cb)
        this._collectionBtn = cb
      }
      if (!document.getElementById('pvz-skin-hud')) {
        const sh = el('div', '', '')
        sh.id = 'pvz-skin-hud'
        document.body.appendChild(sh)
        this._skinHud = sh
      }
      const ws = window.wordStudy
      if (ws) {
        ws.onDifficultyChange = function (d) { self._syncDiffBtn() }
        ws.onLevelChange = function (n, cfg) { self.setLevel(n, cfg) }
        ws.onEndlessChange = function (v) { self._syncEndlessBtn() }   // v16
      }
      this._syncDiffBtn()
      this._syncEndlessBtn()
      this._syncCollectionHud()
      // v17：初始化皮肤通知基线（已解锁的皮肤刷新页面不重复弹 toast）
      this._lastSkinNotified = ws && ws.currentSkin ? ws.currentSkin() : 'none'
      this.setLevel(ws ? ws.level || 1 : 1, ws && ws.levelCfg ? ws.levelCfg() : null)
    },
    _syncDiffBtn () {
      if (!this._diffBtn) return
      const ws = window.wordStudy
      const d = (ws && ws.config && ws.config.difficulty) || 'normal'
      const label = { easy: '简单', normal: '普通', hard: '困难' }[d] || '普通'
      this._diffBtn.textContent = '🎚️ ' + label
      this._diffBtn.className = d === 'easy' || d === 'hard' ? d : ''
    },
    // v16：无尽模式按钮状态 + 最高关卡徽章
    _syncEndlessBtn () {
      const ws = window.wordStudy
      if (this._endlessBtn && ws) {
        this._endlessBtn.textContent = ws.config.endless ? '♾️ 无尽' : '🔁 关卡'
        this._endlessBtn.className = ws.config.endless ? 'on' : ''
      }
      if (this._bestHud && ws) {
        this._bestHud.textContent = '🏆 最高第 ' + (ws.bestLevel || 0) + ' 关'
      }
    },
    // v17：图鉴/皮肤进度 HUD 同步（答题后、打开图鉴时刷新）
    _syncCollectionHud () {
      const ws = window.wordStudy
      if (!ws) return
      const n = ws.collectedCount ? ws.collectedCount() : 0
      const total = ws.words ? ws.words.length : 0
      if (this._collectionBtn) this._collectionBtn.textContent = '📖 图鉴 ' + n + '/' + total
      if (this._skinHud) {
        const skin = ws.currentSkin ? ws.currentSkin() : 'none'
        const prog = ws.skinProgress ? ws.skinProgress() : null
        if (prog) {
          this._skinHud.textContent = (skin === 'crown' ? '👑 ' : skin === 'star' ? '⭐ ' : '🔒 ') +
            '⭐' + prog.star.cur + '/' + prog.star.at + ' · 👑' + prog.crown.cur + '/' + prog.crown.at
        }
      }
    },
    // v17：单词图鉴面板——词卡墙（答对点亮）+ 单元徽章 + 皮肤进度
    showCollection () {
      this.init()
      const ws = window.wordStudy
      if (!ws) return
      const old = document.getElementById('pvz-ws-collection')
      if (old) old.remove()
      const panel = el('div', 'pvz-ws-collection')
      panel.id = 'pvz-ws-collection'
      // 头部：标题 + 关闭
      const head = el('div', 'pvz-ws-collection-head')
      head.appendChild(el('div', 'pvz-ws-collection-title', '📖 单词图鉴'))
      const closeBtn = el('button', 'pvz-ws-collection-close', '✕ 关闭')
      closeBtn.onclick = function () { panel.remove() }
      head.appendChild(closeBtn)
      panel.appendChild(head)
      const n = ws.collectedCount ? ws.collectedCount() : 0
      const total = ws.words ? ws.words.length : 0
      panel.appendChild(el('div', 'pvz-ws-collection-summary', '已收集 <b>' + n + '</b> / ' + total + ' 词——答对一次即点亮！'))
      // 皮肤进度
      const skinBox = el('div', 'pvz-ws-col-skin')
      skinBox.appendChild(el('div', 'pvz-ws-col-skin-title', '🎨 皮肤奖励（点亮词数自动解锁）'))
      const prog = ws.skinProgress ? ws.skinProgress() : null
      if (prog) {
        const starRow = el('div', 'pvz-ws-skin-row' + (ws.currentSkin() === 'star' || ws.currentSkin() === 'crown' ? ' unlocked' : ''))
        starRow.appendChild(el('span', '', '⭐ 星光皮肤'))
        const bar1 = el('div', 'bar'); bar1.appendChild(el('div', 'fill', '')); bar1.children[0].style.width = (prog.star.cur / prog.star.at * 100) + '%'
        starRow.appendChild(bar1)
        starRow.appendChild(el('span', '', prog.star.cur + '/' + prog.star.at))
        skinBox.appendChild(starRow)
        const crownRow = el('div', 'pvz-ws-skin-row' + (ws.currentSkin() === 'crown' ? ' unlocked' : ''))
        crownRow.appendChild(el('span', '', '👑 皇冠皮肤'))
        const bar2 = el('div', 'bar'); bar2.appendChild(el('div', 'fill', '')); bar2.children[0].style.width = (prog.crown.cur / prog.crown.at * 100) + '%'
        crownRow.appendChild(bar2)
        crownRow.appendChild(el('span', '', prog.crown.cur + '/' + prog.crown.at))
        skinBox.appendChild(crownRow)
        panel.appendChild(skinBox)
      }
      // 按 unit 分组词卡墙
      const units = ws.unitProgress ? ws.unitProgress() : {}
      Object.keys(units).sort(function (a, b) { return a - b }).forEach(function (u) {
        const up = units[u]
        const unitBox = el('div', '')
        const unitHead = el('div', 'pvz-ws-col-unit')
        unitHead.appendChild(el('div', 'pvz-ws-col-unit-name', 'Unit ' + u))
        unitHead.appendChild(el('div', 'pvz-ws-col-summary', up.collected + '/' + up.total))
        if (up.done) unitHead.appendChild(el('div', 'pvz-ws-col-badge', '🏅 集齐徽章！'))
        unitBox.appendChild(unitHead)
        const grid = el('div', 'pvz-ws-col-grid')
        ws.words.forEach(function (w) {
          if ((w.unit || 1) !== Number(u)) return
          const st = ws.state[w.id]
          const done = st && (st.right || 0) >= 1
          const card = el('div', 'pvz-ws-col-card' + (done ? ' done' : ' locked'))
          card.appendChild(el('div', 'pvz-ws-col-emoji', done ? (w.emoji || '⭐') : '❓'))
          card.appendChild(el('div', 'pvz-ws-col-word', done ? w.word : '· · ·'))
          card.appendChild(el('div', 'pvz-ws-col-meaning', done ? (w.meaning || '') : '未解锁'))
          if (done) card.title = w.word + ' ' + (w.phonetic || '') + ' ' + (w.meaning || '')
          grid.appendChild(card)
        })
        unitBox.appendChild(grid)
        panel.appendChild(unitBox)
      })
      this.layer.appendChild(panel)
      this._collectionPanel = panel
      this._syncCollectionHud()
    },
    // v17：答对跨过皮肤阈值 → 解锁 toast（submit 答对后调用）
    _notifySkinUnlock () {
      const ws = window.wordStudy
      if (!ws || !ws.currentSkin) return
      const skin = ws.currentSkin()
      if (skin === this._lastSkinNotified) return
      if (skin !== 'none') {
        this.init()
        const t = el('div', 'pvz-ws-toast-skin', skin === 'crown' ? '👑 皇冠皮肤解锁！' : '⭐ 星光皮肤解锁！')
        this.layer.appendChild(t)
        setTimeout(function (node) { if (node && node.parentNode) node.remove() }, 3200, t)
      }
      this._lastSkinNotified = skin
      this._syncCollectionHud()
    },
    // 关卡徽章：第 N 关（title 悬停显示本关数值）
    setLevel (n, cfg) {
      if (!this._levelHud) return
      this._levelHud.textContent = '🏁 第 ' + n + ' 关'
      if (cfg) {
        this._levelHud.title = '本关：僵尸 ' + cfg.zombies + ' 只 · ' + cfg.interval + ' 秒一波 · 血 ' + cfg.baseLife + ' 起'
      }
      // v16：关卡变化时同步最高关卡徽章（过关后 bestLevel 可能已刷新）
      if (this._bestHud && window.wordStudy) {
        this._bestHud.textContent = '🏆 最高第 ' + (window.wordStudy.bestLevel || 0) + ' 关'
      }
    },
    // 过关庆祝卡片：🎉 第 N 关通过 + 下一关数值预告 + 继续按钮（8s 自动消失）
    showLevelClear (clearedLevel) {
      this.init()
      if (this._clearCard) { this._clearCard.remove() }
      const ws = window.wordStudy
      const cfg = ws && ws.levelCfg ? ws.levelCfg() : null
      const card = el('div', 'pvz-ws-clear')
      card.appendChild(el('div', 'pvz-ws-clear-title', '🎉 第 ' + clearedLevel + ' 关通过！'))
      const info = cfg
        ? ('下一关更强啦：僵尸 <b>' + cfg.zombies + '</b> 只 · <b>' + cfg.interval + '</b> 秒一波 · 血量 <b>' + cfg.baseLife + '</b> 起')
        : '下一关更强了！'
      card.appendChild(el('div', 'pvz-ws-clear-info', info))
      const btn = el('button', 'pvz-ws-clear-btn', '▶ 继续下一关')
      btn.onclick = function () { card.remove() }
      card.appendChild(btn)
      this.layer.appendChild(card)
      this._clearCard = card
      // v13：修复 setTimeout 缺参 bug——第三个参数把 node 传给回调，否则 node 为 undefined、remove() 抛错、卡片永不消失
      setTimeout(function (node) {
        if (node.parentNode) node.remove()
      }, 8000, card)
    },
    // v9 防线失守：僵尸进房子 → 失败卡片（学习进度零惩罚，点"再试一次"重打本关）
    showLevelFail (level) {
      this.init()
      if (this._failCard) { this._failCard.remove() }
      const card = el('div', 'pvz-ws-fail')
      card.appendChild(el('div', 'pvz-ws-fail-title', '💔 僵尸进房子啦！'))
      card.appendChild(el('div', 'pvz-ws-fail-info',
        '第 <b>' + level + '</b> 关防线失守，花园被吃掉了！<br>多答题攒阳光、多种几棵射手再试试～'))
      const btn = el('button', 'pvz-ws-fail-btn', '🔄 再试一次')
      btn.onclick = function () {
        if (window.wordStudy && window.wordStudy.retryLevel) window.wordStudy.retryLevel()
      }
      card.appendChild(btn)
      this.layer.appendChild(card)
      this._failCard = card
    },
    hideFail () {
      if (this._failCard) { this._failCard.remove(); this._failCard = null }
    },

    // ================= 展示 =================
    show (q, meta) {
      this.init()
      if (this._clearCard) { this._clearCard.remove(); this._clearCard = null }
      this._q = q
      this._meta = meta || {}
      this._build(q)
    },
    hide () {
      if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null }
      this._stopSpeak()
      if (this.card) {
        // v20：右侧常驻答题栏——答完不消失，转为"等待下一题"占位（持续答题、不遮挡游戏区域）
        this.card.innerHTML = ''
        this.card.className = 'pvz-ws-card-idle'
        this.card.id = 'pvz-ws-card-idle'
        this.card.appendChild(el('div', '', '⏳ 下一题马上来…'))
        this.card = null
      }
      this._q = null
      if (this._failCard) { this._failCard.remove(); this._failCard = null }
    },
    _build (q) {
      // v20：清理旧答题卡（含 hide 后的 idle 占位，hide 已将 this.card 置 null）
      const oldCard = document.getElementById('pvz-ws-card')
      if (oldCard) oldCard.remove()
      const oldIdle = document.getElementById('pvz-ws-card-idle')
      if (oldIdle) oldIdle.remove()
      const card = el('div', 'pvz-ws-card' + (q.wave ? ' wave' : ''))
      card.id = 'pvz-ws-card'

      const easy = this._isEasy()
      const labels = easy ? TYPE_LABEL_EASY : TYPE_LABEL_SPELL
      const head = el('div', 'pvz-ws-head')
      head.appendChild(el('span', 'pvz-ws-type', labels[q.type] || q.type))
      const close = el('button', 'pvz-ws-close', '✕')
      close.onclick = () => this._skip()
      head.appendChild(close)
      card.appendChild(head)

      if (q.wave) {
        card.appendChild(el('div', 'pvz-ws-wave', '⚠️ 僵尸大军来啦！答对 = 全体减速 10 秒！'))
      }

      const body = el('div', 'pvz-ws-body')
      card.appendChild(body)
      card.appendChild(el('div', 'pvz-ws-msg'))
      card.appendChild(el('div', 'pvz-ws-foot'))
      this.layer.appendChild(card)
      this.card = card
      this._msgEl = card.querySelector('.pvz-ws-msg')
      this._footEl = card.querySelector('.pvz-ws-foot')

      if (easy) {
        // 简单模式：选择题（听音选词 / 选意选词），答对即算
        if (q.type === 'cn2en') this._buildCn2enPick(q, body)
        else this._buildListenPick(q, body)   // listen / 其他类型兜底为听音选词
      } else {
        // 拼词模式（默认）：全部拼写作答
        if (q.type === 'listen') this._buildListen(q, body)
        else if (q.type === 'picture') this._buildPicture(q, body)
        else if (q.type === 'cn2en') this._buildCn2en(q, body)
        else if (q.type === 'spell') this._buildSpell(q, body)
        else if (q.type === 'listenPick') this._buildListenPick(q, body)
      }

      // 跳过按钮
      const skip = el('button', 'pvz-ws-skip', '先跳过，待会儿再来')
      skip.onclick = () => this._skip()
      this._footEl.appendChild(skip)
    },

    // ================= 题型构建（v2：拼写为主，图片只出现在问题侧）=================
    // v5 题干统一（拼词模式）：音标必显 + 自动朗读两遍 + 🔊 重播按钮（图片不达意时靠音标/听音兜底）
    // 听音拼写：🔊 自动读两遍 + 可重播 → 字母块/键盘拼出单词
    // v30：补中文释义行（光听音听不出时，看中文照样能拼，音形义一起记）
    _buildListen (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', '听发音，拼出单词'))
      body.appendChild(el('div', 'pvz-ws-zh', (q.word.emoji ? q.word.emoji + ' ' : '') + q.word.meaning))
      const ph = this._phoneticEl(q.word)
      if (ph) body.appendChild(ph)
      const btn = el('button', 'pvz-ws-media-btn', '🔊 再听一遍')
      btn.onclick = () => this._speakZhEn(q.word.meaning, q.word.word)
      body.appendChild(btn)
      this._speakZhEn(q.word.meaning, q.word.word)
      this._buildSpellCore(q, body)
    },
    // 看图拼写：emoji 图（仅问题侧）+ v30 中文释义行（图意不明或 ❓ 占位时中文兜底）→ 拼出单词
    _buildPicture (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', '这是什么？拼出单词'))
      body.appendChild(el('div', 'pvz-ws-media', q.word.emoji || '❓'))
      body.appendChild(el('div', 'pvz-ws-zh', q.word.meaning))
      const ph = this._phoneticEl(q.word)
      if (ph) body.appendChild(ph)
      const btn = el('button', 'pvz-ws-media-btn', '🔊 听一听')
      btn.onclick = () => this._speakZhEn(q.word.meaning, q.word.word)
      body.appendChild(btn)
      this._speakZhEn(q.word.meaning, q.word.word)
      this._buildSpellCore(q, body)
    },
    // 中译英拼写：中文释义 → 字母块拼出单词（音标 + 朗读辅助音形对应）
    _buildCn2en (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', (q.word.pos || '') + ' ' + q.word.meaning + ' — 拼出英文'))
      const ph = this._phoneticEl(q.word)
      if (ph) body.appendChild(ph)
      const btn = el('button', 'pvz-ws-media-btn', '🔊 再听一遍')
      btn.onclick = () => this._speakZhEn(q.word.meaning, q.word.word)
      body.appendChild(btn)
      this._speakZhEn(q.word.meaning, q.word.word)
      this._buildSpellCore(q, body)
    },
    // 综合拼写：emoji + 中文 + 音标 + 朗读一起提示
    _buildSpell (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', q.word.meaning + ' — 拼一拼'))
      body.appendChild(el('div', 'pvz-ws-media', q.word.emoji || '❓'))
      const ph = this._phoneticEl(q.word)
      if (ph) body.appendChild(ph)
      const btn = el('button', 'pvz-ws-media-btn', '🔊 再听一遍')
      btn.onclick = () => this._speakZhEn(q.word.meaning, q.word.word)
      body.appendChild(btn)
      this._speakZhEn(q.word.meaning, q.word.word)
      this._buildSpellCore(q, body)
    },
    // 音标行（词库 phonetic 字段，存在才显示）
    _phoneticEl (w) {
      return w && w.phonetic ? el('div', 'pvz-ws-phonetic', w.phonetic) : null
    },
    // 新词首次再认缓冲（拼词模式旧路径保留兜底）：🔊 听音 + 4 个纯文字选项（无 emoji，不靠图蒙）
    // 简单模式下 = 听音选词（选择题，答对即算）
    _buildListenPick (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', '听一听，选出你听到的单词'))
      const btn = el('button', 'pvz-ws-media-btn', '🔊 再听一遍')
      btn.onclick = () => this._speak(q.word.word)
      body.appendChild(btn)
      this._speak(q.word.word)
      this._buildOptions(q, body, false)   // 纯文字选项，不给 emoji
    },
    // 简单模式：选意选词（中文释义 → 4 个英文单词选项，无图）
    _buildCn2enPick (q, body) {
      body.appendChild(el('div', 'pvz-ws-prompt', (q.word.pos || '') + ' ' + q.word.meaning + ' — 选出英文'))
      this._buildOptions(q, body, false)
    },
    _buildOptions (q, body, showEmoji) {
      const box = el('div', 'pvz-ws-options')
      const opts = q.options
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i]
        const b = el('button', 'pvz-ws-opt')
        if (showEmoji !== false) b.appendChild(el('span', 'pvz-ws-opt-emoji', o.emoji || ''))
        b.appendChild(document.createTextNode(o.word))
        ;(function (word, btn) {
          b.onclick = () => this._pick(word, btn)
        }).call(this, o, b)
        box.appendChild(b)
      }
      body.appendChild(box)
    },
    // 拼写核心：字母块点选（正确字母打乱 + 干扰字母，最多 9 块）+ v29 键盘输入框（打字拼词，回车提交）
    _buildSpellCore (q, body) {
      const w = q.word
      const base = w.word.replace(/[^a-zA-Z]/g, '').toLowerCase().split('')
      const extras = 'a e i o u r t s n l m b d'.split(' ')
      const letters = base.slice()
      let guard = 0
      while (letters.length < Math.min(9, base.length + 3) && guard++ < 20) {
        letters.push(extras[randInt(0, extras.length - 1)])
      }
      this._letters = letters.slice().sort(() => Math.random() - 0.5)
      this._picked = []

      // v29：键盘输入框——直接打字拼单词（回车提交、退格修改），字母块保留作鼠标备用
      const input = el('input', 'pvz-ws-spell-input')
      input.type = 'text'
      input.id = 'pvz-ws-spell-input'
      input.placeholder = '⌨️ 直接打字拼单词，回车提交'
      input.autocomplete = 'off'
      input.autocapitalize = 'off'
      input.spellcheck = false
      input.maxLength = 24
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (input.disabled) return
          const val = input.value.toLowerCase().replace(/[^a-z]/g, '')
          input.disabled = true
          input.blur()
          if (val === base.join('')) this._feedback(true, w, null)
          else this._feedback(false, w, null)
        }
      })
      // 自动聚焦（等卡片入场动画完成后）
      setTimeout(function (inp) { if (inp && !inp.disabled && inp.isConnected) inp.focus() }, 180, input)
      body.appendChild(input)

      const slotZone = el('div', 'pvz-ws-spell-zone')
      slotZone.id = 'pvz-ws-spell-slots'
      const letterZone = el('div', 'pvz-ws-spell-zone')
      letterZone.id = 'pvz-ws-spell-letters'
      body.appendChild(slotZone)
      body.appendChild(letterZone)

      const actions = el('div', 'pvz-ws-spell-actions')
      const confirm = el('button', 'pvz-ws-btn confirm', '✅ 确认')
      const clear = el('button', 'pvz-ws-btn clear', '清空')
      confirm.onclick = () => {
        // v29：确认时优先读输入框内容（有内容以输入框为准），否则用字母块
        const inp = document.getElementById('pvz-ws-spell-input')
        const typed = inp && inp.value ? inp.value.toLowerCase().replace(/[^a-z]/g, '') : ''
        if (typed) {
          if (inp) { inp.disabled = true; inp.blur() }
          if (typed === base.join('')) this._feedback(true, w, null)
          else this._feedback(false, w, null)
        } else if (this._picked.join('') === base.join('')) this._feedback(true, w, null)
        else this._feedback(false, w, null)
      }
      // v14：清空 = 已拼字母全部退回字母块区（旧实现只重绘不复位，_picked 残留导致"清空无效"）
      clear.onclick = () => {
        this._letters = this._letters.concat(this._picked)
        this._picked = []
        const inp = document.getElementById('pvz-ws-spell-input')
        if (inp) { inp.value = ''; inp.disabled = false; inp.focus() }
        this._renderSpell()
      }
      actions.appendChild(confirm)
      actions.appendChild(clear)
      body.appendChild(actions)
      body.appendChild(el('div', 'pvz-ws-hint', '直接打字拼单词（回车提交），或点字母块'))
      this._renderSpell()
    },
    _renderSpell () {
      const slots = document.getElementById('pvz-ws-spell-slots')
      const letters = document.getElementById('pvz-ws-spell-letters')
      if (!slots || !letters) return
      slots.innerHTML = ''
      letters.innerHTML = ''
      // 已拼区（点可撤回）
      for (let i = 0; i < this._picked.length; i++) {
        const s = el('button', 'pvz-ws-slot', this._picked[i])
        ;(function (idx, self) {
          s.onclick = function () {
            const ch = self._picked[idx]
            self._picked.splice(idx, 1)
            self._letters.push(ch)
            self._renderSpell()
          }
        })(i, this)
        slots.appendChild(s)
      }
      // 字母块区
      for (let i = 0; i < this._letters.length; i++) {
        const l = el('button', 'pvz-ws-letter', this._letters[i])
        ;(function (idx, self) {
          l.onclick = function () {
            self._picked.push(self._letters[idx])
            self._letters.splice(idx, 1)
            self._renderSpell()
          }
        })(i, this)
        letters.appendChild(l)
      }
    },

    // ================= 作答与反馈 =================
    _pick (word, btn) {
      const q = this._q
      if (!q) return
      this._lockOptions()
      this._feedback(word.id === q.word.id, q.word, btn)
    },
    _lockOptions () {
      if (!this.card) return
      const btns = this.card.querySelectorAll('.pvz-ws-opt, .pvz-ws-btn, .pvz-ws-letter, .pvz-ws-slot, .pvz-ws-skip')
      btns.forEach(b => { b.style.pointerEvents = 'none' })
      // v29：反馈期间禁用键盘输入框，防重复提交
      const inp = document.getElementById('pvz-ws-spell-input')
      if (inp) { inp.disabled = true; inp.blur() }
    },
    _skip () {
      if (this._closeTimer) return   // 反馈中不可跳过
      const q = this._q
      if (!q) return
      const meta = this._meta
      this.hide()
      if (window.wordStudy && window.wordStudy.skip) window.wordStudy.skip(q.word.id, meta)
    },
    _feedback (ok, correctWord, pickedEl) {
      const q = this._q
      const meta = this._meta || {}
      const msg = this._msgEl
      if (ok) {
        msg.textContent = q.wave ? '✅ 太棒了！僵尸大军减速啦！🧊' : '✅ Great! 阳光到手啦！☀️'
        msg.className = 'pvz-ws-msg ok'
        if (pickedEl) pickedEl.classList.add('ok')
        this._spawnParticles()
        this._speak(PRAISE[randInt(0, PRAISE.length - 1)])
      } else {
        msg.textContent = '正确答案是 ' + correctWord.word + ' ' + (correctWord.phonetic || '') + ' ' + (correctWord.emoji || '')
        msg.className = 'pvz-ws-msg bad'
        if (pickedEl) pickedEl.classList.add('bad')
        this._speak('It is ' + correctWord.word)
      }
      clearTimeout(this._closeTimer)
      const self = this
      this._closeTimer = setTimeout(function () {
        self.hide()
        if (window.wordStudy && window.wordStudy.submit) window.wordStudy.submit(q.word.id, ok, meta)
        // v17：答对后刷新图鉴/皮肤 HUD + 皮肤解锁 toast
        if (ok) self._notifySkinUnlock()
        else self._syncCollectionHud()
      }, ok ? 1400 : 2200)
    },

    // ================= 动效与语音 =================
    // 连击徽章：连击 ≥3 时浮动显示（由 wordStudy.grantCallback 调用）
    showCombo (n) {
      this.init()
      const badge = el('div', 'pvz-ws-combo', '🔥 连击 ×' + n + '！额外阳光 +50 ☀️')
      this.layer.appendChild(badge)
      // v13：补传 badge 参数（缺参会抛错、徽章永不消失）
      setTimeout(function (node) { node.remove() }, 2200, badge)
    },
    // v7：僵尸波次预告横幅（顶部滑入滑出，3.8s 自动消失）
    // waveIndex：本波是第几波；totalWaves：总波数；count：本波僵尸数量；type：v16 本波最强者（boss/cone/bucket/normal）
    showWaveBanner (waveIndex, totalWaves, count, blood, speed, type) {
      this.init()
      const old = document.getElementById('pvz-ws-wave-banner')
      if (old) old.remove()
      const isLast = waveIndex >= totalWaves
      // v16：Boss 波 / 精英波专属文案（低龄孩子提前感知"这波有硬骨头"）
      let text
      if (type === 'boss') {
        text = '👑 BOSS 来袭！第 ' + waveIndex + ' 波（' + count + ' 只）· 答对题减速它！'
      } else if (type === 'bucket') {
        text = '🪣 铁桶僵尸出没！第 ' + waveIndex + ' 波（' + count + ' 只）'
      } else if (type === 'cone') {
        text = '🪖 路障僵尸出没！第 ' + waveIndex + ' 波（' + count + ' 只）'
      } else {
        text = isLast
          ? '🚨 最后一波僵尸来袭！顶住！（' + count + ' 只）'
          : '🌊 第 ' + waveIndex + '/' + totalWaves + ' 波僵尸即将来袭（' + count + ' 只）'
      }
      // v9：横幅带本波强度（血 +2/波、速度 +12%/波），让孩子直观感知僵尸越打越强
      if (blood) text += ' · 💪血' + blood
      if (speed && speed > 1.05) text += ' · ⚡×' + speed.toFixed(2)
      const b = el('div', 'pvz-ws-wave-banner' + (type === 'boss' ? ' boss' : (isLast ? ' last' : '')), text)
      b.id = 'pvz-ws-wave-banner'
      this.layer.appendChild(b)
      // v13：补传 b 参数（缺参时回调 node 为 undefined、防御分支静默跳过、横幅 DOM 永不清理）
      setTimeout(function (node) { if (node && node.parentNode) node.parentNode.removeChild(node) }, 3800, b)
    },
    _spawnParticles () {
      if (!this.card) return
      for (let i = 0; i < 6; i++) {
        const p = el('span', 'pvz-ws-particle', '☀️')
        p.style.left = (30 + Math.random() * 60) + '%'
        p.style.top = (30 + Math.random() * 30) + '%'
        p.style.animationDelay = (Math.random() * 0.15) + 's'
        this.card.appendChild(p)
        // v13：补传 p 参数（缺参时粒子永不消失，堆积在答题卡上）
        setTimeout(function (node) { node.remove() }, 1200, p)
      }
    },
    _speak (text) {
      try {
        if (!('speechSynthesis' in window)) return
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'en-US'
        u.rate = 0.85
        window.speechSynthesis.speak(u)
      } catch (e) { /* TTS 缺失时静默 */ }
    },
    // v5：读两遍（间隔 800ms，低龄听一遍容易漏）。用 _speakTimer 跟踪第二遍，
    // 答题/跳过后及时 cancel 与清定时器，避免残留朗读串台
    _speakTwice (text) {
      try {
        if (!('speechSynthesis' in window)) return
        if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null }
        window.speechSynthesis.cancel()
        const mk = function (t) {
          const u = new SpeechSynthesisUtterance(t)
          u.lang = 'en-US'
          u.rate = 0.85
          return u
        }
        const self = this
        window.speechSynthesis.speak(mk(text))
        this._speakTimer = setTimeout(function () {
          self._speakTimer = null
          try { window.speechSynthesis.speak(mk(text)) } catch (e) {}
        }, 800)
      } catch (e) { /* TTS 缺失时静默 */ }
    },
    // v31：先读一遍汉语意思（zh-CN）→ 再读两遍英文（en-US，间隔 800ms）。
    // 听音听不出时，先听到中文意思再听发音，音形义一起记；靠 speechSynthesis 队列保证顺序
    _speakZhEn (zh, en) {
      try {
        if (!('speechSynthesis' in window)) return
        if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null }
        window.speechSynthesis.cancel()
        const self = this
        const mk = function (t, lang, rate) {
          const u = new SpeechSynthesisUtterance(t)
          u.lang = lang
          u.rate = rate
          return u
        }
        if (zh) window.speechSynthesis.speak(mk(zh, 'zh-CN', 0.9))
        window.speechSynthesis.speak(mk(en, 'en-US', 0.85))
        this._speakTimer = setTimeout(function () {
          self._speakTimer = null
          try { window.speechSynthesis.speak(mk(en, 'en-US', 0.85)) } catch (e) {}
        }, 800)
      } catch (e) { /* TTS 缺失时静默 */ }
    },
    _stopSpeak () {
      try {
        if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      } catch (e) {}
    },
    // v6：通用浮动提示（卡片禁用提示等轻量消息，2.2s 自动消失）
    toast (msg, ms) {
      this.init()
      const t = el('div', 'pvz-ws-toast', msg)
      this.layer.appendChild(t)
      // v13：补传 t 参数——缺参时 node 为 undefined、remove() 抛 TypeError、toast 永不消失（铲子铲除提示残留的根因）
      setTimeout(function (node) { node.remove() }, ms || 2200, t)
    },
  }

  window.answerUI = answerUI
})()
