# WordMaster · 本地离线背单词程序

一个**零依赖、纯离线、双击即用**的背单词程序：单个 HTML 文件即可运行，不需要安装 Python / Node / 数据库，也不需要联网。
内置 CET-4 词库（`samples/cet4_vocab_初中·高中·四级.csv`，合计 4966 词）+ 高考核心 688 词，支持自建词库、分批多次导入、自定义出题、生词本自动进出与学习统计。

> **PWA / 在线部署**：本项目同时附带完整的 PWA 改造包（manifest、Service Worker、离线兜底、多尺寸图标、响应式布局、
> GitHub Pages 部署工作流）。运行方式 1~3 之外，还可以 `python tools/build_pwa.py` 生成 `site/` 部署到任意静态托管，
> 通过 HTTPS 网址在手机 / 平板 / 桌面访问并「添加到主屏幕」——详见 **[PWA.md](PWA.md)**。

---

## 一、快速开始（运行方式）

### 方式 1：直接双击（推荐）

打开 `dist/背单词.html` —— 双击即可，会用系统默认浏览器打开，界面和数据都在本机。
把它复制到 U 盘、网盘、另一台电脑都能用。

> 建议用 **Edge / Chrome / 火狐** 的新版本打开（内部零依赖 xlsx 解析用到浏览器原生解压 API）。

### 方式 2：从源码运行

直接双击 `src/index.html` 也能运行（源码是分层结构，便于阅读与二次开发）；
修改源码后执行打包脚本生成新的单文件：

```bash
python tools/build.py        # → dist/背单词.html（把 css/js 全部内联）
```

### 方式 3：浏览器禁用了本地存储时的兜底

极少数环境（如某些隐私模式 / Safari 的 file:// 限制）不允许 `localStorage`，此时程序会提示写入失败。
解决办法是用浏览器可写存储的方式打开：

```bash
cd wordmaster
python -m http.server 8000
# 浏览器访问 http://127.0.0.1:8000/dist/背单词.html
```

### 首次使用流程（3 步）

1. 打开程序 → 自动进入「导入词库」页
2. 选择文件：挑 `samples/cet4_vocab_初中.csv`（或你的 CSV / JSON / Excel 词库）
3. 目标词库选「＋ 新建词库并导入」→ 分类来源选 `stage` 列 → 点「开始导入」
   → 之后从「开始测试」页选择范围即可开练

---

## 二、项目结构

```
wordmaster/
├─ dist/
│  └─ 背单词.html              # ★ 成品：单文件应用（约 140 KB，双击即用）
├─ src/                        # 源码（分层、可读，双击 index.html 也可直接跑）
│  ├─ index.html               # 页面骨架：侧边栏 / 顶栏 / 视图容器 / 模态框与 Toast 容器
│  ├─ css/app.css              # 全部样式（浅色主题，纯 CSS，无字体图标外链）
│  └─ js/
│     ├─ core.js               # ① 工具库  ② 数据层 Store（localStorage 持久化）
│     ├─ parser.js             # 文件解析：CSV/TSV/JSON/XLSX + 字段自动映射 + 校验
│     ├─ quiz.js               # 出题引擎：选题 / 组卷 / 干扰项 / 判题 / 生词本联动
│     ├─ views-library.js      # 视图：词库管理、词条浏览、词库导入
│     ├─ views-quiz.js         # 视图：首页、测试配置、答题、结果、生词本、统计、设置
│     └─ app.js                # 路由 + 导航 + 全局快捷键 + 启动引导
├─ samples/                    # 示例与模板文件（可直接导入试手）
│  ├─ 模板-标准字段.csv / .tsv / .json      # 标准字段模板
│  ├─ 模板-words外壳.json                   # {words:[...]} 结构示例
│  ├─ 模板-Excel.xlsx                       # Excel 示例（两个工作表）
│  ├─ cet4_vocab_初中.csv / 高中.csv / 四级.csv  # 内置正式词库（合计 4966 行，按学段切分）
│  ├─ 高考英语核心高频688词汇_已处理.csv          # 内置补充词库（688 行，无 stage/level 列）
│  └─ README.md                                 # 词库清单、字段口径与导入说明
├─ tools/
│  ├─ build.py                 # 打包：src → dist 单文件
│  ├─ make_samples.py          # 生成模板与 CET-4 分批示例
│  ├─ make_xlsx_sample.py      # 生成 Excel 示例（纯标准库 zipfile）
│  ├─ selftest.html            # 逻辑自测（60+ 断言：解析/导入/出题/判题/备份）
│  └─ uismoke.html             # UI 冒烟测试（逐页渲染 + 点击 + 键盘）
└─ README.md
```

