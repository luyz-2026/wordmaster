# -*- coding: utf-8 -*-
"""生成 PWA 图标：多尺寸 PNG（含 maskable）与 favicon.ico

依赖：Pillow（pip install pillow）。没有 Pillow 时脚本会给出提示而不是静默失败。
输出目录：pwa/icons/
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_SVG = os.path.join(ROOT, 'pwa', 'icon.svg')
OUT_DIR = os.path.join(ROOT, 'pwa', 'icons')

BRAND_DARK = (40, 62, 130)
FONT_CANDIDATES = [
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/msyhbd.ttc',
    'C:/Windows/Fonts/arialbd.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]

# (文件名, 尺寸, 是否满幅(maskable))
TARGETS = [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-192-maskable.png', 192, True),
    ('icon-512-maskable.png', 512, True),
    ('apple-touch-icon.png', 180, False),
    ('favicon-32.png', 32, False),
]
ICO_SIZES = [(16, 16), (32, 32), (48, 48)]


def load_font(size):
    from PIL import ImageFont
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def gradient(size, c1, c2):
    """生成 135° 渐变底图"""
    from PIL import Image
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * max(1, size - 1))
            px[x, y] = lerp(c1, c2, t)
    return img


def rounded_mask(size, radius_ratio):
    from PIL import Image, ImageDraw
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


def draw_icon(size, maskable=False):
    """绘制一枚图标：渐变底 + 卡片意象 + WM 字样"""
    from PIL import Image, ImageDraw

    c1, c2 = (74, 123, 255), (124, 92, 240)
    scale = size / 512.0

    # maskable：满幅方形（系统在任意形状遮罩下裁切，安全区为中间 80%）
    if maskable:
        img = gradient(size, c1, c2)
    else:
        base = gradient(size, c1, c2)
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        img.paste(base, (0, 0), rounded_mask(size, 112 / 512.0))

    d = ImageDraw.Draw(img)
    s = lambda v: v * scale * (0.78 if maskable else 1.0)   # maskable 时整体缩小进安全区
    off = size * (0.11 if maskable else 0.0)                # maskable 居中偏移

    # 三张卡片
    def card(x, y, w, h, alpha):
        layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle(
            [off + s(x), off + s(y), off + s(x + w), off + s(y + h)],
            radius=int(s(26)), fill=(255, 255, 255, alpha))
        img.alpha_composite(layer) if img.mode == 'RGBA' else img.paste(layer, (0, 0), layer)

    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    card(196, 118, 196, 248, 46)
    card(228, 146, 196, 248, 74)
    card(260, 174, 196, 248, 235)

    # 卡片上的横线（模拟单词行）
    d = ImageDraw.Draw(img)
    for y, w in ((248, 120), (296, 90)):
        d.line([off + s(298), off + s(y), off + s(298 + w), off + s(y)],
               fill=(59, 108, 246, 220), width=max(1, int(s(14))))

    # WM 字样（居中于最前卡片内部，避免贴边被圆角裁切）
    font = load_font(int(s(92)))
    text = 'WM'
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((off + s(352) - tw / 2.0, off + s(368) - th / 2.0 - s(4)),
           text, font=font, fill=(59, 108, 246, 255))
    return img


def build():
    try:
        from PIL import Image
    except ImportError:
        sys.stderr.write('缺少 Pillow，请先执行：pip install pillow\n')
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    for name, size, maskable in TARGETS:
        img = draw_icon(size, maskable)
        path = os.path.join(OUT_DIR, name)
        img.save(path, 'PNG', optimize=True)
        print('%-26s %4dx%-4d %6.1f KB' % (name, size, size, os.path.getsize(path) / 1024.0))

    # favicon.ico（多尺寸打包）
    ico_imgs = []
    for sz in ICO_SIZES:
        ico_imgs.append(draw_icon(sz[0]).resize(sz, Image.LANCZOS))
    ico_path = os.path.join(OUT_DIR, 'favicon.ico')
    ico_imgs[0].save(ico_path, 'ICO', sizes=ICO_SIZES, append_images=ico_imgs[1:])
    print('%-26s %s %6.1f KB' % ('favicon.ico', 'multi', os.path.getsize(ico_path) / 1024.0))
    print('图标输出目录：' + OUT_DIR)
    return 0


if __name__ == '__main__':
    raise SystemExit(build())
