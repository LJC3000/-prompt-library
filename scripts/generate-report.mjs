#!/usr/bin/env node

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { writeFileSync } from "fs";
import { resolve } from "path";

const doc = new Document({
  sections: [
    {
      children: [
        // 封面
        new Paragraph({ spacing: { before: 2400 } }),
        new Paragraph({
          alignment: "center",
          children: [new TextRun({ text: "Prompt Library", size: 64, bold: true })],
        }),
        new Paragraph({
          alignment: "center",
          spacing: { after: 200 },
          children: [new TextRun({ text: "项目复盘报告", size: 48 })],
        }),
        new Paragraph({
          alignment: "center",
          spacing: { after: 1200 },
          children: [new TextRun({ text: "2026年5月3日", size: 24 })],
        }),

        // ============ 一 ============
        h1("一、项目概述"),
        p("Prompt Library 是一个 AI 图片 Prompt 灵感库，用于公司内部团队之间的 Prompt 共享与灵感激发。用户可以通过分类筛选、关键词搜索来浏览由 AI 生成的高质量效果图、分析图等建筑可视化作品，点击卡片查看完整 Prompt 文本和参考图。"),
        table([["维度", "详情"], ["技术栈", "Next.js (App Router) + TypeScript + Tailwind CSS + Framer Motion"], ["数据源", "飞书 Bitable（多维表格）"], ["图片存储", "七牛云 CDN（Kodo 对象存储）"], ["部署平台", "Vercel"], ["角色", "杰（独立开发者）+ 一仔（AI 协作者）"], ["开发周期", "约 2 周（迭代式）"]]),

        // ============ 二 ============
        h1("二、踩过的大坑（按时间线）"),

        h2("坑1：占位块全部显示 4:3 —— 数据问题不能用前端补丁"),
        h3("现象"),
        p("页面加载时，所有卡片的占位色块都显示 4:3 比例，等图片加载完成后才跳到正确比例。占位块的意义是「在网络请求期间保持页面布局稳定」，如果它显示错误比例，就完全失去了存在的价值。"),
        h3("错误的尝试"),
        p("我的第一反应是在 PromptCard.tsx 里修改渲染逻辑，等待图片 onLoad 之后再设置占位块比例。"),
        p("杰的反馈（原话）：「停！如果等待图片下载完才渲染占位块，占位块就失去了在网络请求期间占位的意义。」"),
        h3("根因分析"),
        p("飞书「七牛映射」字段中的图片数据，大部分条目只有 url 字段，缺少 w（宽度）和 h（高度）。前端代码在 aspectRatio 缺失时 fallback 到硬编码的 \"4/3\"。"),
        h3("正确解法"),
        p("放弃前端 workaround，写一个数据修复脚本 fix-dimensions.mjs，从源头补齐所有图片的宽高数据。"),
        bullets([
          "遍历飞书所有记录，扫描七牛映射中的脏数据",
          "通过 HTTP Range 请求获取图片头部二进制数据",
          "解析 PNG / JPEG / GIF / WebP 格式的宽高",
          "将补全后的数据写回飞书",
        ]),
        h3("关键教训"),
        p("数据层的问题必须在数据层解决。前端打补丁只能掩盖问题，还会引入新的边界情况。杰对架构分层有清晰的直觉——这不是技术问题，是判断力问题。"),

        h2("坑2：七牛测试域名不支持 ?imageInfo API"),
        h3("现象"),
        p("修复脚本的初版使用七牛官方 ?imageInfo JSON API 获取图片尺寸，结果 72 个脏条目中 68 个失败。API 返回的是原始图片二进制数据，而非 JSON 元数据。"),
        h3("根因"),
        p("项目使用的七牛测试域名（hn-bkt.clouddn.com）不支持图片处理相关 API。?imageInfo、?imageMogr2 等参数都会被忽略，直接返回原始图片。这是七牛测试环境与生产环境的能力差异。"),
        h3("解决路径"),
        p("放弃依赖服务端 API，改为纯客户端二进制解析方案："),
        bullets([
          "使用 HTTP Range 请求（bytes=0-8191）只下载图片头部 8192 字节",
          "编写 probeDimensions() 函数，解析各图片格式的二进制头部",
          "PNG：magic bytes 0x89 + \"PNG\"，IHDR chunk offset 16/20 读取 u32BE",
          "JPEG：magic FF D8 FF，扫描 SOF marker (FF C0-C3)，offset +5/+7 读取 u16BE",
          "GIF：magic \"GIF87a\"/\"GIF89a\"，offset 6/8 读取 u16LE",
          "WebP：RIFF + WEBP 容器，需区分 VP8 (lossy) / VP8L (lossless) / VP8X (extended) 三种子格式，各有不同的宽高编码方式",
        ]),
        p("最终结果：72 个脏条目修复 70 个，2 个因为七牛上文件 404 无法获取。"),
        h3("额外收获"),
        p("发现项目中存在大量被命名为 .png 但实际格式是 WebP 的图片。二进制探测的好处是直接读 magic bytes，不会被文件扩展名误导。"),

        h2("坑3：PromptCard 刷新期间仍出现 4:3 闪烁"),
        h3("现象"),
        p("数据修复完成后，页面首次加载正常了。但卡片仍然会经历「原图比例 → 4:3 → 原图比例」的闪烁。发生在图片 URL 过期刷新（refreshTmpUrl）或 sourceMode 切换的回退路径中。"),
        h3("根因"),
        p("PromptCard.tsx 第 190 行，imgSrc 为 null 时走 ELSE 分支，硬编码了 aspectRatio: \"4/3\"。而此时 ratio 这个 useState 实际上保持着正确的值（因为 setRatio 只在 handleLoad 中调用，imgSrc 变化不会触发重置），但代码没有使用它。"),
        h3("修复"),
        p("一行代码：style={{ aspectRatio: ratio ? String(ratio) : \"4/3\", backgroundColor: bgColor }}——把硬编码的 \"4/3\" 改为优先取 ratio 状态。"),
        h3("关键教训"),
        p("useState 的值在组件不卸载的情况下不会自动重置。硬编码的 fallback 值是万恶之源，永远优先用已有的动态状态。"),

        h2("坑4：模态框占位块「出现→消失→再出现」的跳动"),
        h3("现象"),
        p("打开模态框时，占位色块闪现一瞬间后就消失了，过一会儿又突然出现，整个过程跳动非常大。"),
        h3("根因"),
        p("模态框主图容器的挂载条件是 {mainImgSrc && ...}。mainImgSrc 的计算依赖于多个异步因素：preloadedUrls 异步到达、sourceMode 状态切换、refreshTmpUrl 异步刷新临时 URL。当 mainImgSrc 经历 URL → null → URL 的转换，React 直接卸载再重建整个容器 DOM。"),
        h3("修复"),
        p("将容器挂载条件从 mainImgSrc 改为稳定的 prompt.results?.[0]：容器始终挂载（只要有结果图），<img> 在容器内部条件渲染，容器的 aspectRatio 和 backgroundColor 保持稳定。"),
        h3("关键教训"),
        p("React 条件渲染时，要区分「容器何时应该存在」和「内容何时应该显示」——这两个条件往往是不同的。容器的生命周期应该绑定到稳定的数据标识，内容的可见性才绑定到加载状态。"),

        h2("坑5：共享元素动画版本的探索与回滚"),
        h3("背景"),
        p("在完成 Spring 动画版本后，杰觉得「动感不足」，希望尝试更激进的方案。我提出了 Framer Motion Shared Element + Sliding Drawer 的架构重构。"),
        h3("做了什么"),
        bullets([
          "双 layoutId 系统：卡片和模态框通过 card-xxx 和 image-xxx 两组 layoutId 建立共享元素关系",
          "遮罩层和模态框主体拆为兄弟节点（独立 GPU 合成层，互不触发重绘）",
          "图片使用独立 layoutId 轨道飞行，避免拉伸变形（苹果级丝滑的秘密）",
          "文字区域用 delayed spring 抽屉滑入（图片先飞，文字后出）",
          "LayoutGroup 包裹卡片列表和模态框，建立 layoutId 通信域",
          "涉及 PromptCard.tsx、PromptModal.tsx、page.tsx 三个文件的完整重写",
        ]),
        h3("杰的反馈"),
        p("「这个版本非常有意思，但是需要时间去打磨，还有很多细节要调整。你先把这个保存下来，等我以后有时间再拿出来改。」"),
        h3("处理方式"),
        bullets([
          "创建 shared-element-animation 分支保存完整代码",
          "master 回滚到 Spring 动画版本作为阶段成果",
          "两个版本都推送到 GitHub，互不干扰",
        ]),
        h3("关键教训"),
        p("这是一个正确的架构方向，但激进的重构需要比预期更多的时间来打磨细节（缓动曲线、图片加载与 layoutId 时序、prev/next 过渡、响应式行为等）。杰展现了成熟的「阶段性交付」思维：先锁定一个稳定里程碑，实验工作另开分支，不阻塞主线。"),

        // ============ 三 ============
        h1("三、技术架构亮点"),

        h2("3.1 图片加载链路"),
        p("一个精心设计的三级降级链路："),
        bullets([
          "第1级：24h 预加载直链（batchPreloadUrls），数据到达后后台批量刷新，不阻塞渲染",
          "第2级：临时 URL（tmp_url），飞书 API 返回的短效链接",
          "第3级：七牛代理（/api/image），飞书 URL 全部过期后的最后兜底",
          "超时保护：10 秒未加载自动触发下一级降级",
          "IntersectionObserver：只加载视口附近（rootMargin 200px）的图片，节省带宽",
          "失败恢复：onError → triggerRefresh → 重新获取 tmp_url → 再次失败 → proxy → 最终 failed",
        ]),

        h2("3.2 数据修复脚本的二进制解析"),
        p("fix-dimensions.mjs 的设计亮点："),
        bullets([
          "不下载完整图片——Range 请求仅下载头部 8192 字节",
          "不信任文件扩展名——直接读 magic bytes 判断真实格式",
          "WebP 三种子格式各用不同解析逻辑",
          "飞书 API token 缓存和自动续期",
          "支持 --dry-run 模式先预览再执行",
          "批量回写间隔 150ms 避免 API 限流",
        ]),

        h2("3.3 动画与性能"),
        bullets([
          "Spring 动画 vs tween：物理动画天然多关键帧，不会出现「只有两段」的问题",
          "will-change: transform, opacity：强制开启 GPU 独立合成层",
          "遮罩层和内容层保持兄弟节点：防止子元素重绘触发父元素 backdrop-filter 重计算",
          "backdrop-blur 保留：在 GPU 合成层上执行，不参与飞行元素的 layout 计算",
        ]),

        // ============ 四 ============
        h1("四、与杰的沟通协作反思"),

        h3("做得好的"),
        bullets([
          "分析先于行动：遇到问题先给根因分析报告，再提方案，最后写代码",
          "方案对比：给出多个方案并说明 trade-off，让杰选择而非我替他决定",
          "尊重否决：杰否决前端补丁方案时，立刻转向数据修复——不纠缠、不辩护",
          "白话沟通：用生活化比喻解释技术问题",
          "分支管理：实验性工作另开分支保存，主线保持可交付状态",
        ]),

        h3("需要改进的"),
        bullets([
          "第一次面对 4:3 问题时急于写前端代码，没有先做根因分析——违反了 Plan → Code → Review 流程",
          "共享元素重构时没有先征求杰的意见就全套实现——应该先在分支上做 MVP 再讨论",
          "在 backdrop-blur 问题上曾提出「牺牲 UI 换性能」的方案，被杰纠正——记住杰对视觉品质的要求优先级很高",
        ]),

        h3("杰的工作偏好"),
        bullets([
          "默认全权限：不需要逐条确认，直接执行",
          "喜欢动感强烈的动画效果，追求苹果级丝滑",
          "追求「极简、克制、高端的国际化风格」，杜绝廉价配色",
          "有准确的工程直觉：能判断问题属于数据层还是 UI 层",
          "成熟的交付观：知道什么时候锁定里程碑，什么时候开分支探索",
        ]),

        // ============ 五 ============
        h1("五、关键决策时间线"),
        table([
          ["阶段", "动作", "关键决策"],
          ["1", "卡片占位块 4:3", "否决前端补丁 → 写数据修复脚本"],
          ["2", "七牛 API 不可用", "二进制头部解析替代 ?imageInfo"],
          ["3", "WebP 解析失败", "补充 VP8/VP8L/VP8X 三格式支持"],
          ["4", "数据修复后仍有闪烁", "一行修复：ratio 替代硬编码"],
          ["5", "模态框占位跳动", "容器挂载条件与内容解耦"],
          ["6", "弹簧动画优化", "tween → spring + GPU 硬件加速"],
          ["7", "共享元素实验", "开分支探索 → 回滚 → 保留为后续方向"],
          ["8", "项目阶段完结", "Spring 版本作为阶段成果交付"],
        ]),

        // ============ 六 ============
        h1("六、后续可探索方向"),
        bullets([
          "共享元素动画打磨（shared-element-animation 分支）",
          "卡片 hover 态优化：3D tilt 或视差效果",
          "搜索体验：debounce 优化、搜索历史",
          "性能：图片 WebP/AVIF 自动转码、Service Worker 缓存",
          "数据分析：Prompt 使用统计、热门标签",
        ]),

        // 结语
        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({
          alignment: "center",
          children: [new TextRun({ text: "— 报告完 —", size: 22, italics: true })],
        }),
        new Paragraph({
          alignment: "center",
          spacing: { after: 400 },
          children: [new TextRun({ text: "杰 & 一仔 · 2026年5月3日", size: 20 })],
        }),
      ],
    },
  ],
});

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, text: t, spacing: { before: 480, after: 120 } }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, text: t, spacing: { before: 360, after: 80 } }); }
function h3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, text: t, spacing: { before: 200, after: 40 } }); }
function p(t) { return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 22 })] }); }
function bullets(items) {
  return items.map((t) => new Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: [new TextRun({ text: t, size: 22 })] }));
}
function table(rows) {
  const [header, ...body] = rows;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: header.map((c) => new TableCell({ width: { size: 100 / header.length, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 22 })] })] })) }),
      ...body.map((row) => new TableRow({ children: row.map((c) => new TableCell({ width: { size: 100 / row.length, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: c, size: 22 })] })] })) })),
    ],
  });
}

const buf = await Packer.toBuffer(doc);
writeFileSync(resolve(process.cwd(), "Prompt-Library-项目复盘报告.docx"), buf);
console.log("Done: Prompt-Library-项目复盘报告.docx");
