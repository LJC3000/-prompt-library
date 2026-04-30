import type { FeishuFile, PromptItem } from "@/types/prompt";

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

function parseFiles(raw: any): FeishuFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any) => ({
    file_token: f.file_token ?? "",
    name: f.name ?? "",
    size: f.size ?? 0,
    type: f.type ?? "",
    url: f.url ?? undefined,
    tmp_url: f.tmp_url ?? undefined,
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
  return {
    id: record.record_id,
    title,
    category: imageTypes[0] ?? "Uncategorized",
    content: fields["提示词"] ?? "",
    project: fields["项目名称"] ?? "",
    department: fields["部门"] ?? "",
    aiTool: fields["AI工具"] ?? "",
    aiModel: fields["AI模型"] ?? "",
    refImages: parseFiles(fields["参考图片"]),
    results: parseFiles(fields["生成结果"]),
    imageTypes,
    buildingTypes: Array.isArray(fields["建筑类型"]) ? fields["建筑类型"] : undefined,
    weatherTypes: Array.isArray(fields["光影天气"]) ? fields["光影天气"] : undefined,
    diagramTypes: Array.isArray(fields["分析图类型"]) ? fields["分析图类型"] : undefined,
  };
}

// In-memory cache
let promptsCache: { data: PromptCardItem[]; expiresAt: number } | null = null;
const PROMPTS_CACHE_TTL = 300_000; // 5 minutes

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
      // No results — still emit one card (will show placeholder)
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

  promptsCache = {
    data: items,
    expiresAt: now + PROMPTS_CACHE_TTL,
  };

  return items;
}
