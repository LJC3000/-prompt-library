import crypto from "node:crypto";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

function generateUploadToken(key: string): string {
  const encodedFlags = Buffer.from(
    JSON.stringify({
      scope: `${bucket}:${key}`,
      deadline: Math.floor(Date.now() / 1000) + 7200,
    })
  )
    .toString("base64")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");

  const sign = crypto
    .createHmac("sha1", secretKey)
    .update(encodedFlags)
    .digest("base64")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");

  return `${accessKey}:${sign}:${encodedFlags}`;
}

/**
 * Build a multipart/form-data body without external dependencies.
 * Fields: token, key, file (buffer).
 */
function buildMultipart(
  token: string,
  key: string,
  buffer: Buffer,
  fileName: string
): { body: Buffer; contentType: string } {
  const boundary = `----QiniuFormBoundary${Date.now().toString(36)}`;

  const parts: Buffer[] = [];

  // token field
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="token"\r\n\r\n`));
  parts.push(Buffer.from(`${token}\r\n`));

  // key field
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="key"\r\n\r\n`));
  parts.push(Buffer.from(`${key}\r\n`));

  // file field
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
    )
  );
  parts.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n`));

  // closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  const token = generateUploadToken(key);
  const { body, contentType } = buildMultipart(token, key, buffer, key);

  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(30_000),
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
