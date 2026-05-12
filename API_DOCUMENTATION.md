# Prompt Library — API 集成文档

> 文档维护：2026-05-07
> 本文档覆盖此项目所有外部 API 调用，包括飞书（Feishu/Lark）和七牛云（Qiniu）。

---

## 目录

1. [飞书 API](#1-飞书-api)
   - [1.1 身份验证](#11-身份验证)
   - [1.2 获取记录](#12-获取记录)
   - [1.3 创建记录](#13-创建记录)
   - [1.4 更新记录](#14-更新记录)
   - [1.5 批量获取临时下载 URL](#15-批量获取临时下载-url)
   - [1.6 上传媒体](#16-上传媒体)
2. [七牛云 API](#2-七牛云-api)
   - [2.1 上传文件](#21-上传文件)
   - [2.2 图片信息查询](#22-图片信息查询)
3. [飞书字段映射](#3-飞书字段映射)
4. [环境变量](#4-环境变量)
5. [速率限制与重试策略](#5-速率限制与重试策略)

---

## 1. 飞书 API

### 1.1 身份验证

**端点：** `POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`

**用途：** 获取 tenant_access_token，所有后续飞书 API 调用的凭证。

**文件：** `src/lib/feishu.ts` 第 19 行，`scripts/sync-qiniu.mjs` 第 155 行

**请求体：**

```json
{
  "app_id": "FEISHU_APP_ID",
  "app_secret": "FEISHU_APP_SECRET"
}
```

**响应字段：** `tenant_access_token`、`expire`（秒级 TTL）、`code`

**缓存策略：** 内存缓存，TTL = 实际 expire - 60 秒，提前 1 分钟自动刷新。

**错误处理：** `data.code !== 0` 时抛出错误；缺少环境变量时直接抛出。

---

### 1.2 获取记录

**端点：** `GET https://open.feishu.cn/open-apis/bitable/v1/apps/{FEISHU_APP_TOKEN}/tables/{FEISHU_TABLE_ID}/records`

**文件：** `src/lib/feishu.ts` 第 155 行，`scripts/sync-qiniu.mjs` 第 188 行

**参数：**

| 参数 | 说明 | 默认值 |
|---|---|---|
| `page_size` | 每页记录数 | 100 |
| `page_token` | 分页令牌（首页不需要） | — |

**响应字段：** `data.items[]`、`data.page_token`（有更多页时返回）

**分页：** `do...while(pageToken)` 循环获取所有页。

**缓存策略：** 12 小时内存缓存（`promptsCache`），`clearPromptsCache()` 可手动清除。

**错误处理：** `data.code !== 0` 时抛出错误。

---

### 1.3 创建记录

**端点：** `POST https://open.feishu.cn/open-apis/bitable/v1/apps/{FEISHU_APP_TOKEN}/tables/{FEISHU_TABLE_ID}/records`

**文件：** `src/lib/feishuWrite.ts` 第 65 行

**超时：** 30 秒

**头信息：** `Authorization: Bearer {token}`、`Content-Type: application/json`

**请求体：**

```json
{
  "fields": {
    "项目名称": "…",
    "提示词": "…",
    "部门": "…",
    "AI工具": "…",
    "AI模型": "…",
    "图片类型": ["…"],
    "建筑类型": ["…"],
    "光影天气": ["…"],
    "分析图类型": ["…"],
    "生成结果": [{ "file_token": "…" }],
    "参考图片": [{ "file_token": "…" }],
    "七牛映射": "{…}"  // JSON 字符串
  }
}
```

**响应字段：** `data.record.record_id`

**错误处理：** `data.code !== 0` 时抛出 `Feishu record creation failed`。

---

### 1.4 更新记录

**端点：** `PUT https://open.feishu.cn/open-apis/bitable/v1/apps/{FEISHU_APP_TOKEN}/tables/{FEISHU_TABLE_ID}/records/{record_id}`

**文件：** `scripts/sync-qiniu.mjs` 第 523 行

**用途：** 同步脚本中将 `七牛映射` 字段写入已有记录。

**错误处理：** 检查 `data.code === 0`。

---

### 1.5 批量获取临时下载 URL

**端点：** `GET https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url`

**文件：** `src/lib/feishu.ts` 第 248 行，`src/app/api/refresh-urls/route.ts` 第 36 行，`scripts/sync-qiniu.mjs` 第 218 行

**参数：**

| 参数 | 说明 | 限制 |
|---|---|---|
| `file_tokens` | 可重复多次 | 每批最多 5 个 |
| `extra` | 高级权限参数（可选） | — |

**响应字段：** `data.tmp_download_urls[].file_token`、`data.tmp_download_urls[].tmp_download_url`

**有效期：** 返回的 `tmp_download_url` 有效 24 小时。

**注意：** 部分飞书环境可能返回 `internal-api-drive-stream.feishu.cn` 内网域名。前端代码已过滤此类 URL，自动走 `/api/image` 代理降级。

**错误处理：** 非致命——失败时记录日志并继续，走降级链路。

---

### 1.6 上传媒体

**端点：** `POST https://open.feishu.cn/open-apis/drive/v1/medias/upload_all`

**文件：** `src/lib/feishuUpload.ts` 第 24 行

**超时：** 120 秒

**请求体（FormData）：**

| 字段 | 值 |
|---|---|
| `file_name` | 文件名 |
| `parent_type` | `bitable_file` |
| `parent_node` | `FEISHU_APP_TOKEN` |
| `size` | 文件字节数 |
| `file` | 文件二进制内容 |

**响应字段：** `data.file_token`

**错误处理：** `data.code !== 0` 时抛出错误。

---

## 2. 七牛云 API

### 2.1 上传文件

**端点：** `POST https://up-z2.qiniup.com`

**文件：** `src/lib/qiniuUpload.ts` 第 55 行，`scripts/sync-qiniu.mjs` 第 264 行

**区域：** 华南-广东（z2），固定 `up-z2.qiniup.com`，不依赖自动区域检测。

**超时：** 120 秒

**令牌生成：**

使用 HMAC-SHA1 签名，putPolicy 格式：

```json
{
  "scope": "{bucket}:{key}",
  "deadline": "{now + 7200s}"
}
```

令牌格式：`{accessKey}:{signature}:{encodedFlags}`，Base64 编码时不填充 `=`。

**请求体（FormData）：**

| 字段 | 说明 |
|---|---|
| `token` | 上传令牌 |
| `key` | 对象键（文件路径） |
| `file` | 文件二进制 |

**响应：** `data.key`，构建 URL：`http://{domain}/{key}`

**重试策略（sync 脚本）：** 最多 3 次，2s / 4s 退避。

**错误处理：** `data.error` 存在时抛出 `Qiniu upload failed`。

---

### 2.2 图片信息查询

**端点：** `GET {qiniuUrl}?imageInfo`

**文件：** `src/lib/qiniuUpload.ts` 第 74 行，`scripts/sync-qiniu.mjs` 第 317 行

**超时：** 10 秒

**用途：** 获取上传图片的宽高，用于计算 aspectRatio。

**响应字段：** `width`、`height`

**错误处理：** 非致命——返回 `null`，前端使用 4:3 占位。

---

## 3. 飞书字段映射

飞书多维表格中文字段 → 代码数据结构的完整映射：

| 飞书字段名 | 代码字段 | 类型 | 说明 |
|---|---|---|---|
| `项目名称` | `title` / `project` | string | 用于标题展示和搜索 |
| `提示词` | `content` | string | 完整 prompt 文本 |
| `部门` | `department` | string | 可选 |
| `AI工具` | `aiTool` | string | 可选 |
| `AI模型` | `aiModel` | string | 可选 |
| `图片类型` | `imageTypes` | string[] | 第一项作为 `category`；可选值：效果图（低点）、效果图（鸟瞰）、分析图、平面图、总平面图 |
| `建筑类型` | `buildingTypes` | string[] | 可选，联动图片类型=效果图时展示 |
| `光影天气` | `weatherTypes` | string[] | 可选，联动同上 |
| `分析图类型` | `diagramTypes` | string[] | 可选，联动图片类型=分析图时展示 |
| `参考图片` | `refImages` | FeishuFile[] | 附件字段，含 file_token / url / tmp_url / qiniu_url |
| `生成结果` | `results` | FeishuFile[] | 同 refImages，每条记录按结果图拆成多张卡片 |
| `七牛映射` | `qiniuMap` | JSON string | file_token → `{url, w, h}` 映射，由 sync 脚本写入 |

**代码位置：** `src/lib/feishu.ts` 第 75-121 行 `recordToPromptItem()`、`src/lib/feishuWrite.ts` 第 48-63 行 `createFeishuRecord()`

---

## 4. 环境变量

| 变量 | 必须 | 文件来源 | 使用位置 |
|---|---|---|---|
| `FEISHU_APP_ID` | ✅ | `.env.local` | 飞书 OAuth 认证 |
| `FEISHU_APP_SECRET` | ✅ | `.env.local` | 飞书 OAuth 认证 |
| `FEISHU_APP_TOKEN` | ✅ | `.env.local` | 飞书多维表格 Base Token |
| `FEISHU_TABLE_ID` | ✅ | `.env.local` | 飞书多维表格 ID |
| `QINIU_AK` | ✅ | `.env.local` | 七牛 AccessKey |
| `QINIU_SK` | ✅ | `.env.local` | 七牛 SecretKey |
| `QINIU_BUCKET` | ✅ | `.env.local` | 七牛存储空间 |
| `QINIU_DOMAIN` | ✅ | `.env.local` | 七牛 CDN 域名 |

## 5. 速率限制与重试策略

### 飞书速率限制（等级 6）

- 每 API 调用端点上限制 **5 请求/秒**
- 实现：`src/app/api/image/route.ts` 中 Token Bucket 限流器（5 令牌桶，每秒补充 5 个）
- `sync-qiniu.mjs` 中批次间 **300ms sleep** 分隔
- 在处理的去重映射（`inflightMap`）防止并发请求相同 URL

### 重试策略

| 操作 | 重试次数 | 退避策略 | 超时 |
|---|---|---|---|
| 飞书 OAuth 获取令牌 | 3 | 指数 1s→2s→4s | 60s |
| 飞书 batch_get_tmp_download_url | 3 | 指数 1s→2s→4s | 15s |
| 飞书 upload_all | 0 | — | 120s |
| 图片代理（/api/image） | 3 | 指数 0.5s→1s→2s（上限 4s） | 60s |
| 七牛上传（sync 脚本） | 3 | 指数 2s→4s | 120s |
| 七牛 imageInfo | 0 | — | 10s |
| tmp_url 下载（sync 脚本） | 3 | 固定 2s | 45s |

### 非关键操作

- 图片宽高预取（`batchFetchAspectRatios`）：**不做重试**，失败时前端用 4:3 占位
- 批量 tmp_url 刷新：失败时记录日志并继续，前端走 `/api/image` 降级

### 前端图片降级链路

```
cardThumbSrc() / imageSrc() 返回 imgSrc
  ↓ 加载失败
handleError() → triggerRefresh()
  → refreshTmpUrl() 尝试刷新
  ↓ 刷新失败
setSourceMode("proxy")
  → proxyUrl() 走 /api/image 服务端 Bearer 代理
  ↓ 代理也失败
setSourceMode("failed") → 显示纯色占位
```
