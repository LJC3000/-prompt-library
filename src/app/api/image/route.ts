import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

export async function GET(req: NextRequest) {
  const b64 = req.nextUrl.searchParams.get("b64");

  if (!b64) {
    return NextResponse.json({ error: "Missing b64" }, { status: 400 });
  }

  try {
    const targetUrl = decodeURIComponent(atob(b64));
    const token = await getTenantAccessToken();

    let res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "image/avif,image/webp,image/png,*/*",
      },
    });

    // Retry once with fresh token
    if (!res.ok) {
      const freshToken = await getTenantAccessToken();
      res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${freshToken}`,
          Accept: "image/avif,image/webp,image/png,*/*",
        },
      });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed: ${res.status}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
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
