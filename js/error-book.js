/* error-book.js — 错题本（GDD-03 §五）
** 数据源：wordStudy.state 中 wrong ≥ 1 的词
** 能力：列表查看（单词/音标/释义/错误次数/下次复习）/ 重练（只出这些词循环到全对）/ 清空错题计数
** 入口：页面右上角固定按钮
*/
(function () {
  'use strict'

  const STYLE = `
#pvz-eb-btn{position:fixed;right:145px;top:14px;z-index:9998;font-size:13px;color:#5d4037;background:rgba(255,253,245,.95);border:1px solid rgba(139,90,43,.22);border-radius:18px;padding:0 14px;height:36px;box-shadow:0 2px 8px rgba(0,0,0,.08);box-sizing:border-box;display:inline-flex;align-items:center;letter-spacing:.3px;white-space:nowrap;transition:all .2s ease;font-family:"Microsoft YaHei",sans-serif;cursor:pointer}
#pvz-eb-btn:hover{background:#fff;border-color:rgba(139,90,43,.5);box-shadow:0 3px 10px rgba(0,0,0,.12)}
#pvz-eb-btn .badge{display:inline-block;background:#e53935;border-radius:999px;font-size:12px;padding:0 7px;margin-left:4px;line-height:17px}
#pvz-eb-panel{position:fixed;right:14px;top:64px;width:min(420px,92vw);max-height:70vh;background:#fff;border:3px solid #ffb74d;border-radius:16px;box-shadow:0 10px 32px rgba(0,0,0,.3);z-index:9998;display:none;flex-direction:column;font-family:"Microsoft YaHei",sans-serif;overflow:hidden}
#pvz-eb-panel.show{display:flex}
.pvz-eb-head{display:flex;justify-content:space-between;align-items:center;background:#fff3e0;padding:10px 14px}
.pvz-eb-head .title{font-size:17px;font-weight:bold;color:#bf360c}
.pvz-eb-close{border:none;background:none;font-size:20px;color:#999;cursor:pointer}
.pvz-eb-actions{display:flex;gap:8px;padding:8px 14px;border-bottom:1px solid #f0e8d8}
.pvz-eb-btn-act{font-size:14px;padding:7px 12px;border:none;border-radius:10px;cursor:pointer}
.pvz-eb-btn-act.retrain{background:#ffb74d;color:#fff}
.pvz-eb-btn-act.clear{background:#eee;color:#666}
.pvz-eb-list{overflow-y:auto;padding:6px 14px 12px}
.pvz-eb-empty{color:#b0a888;text-align:center;padding:18px 0;font-size:14px}
.pvz-eb-item{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px dashed #f0e8d8}
.pvz-eb-item .emoji{font-size:26px}
.pvz-eb-item .word{font-size:19px;font-weight:bold;flex:0 0 auto}
.pvz-eb-item .ph{font-size:12px;color:#999}
.pvz-eb-item .mean{font-size:14px;color:#666;flex:1}
.pvz-eb-item .wrong{font-size:12px;color:#e53935;background:#ffebee;border-radius:999px;padding:2px 8px;flex:0 0 auto}
.pvz-eb-item .next{font-size:11px;color:#b0a888}
`

  function el (tag, cls, html) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }

  const errorBook = {
    btn: null,
    panel: null,

    init () {
      if (document.getElementById('pvz-eb-style')) return
      document.head.appendChild(el('style', 'pvz-eb-style', STYLE))
      // 入口按钮
      this.btn = el('button', '', '📖 错题本')
      this.btn.id = 'pvz-eb-btn'
      this.btn.onclick = () => this.toggle()
      document.body.appendChild(this.btn)
      // 面板
      this.panel = el('div', '')
      this.panel.id = 'pvz-eb-panel'
      document.body.appendChild(this.panel)
      this.refreshBadge()
    },

    toggle () {
      if (!this.panel) this.init()
      if (this.panel.classList.contains('show')) this.close()
      else this.open()
    },
    open () {
      this.render()
      this.panel.classList.add('show')
    },
    close () {
      this.panel.classList.remove('show')
    },

    // 渲染面板
    render () {
      const ws = window.wordStudy
      const items = ws ? ws.wrongWords() : []
      const head = el('div', 'pvz-eb-head')
      head.appendChild(el('span', 'title', '📖 错题本（' + items.length + ' 个）'))
      const close = el('button', 'pvz-eb-close', '✕')
      close.onclick = () => this.close()
      head.appendChild(close)

      const actions = el('div', 'pvz-eb-actions')
      const retrain = el('button', 'pvz-eb-btn-act retrain', '✏️ 重练错题')
      retrain.onclick = () => this._startRetrain()
      const clear = el('button', 'pvz-eb-btn-act clear', '清空错题计数')
      clear.onclick = () => this._clearWrong()
      actions.appendChild(retrain)
      actions.appendChild(clear)

      const list = el('div', 'pvz-eb-list')
      if (!items.length) {
        list.appendChild(el('div', 'pvz-eb-empty', '🎉 太棒了，没有错题！'))
      } else {
        items.forEach(function (it) {
          const row = el('div', 'pvz-eb-item')
          row.appendChild(el('span', 'emoji', it.word.emoji || ''))
          row.appendChild(el('span', 'word', it.word.word))
          row.appendChild(el('span', 'ph', it.word.phonetic || ''))
          row.appendChild(el('span', 'mean', it.word.meaning))
          row.appendChild(el('span', 'wrong', '错 ' + it.state.wrong + ' 次'))
          row.appendChild(el('span', 'next', '下次 ' + fmtNext(it.state.next)))
          list.appendChild(row)
        })
      }

      this.panel.innerHTML = ''
      this.panel.appendChild(head)
      this.panel.appendChild(actions)
      this.panel.appendChild(list)
      this.refreshBadge()
    },

    _startRetrain () {
      const ws = window.wordStudy
      if (!ws) return
      const items = ws.wrongWords()
      if (!items.length) { alert('没有错题哦～'); return }
      const ids = items.map(it => it.word.id)
      ws.startRetrain(ids)
      this.close()
      alert('开始重练 ' + ids.length + ' 个错题，全部答对就完成啦！')
    },
    _clearWrong () {
      const ws = window.wordStudy
      if (!ws) return
      if (!ws.wrongWords().length) return
      if (!confirm('确定要清空所有错题计数吗？')) return
      ws.clearWrongCounts()
      this.render()
    },

    // 重练完成回调（wordStudy.submit 检测到全部答对时调用）
    onRetrainDone (n) {
      this.render()
      alert('🎉 太棒了！' + n + ' 个错题全部复习完啦！')
    },

    refreshBadge () {
      if (!this.btn) return
      const ws = window.wordStudy
      const n = ws ? ws.wrongWords().length : 0
      const old = this.btn.querySelector('.badge')
      if (old) old.remove()
      if (n > 0) this.btn.appendChild(el('span', 'badge', String(n)))
    },
  }

  function fmtNext (ts) {
    if (!ts) return '—'
    const d = Math.ceil((ts - Date.now()) / 86400000)
    if (d <= 0) return '今天'
    if (d === 1) return '明天'
    return d + ' 天后'
  }

  window.errorBook = errorBook
})()
