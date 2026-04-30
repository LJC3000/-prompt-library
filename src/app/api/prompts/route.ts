import { NextResponse } from "next/server";
import { fetchPromptsFromFeishu } from "@/lib/feishu";

const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    const cards = await fetchPromptsFromFeishu();

    return NextResponse.json(
      { cards },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 2}`,
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch prompts:", error);
    return NextResponse.json(
      {
        cards: [],
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
