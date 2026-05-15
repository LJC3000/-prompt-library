import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/feishu";

type ImageResult = { stream: ReadableStream<Uint8Array>; contentType: string; contentLength: number };

/**
 * Token bucket rate limiter — 精确限制 5 请求/秒（飞书频控等级 6）
 * 令牌不足时排队等待，避免触发飞书 99991400 限流。
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private waitQueue: Array<() => void> = [];

  constructor(private maxTokens: number, private refillPerSecond: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /** 消耗一个令牌，不够则等待 */
  async consume(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // 队列中等待
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /** 释放一个令牌（请求完成后调用） */
  release(): void {
    this.tokens = Math.min(this.tokens + 1, this.maxTokens);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = Math.floor(elapsed * this.refillPerSecond);
    if (newTokens > 0) {
      this.tokens = Math.min(this.tokens + newTokens, this.maxTokens);
      this.lastRefill = now;
    }
  }
}

const bucket = new TokenBucket(5, 5); // 最多 5 个令牌，每秒补充 5 个

/**
 * In-flight deduplication: 同一 URL 并发请求只 fetch 一次
 */
const inflightMap = new Map<string, Promise<ImageResult | null>>();

async function fetchAsImageStream(
  url: string,
  headers: Record<string, string>,
  timeout: number
): Promise<ImageResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`[image-proxy] ${res.status} for ${url.substring(0, 80)} — ${text.substring(0, 200)}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      console.log(`[image-proxy] Non-image content-type: ${contentType} for ${url.substring(0, 80)}`);
      return null;
    }

    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (!res.body) return null;

    console.log(`[image-proxy] OK ${contentType} ${contentLength}bytes (streaming)`);
    return { stream: res.body, contentType, contentLength };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      console.log(`[image-proxy] Timeout for ${url.substring(0, 80)}`);
    } else if (e instanceof DOMException && e.name === "AbortError") {
      console.log(`[image-proxy] Aborted for ${url.substring(0, 80)}`);
    } else {
      console.log(`[image-proxy] Error: ${e instanceof Error ? e.message : "unknown"}`);
    }
    return null;
  }
}

/** 重试 + 指数退避 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeout: number,
  retries: number
): Promise<ImageResult | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
      console.log(`[image-proxy] retry ${attempt + 1}/${retries} for ${url.substring(0, 80)} — waiting ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
    const result = await fetchAsImageStream(url, headers, timeout);
    if (result) return result;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || undefined;

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  // 去重：同一 URL 正在请求中则复用结果
  if (inflightMap.has(url)) {
    const result = await inflightMap.get(url)!;
    if (result) {
      return new NextResponse(result.stream, {
        headers: {
          "Content-Type": result.contentType,
          "Content-Length": String(result.contentLength),
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 504 });
  }

  const promise = (async (): Promise<ImageResult | null> => {
    // 令牌桶限流：确保每秒不超过 5 个请求到飞书
    await bucket.consume();
    try {
      const token = await getTenantAccessToken();
      return await fetchWithRetry(url, {
        Authorization: `Bearer ${token}`,
        Accept: "image/avif,image/webp,image/png,image/*,*/*",
      }, 8_000, 1);
    } finally {
      bucket.release();
    }
  })();

  inflightMap.set(url, promise);
  promise.finally(() => inflightMap.delete(url));

  const result = await promise;
  if (result) {
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.contentLength),
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  }

  console.error(`[image-proxy] Failed to fetch image`);
  return NextResponse.json({ error: "Failed to fetch image" }, { status: 504 });
}