---

## 三、核心模块设计

```
        ┌────────────── 视图层（views-*.js）── 只负责渲染与事件 ─────────────┐
        │  首页  │  测试配置  │  答题/反馈  │  结果  │  生词本  │  统计  │  设置  │  词库/导入 │
        └───────┴───────────┴─────────────┴────────┴──────────┴───────┴────────┴────────────┘
                     │ 调 services                                  ▲ 读状态
        ┌────────────▼───────────────────────────────────────────────┴───────────────────┐
        │                     业务层：WM.Quiz（quiz.js）                                  │
        │   selectWords() 选题 → build() 组卷 → judge() 判题 → submit() 写进度/生词本      │
        └────────┬──────────────────────────────────────────────────────────────────────┘
                 │ 读词条 / 写进度
        ┌────────▼──────────────────────────────────────┐   ┌────────────────────────────┐
        │  数据层：WM.Store（core.js，localStorage）      │   │ 解析层：WM.parser（parser.js）│
        │  books / words / progress / notebook /         │◄──┤  CSV·TSV·JSON·XLSX → 行对象 │
        │  history / settings， debounce 落盘             │   │  字段自动映射 / 重复与错误检测 │
        └───────────────────────────────────────────────┘   └────────────────────────────┘
```

| 模块 | 职责 | 主要 API |
|---|---|---|
| `core.js` 工具 | 转义/日期/洗牌/编辑距离/下载文件 | `WM.util.*` |
| `core.js` Store | 唯一数据源，所有写操作经它落盘 | `createBook / upsertWord / answer / toggleNotebook / pushHistory / stats / exportBackup` |
| `core.js` Mastery | 掌握度模型与统计口径的唯一来源（`WM.Mastery` 常量 + `of()` 计算） | `H0 / EWMA_A / MIN_SAMPLE / MASTER_M / FIRM_M / KAPPA / of` |
| `parser.js` | 文件格式无关化为 `{headers, rows}` | `parseDelimited / detectDelimiter / parseJSONText / readXlsx / guessMapping / buildWords` |
| `quiz.js` | 出题与判题（与 UI 完全解耦） | `selectWords / build / judge / submit` |
| `views-*.js` | 每个页面一个对象：`{title, render, onKey}` | `WM.views.xxx` |
| `app.js` | hash 路由 + Alt+数字切换 + 启动 | `WM.App.go / refresh / refreshSide` |

### 数据模型（localStorage 单键 `wordmaster.db.v1`）

```js
{
  books:    [{ id, name, category, note, createdAt, updatedAt, wordKeys: [] }],   // 词库：wordKeys 保序 → 支持「顺序出题」
  words:    { 'abandon': { t, ph, pu, p, m, ex, exc, co, dv, lv, st, cat, books:[bookId] } },
  progress: { 'abandon': { seen, right, wrong, streak, best, lastTest, lastOk, learned,
                            firstOk, ewma, fillSeen, fillRight, gapMax } },   // 后 5 个为统计扩展字段（惰性写入，缺省自动降级）
  notebook: { 'abandon': { addedAt, wrongCount, lastWrong, lastOk } },
  history:  [{ id, startedAt, finishedAt, label, total, correct, cfg, items:[...] }],
  settings: { defaultCount, order, types, direction, streakTarget, dailyGoal, autoNotebook, showPhonetic }
}
```

* **词条主键** = 单词的小写形式，因此同一拼写不同词性会合并为一个词条（导入时重复会给出提示）。
* 词条可被多个词库「引用」（`books: []`），一个词库被删除时，只清理不再被引用的孤立词条。
* 实测：4966 词条全字段（含例句/搭配/派生）约 **1.9 MB**，在浏览器 5 MB 配额内够用；历史记录最多保留 80 次，写满时自动裁剪并提示导出备份。

