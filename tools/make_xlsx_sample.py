# -*- coding: utf-8 -*-
"""
用标准库 zipfile 生成一份最小合法的 samples/模板-Excel.xlsx，
用于验证（并演示）本程序内置的零依赖 xlsx 解析能力。
用法： python tools/make_xlsx_sample.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', '模板-Excel.xlsx')

HEADERS = ['word', 'phonetic', 'pos', 'meaning', 'example', 'example_cn', 'level', 'stage']
ROWS = [
    ['abandon', '/əˈbændən/', 'n./vt.', '放任；遗弃；放弃', 'They had to abandon the plan.', '他们不得不放弃该计划。', '中频', '高中'],
    ['benefit', '/ˈbenɪfɪt/', 'n./v.', '益处；有益于', 'Exercise benefits your health.', '运动有益健康。', '高频', '四级'],
    ['capable', '/ˈkeɪpəbl/', 'adj.', '有能力的；能干的', 'He is capable of hard work.', '他能胜任艰苦的工作。', '中频', '高中'],
    ['decline', '/dɪˈklaɪn/', 'n./v.', '下降；婉拒', 'Sales declined sharply last year.', '去年销量急剧下降。', '高频', '四级'],
]

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

WORKBOOK = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="核心词" sheetId="1" r:id="rId9"/>
<sheet name="补充词" sheetId="2" r:id="rId10"/>
</sheets>
</workbook>'''

WORKBOOK_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'


def col_letter(i):
    s = ''
    n = i + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def shared_xml(strings):
    items = ''.join('<si><t>%s</t></si>' % s for s in strings)
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>' % (
        len(strings), len(strings), items)


def sheet_xml(rows, shared_index):
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    all_rows = [HEADERS] + rows
    for r, values in enumerate(all_rows, start=1):
        out.append('<row r="%d">' % r)
        for c, v in enumerate(values):
            idx = shared_index[v]
            out.append('<c r="%s%d" t="s"><v>%d</v></c>' % (col_letter(c), r, idx))
        out.append('</row>')
    out.append('</sheetData></worksheet>')
    return ''.join(out)


def main():
    strings = []
    for h in HEADERS:
        strings.append(h)
    for row in ROWS:
        for v in row:
            if v not in strings:
                strings.append(v)
    strings.append('无音标示例词')
    strings.append('/ˈsæmpl/')
    strings.append('n.')
    strings.append('样本；样品')
    strings.append('Please provide a sample of your work.')
    strings.append('请提供一份你的作品样本。')
    strings.append('低频')
    strings.append('初中')
    shared_index = {s: i for i, s in enumerate(strings)}

    body = ['无音标示例词', '/ˈsæmpl/', 'n.', '样本；样品',
            'Please provide a sample of your work.', '请提供一份你的作品样本。', '低频', '初中']
    sheet2_rows = [[shared_index[k] for k in HEADERS],
                   [shared_index[k] for k in body],
                   [shared_index[k] for k in body]]
    sheet2 = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
              '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for ri, rvals in enumerate(sheet2_rows, start=1):
        sheet2.append('<row r="%d">' % ri)
        for c, idx in enumerate(rvals):
            sheet2.append('<c r="%s%d" t="s"><v>%d</v></c>' % (col_letter(c), ri, idx))
        sheet2.append('</row>')
    sheet2.append('</sheetData></worksheet>')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CONTENT_TYPES)
        z.writestr('_rels/.rels', RELS)
        z.writestr('xl/workbook.xml', WORKBOOK)
        z.writestr('xl/_rels/workbook.xml.rels', WORKBOOK_RELS)
        z.writestr('xl/styles.xml', STYLES)
        z.writestr('xl/sharedStrings.xml', shared_xml(strings))
        z.writestr('xl/worksheets/sheet1.xml', sheet_xml(ROWS, shared_index))
        z.writestr('xl/worksheets/sheet2.xml', ''.join(sheet2))
    print('已生成 %s（两个工作表：核心词 / 补充词）' % OUT)


if __name__ == '__main__':
    main()
