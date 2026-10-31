/* =========================================================================
 * WordMaster · core.js
 * 模块职责：① 通用工具函数  ② 本地数据层（Store）
 * 数据全部落在 localStorage（可一键导出为 JSON 备份），不依赖任何后端 / 网络。
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM = global.WM || {};

  /* ---------------------------------------------------------------- 工具 */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var U = WM.util = {
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
    /** HTML 转义，所有由用户文件读入的内容渲染前必须经过它 */
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    uid: function (p) {
      return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
    today: function () {
      var d = new Date();
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    dayKey: function (ts) {
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    fmtDate: function (ts) {
      if (!ts) return '—';
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes());
    },
    fmtAgo: function (ts) {
      if (!ts) return '从未';
      var s = (Date.now() - ts) / 1000;
      if (s < 60) return '刚刚';
      if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
      if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
      if (s < 86400 * 30) return Math.floor(s / 86400) + ' 天前';
      return U.fmtDate(ts).slice(0, 10);
    },
    /** 归一化英文：去首尾空格、转小写、合并空白 —— 用于词条主键与填空题判定 */
    norm: function (s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); },
    /** 归一化中文：去掉标点与空白 —— 用于中文释义判定 */
    normCN: function (s) {
      return String(s == null ? '' : s).replace(/[\s，。；、（）()【】"'‘’“”·,.;!?!？！:：\-—_/\\]/g, '')
        .replace(/[（）()\[\]【】]/g, '').toLowerCase();
    },
    shuffle: function (a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    pickN: function (arr, n) { return U.shuffle(arr.slice()).slice(0, Math.max(0, Math.min(n, arr.length))); },
    clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); },
    /** 编辑距离，用于填空题的“轻微拼写错误”容错 */
    lev: function (a, b) {
      if (a === b) return 0;
      var m = a.length, n = b.length;
      if (!m || !n) return m || n;
      if (Math.abs(m - n) > 3) return 4;
      var prev = [], cur = [], i, j;
      for (j = 0; j <= n; j++) prev[j] = j;
      for (i = 1; i <= m; i++) {
        cur[0] = i;
        for (j = 1; j <= n; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur.slice();
      }
      return prev[n];
    },
    /** 把字符串按分隔符切成义项列表 */
    splitMeanings: function (s) {
      return String(s || '').split(/[；;，,]\s*|\/\s*|\|\s*/).map(function (x) { return x.trim(); })
        .filter(function (x) { return x && x.length > 0; });
    },
    download: function (filename, content, mime) {
      var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    },
    copy: function (text) {
      if (navigator.clipboard) { navigator.clipboard.writeText(text); WM.toast('已复制到剪贴板', 'ok'); }
    }
  };

  /* ------------------------------------------------------------ 轻量 UI */
  WM.toast = function (msg, type) {
    var root = U.$('#toast-root');
    if (!root) { console.log('[toast]', msg); return; }
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3200);
  };

  /**
   * 简易模态框
   * opts: {title, body(html), actions:[{label, cls, onClick(close)}], size}
   */
  WM.modal = function (opts) {
    var root = U.$('#modal-root');
    var mask = document.createElement('div');
    mask.className = 'mask';
    mask.innerHTML =
      '<div class="modal ' + (opts.size || '') + '">' +
      '<div class="modal-hd"><h3>' + U.esc(opts.title || '') + '</h3>' +
      '<button class="icon-btn" data-close="1" title="关闭 (Esc)">✕</button></div>' +
      '<div class="modal-bd">' + (opts.body || '') + '</div>' +
      '<div class="modal-ft"></div></div>';
    root.appendChild(mask);
    /* 幂等关闭：重复调用无副作用，保证「取消」后不会残留监听或二次删除 */
    var closed = false;
    var close = function () {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      mask.remove();
    };
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    U.$('[data-close]', mask).addEventListener('click', close);
    var ft = U.$('.modal-ft', mask);
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || 'ghost');
      b.textContent = a.label;
      /* 未传 onClick 的动作项（如「取消」）默认只关闭弹窗，不做任何其它操作 */
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof a.onClick === 'function') a.onClick(close); else close();
      });
      ft.appendChild(b);
    });
    if (opts.onMount) opts.onMount(mask, close);
    return close;
  };

  /* =========================================================================
   * WM.Mastery · 掌握度模型（统计口径的唯一来源）
   * -------------------------------------------------------------------------
   * 只服务于「统计概览」模块。所有判定规则集中在此，保证首页 / 统计页口径一致。
   *
   * ① 连对度   C = min(1, 连对数 / min(目标连对数 + 2, 6))
   * ② 时间加权正确率 A = 0.65 × EWMA(α=0.4) + 0.35 × 累计正确率
   *      EWMA 让「最近一次作答」权重最高，重复刷旧题不会掩盖当前真实水平。
   * ③ 复习间隔达标度 I = 0.5 + 0.5 × min(1, 已成功跨越的最长间隔 G / 期望间隔 E)
   *      E = 1.5 × 2^(min(连对数,8) - 1) 天；只在同一秒连刷、从未间隔复习时取 0.5
   * ④ 难度表现  D = 做过填空题 ? 填空正确率 : A（填空题为高难度题型）
   * ⑤ 保持率   R = 2^(-Δt / H)          —— 艾宾浩斯遗忘曲线
   *      Δt = 距上次答对的天数；H = E，即记忆半衰期随连对数成倍延长；久不复习则衰减。
   *
   * 掌握度 M = 100 × (0.35·C + 0.30·A + 0.20·I + 0.15·D) × (0.45 + 0.55·R)
   *      —— 保持率以乘子形式参与：即使曾经全对，久不复习也会跌出「已掌握」。
   *
   * 已掌握判定（四条同时满足，杜绝单次作答定终身 / 极端小样本）：
   *      样本量 ≥ 3 次 且 连对数 ≥ 目标值 且 A ≥ 60% 且 M ≥ 70
   * 分级：牢固 ≥ 92 · 已掌握 70~92 · 巩固中 45~70 · 薄弱 < 45 · 未接触（从未作答）
   * ========================================================================= */
  var MASTERY = WM.Mastery = {
    H0: 1.5,          // 基础记忆半衰期（天）
    EWMA_A: 0.4,      // 近期正确率衰减因子（越大越看重最近表现）
    MIN_SAMPLE: 3,    // 参与「已掌握」判定的最小作答样本
    MASTER_M: 70,     // 掌握线
    FIRM_M: 92,       // 牢固线（未跨越过期望复习间隔时最高约 90，故「牢固」必须间隔复习成功过）
    STABLE_M: 45,     // 巩固中 / 薄弱 分界线
    ACC_GATE: 0.6,    // 时间加权正确率门槛
    KAPPA: 8,         // 知识点维度贝叶斯平滑强度（小样本向全局收缩）
    HALF_LIFE: 7,     // 时间加权正确率半衰期（天）
    DUE_R: 0.5,       // 保持率低于此值 → 计入「待复习」
    LEVELS: [
      { id: 'firm', name: '牢固', desc: 'M ≥ 92：多次巩固、跨越过期望复习间隔且记忆新鲜' },
      { id: 'mastered', name: '已掌握', desc: 'M ≥ 70 且满足样本 / 连对 / 正确率门槛' },
      { id: 'stable', name: '巩固中', desc: 'M 45~70，还需反复强化' },
      { id: 'weak', name: '薄弱', desc: 'M < 45，或从未答对' },
      { id: 'untouched', name: '未接触', desc: '尚未作答过' }
    ],

    /**
     * 计算单个词条的掌握度
     * @param {Object} p 进度对象（不存在时返回「未接触」）
     * @param {Number} target 目标连对次数（设置项）
     * @returns {Object} {n, c, a, i, r, d, score, mastered, level, retention, halfLife, idleDays, gap}
     */
    of: function (p, target, now) {
      now = now || Date.now();
      target = target || 3;
      var res = {
        n: 0, c: 0, a: 0, i: 0, r: 0, d: 0, score: 0, mastered: false, level: 'untouched',
        retention: 0, halfLife: 0, idleDays: -1, gap: 0
      };
      if (!p || !p.seen) return res;

      var n = p.seen, raw = p.right / n;
      // EWMA 缺失（旧数据 / 手工编辑）时退化为累计正确率，保证向后兼容
      var ew = (typeof p.ewma === 'number' && p.ewma >= 0) ? p.ewma : raw;
      var a = 0.65 * ew + 0.35 * raw;

      var streak = p.streak || 0;
      var c = Math.min(1, streak / Math.min(target + 2, 6));
      // 难度项：做过填空题优先看填空正确率，否则用综合正确率
      var d = (p.fillSeen > 0) ? (p.fillRight || 0) / p.fillSeen : a;

      // 期望复习间隔 = 记忆半衰期：连对数越多，可承受的间隔越长（1.5 天 → 3 → 6 → 12 …）
      var halfLife = MASTERY.H0 * Math.pow(2, Math.min(streak, 8) - 1);
      // 已成功跨越的最长复习间隔（天）：隔了足够久还能答对，才是真的记住了
      var gap = p.gapMax || 0;
      var i = 0.5 + 0.5 * Math.min(1, gap / Math.max(halfLife, 0.5));

      var idle = p.lastOk ? Math.max(0, (now - p.lastOk) / 86400000) : -1;
      var r = (p.lastOk && idle >= 0) ? Math.pow(2, -idle / halfLife) : 0;

      var score = 100 * (0.35 * c + 0.30 * a + 0.20 * i + 0.15 * d) * (0.45 + 0.55 * r);
      score = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;

      var mastered = n >= MASTERY.MIN_SAMPLE && streak >= target &&
        a >= MASTERY.ACC_GATE && score >= MASTERY.MASTER_M;
      var level = mastered ? (score >= MASTERY.FIRM_M ? 'firm' : 'mastered')
        : (score >= MASTERY.STABLE_M ? 'stable' : 'weak');

      res.n = n; res.c = c; res.a = a; res.i = i; res.r = r; res.d = d;
      res.score = score; res.mastered = mastered; res.level = level;
      res.retention = r; res.halfLife = halfLife; res.gap = gap;
      res.idleDays = idle < 0 ? -1 : Math.round(idle * 10) / 10;
      return res;
    }
  };

  /* =========================================================================
   * WM.FreqLevel · 使用频次分级模型（「使用频次 level」选题维度的唯一来源）
   * -------------------------------------------------------------------------
   * 取值优先级（词条对象字段见 upsertWord）：
   *   ① 等级标签 lv —— 「高频 / 中频 / 低频」等（中英文及常见缩写别名均可识别）
   *   ② 若 lv 缺失，但 lv 或 fr 是数字，则视为「语料词频序位 rank」按区间归类
   *        rank 越小越常用：高频 rank ≤ 2000 · 中频 2001~6000 · 低频 > 6000
   *        该区间取自蓝本 CET-4 词库中 level 标注与 freq_rank 的实际分布
   *        （高频 ≤1944、中频 1945~5328、低频 ≥5330），两者完全吻合
   *   ③ 既无标签又无有效序位（rank ≤ 0 视为无效） → 「未标注」
   *
   * 说明：词条结构中仅 lv 参与持久化，fr 为只读兼容（如带 freq_rank 的数据），不新增字段。
   * ========================================================================= */
  var FREQ = WM.FreqLevel = {
    HIGH_MAX: 2000,   // 高频上界（含）
    MID_MAX: 6000,    // 中频上界（含），超过即低频
    LEVELS: [
      { id: 'high', name: '高频', desc: 'rank ≤ 2000', keys: ['高频', '高', 'high', 'h', '1', 'level1', 'a', '常用'] },
      { id: 'mid', name: '中频', desc: 'rank 2001~6000', keys: ['中频', '中', 'mid', 'medium', 'm', '2', 'level2', 'b'] },
      { id: 'low', name: '低频', desc: 'rank > 6000', keys: ['低频', '低', 'low', 'l', '3', 'level3', 'c', '生僻'] },
      { id: 'na', name: '未标注', desc: '无等级标签且无有效频序', keys: [] }
    ],

    byId: function (id) {
      for (var i = 0; i < this.LEVELS.length; i++) if (this.LEVELS[i].id === id) return this.LEVELS[i];
      return null;
    },

    /** 由词频序位归级；rank 非法返回 null */
    byRank: function (rank) {
      var r = Number(rank);
      if (!isFinite(r) || r <= 0) return null;
      if (r <= this.HIGH_MAX) return this.byId('high');
      if (r <= this.MID_MAX) return this.byId('mid');
      return this.byId('low');
    },

    /** 读取字段中的数字（容忍千分位、百分号、空格） */
    numOf: function (v) {
      var s = String(v == null ? '' : v).replace(/[,，\s%％]/g, '');
      if (!s) return NaN;
      return Number(s);
    },

    /**
     * 判定一个词条所属的使用频次级别
     * @param {Object} w 词条对象
     * @returns {Object} LEVELS 中的一项（必定命中，最差返回「未标注」）
     */
    of: function (w) {
      if (!w) return this.byId('na');
      var lv = String(w.lv == null ? '' : w.lv).trim().toLowerCase();
      if (lv) {
        // ① 标签精确匹配（英文别名需小写比对）
        for (var i = 0; i < this.LEVELS.length; i++) {
          var L = this.LEVELS[i];
          for (var j = 0; j < L.keys.length; j++) {
            if (lv === L.keys[j]) return L;
          }
        }
        // ② 标签内包含中文级别词（如「高频词」「CET4-低频」）
        var cn = ['高频', '中频', '低频'];
        for (var k = 0; k < cn.length; k++) {
          if (lv.indexOf(cn[k]) >= 0) return this.byId(['high', 'mid', 'low'][k]);
        }
        // ③ 标签本身是数字 → 按词频序位区间归类
        var t = this.byRank(this.numOf(lv));
        if (t) return t;
      }
      // ④ 退回词条自带的频序字段（fr，兼容带 freq_rank 的数据）
      var t2 = this.byRank(this.numOf(w.fr));
      if (t2) return t2;
      return this.byId('na');
    },

    /** 统计一批词条在各级别上的分布，返回一个 {id: 数量} 映射 */
    countBy: function (words) {
      var out = {};
      this.LEVELS.forEach(function (L) { out[L.id] = 0; });
      (words || []).forEach(function (w) { out[FREQ.of(w).id]++; });
      return out;
    }
  };

  /* ====================================================== 数据层 Store */
  var LS_KEY = 'wordmaster.db.v1';

  function defaultState() {
    return {
      version: 1,
      books: [],          // 词库
      words: {},          // 词条字典：{ key: word }
      progress: {},       // 学习进度：{ key: {...} }
      notebook: {},       // 生词本：{ key: {...} }
      history: [],        // 测试历史
      settings: {
        defaultCount: 20,
        order: 'random',
        types: { choice: true, fill: true },
        direction: 'mix',       // mix | en2cn | cn2en
        streakTarget: 3,        // 连续答对 N 次自动移出生词本
        dailyGoal: 40,
        autoNotebook: true,
        showPhonetic: true,
        historyMax: 80
      }
    };
  }

  var S = WM.Store = {
    state: null,
    storageOK: true,
    lastError: '',

    init: function () {
      try {
        var raw = localStorage.getItem(LS_KEY);
        this.state = raw ? JSON.parse(raw) : defaultState();
      } catch (e) {
        this.state = defaultState();
      }
      // 结构补全（兼容旧备份 / 手工编辑）
      var d = defaultState();
      for (var k in d) if (!(k in this.state)) this.state[k] = d[k];
      for (var s in d.settings) if (!(s in this.state.settings)) this.state.settings[s] = d.settings[s];
      for (var w in this.state.words) if (!this.state.words[w].books) this.state.words[w].books = [];
      this.reindex();
      return this.state;
    },

    /** 给每个词条对象挂上主键 __k（内存中缓存，不写入磁盘） */
    reindex: function () {
      for (var k in this.state.words) this.state.words[k].__k = k;
      return this.state.words;
    },

    save: function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.state));
        this.storageOK = true;
        return true;
      } catch (e) {
        // 配额溢出：先裁剪历史再试一次，仍失败则提示导出备份
        if (this.state.history.length > 20) {
          this.state.history = this.state.history.slice(-20);
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(this.state));
            WM.toast('存储空间紧张，已自动裁剪旧测试记录', 'warn');
            this.storageOK = true;
            return true;
          } catch (e2) { /* noop */ }
        }
        this.storageOK = false;
        this.lastError = e && e.name || 'WriteError';
        return false;
      }
    },

    saveSoon: function () {
      var self = this;
      clearTimeout(this._t);
      this._t = setTimeout(function () {
        if (!self.save()) {
          WM.toast('本地存储写入失败（' + self.lastError + '）：请到「设置 → 数据备份」导出备份后清理词库', 'bad');
        }
      }, 120);
    },

    bookStorageSize: function () {
      try { return Math.round(JSON.stringify(this.state).length / 1024); } catch (e) { return 0; }
    },

    /* ---------------- 词库 CRUD ---------------- */
    createBook: function (name, category, note) {
      var b = {
        id: U.uid('book'), name: name, category: category || '未分类', note: note || '',
        createdAt: Date.now(), updatedAt: Date.now(), wordKeys: []
      };
      this.state.books.push(b); this.saveSoon(); return b;
    },
    getBook: function (id) {
      return this.state.books.filter(function (b) { return b.id === id; })[0] || null;
    },
    renameBook: function (id, name, category) {
      var b = this.getBook(id); if (!b) return;
      b.name = name; if (category != null) b.category = category;
      b.updatedAt = Date.now(); this.saveSoon();
    },
    removeBook: function (id) {
      var self = this;
      var b = this.getBook(id); if (!b) return;
      (b.wordKeys || []).forEach(function (k) {
        var w = self.state.words[k];
        if (!w) return;
        w.books = (w.books || []).filter(function (x) { return x !== id; });
        // 该词不再属于任何词库 → 一并清理，避免留下孤儿词条
        if (!w.books.length) {
          delete self.state.words[k];
          delete self.state.progress[k];
          delete self.state.notebook[k];
        }
      });
      this.state.books = this.state.books.filter(function (x) { return x.id !== id; });
      this.saveSoon();
    },
    /** 词库内的词条对象数组，保持导入顺序（顺序出题依赖此顺序） */
    bookWords: function (id) {
      var self = this, b = this.getBook(id);
      if (!b) return [];
      return b.wordKeys.map(function (k) { return self.state.words[k]; }).filter(Boolean);
    },
    allWords: function () {
      var w = this.state.words, out = [];
      for (var k in w) out.push(w[k]);
      return out;
    },
    categories: function () {
      var set = {}, out = [];
      this.state.books.forEach(function (b) { set[b.category || '未分类'] = 1; });
      this.allWords().forEach(function (w) { if (w.cat) set[w.cat] = 1; });
      for (var k in set) out.push(k);
      return out;
    },

    /* ---------------- 词条写入（导入用） ---------------- */
    /**
     * @param {Object} w 词条对象 {t,ph,pu,p,m,ex,exc,co,dv,lv,st,cat}
     * @param {String} bookId
     * @param {String} mode 'skip' | 'overwrite'
     * @returns {'new'|'linked'|'updated'|'skipped'}
     */
    upsertWord: function (w, bookId, mode) {
      var key = ENTRY_KEY(w.t);
      var old = this.state.words[key];
      if (!old) {
        var nw = {
          t: w.t, ph: w.ph || '', pu: w.pu || '', p: w.p || '', m: w.m || '',
          ex: w.ex || '', exc: w.exc || '', co: w.co || '', dv: w.dv || '',
          lv: w.lv || '', st: w.st || '', cat: w.cat || '', books: [bookId], at: Date.now()
        };
        this.state.words[key] = nw;
        nw.__k = key;
        this._link(key, bookId);
        return 'new';
      }
      var isNewToBook = (old.books || []).indexOf(bookId) < 0;
      if (isNewToBook) { old.books.push(bookId); this._link(key, bookId); }
      if (mode === 'overwrite') {
        ['ph', 'pu', 'p', 'm', 'ex', 'exc', 'co', 'dv', 'lv', 'st', 'cat'].forEach(function (f) {
          if (w[f]) old[f] = w[f];
        });
        return isNewToBook ? 'new' : 'updated';
      }
      // skip 模式：补空缺字段（允许分批导入时逐步补全信息，但不覆盖已有内容）
      var filled = false;
      ['ph', 'pu', 'p', 'm', 'ex', 'exc'].forEach(function (f) {
        if (!old[f] && w[f]) { old[f] = w[f]; filled = true; }
      });
      return isNewToBook ? (filled ? 'updated' : 'linked') : (filled ? 'updated' : 'skipped');
    },
    _link: function (key, bookId) {
      var b = this.getBook(bookId);
      if (b && b.wordKeys.indexOf(key) < 0) { b.wordKeys.push(key); b.updatedAt = Date.now(); }
    },

    /* ---------------- 学习进度 ---------------- */
    prog: function (key) {
      var p = this.state.progress[key];
      if (!p) {
        p = this.state.progress[key] = { seen: 0, right: 0, wrong: 0, streak: 0, best: 0, lastTest: 0, lastOk: 0, learned: false };
      }
      return p;
    },
    isLearned: function (key) { return !!this.state.progress[key] && this.state.progress[key].learned; },
    isMastered: function (key) {
      var p = this.state.progress[key];
      return !!p && p.streak >= this.state.settings.streakTarget;
    },
    markLearned: function (keys, bool) {
      var self = this;
      keys.forEach(function (k) { self.prog(k).learned = !!bool; });
      this.saveSoon();
    },
    /**
     * 记录一次作答，返回 {outOfNotebook:Boolean}
     * @param {String} key
     * @param {Boolean} ok
     * @param {Object} [meta] 仅统计分析使用的附加信息 {type:'choice'|'fill'}，缺省不影响既有逻辑
     */
    answer: function (key, ok, meta) {
      var now = Date.now(), st = this.state, p = this.prog(key);
      var prevOk = p.lastOk;                 // 上一次答对的时间，用于统计「跨越的复习间隔」
      p.seen++; p.lastTest = now;
      if (ok) {
        p.right++; p.streak++; p.best = Math.max(p.best, p.streak); p.lastOk = now; p.learned = true;
        if (prevOk) {
          var gap = (now - prevOk) / 86400000;
          if (gap > (p.gapMax || 0)) p.gapMax = Math.round(gap * 100) / 100;
        }
      } else {
        p.wrong++; p.streak = 0;
      }
      /* ---- 统计扩展字段（惰性写入，未用到的词条不占空间；缺省时统计层自动降级） ---- */
      if (p.firstOk == null) p.firstOk = ok ? 1 : 0;                 // 首次接触是否答对
      p.ewma = (typeof p.ewma === 'number' && p.ewma >= 0)
        ? p.ewma * (1 - MASTERY.EWMA_A) + (ok ? 1 : 0) * MASTERY.EWMA_A
        : (ok ? 1 : 0);                                              // 近期正确率（时间加权）
      if (meta && meta.type === 'fill') {                            // 高难度题型的单独表现
        p.fillSeen = (p.fillSeen || 0) + 1;
        if (ok) p.fillRight = (p.fillRight || 0) + 1;
        if (p.fillRight == null) p.fillRight = 0;
      }
      var out = false;
      if (!ok && st.settings.autoNotebook) {
        var nb = st.notebook[key] || (st.notebook[key] = { addedAt: now, wrongCount: 0, lastWrong: 0, lastOk: 0 });
        nb.wrongCount++; nb.lastWrong = now;
      } else if (ok && st.notebook[key]) {
        st.notebook[key].lastOk = now;
        if (p.streak >= st.settings.streakTarget) { delete st.notebook[key]; out = true; }
      }
      this.saveSoon();
      return { outOfNotebook: out };
    },
    toggleNotebook: function (key) {
      if (this.state.notebook[key]) delete this.state.notebook[key];
      else this.state.notebook[key] = { addedAt: Date.now(), wrongCount: 0, lastWrong: 0, lastOk: 0 };
      this.saveSoon();
    },
    notebookWords: function () {
      var self = this, nb = this.state.notebook, out = [];
      for (var k in nb) { var w = this.state.words[k]; if (w) out.push(w); }
      return out;
    },

    /* ---------------- 测试历史 ---------------- */
    pushHistory: function (rec) {
      this.state.history.push(rec);
      var max = this.state.settings.historyMax || 80;
      if (this.state.history.length > max) this.state.history = this.state.history.slice(-max);
      this.saveSoon();
    },

    /* ---------------- 统计 ---------------- */
    /**
     * 总览统计（口径见 WM.Mastery 注释与页面「统计口径说明」）
     * 遍历以 words 为准：同一词条被多个词库引用只算一次，已删除词库的孤儿进度不计入。
     */
    stats: function () {
      var st = this.state, keys = Object.keys(st.words);
      var target = st.settings.streakTarget || 3, now = Date.now();
      var learned = 0, mastered = 0, firm = 0, stable = 0, weak = 0, untouched = 0;
      var right = 0, wrong = 0, firstN = 0, firstOkN = 0, accSum = 0, mSum = 0, mN = 0, due = 0;
      var todayK = U.today(), todaycnt = 0;

      keys.forEach(function (k) {
        var p = st.progress[k];
        if (!p || !p.seen) { untouched++; return; }   // 未实际接触：不计入「已学」
        learned++;                                    // 已学 = 去重后至少作答过 1 次的词条
        right += p.right; wrong += p.wrong;
        var m = MASTERY.of(p, target, now);
        mSum += m.score; mN++; accSum += m.a;
        if (m.mastered) { mastered++; if (m.level === 'firm') firm++; }
        else if (m.level === 'stable') stable++;
        else weak++;
        if (m.retention < MASTERY.DUE_R) due++;       // 记忆保持率过低 → 待复习
        if (p.firstOk === 1) firstOkN++;
        if (p.firstOk === 1 || p.firstOk === 0) firstN++;
      });
      st.history.forEach(function (h) { if (U.dayKey(h.startedAt) === todayK) todaycnt += h.total; });

      var total = keys.length, answered = right + wrong;
      function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
      return {
        books: st.books.length, words: total, learned: learned, learnedPct: pct(learned, total),
        mastered: mastered, masteredPct: pct(mastered, total), firm: firm, stable: stable,
        weak: weak, untouched: untouched,
        notebook: Object.keys(st.notebook).length, answered: answered, right: right, wrong: wrong,
        accuracy: pct(right, answered),                            // ① 累计正确率（每次作答等权）
        wordAccuracy: mN ? Math.round(accSum / mN * 100) : 0,      // ② 词条等权正确率（抗重复刷题）
        firstAccuracy: pct(firstOkN, firstN), firstSample: firstN, // ③ 首次正确率（首次接触即答对）
        recentAccuracy: this.recentAccuracy(MASTERY.HALF_LIFE),     // ④ 近期时间加权正确率
        masteryAvg: mN ? Math.round(mSum / mN * 10) / 10 : 0,
        dueReview: due, dayStreak: this.dayStreak(),
        tests: st.history.length, today: todaycnt, storageKB: this.bookStorageSize()
      };
    },

    /** 单个词条的掌握度（供统计页 / 词条明细使用） */
    masteryOf: function (key, now) {
      return MASTERY.of(this.state.progress[key], this.state.settings.streakTarget, now);
    },

    /**
     * 时间加权正确率：按测试记录距今时间做指数衰减（半衰期 7 天），
     * 让近期表现占更大权重，避免早期大量练习掩盖当前水平。
     */
    recentAccuracy: function (halfLife) {
      halfLife = halfLife || MASTERY.HALF_LIFE;
      var st = this.state, now = Date.now(), ws = 0, cs = 0;
      st.history.forEach(function (h) {
        var age = Math.max(0, (now - (h.finishedAt || h.startedAt)) / 86400000);
        var w = Math.pow(2, -age / halfLife) * (h.total || 0);
        if (w < 1e-4) return;
        ws += w; cs += w * ((h.correct || 0) / (h.total || 1));
      });
      return ws ? Math.round(cs / ws * 100) : 0;
    },

    /** 连续学习天数（今日无记录则从昨天起算，避免当天未练就断签） */
    dayStreak: function () {
      var active = {};
      this.state.history.forEach(function (h) { active[U.dayKey(h.startedAt)] = 1; });
      var d = new Date(); d.setHours(0, 0, 0, 0);
      if (!active[U.dayKey(d.getTime())]) d.setTime(d.getTime() - 86400000);
      var n = 0;
      while (active[U.dayKey(d.getTime())]) { n++; d.setTime(d.getTime() - 86400000); }
      return n;
    },

    /** 学习趋势：本期 vs 上期（默认各 14 天）的答题量 / 正确率 / 活跃天数 / 新接触词条 */
    trend: function (days) {
      days = days || 14;
      var st = this.state, now = Date.now(), win = days * 86400000;
      var cur = { count: 0, correct: 0, days: {}, keys: {} };
      var prev = { count: 0, correct: 0, days: {}, keys: {} };
      var older = {};
      st.history.forEach(function (h) {
        var age = now - (h.finishedAt || h.startedAt), seg = null;
        if (age <= win) seg = cur; else if (age <= win * 2) seg = prev;
        (h.items || []).forEach(function (it) {
          if (!it || !it.key) return;
          if (!seg) older[it.key] = 1;
        });
        if (!seg) return;
        seg.count += h.total || 0; seg.correct += h.correct || 0;
        seg.days[U.dayKey(h.startedAt)] = 1;
        (h.items || []).forEach(function (it) {
          if (it && it.key && !(it.key in seg.keys)) seg.keys[it.key] = it.ok ? 1 : 0;
        });
      });
      function fresh(seg, seenBefore) {
        var n = 0;
        for (var k in seg.keys) if (!seenBefore[k]) n++;
        return n;
      }
      var prevSeen = {};
      for (var pk in prev.keys) prevSeen[pk] = 1;
      for (var ok2 in older) prevSeen[ok2] = 1;
      function acc(seg) { return seg.count ? Math.round(seg.correct / seg.count * 100) : 0; }
      return {
        days: days,
        count: [cur.count, prev.count],
        accuracy: [acc(cur), acc(prev)],
        activeDays: [Object.keys(cur.days).length, Object.keys(prev.days).length],
        fresh: [fresh(cur, prevSeen), fresh(prev, older)]
      };
    },

    /** 近 N 周（每周 7 天）的答题量与正确率，用于趋势图 */
    weeklySeries: function (weeks) {
      weeks = weeks || 8;
      var st = this.state, out = [];
      var end = new Date(); end.setHours(23, 59, 59, 999);
      for (var i = weeks - 1; i >= 0; i--) {
        var to = end.getTime() - i * 7 * 86400000, from = to - 7 * 86400000 + 1;
        var b = { label: U.dayKey(from).slice(5) + '~' + U.dayKey(to).slice(5), count: 0, correct: 0 };
        st.history.forEach(function (h) {
          var t = h.finishedAt || h.startedAt;
          if (t >= from && t <= to) { b.count += h.total || 0; b.correct += h.correct || 0; }
        });
        b.accuracy = b.count ? Math.round(b.correct / b.count * 100) : 0;
        out.push(b);
      }
      return out;
    },

    /**
     * 知识点（分类）维度统计
     * 正确率采用贝叶斯平滑：(答对 + κ×全局正确率) / (作答 + κ)，κ=8，
     * 使样本量小的分类向全局水平收缩，避免 1 题 100% 之类的极值把排名带偏。
     */
    categoryStats: function () {
      var st = this.state, target = st.settings.streakTarget || 3, now = Date.now(), map = {};
      var gRight = 0, gSeen = 0;
      this.allWords().forEach(function (w) {
        var name = w.cat || w.st || w.lv || '未分类';
        var c = map[name] || (map[name] = {
          name: name, total: 0, learned: 0, mastered: 0, firm: 0, weak: 0,
          seen: 0, right: 0, mSum: 0, mN: 0, nb: 0
        });
        c.total++;
        var p = st.progress[w.__k];
        if (p && p.seen) {
          c.learned++; c.seen += p.seen; c.right += p.right;
          gSeen += p.seen; gRight += p.right;
          var m = MASTERY.of(p, target, now);
          c.mSum += m.score; c.mN++;
          if (m.mastered) { c.mastered++; if (m.level === 'firm') c.firm++; }
          if (m.level === 'weak') c.weak++;
        }
        if (st.notebook[w.__k]) c.nb++;
      });
      var gAcc = gSeen ? gRight / gSeen : 0, K = MASTERY.KAPPA, list = [];
      for (var k in map) {
        var c = map[k];
        c.acc = c.seen ? (c.right + K * gAcc) / (c.seen + K) : 0;          // 平滑后的加权正确率
        c.mastery = c.mN ? Math.round(c.mSum / c.mN * 10) / 10 : 0;        // 平均掌握度
        c.learnedPct = c.total ? Math.round(c.learned / c.total * 100) : 0;
        c.masteredPct = c.total ? Math.round(c.mastered / c.total * 100) : 0;
        c.nbRate = c.total ? c.nb / c.total : 0;
        // 薄弱指数：未掌握占比 + 正确率缺口 + 生词占比 + 未接触占比
        c.weakIdx = 0.45 * (1 - c.masteredPct / 100) + 0.30 * (1 - c.acc) +
          0.15 * c.nbRate + 0.10 * (1 - c.learnedPct / 100);
        c.weakIdx = Math.round(Math.max(0, Math.min(1, c.weakIdx)) * 1000) / 10;  // 0~100
        list.push(c);
      }
      list.sort(function (a, b) { return b.weakIdx - a.weakIdx || b.total - a.total; });
      return { list: list, globalAcc: gAcc };
    },

    /** 薄弱词条榜：未掌握词条按「错误次数 + 掌握度缺口 + 生词本」加权排序 */
    weakWords: function (limit) {
      var st = this.state, target = st.settings.streakTarget || 3, now = Date.now(), out = [];
      for (var k in st.progress) {
        var w = st.words[k]; if (!w) continue;               // 已删除词条不计
        var p = st.progress[k]; if (!p || !p.seen) continue;
        var m = MASTERY.of(p, target, now);
        if (m.mastered) continue;
        out.push({
          key: k, w: w, p: p, m: m,
          rank: p.wrong * 2 + (1 - m.score / 100) * 3 + (st.notebook[k] ? 1.5 : 0)
        });
      }
      out.sort(function (a, b) { return b.rank - a.rank; });
      return out.slice(0, limit || 10);
    },
    /** 近 N 天每日答题量，用于柱状图 */
    dailySeries: function (days) {
      days = days || 14;
      var st = this.state, map = {}, out = [];
      var d = new Date(); d.setHours(0, 0, 0, 0);
      for (var i = days - 1; i >= 0; i--) {
        var t = new Date(d.getTime() - i * 86400000);
        var k = U.dayKey(t.getTime());
        map[k] = { day: k, count: 0, correct: 0 };
      }
      st.history.forEach(function (h) {
        var k = U.dayKey(h.startedAt);
        if (map[k]) { map[k].count += h.total; map[k].correct += h.correct; }
      });
      for (var k2 in map) out.push(map[k2]);
      return out;
    },

    /* ---------------- 备份 / 恢复 ---------------- */
    exportBackup: function (withLib) {
      var st = this.state;
      var data = {
        app: 'wordmaster', version: 1, exportedAt: new Date().toISOString(),
        settings: st.settings, progress: st.progress, notebook: st.notebook, history: st.history
      };
      if (withLib) { data.words = st.words; data.books = st.books; }
      return JSON.stringify(data, null, withLib ? 0 : 1);
    },
    importBackup: function (json, withLib) {
      var data = JSON.parse(json);
      if (!data || data.app !== 'wordmaster') throw new Error('不是 WordMaster 备份文件');
      var st = this.state;
      if (withLib && data.books && data.words) { st.books = data.books; st.words = data.words; }
      ['settings', 'progress', 'notebook', 'history'].forEach(function (f) {
        if (data[f]) st[f] = data[f];
      });
      for (var w in st.words) if (!st.words[w].books) st.words[w].books = [];
      this.reindex();
      this.save();
      return true;
    },
    clearProgress: function () {
      this.state.progress = {}; this.state.notebook = {}; this.state.history = [];
      this.save();
    },
    clearAll: function () { this.state = defaultState(); this.save(); }
  };

  /** 词条主键：单词本身的小写形式（同拼写不同词性会被合并，导入时会给出提示） */
  function ENTRY_KEY(term) { return U.norm(term); }
  WM.ENTRY_KEY = ENTRY_KEY;
})(window);