---

## 四、关键实现代码

### 1) CSV/TSV 解析：RFC4180 引号状态机（带引号换行也能正确切分）

```js
function parseDelimited(text, delim) {              // src/js/parser.js
  var rows = [], row = [], cur = '', i = 0, inQ = false;
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');   // 去 BOM、统一换行
  while (i < text.length) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i+1] === '"') { cur += '"'; i += 2; continue; } inQ = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === delim) { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
```

### 2) 字段自动映射：中英文别名双匹配（精确 → 包含）

```js
var ALIASES = {
  term:    ['word','单词','词汇','词条','英文','term','vocabulary','headword','spelling'],
  meaning: ['meaning','释义','中文','意思','中文释义','翻译','translation','definition'],
  phonetic:['phonetic','音标','英音','ipa','uk','发音'],
  // … pos / example / exampleCn / collocation / derivative / level / stage / category / freqRank
};
function guessMapping(headers) {                    // 归一化表头后用「先精确、后包含」两轮匹配
  /* … */ if (!map.term && hs.length) map.term = hs[0].raw;   // 兜底：首列即单词
  return map;
}
```

### 3) XLSX 读取：不引入第三方库，用原生 `DecompressionStream` 解 zip

```js
function inflateRaw(u8) {                           // xlsx 本质是 zip + XML
  var ds = new DecompressionStream('deflate-raw');
  return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer()
           .then(b => new Uint8Array(b));
}
function unzip(u8) {                                // 扫 EOCD → 读中央目录 → 定位 local header → 取数据
  // 返回 [{name, method, data}]，method 0 直接读、8 走 inflate
}
// 再解析 xl/workbook.xml + _rels 得到工作表名与路径，配合 sharedStrings.xml 还原共享字符串
```

### 4) 干扰项生成：相似度打分 + 随机抽样（保证合理且不重复）

```js
sc = Math.random() * 1.4;                            // 基础随机，避免每次选项完全一样
if (mode === 'term') {                               // 「释义 → 选单词」
  sc -= Math.abs(w.t.length - answer.t.length) * 0.35;   // 长度接近
  if (w.t[0] === answer.t[0]) sc += 0.9;                  // 首字母相同
  if (w.t.slice(-2) === answer.t.slice(-2)) sc += 0.7;    // 后缀相同
  if (partOfSpeech(w) === partOfSpeech(answer)) sc += 0.5;
} else {                                             // 「单词 → 选释义」
  sc -= Math.abs(meaningLen(w) - meaningLen(answer)) * 0.05;
  if (partOfSpeech(w) === partOfSpeech(answer)) sc += 1.2;  // 词性一致优先
}
```

### 5) 填空题：例句挖空 + 拼写容错 + 中文义项匹配

```js
function blankExample(ex, term) {                    // 例句中把目标词挖成 ________
  var re = new RegExp('\\b' + escapeRe(term) + '\\b', 'ig');
  return re.test(ex) ? ex.replace(re, '________') : '';
}
// 英文拼写：完全一致 → 直接对；编辑距离 ≤1（词长≥5）/ ≤2（词长≥9）→ 判对并给出「拼写接近」提示
// 中文释义：义项按 ；，/ 切分后逐项比对，相等或命中核心子串（比例>0.5）即判对
```

### 6) 生词本自动进出（唯一入口 Store.answer）

```js
answer: function (key, ok) {
  var p = this.prog(key); p.seen++; p.lastTest = Date.now();
  if (ok) { p.right++; p.streak++; p.lastOk = now; p.learned = true; }
  else    { p.wrong++; p.streak = 0; }
  if (!ok && settings.autoNotebook) {                       // 答错 → 收入生词本并累加错误次数
    var nb = notebook[key] || (notebook[key] = {addedAt: now, wrongCount: 0});
    nb.wrongCount++; nb.lastWrong = now;
  } else if (ok && notebook[key]) {                         // 答对 → 连续达标后自动移出
    notebook[key].lastOk = now;
    if (p.streak >= settings.streakTarget) { delete notebook[key]; return {outOfNotebook: true}; }
  }
  this.saveSoon();
}
```

