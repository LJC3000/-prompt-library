import { NextRequest, NextResponse } from "next/server";
import { createFeishuRecord, type CreatePromptFields } from "@/lib/feishuWrite";
import { clearPromptsCache } from "@/lib/feishu";

/** 触发 GitHub Actions workflow_dispatch，让同步脚本立即拉取新图片到七牛 */
async function triggerQiniuSync(): Promise<void> {
  const pat = process.env.GH_PAT;
  if (!pat) {
    console.log("[create-prompt] GH_PAT 未配置，跳过 GitHub Action 触发（七牛将在下次定时同步时更新）");
    return;
  }
  try {
    const res = await fetch(
      "https://api.github.com/repos/LJC3000/-prompt-library/actions/workflows/sync-qiniu.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
          "User-Agent": "prompt-library",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`[create-prompt] GitHub Action 触发失败: ${res.status} ${text.substring(0, 200)}`);
    } else {
      console.log("[create-prompt] ✅ GitHub Action sync-qiniu 已触发");
    }
  } catch (e) {
    console.log(`[create-prompt] GitHub Action 触发异常: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePromptFields = await request.json();

    // Validation
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "项目名称不能为空" },
        { status: 400 }
      );
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "提示词不能为空" }, { status: 400 });
    }
    if (!body.results?.length) {
      return NextResponse.json(
        { error: "至少上传一张生成结果图片" },
        { status: 400 }
      );
    }
    if (!body.imageTypes?.length) {
      return NextResponse.json(
        { error: "请选择至少一个图片类型" },
        { status: 400 }
      );
    }

    const recordId = await createFeishuRecord(body);

    // Clear server cache so next prompts fetch gets fresh data
    clearPromptsCache();

    // 触发七牛同步（不阻塞响应）
    triggerQiniuSync();

    return NextResponse.json({ success: true, record_id: recordId });
  } catch (error) {
    console.error("[create-prompt] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
