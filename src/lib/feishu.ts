import type { FeishuFile, PromptItem } from "@/types/prompt";
import { fetchImageDimensions } from "@/lib/imageMeta";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("FEISHU_APP_ID or FEISHU_APP_SECRET is not configured");
  }

  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }

  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire - 60) * 1000,
  };

  return data.tenant_access_token;
}

/** 从 file.url 中解析出 extra 参数（高级权限多维表格需要） */
function extractExtraFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const qIndex = url.indexOf("?extra=");
    if (qIndex === -1) return undefined;
    // URL 可能已被编码，直接取 raw 值返回即可
    const raw = url.slice(qIndex + 7);
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

function parseFiles(raw: any): FeishuFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any, i: number) => ({
    file_token: f.file_token || `__missing_${i}`,
    name: f.name ?? "",
    size: f.size ?? 0,
    type: f.type ?? "",
    url: f.url ?? undefined,
    tmp_url: f.tmp_url ?? undefined,
    extra: extractExtraFromUrl(f.url),
  }));
}

export interface PromptCardItem {
  /** Unique key for React list rendering */
  cardKey: string;
  /** The single result image for this card */
  resultImage: FeishuFile;
  /** Shared prompt data across all cards from the same record */
  prompt: PromptItem;
}

function recordToPromptItem(record: any): PromptItem {
  const fields = record.fields ?? {};
  const title = fields["项目名称"] ?? "Untitled";
  const imageTypes: string[] = Array.isArray(fields["图片类型"]) ? fields["图片类型"] : [];

  // 解析七牛映射，由 sync-qiniu.mjs 写入
  // 新格式：{"file_token": {"url": "https://...", "w": 1920, "h": 1080}}
  // 旧格式（兼容）：{"file_token": "https://..."}
  let qiniuMap: Record<string, string | { url: string; w?: number; h?: number }> = {};
  const rawMapping = fields["七牛映射"] ?? "";
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try { qiniuMap = JSON.parse(rawMapping); } catch { /* 忽略解析错误 */ }
  }

  function withQiniu(files: FeishuFile[]): FeishuFile[] {
    return files.map((f) => {
      const qiniu = qiniuMap[f.file_token];
      if (qiniu) {
        const qiniuUrl = typeof qiniu === "string" ? qiniu : qiniu.url;
        const result: FeishuFile = { ...f, qiniu_url: qiniuUrl };
        // 从七牛数据设置精确宽高比
        if (typeof qiniu !== "string" && qiniu.w && qiniu.h) {
          result.aspectRatio = qiniu.w / qiniu.h;
        }
        return result;
      }
      return f;
    });
  }

  return {
    id: record.record_id,
    title,
    category: imageTypes[0] ?? "Uncategorized",
    content: fields["提示词"] ?? "",
    project: fields["项目名称"] ?? "",
    department: fields["部门"] ?? "",
    aiTool: fields["AI工具"] ?? "",
    aiModel: fields["AI模型"] ?? "",
    refImages: withQiniu(parseFiles(fields["参考图片"])),
    results: withQiniu(parseFiles(fields["生成结果"])),
    imageTypes,
    buildingTypes: Array.isArray(fields["建筑类型"]) ? fields["建筑类型"] : undefined,
    weatherTypes: Array.isArray(fields["光影天气"]) ? fields["光影天气"] : undefined,
    diagramTypes: Array.isArray(fields["分析图类型"]) ? fields["分析图类型"] : undefined,
  };
}

