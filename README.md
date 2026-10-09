# 石墨文档风格编辑器（Quill + Django）

单用户云端文档编辑器：前端用开源的 **Quill.js** 复刻石墨文档的编辑器体验与文件夹管理，后端用 **Django** 持久化，编辑内容自动保存到云端（换设备/换浏览器不丢）。**不含多人协作**。

## 功能概览

### 文件管理（石墨 folder 页复刻）
- **空间 · 文件夹 · 文档** 三层结构：个人空间「我的桌面」+ 团队空间，空间内支持多级嵌套文件夹
- 侧边栏导航：我的桌面 / 团队空间 / 最近文件 / 共享给我 / 我的收藏 / 工作动态 / 个人标签 / 快速访问 / 回收站
- 文件列表：多选批量删除、排序（文件名 / 最近更新 / 大小）、就地搜索、行内重命名
- **快速访问**：将文件 / 文件夹拖拽固定，localStorage 持久化
- 面包屑导航、右侧详情面板（打开 / 重命名 / 删除）、容量统计（/ 1 GB）
- 新建：文档 / 文件夹 / 团队空间（弹窗）

### 编辑器（石墨文档编辑器复刻）
- Quill 2.0 富文本编辑，工具栏 1:1 复刻石墨：样式 / 字体 / 字号 / 文字样式 / 列表 / 对齐 / 行距 / 插入 / 查找替换 / 工具
- 斜杠（`/`）命令面板、划词浮动工具栏、右键菜单（复制 / 剪切 / 删除 / 转换为 / 复制段落链接）
- 块悬停手柄：段落菜单 + 标题折叠 / 展开
- 左侧**目录（大纲）**：按标题 1/2/3 自动生成，点击跳转、可折叠
- 文档默认样式弹窗（字体 / 字号 / 行距 / 颜色，可设为新建默认值）
- 更多颜色取色器（HSV 色域 + Hex + 自定义颜色，localStorage 记忆）
- 快捷键：`Ctrl+Alt+1~6` 标题、`Ctrl+Alt+0` 正文、`Ctrl+K` 链接、`Ctrl+Shift+L` 目录、`Ctrl+/` 聚焦编辑器
- 分享链接复制、导出 Markdown、新建 / 删除文档

## 项目结构

```
quill-shimo-editor/
├── backend/                      # Django 后端
│   ├── manage.py
│   ├── requirements.txt          # 仅依赖 Django
│   ├── .venv314/                 # Python 3.14 虚拟环境（含 Django 5.2）
│   ├── shimo_backend/            # 项目配置（settings / urls / wsgi）
│   ├── docs/                     # 文档应用（models / views / urls / migrations）
│   │   └── models.py             # Space / Folder / Document 模型
│   └── templates/editor/
│       ├── index.html            # Quill 富文本编辑器页（/docs/<id>/）
│       └── folder.html           # 空间/文件夹/文件列表页（/ 与 /space/.../）
└── README.md
```

## 页面路由

| 路径 | 页面 |
|---|---|
| `/` | 我的桌面（个人空间文件列表） |
| `/space/<id>/` | 团队空间根目录 |
| `/space/<id>/folder/<fid>/` | 空间内文件夹 |
| `/docs/<id>/` | 文档编辑器 |

## API（同源，无 CORS）

### 文档
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/docs/?space=&folder=` | 文档列表（按更新时间倒序，可按空间 / 文件夹过滤，`folder=root` 表示根目录） |
| POST | `/api/docs/create/` | 新建文档 `{"title","space","folder"}` |
| GET | `/api/docs/<id>/` | 读取单篇完整内容 |
| PUT | `/api/docs/<id>/update/` | 自动保存 `{"title","content_html","folder"}` |
| DELETE | `/api/docs/<id>/delete/` | 删除文档 |

### 空间
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/spaces/` | 全部空间（个人空间在前） |
| POST | `/api/spaces/create/` | 新建团队空间 `{"name"}` |
| DELETE | `/api/spaces/<id>/delete/` | 删除空间（个人空间不允许删） |

