import crypto from "node:crypto";
import FormStream from "formstream";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

// Use SDK to generate token (HMAC logic matches exactly)
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

export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  const token = generateUploadToken(key);

  // Build multipart body using formstream (qiniu SDK's own multipart builder)
  const form = new FormStream();
  form.field("token", token);
  form.field("key", key);
  form.buffer("file", buffer, key, "image/png");

  // Collect stream into a Buffer
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    form.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    form.on("end", resolve);
    form.on("error", reject);
  });
  const formBuffer = Buffer.concat(chunks);

  // Send directly to zone-z2 (华南) — no region auto-detection
  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    headers: form.headers(),
    body: new Uint8Array(formBuffer),
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
