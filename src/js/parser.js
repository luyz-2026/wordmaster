/* =========================================================================
 * WordMaster · parser.js
 * 模块职责：把各种常见文件解析成「行对象数组」 + 自动识别字段 + 校验
 *   · 文本格式：CSV / TSV / 分号分隔（RFC4180 引号、换行、编码自动识别）
 *   · JSON    ：数组 / {words:[...]} / {data:[...]} 等常见外壳
 *   · XLSX    ：内置极简 ZIP + XML 解析（利用浏览器原生 DecompressionStream，无需第三方库）
 * ========================================================================= */
(function (global) {
  'use strict';
  var WM = global.WM, U = WM.util;

  /* ------------------------------------------------------ 字段别名词典 */
  var ALIASES = {
    term: ['word', '单词', '词汇', '词条', '英文', '英文单词', 'term', 'vocabulary', 'vocab', 'headword', 'spelling', '拼写', 'w'],
    phonetic: ['phonetic', '音标', '英音', '英式音标', 'ipa', 'uk', 'pronunciation', '发音'],
    phoneticUs: ['phonetic_us', 'phoneticus', '美音', '美式音标', 'usphonetic', '美', 'us'],
    pos: ['pos', '词性', '词类', 'partofspeech', 'part of speech', 'part', '属性'],
    meaning: ['meaning', '释义', '中文', '意思', '中文释义', '翻译', 'translation', 'definition', 'def', '解释', 'cn'],
    example: ['example', '例句', '英文例句', 'sentence', '例句英文', 'eg', 'sent'],
    exampleCn: ['example_cn', 'examplecn', '例句翻译', '例句中文', '例句释义', '例句译文', 'translation_cn', '例句意思'],
    collocation: ['collocation', '搭配', '常见搭配', '短语', '词组'],
    derivative: ['derivative', '派生', '派生词', '词形变化', '变形', 'inflection'],
    level: ['level', '等级', '频级', '难度', '词频等级', 'frequency level', 'frequencylevel'],
    stage: ['stage', '学段', '阶段', '适用阶段', '年级'],
    category: ['category', '分类', '标签', 'tag', 'tags', 'book', '词库', '分组', 'group'],
    freqRank: ['freq_rank', 'freqrank', 'freq', '词频', '词频序号', 'rank', 'frequency', '频率']
  };
  var FIELD_LABEL = {
    term: '单词 *', phonetic: '音标(英)', phoneticUs: '音标(美)', pos: '词性', meaning: '释义 *',
    example: '英文例句', exampleCn: '例句中译', collocation: '搭配', derivative: '派生/变形',
    level: '等级', stage: '学段', category: '分类', freqRank: '词频序号'
  };
  var REQUIRED = ['term', 'meaning'];

  function normHead(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[\s_\-（）()【】\[\]/\\.、·:：]/g, '');
  }

  /** 依据表头猜测字段映射：返回 {term:'word', meaning:'释义', ...} */
  function guessMapping(headers) {
    var map = {}, used = {};
    var hs = headers.map(function (h) { return { raw: h, n: normHead(h) }; });
    Object.keys(ALIASES).forEach(function (field) {
      if (map[field]) return;
      var list = ALIASES[field], i, j;
      for (i = 0; i < list.length; i++) {              // 先精确匹配
        for (j = 0; j < hs.length; j++) {
          if (used[hs[j].raw]) continue;
          if (hs[j].n === normHead(list[i])) { map[field] = hs[j].raw; used[hs[j].raw] = 1; return; }
        }
      }
      for (i = 0; i < list.length; i++) {              // 再包含匹配
        for (j = 0; j < hs.length; j++) {
          if (used[hs[j].raw]) continue;
          if (hs[j].n && hs[j].n.indexOf(normHead(list[i])) >= 0) { map[field] = hs[j].raw; used[hs[j].raw] = 1; return; }
        }
      }
    });
    if (!map.term && hs.length) map.term = hs[0].raw;   // 兜底：第一列当作单词
    return map;
  }

  /* ------------------------------------------------------ CSV / TSV 解析 */
  function parseDelimited(text, delim) {
    var rows = [], row = [], cur = '', i = 0, inQ = false;
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    while (i < text.length) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } inQ = false; i++; continue; }
        cur += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(cur); cur = ''; i++; continue; }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += ch; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function detectDelimiter(text) {
    var sample = text.slice(0, 4000).split(/\r?\n/).slice(0, 12).join('\n');
    var cands = [',', '\t', ';', '|'], best = ',', bestN = -1;
    cands.forEach(function (d) {
      var n = sample.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    });
    return bestN > 0 ? best : ',';
  }

  /** 二维数组 -> 表头 + 行对象 */
  function toObjects(rows) {
    if (!rows.length) return { headers: [], rows: [] };
    var head = rows[0].map(function (h) { return String(h).trim(); });
    var looksNumeric = rows[0].every(function (h) { return /^\d+$/.test(String(h).trim()); });
    if (looksNumeric || head.join('') === '') {            // 无表头：生成 col1..colN
      head = rows[0].map(function (_, i) { return 'col' + (i + 1); });
      return { headers: head, rows: rows.map(arrToObj(head)), hasHeader: false };
    }
    return { headers: head, rows: rows.slice(1).map(arrToObj(head)), hasHeader: true };
    function arrToObj(h) {
      return function (arr) {
        var o = {};
        h.forEach(function (k, i) { o[k] = arr[i] == null ? '' : String(arr[i]).trim(); });
        return o;
      };
    }
  }

  /* ------------------------------------------------------------ JSON 解析 */
  function parseJSONText(text) {
    var data = JSON.parse(text.replace(/^\uFEFF/, ''));
    var arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === 'object') {
      var keys = ['words', 'list', 'data', 'vocabulary', 'items', 'result', 'rows'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(data[keys[i]])) { arr = data[keys[i]]; break; }
      }
      if (!arr) {
        for (var k in data) { if (Array.isArray(data[k]) && data[k].length && typeof data[k][0] === 'object') { arr = data[k]; break; } }
      }
      if (!arr && Array.isArray(data.data && data.data.list)) arr = data.data.list;
    }
    if (!arr) throw new Error('JSON 中未找到词条数组（支持 [{...}] 或 {words:[{...}]} 结构）');
    if (arr.length && Array.isArray(arr[0])) {              // [[a,b,c],[...]] 二维数组
      return toObjects(arr.map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }));
    }
    var headers = {};
    arr.forEach(function (o) { if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { headers[k] = 1; }); });
    var rows = arr.filter(function (o) { return o && typeof o === 'object'; }).map(function (o) {
      var n = {}; Object.keys(headers).forEach(function (k) { n[k] = o[k] == null ? '' : String(o[k]).trim(); }); return n;
    });
    return { headers: Object.keys(headers), rows: rows, hasHeader: true };
  }

  /* --------------------------------------------------- XLSX（零依赖） ---- */
  function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('当前浏览器不支持解压 API，无法读取 xlsx；请在 Excel 中「另存为 CSV UTF-8」后再导入'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /** 极简 ZIP 读取：返回 [{name, method, data}]，支持 stored / deflate */
  function unzip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1, min = Math.max(0, u8.length - 22 - 65535);
    for (var i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('文件不是有效的 xlsx（zip 结构损坏），请确认未被重命名后缀');
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = [];
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var lhOff = dv.getUint32(p + 42, true);
      var name = utf8(u8.subarray(p + 46, p + 46 + nameLen));
      var lhNameLen = dv.getUint16(lhOff + 26, true), lhExtraLen = dv.getUint16(lhOff + 28, true);
      var start = lhOff + 30 + lhNameLen + lhExtraLen;
      var end = start + compSize;
      if (!compSize) {                                    // 流式写入时尺寸为 0，向后扫描下一个 local header
        var q = start + 1;
        while (q + 4 <= u8.length && !(u8[q] === 0x50 && u8[q + 1] === 0x4b && u8[q + 2] === 0x03 && u8[q + 3] === 0x04)) q++;
        end = q;
      }
      out.push({ name: name, method: method, data: u8.subarray(start, end) });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  function utf8(u8) { return new TextDecoder('utf-8').decode(u8); }

  function xml(text) {
    var doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('xlsx 内部 XML 解析失败');
    return doc;
  }

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ''); if (!m) return 0;
    var s = m[1], n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function cellText(c, shared) {
    var t = c.getAttribute('t') || 'n';
    if (t === 'inlineStr') {
      var is = c.getElementsByTagName('is')[0];
      return is ? textOf(is) : '';
    }
    var v = c.getElementsByTagName('v')[0];
    if (!v) return '';
    var val = v.textContent;
    if (t === 's') val = shared[parseInt(val, 10)] || '';
    if (t === 'b') val = val === '1' ? 'TRUE' : 'FALSE';
    return val;
  }
  function textOf(node) {
    var out = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      var ch = node.childNodes[i];
      if (ch.nodeType === 3) out += ch.nodeValue;
      else if (ch.nodeType === 1) {
        if (ch.localName === 'rPh') continue;              // 跳过日文注音
        if (ch.localName === 't' || ch.localName === 'r') out += textOf(ch);
        else out += textOf(ch);
      }
    }
    return out;
  }

  function parseXlsxSheet(sheetXmlText, shared) {
    var doc = xml(sheetXmlText);
    var rowEls = doc.getElementsByTagName('sheetData')[0] ? doc.getElementsByTagName('sheetData')[0].getElementsByTagName('row') : [];
    var rows = [];
    for (var r = 0; r < rowEls.length; r++) {
      var cells = rowEls[r].getElementsByTagName('c'), arr = [];
      for (var c = 0; c < cells.length; c++) {
        var idx = colIndex(cells[c].getAttribute('r'));
        arr[idx] = cellText(cells[c], shared);
      }
      for (var k = 0; k < arr.length; k++) if (arr[k] === undefined) arr[k] = '';
      rows.push(arr);
    }
    return rows;
  }

  /** 读取 xlsx：返回 {sheets:[{name, headers, rows, hasHeader}]} */
  WM.readXlsx = function (file) {
    return file.arrayBuffer().then(function (ab) {
      var u8 = new Uint8Array(ab);
      var z = unzip(u8), map = {};
      z.forEach(function (e) { map[e.name] = e; });
      var wb = map['xl/workbook.xml'];
      if (!wb) throw new Error('未找到 xl/workbook.xml，确认这是真正的 .xlsx（旧版 .xls 请另存为 xlsx 或 csv）');
      // 先把所有条目解压成文本，后续 XML 解析统一使用 entry.text
      return inflateEntries(z).then(function () { return { wb: wb }; }).then(function (ctx) {
        var relMap = {};
        if (map['xl/_rels/workbook.xml.rels']) {
        var rels = xml(entryText(map['xl/_rels/workbook.xml.rels'])).getElementsByTagName('Relationship');
        for (var i = 0; i < rels.length; i++) {
          relMap[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target').replace(/^\/?xl\//, '');
        }
      }
      var shared = [];
      if (map['xl/sharedStrings.xml']) {
        var sis = xml(entryText(map['xl/sharedStrings.xml'])).getElementsByTagName('si');
        for (var j = 0; j < sis.length; j++) shared.push(textOf(sis[j]));
      }
      var sheets = [];
      var sheetEls = xml(entryText(ctx.wb)).getElementsByTagName('sheet');
      for (var s = 0; s < sheetEls.length; s++) {
        var name = sheetEls[s].getAttribute('name') || ('Sheet' + (s + 1));
        var rid = sheetEls[s].getAttribute('r:id') || sheetEls[s].getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var target = relMap[rid] || ('worksheets/sheet' + (s + 1) + '.xml');
        var entry = map['xl/' + target];
        if (!entry || !entry.text) continue;
        var o = toObjects(parseXlsxSheet(entry.text, shared));
        o.name = name;
        if (o.rows.length) sheets.push(o);
      }
      if (!sheets.length) throw new Error('xlsx 中没有读到有效数据行');
      return { sheets: sheets };
      });
    });
  };

  /** 取某个 zip 条目的文本内容（已解压则直接返回） */
  function entryText(e) {
    if (!e) return '';
    if (e.text != null) return e.text;
    return utf8(e.data || new Uint8Array(0));
  }

  /** 把所有条目解压成文本（method 8 → inflate） */
  function inflateEntries(z) {
    var jobs = z.filter(function (e) { return e.method === 8; }).map(function (e) {
      return inflateRaw(e.data).then(function (out) { e.text = new TextDecoder('utf-8').decode(out); });
    });
    z.filter(function (e) { return e.method === 0; }).forEach(function (e) { e.text = utf8(e.data); });
    return Promise.all(jobs);
  }

  /* --------------------------------------------------------- 文件读取 */
  WM.readFileText = function (file, enc) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('读文件失败')); };
      try { r.readAsText(file, enc && enc !== 'auto' ? enc : 'utf-8'); }
      catch (e) { r.readAsText(file, 'utf-8'); }
    });
  };

  /** 自动编码：发现乱码（替换字符）时尝试 GBK 重读 */
  WM.readTextAuto = function (file) {
    return WM.readFileText(file, 'utf-8').then(function (t) {
      if (t && (t.indexOf('\uFFFD') >= 0)) {
        return WM.readFileText(file, 'gbk').catch(function () { return t; });
      }
      return t;
    });
  };

  /* --------------------------------------------- 行对象 -> 词条 + 校验 */
  /**
   * @param rows 行对象数组
   * @param mapping {term:'word',...} 字段 -> 表头名
   * @param opts {categoryMode:'column'|'fixed', categoryColumn, categoryValue, lenLimit}
   */
  WM.buildWords = function (rows, mapping, opts) {
    opts = opts || {};
    var valid = [], errors = [], seen = {}, dupInFile = [];
    rows.forEach(function (row, i) {
      var lineNo = i + 2;                                  // +1 表头 +1 人文习惯
      var get = function (f) {
        var h = mapping[f]; return h && row[h] != null ? String(row[h]).trim() : '';
      };
      var term = get('term').replace(/^[\d]+[.、)]\s*/, '');  // 容忍 "1. apple" 这种带序号的写法
      var meaning = get('meaning');
      var problems = [];
      if (!term) problems.push('缺【单词】字段');
      else if (/[\u4e00-\u9fa5]/.test(term)) problems.push('单词列疑似中文，请检查列映射');
      else if (term.length > 60) problems.push('单词过长（>60 字符）');
      if (!meaning) problems.push('缺【释义】（无释义无法出题）');
      if (problems.length) {
        errors.push({ line: lineNo, reason: problems.join('；'), preview: (term || JSON.stringify(row)).slice(0, 60) });
        return;
      }
      var cat = opts.categoryMode === 'fixed' ? (opts.categoryValue || '')
        : (opts.categoryColumn ? (row[opts.categoryColumn] || '').trim() : get('category'));
      var w = {
        t: term, ph: get('phonetic'), pu: get('phoneticUs'), p: get('pos'), m: meaning,
        ex: get('example'), exc: get('exampleCn'), co: get('collocation'), dv: get('derivative'),
        lv: get('level'), st: get('stage'), cat: cat || '', fr: get('freqRank')
      };
      var key = WM.ENTRY_KEY(term);
      if (seen[key]) { dupInFile.push({ line: lineNo, term: term, first: seen[key] }); }
      else seen[key] = lineNo;
      valid.push({ word: w, key: key, line: lineNo });
    });
    return { valid: valid, errors: errors, dupInFile: dupInFile };
  };

  WM.parser = {
    ALIASES: ALIASES, FIELD_LABEL: FIELD_LABEL, REQUIRED: REQUIRED,
    normHead: normHead, guessMapping: guessMapping,
    parseDelimited: parseDelimited, detectDelimiter: detectDelimiter,
    toObjects: toObjects, parseJSONText: parseJSONText
  };
})(window);
