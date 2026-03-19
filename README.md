# SillyTavern Creative Workshop

一个为 SillyTavern 设计的世界书工作坊平台，用户可以浏览、订阅和管理世界书条目包，并通过配套扩展直接注入到 SillyTavern 中。

## 项目简介

本项目是一个基于 Web 的世界书分享平台，提供以下核心功能：

- 用户通过 Discord OAuth2 登录
- 浏览和搜索工作坊中的世界书条目包
- 订阅感兴趣的条目包
- 创作者可以创建和管理自己的工作坊及条目包
- 通过 SillyTavern 扩展实现一键同步到本地世界书

## 技术栈

### 后端
- Node.js 20
- Express 5
- SQLite (better-sqlite3, WAL 模式)
- Passport + passport-discord (Discord OAuth2 认证)

### 前端
- Vue 3 (Composition API, `<script setup>`)
- Vite 8
- Pinia 3 (状态管理)
- Vue Router 4
- Tailwind CSS v4

### SillyTavern 扩展
- 原生 JavaScript (无构建步骤)
- 通过弹窗打开工作坊并代理 TavernHelper API 调用

## 项目结构

```
STCreativeWorkshop/
├── backend/                    # 后端服务
│   ├── db/
│   │   └── init.js            # SQLite 数据库初始化和迁移
│   ├── middleware/
│   │   └── auth.js            # 认证中间件
│   ├── routes/                # API 路由
│   │   ├── auth.js            # Discord OAuth2 认证
│   │   ├── workshop.js        # 工作坊、条目包、条目相关 API
│   │   ├── stories.js         # 旧版故事 API
│   │   └── tags.js            # 旧版标签 API
│   ├── .env                   # 环境变量（勿提交）
│   ├── .env.example           # 环境变量模板
│   ├── package.json
│   └── server.js              # Express 入口文件
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── components/        # Vue 组件
│   │   ├── views/             # 视图页面
│   │   ├── stores/            # Pinia 状态管理
│   │   ├── router/            # Vue Router 配置
│   │   ├── config/            # 配置文件（标签、工作坊设置）
│   │   ├── style.css          # Tailwind 样式
│   │   └── main.js
│   ├── package.json
│   └── vite.config.js
└── st-extension/               # SillyTavern 扩展
    ├── index.js
    ├── manifest.json
    └── style.css
```

## 安装和运行

### 环境要求

- Node.js 20 或更高版本
- npm 或其他包管理器

### 后端启动

```bash
cd backend
npm install

# 复制环境变量模板并填写配置
cp .env.example .env
# 编辑 .env 文件，填写 Discord OAuth2 配置等

# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

后端默认运行在 http://localhost:3000

### 前端启动

```bash
cd frontend
npm install

# 开发模式（Vite 开发服务器）
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

前端开发服务器默认运行在 http://localhost:5173

## 环境变量配置

在 `backend/.env` 中配置以下环境变量：

| 变量名 | 说明 |
|--------|------|
| `DISCORD_CLIENT_ID` | Discord 应用客户端 ID |
| `DISCORD_CLIENT_SECRET` | Discord 应用客户端密钥 |
| `DISCORD_REDIRECT_URI` | Discord OAuth2 回调地址（必须与 Discord 开发者门户配置一致）|
| `SESSION_SECRET` | Express Session 签名密钥 |
| `FRONTEND_URL` | 前端地址（开发环境通常为 `http://localhost:5173`）|
| `PORT` | 后端端口（默认 3000）|
| `NODE_ENV` | 环境模式（`development` 或 `production`）|
| `HTTP_PROXY` | （可选）HTTP 代理地址，如 `http://127.0.0.1:10808` |

## 开发说明

### 代码风格

- 后端使用 CommonJS 模块规范（`require` / `module.exports`）
- 前端使用 ES Modules 模块规范（`import` / `export`）
- 所有 Vue 组件使用 Composition API 和 `<script setup>` 语法
- 所有 UI 文本和代码注释使用中文（zh-CN）
- 数据库列名使用 snake_case（如 `author_id`、`created_at`）
- JavaScript 变量和函数使用 camelCase

### 设计语言

- 背景色：`#FFFBF0` (奶油色)
- 主色调：`#F97316` (橙色)
- 危险色：`#EF4444` (红色)
- 字体：标题使用 Fredoka，正文使用 Nunito
- 手绘风格：圆角 16px，带 3px 偏移阴影，虚线边框

### 数据库

- 使用 SQLite，数据库文件自动创建在 `backend/db/stories.db`
- 所有数据库操作为同步调用（better-sqlite3）
- 使用预处理语句和 `?` 占位符防止 SQL 注入
- 数据库迁移代码位于 `backend/db/init.js` 文件底部

### API 规范

- API 路径前缀：`/api/`
- 认证路径前缀：`/auth/`
- 列表响应：`{ data: [...], pagination: { page, limit, total, totalPages } }`
- 单项响应：`{ data: { ... } }`
- 错误响应：`{ error: '<中文错误消息>' }`

## SillyTavern 扩展安装

1. 将 `st-extension/` 目录复制到 SillyTavern 的扩展目录
2. 在 SillyTavern 中启用该扩展
3. 点击扩展图标打开工作坊弹窗
4. 登录后即可浏览和订阅条目包

## 生产部署

生产环境下，后端会自动提供前端构建后的静态文件：

1. 构建前端：`cd frontend && npm run build`
2. 设置 `NODE_ENV=production`
3. 启动后端：`cd backend && npm start`

所有请求将由后端统一处理，静态文件从 `frontend/dist/` 目录提供服务。

## 注意事项

- 本项目不是 monorepo，`backend/` 和 `frontend/` 有各自独立的 `package.json` 和 `node_modules/`
- 项目中没有配置测试或代码检查工具
- `https-proxy-agent` 必须保持在 v5 版本（v6+ 为 ESM only，不兼容 CommonJS）
- 前端构建时 base path 设置为 `/StoryShare/`，所有静态资源路径相对于此子路径

## 许可证

待定
