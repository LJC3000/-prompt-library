import crypto from "node:crypto";
import FormData from "form-data";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

function urlsafeBase64(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateUploadToken(key: string): string {
  const deadline = Math.floor(Date.now() / 1000) + 7200;
  const putPolicy = JSON.stringify({
    scope: `${bucket}:${key}`,
    deadline,
  });

  const encodedPutPolicy = urlsafeBase64(Buffer.from(putPolicy, "utf-8"));
  const sign = crypto
    .createHmac("sha1", secretKey)
    .update(encodedPutPolicy)
    .digest();
  const encodedSign = urlsafeBase64(sign);

  return `${accessKey}:${encodedSign}:${encodedPutPolicy}`;
}

export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  const token = generateUploadToken(key);

  const formData = new FormData();
  formData.append("token", token);
  formData.append("key", key);
  formData.append("file", buffer, {
    filename: key,
    contentType: "image/png",
    knownLength: buffer.length,
  });

  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    headers: formData.getHeaders(),
    body: formData as any,
    signal: AbortSignal.timeout(120_000),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Qiniu upload failed: ${data.error}`);
  }

  return `http://${domain}/${data.key}`;
}

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
