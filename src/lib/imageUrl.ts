import type { FeishuFile } from "@/types/prompt";

/**
 * Build a proxied image URL from a FeishuFile.
 * Encodes both url (Bearer proxy) and tmp_url (direct fallback) as JSON.
 */
export function imageProxyUrl(file: FeishuFile | null | undefined): string | null {
  if (!file?.url) return null;
  return `/api/image?b64=${btoa(encodeURIComponent(JSON.stringify({ url: file.url, tmpUrl: file.tmp_url })))}`;
}
