#!/usr/bin/env node

/**
 * 七牛图片宽高修复脚本
 *
 * 遍历飞书记录，找出七牛映射中缺失宽高（w/h）的条目，
 * 通过 ?imageInfo 接口获取真实尺寸后回写到飞书。
 *
 * 用法: node scripts/fix-dimensions.mjs [--dry-run]
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── .env 加载 ──────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.log("[fix] 未找到 .env.local，使用系统环境变量");
  }
}

function loadConfig() {
  const missing = [];
  const get = (key) => {
    const v = process.env[key];
    if (!v) missing.push(key);
    return v;
  };

  const cfg = {
    feishu: {
      appId: get("FEISHU_APP_ID"),
      appSecret: get("FEISHU_APP_SECRET"),
      appToken: get("FEISHU_APP_TOKEN"),
      tableId: get("FEISHU_TABLE_ID"),
    },
    qiniu: { domain: get("QINIU_DOMAIN") },
  };

  if (missing.length) {
    console.error(`[fix] 缺少环境变量: ${missing.join(", ")}`);
    process.exit(1);
  }
  return cfg;
}

// ── 工具 ──────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options, retries = 3) {
  const staticOptions = { ...options };
  delete staticOptions.signal;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...staticOptions,
        signal: AbortSignal.timeout(30_000),
      });
      return res;
    } catch (e) {
      if (attempt < retries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`[fix] 重试 ${attempt + 1}/${retries} (${delay}ms)... ${e.message}`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
}

// ── 飞书 API ──────────────────────────────────

let _token = null;

async function getFeishuToken(cfg) {
  if (_token && _token.expiresAt > Date.now()) return _token.token;

  const res = await fetchWithRetry(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取飞书token失败: ${data.msg}`);

  _token = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  console.log(`[fix] 飞书 Access Token 已获取 (有效期 ${data.expire}s)`);
  return _token.token;
}

async function fetchAllRecords(cfg) {
  const token = await getFeishuToken(cfg);
  const allRecords = [];
  let pageToken;

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetchWithRetry(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.appToken}/tables/${cfg.tableId}/records?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.code !== 0) throw new Error(`拉取记录失败: ${data.msg}`);

    const items = data.data?.items ?? [];
    allRecords.push(...items);
    console.log(`[fix] 已拉取 ${allRecords.length} 条记录`);
    pageToken = data.data?.page_token;
  } while (pageToken);

  console.log(`[fix] 共 ${allRecords.length} 条记录`);
  return allRecords;
}

// ── 图片尺寸探测（二进制头部解析）────────────

/** 从 Buffer 中解析图片宽高，支持 PNG / JPEG / GIF / WebP */
function probeDimensions(buf) {
  if (!buf || buf.length < 30) return null;

  // PNG: magic 0x89 + "PNG", IHDR chunk: offset 16 = w(u32BE), 20 = h(u32BE)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  // GIF: "GIF87a" or "GIF89a", offset 6 = w(u16LE), 8 = h(u16LE)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }

  // JPEG: starts with FF D8 FF, scan for SOF marker (FF C0/C1/C2)
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    for (let i = 2; i < buf.length - 8; i++) {
      if (buf[i] === 0xFF && buf[i + 1] >= 0xC0 && buf[i + 1] <= 0xC3) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
    }
    return null;
  }

  // WebP: RIFF + WEBP container
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    const webpTag = buf.toString("ascii", 8, 12);
    if (webpTag !== "WEBP" || buf.length < 30) return null;

    const chunkTag = buf.toString("ascii", 12, 16);

    // VP8 (lossy key frame): find start code 0x9D 0x01 0x2A, then 14-bit w/h
    if (chunkTag === "VP8 ") {
      // Scan for start code within the first 8KB
      for (let i = 20; i < buf.length - 6; i++) {
        if (buf[i] === 0x9D && buf[i + 1] === 0x01 && buf[i + 2] === 0x2A) {
          const w = buf.readUInt16LE(i + 3) & 0x3FFF;
          const h = buf.readUInt16LE(i + 5) & 0x3FFF;
          if (w > 0 && h > 0) return { w, h };
        }
      }
    }

    // VP8L (lossless): signature 0x2F, then 28-bit w/h encoding
    if (chunkTag === "VP8L" && buf.length > 24) {
      if (buf[20] === 0x2F) {
        const val = buf.readUInt32LE(21);
        const w = (val & 0x3FFF) + 1;
        const h = ((val >> 14) & 0x3FFF) + 1;
        if (w > 0 && h > 0) return { w, h };
      }
    }

    // VP8X: contains CanvasWidth/Height at offset 24
    if (chunkTag === "VP8X" && buf.length > 30) {
      // bytes 24-26 = 3-byte LE width_minus_one, 27-29 = 3-byte LE height_minus_one
      const w = buf.readUIntLE(24, 3) + 1;
      const h = buf.readUIntLE(27, 3) + 1;
      if (w > 0 && h > 0) return { w, h };
    }
  }

  return null;
}