### 7) 持久化：防抖写 + 配额自适应

```js
saveSoon: function () {                              // 120ms 防抖，批量导入时不会每行写一次盘
  clearTimeout(this._t); this._t = setTimeout(() => { if (!this.save()) WM.toast('本地存储写入失败…', 'bad'); }, 120);
},
save: function () {
  try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); return true; }
  catch (e) {                                        // 配额溢出：先裁剪历史再重试一次，仍失败则提示导出备份
    if (this.state.history.length > 20) { this.state.history = this.state.history.slice(-20); /* retry */ }
    this.storageOK = false;
  }
}
```

---

## 五、词库导入流程

> 关键：**一次可多选多个文件**，也支持**反复多次**向同一个词库追加；每批都会先给预览报告再落盘。

| 步骤 | 操作 | 说明 |
|---|---|---|
| ① | 点击/拖拽选择文件 | 支持 `.csv .tsv .txt .json .xlsx .xlsm`；编码可选「自动 / UTF-8 / GBK」，乱码会自动回退 GBK 重读 |
| ② | 选择目标 | 「合并到一个词库」（可＋新建）或「每个文件各建一词库」（以文件名命名） |
| ③ | 指定分类来源 | 取自文件某一列（蓝本建议 `stage`：初中/高中/四级；或 `level`：高频/中频/低频）或统一填一个值 |
| ④ | 选择重复处理策略 | **跳过**（重复行只归入词库、补空缺字段，不覆盖已有内容）／**覆盖**（用新数据刷新已有词条） |
| ⑤ | 确认字段映射 | 表头自动识别，页面上可逐项改；每列右侧显示样例值，方便核对 |
| ⑥ | 看预览报告 | 数据行数 / 新增 / 库中已存在 / 本批重复 / 格式错误，错误行可展开看行号与原因 |
| ⑦ | 开始导入 | 完成后弹窗给明细，可「继续导入下一批」→ 重复 ①~⑦ 即可分批建库 |

**导入后的题干数据来源**：缺失「释义」的行会被拦截列出（例如蓝本里 `atop` 的释义为空，全量导入时会被标出共 7 行），不会因为脏数据静默产生无法作答的题目。

### 支持的字段

| 程序字段 | 常见列名（自动识别） | 蓝本对应列 |
|---|---|---|
| 单词 `term`* | word / 单词 / 词汇 / term / headword | `word` |
| 音标(英) `phonetic` | phonetic / 音标 / 英音 / ipa | `phonetic` |
| 音标(美) `phoneticUs` | phonetic_us / 美音 | `phonetic_us` |
| 词性 `pos` | pos / 词性 / part of speech | `pos` |
| 释义 `meaning`* | meaning / 释义 / 中文 / definition | `meaning` |
| 英文例句 `example` | example / 例句 / sentence | `example` |
| 例句中译 `exampleCn` | example_cn / 例句翻译 | `example_cn` |
| 搭配 `collocation` | collocation / 搭配 | `collocation` |
| 派生 `derivative` | derivative / 派生 / 词形变化 | `derivative` |
| 等级 `level` | level / 等级 / 难度 | `level` |
| 学段 `stage` | stage / 学段 / 阶段 | `stage` |
| 分类 `category` | category / 分类 / 标签 | 可由任意列充当 |
| 词频 `freqRank` | freq_rank / 词频 | `freq_rank` |

\* 必填：单词 + 释义；其余缺失不影响使用。

### 分批导入示例（`samples/` 可直接练手）

```
第 1 次：选中 cet4_vocab_初中.csv → 新建「CET-4」词库（分类来源：stage 列）→ 1616 词（2 词缺释义被拦下）
第 2 次：选中 cet4_vocab_高中.csv → 目标仍选「CET-4」→ 累计 3106 词
第 3 次：选中 cet4_vocab_四级.csv → 同上 → 累计 4959 词（5 词缺释义被拦下）
第 4 次：选中 高考英语核心高频688词汇_已处理.csv → 分类来源选「统一填写」填「高考688」
        → 688 条中 624 条与前三个文件重复被跳过，实际新增 64 → 词库最终 5023 词
```

