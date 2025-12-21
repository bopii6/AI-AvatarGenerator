# 全网分发（离线随身包）方案说明

你的诉求：卖给客户时，不希望客户在运行时再去 GitHub / PyPI 下载任何东西；希望 EXE 里自带「全网分发中心」。

下面是可行方案与取舍（重要：离线 = 体积会明显变大）。

## 现状（为什么会“自动下载”）

桌面端目前使用 `social-auto-upload` 作为「全网分发中心」：
- 运行时如果检测到本机没有安装，会执行 `git clone` 拉取源码
- 然后创建 Python venv 并 `pip install -r requirements.txt`

这两步都会联网，因此在国内网络环境下会经常失败。

## 方案 A（推荐）：离线内置源码 + 国内 pip 镜像（仍需联网一次，但稳定）

适合：你想要“客户不用翻墙”，但允许客户机器能访问国内镜像。

做法：
1. 配置 `SOCIAL_AUTO_UPLOAD_REPO_URLS` 指向国内镜像（已支持按顺序回退）
2. 给 pip 配置国内源（如清华/阿里云），让依赖安装稳定

优点：实现成本低、包体积小、兼容性最好  
缺点：仍然需要联网安装依赖

## 方案 B（真正离线）：内置 social-auto-upload + 内置 Python + 内置 venv 依赖

适合：客户机器可能完全离线，或者你希望“开箱即用 0 下载”。

做法（核心思想）：把运行时下载变成“打包时准备好”。

### B1. 内置 social-auto-upload 源码

在你的仓库放一个 vendored 目录（不一定提交到 git，也可以只在打包机存在）：
- `vendor/social-auto-upload/`（完整源码）

然后在打包时将它加入 Electron 资源：
- Electron 打包后资源目录：`process.resourcesPath`
- 通过 `extraResources` 把 `vendor/social-auto-upload` 拷进去

运行时逻辑改为：
- 优先从 `process.resourcesPath/social-auto-upload` 解压/复制到 `app.getPath('userData')/social-auto-upload`
- 如果已复制过（用户数据目录存在），直接复用
- 不再 `git clone`

### B2. 内置 Python（Windows 建议用 embeddable Python）

你需要提供一个可执行的 Python：
- Windows：官方 `python-3.x.x-embed-amd64.zip`（体积较小）

打包时放到：
- `extraResources/python/`

运行时用这个 Python 创建/运行 venv 或直接运行已准备好的 venv Python。

### B3. 内置依赖（关键点：否则 pip 还会联网）

要做到“完全不联网”，你必须让 `pip install` 不再从公网拉包：

两种方式：
1) 直接把打包机创建好的 venv 整个带进去（最简单，但体积大）  
2) 把所有 wheels 放到本地目录，运行时 `pip install --no-index --find-links=...`

建议（最省心）：**打包机预先创建好 venv 并安装完依赖，然后把 `.venv` 整个一起作为资源打包**。

代价：
- 包体积可能增加数百 MB ～ 1GB+（取决于依赖）
- 需要为 Windows x64 单独准备；其他系统需要重新做一次

## 你现在应该怎么选？

如果你是“卖给 C 端大量用户”：
- 建议先用方案 A：国内镜像 + pip 国内源，足够稳定，体积小。

如果你是“卖给企业客户/内网离线环境”：
- 用方案 B（真正离线），但要接受体积变大、以及需要一台打包机准备 venv。

## 你当前卡住的错误是什么？

你贴的日志里，Cookie 已保存成功，失败发生在「应用到分发中心」阶段：
- `createTable.py` 在 Windows GBK 控制台打印 emoji 报 `UnicodeEncodeError`

代码已修复：Electron 启动/调用 Python 时会强制 UTF-8（`PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8`）。

## 下一步我可以继续做什么

你确认你要走哪条路线：
- A：我再把 “pip 国内源” 自动化（给 venv pip 写配置，默认走清华/阿里）
- B：我把 “内置 social-auto-upload + 内置 python + 内置 venv” 的打包脚本/配置补齐（会增加 release 体积）

## 快速操作清单（给小白）

### 先把你现在的“保存并应用”跑通（不用离线）

1. 更新代码后重新启动桌面端：`npm run dev`
2. 打开「设置 → 全网分发账号」，点一次「保存并应用」
3. 如果失败，在启动桌面端的终端里找日志（前缀 `[publish]`）：
   - `publish-cookie-save:*`（保存阶段）
   - `publish-cookie-apply:*`（应用到分发中心阶段）

### 方案 A：国内可用（推荐先用）

1. 在 `.env` 加：
   - `SOCIAL_AUTO_UPLOAD_REPO_URLS=...`（填可访问镜像列表）
   - `SOCIAL_AUTO_UPLOAD_PIP_INDEX_URL=...`（pip 国内源，默认阿里云，可改清华）
2. 重启桌面端：`npm run dev`
3. 再点「保存并应用」

注意：为了不让客户遇到“Git 登录弹窗”，程序默认不会使用需要登录的源，也会禁止 git 弹出交互式认证窗口；如果你手动配置了私有仓库/需要账号密码的地址，git 会直接失败并给出错误提示。

补充：`gitee.com` 经常在未登录/风控时要求输入账号密码，因此默认会跳过 gitee 源；如你确认可匿名克隆，可在 `.env` 里设置 `SOCIAL_AUTO_UPLOAD_ALLOW_GITEE=1`。

### 方案 B：真正离线（EXE 自带）- 操作思路

1. 在打包机准备好：
   - `vendor/social-auto-upload/`（源码）
   - `vendor/python/`（Windows embeddable Python）
   - `vendor/social-auto-upload/.venv/`（已安装完 requirements 的 venv）
2. 修改 electron-builder 的 `extraResources` 把上述目录打进安装包
3. 运行时优先从 `process.resourcesPath` 拷贝到 `userData`，不再 `git clone` / `pip install`
