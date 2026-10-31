/* =========================================================================
 * WordMaster · quiz.js
 * 模块职责：选题 → 组卷（单选/填空）→ 判题 → 生词本联动
 *   单选题选项采用「相似度打分 + 随机抽样」生成干扰项，保证干扰项合理且不重复
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM, U = WM.util, S = WM.Store;

  function pickRand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function esc(s) { return U.esc(s); }

  /** 依据配置挑选候选词条 */
  function selectWords(cfg) {
    var st = S.state, pool = [], seen = {}, seq = [];

    function add(w) { if (w && !seen[w.__k]) { seen[w.__k] = 1; seq.push(w); } }

    // 1) 范围
    if (cfg.source === 'notebook') {
      S.notebookWords().forEach(add);
    } else if (cfg.source === 'keys') {
      (cfg.keys || []).forEach(function (k) { if (S.state.words[k]) add(S.state.words[k]); });
    } else if (cfg.source === 'books') {
      (cfg.bookIds || []).forEach(function (id) { S.bookWords(id).forEach(add); });
    } else if (cfg.source === 'categories') {
      var cats = cfg.categories || [];
      S.state.books.forEach(function (b) {
        if (cats.indexOf(b.category) < 0) return;
        S.bookWords(b.id).forEach(add);
      });
      S.allWords().forEach(function (w) { if (cats.indexOf(w.cat) >= 0) add(w); });
    } else {
      // all：按词库顺序（即导入顺序）遍历，保证「顺序出题」稳定
      S.state.books.forEach(function (b) { S.bookWords(b.id).forEach(add); });
      S.allWords().forEach(add);
    }
    pool = seq;

    // 2) 已学 / 未学
    if (cfg.learning === 'learned') pool = pool.filter(function (w) { return S.isLearned(w.__k); });
    if (cfg.learning === 'unlearned') pool = pool.filter(function (w) { return !S.isLearned(w.__k); });

    // 3) 使用频次分级（levels 为空表示不限；与来源、学习状态并列，取交集）
    if (cfg.levels && cfg.levels.length) {
      var lvs = cfg.levels;
      pool = pool.filter(function (w) { return lvs.indexOf(WM.FreqLevel.of(w).id) >= 0; });
    }

    // 4) 可出题性：至少要有释义
    pool = pool.filter(function (w) { return w.m; });

    // 5) 取量
    if (cfg.order === 'random') return U.shuffle(pool.slice()).slice(0, cfg.count);
    return pool.slice(0, cfg.count);
  }

  /* ---------------------------------------------- 干扰项生成 ------------ */
  function partOfSpeech(w) { return (w && w.p || '').split('/')[0]; }

  function pickDistractors(answer, pool, n, mode) {
    var cands = pool.filter(function (w) {
      if (w.__k === answer.__k) return false;
      return mode === 'term' ? !!w.t : !!w.m;
    });
    if (cands.length < n) cands = S.allWords().filter(function (w) {
      return w.__k !== answer.__k && (mode === 'term' ? !!w.t : !!w.m);
    });
    var sample = U.shuffle(cands).slice(0, 60);
    var scored = sample.map(function (w) {
      var sc = Math.random() * 1.4;
      if (mode === 'term') {
        sc -= Math.abs(w.t.length - answer.t.length) * 0.35;
        if (w.t[0] === answer.t[0]) sc += 0.9;                     // 首字母相同更像
        if (w.t.slice(-2) === answer.t.slice(-2)) sc += 0.7;       // 后缀相同更像
        if (partOfSpeech(w) && partOfSpeech(w) === partOfSpeech(answer)) sc += 0.5;
      } else {
        sc -= Math.abs(U.splitMeanings(w.m).join('').length - U.splitMeanings(answer.m).join('').length) * 0.05;
        if (partOfSpeech(w) && partOfSpeech(w) === partOfSpeech(answer)) sc += 1.2;
      }
      return { w: w, sc: sc };
    }).sort(function (a, b) { return b.sc - a.sc; });
    var out = [], used = {};
    used[displayOf(answer, mode)] = 1;
    for (var i = 0; i < scored.length && out.length < n; i++) {
      var txt = displayOf(scored[i].w, mode);
      if (used[txt]) continue;
      used[txt] = 1; out.push({ text: txt, w: scored[i].w });
    }
    return out;
  }

  function displayOf(w, mode) {
    var t = mode === 'term' ? w.t : shortMeaning(w);
    return t;
  }
  function shortMeaning(w) {
    var parts = U.splitMeanings(w.m);
    var s = parts.slice(0, 3).join('；');
    return s.length > 46 ? s.slice(0, 46) + '…' : s;
  }

  /* ------------------------------------------------ 例句挖空 ------------ */
  function blankExample(ex, term) {
    if (!ex) return '';
    try {
      var re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig');
      if (re.test(ex)) return ex.replace(re, '________');
      re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      return re.test(ex) ? ex.replace(re, '________') : '';
    } catch (e) { return ''; }
  }

  /* --------------------------------------------------- 题目生成 --------- */
  function chooseType(cfg) {
    var t = [];
    if (cfg.types.choice) t.push('choice');
    if (cfg.types.fill) t.push('fill');
    if (!t.length) t.push('choice');
    return pickRand(t);
  }
  function chooseDir(cfg) {
    if (cfg.direction === 'en2cn') return 'en2cn';
    if (cfg.direction === 'cn2en') return 'cn2en';
    return Math.random() < 0.5 ? 'en2cn' : 'cn2en';
  }

  function buildQuestion(word, cfg, pool) {
    var type = chooseType(cfg);
    if (type === 'choice') return buildChoice(word, cfg, pool);
    return buildFill(word, cfg);
  }

  function buildChoice(word, cfg, pool) {
    var dir = chooseDir(cfg);
    var mode = dir === 'en2cn' ? 'meaning' : 'term';           // 选项显示内容
    var answerText = displayOf(word, mode);
    var ds = pickDistractors(word, pool, 3, mode);
    var options = U.shuffle([{ text: answerText, w: word, ok: true }].concat(ds.map(function (d) {
      return { text: d.text, w: d.w, ok: false };
    })));
    var q = {
      type: 'choice', dir: dir, word: word, options: options,
      answerText: answerText, answerIndex: options.findIndex(function (o) { return o.ok; })
    };
    if (dir === 'en2cn') {
      q.title = word.t;
      q.sub = (cfg.phonetic && (word.ph || word.pu) ? (word.ph || word.pu) + '  ' : '') + (word.p || '');
      q.tip = '选出正确的中文释义';
    } else {
      q.title = shortMeaning(word);
      q.sub = (word.p ? '词性：' + word.p : '') + (U.splitMeanings(word.m).length > 3 ? '（含更多义项）' : '');
      q.tip = '选出对应的英文单词';
    }
    return q;
  }

  function buildFill(word, cfg) {
    var dir = chooseDir(cfg);
    if (dir === 'en2cn') {
      // 给出单词 + 例句，填写中文释义（任一义项均可）
      return {
        type: 'fill', fillMode: 'meaning', dir: dir, word: word,
        title: word.t,
        sub: (cfg.phonetic && (word.ph || word.pu) ? (word.ph || word.pu) + '  ' : '') + (word.p || ''),
        stemEx: word.ex || '', stemExCn: '',
        tip: '根据单词（与例句）填写中文释义，多个义项用；分隔'
      };
    }
    var blanked = blankExample(word.ex, word.t);
    return {
      type: 'fill', fillMode: 'term', dir: dir, word: word,
      title: shortMeaning(word),
      sub: word.p ? '词性：' + word.p : '',
      stemEx: blanked || word.ex || '',
      stemExCn: word.exc || '',
      tip: blanked ? '根据释义与例句补全单词' : '根据释义拼写单词'
    };
  }

  /* ------------------------------------------------------ 判定 ---------- */
  function judgeChoice(q, idx) {
    if (idx == null) return { ok: false, note: '未选择答案' };
    return { ok: q.answerIndex === idx };
  }

  function judgeFill(q, input) {
    var given = String(input || '').trim();
    if (!given) return { ok: false, note: '未作答' };
    if (q.fillMode === 'term') {
      var a = U.norm(given), b = U.norm(q.word.t);
      if (a === b) return { ok: true };
      var d = U.lev(a, b);
      if (d <= 1 && b.length >= 5) return { ok: true, note: '拼写与标准答案相差 1 个字母，已判为正确' };
      if (d <= 2 && b.length >= 9) return { ok: true, note: '拼写接近，已判为正确' };
      return { ok: false };
    }
    var variants = U.splitMeanings(q.word.m).slice(0, 6);
    var g = U.normCN(given);
    for (var i = 0; i < variants.length; i++) {
      var v = U.normCN(variants[i]);
      if (!v) continue;
      if (g === v) return { ok: true };
      if (v.length >= 2 && (v.indexOf(g) === 0 || v.indexOf(g) >= 0) && g.length >= 2) {
        // 用户输入命中某个义项的核心子串（如“放弃”对应“放弃；抛弃”）
        if (g.length / v.length > 0.5) return { ok: true, note: '命中义项「' + variants[i] + '」' };
      }
      if (U.lev(g, v) <= 1 && v.length >= 2) return { ok: true, note: '与义项「' + variants[i] + '」基本一致' };
    }
    return { ok: false };
  }

  /* ------------------------------------------------- 对外 API ----------- */
  WM.Quiz = {
    selectWords: selectWords,
    blankExample: blankExample,
    shortMeaning: shortMeaning,

    /** 组卷：返回 {questions:[], meta:{}} */
    build: function (cfg) {
      if (cfg.phonetic == null) cfg.phonetic = S.state.settings.showPhonetic;
      var words = selectWords(cfg);
      var pool = words.slice();
      var questions = words.map(function (w) { return buildQuestion(w, cfg, pool); });
      return { questions: questions, total: questions.length };
    },

    judge: function (q, payload) {
      return q.type === 'choice' ? judgeChoice(q, payload.index) : judgeFill(q, payload.input);
    },

    /** 提交作答：写进度 / 生词本，返回结果对象 */
    submit: function (q, payload) {
      var r = WM.Quiz.judge(q, payload);
      // 携带题型：统计模块的「难度表现」维度需要区分单选 / 填空
      var out = S.answer(q.word.__k, r.ok, { type: q.type });
      return {
        ok: r.ok, note: r.note || '',
        given: q.type === 'choice'
          ? (q.options[payload.index] ? q.options[payload.index].text : '')
          : String(payload.input || ''),
        outOfNotebook: out.outOfNotebook,
        progress: S.prog(q.word.__k)
      };
    }
  };

  /* 词条对象在使用前注入 __k（主键），避免在 UI 层反复查找 */
  (function hook() {
    var originAll = S.allWords.bind(S), originBook = S.bookWords.bind(S), originNb = S.notebookWords.bind(S);
    function tag(list) {
      var missing = list.some(function (w) { return !w.__k; });
      if (missing) { S.reindex(); return list; }
      return list;
    }
    S.allWords = function () { return tag(originAll()); };
    S.bookWords = function (id) { return tag(originBook(id)); };
    S.notebookWords = function () { return tag(originNb()); };
  })();
})(window);
