# 开发文档（4S：服务 · 存储 · 场景 · 扩展）

> 面向二次开发者。本文所有模块、字段、接口、路径均以当前仓库代码为准，可直接按图索骥。
> 产品定位：单用户云端富文本编辑器，前端 Quill.js 复刻石墨文档体验，后端 Django 持久化，**不含多人协作**。

---

## 技术栈事实

| 层 | 技术 | 版本 | 来源 |
|---|---|---|---|
| 运行时 | Python | 3.14 | 虚拟环境 `backend/.venv314` |
| Web 框架 | Django | 5.2.x（约束 `>=5.0,<6.0`） | `backend/requirements.txt` |
| 编辑器内核 | Quill | 2.0.3 | CDN `cdn.jsdelivr.net` |
| 前端框架 | Vue | 3.5.13 | CDN |
| 状态管理 | Pinia / vue-demi | 2.3.1 / 0.14.10 | CDN |
| 关系数据库 | SQLite | 内建 | `backend/db.sqlite3` |
| 对象文件 | 本地文件系统 | Django `default_storage` | `backend/media/` |

架构特征：**Django 单体 + 模板内联 CSS/JS**，无前端独立构建步骤；前后端同源，无 CORS；无登录鉴权（单用户）。

---

# 一、Service（服务）

后端是单一 Django 工程，由「项目配置包 + 一个业务 App」组成。

## 1.1 目录与职责

```
backend/
├── manage.py                       # 命令行入口，DJANGO_SETTINGS_MODULE=shimo_backend.settings
├── requirements.txt                # Django 5.2.18 + 导出依赖（markdownify/bs4/python-docx/ebooklib）
├── shimo_backend/                  # 项目配置包
│   ├── settings.py                 # 全局配置
│   ├── urls.py                     # 页面路由（+ 挂载 /api/ 与 /media/）
│   └── wsgi.py                     # WSGI 入口（生产 gunicorn 用）
├── docs/                           # 唯一业务 App
│   ├── apps.py                     # DocsConfig
│   ├── models.py                   # Space / Folder / Document
│   ├── views.py                    # 页面视图 + 全部 JSON API
│   ├── urls.py                     # API 路由（前缀 /api/）
│   ├── exporters.py                # 文档导出转换（HTML/MD/TXT/DOCX/EPUB）
│   ├── static/
│   │   ├── css/tokens.css          # 全局设计 TOKEN + 公共组件样式（toast 等）
│   │   ├── css/editor.css          # 编辑器页专属样式
│   │   ├── css/folder.css          # 文件管理页专属样式
│   │   ├── js/common.js            # 公共工具（showToast）
│   │   └── js/api.js               # 统一 API 客户端（window.EditorAPI）
│   │   └── js/editor.js            # 编辑器页逻辑
│   │   └── js/folder.js            # 文件管理页逻辑
│   └── migrations/                 # 0001_initial、0002_space_folder
├── templates/editor/
│   ├── folder.html                 # 文件管理页（HTML 骨架 + bootData JSON）
│   └── index.html                  # 编辑器页（HTML 骨架）
└── media/                          # 用户上传文件
```

## 1.2 关键配置（`shimo_backend/settings.py`）

- `INSTALLED_APPS`：Django 内建套件 + 业务 App `docs`（自定义应用必须登记在此）
- `ROOT_URLCONF = shimo_backend.urls`
- 模板：`DIRS=[BASE_DIR/'templates']` 且 `APP_DIRS=True`，故模板放 `templates/` 或 App 的 `templates/` 均可
- 数据库：`ENGINE=sqlite3`，`NAME=BASE_DIR/'db.sqlite3`
- 时区：`TIME_ZONE='Asia/Shanghai'`、`LANGUAGE_CODE='zh-hans'`、`USE_TZ=True`
- 媒体：`MEDIA_URL='/media/'`、`MEDIA_ROOT=BASE_DIR/'media'`
- 静态：`STATIC_URL='static/'`
- ⚠️ 当前 `DEBUG=True`、`SECRET_KEY` 硬编码、`ALLOWED_HOSTS=['*']`，仅适用于开发

## 1.3 页面路由（`shimo_backend/urls.py`）

| 方法 | 路径 | 视图 | 说明 |
|---|---|---|---|
| GET | `/` | `docs.views.folder_page` | 我的桌面（根） |
| GET | `/space/<int:space_id>/` | `folder_page` | 空间根目录 |
| GET | `/space/<int:space_id>/folder/<int:folder_id>/` | `folder_page` | 空间内文件夹 |
| GET | `/docs/<int:doc_id>/` | `docs.views.doc_page` | 文档编辑器 |
| — | `/admin/` | Django Admin | 后台管理 |

