import type { FeishuFile } from "@/types/prompt";

/**
 * 如果是七牛云 URL，拼接 WebP 实时转换参数。
 * 七牛 CDN 会缓存转换结果，后续请求跟静态文件一样快。
 */
export function toWebp(url: string): string {
  if (url.includes("clouddn.com") || url.includes("qiniucdn.com") || url.includes("qnssl.com")) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "imageMogr2/format/webp";
  }
  return url;
}

/**
 * Build a proxied image URL from a FeishuFile (Bearer auth via server).
 * Used as fallback when direct tmp_url fails and refresh also fails.
 */
export function proxyUrl(file: FeishuFile | null | undefined): string | null {
  if (!file?.url) return null;
  const params = new URLSearchParams();
  params.set("url", file.url);
  return `/api/image?${params.toString()}`;
}

/** Check if a URL uses Feishu internal domain (not reachable from browser) */
function isFeishuInternalUrl(url: string): boolean {
  return url.includes("internal-api-drive-stream.feishu.cn");
}

/**
 * Full-resolution image source for Modal.
 * Priority: 飞书tmp_url(非内网) > 七牛 > API代理(服务端Bearer)
 */
export function imageSrc(file: FeishuFile | null | undefined): string | undefined {
  if (!file) return undefined;
  if (file.tmp_url && !isFeishuInternalUrl(file.tmp_url)) return file.tmp_url;
  if (file.qiniu_url) {
    if (file.qiniu_url.startsWith("https://")) return toWebp(file.qiniu_url);
    return `/api/qiniu-proxy?url=${encodeURIComponent(toWebp(file.qiniu_url))}`;
  }
  return proxyUrl(file) || undefined;
}

/**
 * Thumbnail for card grid — Qiniu URL 带上缩略图参数，减少传输量。
 * 飞书 tmp_url 无法控制尺寸，走直连；七牛走代理 + thumbnail 400px。
 */
export function cardThumbSrc(file: FeishuFile | null | undefined): string | undefined {
  if (!file) return undefined;
  if (file.tmp_url && !isFeishuInternalUrl(file.tmp_url)) return file.tmp_url;
  if (file.qiniu_url) {
    if (file.qiniu_url.startsWith("https://")) {
      return toWebp(file.qiniu_url) + "&imageMogr2/thumbnail/400x";
    }
    // 七牛 HTTP → 代理 + thumbnail + WebP 一步到位
    const thumbUrl = file.qiniu_url + "?imageMogr2/thumbnail/400x/format/webp";
    return `/api/qiniu-proxy?url=${encodeURIComponent(thumbUrl)}`;
  }
  return proxyUrl(file) || undefined;
}

// ── tmp_url refresh (batch, deduplicated) ──────────────────────

interface RefreshItem {
  fileToken: string;
  extra?: string;
  resolve: (url: string | null) => void;
}

let refreshQueue: RefreshItem[] = [];
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function flushRefreshQueue() {
  const batch = refreshQueue;
  refreshQueue = [];
  refreshTimer = null;

  // 按 extra 分组（相同 extra 可以一次请求）
  const groups = new Map<string, string[]>();
  for (const item of batch) {
    const key = item.extra ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item.fileToken);
  }

  // 用 Map 暂存所有结果：fileToken → url
  const resultMap = new Map<string, string | null>();

  Promise.all(
    Array.from(groups.entries()).map(async ([extra, tokens]) => {
      try {
        const res = await fetch("/api/refresh-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileTokens: tokens, extra: extra || undefined }),
        });
        const data = await res.json();
        const urls: Record<string, string> = data.urls ?? {};
        for (const ft of tokens) {
          resultMap.set(ft, urls[ft] && !urls[ft].includes("internal-api-drive-stream.feishu.cn") ? urls[ft] : null);
        }
      } catch {
        for (const ft of tokens) resultMap.set(ft, null);
      }
    })
  ).then(() => {
    for (const item of batch) {
      item.resolve(resultMap.get(item.fileToken) ?? null);
    }
  });
}

/**
 * Request a fresh tmp_url for a file. Batches requests within 200ms window.
 * Accepts optional extra param for advanced bitable permissions.
 * Returns the new tmp_url or null if refresh failed.
 */
export function refreshTmpUrl(
  fileToken: string,
  extra?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    refreshQueue.push({ fileToken, extra, resolve });
    if (!refreshTimer) {
      refreshTimer = setTimeout(flushRefreshQueue, 200);
    }
  });
}

/**
 * Preload all image URLs in parallel immediately after data arrives.
 * Returns a map of file_token → 24h tmp_url for direct use.
 * Deduplicates by file_token. Each batch of 5 sends one request.
 */
export async function batchPreloadUrls(
  files: Array<{ file_token: string; extra?: string }>
): Promise<Record<string, string>> {
  const seen = new Set<string>();
  const unique = files.filter((f) => {
    if (!f.file_token || seen.has(f.file_token)) return false;
    seen.add(f.file_token);
    return true;
  });
  if (unique.length === 0) return {};

  const groups = new Map<string, string[]>();
  for (const f of unique) {
    const key = f.extra ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f.file_token);
  }

  const result = new Map<string, string>();

  await Promise.all(
    Array.from(groups.entries()).map(async ([extra, tokens]) => {
      for (let i = 0; i < tokens.length; i += 5) {
        const batch = tokens.slice(i, i + 5);
        try {
          const res = await fetch("/api/refresh-urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileTokens: batch, extra: extra || undefined }),
          });
          const data = await res.json();
          const urls: Record<string, string> = data.urls ?? {};
          for (const ft of Object.keys(urls)) {
            if (urls[ft] && !urls[ft].includes("internal-api-drive-stream.feishu.cn"))
              result.set(ft, urls[ft]);
          }
        } catch {
          // skip failed batch
        }
      }
    })
  );

  return Object.fromEntries(result);
}