// In-memory cache — 12 小时，因为 tmp_url 有 24h 有效期
let promptsCache: { data: PromptCardItem[]; expiresAt: number } | null = null;
const PROMPTS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export async function fetchPromptsFromFeishu(): Promise<PromptCardItem[]> {
  const now = Date.now();
  if (promptsCache && promptsCache.expiresAt > now) {
    return promptsCache.data;
  }

  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;

  if (!appToken || !tableId) {
    throw new Error("FEISHU_APP_TOKEN or FEISHU_TABLE_ID is not configured");
  }

  const token = await getTenantAccessToken();

  // Fetch all pages
  let pageToken: string | undefined;
  const allRecords: any[] = [];

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const data = await res.json();

    if (data.code !== 0) {
      throw new Error(`Feishu API error: ${data.msg}`);
    }

    allRecords.push(...(data.data?.items ?? []));
    pageToken = data.data?.page_token;
  } while (pageToken);

  // Split each record by individual result images to create card items
  const promptRecords = allRecords.map(recordToPromptItem);
  const items: PromptCardItem[] = [];

  for (const prompt of promptRecords) {
    const results = prompt.results ?? [];
    if (results.length === 0) {
      items.push({
        cardKey: prompt.id,
        resultImage: null as any,
        prompt,
      });
    } else {
      for (let i = 0; i < results.length; i++) {
        items.push({
          cardKey: `${prompt.id}__${i}`,
          resultImage: results[i],
          prompt,
        });
      }
    }
  }

  // 前端 PromptCard 自带降级链路（primary → refresh → proxy），
  // 无需在此预刷新所有 tmp_url，避免阻塞页面渲染。
  promptsCache = {
    data: items,
    expiresAt: now + PROMPTS_CACHE_TTL,
  };

  return items;
}

/**
 * 调用飞书 batch_get_tmp_download_url（GET），
 * 一次性获取所有图片的 24 小时有效直链，
 * 写入每个 FeishuFile 的 tmp_url。
 */
async function batchRefreshAllTmpUrls(
  items: PromptCardItem[],
  token: string
): Promise<void> {
  // 收集所有有 file_token 的图片文件，按 extra 分组
  const allFiles = new Map<string, FeishuFile>();
  for (const item of items) {
    const addFile = (f: FeishuFile | null | undefined) => {
      if (f && f.file_token && !f.file_token.startsWith("__missing_")) {
        allFiles.set(f.file_token, f);
      }
    };
    addFile(item.resultImage);
    for (const ref of item.prompt.refImages ?? []) addFile(ref);
  }

  if (allFiles.size === 0) return;

  // 按 extra 分组（相同 extra 可以一起请求）
  const groups = new Map<string, FeishuFile[]>();
  for (const file of allFiles.values()) {
    const key = file.extra ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }

  let totalRefreshed = 0;

  for (const [extra, files] of groups) {
    // 每批最多 5 个 file_tokens
    for (let i = 0; i < files.length; i += 5) {
      const batch = files.slice(i, i + 5);

      try {
        const params = new URLSearchParams();
        for (const f of batch) params.append("file_tokens", f.file_token);
        if (extra) params.set("extra", extra);

        const res = await fetch(
          `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?${params}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          }
        );

        const data = await res.json();

        if (data.code === 0 && data.data?.tmp_download_urls) {
          for (const item of data.data.tmp_download_urls) {
            if (item.tmp_download_url) {
              const file = allFiles.get(item.file_token);
              if (file) {
                file.tmp_url = item.tmp_download_url;
                totalRefreshed++;
              }
            }
          }
          console.log(`[feishu] Batch refresh OK: ${batch.length} files`);
        } else {
          console.log(`[feishu] Batch refresh error: code=${data.code} msg=${data.msg}`);
        }
      } catch (e) {
        console.log(`[feishu] Batch refresh fetch error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }

  console.log(`[feishu] Refreshed ${totalRefreshed}/${allFiles.size} tmp_urls (24h)`);
}

/**
 * Batch-fetch image dimensions for all cards via Range requests.
 * Concurrency limited to 2 to avoid overwhelming source servers.
 */
async function batchFetchAspectRatios(items: PromptCardItem[]): Promise<void> {
  const files = items
    .map((i) => i.resultImage)
    .filter((f): f is FeishuFile => f !== null && !!f.url);

  if (files.length === 0) return;

  const token = await getTenantAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}` };
  const queue = [...files];
  const concurrency = 2;

  function next(): Promise<void> {
    if (queue.length === 0) return Promise.resolve();
    const file = queue.shift()!;
    return fetchImageDimensions(file.url!, authHeaders)
      .then((dim) => {
        if (dim) file.aspectRatio = dim.width / dim.height;
      })
      .catch(() => {
        // Silently ignore — frontend will use 4:3 fallback
      })
      .then(next);
  }

  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    runners.push(next());
  }
  await Promise.all(runners);
}