- `folder_page(request, space_id=None, folder_id=None)` 三级入口共用一个视图，仅把 `space_id/folder_id` 注入模板上下文
- `doc_page(request, doc_id)` 渲染 `editor/index.html`，上下文含 `doc_id`
- `DEBUG` 下通过 `static(MEDIA_URL,...)` 由 Django 直接服务 `/media/` 文件

## 1.4 API 路由（`docs/urls.py`，统一前缀 `/api/`）

**文档**
| 方法 | 路径 | 视图 |
|---|---|---|
| GET | `/api/docs/` | `list_docs`（可带 `space`、`folder`，`folder=root` 表示根目录） |
| POST | `/api/docs/create/` | `create_doc` |
| GET | `/api/docs/<doc_id>/` | `get_doc` |
| PUT/POST | `/api/docs/<doc_id>/update/` | `update_doc`（POST 供 sendBeacon 兜底） |
| DELETE | `/api/docs/<doc_id>/delete/` | `delete_doc` |

**空间**
| 方法 | 路径 | 视图 |
|---|---|---|
| GET | `/api/spaces/` | `list_spaces`（个人空间在前） |
| POST | `/api/spaces/create/` | `create_space` |
| DELETE | `/api/spaces/<space_id>/delete/` | `delete_space`（个人空间禁删） |

**文件夹**
| 方法 | 路径 | 视图 |
|---|---|---|
| GET | `/api/folders/` | `list_folders`（扁平，前端建树） |
| POST | `/api/folders/create/` | `create_folder` |
| PUT | `/api/folders/<folder_id>/rename/` | `rename_folder` |
| DELETE | `/api/folders/<folder_id>/delete/` | `delete_folder` |

**上传**
| 方法 | 路径 | 视图 |
|---|---|---|
| POST | `/api/upload/` | `upload_image`（图片，上限 10MB） |
| POST | `/api/upload-file/` | `upload_file`（图片/音频/附件，上限 20MB） |

## 1.5 服务端约定（重要约束）

- **方法约束**：读接口用 `@require_http_methods(['GET'])`，写接口显式声明允许方法
- **CSRF**：所有写接口使用 `@csrf_exempt`（因无登录体系、前后端同源）；引入鉴权后应收敛为正常 Token/CSRF
- **JSON 解析**：统一经 `_json_body(request)`，解析失败回退 `{}`，避免脏 body 导致 500
- **响应序列化**：`_doc_to_dict / _space_to_dict / _folder_to_dict` 三个私有函数是唯一出口，新增字段应在此补齐
- **时间格式**：`_fmt_dt` 统一输出 `%Y-%m-%d %H:%M`
- **大小文案**：`_fmt_size` 依据 HTML 字节数输出 `B/KB/MB`
- **错误码**：找不到资源返回 404，参数非法返回 400，成功创建返回 201，body 均为 JSON
- **上传安全**：扩展名白名单 + Content-Type 一致性校验 + UUID 重命名（防路径穿越与重名）；图片白名单不含 SVG（防脚本注入）

---

# 二、Storage（存储）

系统有三类存储：关系数据库（结构化元数据）、文件系统（上传的媒体）、浏览器 localStorage（纯前端偏好）。

## 2.1 数据模型（`docs/models.py`）

### Space — 空间
| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | CharField(100) | 空间名 |
| `kind` | CharField(20) | `personal` 个人 / `team` 团队，默认 team |
| `created_at` | DateTimeField | auto_now_add |
- Meta：`ordering=['created_at']`

### Folder — 文件夹（自引用树）
| 字段 | 类型 | 说明 |
|---|---|---|
| `space` | FK→Space | related_name=`folders`，CASCADE |
| `parent` | FK→self | related_name=`children`，null/blank，CASCADE；空=空间根 |
| `name` | CharField(100) | |
| `created_at` / `updated_at` | DateTimeField | add / auto |
- Meta：`ordering=['name']`
- 支持任意多级嵌套

### Document — 文档
| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | CharField(200) | 默认「未命名文档」 |
| `content_html` | TextField | Quill 输出的 HTML，可空 |
| `space` | FK→Space | related_name=`documents`，CASCADE |
| `folder` | FK→Folder | related_name=`documents`，null，**SET_NULL** |
| `created_at` / `updated_at` | DateTimeField | add / auto |
- Meta：`ordering=['-updated_at']`（列表默认最近更新倒序）

## 2.2 关系与删除策略

