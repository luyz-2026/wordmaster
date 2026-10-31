# WordMaster · PWA 改造包说明

在原有「单文件离线背单词」基础上增加的 PWA 能力：**可安装、可离线、响应式、零后端**。
数据（词库 / 学习进度 / 生词本 / 测试历史 / 设置）继续保存在浏览器 **localStorage**（键
`wordmaster.db.v1`），没有任何后端接口；刷新、重启浏览器、断网都不会丢数据，清浏览器数据除外
（请用「设置与备份」定期导出 JSON）。

---

## 一、文件目录结构与用途

```
wordmaster/
├─ src/                        应用源码（单文件应用的来源）
│  ├─ index.html               shell：新增 viewport-fit=cover、theme-color
│  ├─ css/app.css              新增响应式断点（≤900px 底部标签栏 / ≤560px 收紧）
│  └─ js/app.js                新增 registerSW()：仅在 https 或 localhost 注册 sw.js，
│                              file:// 双击打开时静默跳过，行为不变
├─ pwa/                        PWA 资源源文件
│  ├─ icon.svg                 图标源矢量图（512 基准）
│  ├─ manifest.webmanifest     应用清单：名称 / 图标 / 启动方式 / 主题色 / 快捷方式
│  ├─ sw.js                    Service Worker：预缓存 + 运行时缓存 + 离线兜底
│  ├─ offline.html             离线兜底页（断网且无缓存时展示，联网自动重载）
│  └─ icons/                   make_icons.py 生成的多尺寸图标
│     ├─ icon-192.png / icon-512.png              常规用途（any）
│     ├─ icon-192-maskable.png / icon-512-maskable.png  可遮罩图标（Android 自适应）
│     ├─ apple-touch-icon.png (180)               iOS「添加到主屏幕」
│     └─ favicon.ico / favicon-32.png             浏览器标签页
├─ site/                       【部署根目录】由 tools/build_pwa.py 生成，可整体上传托管
│  ├─ index.html               入口 = dist 单文件应用 + 注入的 PWA 头
│  ├─ manifest.webmanifest / sw.js / offline.html / icons/…
│  └─ .nojekyll                关闭 GitHub Pages 的 Jekyll 处理（防止下划线文件被忽略）
├─ tools/
│  ├─ make_icons.py            生成 pwa/icons/*（依赖 Pillow）
│  ├─ build_pwa.py             组装 site/：注入 PWA 头、按内容指纹固化 SW 缓存版本
│  ├─ build.py                 原 dist 单文件打包脚本
│  └─ pwacheck.html            自动化验证页：SW 注册 / 预缓存 / manifest / 响应式 / 持久化
└─ .github/workflows/deploy-pages.yml   GitHub Pages 自动部署工作流
```

> `site/` 内所有资源均为**相对路径**（`./sw.js`、`./icons/…`），因此托管在域名根路径
> 或任意子路径（如 `https://user.github.io/wordmaster/`）都能正常工作。

---

## 二、关键配置内容

### 1. manifest.webmanifest（节选，完整见 `pwa/manifest.webmanifest`）

```json
{
  "name": "WordMaster 离线背单词",
  "short_name": "背单词",
  "start_url": "./?source=pwa",
  "scope": "./",
  "display": "standalone",          // 「添加到主屏幕」后独立窗口、无浏览器地址栏
  "background_color": "#f4f6fb",
  "theme_color": "#3b6cf6",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [                    // 长按图标的快捷入口
    { "name": "开始测试", "url": "./#/quiz" },
    { "name": "生词本",   "url": "./#/notebook" },
    { "name": "统计概览", "url": "./#/stats" }
  ]
}
```

### 2. sw.js 缓存策略

| 请求类型 | 策略 | 说明 |
|---|---|---|
| App Shell（安装期） | **预缓存** | `index.html`、`offline.html`、`manifest.webmanifest`、全部图标一次写入 |
| 页面导航 | **network-first** | 有网取最新版并回填缓存；断网回缓存；两者皆无 → `offline.html` |
| 其余同源静态资源 | **stale-while-revalidate** | 先回缓存秒开，后台静默更新 |
| 跨域 / 非 GET | 直连 | 不拦截，避免影响第三方行为 |

- 缓存名带**内容指纹**：`wm-shell-<8位哈希>`，`tools/build_pwa.py` 每次构建自动更新；
  新版 SW 安装成功后 `activate` 阶段自动删除旧缓存，发布即生效、无需手工清理。
- SW 顶部 `PRECACHE` 数组就是预缓存清单，新增静态文件时往里加一行即可。

### 3. 响应式布局

- `> 900px`：桌面双栏布局，与改造前完全一致（断点内规则不生效）
- `≤ 900px`：侧栏自动变为**底部标签栏**（图标+文字纵向堆叠、横向滚动、安全区
  `env(safe-area-inset-bottom)` 适配全面屏），弹窗改为底部抽屉，触控目标 ≥ 38px
- `≤ 560px`：内边距/字号收紧，输入框 16px 防止 iOS 聚焦自动放大，统计报表改两列

---

## 三、本地验证方法

前提：Service Worker 只在 `http://localhost` / `http://127.0.0.1` / `https` 下生效
（`file://` 双击打开依旧是纯本地单文件，不受影响）。

### 1. 启动本地服务

```bash
cd wordmaster/site
python -m http.server 8080 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8080/
```

### 2. 一键自动化检查（推荐）

