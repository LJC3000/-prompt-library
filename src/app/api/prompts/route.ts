import { NextRequest, NextResponse } from "next/server";
import { fetchPromptsFromFeishu } from "@/lib/feishu";

export const revalidate = 300; // CDN 边缘缓存 5 分钟，连 Lambda 都不触发

// 内存热备份：CDN 未命中时跳过飞书直接返回
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000; // 5 分钟

export async function GET(request: NextRequest) {
  // 支持 ?_refresh=1 绕过缓存（上传成功后的 re-fetch）
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("_refresh") === "1";

  if (!forceRefresh && cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ cards: cache.data }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  }

  try {
    const cards = await fetchPromptsFromFeishu();
    cache = { data: cards, ts: Date.now() };

    return NextResponse.json(
      { cards },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch prompts:", error);
    // 缓存还在但过期了？用旧数据兜底，不崩溃
    if (cache) {
      return NextResponse.json(
        { cards: cache.data },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            "X-Warning": "stale-data",
          },
        }
      );
    }
    return NextResponse.json(
      { cards: [], error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
