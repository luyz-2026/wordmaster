# -*- coding: utf-8 -*-
"""WordMaster · PWA 打包脚本

把 dist/背单词.html（单文件应用）与 pwa/ 下的 PWA 资源组装成可直接托管的
静态站点目录 site/：

    site/
      index.html            入口 = 单文件应用 + 注入的 PWA 头（manifest / 图标 / iOS meta）
      manifest.webmanifest  应用清单
      sw.js                 Service Worker（缓存版本已按内容指纹固化）
      offline.html          离线兜底页
      icons/*.png|ico       多尺寸图标
      .nojekyll             关闭 GitHub Pages 的 Jekyll 处理

用法：  python tools/build_pwa.py        （先自动执行 python tools/build.py）
仅组装：python tools/build_pwa.py --skip-app
"""
import hashlib
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_HTML = os.path.join(ROOT, 'dist', '背单词.html')
PWA_DIR = os.path.join(ROOT, 'pwa')
SITE_DIR = os.path.join(ROOT, 'site')

ICON_FILES = [
    'icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png',
    'apple-touch-icon.png', 'favicon-32.png', 'favicon.ico',
]

INJECT_HEAD = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="背单词">'''


def fail(msg):
    sys.stderr.write('[build_pwa] ' + msg + '\n')
    raise SystemExit(1)


def build_app():
    """dist 不存在时先跑常规打包"""
    if not os.path.exists(DIST_HTML):
        print('[build_pwa] dist/背单词.html 不存在，先执行 tools/build.py …')
        subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'build.py')],
                              cwd=ROOT)


def inject_head(html):
    """在 theme-color meta 之后注入 PWA 头；重复运行安全"""
    marker = '<meta name="theme-color" content="#3b6cf6">'
    if marker not in html:
        fail('index.html 缺少 theme-color meta，无法定位注入点')
    if 'manifest.webmanifest' in html:      # 已注入
        return html
    return html.replace(marker, marker + '\n' + INJECT_HEAD, 1)


def content_fingerprint(pieces):
    """按预缓存文件内容生成 8 位指纹，内容一变缓存名就变，确保发布新版即生效"""
    h = hashlib.sha1()
    for p in pieces:
        with open(p, 'rb') as f:
            h.update(os.path.basename(p).encode('utf-8'))
            h.update(f.read())
    return h.hexdigest()[:8]


def main(skip_app=False):
    if not skip_app:
        build_app()
    if not os.path.exists(DIST_HTML):
        fail('找不到 dist/背单词.html，请先运行 python tools/build.py')

    manifest = os.path.join(PWA_DIR, 'manifest.webmanifest')
    sw_src = os.path.join(PWA_DIR, 'sw.js')
    offline = os.path.join(PWA_DIR, 'offline.html')
    for p in (manifest, sw_src, offline):
        if not os.path.exists(p):
            fail('缺少 PWA 资源：' + p)

    icons_dir = os.path.join(PWA_DIR, 'icons')
    for name in ICON_FILES:
        if not os.path.exists(os.path.join(icons_dir, name)):
            fail('缺少图标 ' + name + '，请先运行 python tools/make_icons.py')

    # 1) 组装 site/
    if os.path.exists(SITE_DIR):
        shutil.rmtree(SITE_DIR)
    os.makedirs(SITE_DIR)

    with open(DIST_HTML, encoding='utf-8') as f:
        html = f.read()
    index_path = os.path.join(SITE_DIR, 'index.html')
    with open(index_path, 'w', encoding='utf-8', newline='') as f:
        f.write(inject_head(html))

    shutil.copy(manifest, os.path.join(SITE_DIR, 'manifest.webmanifest'))
    shutil.copy(offline, os.path.join(SITE_DIR, 'offline.html'))
    site_icons = os.path.join(SITE_DIR, 'icons')
    os.makedirs(site_icons)
    for name in ICON_FILES:
        shutil.copy(os.path.join(icons_dir, name), os.path.join(site_icons, name))

    # GitHub Pages 需要；其它托管放着也无害
    with open(os.path.join(SITE_DIR, '.nojekyll'), 'w') as f:
        f.write('')

    # 2) 依据最终内容生成缓存版本并写入 sw.js
    precache = [index_path, manifest, os.path.join(PWA_DIR, 'sw.js'), offline] + \
               [os.path.join(icons_dir, n) for n in ICON_FILES]
    version = 'wm-' + content_fingerprint(precache)
    with open(sw_src, encoding='utf-8') as f:
        sw = f.read()
    if '__CACHE_VERSION__' not in sw:
        fail('sw.js 缺少 __CACHE_VERSION__ 占位符')
    sw = sw.replace('__CACHE_VERSION__', version)
    with open(os.path.join(SITE_DIR, 'sw.js'), 'w', encoding='utf-8', newline='') as f:
        f.write(sw)

    # 3) 汇总
    total = 0
    for dirpath, _, files in os.walk(SITE_DIR):
        for fn in files:
            total += os.path.getsize(os.path.join(dirpath, fn))
    print('[build_pwa] 站点已生成：%s' % SITE_DIR)
    print('[build_pwa] SW 缓存版本：%s' % version)
    print('[build_pwa] 站点总大小：%.1f KB' % (total / 1024.0))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(skip_app='--skip-app' in sys.argv))
