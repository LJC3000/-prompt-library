import { NextRequest, NextResponse } from "next/server";
import { createFeishuRecord, type CreatePromptFields } from "@/lib/feishuWrite";
import { clearPromptsCache } from "@/lib/feishu";

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
