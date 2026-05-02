import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

interface RefreshRequest {
  fileTokens: string[];
  extra?: string;
}

/**
 * 请求飞书 batch_get_tmp_download_url 刷新临时下载链接。
 * 接受 POST，内部实际调用飞书 GET 接口。
 * 每批最多 5 个 file_tokens。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RefreshRequest;
    const allTokens = body.fileTokens ?? [];
    if (!allTokens.length) {
      return NextResponse.json({ error: "No file tokens provided" }, { status: 400 });
    }

    const token = await getTenantAccessToken();
    const results: Record<string, string> = {};

    // 每批 5 个（飞书接口限制）
    const BATCH_SIZE = 5;
    for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
      const batch = allTokens.slice(i, i + BATCH_SIZE);

      try {
        const params = new URLSearchParams();
        for (const ft of batch) params.append("file_tokens", ft);
        if (body.extra) params.set("extra", body.extra);

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
              results[item.file_token] = item.tmp_download_url;
            }
          }
        } else {
          console.log(`[refresh-urls] Feishu error: code=${data.code} msg=${data.msg}`);
        }
      } catch (e) {
        console.log(`[refresh-urls] Error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return NextResponse.json({ urls: results });
  } catch (e) {
    console.error("[refresh-urls] Fatal:", e);
    return NextResponse.json({ error: "Internal error", urls: {} }, { status: 500 });
  }
}
