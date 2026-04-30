import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

/**
 * Extract file_token and extra from a Feishu file URL.
 * Supports multiple URL formats:
 *   drive/v1/medias/{token}/download?extra=xxx
 *   bitable/v1/apps/{appToken}/tables/{tableId}/records/{recordId}/attachments/{token}/download
 *   drive/v1/medias/{token}/download
 */
function parseFileUrl(url: string): { fileToken: string; extra: string | null } | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const extra = urlObj.searchParams.get("extra");

    // Find the segment right before "download"
    const downloadIdx = pathParts.indexOf("download");
    if (downloadIdx >= 1) {
      return { fileToken: pathParts[downloadIdx - 1], extra };
    }

    // Alternatively find the segment after "medias"
    const mediasIdx = pathParts.indexOf("medias");
    if (mediasIdx >= 0 && mediasIdx + 1 < pathParts.length) {
      return { fileToken: pathParts[mediasIdx + 1], extra };
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const urlEncoded = req.nextUrl.searchParams.get("url");

  if (!urlEncoded) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const url = decodeURIComponent(urlEncoded);
    const parsed = parseFileUrl(url);

    if (!parsed) {
      // Can't parse the URL — try direct fetch with auth as last resort
      const tenantToken = await getTenantAccessToken();
      const imgRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          Accept: "image/avif,image/webp,image/png,*/*",
        },
      });
      if (!imgRes.ok) {
        return NextResponse.json({ error: "Unsupported URL format" }, { status: 502 });
      }
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      const buffer = await imgRes.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    const { fileToken, extra } = parsed;
    const tenantToken = await getTenantAccessToken();

    // Strategy 1: batch_get_tmp_download_url (with extra if available)
    const body: Record<string, any> = { file_tokens: [fileToken] };
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
          return new NextResponse(buffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
          });
        }
      }
    }

    // Strategy 2: try batch_get_tmp_download_url without extra
    if (extra) {
      const retryRes = await fetch(
        "https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tenantToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file_tokens: [fileToken] }),
        }
      );
      const retryData = await retryRes.json();
      if (retryData.code === 0) {
        const urls = retryData.data?.tmp_download_urls ?? [];
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
            return new NextResponse(buffer, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400, s-maxage=86400",
              },
            });
          }
        }
      }
    }

    // Strategy 3: direct fetch with Bearer auth
    const directRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        Accept: "image/avif,image/webp,image/png,*/*",
      },
    });
    if (directRes.ok) {
      const contentType = directRes.headers.get("content-type") ?? "image/png";
      const buffer = await directRes.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    return NextResponse.json(
      { error: "All download strategies failed" },
      { status: 502 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Proxy error: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
