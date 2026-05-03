/**
 * 飞书附件 → 七牛云 同步脚本
 *
 * 用法: node scripts/sync-qiniu.mjs [--dry-run]
 */

// 解决 Windows 证书吊销检查网络不通的问题
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import qiniu from "qiniu";

// ── 本地映射备份 ──────────────────────────────
// 当飞书写入失败时，映射关系不会丢失，下次跑可跳过已上传的文件

const BACKUP_PATH = resolve(process.cwd(), "scripts/.qiniu-cache.json");

function loadLocalBackup() {
  try {
    if (existsSync(BACKUP_PATH)) {
      return JSON.parse(readFileSync(BACKUP_PATH, "utf8"));
    }
  } catch {}
  return {};
}

function saveLocalBackup(data) {
  try {
    writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.log(`[sync] ⚠️  本地备份写入失败: ${e.message}`);
  }
}

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
    console.log("[sync] 未找到 .env.local，使用系统环境变量");
  }
}

// ── 配置 ──────────────────────────────────────

function loadConfig() {
  const c = {
    feishu: {
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      appToken: process.env.FEISHU_APP_TOKEN,
      tableId: process.env.FEISHU_TABLE_ID,
    },
    qiniu: {
      accessKey: process.env.QINIU_AK,
      secretKey: process.env.QINIU_SK,
      bucket: process.env.QINIU_BUCKET,
      domain: process.env.QINIU_DOMAIN,
    },
  };

  const missing = [];
  for (const [k, v] of Object.entries(c.feishu)) {
    if (!v) missing.push(`FEISHU_${k.toUpperCase()}`);
  }
  for (const [k, v] of Object.entries(c.qiniu)) {
    if (!v) missing.push(`QINIU_${k.toUpperCase()}`);
  }
  if (missing.length) {
    console.error(`[sync] ❌ 缺少环境变量: ${missing.join(", ")}`);
    process.exit(1);
  }
  return c;
}

// ── 工具 ──────────────────────────────────────

function extractExtra(url) {
  if (!url) return undefined;
  try {
    const qIdx = url.indexOf("?extra=");
    if (qIdx === -1) return undefined;
    return decodeURIComponent(url.slice(qIdx + 7));
  } catch {
    return undefined;
  }
}

function extFromName(name) {
  const parts = name.split(".");
  return parts.length > 1 ? "." + parts[parts.length - 1] : "";
}

function guessFilename(file) {
  if (file.name) return file.name;
  try {
    const path = new URL(file.url).pathname;
    const last = path.split("/").pop();
    return last || `${file.file_token}.jpg`;
  } catch {
    return `${file.file_token}.jpg`;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 网络请求重试 ──────────────────────────────

/** 带重试的 fetch，自动处理 TLS 断连等瞬时网络错误 */
async function fetchWithRetry(url, options, retries = 3) {
  let lastError;
  // 每次重试创建新的 AbortSignal（旧的可能已过期）
  const staticOptions = { ...options };
  delete staticOptions.signal;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...staticOptions,
        signal: AbortSignal.timeout(60_000),
      });
      return res;
    } catch (e) {
      lastError = e;
      if (attempt < retries - 1) {
        const delay = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
        console.log(`[sync] 🔁 第${attempt + 1}次请求失败，${delay / 1000}s 后重试... (${e.message})`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
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
      body: JSON.stringify({
        app_id: cfg.appId,
        app_secret: cfg.appSecret,
      }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取飞书token失败: ${data.msg}`);

  _token = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  console.log(`[sync] 🔑 飞书 Access Token 已获取 (有效期 ${data.expire}s)`);
  return _token.token;
}

async function fetchAllRecords(cfg) {
  const token = await getFeishuToken(cfg);
  const allRecords = [];
  let pageToken;
  let pageNum = 0;

  do {
    pageNum++;
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
    console.log(
      `[sync] 📋 第${pageNum}页: ${items.length} 条 (累计 ${allRecords.length})`
    );
    pageToken = data.data?.page_token;
  } while (pageToken);

  return allRecords;
}

async function refreshTmpUrls(fileTokens, extra, token) {
  const results = new Map();
  let done = 0;
  const total = fileTokens.length;

  for (let i = 0; i < total; i += 5) {
    const batch = fileTokens.slice(i, i + 5);
    try {
      const params = new URLSearchParams();
      for (const ft of batch) params.append("file_tokens", ft);
      if (extra) params.set("extra", extra);

      const res = await fetchWithRetry(
        `https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (data.code === 0 && data.data?.tmp_download_urls) {
        for (const item of data.data.tmp_download_urls) {
          if (item.tmp_download_url) results.set(item.file_token, item.tmp_download_url);
        }
      } else {
        console.log(`[sync] ⚠️  刷新链接失败: code=${data.code} msg=${data.msg}`);
      }
      done += batch.length;
      console.log(`[sync] 🔄 刷新进度: ${Math.min(done, total)}/${total}`);
    } catch (e) {
      console.log(`[sync] ⚠️  刷新异常: ${e instanceof Error ? e.message : "unknown"}`);
      done += batch.length;
    }

    if (i + 5 < total) await sleep(300);
  }

  return results;
}

// ── 七牛云 API（用官方 SDK 生成令牌）─────────

async function uploadToQiniu(buffer, key, cfg) {
  const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: `${cfg.bucket}:${key}`,
    expires: 7200,
  });
  const token = putPolicy.uploadToken(mac);

  // 每次重试都新建 FormData，因为 fetch 消费 body 后不可重用
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const formData = new FormData();
      formData.set("token", token);
      formData.set("key", key);
      formData.set("file", new Blob([new Uint8Array(buffer)]));

      const res = await fetch("https://up-z2.qiniup.com", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(`七牛上传失败: ${data.error}`);
      }

      return `http://${cfg.domain}/${data.key}`;
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        const delay = 2000 * (attempt + 1);
        console.log(`[sync] 🔁 上传重试 ${attempt + 1}/3 (${delay / 1000}s)...`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ── 下载 ──────────────────────────────────────

async function downloadFromTmpUrl(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 45_000);
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = await res.arrayBuffer();
      return Buffer.from(buf);
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        console.log(`[sync] 🔁 下载重试 ${attempt + 1}/3...`);
        await sleep(2000);
      }
    }
  }
  throw lastError;
}

