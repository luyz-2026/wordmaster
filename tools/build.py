# -*- coding: utf-8 -*-
"""
把 src/ 下的 index.html + css + js 打包成 dist/背单词.html 单文件应用。

用法：  python tools/build.py
产出：  dist/背单词.html  —— 双击即可用浏览器打开，完全离线，无需任何运行时环境。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
TARGET = '背单词.html'


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    html = read(os.path.join(SRC, 'index.html'))

    # 1) 内联 CSS
    def css_repl(m):
        css = read(os.path.join(SRC, m.group(1)))
        return '<style>\n%s\n</style>' % css
    html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

    # 2) 内联 JS（保持顺序）
    count = [0]

    def js_repl(m):
        js = read(os.path.join(SRC, m.group(1)))
        count[0] += 1
        return '<script>\n/* ==== %s ==== */\n%s\n</script>' % (os.path.basename(m.group(1)), js)
    html, n_js = re.subn(r'<script src="([^"]+)"></script>', js_repl, html)

    if not os.path.isdir(DIST):
        os.makedirs(DIST)
    out = os.path.join(DIST, TARGET)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize(out) / 1024.0
    print('打包完成：%s' % out)
    print('内联 CSS %d 个、JS %d 个，产物 %.1f KB' % (n_css, n_js, size))
    return 0


if __name__ == '__main__':
    sys.exit(main())