// ── 七牛 imageInfo（双模式兜底）───────────────

async function getImageInfo(url) {
  // 模式一：?imageInfo JSON API（某些七牛域名/配置下可用）
  try {
    const res = await fetch(url + "?imageInfo", { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const text = await res.text();
      try {
        const info = JSON.parse(text);
        if (info.width && info.height) return { w: info.width, h: info.height };
        // JSON 但不是 imageInfo 格式，fallthrough 到模式二
      } catch {
        // 不是 JSON（比如返回了原图二进制），fallthrough 到模式二
      }
    }
  } catch {
    // 网络错误，fallthrough
  }

  // 模式二：下载图片头部字节解析二进制格式
  try {
    // PNG 头部固定 33 字节即可，JPEG 可能需要扫描更多，取 8192 保险
    const HEAD_SIZE = 8192;
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${HEAD_SIZE - 1}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 200 && res.status !== 206) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    return probeDimensions(buf);
  } catch {
    return null;
  }
}

// ── 主流程 ────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[fix] DRY RUN 模式：只扫描不写入\n");

  loadEnv();
  const cfg = loadConfig();
  const startedAt = Date.now();

  console.log("[fix] 开始扫描缺失宽高的七牛映射\n");

  const token = await getFeishuToken(cfg.feishu);

  // 1. 拉取所有记录
  console.log("[fix] ── 第一步：拉取全部记录 ──");
  const records = await fetchAllRecords(cfg.feishu);

  // 2. 扫描脏数据
  console.log("\n[fix] ── 第二步：扫描脏数据 ──");

  let totalEntries = 0;
  let cleanEntries = 0;
  let dirtyEntries = 0;
  let stringFormatEntries = 0; // 旧字符串格式，需要升级
  let failedEntries = 0;

  const updates = []; // [{ recordId, mapping }] — 只记录有变更的
  const needsUpdate = new Set(); // 记录 ID，用于统计（与 dry-run 无关）

  for (const rec of records) {
    const fields = rec.fields ?? {};
    const rawMapping = fields["七牛映射"] ?? "";

    let mapping = {};
    if (typeof rawMapping === "string" && rawMapping.trim()) {
      try { mapping = JSON.parse(rawMapping); } catch { /* 解析失败跳过 */ }
    }

    if (Object.keys(mapping).length === 0) continue;

    let changed = false;

    for (const [token, value] of Object.entries(mapping)) {
      totalEntries++;

      // 旧字符串格式 → 需要转换为结构化格式
      if (typeof value === "string") {
        const info = await getImageInfo(value);
        if (info) {
          mapping[token] = { url: value, w: info.w, h: info.h };
          stringFormatEntries++;
          changed = true;
          console.log(`[fix]    🆙 ${token}: string → { url, ${info.w}×${info.h} }`);
        } else {
          mapping[token] = { url: value };
          stringFormatEntries++;
          failedEntries++;
          changed = true;
          console.log(`[fix]    ⚠️  ${token}: string → { url } (imageInfo 失败)`);
        }
        continue;
      }

      // 已经是结构化格式，检查是否有宽高
      if (value && typeof value === "object") {
        if (value.w && value.h) {
          cleanEntries++;
        } else {
          // 有 url 但没宽高 → 需要修复
          dirtyEntries++;
          const qiniuUrl = value.url;
          if (!qiniuUrl) {
            console.log(`[fix]    ⚠️  ${token}: 无 url 字段，跳过`);
            failedEntries++;
            continue;
          }

          const info = await getImageInfo(qiniuUrl);
          if (info) {
            mapping[token] = { ...value, w: info.w, h: info.h };
            changed = true;
            console.log(`[fix]    ✅ ${token}: ${info.w}×${info.h} 补全`);
          } else {
            failedEntries++;
            console.log(`[fix]    ⚠️  ${token}: imageInfo 失败 (${qiniuUrl})`);
          }
        }
        continue;
      }

      // 未知格式
      failedEntries++;
      console.log(`[fix]    ⚠️  ${token}: 未知格式 (${typeof value})`);
    }

    if (changed) {
      needsUpdate.add(rec.record_id);
      if (!dryRun) {
        updates.push({ recordId: rec.record_id, mapping });
      }
    }
  }

  // 统计
  const fixedCount = dirtyEntries + stringFormatEntries - failedEntries;
  console.log(`\n[fix] ── 统计 ──`);
  console.log(`[fix]    总条目: ${totalEntries}`);
  console.log(`[fix]    ✅ 已有宽高: ${cleanEntries}`);
  console.log(`[fix]    🔧 本次修复: ${fixedCount}`);
  console.log(`[fix]    ❌ 无法获取: ${failedEntries}`);
  console.log(`[fix]    📝 需回写记录: ${needsUpdate.size} 条`);

  if (dirtyEntries + stringFormatEntries === 0) {
    console.log("\n[fix] ✨ 没有需要修复的条目");
    console.log(`[fix] ⏱️  耗时: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return;
  }

  if (failedEntries > 0 && fixedCount === 0) {
    console.log("\n[fix] ⚠️ 所有脏数据都无法获取尺寸，无可回写");
    console.log(`[fix] ⏱️  耗时: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return;
  }

  // 3. 回写飞书
  console.log(`\n[fix] ── 第三步：回写 ${updates.length} 条记录到飞书 ──`);

  if (dryRun) {
    console.log("[fix] DRY RUN — 跳过写入");
    for (const { recordId, mapping } of updates) {
      const keys = Object.keys(mapping);
      console.log(`[fix]    将更新 ${recordId}: ${keys.length} 个映射`);
    }
  } else {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < updates.length; i++) {
      const { recordId, mapping } = updates[i];

      try {
        const res = await fetchWithRetry(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.feishu.appToken}/tables/${cfg.feishu.tableId}/records/${recordId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fields: { 七牛映射: JSON.stringify(mapping) },
            }),
          }
        );
        const data = await res.json();
        if (data.code === 0) {
          success++;
          console.log(`[fix] ✅ [${i + 1}/${updates.length}] ${recordId}`);
        } else {
          failed++;
          console.log(`[fix] ❌ [${i + 1}/${updates.length}] ${recordId}: code=${data.code} msg=${data.msg}`);
        }
      } catch (e) {
        failed++;
        console.log(`[fix] ❌ [${i + 1}/${updates.length}] ${recordId}: ${e.message}`);
      }

      if (i < updates.length - 1) await sleep(150);
    }

    console.log(`\n[fix] ── 回写完成 ──`);
    console.log(`[fix]    ✅ 成功: ${success}  ❌ 失败: ${failed}`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[fix] ⏱️  总耗时: ${elapsed}s`);
}

main().catch((e) => {
  console.error(`[fix] 致命错误:`, e);
  process.exit(1);
});
