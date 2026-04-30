import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

async function fetchAsImage(url: string, headers: Record<string, string>): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    console.log(`[image-proxy] Fetching: ${url.substring(0, 120)}...`);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`[image-proxy] ${res.status} for ${url.substring(0, 80)}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = await res.arrayBuffer();
    console.log(`[image-proxy] OK ${contentType} ${buffer.byteLength}bytes`);
    return { buffer, contentType };
  } catch (e) {
    console.log(`[image-proxy] Error: ${e instanceof Error ? e.message : "unknown"}`);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const b64 = req.nextUrl.searchParams.get("b64");

  if (!b64) {
    return NextResponse.json({ error: "Missing b64" }, { status: 400 });
  }

  try {
    const payload = JSON.parse(decodeURIComponent(atob(b64)));
    const url: string | undefined = payload.url;
    const tmpUrl: string | undefined = payload.tmpUrl;

    if (!url && !tmpUrl) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    // Strategy 1: Bearer proxy on url (works for open.feishu.cn API URLs)
    if (url) {
      const token = await getTenantAccessToken();
      const result = await fetchAsImage(url, {
        Authorization: `Bearer ${token}`,
        Accept: "image/avif,image/webp,image/png,*/*",
      });
      if (result) {
        return new NextResponse(result.buffer, {
          headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    }

    // Strategy 2: tmp_url direct download (pre-signed, no auth needed)
    if (tmpUrl) {
      console.log(`[image-proxy] Falling back to tmp_url`);
      const result = await fetchAsImage(tmpUrl, {
        Accept: "image/avif,image/webp,image/png,*/*",
      });
      if (result) {
        return new NextResponse(result.buffer, {
          headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    }

    console.error(`[image-proxy] All strategies failed`);
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: 502 }
    );
  } catch (e) {
    console.error(`[image-proxy] EXCEPTION: ${e instanceof Error ? e.message : "unknown"}`);
    return NextResponse.json(
      { error: `Proxy error: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