### 文件夹
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/folders/?space=` | 该空间下全部文件夹（扁平，前端建树） |
| POST | `/api/folders/create/` | 新建文件夹 `{"space","parent","name"}` |
| PUT | `/api/folders/<id>/rename/` | 重命名 `{"name"}` |
| DELETE | `/api/folders/<id>/delete/` | 删除文件夹（文档移回空间根目录） |

### 图片上传
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/upload/` | 上传本地图片（`multipart/form-data`，字段 `file`），仅接受 PNG / JPG / GIF / WebP、上限 10MB，保存到 `media/images/` 并返回 `{"url": ...}` |

> 编辑器「插入 → 图片」和斜杠命令「图片」会**打开本地文件选择器**，选图后自动上传到 `/api/upload/` 并在光标处插入，与石墨文档一致。上传的媒体文件通过 `/media/...` 访问（DEBUG 模式下由 Django 直接服务）。

### 插入菜单（复刻石墨）
编辑器「插入」下拉与斜杠命令均已复刻石墨文档，共 15 项：
| 功能 | 实现 |
|---|---|
| 图片 | 打开本地文件选择器 → 上传 → 光标处插入（见上节） |
| 表格 | 8×8 网格选择器，悬停高亮显示「N × M 表格」，点击插入对应空表 |
| 图表 | 子菜单 5 类（柱状/折线/饼图/面积/条形），生成石墨绿 SVG 转 data URI 插入 |
| 超链接 | 自定义对话框（链接文字 + URL，有选区自动预填） |
| 代码块 | 插入代码块 |
| 公式 | LaTeX 对话框，以 `$…$` 插入 |
| 日期 | 插入当天日期 |
| 表情 | 32 格表情面板 |
| 分隔线 | 插入水平分割线 |
| 引用 | 插入引用块 |
| 附件 / 音频 | 打开本地文件选择器 → 上传到 `/api/upload-file/` → 插入附件卡片或音频播放器 |
| 云文档 / 预览窗口 / 第三方 | 复刻入口与交互（附件/链接对话框/占位文本） |

### 主题色（石墨品牌绿）
整体视觉统一为石墨品牌绿：主按钮 / 新建 / 创建 / 文档图标 / 复选框选中态 / 图表 / 对话框确定均使用 `#00b38a`（渐变 `#00b38a → #33c7a3`）与石墨绿 `#2BBAA5`；链接保持石墨蓝。文件列表行 hover 浅蓝高亮，行内「更多」按钮 hover 显示，与石墨一致。


## 本地运行

```bash
cd backend
python3 -m venv .venv314        # 首次：创建虚拟环境
.venv314/bin/pip install -r requirements.txt   # 安装 Django
.venv314/bin/python manage.py migrate
.venv314/bin/python manage.py runserver 8000
```

浏览器打开 `http://127.0.0.1:8000/` 即进入文件管理页；进入任意文档即富文本编辑器。

> **环境注意**：本机默认 `python3` 为 Python 3.14。目录名命名为 `.venv314` 而非 `.venv`，是因为在该运行环境下名为 `.venv` 的目录会被误解析到 Anaconda Python 3.6（无法安装 Django 5），`.venv314` 则正常。若你的环境无此问题，可自由改为 `.venv`。

## 自动保存原理（前端）

- 编辑内容 / 标题变化 → 防抖 **1s** 后 `PUT /api/docs/<id>/update/` 保存；
- 关闭 / 刷新页面前 `navigator.sendBeacon` 强制保存一次（`beforeunload` + `pagehide` 双保险）；
- 打开文档时 `GET /api/docs/<id>/` 拉取最新内容。

## 生产部署注意

- `shimo_backend/settings.py`：`DEBUG=False`、`SECRET_KEY` 与 `ALLOWED_HOSTS` 改用环境变量；
- 数据库默认 SQLite，正式环境可换 PostgreSQL（改 `DATABASES`）；
- 前端引用 CDN（Quill / Vue / Pinia），生产部署需保证可访问 `cdn.jsdelivr.net`，或改为本地静态资源；
- 部署到支持 Python 的托管（Render / Fly / Railway / 云服务器 + gunicorn）：`gunicorn shimo_backend.wsgi`。
