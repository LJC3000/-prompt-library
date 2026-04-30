# Prompt Library

极简风格的提示词（Prompt）库前端展示网站，通过飞书多维表格 API 读取数据。

## 技术栈

- **Next.js 16** — React 框架
- **Tailwind CSS 4** — 样式
- **Framer Motion** — 交互动画
- **飞书多维表格 API** — 数据源

## 快速开始

### 1. 配置飞书

在 `.env.local` 中填写飞书应用凭证：

```env
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_APP_TOKEN=your_base_token
FEISHU_TABLE_ID=your_table_id
```

### 2. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可查看。

### 3. 飞书多维表格字段映射

默认从飞书表格读取以下字段（按优先级）：

| 字段    | 备选字段名                        |
| ------- | --------------------------------- |
| 标题    | `标题` / `title`                  |
| 分类    | `分类` / `category`               |
| 内容    | `内容` / `prompt` / `content`     |
| 创建时间 | `创建时间` / `created_at`         |

如需自定义字段映射，请编辑 `src/lib/feishu.ts` 中的 `fetchPromptsFromFeishu` 函数。

## 生产部署

```bash
npm run build
npm start
```

## 项目结构

```
src/
├── app/
│   ├── api/prompts/route.ts    # 飞书数据 API
│   ├── globals.css             # 全局样式
│   ├── layout.tsx              # 根布局
│   └── page.tsx                # 首页
├── components/
│   ├── PromptCard.tsx          # 提示词卡片
│   └── SearchBar.tsx           # 搜索框
├── lib/
│   └── feishu.ts               # 飞书 API 封装
└── types/
    └── prompt.ts               # 类型定义
```
