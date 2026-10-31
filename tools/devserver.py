# -*- coding: utf-8 -*-
"""PWA 验证专用本地服务器

在 python -m http.server 基础上增加一个特殊端点：
    GET /__stall        人为挂起 20 秒再响应（204）

配合 tools/pwacheck.html 使用：页面在开始检查时插入一张指向 /__stall 的隐藏
<img>，把 window 的 load 事件一直压住；检查结束后移除该 <img>，load 立即触发，
无头浏览器的 --dump-dom 便会在「检查全部完成之后」才输出 DOM。
"""
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv] " + (fmt % args) + "\n")

    def do_GET(self):
        if self.path.startswith('/__stall'):
            time.sleep(20)
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    srv = ThreadingHTTPServer(('127.0.0.1', port), H)
    print('serving %s at http://127.0.0.1:%d' % (ROOT, port), flush=True)
    srv.serve_forever()