```
Space ──CASCADE──< Folder ──CASCADE──< Folder (children)
  │                   │
  │CASCADE            │ 1:N (Document.folder)
  └────────CASCADE──< Document >──SET_NULL──┘
```

| 触发动作 | 级联效果 |
|---|---|
| 删除 Space | 其下全部 Folder、Document 一并删除 |
| 删除 Folder | 子 Folder 级联删除；**其内 Document 因 SET_NULL 移到空间根目录**（不丢文档） |
| 删除 Document | 仅删自身 |

> 这是一条刻意设计：`delete_folder` 注释「文档 folder SET_NULL，保留在空间内」，前端删除确认文案也据此提示。

## 2.3 迁移演进（`docs/migrations/`）

- `0001_initial`：仅建 Document
- `0002_space_folder`：新增 Space/Folder 并给 Document 加 `space/folder` 外键
  - 内含数据迁移 `create_default_space`：创建 id=1 的个人空间「我的桌面」，把历史无主文档 `update(space=该空间)`
  - 字段分两步：先以 `null=True` 加列 + RunPython 回填，再 AlterField 收紧为非空

新建/修改模型后：
```bash
.venv314/bin/python manage.py makemigrations docs
.venv314/bin/python manage.py migrate
```

## 2.4 文件存储（媒体）

| 子目录 | 对应接口 | 白名单 | 上限 | 命名 |
|---|---|---|---|---|
| `media/images/` | `upload_image` | PNG/JPG/JPEG/GIF/WebP | 10MB | UUID hex + 原扩展名 |
| `media/uploads/` | `upload_file` | 图片 + 音频(mp3/wav/ogg/m4a/aac/webm) + 附件(txt/md/pdf/Office/zip) | 20MB | UUID hex |

- 均走 `default_storage.save(rel_path, file)`，返回 `/media/...` 可访问 URL
- 替换为对象存储时，只需在 settings 配置 `STORAGES`（Django 5）让 `default_storage` 指向 S3/OSS，业务代码无需改动

## 2.5 浏览器本地存储（localStorage）

仅保存「不影响跨端一致性」的前端偏好（云端数据不依赖它）：

| 用途 | 所在页 | Key |
|---|---|---|
| 快速访问（拖拽固定的文件/文件夹） | folder.html | `QUICK_KEY` |
| 自定义颜色（取色器记忆） | index.html | 颜色面板模块 |
| 新建文档默认样式（字体/字号/行距/颜色） | index.html | 文档样式模块 |

读取统一 `try/catch` 包裹 JSON.parse，脏数据时回退默认值。

---

# 三、Scenario（场景）

两个页面对应两类核心场景，页面初始化数据来自 Django 注入 + 运行时 API 拉取。

## 3.1 文件管理页（`templates/editor/folder.html` + `static/css/folder.css` + `static/js/folder.js`）

### 页面结构
- `#topbar`：搜索框（`#searchInput`）、模板库、新建拆分按钮（`#tbCreateMain` + `#tbCreateArrow`）、头像
- `#sidebar`：新建按钮、导航（`#navDesktop` 我的桌面 + `#spaceList` 空间列表 + 新建空间入口）、`#quickBox` 快速访问、容量统计（`#capText/#capFill`，配额 1 GB）
- `#main`：`#crumbs` 面包屑 + `#newHereBtn` 新建到此处；文件表格（表头排序、全选）、`#batchBar` 批量操作栏、`#fileList`、`#emptyState`
- `#detailPanel`：预览、标题、元信息、打开/重命名/删除
- `#spaceModal`：新建团队空间弹窗
- `#bootData`（type=application/json）：Django 注入初始 `space/folder`

### 启动链路
```
init()
 ├─ GET /api/spaces/                 → spaces（非法则回退首个空间）
 ├─ GET /api/docs/                   → 全量轻量列表，汇总容量
 ├─ reloadContext()
 │    ├─ GET /api/folders/?space=    → folders（扁平）
 │    └─ GET /api/docs/?space=&folder=root|<id> → docs（仅当前层）
 └─ renderQuick()                    → 快速访问
 → render() 构建面包屑、空间列表、文件行
```

