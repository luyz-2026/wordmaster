/* =========================================================================
 * WordMaster · Service Worker
 * -------------------------------------------------------------------------
 * 策略总览
 *   ① 安装期：预缓存 App Shell（index.html / offline.html / manifest / 图标）
 *   ② 页面导航：network-first —— 有网拿最新版并回填缓存；断网回退到缓存，
 *      连缓存都没有时返回 offline.html 兜底页
 *   ③ 静态资源：stale-while-revalidate —— 先回缓存保证秒开，后台异步更新
 *   ④ 版本更新：缓存名携带内容指纹（构建时替换 __CACHE_VERSION__），
 *      发布新版后旧缓存自动清理，无需手工干预
 * 注意：只处理同源 GET 请求；跨域请求与 POST 等一律直连，不做拦截。
 * ========================================================================= */

/* 构建时由 tools/build_pwa.py 替换为 wm-<内容指纹8位> */
const VERSION = '__CACHE_VERSION__';
const SHELL_CACHE = 'wm-shell-' + VERSION;
const RUNTIME_CACHE = 'wm-runtime-' + VERSION;

/* App Shell 预缓存清单（相对 sw.js 所在目录，适配任意子路径部署） */
const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon.ico'
];

/* ------------------------------- install：预缓存 App Shell -------------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

/* ------------------------------ activate：清理旧版本缓存 ---------------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ------------------------------- message：允许页面触发立即生效 ---------- */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------------------------- fetch：缓存策略 --------------------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 只管同源

  /* ① 页面导航：network-first → 缓存 → offline.html */
  var accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.indexOf('text/html') >= 0) {
    event.respondWith((async function () {
      try {
        var fresh = await fetch(req);
        // 只把「正式入口页」写回缓存，避免把 404 等意外页面污染入口
        var isEntry = /\/(index\.html)?$/.test(url.pathname);
        if (fresh && fresh.ok && isEntry) {
          var clone = fresh.clone();
          var shell = await caches.open(SHELL_CACHE);
          shell.put('./index.html', clone);
        }
        return fresh;
      } catch (err) {
        var hit = await caches.match(req);
        if (hit) return hit;
        return (await caches.match('./index.html')) ||
               (await caches.match('./offline.html')) ||
               Response.error();
      }
    })());
    return;
  }

  /* ② 其余同源静态资源：stale-while-revalidate */
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return null; });
        return cached || network.then(function (res) {
          return res || new Response('', { status: 504, statusText: 'Offline' });
        });
      });
    })
  );
});
