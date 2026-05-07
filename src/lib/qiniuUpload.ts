import crypto from "node:crypto";

const accessKey = process.env.QINIU_AK!;
const secretKey = process.env.QINIU_SK!;
const bucket = process.env.QINIU_BUCKET!;
const domain = process.env.QINIU_DOMAIN!;

export async function uploadImageToQiniu(
  buffer: Buffer,
  key: string
): Promise<string> {
  // Dynamic import to avoid Turbopack build issue with qiniu SDK's proxy-agent dep
  const qiniu = await import("qiniu");
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: `${bucket}:${key}`,
    expires: 7200,
  });
  const uploadToken = putPolicy.uploadToken(mac);

  // Use the SDK's form uploader directly (handles multipart correctly)
  const config = new qiniu.conf.Config();
  config.zone = qiniu.zone.Zone_z2; // 华南-广东
  const formUploader = new qiniu.form_up.FormUploader(config);
  const putExtra = new qiniu.form_up.PutExtra();

  return new Promise((resolve, reject) => {
    formUploader.put(uploadToken, key, buffer, putExtra, (err, body, info) => {
      if (err) {
        reject(new Error(`Qiniu upload failed: ${err.message}`));
        return;
      }
      if (info.statusCode !== 200) {
        reject(
          new Error(
            `Qiniu upload failed: ${body?.error || `HTTP ${info.statusCode}`}`
          )
        );
        return;
      }
      resolve(`http://${domain}/${body.key}`);
    });
  });
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
