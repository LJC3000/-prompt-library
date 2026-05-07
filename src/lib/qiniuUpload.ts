import crypto from "node:crypto";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

/** URL-safe Base64 encode */
function urlsafeBase64(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Generate a Qiniu upload token without the qiniu SDK */
function generateUploadToken(key: string): string {
  const putPolicy = JSON.stringify({
    scope: `${bucket}:${key}`,
    expires: 7200,
  });

  const encodedPutPolicy = urlsafeBase64(Buffer.from(putPolicy, "utf-8"));
  const sign = crypto
    .createHmac("sha1", secretKey)
    .update(encodedPutPolicy)
    .digest();
  const encodedSign = urlsafeBase64(sign);

  return `${accessKey}:${encodedSign}:${encodedPutPolicy}`;
}

/** Upload a Buffer to Qiniu CDN, return the CDN URL */
export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  const token = generateUploadToken(key);

  const formData = new FormData();
  formData.set("token", token);
  formData.set("key", key);
  const uint8 = new Uint8Array(buffer);
  formData.set("file", new Blob([uint8]));

  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Qiniu upload failed: ${data.error}`);
  }

  return `http://${domain}/${data.key}`;
}

/** Fetch image dimensions from Qiniu via ?imageInfo */
export async function fetchImageInfo(
  qiniuUrl: string
): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(qiniuUrl + "?imageInfo", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const info = await res.json();
    if (info.width && info.height) return { w: info.width, h: info.height };
    return null;
  } catch {
    return null;
  }
}
