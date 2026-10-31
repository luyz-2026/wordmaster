/* =========================================================================
 * WordMaster · app.js
 * 模块职责：路由、导航、全局快捷键、启动引导
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM, U = WM.util, S = WM.Store, V = WM.views;

  var ORDER = ['home', 'quiz', 'books', 'import', 'notebook', 'stats', 'settings'];
  var App = WM.App = {
    cur: '', params: null,

    go: function (name, params) {
      if (!V[name]) name = 'home';
      if (location.hash !== '#/' + name) location.hash = '#/' + name;
      this.cur = name; this.params = params || null;
      this.render();
    },

    render: function () {
      var v = V[this.cur];
      var el = U.$('#view'), root = document.activeElement;
      U.$('#view-title').textContent = v.title;
      U.$('#view-sub').textContent = '';
      U.$('#view-actions').innerHTML = '';
      el.innerHTML = '';
      el.scrollTop = 0;
      v.render(el, this.params);
      U.$('#view-sub').textContent = v.sub || v.subTitle || '';
      U.$$('.nav-item').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('data-view') === App.cur);
      });
      this.refreshSide();
      if (root && root.blur && /INPUT|TEXTAREA/.test(root.tagName)) { /* 保持输入焦点由视图自己处理 */ }
    },

    refresh: function () { this.render(); },

    setActions: function (html) { U.$('#view-actions').innerHTML = html; },

    refreshSide: function () {
      var n = Object.keys(S.state.notebook).length;
      var b = U.$('#nb-badge');
      if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
      var st = S.stats();
      var s = U.$('#side-stat');
      if (s) s.textContent = st.words + ' 词 · ' + st.books + ' 库 · 今日 ' + st.today + ' 题';
    }
  };

  /* --------------------------------------------------------- 全局快捷键 */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var inField = /INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey;

    if (e.altKey && /^[1-7]$/.test(e.key)) {
      e.preventDefault(); App.go(ORDER[parseInt(e.key, 10) - 1]); return;
    }
    if (inField) return;
    var v = V[App.cur];
    if (v && v.onKey && v.onKey(e)) { e.preventDefault(); }
  });

  window.addEventListener('hashchange', function () {
    var name = (location.hash || '').replace('#/', '');
    if (name && name !== App.cur && V[name]) { App.cur = name; App.params = null; App.render(); }
  });

  /* --------------------------------------------------- Service Worker */
  /**
   * 仅在「安全上下文」中注册（https 或 localhost / 127.0.0.1）。
   * 双击打开本地单文件（file://）时不会注册，也不会报错；
   * 注册失败（例如目录里没有 sw.js）同样静默忽略，不影响正常使用。
   */
  function registerSW() {
    try {
      var secure = window.isSecureContext || location.protocol === 'https:' ||
        /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      if (!secure || !('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { });
    } catch (e) { }
  }

  /* ------------------------------------------------------------- 启动 */
  function boot() {
    S.init();
    // 初始化默认出题配置
    var st = S.state.settings;
    WM.cfg.count = st.defaultCount; WM.cfg.order = st.order;
    WM.cfg.direction = st.direction;
    WM.cfg.types = { choice: st.types.choice, fill: st.types.fill };

    U.$$('.nav-item').forEach(function (a) {
      a.addEventListener('click', function () { App.go(a.getAttribute('data-view')); });
    });

    var name = (location.hash || '').replace('#/', '');
    if (!V[name]) name = S.state.books.length ? 'home' : 'import';
    App.go(name);

    if (!S.storageOK) {
      WM.toast('本地存储不可用（可能是隐私模式），数据将无法长期保存', 'warn');
    }

    registerSW();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
