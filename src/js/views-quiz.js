/* =========================================================================
 * WordMaster · views-quiz.js
 * 模块职责：首页概览 / 测试配置 / 答题与反馈 / 结果 / 生词本 / 统计 / 设置备份
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM, U = WM.util, S = WM.Store, V = WM.views = WM.views || {};
  function esc(s) { return U.esc(s); }

  /* 可持久化的默认出题配置 */
  var CFG = WM.cfg = {
    source: 'all', bookIds: [], categories: [], keys: [], levels: [],
    learning: 'all', count: 20, order: 'random',
    types: { choice: true, fill: true }, direction: 'mix'
  };
  WM.session = { qs: [], i: 0, results: [], startedAt: 0, cfgLabel: '', cfg: null, finished: true };

  /** 生成一枚可点选的 chip（同一 group 互斥） */
  function chip(group, val, label) {
    var cur = { src: CFG.source, lr: CFG.learning, od: CFG.order, dr: CFG.direction }[group];
    return '<button class="chip' + (cur === val ? ' on' : '') + '" data-' + group + '="' + esc(val) + '">' + esc(label) + '</button>';
  }

  /* ==================================================================== *
   * 首页
   * ==================================================================== */
  V.home = {
    title: '学习总览', sub: '',
    render: function (el) {
      var st = S.stats(), goal = S.state.settings.dailyGoal;
      var nbWords = S.notebookWords();
      var dueday = nbWords.filter(function (w) {
        var nb = S.state.notebook[w.__k];
        return nb && !nb.lastOk;
      }).length;
      el.innerHTML =
        '<div class="grid g4">' +
        card('brand', '词库 / 词条', st.books + '<small>词库</small>', st.words + ' 词') +
        card('ok', '已学 / 已掌握', st.learned + '<small>已学</small>', '掌握 ' + st.mastered) +
        card('purple', '生词本', st.notebook + '<small>词</small>', dueday + ' 个待消化') +
        card('', '累计正确率', st.accuracy + '<small>%</small>', st.answered + ' 次作答') +
        '</div>' +
        '<div class="card"><div class="card-hd"><h3>今日进度<span class="desc"> 目标 ' + goal + ' 题</span></h3></div>' +
        '<div class="bar ' + (st.today >= goal ? 'ok' : '') + '"><i style="width:' + Math.min(100, Math.round(st.today / goal * 100)) + '%"></i></div>' +
        '<div class="muted" style="margin-top:6px">今日已练 ' + st.today + ' 题 / 目标 ' + goal + ' 题</div></div>' +
        '<div class="card"><div class="card-hd"><h3>快捷开始</h3></div>' +
        '<div class="row">' +
        '<button class="btn lg primary" id="q-all">快速测试 20 题（随机 · 全部词库）</button>' +
        '<button class="btn lg" id="q-nb"' + (st.notebook ? '' : ' disabled') + '>生词本强化（' + st.notebook + ' 词）</button>' +
        '<button class="btn lg" id="q-new">未学词 20 题</button>' +
        '<button class="btn lg" id="q-cfg">按条件自定义 →</button>' +
        '</div></div>' +
        recentHtml();

      U.$('#q-all').onclick = function () { startQuiz(quickCfg('all')); };
      U.$('#q-nb').onclick = function () { startQuiz(quickCfg('notebook')); };
      U.$('#q-new').onclick = function () { startQuiz(quickCfg('all', 'unlearned')); };
      U.$('#q-cfg').onclick = function () { WM.App.go('quiz'); };
      U.$$('[data-again]', el).forEach(function (b) {
        b.onclick = function () { repeatHistory(b.getAttribute('data-again')); };
      });

      function card(cls, k, v, foot) {
        return '<div class="stat ' + cls + '"><div class="k">' + esc(k) + '</div><div class="v">' + v +
          '</div><div class="k" style="margin-top:4px">' + esc(foot) + '</div></div>';
      }
      function recentHtml() {
        var hs = S.state.history.slice(-8).reverse();
        return '<div class="card"><div class="card-hd"><h3>最近测试</h3>' +
          '<span class="desc">共 ' + st.tests + ' 次记录</span></div>' +
          (hs.length
            ? '<table class="table"><thead><tr><th>时间</th><th>范围</th><th>题量</th><th>正确率</th><th>用时</th><th></th></tr></thead><tbody>' +
            hs.map(function (h) {
              return '<tr><td>' + U.fmtDate(h.startedAt) + '</td><td>' + esc(h.label) + '</td><td>' + h.total +
                '</td><td>' + Math.round(h.correct / h.total * 100) + '%</td><td>' + dur(h) + '</td>' +
                '<td><button class="btn sm" data-again="' + h.id + '">同条件再来</button></td></tr>';
            }).join('') + '</tbody></table>'
            : '<div class="empty">还没有测试记录，点上面任意一个按钮开始吧</div>') + '</div>';
      }
    }
  };

  function dur(h) {
    var s = Math.round((h.finishedAt - h.startedAt) / 1000);
    return s < 60 ? s + ' 秒' : Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
  }
  function quickCfg(source, learning) {
    var c = JSON.parse(JSON.stringify(CFG));
    c.source = source; c.learning = learning || 'all'; c.count = Math.min(c.count, source === 'notebook' ? 999 : c.count);
    c.levels = [];   // 来源被快捷入口改写时，范围维度一并归零（与已有 bookIds / categories 处理一致）
    return c;
  }
  function repeatHistory(id) {
    var h = S.state.history.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    startQuiz(h.cfg, h.label);
  }

  /* ==================================================================== *
   * 测试配置
   * ==================================================================== */
  V.quiz = {
    title: '测试配置', sub: '自定义选题范围、题量与题型；Enter 直接开始',
    render: function (el) {
      var st = S.state;
      var lvSel = CFG.levels;
      var lvCount = WM.FreqLevel.LEVELS.map(function (L) {
        return { L: L, n: 0 };
      });
      (function () {
        var cnt = WM.FreqLevel.countBy(S.allWords());
        lvCount.forEach(function (x) { x.n = cnt[x.L.id] || 0; });
      })();
      el.innerHTML =
        '<div class="card"><div class="card-hd"><h3>① 选题范围</h3></div>' +
        '<div class="row"><span class="muted" style="width:72px">来源</span>' +
        chip('src', 'all', '全部词库') + chip('src', 'books', '指定词库') + chip('src', 'categories', '按分类') + chip('src', 'notebook', '仅生词本') +
        '</div>' +
        '<div id="src-books" class="row" style="margin-top:10px" hidden><span class="muted" style="width:72px">词库</span>' +
        st.books.map(function (b) {
          return '<label class="chip ' + (CFG.bookIds.indexOf(b.id) >= 0 ? 'on' : '') + '"><input type="checkbox" hidden data-bk="' + b.id + '"' +
            (CFG.bookIds.indexOf(b.id) >= 0 ? ' checked' : '') + '>' + esc(b.name) + '（' + b.wordKeys.length + '）</label>';
        }).join('') + '</div>' +
        '<div id="src-cats" class="row" style="margin-top:10px" hidden><span class="muted" style="width:72px">分类</span>' +
        S.categories().map(function (c) {
          return '<label class="chip ' + (CFG.categories.indexOf(c) >= 0 ? 'on' : '') + '"><input type="checkbox" hidden data-ct="' + esc(c) + '"' +
            (CFG.categories.indexOf(c) >= 0 ? ' checked' : '') + '>' + esc(c) + '</label>';
        }).join('') + '</div>' +
        '<div class="row" style="margin-top:10px"><span class="muted" style="width:72px">学习状态</span>' +
        chip('lr', 'all', '全部') + chip('lr', 'unlearned', '只看未学') + chip('lr', 'learned', '只看已学') +
        '</div>' +
        '<div class="row" style="margin-top:10px"><span class="muted" style="width:72px">使用频次</span>' +
        '<button class="chip' + (lvSel.length ? '' : ' on') + '" data-lvclear="1">不限</button>' +
        lvCount.map(function (x) {
          return '<label class="chip ' + (lvSel.indexOf(x.L.id) >= 0 ? 'on' : '') + '">' +
            '<input type="checkbox" hidden data-lv="' + esc(x.L.id) + '"' + (lvSel.indexOf(x.L.id) >= 0 ? ' checked' : '') + '>' +
            esc(x.L.name) + '（' + x.n + '）</label>';
        }).join('') +
        '</div>' +
        '<div class="muted" style="margin-top:6px;font-size:12px">三个维度取交集；使用频次「未选＝不限」。' +
        '分级依据词条 level 标签（高频/中频/低频），无标签时按词频序位区间归类：≤ 2000 高频 · 2001~6000 中频 · &gt; 6000 低频。</div>' +
        '</div>' +

        '<div class="card"><div class="card-hd"><h3>② 题量与顺序</h3></div>' +
        '<div class="row"><span class="muted" style="width:72px">题目数</span>' +
        '<input type="number" id="cnt" min="1" max="500" value="' + CFG.count + '" style="max-width:110px">' +
        '<button class="chip" data-n="10">10</button><button class="chip" data-n="20">20</button>' +
        '<button class="chip" data-n="50">50</button><button class="chip" data-n="100">100</button>' +
        '<button class="chip" data-n="999">不限</button></div>' +
        '<div class="row" style="margin-top:10px"><span class="muted" style="width:72px">出题顺序</span>' +
        chip('od', 'random', '随机') + chip('od', 'seq', '按导入顺序') + '</div>' +
        '</div>' +

        '<div class="card"><div class="card-hd"><h3>③ 题型与方向</h3></div>' +
        '<div class="row"><span class="muted" style="width:72px">题型</span>' +
        '<label class="chip ' + (CFG.types.choice ? 'on' : '') + '"><input type="checkbox" hidden id="ty-c"' + (CFG.types.choice ? ' checked' : '') + '>单项选择题</label>' +
        '<label class="chip ' + (CFG.types.fill ? 'on' : '') + '"><input type="checkbox" hidden id="ty-f"' + (CFG.types.fill ? ' checked' : '') + '>填空题</label>' +
        '<span class="muted" style="margin-left:12px">考察方向</span>' +
        chip('dr', 'mix', '混合') + chip('dr', 'en2cn', '英 → 中') + chip('dr', 'cn2en', '中 → 英') +
        '</div>' +
        '<div class="muted" style="margin-top:8px">单选：四选一，干扰项取自同类词汇；填空：据释义/例句补全单词，或据单词填中文释义（拼写允许 1~2 个字母误差，长词更宽松）。</div>' +
        '</div>' +

        '<div class="card"><div class="row" style="align-items:center">' +
        '<b>可选词数：<span id="avail" style="color:var(--brand)">0</span></b>' +
        '<span class="muted" id="hint"></span><span style="flex:1"></span>' +
        '<button class="btn lg primary" id="go">开始测试（Enter）</button></div></div>';

      U.$$('[data-src]', el).forEach(function (c) {
        c.onclick = function () { CFG.source = c.getAttribute('data-src'); V.quiz.render(el); };
      });
      U.$$('[data-lr]', el).forEach(function (c) {
        c.onclick = function () { CFG.learning = c.getAttribute('data-lr'); V.quiz.render(el); };
      });
      U.$$('[data-od]', el).forEach(function (c) {
        c.onclick = function () { CFG.order = c.getAttribute('data-od'); V.quiz.render(el); };
      });
      U.$$('[data-dr]', el).forEach(function (c) {
        c.onclick = function () { CFG.direction = c.getAttribute('data-dr'); V.quiz.render(el); };
      });
      U.$$('[data-n]', el).forEach(function (c) {
        c.onclick = function () { CFG.count = parseInt(c.getAttribute('data-n'), 10); U.$('#cnt', el).value = CFG.count; update(); };
      });
      U.$('#cnt', el).oninput = function () { CFG.count = U.clamp(parseInt(this.value, 10) || 0, 0, 999); update(); };
      U.$$('[data-bk]', el).forEach(function (cb) {
        cb.parentNode.onclick = function (e) {
          e.preventDefault();
          var id = cb.getAttribute('data-bk'), i = CFG.bookIds.indexOf(id);
          if (i >= 0) CFG.bookIds.splice(i, 1); else CFG.bookIds.push(id);
          V.quiz.render(el);
        };
      });
      U.$$('[data-ct]', el).forEach(function (cb) {
        cb.parentNode.onclick = function (e) {
          e.preventDefault();
          var c = cb.getAttribute('data-ct'), i = CFG.categories.indexOf(c);
          if (i >= 0) CFG.categories.splice(i, 1); else CFG.categories.push(c);
          V.quiz.render(el);
        };
      });
      U.$('#ty-c', el).onchange = U.$('#ty-f', el).onchange = function () {
        CFG.types.choice = U.$('#ty-c', el).checked; CFG.types.fill = U.$('#ty-f', el).checked;
        V.quiz.render(el);
      };
      var lvClr = U.$('[data-lvclear]', el);
      if (lvClr) lvClr.onclick = function () { CFG.levels = []; V.quiz.render(el); };
      U.$$('[data-lv]', el).forEach(function (cb) {
        cb.parentNode.onclick = function (e) {
          e.preventDefault();
          var id = cb.getAttribute('data-lv'), i = CFG.levels.indexOf(id);
          if (i >= 0) CFG.levels.splice(i, 1); else CFG.levels.push(id);
          V.quiz.render(el);
        };
      });
      U.$('#src-books', el).hidden = CFG.source !== 'books';
      U.$('#src-cats', el).hidden = CFG.source !== 'categories';
      U.$('#go', el).onclick = function () { doStart(); };

      function update() {
        var n = WM.Quiz.selectWords(cfgClone()).length;
        U.$('#avail', el).textContent = n;
        var limit = Math.min(CFG.count || n, n);
        U.$('#hint', el).textContent = '本次将出 ' + limit + ' 题' + (n === 0 ? '（该范围内暂无可用词条，请调整范围）' : '');
        U.$('#go', el).disabled = n === 0;
      }
      update();
    },
    onKey: function (e) {
      if (e.key === 'Enter') { U.$('#go').click(); return true; }
      return false;
    }
  };

  function cfgClone() {
    var c = JSON.parse(JSON.stringify(CFG));
    c.count = CFG.count >= 999 ? 1e9 : CFG.count;
    return c;
  }
  function labelOf(cfg) {
    var parts = [];
    if (cfg.source === 'notebook') parts.push('生词本');
    else if (cfg.source === 'books') parts.push('指定词库 ×' + cfg.bookIds.length);
    else if (cfg.source === 'categories') parts.push('分类：' + cfg.categories.join('/'));
    else if (cfg.source === 'keys') parts.push('指定词条');
    else parts.push('全部词库');
    if (cfg.learning === 'learned') parts.push('已学');
    if (cfg.learning === 'unlearned') parts.push('未学');
    if (cfg.levels && cfg.levels.length) {
      parts.push('频次：' + cfg.levels.map(function (id) {
        var L = WM.FreqLevel.byId(id); return L ? L.name : id;
      }).join('/'));
    }
    parts.push(cfg.order === 'random' ? '随机' : '顺序');
    var t = []; if (cfg.types.choice) t.push('单选'); if (cfg.types.fill) t.push('填空');
    parts.push(t.join('+') || '单选');
    parts.push({ mix: '混合', en2cn: '英→中', cn2en: '中→英' }[cfg.direction]);
    return parts.join(' · ');
  }

  function doStart() {
    var cfg = cfgClone();
    if (!cfg.types.choice && !cfg.types.fill) { WM.toast('至少选择一种题型', 'bad'); return; }
    startQuiz(cfg);
  }

  function startQuiz(cfg, label) {
    var built = WM.Quiz.build(cfg);
    if (!built.total) { WM.toast('该范围内没有可用词条', 'bad'); return; }
    WM.session = {
      qs: built.questions, i: 0, results: [], startedAt: Date.now(),
      cfgLabel: label || labelOf(cfg), cfg: cfg, finished: false
    };
    WM.App.go('run');
  }
  WM.startQuiz = startQuiz;

  /* ==================================================================== *
   * 答题
   * ==================================================================== */
  V.run = {
    title: '测试中', sub: '数字键 1~4 选择选项，Enter 提交 / 下一题，Esc 结束并查看结果',
    render: function (el) {
      var s = WM.session;
      if (s.finished) { WM.App.go('home'); return; }
      el.innerHTML =
        '<div class="quiz-wrap">' +
        '<div class="qprog"><span class="muted">第 <b id="qi">1</b>/' + s.qs.length + ' 题</span>' +
        '<div class="bar"><i id="qbar" style="width:0%"></i></div>' +
        '<span class="muted"><span id="qok">0</span> 正确 · <span id="qbad">0</span> 错误</span>' +
        '<button class="btn sm danger" id="abort">结束并查看结果</button></div>' +
        '<div id="qwrap"></div>' +
        '<div class="kbdhint">快捷键：<kbd>1</kbd>~<kbd>4</kbd> 选选项 · <kbd>Enter</kbd> 提交/下一题 · <kbd>Esc</kbd> 提前结束</div>' +
        '</div>';
      U.$('#abort', el).onclick = function () { finish(true); };
      draw();
    },
    onKey: function (e) {
      var s = WM.session;
      if (e.key === 'Escape') { finish(true); return true; }
      if (e.key === 'Enter') { handleEnter(); return true; }
      if (/^[1-4]$/.test(e.key) && curQ() && curQ().type === 'choice' && !s.results[s.i]) {
        chooseOption(parseInt(e.key, 10) - 1); return true;
      }
      return false;
    }
  };

  function curQ() { return WM.session.qs[WM.session.i]; }

  function draw() {
    var s = WM.session, q = curQ(), root = U.$('#qwrap');
    if (!root) return;
    U.$('#qi').textContent = s.i + 1;
    U.$('#qbar').style.width = (s.i / s.qs.length * 100) + '%';
    var okc = 0, badc = 0;
    s.results.forEach(function (r) { r.ok ? okc++ : badc++; });
    U.$('#qok').textContent = okc; U.$('#qbad').textContent = badc;

    var exHtml = '';
    if (q.stemEx || (q.type === 'fill' && q.dir === 'en2cn' && q.word.ex)) {
      exHtml = '<div class="qex">' + esc(q.stemEx || q.word.ex) +
        (q.type === 'fill' && q.fillMode === 'term' && q.stemExCn ? '' : (q.word.exc ? '<div class="cn">' + esc(q.word.exc) + '</div>' : '')) +
        '</div>';
    }
    var html = '<div class="qcard">' +
      '<div class="qstem">' + esc(q.title) + '</div>' +
      (q.sub ? '<div class="qsub">' + esc(q.sub) + '</div>' : '') +
      '<div><span class="qtip">' + esc(q.tip) + '</span></div>' +
      exHtml;
    if (q.type === 'choice') {
      html += '<div class="opts">' + q.options.map(function (o, i) {
        return '<button class="opt" data-o="' + i + '"><span class="no">' + (i + 1) + '</span><span>' + esc(o.text) + '</span></button>';
      }).join('') + '</div>';
    } else {
      html += '<div class="fillrow"><input type="text" id="fin" placeholder="输入答案后回车" autocomplete="off" spellcheck="false">' +
        '<button class="btn primary" id="fsub">提交（Enter）</button></div>';
    }
    html += '<div id="judge"></div></div>';
    root.innerHTML = html;

    if (q.type === 'choice') {
      U.$$('[data-o]', root).forEach(function (b) {
        b.onclick = function () { chooseOption(parseInt(b.getAttribute('data-o'), 10)); };
      });
    } else {
      var inp = U.$('#fin', root);
      inp.focus();
      inp.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitFill(inp.value); }
      };
      U.$('#fsub', root).onclick = function () { submitFill(inp.value); };
    }
  }

  function chooseOption(idx) {
    var q = curQ();
    if (WM.session.results[WM.session.i]) return;      // 已作答
    submit({ index: idx });
  }
  function submitFill(v) {
    if (WM.session.results[WM.session.i]) { next(); return; }
    submit({ input: v });
  }
  function handleEnter() {
    var s = WM.session;
    if (s.results[s.i]) next();
    else {
      var q = curQ();
      if (q.type === 'fill') { var i = U.$('#fin'); if (i) { submitFill(i.value); return; } }
      WM.toast('请先作答', 'warn');
    }
  }

  function submit(payload) {
    var s = WM.session, q = curQ();
    var r = WM.Quiz.submit(q, payload);
    s.results[s.i] = { ok: r.ok, given: r.given, type: q.type, key: q.word.__k, note: r.note };
    renderFeedback(q, r, payload);
    WM.App.refreshSide();
  }

  function renderFeedback(q, r, payload) {
    var box = U.$('#judge');
    var w = q.word;
    var nbNow = !!S.state.notebook[w.__k];
    var html = '<div class="judge ' + (r.ok ? 'ok' : 'bad') + '">' +
      '<div class="verdict">' + (r.ok ? '✓ 回答正确' : '✗ 回答错误') +
      (r.note ? '<span class="muted" style="font-weight:400;font-size:12.5px"> · ' + esc(r.note) + '</span>' : '') + '</div>' +
      (r.ok ? '' : '<div style="margin-top:4px;font-size:13px">你填写：' + esc(r.given || '（空）') + '</div>') +
      '<div class="answer-box">' +
      '<div><span class="w">' + esc(w.t) + '</span>' +
      (w.ph || w.pu ? '<span class="ph">' + esc([w.ph, w.pu].filter(Boolean).join(' / ')) + '</span>' : '') +
      (w.p ? '<span class="tag" style="margin-left:8px">' + esc(w.p) + '</span>' : '') + '</div>' +
      '<div class="m">' + esc(w.m) + '</div>' +
      (w.cat || w.st || w.lv ? '<div class="kv">分类：' + esc([w.cat, w.st, w.lv].filter(Boolean).join(' / ')) + '</div>' : '') +
      (w.ex ? '<div class="ex">' + esc(w.ex) + (w.exc ? '<div class="cn">' + esc(w.exc) + '</div>' : '') + '</div>' : '') +
      (w.co ? '<div class="kv">搭配：' + esc(w.co) + '</div>' : '') +
      (w.dv ? '<div class="kv">派生：' + esc(w.dv) + '</div>' : '') +
      '<div class="kv">' + (nbNow
        ? '<span class="tag y">已自动加入生词本（累计错 ' + S.state.notebook[w.__k].wrongCount + ' 次）</span>'
        : '请继续：Enter → 下一题') +
      (r.outOfNotebook ? '｜连续答对已达标，自动移出生词本 🎉' : '') + '</div>' +
      '</div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn primary" id="next">' + (WM.session.i === WM.session.qs.length - 1 ? '查看结果（Enter）' : '下一题（Enter）') + '</button>' +
      '<button class="btn sm" id="to-nb">' + (nbNow ? '移出生词本' : '加入生词本') + '</button>' +
      '</div></div>';
    box.innerHTML = html;
    U.$('#next').onclick = next;
    U.$('#to-nb').onclick = function () {
      S.toggleNotebook(w.__k); WM.toast('已' + (S.state.notebook[w.__k] ? '加入' : '移出') + '生词本', 'ok');
      U.$('#to-nb').textContent = S.state.notebook[w.__k] ? '移出生词本' : '加入生词本';
      WM.App.refreshSide();
    };

    if (q.type === 'choice') {
      U.$$('[data-o]').forEach(function (b) {
        var i = parseInt(b.getAttribute('data-o'), 10);
        b.disabled = true;
        if (i === q.answerIndex) b.classList.add('correct');
        else if (i === payload.index) b.classList.add('wrong');
      });
    } else {
      var inp = U.$('#fin'); if (inp) { inp.disabled = true; }
      var fs = U.$('#fsub'); if (fs) fs.disabled = true;
    }
  }

  function next() {
    var s = WM.session;
    if (s.i < s.qs.length - 1) { s.i++; draw(); return; }
    finish(false);
  }

  function finish(aborted) {
    var s = WM.session;
    if (s.finished) return;
    s.finished = true;
    s.finishedAt = Date.now();
    var answered = s.results.filter(Boolean);
    var correct = answered.filter(function (r) { return r.ok; }).length;
    if (answered.length) {
      S.pushHistory({
        id: U.uid('h'), startedAt: s.startedAt, finishedAt: s.finishedAt,
        label: s.cfgLabel, total: answered.length, correct: correct,
        cfg: s.cfg, order: s.cfg.order, aborted: !!aborted,
        items: answered.map(function (r) { return { key: r.key, type: r.type, ok: r.ok, given: r.given }; })
      });
    }
    WM.App.go('result');
  }

  /* ==================================================================== *
   * 结果
   * ==================================================================== */
  V.result = {
    title: '测试结果', sub: '',
    render: function (el) {
      var s = WM.session;
      var answered = s.results.filter(Boolean);
      var correct = answered.filter(function (r) { return r.ok; }).length;
      var wrongs = answered.filter(function (r) { return !r.ok; });
      var acc = answered.length ? Math.round(correct / answered.length * 100) : 0;
      var seconds = Math.max(1, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000));
      this.sub = correct === answered.length && answered.length ? '全对！继续保持 🎉' : '错题已自动进入生词本';
      el.innerHTML =
        '<div class="quiz-wrap">' +
        '<div class="grid g4" style="margin-bottom:14px">' +
        '<div class="stat ' + (acc >= 80 ? 'ok' : acc >= 60 ? 'brand' : 'bad') + '"><div class="k">正确率</div><div class="v">' + acc + '<small>%</small></div></div>' +
        '<div class="stat"><div class="k">答对 / 已答</div><div class="v">' + correct + '<small>/' + answered.length + '</small></div></div>' +
        '<div class="stat purple"><div class="k">用时</div><div class="v">' + (seconds < 60 ? seconds + '<small>秒</small>' : Math.floor(seconds / 60) + '<small>分</small>') + '</div></div>' +
        '<div class="stat"><div class="k">平均每题</div><div class="v">' + (Math.round(seconds / Math.max(1, answered.length) * 10) / 10) + '<small>秒</small></div></div>' +
        '</div>' +
        '<div class="card"><div class="card-hd"><h3>错题回顾（' + wrongs.length + '）<span class="desc"> 已自动收入生词本</span></h3></div>' +
        (wrongs.length
          ? wrongs.map(function (r) {
            var w = S.state.words[r.key] || {};
            return '<div class="wrong-item"><div class="top"><span class="t">' + esc(w.t || r.key) + '</span>' +
              '<span class="muted">' + esc(w.ph || '') + ' ' + esc(w.p || '') + '</span></div>' +
              '<div>' + esc(w.m || '') + '</div>' +
              '<div class="muted" style="font-size:12.5px">你的答案：' + esc(r.given || '（空）') +
              (r.type === 'fill' ? '　正确答案：' + esc(w.t || '') : '') + '</div>' +
              (w.ex ? '<div class="muted" style="font-size:12.5px">' + esc(w.ex) + (w.exc ? '　' + esc(w.exc) : '') + '</div>' : '') +
              '</div>';
          }).join('')
          : '<div class="empty">没有错题，非常好 💪</div>') +
        '</div>' +
        '<div class="card"><div class="row">' +
        '<button class="btn lg primary" id="again">同条件再来一次</button>' +
        (wrongs.length ? '<button class="btn lg" id="rewrong">只测本次错题（' + wrongs.length + '）</button>' : '') +
        '<button class="btn lg" id="nb" >去生词本强化</button>' +
        '<button class="btn lg" id="home">回首页</button>' +
        '</div></div></div>';

      U.$('#again').onclick = function () { startQuiz(WM.session.cfg); };
      U.$('#home').onclick = function () { WM.App.go('home'); };
      U.$('#nb').onclick = function () { WM.App.go('notebook'); };
      var rw = U.$('#rewrong');
      if (rw) rw.onclick = function () {
        var cfg = JSON.parse(JSON.stringify(WM.session.cfg));
        cfg.source = 'keys';
        cfg.keys = wrongs.map(function (r) { return r.key; });
        cfg.count = cfg.keys.length;
        startQuiz(cfg, '本次错题重测');
      };
    },
    onKey: function (e) {
      if (e.key === 'Enter') { startQuiz(WM.session.cfg); return true; }
      return false;
    }
  };

  /* ==================================================================== *
   * 生词本
   * ==================================================================== */
  var nbSort = 'count';
  V.notebook = {
    title: '生词本', sub: '答错自动收录；连续答对设定次数后自动移出',
    render: function (el) {
      var list = S.notebookWords().map(function (w) { return { w: w, nb: S.state.notebook[w.__k], p: S.prog(w.__k) }; });
      if (nbSort === 'count') list.sort(function (a, b) { return b.nb.wrongCount - a.nb.wrongCount; });
      if (nbSort === 'recent') list.sort(function (a, b) { return (b.nb.lastWrong || 0) - (a.nb.lastWrong || 0); });
      if (nbSort === 'streak') list.sort(function (a, b) { return b.p.streak - a.p.streak; });
      var target = S.state.settings.streakTarget;

      el.innerHTML =
        '<div class="card"><div class="row">' +
        '<span class="muted">排序</span>' +
        sChip('count', '错误次数') + sChip('recent', '最近错误') + sChip('streak', '连对进度') +
        '<span style="flex:1"></span>' +
        '<span class="muted">共 <b>' + list.length + '</b> 词 · 连对 ' + target + ' 次自动移出</span>' +
        '<button class="btn primary" id="train"' + (list.length ? '' : ' disabled') + '>生词本强化测试</button>' +
        '<button class="btn" id="exp">导出 CSV</button>' +
        '<button class="btn danger" id="clr">清空生词本</button>' +
        '</div></div>' +
        '<div class="card">' + (list.length
          ? '<div class="scroll" style="max-height:none"><table class="table"><thead><tr><th>单词</th><th>音标/词性</th><th>释义</th><th>分类</th><th>错误次数</th><th>最近错误</th><th>连对</th><th>操作</th></tr></thead><tbody>' +
          list.map(function (x) {
            return '<tr><td><b>' + esc(x.w.t) + '</b></td>' +
              '<td class="muted">' + esc(x.w.ph || x.w.pu || '') + '<br>' + esc(x.w.p || '') + '</td>' +
              '<td>' + esc(x.w.m) + '</td>' +
              '<td>' + esc(x.w.cat || x.w.st || x.w.lv || '—') + '</td>' +
              '<td><b style="color:var(--bad)">' + x.nb.wrongCount + '</b></td>' +
              '<td class="muted">' + U.fmtAgo(x.nb.lastWrong) + '</td>' +
              '<td>' + esc(x.p.streak) + ' / ' + target + '</td>' +
              '<td style="white-space:nowrap"><button class="btn sm" data-rm="' + esc(x.w.__k) + '">移出</button> ' +
              '<button class="btn sm" data-train="' + esc(x.w.__k) + '">单独测</button></td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="empty"><div class="big">★</div>生词本为空，答错的单词会自动出现在这里</div>') +
        '</div>';

      U.$$('[data-s]', el).forEach(function (c) { c.onclick = function () { nbSort = c.getAttribute('data-s'); V.notebook.render(el); }; });
      U.$('#train').onclick = function () {
        var cfg = Object.assign({}, CFG, { source: 'notebook', learning: 'all', count: list.length, keys: [], bookIds: [], categories: [], levels: [] });
        WM.App.go('quiz');
        CFG.source = 'notebook'; CFG.count = Math.min(999, list.length);
        setTimeout(function () { startQuiz(cfgClone()); }, 30);
      };
      U.$('#exp').onclick = function () {
        var rows = [['word', 'phonetic', 'pos', 'meaning', 'category', 'wrong_count', 'last_wrong', 'example', 'example_cn']];
        list.forEach(function (x) {
          rows.push([x.w.t, x.w.ph, x.w.p, x.w.m, x.w.cat || x.w.st || '', x.nb.wrongCount, U.fmtDate(x.nb.lastWrong), x.w.ex, x.w.exc]);
        });
        var csv = rows.map(function (r) { return r.map(csvq).join(','); }).join('\r\n');
        U.download('生词本-' + U.today() + '.csv', '\uFEFF' + csv, 'text/csv');
      };
      U.$('#clr').onclick = function () {
        WM.modal({
          title: '清空生词本', body: '<p>将移除全部 ' + list.length + ' 个生词（学习进度保留）。</p>',
          actions: [{ label: '取消', cls: 'ghost' }, {
            label: '清空', cls: 'danger', onClick: function (close) {
              S.state.notebook = {}; S.saveSoon(); close(); WM.App.refresh(); WM.App.refreshSide();
            }
          }]
        });
      };
      U.$$('[data-rm]', el).forEach(function (b) {
        b.onclick = function () { S.toggleNotebook(b.getAttribute('data-rm')); WM.App.refresh(); WM.App.refreshSide(); };
      });
      U.$$('[data-train]', el).forEach(function (b) {
        b.onclick = function () {
          var cfg = cfgClone();
          cfg.source = 'keys'; cfg.keys = [b.getAttribute('data-train')]; cfg.count = 1; cfg.learning = 'all';
          cfg.levels = [];
          startQuiz(cfg, '单题强化');
        };
      });
      function sChip(v, t) { return '<button class="chip ' + (nbSort === v ? 'on' : '') + '" data-s="' + v + '">' + t + '</button>'; }
    }
  };
  function csvq(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

  /* ==================================================================== *
   * 统计
   * ==================================================================== */
  V.stats = {
    title: '统计概览', sub: '口径统一的进度 / 掌握度 / 正确率分析（判定规则见页面底部说明）',
    render: function (el) {
      var st = S.stats(), series = S.dailySeries(14);
      var weeks = S.weeklySeries(8), tr = S.trend(14);
      var cs = S.categoryStats(), weakList = S.weakWords(10);
      var max = Math.max.apply(null, series.map(function (d) { return d.count; }).concat([1]));
      var wmax = Math.max.apply(null, weeks.map(function (d) { return d.count; }).concat([1]));
      var LV = WM.Mastery.LEVELS, counts = {
        firm: st.firm, mastered: st.mastered, stable: st.stable, weak: st.weak, untouched: st.untouched
      };
      var lvColor = { firm: 'ok', mastered: 'ok', stable: 'warn', weak: '', untouched: '' };

      function foot(t, raw) { return '<div class="k" style="margin-top:4px">' + (raw ? t : esc(t)) + '</div>'; }
      function bar(pct, cls) {
        return '<div class="bar' + (cls ? ' ' + cls : '') + '"><i style="width:' + U.clamp(pct, 0, 100) + '%"></i></div>';
      }
      /** 环比变化：mode='pp' 用百分点，否则用百分比增幅 */
      function delta(cur, prev, mode) {
        if (!cur && !prev) return '<span class="muted">—</span>';
        var d = cur - prev;
        if (d === 0) return '<span class="muted">持平</span>';
        var good = d > 0, c = good ? 'var(--ok)' : 'var(--bad)';
        if (mode === 'pp') return '<span style="color:' + c + '">' + (good ? '↑' : '↓') + ' ' + Math.abs(d) + 'pp</span>';
        var rate = prev ? Math.round(Math.abs(d) / prev * 100) : null;
        return '<span style="color:' + c + '">' + (good ? '↑' : '↓') + ' ' + Math.abs(d) +
          (rate == null ? '（新增）' : '（' + rate + '%）') + '</span>';
      }

      el.innerHTML =
        /* ① 总览（口径：已学＝去重后实际作答过的词条；已掌握＝掌握度模型判定） */
        '<div class="grid g4">' +
        '<div class="stat brand"><div class="k">累计答题</div><div class="v">' + st.answered + '<small>题</small></div>' +
        foot('答对 ' + st.right + ' · 答错 ' + st.wrong) + '</div>' +
        '<div class="stat ok"><div class="k">累计正确率（作答等权）</div><div class="v">' + st.accuracy + '<small>%</small></div>' +
        foot('每次作答等权，会被重复刷题影响') + '</div>' +
        '<div class="stat"><div class="k">已学 / 总词条</div><div class="v">' + st.learned + '<small>/ ' + st.words + '</small></div>' +
        foot('覆盖 ' + st.learnedPct + '% · 未接触 ' + st.untouched + ' 词') + '</div>' +
        '<div class="stat purple"><div class="k">已完成测试</div><div class="v">' + st.tests + '<small>次</small></div>' +
        foot('连续学习 ' + st.dayStreak + ' 天') + '</div>' +
        '</div>' +

        /* ② 正确率的四种口径 */
        '<div class="card"><div class="card-hd"><h3>正确率：四种口径</h3>' +
        '<span class="desc">避免被重复刷题或极端小样本拉偏，建议以「词条等权」「近期加权」为主</span></div>' +
        '<div class="grid g4">' +
        '<div class="stat"><div class="k">① 累计正确率（作答等权）</div><div class="v">' + st.accuracy + '<small>%</small></div>' +
        foot(st.right + ' / ' + st.answered + ' 次作答') + '</div>' +
        '<div class="stat brand"><div class="k">② 词条等权正确率（去重）</div><div class="v">' + st.wordAccuracy + '<small>%</small></div>' +
        foot('每个词条等权，抗重复刷题') + '</div>' +
        '<div class="stat ok"><div class="k">③ 首次正确率</div><div class="v">' + st.firstAccuracy + '<small>%</small></div>' +
        foot('首见即答对 · 样本 ' + st.firstSample + ' 词') + '</div>' +
        '<div class="stat purple"><div class="k">④ 近期时间加权正确率</div><div class="v">' + st.recentAccuracy + '<small>%</small></div>' +
        foot('半衰期 ' + WM.Mastery.HALF_LIFE + ' 天，越近权重越高') + '</div>' +
        '</div></div>' +

        /* ③ 近 14 天答题量（原图表，保持不变） */
        '<div class="card"><div class="card-hd"><h3>近 14 天答题量</h3><span class="desc">柱高＝题数</span></div>' +
        '<div class="chart">' + series.map(function (d) {
          var h = Math.max(2, Math.round(d.count / max * 110));
          return '<div class="col" title="' + d.day + '：' + d.count + ' 题（对 ' + d.correct + '）">' +
            '<i style="height:' + h + 'px"></i><span>' + d.day.slice(5) + '</span></div>';
        }).join('') + '</div></div>' +

        /* ④ 学习趋势：本期 vs 上期 + 近 8 周走势 */
        '<div class="card"><div class="card-hd"><h3>学习趋势变化</h3>' +
        '<span class="desc">近 ' + tr.days + ' 天 vs 前 ' + tr.days + ' 天</span></div>' +
        '<div class="grid g4">' +
        '<div class="stat"><div class="k">答题量</div><div class="v">' + tr.count[0] + '<small>题</small></div>' +
        foot('上期 ' + tr.count[1] + ' · ' + delta(tr.count[0], tr.count[1]), 1) + '</div>' +
        '<div class="stat ' + (tr.accuracy[0] >= 80 ? 'ok' : '') + '"><div class="k">正确率</div><div class="v">' + tr.accuracy[0] + '<small>%</small></div>' +
        foot('上期 ' + tr.accuracy[1] + '% · ' + delta(tr.accuracy[0], tr.accuracy[1], 'pp'), 1) + '</div>' +
        '<div class="stat purple"><div class="k">活跃天数</div><div class="v">' + tr.activeDays[0] + '<small>天</small></div>' +
        foot('上期 ' + tr.activeDays[1] + ' 天 · ' + delta(tr.activeDays[0], tr.activeDays[1]), 1) + '</div>' +
        '<div class="stat brand"><div class="k">新接触词条</div><div class="v">' + tr.fresh[0] + '<small>词</small></div>' +
        foot('上期 ' + tr.fresh[1] + ' 词 · ' + delta(tr.fresh[0], tr.fresh[1]), 1) + '</div>' +
        '</div>' +
        '<div class="card-hd" style="margin-top:14px"><h3 style="font-size:13px">近 8 周答题量走势</h3>' +
        '<span class="desc">鼠标悬停查看该周题量与正确率</span></div>' +
        '<div class="chart">' + weeks.map(function (d) {
          var h = Math.max(2, Math.round(d.count / wmax * 90));
          return '<div class="col" title="' + d.label + '：' + d.count + ' 题 · 正确率 ' + d.accuracy + '%">' +
            '<i style="height:' + h + 'px"></i><span>' + d.label.slice(0, 5) + '</span></div>';
        }).join('') + '</div></div>' +

        /* ⑤ 掌握度分布（含遗忘曲线带来的「待复习」） */
        '<div class="card"><div class="card-hd"><h3>掌握程度分布</h3>' +
        '<span class="desc">平均掌握度 ' + st.masteryAvg + ' · 已掌握率 ' + st.masteredPct + '% · ' +
        '<b style="color:var(--warn)">待复习 ' + st.dueReview + ' 词</b>（保持率 < ' + Math.round(WM.Mastery.DUE_R * 100) + '%）</span></div>' +
        '<table class="table"><thead><tr><th style="width:110px">档位</th><th style="width:80px">词条</th><th style="width:70px">占比</th>' +
        '<th style="width:220px">分布</th><th>判定规则</th></tr></thead><tbody>' +
        LV.map(function (l) {
          var n = counts[l.id] || 0, p = st.words ? Math.round(n / st.words * 100) : 0;
          return '<tr><td><b>' + esc(l.name) + '</b></td><td>' + n + '</td><td>' + p + '%</td>' +
            '<td>' + bar(p, lvColor[l.id]) + '</td><td class="muted">' + esc(l.desc) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +

        /* ⑥ 知识点（分类）维度：加权 + 平滑后的掌握情况 */
        '<div class="card"><div class="card-hd"><h3>知识点（分类）掌握情况</h3>' +
        '<span class="desc">正确率为贝叶斯平滑值（向全局 ' + Math.round(cs.globalAcc * 100) + '% 收缩，κ=' + WM.Mastery.KAPPA + '），避免小样本极值</span></div>' +
        (cs.list.length
          ? '<table class="table"><thead><tr><th>分类</th><th>词条</th><th>已学</th><th>已掌握</th><th>加权正确率</th>' +
          '<th>平均掌握度</th><th style="width:170px">学习进度</th></tr></thead><tbody>' +
          cs.list.map(function (c) {
            return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + c.total + '</td><td>' + c.learned + '</td><td>' + c.mastered + '</td>' +
              '<td>' + Math.round(c.acc * 100) + '%</td><td>' + c.mastery + '</td>' +
              '<td>' + bar(c.learnedPct, c.learnedPct >= 100 ? 'ok' : '') +
              '<span class="muted" style="font-size:11.5px">' + c.learnedPct + '%</span></td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">还没有分类数据</div>') +
        '</div>' +

        /* ⑦ 薄弱知识点分布 */
        '<div class="card"><div class="card-hd"><h3>薄弱知识点分布</h3>' +
        '<span class="desc">薄弱指数 = 45%×未掌握占比 + 30%×正确率缺口 + 15%×生词占比 + 10%×未接触占比</span></div>' +
        '<div class="grid g2">' +
        '<div>' +
        (cs.list.length
          ? '<table class="table"><thead><tr><th>薄弱分类</th><th>词条</th><th>薄弱指数</th><th style="width:120px"></th></tr></thead><tbody>' +
          cs.list.slice(0, 6).map(function (c) {
            return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + c.total + '</td><td>' + c.weakIdx + '</td>' +
              '<td>' + bar(c.weakIdx) + '</td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">暂无数据</div>') +
        '</div>' +
        '<div>' +
        (weakList.length
          ? '<table class="table"><thead><tr><th>待攻克词条</th><th>分类</th><th>错误</th><th>掌握度</th><th>最近作答</th></tr></thead><tbody>' +
          weakList.map(function (x) {
            return '<tr><td><b title="' + esc(x.w.m) + '">' + esc(x.w.t) + '</b></td>' +
              '<td>' + esc(x.w.cat || x.w.st || x.w.lv || '—') + '</td>' +
              '<td><b style="color:var(--bad)">' + x.p.wrong + '</b></td>' +
              '<td>' + x.m.score + '</td><td class="muted">' + U.fmtAgo(x.p.lastTest) + '</td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">暂无易错词条，继续保持 💪</div>') +
        '</div>' +
        '</div></div>' +

        /* ⑧ 测试历史（保持不变） */
        '<div class="card"><div class="card-hd"><h3>测试历史（最近 12 次）</h3></div>' +
        (S.state.history.length
          ? '<table class="table"><thead><tr><th>时间</th><th>范围/配置</th><th>题量</th><th>正确</th><th>正确率</th><th>用时</th><th>备注</th></tr></thead><tbody>' +
          S.state.history.slice(-12).reverse().map(function (h) {
            return '<tr><td>' + U.fmtDate(h.startedAt) + '</td><td>' + esc(h.label) + '</td><td>' + h.total +
              '</td><td>' + h.correct + '</td><td>' + Math.round(h.correct / h.total * 100) + '%</td><td>' + dur(h) + '</td>' +
              '<td>' + (h.aborted ? '<span class="tag y">提前结束</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">暂无记录</div>') +
        '</div>' +

        /* ⑨ 口径说明 */
        '<div class="card"><div class="card-hd"><h3>统计口径说明</h3><span class="desc">统一定义，避免同名指标口径不一</span></div>' +
        '<table class="table"><thead><tr><th style="width:150px">指标</th><th>定义与判定规则</th></tr></thead><tbody>' +
        RULES.map(function (r) {
          return '<tr><td><b>' + esc(r[0]) + '</b></td><td class="muted">' + esc(r[1]) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +

        '<div class="card"><div class="muted">本地存储占用：约 ' + st.storageKB + ' KB' +
        (S.storageOK ? '' : '（写入失败，请尽快导出备份）') + '</div></div>';
    }
  };

  /* 统计口径说明表：与 WM.Mastery 中的常量严格对应 */
  var RULES = [
    ['已学', '当前词库中「至少作答过 1 次」的去重词条数（按词条主键去重；同一词被多个词库引用只算一次；手动标记已学但从未作答的不计入）'],
    ['已掌握', '掌握度 M ≥ ' + WM.Mastery.MASTER_M + ' 且同时满足：作答样本 ≥ ' + WM.Mastery.MIN_SAMPLE +
      ' 次、连对数 ≥ 目标值（默认 3）、时间加权正确率 ≥ ' + Math.round(WM.Mastery.ACC_GATE * 100) + '%'],
    ['掌握度 M', 'M = 100 × (0.35×连对度 C + 0.30×时间加权正确率 A + 0.20×复习间隔达标度 I + 0.15×难度表现 D) × (0.45 + 0.55×保持率 R)'],
    ['连对度 C', 'min(1, 当前连对数 / min(目标连对数 + 2, 6))；答错即清零重来'],
    ['时间加权正确率 A', '0.65 × EWMA(α=0.4，最近一次作答权重最高) + 0.35 × 累计正确率；旧数据无 EWMA 时退化为累计正确率'],
    ['复习间隔达标度 I', '0.5 + 0.5 × min(1, 已成功跨越的最长复习间隔 / 期望间隔)；期望间隔 = 1.5 × 2^(min(连对数,8)-1) 天，连对越多要求间隔越长'],
    ['保持率 R（遗忘曲线）', 'R = 2^(-Δt / H)，Δt 为距上次答对的天数，半衰期 H = 期望间隔；久不复习 M 会随之衰减，直到跌出「已掌握」'],
    ['难度表现 D', '做过填空题则取填空正确率（填空为高难度题型），否则取综合正确率 A'],
    ['累计正确率', 'Σ答对 / Σ作答，每次作答等权；重复刷同一批词会拉高或拉低此值，仅作参考'],
    ['词条等权正确率', '先算每个词条的时间加权正确率，再对所有已接触词条等权平均；一个词练 20 次也只占 1 份权重，抗重复刷题'],
    ['首次正确率', '首次接触该词即答对的比例（分母为有首答记录的词条数）；反映初见难度，与刷题次数无关'],
    ['近期时间加权正确率', '按测试记录距今时间指数加权，半衰期 7 天；反映当前真实水平'],
    ['知识点加权正确率', '分类内 (答对 + κ×全局正确率) / (作答 + κ)，κ = 8；样本量小的分类向全局水平收缩'],
    ['薄弱指数', '45%×未掌握占比 + 30%×正确率缺口 + 15%×生词占比 + 10%×未接触占比，取值 0~100，越高越需优先攻克'],
    ['待复习', '曾答对过、但当前记忆保持率 R < 50% 的词条数，即按遗忘曲线已到复习时点的词（从未答对的归入「薄弱」）'],
    ['新接触词条', '本期测试记录中首次出现、且上期及更早记录中均未出现过的词条数（依据本地保留的历史记录统计）']
  ];

  /* ==================================================================== *
   * 设置与备份
   * ==================================================================== */
  V.settings = {
    title: '设置与备份', sub: '出题偏好、生词本规则、数据导入导出',
    render: function (el) {
      var s = S.state.settings;
      el.innerHTML =
        '<div class="grid g2">' +
        '<div class="card"><div class="card-hd"><h3>出题偏好</h3></div>' +
        '<div class="row"><label class="fld" style="width:auto">默认题量</label><input type="number" id="st-count" value="' + s.defaultCount + '" style="max-width:110px"></div>' +
        '<div class="row" style="margin-top:10px"><label class="fld" style="width:auto">默认顺序</label>' +
        '<select id="st-order" style="max-width:150px"><option value="random"' + (s.order === 'random' ? ' selected' : '') + '>随机</option>' +
        '<option value="seq"' + (s.order === 'seq' ? ' selected' : '') + '>按导入顺序</option></select></div>' +
        '<div class="row" style="margin-top:10px"><label class="fld" style="width:auto">默认方向</label>' +
        '<select id="st-dir" style="max-width:150px"><option value="mix">混合</option><option value="en2cn"' + (s.direction === 'en2cn' ? ' selected' : '') + '>英→中</option>' +
        '<option value="cn2en"' + (s.direction === 'cn2en' ? ' selected' : '') + '>中→英</option></select></div>' +
        '<div class="row" style="margin-top:10px"><label class="chip"><input type="checkbox" id="st-c"' + (s.types.choice ? ' checked' : '') + '>启用单选题</label>' +
        '<label class="chip"><input type="checkbox" id="st-f"' + (s.types.fill ? ' checked' : '') + '>启用填空题</label>' +
        '<label class="chip"><input type="checkbox" id="st-ph"' + (s.showPhonetic ? ' checked' : '') + '>题干显示音标</label></div>' +
        '</div>' +
        '<div class="card"><div class="card-hd"><h3>生词本与目标</h3></div>' +
        '<div class="row"><label class="fld" style="width:auto">连续答对</label><input type="number" id="st-streak" min="1" max="10" value="' + s.streakTarget + '" style="max-width:90px">' +
        '<span class="muted">次后自动移出生词本</span></div>' +
        '<div class="row" style="margin-top:10px"><label class="fld" style="width:auto">每日目标</label>' +
        '<input type="number" id="st-goal" min="5" max="500" value="' + s.dailyGoal + '" style="max-width:90px"><span class="muted">题</span></div>' +
        '<div class="row" style="margin-top:10px"><label class="chip"><input type="checkbox" id="st-auto"' + (s.autoNotebook ? ' checked' : '') + '>答错自动加入生词本</label></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" id="save">保存偏好</button></div>' +
        '</div></div>' +

        '<div class="card"><div class="card-hd"><h3>数据备份与迁移<span class="desc"> 全离线：备份文件就是 JSON，可自行保存/搬运</span></h3></div>' +
        '<div class="row">' +
        '<button class="btn" id="bk-full">导出完整备份（含词库）</button>' +
        '<button class="btn" id="bk-light">导出学习进度（不含词库）</button>' +
        '<button class="btn" id="bk-in">导入备份文件…</button>' +
        '<input type="file" id="bk-file" accept=".json" hidden>' +
        '<span style="flex:1"></span>' +
        '<button class="btn danger" id="clr-prog">清空学习进度</button>' +
        '<button class="btn danger" id="clr-all">清空全部数据</button>' +
        '</div>' +
        '<div class="muted" style="margin-top:8px">当前占用：约 ' + S.bookStorageSize() + ' KB；浏览器对单站点的本地存储通常限制在 5 MB 左右，' +
        '若词条极多建议定期导出备份。数据只保存在本机浏览器，清理浏览器数据会丢失，请善用导出。</div></div>';

      U.$('#save').onclick = function () {
        s.defaultCount = U.clamp(parseInt(U.$('#st-count').value, 10) || 20, 1, 500);
        s.order = U.$('#st-order').value;
        s.direction = U.$('#st-dir').value;
        s.types.choice = U.$('#st-c').checked; s.types.fill = U.$('#st-f').checked;
        s.showPhonetic = U.$('#st-ph').checked;
        s.streakTarget = U.clamp(parseInt(U.$('#st-streak').value, 10) || 3, 1, 10);
        s.dailyGoal = U.clamp(parseInt(U.$('#st-goal').value, 10) || 40, 5, 500);
        s.autoNotebook = U.$('#st-auto').checked;
        CFG.count = s.defaultCount; CFG.order = s.order; CFG.direction = s.direction;
        CFG.types = { choice: s.types.choice, fill: s.types.fill };
        S.save(); WM.toast('偏好已保存', 'ok');
      };
      U.$('#bk-full').onclick = function () { U.download('wordmaster-备份-含词库-' + U.today() + '.json', S.exportBackup(true), 'application/json'); };
      U.$('#bk-light').onclick = function () { U.download('wordmaster-进度备份-' + U.today() + '.json', S.exportBackup(false), 'application/json'); };
      U.$('#bk-in').onclick = function () { U.$('#bk-file').click(); };
      U.$('#bk-file').onchange = function () {
        var f = this.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var data;
          try { data = JSON.parse(r.result); } catch (e) { WM.toast('不是合法 JSON 文件', 'bad'); return; }
          if (!data || data.app !== 'wordmaster') { WM.toast('不是 WordMaster 备份文件', 'bad'); return; }
          var hasLib = !!data.books && !!data.words;
          var restore = function (withLib) {
            try {
              S.importBackup(JSON.stringify(data), withLib);
            } catch (e2) { WM.toast('导入失败：' + e2.message, 'bad'); return; }
            WM.toast('备份已恢复' + (withLib ? '（含词库）' : '（仅进度）'), 'ok');
            WM.App.refresh(); WM.App.refreshSide();
          };
          if (hasLib) {
            WM.modal({
              title: '导入备份',
              body: '<p>该备份包含词库（' + (data.books.length) + ' 个词库）。请选择恢复方式：</p>',
              actions: [
                { label: '仅恢复进度/生词本/历史', cls: '', onClick: function (c) { c(); restore(false); } },
                { label: '连同词库一起恢复', cls: 'primary', onClick: function (c) { c(); restore(true); } }
              ]
            });
          } else restore(false);
        };
        r.readAsText(f, 'utf-8');
      };
      U.$('#clr-prog').onclick = function () {
        WM.modal({
          title: '清空学习进度', body: '<p>将清除所有答题记录、生词本与学习状态，<b>词库保留</b>。</p>',
          actions: [{ label: '取消', cls: 'ghost' }, {
            label: '确认清空', cls: 'danger', onClick: function (close) {
              S.clearProgress(); close(); WM.App.refresh(); WM.App.refreshSide(); WM.toast('学习进度已清空', 'ok');
            }
          }]
        });
      };
      U.$('#clr-all').onclick = function () {
        WM.modal({
          title: '清空全部数据', body: '<p style="color:var(--bad)">⚠️ 将删除全部词库、进度、生词本与历史，且无法撤销。建议先导出完整备份。</p>',
          actions: [{ label: '取消', cls: 'ghost' }, {
            label: '我已备份，确认清空', cls: 'danger', onClick: function (close) {
              S.clearAll(); close(); WM.App.go('import'); WM.App.refreshSide();
            }
          }]
        });
      };
    }
  };
})(window);
