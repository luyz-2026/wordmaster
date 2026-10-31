# -*- coding: utf-8 -*-
"""
生成示例/模板文件：
  1) samples/模板-标准字段.csv / .json / .tsv   —— 导入模板（含全部支持字段）
  2) samples/CET4-批次1~3.csv                  —— 从 CET-4 蓝本切出的三批示例，演示「分批多次导入」
用法： python tools/make_samples.py [蓝本CSV路径]
"""
import csv
import json
import os
import sys
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, 'samples')
BLUEPRINT = sys.argv[1] if len(sys.argv) > 1 else r'G:\workbuddy\2026-10-31-00-16-35\cet4-vocab\cet4_vocab_full.csv'

COLS = ['index', 'word', 'phonetic', 'phonetic_us', 'pos', 'meaning',
        'collocation', 'derivative', 'example', 'example_cn', 'level', 'stage', 'freq_rank']

TEMPLATE_ROWS = [
    {'index': 1, 'word': 'abandon', 'phonetic': '/əˈbændən/', 'phonetic_us': '/əˈbændən/', 'pos': 'n./vt.',
     'meaning': '放任；遗弃；放弃；抛弃', 'collocation': 'abandon ship（弃船）',
     'derivative': '过去式/过去分词 abandoned；abandonment 放弃',
     'example': 'The crew prepared to abandon ship in an orderly fashion.', 'example_cn': '全体船员秩序井然地准备弃船。',
     'level': '中频', 'stage': '高中', 'freq_rank': 2182},
    {'index': 2, 'word': 'benefit', 'phonetic': '/ˈbenɪfɪt/', 'phonetic_us': '/ˈbenɪfɪt/', 'pos': 'n./v.',
     'meaning': '益处；好处；有益于', 'collocation': 'benefit from（从…中获益）', 'derivative': '复数 benefits；beneficial 有益的',
     'example': 'Regular exercise benefits both body and mind.', 'example_cn': '规律运动对身心都有益处。',
     'level': '高频', 'stage': '四级', 'freq_rank': 1204},
    {'index': 3, 'word': 'capable', 'phonetic': '/ˈkeɪpəbl/', 'phonetic_us': '/ˈkeɪpəbl/', 'pos': 'adj.',
     'meaning': '有能力的；能干的', 'collocation': 'be capable of（能够）', 'derivative': 'capability 能力；capably 能干地',
     'example': 'She is quite capable of handling the task alone.', 'example_cn': '她完全有能力独自处理这项任务。',
     'level': '中频', 'stage': '高中', 'freq_rank': 2601},
]


def write_csv(path, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, '') for c in COLS})


def write_tsv(path, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        f.write('\t'.join(COLS) + '\n')
        for r in rows:
            f.write('\t'.join(str(r.get(c, '')).replace('\t', ' ') for c in COLS) + '\n')


def write_json(path, rows):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def main():
    if not os.path.isdir(SAMPLES):
        os.makedirs(SAMPLES)

    write_csv(os.path.join(SAMPLES, '模板-标准字段.csv'), TEMPLATE_ROWS)
    write_tsv(os.path.join(SAMPLES, '模板-标准字段.tsv'), TEMPLATE_ROWS)
    write_json(os.path.join(SAMPLES, '模板-标准字段.json'), TEMPLATE_ROWS)
    # JSON 另一种常见外壳：{words:[...]}
    write_json(os.path.join(SAMPLES, '模板-words外壳.json'), {'words': TEMPLATE_ROWS})
    print('已生成 5 个模板文件：samples/')

    if not os.path.exists(BLUEPRINT):
        print('未找到蓝本文件，跳过批次示例：%s' % BLUEPRINT)
        return

    with open(BLUEPRINT, 'r', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    batches = [
        ('CET4-批次1-初中词.csv', lambda r: r.get('stage') == '初中', 200),
        ('CET4-批次2-高中词.csv', lambda r: r.get('stage') == '高中', 200),
        ('CET4-批次3-四级新增.csv', lambda r: r.get('stage') == '四级', 200),
    ]
    for name, pred, limit in batches:
        picked = [r for r in rows if pred(r)][:limit]
        out = OrderedDict()
        # 重排 index，打散原来的字母顺序模拟真实分批
        new_rows = []
        for i, r in enumerate(picked, 1):
            r = dict(r)
            r['index'] = i
            new_rows.append(r)
        write_csv(os.path.join(SAMPLES, name), new_rows)
        out[name] = len(new_rows)
        print('已生成 %s（%d 词）' % (name, len(new_rows)))


if __name__ == '__main__':
    main()
