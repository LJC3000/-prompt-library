import { getTenantAccessToken } from "@/lib/feishu";

const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN!;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID!;

export interface CreatePromptFields {
  title: string;
  content: string;
  department?: string;
  aiTool?: string;
  aiModel?: string;
  imageTypes: string[];
  buildingTypes: string[];
  weatherTypes: string[];
  diagramTypes: string[];
  /** result images: file_token + qiniu metadata */
  results: Array<{
    file_token: string;
    qiniu_url: string;
    w?: number;
    h?: number;
  }>;
  /** reference images */
  refImages: Array<{
    file_token: string;
    qiniu_url: string;
    w?: number;
    h?: number;
  }>;
}

/**
 * Create a new record in Feishu bitable with all fields populated,
 * including attachment fields (生成结果, 参考图片) and 七牛映射.
 * Returns the new record_id.
 */
export async function createFeishuRecord(
  fields: CreatePromptFields
): Promise<string> {
  const token = await getTenantAccessToken();

  // Build 七牛映射: merge results + refImages
  const qiniuMap: Record<string, { url: string; w?: number; h?: number }> = {};
  for (const img of [...fields.results, ...fields.refImages]) {
    qiniuMap[img.file_token] = { url: img.qiniu_url, w: img.w, h: img.h };
  }

  const body: Record<string, unknown> = {
    fields: {
      项目名称: fields.title,
      提示词: fields.content,
      ...(fields.department && { 部门: fields.department }),
      ...(fields.aiTool && { AI工具: fields.aiTool }),
      ...(fields.aiModel && { AI模型: fields.aiModel }),
      图片类型: fields.imageTypes,
      建筑类型: fields.buildingTypes,
      光影天气: fields.weatherTypes,
      分析图类型: fields.diagramTypes,
      生成结果: fields.results.map((r) => ({ file_token: r.file_token })),
      参考图片: fields.refImages.map((r) => ({ file_token: r.file_token })),
      七牛映射: JSON.stringify(qiniuMap),
    },
  };

  const res = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(
      `Feishu record creation failed: code=${data.code} msg=${data.msg}`
    );
  }

  return data.data.record.record_id;
}