// ── 七牛图片信息 ──────────────────────────────

/** 通过七牛 ?imageInfo 接口获取图片宽高，不下载整张图 */
async function getImageInfo(qiniuUrl) {
  try {
    const res = await fetch(qiniuUrl + "?imageInfo", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const info = await res.json();
    if (info.width && info.height) return { w: info.width, h: info.height };
    return null;
  } catch {
    return null;
  }
}

// ── 主流程 ────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[sync] 🧪 DRY RUN 模式：只扫描不写入\n");

  loadEnv();
  const cfg = loadConfig();
  const startedAt = Date.now();

  console.log(`[sync] 🚀 开始同步`);
  console.log(`[sync]    飞书表格: app=${cfg.feishu.appToken} table=${cfg.feishu.tableId}`);
  console.log(`[sync]    七牛空间: ${cfg.qiniu.bucket} | 域名: ${cfg.qiniu.domain}`);
  console.log("");

  const token = await getFeishuToken(cfg.feishu);

  // ── 1. 拉取全部记录 ──────────────────────
  console.log("[sync] ── 第一步：拉取飞书记录 ──");
  const records = await fetchAllRecords(cfg.feishu);

  // ── 2. 扫描附件 ──
  console.log("\n[sync] ── 第二步：扫描附件 ──");
  const localBackup = loadLocalBackup();

  const stats = { total: 0, new: 0, skipped: 0, success: 0, failed: 0 };

  const pendingByExtra = new Map();
  const recordMappings = new Map();

  for (const rec of records) {
    const fields = rec.fields ?? {};

    // 合并飞书字段 + 本地备份（本地优先，因为可能更新）
    let mapping = {};
    const rawMapping = fields["七牛映射"] ?? "";
    if (typeof rawMapping === "string" && rawMapping.trim()) {
      try { mapping = JSON.parse(rawMapping); } catch {}
    }
    // 本地备份覆盖（更完整的记录）
    const localMapping = localBackup[rec.record_id] ?? {};
    mapping = { ...mapping, ...localMapping };

    const allFiles = [
      ...(Array.isArray(fields["参考图片"]) ? fields["参考图片"] : []),
      ...(Array.isArray(fields["生成结果"]) ? fields["生成结果"] : []),
    ];

    let recNew = 0;
    let recSkip = 0;

    for (const file of allFiles) {
      if (!file.file_token) continue;
      stats.total++;
      if (mapping[file.file_token]) {
        stats.skipped++;
        recSkip++;
      } else {
        stats.new++;
        recNew++;
        const extra = extractExtra(file.url);
        const key = extra ?? "__no_extra__";
        if (!pendingByExtra.has(key)) pendingByExtra.set(key, []);
        pendingByExtra.get(key).push({ recordId: rec.record_id, file, extra });
      }
    }

    recordMappings.set(rec.record_id, mapping);

    if (recNew > 0 || recSkip > 0) {
      console.log(`[sync]    ${rec.record_id}: ${recNew} 新 / ${recSkip} 已同步`);
    }
  }

  console.log(`\n[sync] 📊 总计: ${stats.total} 个文件 (${stats.new} 新 / ${stats.skipped} 已同步)`);

  if (stats.new === 0) {
    console.log("[sync] ✨ 没有新文件，无需同步");
    console.log(`[sync] ⏱️  耗时: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return;
  }

  if (dryRun) {
    console.log(`\n[sync] 🧪 DRY RUN — 跳过后续步骤（刷新/下载/上传/写入）`);
    console.log(`[sync]    以上 ${stats.new} 个新文件将在正式运行时同步`);
    console.log(`[sync] ⏱️  耗时: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return;
  }

  // ── 3. 刷新飞书临时下载链接 ──
  console.log(`\n[sync] ── 第三步：刷新飞书临时下载链接 ──`);
  const tmpUrlMap = new Map();

  for (const [extra, files] of pendingByExtra) {
    const tokens = [...new Set(files.map((f) => f.file.file_token))];
    const extraParam = extra === "__no_extra__" ? undefined : extra;
    console.log(`[sync]    分组 extra=${extraParam ?? "(无)"}: ${tokens.length} 个唯一 token`);
    const refreshed = await refreshTmpUrls(tokens, extraParam, token);
    for (const [k, v] of refreshed) tmpUrlMap.set(k, v);
  }

  console.log(`[sync] ✅ 共获得 ${tmpUrlMap.size} 个临时下载链接`);

  // ── 4. 下载 + 上传 ──
  console.log(`\n[sync] ── 第四步：下载并上传到七牛云 ──`);
  const uploadedMap = new Map();

  let processed = 0;
  for (const [, files] of pendingByExtra) {
    for (const { recordId, file } of files) {
      processed++;

      if (uploadedMap.has(file.file_token)) {
        const existing = uploadedMap.get(file.file_token);
        recordMappings.get(recordId)[file.file_token] = existing;
        console.log(`[sync] ⏭️  [${processed}/${stats.new}] ${file.file_token} → 复用已上传`);
        stats.success++;
        continue;
      }

      const tmpUrl = tmpUrlMap.get(file.file_token);
      if (!tmpUrl) {
        console.log(`[sync] ❌ [${processed}/${stats.new}] ${file.file_token} → 无临时下载链接`);
        stats.failed++;
        continue;
      }

      try {
        console.log(`[sync] ⬇️  [${processed}/${stats.new}] 下载 ${file.file_token} (${(file.size / 1024).toFixed(0)} KB)`);
        const buffer = await downloadFromTmpUrl(tmpUrl);

        const key = file.file_token + extFromName(guessFilename(file));
        console.log(`[sync] ⬆️  [${processed}/${stats.new}] 上传 ${key} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
        const qiniuUrl = await uploadToQiniu(buffer, key, cfg.qiniu);

        // 获取图片宽高并存为结构化数据
        const info = await getImageInfo(qiniuUrl);
        const mapped = info
          ? { url: qiniuUrl, w: info.w, h: info.h }
          : { url: qiniuUrl };

        uploadedMap.set(file.file_token, mapped);
        recordMappings.get(recordId)[file.file_token] = mapped;
        stats.success++;

        // 每上传成功一个就立刻存本地备份
        localBackup[recordId] = recordMappings.get(recordId);
        if (processed % 5 === 0) saveLocalBackup(localBackup);

        console.log(`[sync] ✅ [${processed}/${stats.new}] ${file.file_token} → ${qiniuUrl} (${info ? info.w + '×' + info.h : '尺寸未知'})`);
      } catch (e) {
        stats.failed++;
        console.log(`[sync] ❌ [${processed}/${stats.new}] ${file.file_token} → ${e instanceof Error ? e.message : "unknown"}`);
      }

      if (processed < stats.new) await sleep(100);
    }
  }

  // 上传完成后存一次完整本地备份
  saveLocalBackup(localBackup);
  console.log(`[sync] 💾 本地备份已保存: ${BACKUP_PATH}`);

  // ── 5. 写回飞书 ──
  console.log(`\n[sync] ── 第五步：更新飞书记录 ──`);

  if (dryRun) {
    console.log("[sync] 🧪 DRY RUN — 跳过实际写入");
    for (const [recId, mapping] of recordMappings) {
      const count = Object.keys(mapping).length;
      if (count > 0) {
        console.log(`[sync]    将更新 ${recId}: ${count} 个映射`);
      }
    }
  } else {
    let updatedRecords = 0;
    for (const [recId, mapping] of recordMappings) {
      if (Object.keys(mapping).length === 0) continue;
      try {
        const res = await fetchWithRetry(
          `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.feishu.appToken}/tables/${cfg.feishu.tableId}/records/${recId}`,
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
          updatedRecords++;
          if (updatedRecords % 10 === 0 || updatedRecords <= 3) {
            console.log(`[sync] ✅ 已更新 ${updatedRecords} 条记录`);
          }
        } else {
          console.log(`[sync] ❌ 更新记录 ${recId} 失败: code=${data.code} msg=${data.msg}`);
        }
      } catch (e) {
        console.log(`[sync] ❌ 更新记录 ${recId} 异常: ${e instanceof Error ? e.message : "unknown"}`);
      }
      await sleep(100);
    }
    console.log(`[sync] ✅ 共更新 ${updatedRecords} 条记录`);
  }

  // ── 总结 ──
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[sync] ──────────────────────────────`);
  console.log(`[sync] 🎉 同步完成！`);
  console.log(`[sync]    总计: ${stats.total}   ✅ 成功: ${stats.success}   ⏭️  跳过: ${stats.skipped}   ❌ 失败: ${stats.failed}`);
  console.log(`[sync]    ⏱️  总耗时: ${elapsed}s`);
  if (dryRun) console.log("[sync]    🧪 DRY RUN — 未实际写入");
}

main().catch((e) => {
  console.error(`[sync] 💥 致命错误:`, e);
  process.exit(1);
});
