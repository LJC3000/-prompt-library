import { getTenantAccessToken } from "@/lib/feishu";

const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN!;

/**
 * Upload an image to Feishu drive via upload_all API.
 * Returns the file_token that can be used in bitable attachment fields.
 */
export async function uploadImageToFeishu(
  buffer: Buffer,
  fileName: string,
  mimeType = "image/png"
): Promise<string> {
  const token = await getTenantAccessToken();

  const formData = new FormData();
  formData.append("file_name", fileName);
  formData.append("parent_type", "bitable_file");
  formData.append("parent_node", FEISHU_APP_TOKEN);
  formData.append("size", String(buffer.length));
  const uint8 = new Uint8Array(buffer);
  formData.append("file", new Blob([uint8], { type: mimeType }), fileName);

  const res = await fetch(
    "https://open.feishu.cn/open-apis/drive/v1/medias/upload_all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: AbortSignal.timeout(120_000),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu upload failed: code=${data.code} msg=${data.msg}`);
  }

  return data.data.file_token;
}