### 关键交互 → API 映射
| 场景 | 前端函数 | 接口 |
|---|---|---|
| 新建文档 | `createDocHere` | POST `/api/docs/create/` |
| 新建文件夹并进入行内重命名 | `createFolderHere` → `startRename(_,true)` | POST `/api/folders/create/` |
| 重命名（Enter 提交 / Esc 取消） | `startRename` | PUT `/api/folders/<id>/rename/` |
| 新建文件夹取消命名（空名） | `commit/cancel` | DELETE 该临时文件夹 |
| 多选批量删除 | `delItems` | DELETE folder / doc |
| 删除文件夹 | `delItems` | DELETE（文档回根目录） |
| 排序（名称/更新/大小） | 表头点击 → `render` | 纯前端 |
| 就地搜索 | `#searchInput` input | 纯前端行过滤 |
| 拖拽到快速访问 | `addQuick` | localStorage |
| 打开文档 | `openDocEditor` | 跳转 `/docs/<id>/` |

行选择 key 约定：文件夹前缀 `f:`，文档前缀 `d:`（如 `f:5`、`d:12`），删除据此分流。

## 3.2 编辑器页（`templates/editor/index.html` + `static/css/editor.css` + `static/js/editor.js`）

### 自定义 Quill 能力（脚本头部注册）
- **Font**：扩展白名单 11 种字体（SimSun/SimHei/KaiTi/FangSong/MicrosoftYaHei/Arial/Droid Serif/Source Code Pro/Times New Roman/Noto Sans JP/Noto Serif JP）
- **Size**：扩展白名单 15 种字号（9~36px 等）
- **LineHeight**：自定义 `StyleAttributor`（行高 1.0~3.0）
- **HRBlot**：继承 `BlockEmbed` 的自定义分隔线 blot（blotName=`divider`，tagName=`div`，class=`ql-hr`）

### 状态与保存（Pinia + Vue）
`useDocStore('doc')` 统一管理：
- state：`docId / title / saveStateText / dirty / saveTimer / quill`
- actions：
  - `scheduleSave()`：置 dirty + 「保存中」，**1s 防抖**
  - `doSave()`：`PUT /api/docs/<id>/update/`，成功更新「已保存 · 时间」，失败/离线给出状态
  - `forceSave()`：`navigator.sendBeacon` 异步兜底，不阻塞页面关闭
- Vue 应用仅挂载到 `#saveState`，用 render 函数（避免与 Django 模板 `{{ }}` 分隔符冲突）

### 数据加载与保存闭环
```
进入页面
 ├─ URL 含 docId
 │    └─ openDoc(id):  GET /api/docs/<id>/  → syncTitle + clipboard.dangerouslyPasteHTML(content_html)
 └─ 无 docId
      └─ POST /api/docs/create/ → 替换地址栏为 /docs/<id>/

编辑期：quill 'text-change' / 标题 'input'
        → scheduleSave() → 1s → PUT /api/docs/<id>/update/
离开期：beforeunload + pagehide → forceSave()（sendBeacon）
```

### 编辑交互清单
| 场景 | 实现要点 |
|---|---|
| 工具栏（1:1 石墨） | 按钮直接调用 Quill API + `refreshToolbar` 同步高亮 |
| 斜杠命令 `/` | `#slashMenu`，搜索/插入各类块 |
| 划词浮动工具栏 | 监听选区，定位到选区旁 |
| 右键/段落菜单 | `#ctxMenu`：复制/剪切/删除/转换为/复制段落链接 |
| 块悬停手柄 | 悬停块左侧出现：`bh-menu`（三条线）+ `bh-collapse`（标题折叠/展开） |
| 拖拽排序 | 按住三条线，**手柄仅垂直跟随**，落点显示**蓝色横线**（`#dropLine`） |
| 左侧目录大纲 | 按 H1~H3 自动生成，点击跳转、可折叠 |
| 文档默认样式 | 弹窗设置字体/字号/行距/颜色，可设为默认 |
| 更多颜色 | HSV 色域 + Hex + 自定义，记忆偏好 |
| 插入菜单 | 图片/表格/图表/链接/代码块/公式/日期/表情/分隔线/引用/附件音频等 |
| 文档抽屉 | `openDrawer` 拉列表，`openDoc` 切换文档 |

### 拖拽排序的关键实现（踩坑后固化）
- **点击 vs 拖拽**：4px 位移阈值。未超阈值视为点击，保留 `curBlock` 交给 click 弹菜单；超过才进入排序
- **垂直约束**：拖拽中 `mousemove` 悬停处理器 `if(dragging) return`，防止重设 `left`；pointerdown 时 `clearTimeout(hoverTimer)`
- **落点指示**：`#dropLine` 为 2px 蓝色横线（`#2E7CF6`），左端 6×6 方块，宽度贯穿内容区，不受落点块缩进影响
- **块移动算法**：`doMove` 用 `quill.updateContents` + `Delta` **原子**完成删除/插入
  - 行长度必须用 `dragLine.length()`，**不能**用 `quill.getLength(dragLine)`（该调用忽略参数、返回整篇长度）
  - **文末追加特例**：末行 `\n` 即文档结束符，序列须为「插无格式 `\n` 分隔 → 插文本 → `retain(1, 块格式)`」，否则文本会并入末行或块格式错位
