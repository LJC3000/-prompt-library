import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

async function fetchImage(token: string, extra: string | null): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const tenantToken = await getTenantAccessToken();

  // Step 1: get a temporary download URL
  const body: Record<string, any> = { file_tokens: [token] };
  if (extra) body.extra = extra;

  const tempRes = await fetch(
    "https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const tempData = await tempRes.json();
  if (tempData.code !== 0) return null;

  const urls = tempData.data?.tmp_download_urls ?? [];
  const downloadUrl = urls[0]?.url || urls[0]?.tmp_download_url;
  if (!downloadUrl) return null;

  // Step 2: download the actual image
  const imgRes = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${tenantToken}`,
      Accept: "image/avif,image/webp,image/png,*/*",
    },
  });

  if (!imgRes.ok) return null;

  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  const buffer = await imgRes.arrayBuffer();
  return { buffer, contentType };
}

export async function GET(req: NextRequest) {
  const b64 = req.nextUrl.searchParams.get("b64");

  if (!b64) {
    return NextResponse.json({ error: "Missing b64" }, { status: 400 });
  }

  try {
    // Decode the full Feishu URL to extract file_token and extra
    const feishuUrl = decodeURIComponent(atob(b64));

    // Parse token and extra from the URL
    // Format: https://open.feishu.cn/open-apis/drive/v1/medias/{token}/download?extra={json}
    const urlObj = new URL(feishuUrl);
    const pathParts = urlObj.pathname.split("/");
    const fileToken = pathParts[pathParts.indexOf("medias") + 1];
    const extra = urlObj.searchParams.get("extra");

    if (!fileToken) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Try fetching with extra first, then without
    let result = await fetchImage(fileToken, extra);
    if (!result) {
      result = await fetchImage(fileToken, null);
    }

    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch image from Feishu" },
        { status: 502 }
      );
    }

    return new NextResponse(result.buffer, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Proxy error: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
