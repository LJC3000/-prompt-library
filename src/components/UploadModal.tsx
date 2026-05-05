"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import imageCompression from "browser-image-compression";

// ── Tag option presets ──

const IMAGE_TYPE_OPTIONS = [
  "效果图（低点）",
  "效果图（鸟瞰）",
  "分析图",
  "平面图",
  "总平面图",
];

const BUILDING_TYPE_OPTIONS = ["住宅", "商办", "教育", "工业", "公建", "其他"];

const WEATHER_TYPE_OPTIONS = ["白天", "黄昏", "夜晚", "阴天", "雨天"];

const DIAGRAM_TYPE_OPTIONS = [
  "剖面分析",
  "爆炸图分析",
  "概念分析",
  "区位分析",
];

// ── Upload result type ──

interface UploadedImage {
  file_token: string;
  qiniu_url: string;
  w: number | null;
  h: number | null;
}

// ── Props ──

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({
  open,
  onClose,
  onSuccess,
}: UploadModalProps) {
  // ── Text fields ──
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("");
  const [aiTool, setAiTool] = useState("");
  const [aiModel, setAiModel] = useState("");

  // ── Multi-select tags ──
  const [imageTypes, setImageTypes] = useState<string[]>([]);
  const [buildingTypes, setBuildingTypes] = useState<string[]>([]);
  const [weatherTypes, setWeatherTypes] = useState<string[]>([]);
  const [diagramTypes, setDiagramTypes] = useState<string[]>([]);

  // ── Image file state (compressed Files, for upload) ──
  const [resultFiles, setResultFiles] = useState<File[]>([]);
  const [refFiles, setRefFiles] = useState<File[]>([]);

  // ── Uploaded image metadata (after server confirms) ──
  const [uploadedResults, setUploadedResults] = useState<UploadedImage[]>([]);
  const [uploadedRefs, setUploadedRefs] = useState<UploadedImage[]>([]);

  // ── Upload status ──
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resultInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  // ── Reset state when modal opens ──
  useEffect(() => {
    if (open) {
      setTitle("");
      setContent("");
      setDepartment("");
      setAiTool("");
      setAiModel("");
      setImageTypes([]);
      setBuildingTypes([]);
      setWeatherTypes([]);
      setDiagramTypes([]);
      setResultFiles([]);
      setRefFiles([]);
      setUploadedResults([]);
      setUploadedRefs([]);
      setUploading(false);
      setStatusText("");
      setError(null);
    }
  }, [open]);

  // ── Toggle multi-select ──
  const toggleTag = useCallback(
    (arr: string[], setter: (v: string[]) => void, tag: string) => {
      setter(arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag]);
    },
    []
  );

  // ── Handle file selection with compression ──
  const handleFilesSelected = useCallback(
    async (
      fileList: FileList | null,
      target: "results" | "refs",
      existing: File[]
    ) => {
      if (!fileList) return;
      setError(null);

      const incoming: File[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          });
          incoming.push(compressed);
        } catch {
          // Fallback: use original if compression fails
          incoming.push(file);
        }
      }

      const merged = [...existing, ...incoming];
      if (target === "results") setResultFiles(merged);
      else setRefFiles(merged);
    },
    []
  );

  const removeFile = useCallback(
    (idx: number, target: "results" | "refs") => {
      if (target === "results") {
        setResultFiles((prev) => prev.filter((_, i) => i !== idx));
        setUploadedResults((prev) => prev.filter((_, i) => i !== idx));
      } else {
        setRefFiles((prev) => prev.filter((_, i) => i !== idx));
        setUploadedRefs((prev) => prev.filter((_, i) => i !== idx));
      }
    },
    []
  );

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validation
    if (!title.trim()) {
      setError("请输入项目名称");
      return;
    }
    if (!content.trim()) {
      setError("请输入提示词");
      return;
    }
    if (resultFiles.length === 0) {
      setError("请至少上传一张生成结果图片");
      return;
    }
    if (imageTypes.length === 0) {
      setError("请选择至少一个图片类型");
      return;
    }

    setUploading(true);

    try {
      // ── Step 1: Upload result images sequentially ──
      const newResults: UploadedImage[] = [];
      for (let i = 0; i < resultFiles.length; i++) {
        setStatusText(`正在上传图片 (${i + 1}/${resultFiles.length})...`);
        const formData = new FormData();
        formData.set("file", resultFiles[i]);
        const res = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "图片上传失败");
        newResults.push({
          file_token: data.file_token,
          qiniu_url: data.qiniu_url,
          w: data.w,
          h: data.h,
        });
      }
      setUploadedResults(newResults);

      // ── Step 2: Upload reference images sequentially ──
      const newRefs: UploadedImage[] = [];
      for (let i = 0; i < refFiles.length; i++) {
        setStatusText(`正在上传参考图片 (${i + 1}/${refFiles.length})...`);
        const formData = new FormData();
        formData.set("file", refFiles[i]);
        const res = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "参考图片上传失败");
        newRefs.push({
          file_token: data.file_token,
          qiniu_url: data.qiniu_url,
          w: data.w,
          h: data.h,
        });
      }
      setUploadedRefs(newRefs);

      // ── Step 3: Create Feishu record ──
      setStatusText("正在创建记录...");
      const createRes = await fetch("/api/create-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          department: department.trim() || undefined,
          aiTool: aiTool.trim() || undefined,
          aiModel: aiModel.trim() || undefined,
          imageTypes,
          buildingTypes,
          weatherTypes,
          diagramTypes,
          results: newResults,
          refImages: newRefs,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok)
        throw new Error(createData.error || "记录创建失败");

      setStatusText("");
      setUploading(false);
      onSuccess?.();
      onClose();
    } catch (err) {
      setUploading(false);
      setError(
        err instanceof Error ? err.message : "上传失败，请重试"
      );
      // Do NOT clear form data — retain for retry
    }
  }, [
    title,
    content,
    department,
    aiTool,
    aiModel,
    imageTypes,
    buildingTypes,
    weatherTypes,
    diagramTypes,
    resultFiles,
    refFiles,
    onSuccess,
    onClose,
  ]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={uploading ? undefined : onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 35,
              mass: 0.8,
            }}
            className="fixed inset-4 sm:inset-8 md:inset-auto md:top-[5vh] md:left-1/2 md:-translate-x-1/2 md:w-[720px] md:max-h-[90vh] z-[101] overflow-y-auto rounded-2xl bg-white shadow-xl border border-white/50"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={uploading ? undefined : onClose}
              disabled={uploading}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
              <h2 className="text-lg font-semibold text-zinc-900">
                添加新 Prompt
              </h2>
            </div>

            {/* Form */}
            <div className="px-6 py-4 space-y-5">
              {/* Text fields — 2-col grid on md+ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left column */}
                <div className="space-y-4">
                  <TextField
                    label="项目名称 *"
                    value={title}
                    onChange={setTitle}
                    placeholder="例如：深圳湾文化广场"
                  />
                  <TextField
                    label="提示词 *"
                    value={content}
                    onChange={setContent}
                    placeholder="输入完整的提示词文本..."
                    multiline
                    rows={4}
                  />
                  <TextField
                    label="部门"
                    value={department}
                    onChange={setDepartment}
                    placeholder="例如：方案二组"
                  />
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <TextField
                    label="AI工具"
                    value={aiTool}
                    onChange={setAiTool}
                    placeholder="Midjourney"
                  />
                  <TextField
                    label="AI模型"
                    value={aiModel}
                    onChange={setAiModel}
                    placeholder="V6"
                  />

                  {/* Multi-select: 图片类型 */}
                  <TagGroup
                    label="图片类型 *"
                    options={IMAGE_TYPE_OPTIONS}
                    selected={imageTypes}
                    onToggle={(tag) =>
                      toggleTag(imageTypes, setImageTypes, tag)
                    }
                  />

                  {/* Multi-select: 建筑类型 */}
                  <TagGroup
                    label="建筑类型"
                    options={BUILDING_TYPE_OPTIONS}
                    selected={buildingTypes}
                    onToggle={(tag) =>
                      toggleTag(buildingTypes, setBuildingTypes, tag)
                    }
                  />

                  {/* Multi-select: 光影天气 */}
                  <TagGroup
                    label="光影天气"
                    options={WEATHER_TYPE_OPTIONS}
                    selected={weatherTypes}
                    onToggle={(tag) =>
                      toggleTag(weatherTypes, setWeatherTypes, tag)
                    }
                  />

                  {/* Multi-select: 分析图类型 */}
                  <TagGroup
                    label="分析图类型"
                    options={DIAGRAM_TYPE_OPTIONS}
                    selected={diagramTypes}
                    onToggle={(tag) =>
                      toggleTag(diagramTypes, setDiagramTypes, tag)
                    }
                  />
                </div>
              </div>

              {/* ── Image upload areas ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 生成结果 */}
                <ImageDropZone
                  label="生成结果 *"
                  files={resultFiles}
                  onSelect={() => resultInputRef.current?.click()}
                  onRemove={(i) => removeFile(i, "results")}
                  disabled={uploading}
                  inputRef={resultInputRef}
                  inputId="result-upload"
                  onFileChange={(e) =>
                    handleFilesSelected(e.target.files, "results", resultFiles)
                  }
                />

                {/* 参考图片 */}
                <ImageDropZone
                  label="参考图片"
                  files={refFiles}
                  onSelect={() => refInputRef.current?.click()}
                  onRemove={(i) => removeFile(i, "refs")}
                  disabled={uploading}
                  inputRef={refInputRef}
                  inputId="ref-upload"
                  onFileChange={(e) =>
                    handleFilesSelected(e.target.files, "refs", refFiles)
                  }
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Status */}
              {statusText && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800" />
                  {statusText}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={uploading}
                className="px-5 py-2 text-sm font-medium text-white bg-[#1c1c1e] hover:bg-black rounded-xl transition-colors disabled:opacity-50"
              >
                {uploading ? "提交中..." : "提交"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ──

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const id = label.replace(/\s/g, "");
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-zinc-400 mb-1.5"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 3}
          className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      )}
    </div>
  );
}

function TagGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-zinc-400 mb-1.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`relative rounded-xl px-2.5 py-1 text-xs leading-none outline-none transition-colors ${
                active
                  ? "text-white font-medium"
                  : "text-zinc-400 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100"
              }`}
            >
              {active && (
                <div className="absolute inset-0 bg-[#1c1c1e] rounded-xl" />
              )}
              <span className="relative z-10">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageDropZone({
  label,
  files,
  onSelect,
  onRemove,
  disabled,
  inputRef,
  inputId,
  onFileChange,
}: {
  label: string;
  files: File[];
  onSelect: () => void;
  onRemove: (idx: number) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputId: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-zinc-400 mb-1.5">
        {label}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="w-full min-h-[100px] rounded-lg border-2 border-dashed border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50 transition-colors flex items-center justify-center disabled:opacity-40 cursor-pointer"
      >
        <div className="text-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mx-auto text-zinc-300 mb-1"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-xs text-zinc-400">
            {files.length > 0 ? `已选 ${files.length} 张` : "点击选择图片"}
          </span>
        </div>
      </button>

      {/* Thumbnail previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <div key={i} className="relative group">
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-zinc-100"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={disabled}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-zinc-200 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs disabled:hidden"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