```bash
cd wordmaster
python tools/devserver.py 8090     # 本地服务（含验证页所需的挂起端点）
# 浏览器（或无头 Edge --dump-dom）打开
#   http://127.0.0.1:8090/tools/pwacheck.html
```

页面标题显示 `PASS` / `FAIL-n`，覆盖 5 组检查：

1. **SW 注册与生效**：`serviceWorker.ready`、存在 `controller`、缓存中出现 `wm-shell-*`
2. **预缓存完整性**：`index.html / offline.html / manifest / 7 个图标` 全部命中缓存
3. **manifest 可安装性**：name、192/512 图标、start_url、display=standalone、快捷方式
4. **数据持久化**：写入词库与进度 → 整页重载（iframe 重新加载）→ 数据原样读回
5. **响应式三档**：390×844 / 820×1180 / 1440×900 三种视口下无横向滚动、
   手机端侧栏贴底、底部标签可点

（本仓库已用无头 Edge 实测：pwacheck 31 项断言全 PASS；停服后冷启动断网加载正常。）

### 3. 手工断网实测

1. 打开 `http://127.0.0.1:8080/`，F12 → Application → Service Workers 状态为
   *activated and is running*（首次需刷新一次让 SW 接管页面）
2. 停掉本地服务（Ctrl+C），或 F12 → Network → Offline
3. **重新刷新页面** → 应用照常渲染、可正常答题（数据在 localStorage）
4. 访问未缓存过的路径 → network-first 回退：优先返回缓存的入口页（SPA 路由仍可用），
   连入口缓存都没有时才显示 `offline.html` 兜底页（恢复联网后自动重载）

### 4. 「添加到主屏幕 / 安装」

- **桌面 Chrome/Edge**：地址栏右侧出现 ⊕ 安装图标 → 安装 → 独立窗口运行
- **Android Chrome**：菜单 → 「添加到主屏幕 / 安装应用」
- **iOS Safari**：分享 → 「添加到主屏幕」（使用 apple-touch-icon 与主题色）

安装后断网从主屏图标打开即为可用状态；应用配置页/统计页数据均来自本地。

---

## 四、部署上线（免费静态托管）

主推 **GitHub Pages**（免费、HTTPS、固定网址、可配自定义域名）；文末附 Netlify /
Cloudflare Pages 两条备选路线。

### 路线 A：GitHub Pages（推荐）

1. **准备仓库**：在 GitHub 新建仓库（Public 免费启用 Pages），本地：

   ```bash
   cd wordmaster
   git init && git add site .github src pwa tools dist
   git commit -m "PWA: 背单词离线应用"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```

2. **开启 Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**（不是 Deploy from a branch）。
   工作流 `.github/workflows/deploy-pages.yml` 已随仓库提交，推送 `site/` 或相关源码即自动部署。

3. **得到固定网址**：`https://<你的用户名>.github.io/<仓库名>/`
   （Actions 页可查看每次部署进度与日志；之后更新只需重新运行
   `python tools/build_pwa.py` 并提交新的 `site/`。）

4. **可选：自定义域名**：在 `site/` 下添加 `CNAME` 文件（内容仅一行你的域名），
   并到域名服务商添加 CNAME 记录指向 `<你的用户名>.github.io`，证书由 GitHub 自动签发。

> 仓库没有 `site/` 也可以：工作流会自动执行 `pip install pillow` →
> `make_icons.py → build.py → build_pwa.py` 现场构建。

### 路线 B：Netlify（拖拽即上线）

`wordmaster` 下新建 `netlify.toml`：

```toml
[build]
  publish = "site"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"          # SW 文件本身不允许长缓存，否则更新迟钝

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"
```

登录 <https://app.netlify.com> → Sites → 拖入 `site/` 目录（或连接 Git 仓库），
得到 `https://<随机名>.netlify.app`，可在 Domain settings 绑定自定义域名。

### 路线 C：Cloudflare Pages

Dashboard → Workers & Pages → Create → Pages → **Upload assets** 直接上传 `site/`，
或连接 Git 仓库（构建命令留空、输出目录填 `site`），得到 `https://<项目名>.pages.dev`。

### 部署后自检清单

- [ ] 打开网址，标题正常、无控制台报错；Application → Manifest 显示全部图标
- [ ] Application → Service Workers 状态 activated；Cache Storage 出现 `wm-shell-*`（11 个预缓存项）
- [ ] Network 面板切 Offline 后刷新，页面可用；访问未缓存路径出现离线兜底页
- [ ] 手机浏览器打开 → 添加到主屏幕 → 图标、名称、启动画面正确
- [ ] 导入词库 → 刷新 / 重启浏览器 / 断网重进，数据仍在

---

## 五、常见问题

| 问题 | 处理 |
|---|---|
| SW 未注册 / 状态一直 installing | 必须通过 `http://localhost`、`http://127.0.0.1` 或 HTTPS 访问；`file://` 不支持 |
| 更新了页面但手机上还是旧版 | SW 是网络优先 + 新缓存名版本化，刷新一次即可；如仍异常可 Application → Storage → Clear site data |
| 安装图标不出现（Chrome） | 检查 manifest 的 192/512 图标可达、SW 有 fetch 处理器、页面通过 HTTPS/localhost 打开 |
| 数据会丢吗 | 保存在浏览器 localStorage，刷新/重启/断网不丢；清浏览器数据或换设备会丢，请定期「设置与备份」导出 JSON |
| iOS 上状态栏遮挡 | 已启用 `viewport-fit=cover` + 安全区内边距，底部标签栏与 Toast 均已适配 |
