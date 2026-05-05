# 上传功能开发交接表

**日期**: 2026-05-04 ~ 2026-05-05  
**分支**: feature/upload → 已合并 master  
**开发者**: 杰 + 一仔 (Claude Code)

---

## 一、做了什么

### 1. 上传功能（从网站写入飞书多维表格）

**新增文件**:

| 文件 | 作用 |
|---|---|
| `src/components/UploadButton.tsx` | 4:3 白色 + 号按钮，置于卡片网格左上角 |
| `src/components/UploadModal.tsx` | 上传表单弹窗（四区布局） |
| `src/lib/qiniuUpload.ts` | 七牛 CDN 直传（HMAC-SHA1 Token，无 SDK 依赖） |
| `src/lib/feishuUpload.ts` | 飞书 drive/v1/medias/upload_all 上传 |
| `src/lib/feishuWrite.ts` | 飞书 bitable 创建记录（字段映射 + 七牛映射） |
| `src/app/api/upload-image/route.ts` | POST：接收图片 → 七牛 + 飞书并行上传 |
| `src/app/api/create-prompt/route.ts` | POST：接收表单字段 → 创建飞书记录 → 清缓存 |

**修改文件**:

| 文件 | 改动 |
|---|---|
| `src/app/page.tsx` | UploadButton + UploadModal 集成，上传成功后刷新数据 |
| `src/lib/feishu.ts` | 新增 `clearPromptsCache()` |
| `src/app/api/prompts/route.ts` | 支持 `?_refresh=1` 绕过缓存 |

**数据流**:
```
用户点上传按钮 → UploadModal 打开
  → 填表单 + 选图片（浏览器端压缩至 2MB）
  → 提交：串行上传每张图到 /api/upload-image
  → 全部上传完后 POST /api/create-prompt
  → 成功 → 清缓存 → 刷新卡片网格
```

### 2. UI 布局（四区优先级）

```
┌──────────────────────────────┐
│ 分区一：生成结果 │ 参考图片   │  顶部并排，色块背景，上传后预览图替换虚线框
├──────────────────────────────┤
│ 分区二：提示词（全宽 textarea）│  沉浸式书写
├──────────────────────────────┤
│ 分区三：项目名称 │ 部门 │ AI  │  三列紧凑
├──────────────────────────────┤
│ 分区四：标签网格（4列）       │  品牌色选中态
├──────────────────────────────┤
│ Footer：取消 / 提交           │  始终可见
└──────────────────────────────┘
```

### 3. 关键问题与解决

| 问题 | 根因 | 解决 |
|---|---|---|
| qiniu SDK 打包失败 | `urllib` → `proxy-agent` 与 Next.js/Turbopack 不兼容 | 手写 HMAC-SHA1 Token 生成，用原生 fetch 上传 |
| 拖拽显示禁止图标 | Chrome 要求 `dragenter.preventDefault()` 才认 drop target | 恢复 onDragEnter + preventDefault |
| 滚动条遮圆角 | `overflow-y-auto` 在 `rounded-2xl` 外层卡片上 | 滚动条移入内容区 `flex-1 overflow-y-auto`，外层 `overflow-hidden` |
| Chrome/Edge 高度不一致 | `vh` 单位各浏览器计算不同 | 改用 PromptModal 对齐的 `h-[80vh]` + `mt-[8vh]` |
| 谷歌字体被墙 | Google Fonts 国内不可达 | 移除 Geist，统一用系统字体栈：`system-ui, -apple-system, ...` |
| 悬浮框 "Prompt Library" 换行 | 系统字体比 Geist 宽 | 宽度 80% → 88% |

### 4. 拖拽上传

- 单 div 同时处理 click + drag（无内层 button 拦截）
- `relatedTarget.contains()` 判断真正离开（不误触发子元素）
- `dropEffect = "copy"` 显示复制光标
- 上传后预览图直接替换虚线框内部空间
- 支持多图、可删除、可继续添加

### 5. 容错设计

- 前端 `browser-image-compression` 压缩至 2MB（绕 Serverless 4.5MB 限制）
- 图片串行上传（避免飞书并发限流）
- 上传失败时 Modal 不关闭、表单不清空、显示错误 + 重试
- MVP 阶段容忍孤儿文件

---

## 二、部署

| 平台 | 正式地址 | 备注 |
|---|---|---|
| Vercel | https://prompt-library-jade.vercel.app | 默认部署 |
| Netlify | https://ljc-prompt-library.netlify.app | 备用 |

**部署命令**:
```bash
# Vercel
npx vercel --prod

# Netlify（需要本地构建）
npm run build
netlify deploy --dir .next --site b2e90d0a-949a-4821-ab4d-30d0c96fa97f --prod
```

**注意**: Netlify 需要 `NETLIFY_AUTH_TOKEN` 环境变量，当前 token: `nfp_uWSVSVVkym44kaU2yW6SnfrnPpFkZMDb8305`

---

## 三、环境变量（需要配置）

两个平台都需要在各自 dashboard 设置以下环境变量：

```
FEISHU_APP_ID=           # 飞书应用 ID
FEISHU_APP_SECRET=       # 飞书应用密钥
FEISHU_APP_TOKEN=        # 飞书多维表格 token
FEISHU_TABLE_ID=         # 飞书表格 ID
QINIU_ACCESS_KEY=        # 七牛 AccessKey
QINIU_SECRET_KEY=        # 七牛 SecretKey
QINIU_BUCKET=            # 七牛存储空间名
QINIU_CUSTOM_DOMAIN=     # 七牛 CDN 域名（含 https://）
```

---

## 四、待办 / 已知限制

1. **孤儿文件**: 上传图片到七牛/飞书后，如果创建记录失败，已上传的图片不会回滚。目前量少可接受，后续可加事务补偿。
2. **飞书限流**: 图片是串行上传的，多图时较慢。后续可加请求间隔或队列。
3. **移动端适配**: UploadModal 在手机上仍然是纵向布局，体验一般。
4. **GlobalHeader 重构**: 已有 plan 但未实施（task #22）。
5. **上传进度**: 当前只显示文字进度"正在上传图片 (2/5)"，无进度条百分比。

---

## 五、飞书字段映射

| 前端字段 | 飞书列名 | 类型 |
|---|---|---|
| title | 项目名称 | 文本 |
| content | 提示词 | 多行文本 |
| department | 部门 | 文本 |
| aiTool | AI工具 | 文本 |
| aiModel | AI模型 | 文本 |
| imageTypes | 图片类型 | 多选 |
| buildingTypes | 建筑类型 | 多选 |
| weatherTypes | 光影天气 | 多选 |
| diagramTypes | 分析图类型 | 多选 |
| results (file_token) | 生成结果 | 附件 |
| refImages (file_token) | 参考图片 | 附件 |
| results (qiniu_url + w + h) | 七牛映射 | 文本(JSON) |
