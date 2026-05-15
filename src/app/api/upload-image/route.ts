import { NextRequest, NextResponse } from "next/server";
import { uploadImageToQiniu, fetchImageInfo } from "@/lib/qiniuUpload";
import { uploadImageToFeishu } from "@/lib/feishuUpload";

export const maxDuration = 120; // 2 min timeout for large images

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10MB after compression)" },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract extension from filename
    const ext = file.name.split(".").pop() ?? "png";
    const fileTokenKey = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to Qiniu (optional — Vercel 没有七牛配置时自动跳过)
    let qiniuUrl: string | null = null;
    try {
      qiniuUrl = await uploadImageToQiniu(buffer, fileTokenKey);
    } catch (e) {
      console.log(`[upload-image] Qiniu skipped: ${e instanceof Error ? e.message : "unknown"}`);
    }

    // Get image dimensions from Qiniu (only if uploaded)
    let info: { w: number; h: number } | null = null;
    if (qiniuUrl) {
      info = await fetchImageInfo(qiniuUrl);
    }

    // Upload to Feishu for attachment field reference (optional)
    let feishuFileToken: string | null = null;
    try {
      const mimeType = file.type || "image/png";
      feishuFileToken = await uploadImageToFeishu(buffer, file.name, mimeType);
    } catch (e) {
      console.log(`[upload-image] Feishu skipped: ${e instanceof Error ? e.message : "unknown"}`);
    }

    return NextResponse.json({
      file_token: feishuFileToken,
      qiniu_url: qiniuUrl,
      w: info?.w ?? null,
      h: info?.h ?? null,
    });
  } catch (error) {
    console.error("[upload-image] Failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown upload error",
      },
      { status: 500 }
    );
  }
}