四个文件为官方内置词库（前三份合计 4966 词即完整 CET-4 蓝本，按学段切分且互不重复），逐个导入同一词库即可，导入顺序会被保留，「顺序出题」就按这个顺序走。

---

## 六、测试与学习机制

**选题范围**：全部词库 / 指定词库（多选）/ 指定分类（多选）/ 仅生词本；可叠加「只看未学 / 只看已学」与「使用频次 level」。
**使用频次分级**（`WM.FreqLevel`，core.js）：高频 / 中频 / 低频 / 未标注 四档，与来源、学习状态取交集。取值优先级：① 词条 `level` 标签（高频/中频/低频，兼容 High/Medium/Low 等中英文写法与「高频词」这类包含写法）；② 标签缺失时按词频序位区间归类——rank ≤ 2000 高频、2001~6000 中频、> 6000 低频（区间取自蓝本 CET-4 词库中 level 标注与 freq_rank 的实际分布，两者完全吻合；rank ≤ 0 视为无效）；③ 都没有则归入「未标注」。多选级别取并集，全部不选 = 不限。
**题量与顺序**：1~500 或「不限」，随机或按导入顺序。
**题型**：

| 题型 | 形式 | 判定规则 |
|---|---|---|
| 单项选择题 | 四选一，干扰项按长度/首尾字母/词性打分生成 | 选项下标比对，提交后标出正确项与你选的错项 |
| 填空题 A | 给释义 + 挖空例句 → 填单词 | 归一化比对；编辑距离 ≤1（长≥5）/ ≤2（长≥9）判对并提示「拼写接近」 |
| 填空题 B | 给单词 + 例句 → 填中文释义 | 义项切分后逐项比对，命中任一义项子串即判对 |

提交后**立即判定**，并展示：单词 + 双音标 + 词性 + 完整释义 + 例句（含中译）+ 搭配 + 派生 + 分类，同时提示是否被收进生词本。

**生词本规则**：答错自动收录（记录错误次数、最近错误时间、所属分类）；连续答对达到设定次数（默认 3，可在设置里改）自动移出；支持手动加入/移出、按错误次数/最近错误排序、单独强化测试、导出 CSV。

**数据持久化与统计**：每次答题写 `progress`，每次测试写 `history`；备份页可导出「完整备份（含词库）」或「仅进度」，换电脑时导入即可继续。

**统计口径（「统计概览」页，判定规则集中在 `WM.Mastery`，页面底部有同步说明表）**：

| 指标 | 口径 |
|---|---|
| 已学 | 当前词库中「至少作答过 1 次」的**去重**词条数（同词多库引用只算一次；手动标记已学但从未作答的不计入） |
| 掌握度 M | `M = 100 × (0.35·C + 0.30·A + 0.20·I + 0.15·D) × (0.45 + 0.55·R)` |
| ↳ 连对度 C | `min(1, 连对数 / min(目标连对数+2, 6))`，答错清零 |
| ↳ 时间加权正确率 A | `0.65×EWMA(α=0.4) + 0.35×累计正确率`，最近作答权重最高 |
| ↳ 复习间隔达标度 I | `0.5 + 0.5×min(1, 已跨越的最长间隔 / 期望间隔)`，期望间隔 = `1.5 × 2^(min(连对数,8)-1)` 天 |
| ↳ 难度表现 D | 做过填空题取填空正确率（高难度题型），否则取 A |
| ↳ 保持率 R（遗忘曲线） | `R = 2^(-Δt/H)`，Δt = 距上次答对天数，H = 期望间隔；久不复习 M 会衰减 |
| 已掌握 | 样本 ≥ 3 且 连对数 ≥ 目标 且 A ≥ 60% 且 M ≥ 70（四条同时满足） |
| 分档 | 牢固 ≥ 92 / 已掌握 70~92 / 巩固中 45~70 / 薄弱 < 45 / 未接触 |
| 累计正确率 | Σ答对 / Σ作答（作答等权，仅参考） |
| 词条等权正确率 | 每词先算时间加权正确率再等权平均——一个词刷 20 次只占 1 份权重，抗重复刷题 |
| 首次正确率 | 首次接触即答对的比例，与刷题次数无关 |
| 近期时间加权正确率 | 按测试记录距今时间指数加权（半衰期 7 天） |
| 知识点加权正确率 | 分类内 `(答对 + κ×全局正确率) / (作答 + κ)`，κ=8，小样本向全局收缩 |
| 薄弱指数 | `45%×未掌握占比 + 30%×正确率缺口 + 15%×生词占比 + 10%×未接触占比`（0~100） |
| 待复习 | 曾答对过但保持率 R < 50% 的词条数 |

