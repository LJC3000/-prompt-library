import crypto from "node:crypto";
import FormData from "form-data";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

function base64ToUrlSafe(v: string): string {
  return v.replace(/\//g, "_").replace(/\+/g, "-");
}

function urlsafeBase64Encode(jsonFlags: string): string {
  return base64ToUrlSafe(Buffer.from(jsonFlags, "utf-8").toString("base64"));
}

function hmacSha1(encodedFlags: string, secretKey: string): string {
  const hmac = crypto.createHmac("sha1", secretKey);
  hmac.update(encodedFlags);
  return hmac.digest("base64");
}

function generateUploadToken(key: string): string {
  const putPolicy = JSON.stringify({
    scope: `${bucket}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + 7200,
  });

  const encodedFlags = urlsafeBase64Encode(putPolicy);
  const encodedSign = base64ToUrlSafe(hmacSha1(encodedFlags, secretKey));

  return `${accessKey}:${encodedSign}:${encodedFlags}`;
}

/** Upload a Buffer to Qiniu CDN, return the CDN URL */
export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  const token = generateUploadToken(key);

  const form = new FormData();
  form.append("token", token);
  form.append("key", key);
  form.append("file", buffer, {
    filename: key,
    contentType: "image/png",
    knownLength: buffer.length,
  });

  const formBuffer = form.getBuffer();
  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    headers: {
      ...form.getHeaders(),
      "content-length": String(formBuffer.length),
    },
    body: new Uint8Array(formBuffer),
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
