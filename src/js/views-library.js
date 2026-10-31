/* =========================================================================
 * WordMaster · views-library.js
 * 模块职责：词库管理 / 词条浏览 / 词库导入（分批、多格式、去重与纠错）
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM, U = WM.util, S = WM.Store, V = WM.views = WM.views || {};

  function esc(s) { return U.esc(s); }

  /* ==================================================================== *
   * 视图：词库管理
   * ==================================================================== */
  V.books = {
    title: '词库管理', sub: '按分类自建词库，支持分批次多次导入同一个词库',
    render: function (el) {
      var st = S.state;
      if (!st.books.length) {
        el.innerHTML =
          '<div class="card"><div class="empty"><div class="big">📚</div>' +
          '<p>还没有任何词库。点击右上角「新建词库」或前往「导入词库」。</p>' +
          '<button class="btn primary" id="go-import">去导入词库</button></div></div>';
        U.$('#go-import', el).onclick = function () { WM.App.go('import'); };
        WM.App.setActions('<button class="btn primary" id="new-book">＋ 新建词库</button>' +
          '<button class="btn" id="imp">⇩ 导入词库</button>');
        U.$('#new-book').onclick = newBookDialog;
        U.$('#imp').onclick = function () { WM.App.go('import'); };
        return;
      }
      var html = '<div class="grid g3">';
      st.books.forEach(function (b) {
        var ws = S.bookWords(b.id), total = ws.length, learned = 0, mastered = 0, nb = 0;
        ws.forEach(function (w) {
          var p = S.state.progress[w.__k];
          if (p && p.learned) learned++;
          if (S.isMastered(w.__k)) mastered++;
          if (S.state.notebook[w.__k]) nb++;
        });
        var pct = total ? Math.round(learned / total * 100) : 0;
        html += '<div class="book">' +
          '<div class="row" style="justify-content:space-between">' +
          '<h4>' + esc(b.name) + '</h4><span class="tag c">' + esc(b.category || '未分类') + '</span></div>' +
          '<div class="meta">' + total + ' 词条 · 导入顺序保留 · 更新于 ' + U.fmtAgo(b.updatedAt) + '</div>' +
          (b.note ? '<div class="meta">' + esc(b.note) + '</div>' : '') +
          '<div class="bar ' + (pct >= 80 ? 'ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
          '<div class="meta">已学 ' + learned + '/' + total + '（' + pct + '%）· 已掌握 ' + mastered + ' · 生词 ' + nb + '</div>' +
          '<div class="row">' +
          '<button class="btn sm primary" data-open="' + b.id + '">浏览词条</button>' +
          '<button class="btn sm" data-rename="' + b.id + '">重命名/改分类</button>' +
          '<button class="btn sm" data-export="' + b.id + '">导出 CSV</button>' +
          '<button class="btn sm danger" data-del="' + b.id + '">删除</button>' +
          '</div></div>';
      });
      html += '</div>';
      el.innerHTML = html;

      WM.App.setActions('<button class="btn primary" id="new-book">＋ 新建词库</button>' +
        '<button class="btn" id="imp">⇩ 导入词库</button>');
      U.$('#new-book').onclick = newBookDialog;
      U.$('#imp').onclick = function () { WM.App.go('import'); };

      U.$$('[data-open]', el).forEach(function (btn) {
        btn.onclick = function () { WM.App.go('words', { id: btn.getAttribute('data-open') }); };
      });
      U.$$('[data-rename]', el).forEach(function (btn) {
        btn.onclick = function () { renameBookDialog(btn.getAttribute('data-rename')); };
      });
      U.$$('[data-export]', el).forEach(function (btn) {
        btn.onclick = function () { exportBook(btn.getAttribute('data-export')); };
      });
      U.$$('[data-del]', el).forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute('data-del'), b = S.getBook(id);
          WM.modal({
            title: '删除词库', size: '',
            body: '<p>确定删除《' + esc(b.name) + '》吗？该词库独有的词条与其学习记录会一并删除；' +
              '与其他词库共有的词条会保留。</p>',
            actions: [
              { label: '取消', cls: 'ghost' },
              {
                label: '删除', cls: 'danger', onClick: function (close) {
                  S.removeBook(id); close(); WM.toast('已删除词库', 'ok'); WM.App.refresh();
                }
              }]
          });
        };
      });
    }
  };

  function newBookDialog() {
    WM.modal({
      title: '新建空词库',
      body: '<div class="fld"><label class="fld">词库名称</label><input type="text" id="bk-name" placeholder="如：CET-4 核心词"></div>' +
        '<div class="fld" style="margin-top:10px"><label class="fld">所属分类（如 初高中 / CET-4 / 考研）</label>' +
        '<input type="text" id="bk-cat" placeholder="CET-4"></div>',
      actions: [{ label: '取消', cls: 'ghost' }, {
        label: '创建', cls: 'primary', onClick: function (close) {
          var n = U.$('#bk-name').value.trim(), c = U.$('#bk-cat').value.trim();
          if (!n) { WM.toast('请填写词库名称', 'bad'); return; }
          S.createBook(n, c || '未分类');
          close(); WM.toast('词库已创建，可到「导入词库」往里面加词', 'ok'); WM.App.refresh();
        }
      }]
    });
    setTimeout(function () { U.$('#bk-name').focus(); }, 30);
  }
  V.newBookDialog = newBookDialog;

  function renameBookDialog(id) {
    var b = S.getBook(id); if (!b) return;
    WM.modal({
      title: '重命名词库',
      body: '<label class="fld">名称</label><input type="text" id="rn-name" value="' + esc(b.name) + '">' +
        '<label class="fld" style="margin-top:10px">分类</label><input type="text" id="rn-cat" value="' + esc(b.category) + '">',
      actions: [{ label: '取消', cls: 'ghost' }, {
        label: '保存', cls: 'primary', onClick: function (close) {
          S.renameBook(id, U.$('#rn-name').value.trim() || b.name, U.$('#rn-cat').value.trim());
          close(); WM.toast('已更新', 'ok'); WM.App.refresh();
        }
      }]
    });
  }

  function exportBook(id) {
    var b = S.getBook(id); if (!b) return;
    var cols = ['index', 'word', 'phonetic', 'phonetic_us', 'pos', 'meaning', 'collocation',
      'derivative', 'example', 'example_cn', 'level', 'stage', 'freq_rank'];
    var map = { word: 't', phonetic: 'ph', phonetic_us: 'pu', pos: 'p', meaning: 'm', collocation: 'co', derivative: 'dv', example: 'ex', example_cn: 'exc', level: 'lv', stage: 'st', freq_rank: 'fr' };
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var out = [cols.join(',')];
    S.bookWords(id).forEach(function (w, i) {
      out.push(cols.map(function (c) {
        if (c === 'index') return i + 1;
        return q(w[map[c]] || (c === 'stage' ? w.st : ''));
      }).join(','));
    });
    U.download(b.name + '.csv', '\uFEFF' + out.join('\r\n'), 'text/csv');
    WM.toast('已导出 ' + b.name + '.csv', 'ok');
  }

  /* ==================================================================== *
   * 视图：词条浏览
   * ==================================================================== */
  var browseState = { q: '', filter: 'all', limit: 120 };

  V.words = {
    title: '词条浏览', actionsSticky: true,
    render: function (el, params) {
      params = params || {};
      var book = S.getBook(params.id);
      if (!book) { el.innerHTML = '<div class="card"><div class="empty">未找到该词库</div></div>'; return; }
      this.sub = '《' + book.name + '》 · ' + book.category;
      browseState.limit = 120;
      el.innerHTML =
        '<div class="card">' +
        '<div class="row">' +
        '<input type="search" id="q" placeholder="搜索单词 / 释义 / 例句（/ 聚焦）" style="max-width:320px" value="' + esc(browseState.q) + '">' +
        '<button class="chip ' + (browseState.filter === 'all' ? 'on' : '') + '" data-f="all">全部</button>' +
        '<button class="chip ' + (browseState.filter === 'unlearned' ? 'on' : '') + '" data-f="unlearned">未学</button>' +
        '<button class="chip ' + (browseState.filter === 'learned' ? 'on' : '') + '" data-f="learned">已学</button>' +
        '<button class="chip ' + (browseState.filter === 'mastered' ? 'on' : '') + '" data-f="mastered">已掌握</button>' +
        '<button class="chip nb ' + (browseState.filter === 'notebook' ? 'on' : '') + '" data-f="notebook">生词本</button>' +
        '<span class="muted" id="cnt"></span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn sm" id="mk-learned">标记当前为已学</button>' +
        '<button class="btn sm" id="mk-unlearned">标记当前为未学</button>' +
        '</div></div>' +
        '<div class="card"><div class="scroll" id="tbl"></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn sm" id="more">加载更多 (每页 120)</button><span class="muted" id="tipmore"></span></div></div>';

      WM.App.setActions('<button class="btn" id="back-books">← 返回词库</button>');
      U.$('#back-books').onclick = function () { WM.App.go('books'); };

      var input = U.$('#q', el);
      input.oninput = function () { browseState.q = input.value.trim(); draw(); };
      U.$$('[data-f]', el).forEach(function (c) {
        c.onclick = function () { browseState.filter = c.getAttribute('data-f'); browseState.limit = 120; V.words.render(el, params); };
      });
      U.$('#more').onclick = function () { browseState.limit += 120; draw(); };
      U.$('#mk-learned').onclick = function () { markCurrent(true); };
      U.$('#mk-unlearned').onclick = function () { markCurrent(false); };

      function currentList() {
        var ws = S.bookWords(book.id);
        if (browseState.filter === 'learned') ws = ws.filter(function (w) { return S.isLearned(w.__k); });
        if (browseState.filter === 'unlearned') ws = ws.filter(function (w) { return !S.isLearned(w.__k); });
        if (browseState.filter === 'mastered') ws = ws.filter(function (w) { return S.isMastered(w.__k); });
        if (browseState.filter === 'notebook') ws = ws.filter(function (w) { return S.state.notebook[w.__k]; });
        if (browseState.q) {
          var q = browseState.q.toLowerCase();
          ws = ws.filter(function (w) {
            return (w.t + ' ' + w.m + ' ' + w.ex + ' ' + w.exc).toLowerCase().indexOf(q) >= 0;
          });
        }
        return ws;
      }
      function markCurrent(flag) {
        var list = currentList();
        S.markLearned(list.map(function (w) { return w.__k; }), flag);
        WM.toast('已将 ' + list.length + ' 个词条标记为' + (flag ? '已学' : '未学'), 'ok');
        draw();
      }
      function draw() {
        var ws = currentList(), slice = ws.slice(0, browseState.limit);
        U.$('#cnt').textContent = '共 ' + ws.length + ' 条';
        U.$('#tipmore').textContent = slice.length < ws.length ? '（显示 ' + slice.length + ' / ' + ws.length + '）' : '';
        var rows = slice.map(function (w) {
          var p = S.state.progress[w.__k] || {}, nb = S.state.notebook[w.__k];
          var status = [];
          if (p.learned) status.push('<span class="tag g">已学</span>');
          if (S.isMastered(w.__k)) status.push('<span class="tag">掌握 ×' + p.streak + '</span>');
          if (nb) status.push('<span class="tag y">生词 ' + nb.wrongCount + ' 次</span>');
          if (p.seen) status.push('<span class="muted" style="font-size:11.5px">正确率 ' + Math.round(p.right / p.seen * 100) + '%</span>');
          return '<tr>' +
            '<td><b>' + esc(w.t) + '</b><div class="muted" style="font-size:11.5px">' + esc(w.ph || w.pu || '') + '</div></td>' +
            '<td>' + esc(w.p || '') + '</td>' +
            '<td>' + esc(w.m) + '</td>' +
            '<td>' + esc(w.cat || w.st || w.lv || '') + '</td>' +
            '<td>' + status.join(' ') + '</td>' +
            '<td style="white-space:nowrap">' +
            '<button class="btn sm" data-nb="' + esc(w.__k) + '">' + (nb ? '移出生词本' : '加入生词本') + '</button> ' +
            '<button class="btn sm" data-ln="' + esc(w.__k) + '">' + (p.learned ? '标记未学' : '标记已学') + '</button>' +
            '</td></tr>';
        }).join('');
        U.$('#tbl', el).innerHTML =
          '<table class="table"><thead><tr><th>单词</th><th>词性</th><th>释义</th><th>分类</th><th>状态</th><th>操作</th></tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="6" class="muted">没有匹配的词条</td></tr>') + '</tbody></table>';
        U.$$('[data-nb]', el).forEach(function (b) {
          b.onclick = function () { S.toggleNotebook(b.getAttribute('data-nb')); WM.App.refreshSide(); draw(); };
        });
        U.$$('[data-ln]', el).forEach(function (b) {
          b.onclick = function () {
            var k = b.getAttribute('data-ln');
            S.prog(k).learned = !S.prog(k).learned; S.saveSoon(); draw(); WM.App.refreshSide();
          };
        });
      }
      draw();
      browseState.draw = draw;
    },
    onKey: function (e) {
      if (e.key === '/') { var q = U.$('#q'); if (q) { q.focus(); q.select(); return true; } }
      return false;
    }
  };

  /* ==================================================================== *
   * 视图：导入词库
   * ==================================================================== */
  var IM = {
    files: [], enc: 'auto', sheetIndex: {},
    targetMode: 'merge', targetBookId: '', newName: '', newCat: '',
    catMode: 'column', catColumn: '', catValue: '', dupMode: 'skip',
    mapping: null, unionHeaders: []
  };

  function extOf(name) { var i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }

  function parseFile(file, cb) {
    var ext = extOf(file.name);
    if (ext === 'xlsx' || ext === 'xlsm') {
      WM.readXlsx(file).then(function (res) {
        cb(null, { name: file.name, kind: 'xlsx', sheets: res.sheets, sheetIndex: 0 });
      }).catch(cb);
      return;
    }
    WM.readFileText(file, IM.enc === 'auto' ? 'utf-8' : IM.enc).then(function (t0) {
      var p = IM.enc === 'auto' && t0 && t0.indexOf('\uFFFD') >= 0
        ? WM.readFileText(file, 'gbk').then(function (t) { return t; }).catch(function () { return t0; })
        : Promise.resolve(t0);
      return p.then(function (text) {
        if (ext === 'json') {
          var t = WM.parser.parseJSONText(text);
          cb(null, { name: file.name, kind: 'json', sheets: [{ name: 'JSON', headers: t.headers, rows: t.rows, hasHeader: t.hasHeader }], sheetIndex: 0 });
        } else {
          var delim = ext === 'tsv' ? '\t' : WM.parser.detectDelimiter(text);
          var arr = WM.parser.parseDelimited(text, delim);
          var t2 = WM.parser.toObjects(arr);
          cb(null, { name: file.name, kind: 'delimited', delim: delim, sheets: [{ name: file.name, headers: t2.headers, rows: t2.rows, hasHeader: t2.hasHeader }], sheetIndex: 0 });
        }
      });
    }).catch(cb);
  }

  /** 合并所有选中文件的表头，并给出统一的字段映射（缺列自动留空） */
  function rebuildHeaders() {
    var set = {}, order = [];
    IM.files.forEach(function (f) {
      var sh = f.sheets[f.sheetIndex || 0];
      (sh.headers || []).forEach(function (h) { if (!set[h]) { set[h] = 1; order.push(h); } });
    });
    IM.unionHeaders = order;
    var guess = WM.parser.guessMapping(order);
    IM.mapping = IM.mapping || {};
    Object.keys(guess).forEach(function (k) { if (IM.mapping[k] == null) IM.mapping[k] = guess[k] || ''; });
    if (!IM.catColumn) IM.catColumn = IM.mapping.stage || IM.mapping.level || IM.mapping.category || '';
  }

  function activeRows() {
    var rows = [];
    IM.files.forEach(function (f) {
      var sh = f.sheets[f.sheetIndex || 0];
      (sh.rows || []).forEach(function (r) { rows.push({ __file: f.name, row: r }); });
    });
    return rows;
  }

  function preview() {
    var rows = activeRows().map(function (x) { return x.row; });
    return WM.buildWords(rows, IM.mapping, {
      categoryMode: IM.catMode, categoryColumn: IM.catColumn, categoryValue: IM.catValue
    });
  }

  V.import = {
    title: '导入词库', sub: '支持 CSV / TSV / JSON / Excel(.xlsx)，一次可选多个文件，可分批次追加到同一词库',
    render: function (el) {
      el.innerHTML =
        '<div class="card"><div class="card-hd"><h3>① 选择文件<span class="desc"> 可多选，也可以拖到这里；同一批文件会按先后顺序追加</span></h3></div>' +
        '<div class="drop" id="drop">点击选择文件，或把文件拖到这里<br><small class="muted">.csv / .tsv / .txt / .json / .xlsx / .xlsm 均可</small></div>' +
        '<input type="file" id="file" multiple hidden accept=".csv,.tsv,.txt,.json,.xlsx,.xlsm">' +
        '<div class="row" style="margin-top:10px"><label class="fld" style="width:auto">文件编码</label>' +
        '<select id="enc" style="max-width:150px"><option value="auto">自动识别</option><option value="utf-8">UTF-8</option><option value="gbk">GBK / 国标</option></select>' +
        '<span class="muted" id="files-meta"></span></div>' +
        '<div id="filelist" style="margin-top:8px"></div></div>' +
        '<div class="card" id="cfg" hidden></div>' +
        '<div class="card" id="rep" hidden></div>';

      var fileInput = U.$('#file', el), drop = U.$('#drop', el);
      drop.onclick = function () { fileInput.click(); };
      fileInput.onchange = function () { addFiles(fileInput.files); fileInput.value = ''; };
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
      U.$('#enc', el).onchange = function () {
        IM.enc = U.$('#enc', el).value;
        if (IM.files.length) { IM.files = []; drawFiles('<b>已切换编码，请重新选择文件</b>'); U.$('#cfg').hidden = true; U.$('#rep').hidden = true; }
      };
      addFiles(window.__WM_PENDING_FILES__ || null);

      function drawFiles(msg) {
        U.$('#files-meta', el).innerHTML = msg || ('已选 ' + IM.files.length + ' 个文件，共 ' + activeRows().length + ' 行数据');
        U.$('#filelist', el).innerHTML = IM.files.map(function (f, i) {
          var sh = f.sheets.length > 1
            ? ' <select data-sheet="' + i + '">' + f.sheets.map(function (s, j) {
              return '<option value="' + j + '"' + (j === (f.sheetIndex || 0) ? ' selected' : '') + '>' + esc(s.name) + '（' + s.rows.length + ' 行）</option>';
            }).join('') + '</select>' : '';
          return '<div class="row" style="padding:4px 0;border-bottom:1px solid var(--line2)">' +
            '<span class="tag c">' + esc(f.kind.toUpperCase()) + '</span><b>' + esc(f.name) + '</b>' +
            '<span class="muted">' + (f.sheets[f.sheetIndex || 0].rows.length) + ' 行</span>' + sh +
            '<span style="flex:1"></span><button class="btn sm danger" data-rm="' + i + '">移除</button></div>';
        }).join('');
        U.$$('[data-rm]', el).forEach(function (b) {
          b.onclick = function () {
            IM.files.splice(parseInt(b.getAttribute('data-rm'), 10), 1);
            rebuildHeaders(); drawFiles(); drawCfg(); drawReport(); WM.App.refreshSide();
          };
        });
        U.$$('[data-sheet]', el).forEach(function (s) {
          s.onchange = function () {
            IM.files[parseInt(s.getAttribute('data-sheet'), 10)].sheetIndex = parseInt(s.value, 10);
            rebuildHeaders(); drawFiles(); drawCfg(); drawReport();
          };
        });
      }

      function addFiles(list) {
        if (!list || !list.length) { drawFiles(); return; }
        var arr = Array.prototype.slice.call(list), jobs = [];
        arr.forEach(function (f, idx) {
          jobs.push(new Promise(function (res) {
            parseFile(f, function (err, parsed) {
              if (err) { WM.toast(f.name + ' 解析失败：' + err.message, 'bad'); res(); return; }
              IM.files.push(parsed); res();
            });
          }));
        });
        Promise.all(jobs).then(function () {
          rebuildHeaders(); drawFiles(); drawCfg(); drawReport(); WM.App.refreshSide();
          if (IM.files.length) WM.toast('解析完成，请确认字段映射', 'ok');
        });
      }

      /* ---------- 配置区 ---------- */
      function drawCfg() {
        var box = U.$('#cfg', el);
        if (!IM.files.length) { box.hidden = true; return; }
        box.hidden = false;
        var bookOpts = S.state.books.map(function (b) {
          return '<option value="' + b.id + '"' + (IM.targetBookId === b.id ? ' selected' : '') + '>' + esc(b.name) + '（' + esc(b.category) + ' · ' + b.wordKeys.length + ' 词）</option>';
        }).join('');
        var fields = Object.keys(WM.parser.FIELD_LABEL);
        box.innerHTML =
          '<div class="card-hd"><h3>② 导入设置</h3></div>' +
          '<div class="grid g2">' +
          '<div>' +
          '<label class="fld">目标词库</label>' +
          '<div class="row"><label class="chip ' + (IM.targetMode === 'merge' ? 'on' : '') + '"><input type="radio" name="tm" value="merge" hidden' + (IM.targetMode === 'merge' ? ' checked' : '') + '>合并到一个词库</label>' +
          '<label class="chip ' + (IM.targetMode === 'each' ? 'on' : '') + '"><input type="radio" name="tm" value="each" hidden' + (IM.targetMode === 'each' ? ' checked' : '') + '>每个文件各建一词库</label></div>' +
          (IM.targetMode === 'merge'
            ? '<div class="row" style="margin-top:8px"><select id="tbook" style="max-width:260px">' + bookOpts + '</select>' +
            '<button class="btn sm" id="newbk">＋ 新建词库并导入</button></div>'
            : '<div class="row" style="margin-top:8px"><input type="text" id="newcat" placeholder="统一分类，如 CET-4" value="' + esc(IM.newCat) + '" style="max-width:260px"></div>') +
          '<div class="row" style="margin-top:10px"><label class="fld" style="width:auto">重复词处理</label>' +
          '<select id="dup" style="max-width:230px">' +
          '<option value="skip"' + (IM.dupMode === 'skip' ? ' selected' : '') + '>跳过已有内容（仅补空缺字段 + 归入本词库）</option>' +
          '<option value="overwrite"' + (IM.dupMode === 'overwrite' ? ' selected' : '') + '>用新数据覆盖已有词条</option></select></div>' +
          '</div>' +
          '<div>' +
          '<label class="fld">分类来源（用于「按分类选题」）</label>' +
          '<div class="row"><label class="chip ' + (IM.catMode === 'column' ? 'on' : '') + '"><input type="radio" name="cm" value="column" hidden' + (IM.catMode === 'column' ? ' checked' : '') + '>取自文件列</label>' +
          '<label class="chip ' + (IM.catMode === 'fixed' ? 'on' : '') + '"><input type="radio" name="cm" value="fixed" hidden' + (IM.catMode === 'fixed' ? ' checked' : '') + '>统一填写</label></div>' +
          '<div class="row" style="margin-top:8px">' +
          (IM.catMode === 'column'
            ? '<select id="catcol" style="max-width:280px">' + IM.unionHeaders.map(function (h) {
              return '<option value="' + esc(h) + '"' + (h === IM.catColumn ? ' selected' : '') + '>' + esc(h) + '</option>';
            }).join('') + '</select>'
            : '<input type="text" id="catval" placeholder="如：四级新增" value="' + esc(IM.catValue) + '" style="max-width:280px">') +
          '</div>' +
          '<div class="muted" style="margin-top:6px;font-size:12px">提示：蓝本 CET-4 词库建议选 <code>stage</code>（初中/高中/四级）或 <code>level</code>（高频/中频/低频）列作为分类。</div>' +
          '</div>' +
          '</div>' +
          '<div style="margin-top:14px"><label class="fld">③ 字段映射（左侧为本程序字段，右侧选文件中对应的列名）</label>' +
          '<div class="grid g2">' + fields.map(function (f) {
            return '<div class="maprow">' +
              '<span>' + esc(WM.parser.FIELD_LABEL[f]) + '</span>' +
              '<select data-fm="' + f + '">' +
              '<option value="">— 不导入 —</option>' +
              IM.unionHeaders.map(function (h) {
                return '<option value="' + esc(h) + '"' + (IM.mapping[f] === h ? ' selected' : '') + '>' + esc(h) + '</option>';
              }).join('') + '</select>' +
              '<span class="maprow-h hname">' + esc(exampleOf(IM.mapping[f])) + '</span></div>';
          }).join('') + '</div></div>';

        U.$$('input[name=tm]', box).forEach(function (r) {
          r.parentNode.onclick = function () { IM.targetMode = r.value; drawCfg(); };
          r.onchange = function () { IM.targetMode = r.value; drawCfg(); };
        });
        U.$$('input[name=cm]', box).forEach(function (r) {
          r.parentNode.onclick = function () { IM.catMode = r.value; drawCfg(); drawReport(); };
          r.onchange = function () { IM.catMode = r.value; drawCfg(); drawReport(); };
        });
        var tb = U.$('#tbook', box); if (tb) tb.onchange = function () { IM.targetBookId = tb.value; };
        var nb = U.$('#newbk', box);
        if (nb) nb.onclick = function () {
          WM.modal({
            title: '新建词库并导入',
            body: '<label class="fld">名称</label><input type="text" id="n1" value="' + esc(suggestName()) + '">' +
              '<label class="fld" style="margin-top:10px">分类</label><input type="text" id="n2" value="CET-4">',
            actions: [{ label: '取消', cls: 'ghost' }, {
              label: '创建并选中', cls: 'primary', onClick: function (close) {
                var b = S.createBook(U.$('#n1').value.trim() || suggestName(), U.$('#n2').value.trim() || '未分类');
                IM.targetBookId = b.id; close(); drawCfg();
              }
            }]
          });
        };
        var nc = U.$('#newcat', box); if (nc) nc.oninput = function () { IM.newCat = nc.value; };
        U.$$('[data-fm]', box).forEach(function (sel) {
          sel.onchange = function () {
            IM.mapping[sel.getAttribute('data-fm')] = sel.value;
            drawCfg(); drawReport();
          };
        });
        var cc = U.$('#catcol', box); if (cc) cc.onchange = function () { IM.catColumn = cc.value; drawReport(); };
        var cv = U.$('#catval', box); if (cv) cv.oninput = function () { IM.catValue = cv.value; drawReport(); };
        var dp = U.$('#dup', box); if (dp) dp.onchange = function () { IM.dupMode = dp.value; drawReport(); };
        if (!IM.targetBookId && S.state.books.length) IM.targetBookId = S.state.books[S.state.books.length - 1].id;
      }

      function exampleOf(header) {
        if (!header) return '';
        for (var i = 0; i < IM.files.length; i++) {
          var rows = IM.files[i].sheets[IM.files[i].sheetIndex || 0].rows;
          for (var j = 0; j < Math.min(rows.length, 3); j++) {
            var v = rows[j][header];
            if (v) return String(v).slice(0, 18);
          }
        }
        return '';
      }

      function suggestName() {
        return IM.files.length ? IM.files[0].name.replace(/\.[^.]+$/, '') : '新词库';
      }

      /* ---------- 预览报告 ---------- */
      function drawReport() {
        var box = U.$('#rep', el);
        if (!IM.files.length) { box.hidden = true; return; }
        box.hidden = false;
        var r = preview();
        var existing = 0, fresh = 0;
        r.valid.forEach(function (v) { if (S.state.words[v.key]) existing++; else fresh++; });
        var dupCount = r.dupInFile.length;
        box.innerHTML =
          '<div class="card-hd"><h3>④ 导入预览</h3><span class="desc">确认无误后点右下角「开始导入」</span></div>' +
          '<div class="report">' +
          '<div><div class="n">' + activeRows().length + '</div><div class="l">文件数据行</div></div>' +
          '<div><div class="n" style="color:var(--ok)">' + fresh + '</div><div class="l">新增词条</div></div>' +
          '<div><div class="n" style="color:var(--brand)">' + existing + '</div><div class="l">库中已存在</div></div>' +
          '<div><div class="n" style="color:var(--warn)">' + dupCount + '</div><div class="l">本批重复</div></div>' +
          '<div><div class="n" style="color:var(--bad)">' + r.errors.length + '</div><div class="l">格式错误跳过</div></div>' +
          '</div>' +
          (r.errors.length
            ? '<details open><summary class="muted" style="cursor:pointer">查看错误明细（前 30 行）</summary>' +
            '<div class="scroll" style="margin-top:8px"><table class="table list-err"><thead><tr><th>行号</th><th>原因</th><th>内容预览</th></tr></thead><tbody>' +
            r.errors.slice(0, 30).map(function (e) {
              return '<tr><td>第 ' + e.line + ' 行</td><td>' + esc(e.reason) + '</td><td>' + esc(e.preview) + '</td></tr>';
            }).join('') + '</tbody></table></div></details>'
            : '') +
          (r.valid.length
            ? '<details><summary class="muted" style="cursor:pointer;margin-top:10px">查看前 5 条样例</summary>' +
            '<div class="scroll" style="margin-top:8px"><table class="table"><thead><tr><th>单词</th><th>音标</th><th>词性</th><th>释义</th><th>分类</th></tr></thead><tbody>' +
            r.valid.slice(0, 5).map(function (v) {
              return '<tr><td>' + esc(v.word.t) + '</td><td>' + esc(v.word.ph) + '</td><td>' + esc(v.word.p) +
                '</td><td>' + esc(v.word.m.slice(0, 30)) + '</td><td>' + esc(v.word.cat) + '</td></tr>';
            }).join('') + '</tbody></table></div></details>'
            : '<div class="empty">没有可导入的有效行，请检查字段映射</div>');

        var btnId = 'do-import';
        if (!U.$('#' + btnId, box)) {
          var wrap = document.createElement('div');
          wrap.className = 'row';
          wrap.style.cssText = 'margin-top:14px;justify-content:flex-end';
          wrap.innerHTML = '<button class="btn lg primary" id="' + btnId + '">开始导入（Enter）</button>';
          box.appendChild(wrap);
          U.$('#' + btnId, wrap).onclick = doImport;
        }
        box._count = r.valid.length;
      }

      /* ---------- 执行导入 ---------- */
      function doImport() {
        if (!IM.mapping.term) { WM.toast('请先指定「单词」对应的列', 'bad'); return; }
        if (IM.targetMode === 'merge' && !IM.targetBookId) {
          WM.toast('请选择目标词库，或切换为「每个文件各建一词库」', 'bad'); return;
        }
        var r = preview();
        if (!r.valid.length) { WM.toast('没有有效词条可导入', 'bad'); return; }
        var stat = { new: 0, updated: 0, linked: 0, skipped: 0 }, tgtName = '';

        if (IM.targetMode === 'each') {
          // 每个文件单独建库
          IM.files.forEach(function (f) {
            var rows = f.sheets[f.sheetIndex || 0].rows;
            var sub = WM.buildWords(rows, IM.mapping, {
              categoryMode: IM.catMode, categoryColumn: IM.catColumn, categoryValue: IM.catValue
            });
            var book = S.createBook(f.name.replace(/\.[^.]+$/, ''), IM.newCat || '未分类', '来源文件：' + f.name);
            sub.valid.forEach(function (v) {
              var res = S.upsertWord(v.word, book.id, IM.dupMode);
              stat[res] = (stat[res] || 0) + 1;
            });
            tgtName = '多个词库（按文件拆分）';
          });
        } else {
          var book = S.getBook(IM.targetBookId);
          tgtName = book.name;
          r.valid.forEach(function (v) {
            var res = S.upsertWord(v.word, IM.targetBookId, IM.dupMode);
            stat[res] = (stat[res] || 0) + 1;
          });
          book.updatedAt = Date.now();
        }
        S.reindex(); S.save(); WM.App.refreshSide();

        WM.modal({
          title: '导入完成',
          body: '<p>目标词库：<b>' + esc(tgtName) + '</b></p>' +
            '<ul style="line-height:2">' +
            '<li>新增词条：<b>' + stat['new'] + '</b></li>' +
            '<li>更新内容：<b>' + stat.updated + '</b></li>' +
            '<li>仅归入词库（内容重复，未覆盖）：<b>' + stat.linked + '</b></li>' +
            '<li>完全重复跳过：<b>' + stat.skipped + '</b></li>' +
            '<li>格式错误被忽略：<b>' + r.errors.length + '</b> 行</li>' +
            '</ul>' +
            (S.storageOK ? '' : '<p style="color:var(--bad)">注意：本地存储写入受限，建议到「设置与备份」导出备份。</p>') +
            '<p class="muted">继续导入下一批时，选择同一个目标词库即可按文件顺序追加。</p>',
          actions: [
            { label: '继续导入下一批', cls: 'ghost', onClick: function (close) { close(); } },
            { label: '去开始测试', cls: 'primary', onClick: function (close) { close(); WM.App.go('quiz'); } },
            { label: '查看词库', cls: '', onClick: function (close) { close(); WM.App.go('books'); } }
          ]
        });
        IM.files = []; IM.mapping = null; drawFiles(); drawCfg(); drawReport();
      }

      V._importApi = { addFiles: addFiles, drawReport: drawReport };
    },
    onKey: function (e) {
      if (e.key === 'Enter' && IM.files.length) { var b = U.$('#do-import'); if (b) { b.click(); return true; } }
      return false;
    }
  };
})(window);
