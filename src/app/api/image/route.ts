import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

async function fetchImage(fileToken: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const tenantToken = await getTenantAccessToken();

  // Try batch_get_tmp_download_url first
  const body = { file_tokens: [fileToken] };

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
  if (tempData.code === 0) {
    const urls = tempData.data?.tmp_download_urls ?? [];
    const downloadUrl = urls[0]?.url || urls[0]?.tmp_download_url;
    if (downloadUrl) {
      const imgRes = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          Accept: "image/avif,image/webp,image/png,*/*",
        },
      });
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") ?? "image/png";
        const buffer = await imgRes.arrayBuffer();
        return { buffer, contentType };
      }
    }
  }

  // Fallback: try direct download via drive media API
  const directRes = await fetch(
    `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download`,
    {
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        Accept: "image/avif,image/webp,image/png,*/*",
      },
    }
  );

  if (directRes.ok) {
    const contentType = directRes.headers.get("content-type") ?? "image/png";
    const buffer = await directRes.arrayBuffer();
    return { buffer, contentType };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const fileToken = req.nextUrl.searchParams.get("token");

  if (!fileToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const result = await fetchImage(fileToken);

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