- 释放后 `hideHandle()`，由下次悬停重新定位

---

# 四、Extension（扩展）

以下均为「改哪里」的最小路径，按需求类型取用。

## 4.1 新增一个富文本块（如：警告框 / 自定义卡片）

1. 在 `index.html` 脚本头部定义 blot：
   - 块级元素：参考 `HRBlot`，继承 `Quill.import('blots/block/embed')`，设定 `blotName/tagName`
   - 行内元素：继承 `Inline`
2. `Quill.register(Blot, true)`
3. 提供插入入口：在斜杠命令列表 / 插入菜单加项，调用 `quill.insertEmbed(index, blotName, value)`
4. 注意：HTML 会作为 `content_html` 持久化，重开时 Quill 需能识别该标签，故注册逻辑必须在 Quill 实例化前执行

## 4.2 新增字体 / 字号 / 行距

直接编辑对应白名单：
- 字体：`Font.whitelist` 数组
- 字号：`Size.whitelist`
- 行距：`new Parchment.StyleAttributor(..., {whitelist:[...]})`
如需对应 CSS class，补一条 `.ql-font-xxx / .ql-size-xxx` 样式。

## 4.3 新增一个 API 接口

1. `docs/views.py`：新增视图函数
   - 加 `@require_http_methods([...])`
   - 读参数：GET 用 `request.GET`，写 body 用 `_json_body`
   - 返回：成功 `JsonResponse`，错误用 404/400
2. `docs/urls.py`：加一行 `path('...', views.xxx)`
3. 若返回新字段，在 `_xxx_to_dict` 序列化函数同步补充
4. 前端用 `fetch('/api/...')` 调用（同源，无 CORS）

## 4.4 新增一个数据模型 / 字段

1. `docs/models.py` 定义模型或加字段
2. `.venv314/bin/python manage.py makemigrations docs`
3. 若需回填历史数据，参考 0002 的 `RunPython` 模式
4. `migrate`；如需后台可见，在 `docs/admin.py` 注册
5. ⚠️ 谨慎选择 `on_delete`：要保留数据用 `SET_NULL`，强一致级联用 `CASCADE`

## 4.5 新增一个页面

1. `docs/views.py`：写渲染视图（参考 `folder_page/doc_page`）
2. `shimo_backend/urls.py`：注册路由
3. 模板放 `templates/editor/`（已在 TEMPLATES DIRS 中）
4. 复用 Quill 时，注意 CDN 依赖与自定义 blot 的注册顺序

## 4.6 存储与数据库扩展

| 目标 | 改动点 |
|---|---|
| 换 PostgreSQL/MySQL | `settings.DATABASES` 改 ENGINE/NAME/USER…，迁移文件可直接 apply |
| 图片/附件走对象存储（S3/OSS/COS） | settings 配置 `STORAGES['default']`，安装对应后端；`default_storage` 调用不变，媒体 URL 由 CDN/网关服务 |
| 增加全文搜索 | 可对 `content_html` 接入数据库全文索引，或引入独立搜索服务 |

## 4.7 引入登录与多用户（架构升级方向）

当前为单用户、写接口 `@csrf_exempt`。演进路径：
1. 启用 `django.contrib.auth`（已在 INSTALLED_APPS），加登录视图
2. 数据隔离：Document/Folder 查询加 `space__owner=request.user`，Space 增加 owner 字段
3. 移除 API 的 `@csrf_exempt`，前端请求携带 CSRF Token
4. 权限收敛：个人空间禁删等规则已有雏形，可扩展为统一权限层

## 4.8 走向多人协作（当前明确不支持）

核心不在存储而在并发：需引入 OT/CRDT 冲突合并、Presence、操作广播。Quill 提供 Delta 与可复用的 OT 原语，但服务端需新增「操作转发 + 版本转换 + 持久化」长连接服务，属独立子系统，不建议在现有单用户保存模型上直接叠加。

---

## 本地开发速查

```bash
cd backend
.venv314/bin/python manage.py migrate                 # 初始化/更新数据库
.venv314/bin/python manage.py runserver 127.0.0.1:8000 # 启动（模板改动自动生效）
```

- 文件管理页：http://127.0.0.1:8000/
- 编辑器：从列表点击文档进入（`/docs/<id>/`）
- 调试：浏览器 Console + Network；Django 请求日志直接打印在 runserver 终端