统计页自上而下：总览卡 → 正确率四口径 → 近 14 天答题量 → 学习趋势（本期 vs 上期 + 近 8 周走势）→ 掌握程度分布 → 知识点（分类）掌握情况 → 薄弱知识点分布（薄弱分类 + 待攻克词条）→ 测试历史 → 口径说明。

---

## 七、键盘快捷键

| 快捷键 | 作用 |
|---|---|
| `Alt` + `1`~`7` | 切换：总览 / 测试 / 词库 / 导入 / 生词本 / 统计 / 设置 |
| `1` ~ `4` | 答题页：选择第 1~4 个选项 |
| `Enter` | 提交作答；已判分后进入下一题；最后一题后进入结果页 |
| `Enter` | 测试配置页 / 导入页：开始测试 / 开始导入 |
| `Esc` | 答题中提前结束查看结果；关闭弹窗 |
| `/` | 词条浏览页：聚焦搜索框 |

---

## 八、常见问题

| 现象 | 原因与处理 |
|---|---|
| 导入后中文乱码 | 编码先选「自动识别」；仍乱码时改选 **GBK** 重新导入（Excel/WPS 另存 CSV 的默认编码常是 GBK） |
| 字段映射不对 / 读到空释义 | 在预览区手动把左侧字段选到正确列名上，右侧样例值可帮助核对 |
| 打开 `.xls` 报解析失败 | 旧格式二进制表格不支持，请在 Excel/WPS 里**另存为 .xlsx 或 CSV UTF-8** |
| 提示本地存储写入失败 | 浏览器配额或隐私模式：导出备份 → 精简词库；或改用「方式 3」通过本地服务打开 |
| 数据会在哪些情况下丢失 | 清理浏览器数据 / 换浏览器 / 换 profile 都会清空，请定期到设置页导出 JSON 备份 |
| 单词表里有词组能用吗 | 可以：短语会按整体作为词条，例句挖空也支持整短语；注意同拼写不同词性会被合并为一个词条 |
| 想只刷没学过的词 | 测试配置页「学习状态」选「只看未学」，或首页点「未学词 20 题」 |
| 想只刷高频词 | 测试配置页「使用频次」勾选「高频」（可与中频多选叠加）；分级依据词条 level 标签，无标签时按词频序位 ≤2000 / 2001~6000 / >6000 归类 |

---

## 九、二次开发

改代码只需三步：`改 src → python tools/build.py → 双击 dist/背单词.html`。
源码内没有框架、没有模块化 loader，按顺序 `<script>` 引入即可：`core → parser → quiz → views-* → app`。

跑测试（可选，用于回归验证）：

```bash
python -m http.server 8000     # 在项目根目录
# 浏览器打开 http://127.0.0.1:8000/tools/selftest.html   → 逻辑自测 60+ 断言
# 浏览器打开 http://127.0.0.1:8000/tools/uismoke.html    → UI 冒烟（逐页渲染 + 点击 + 键盘）
# 页面标题显示 PASS / FAIL-n 即为结果（样本文件位于 samples/，四个文件全部参与，含 5023 词去重校验）
```

常用扩展点：

* 新增题型：在 `quiz.js` 里加 `buildXxx()` + `judgeXxx()`，并在 `buildQuestion()` 加分支、`views-quiz.js` 的 `draw()` 加渲染分支即可；
* 调整生词本算法：改 `core.js` 的 `Store.answer()`（也可替换为遗忘曲线/艾宾浩斯排程）；
* 增加字段：在 `parser.js` 的 `ALIASES` 与 `FIELD_LABEL` 加一项，`core.js` 的 `upsertWord()` 字段列表同步追加即可。
