import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    const imgRes = await fetch(decodedUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,*/*",
      },
    });

    if (!imgRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image, status ${imgRes.status}` },
        { status: 502 }
      );
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/png";
    const buffer = await imgRes.arrayBuffer();

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
