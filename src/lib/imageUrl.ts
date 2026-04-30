import type { FeishuFile } from "@/types/prompt";

/**
 * Build a proxied image URL from a FeishuFile (Bearer auth).
 * Used as fallback when direct tmp_url fails.
 */
export function proxyUrl(file: FeishuFile | null | undefined): string | null {
  if (!file?.url) return null;
  return `/api/image?b64=${btoa(encodeURIComponent(JSON.stringify({ url: file.url, tmpUrl: file.tmp_url })))}`;
}

/**
 * Best-effort image source for a FeishuFile.
 * Uses tmp_url directly (no proxy, fast from China).
 * The component's onError handler will fall back to the proxied URL.
 */
export function imageSrc(file: FeishuFile | null | undefined): string | undefined {
  if (!file) return undefined;
  // Prefer tmp_url (pre-signed, direct download) over proxied url
  return file.tmp_url || proxyUrl(file) || undefined;
}
