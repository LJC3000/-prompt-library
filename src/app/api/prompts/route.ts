import { NextResponse } from "next/server";
import { fetchPromptsFromFeishu } from "@/lib/feishu";

// 内存缓存：避免每次请求都等飞书 6 秒
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000; // 5 分钟

export async function GET() {
  // 缓存命中直接返回
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
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
