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
  file_token: string | null;
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

  // ── Image file state ──
  const [resultFiles, setResultFiles] = useState<File[]>([]);
  const [refFiles, setRefFiles] = useState<File[]>([]);

  // ── Uploaded image metadata ──
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
        <div className="fixed inset-0 z-[100] flex justify-center overflow-y-auto items-start">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={uploading ? undefined : onClose}
          />

          {/* Modal card */}
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
            className="relative z-10 mx-4"
            style={{
              marginTop: "8vh",
              marginBottom: "5vh",
              maxWidth: "880px",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-[80vh] rounded-2xl bg-white shadow-xl border border-white/50 overflow-hidden">
              {/* Close button */}
              <button
                type="button"
                onClick={uploading ? undefined : onClose}
                disabled={uploading}
                className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Header (shrink-0 = always visible) */}
              <div className="shrink-0 px-8 pt-10 pb-5 border-b border-zinc-100">
                <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">
                  添加新 Prompt
                </h2>
              </div>

              {/* Form body (flex-1 overflow-y-auto = only this scrolls) */}
              <div className="flex-1 overflow-y-auto px-8 pt-4 pb-6 space-y-7">

                {/* ═══ 分区一：顶部视觉资产（第一优先级） ═══ */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="bg-zinc-50/80 rounded-2xl p-5">
                    <ImageDropZone
                      label="生成结果"
                      required
                      files={resultFiles}
                      onSelect={() => resultInputRef.current?.click()}
                      onRemove={(i) => removeFile(i, "results")}
                      onDropFiles={(files) =>
                        handleFilesSelected(files, "results", resultFiles)
                      }
                      disabled={uploading}
                      inputRef={resultInputRef}
                      inputId="result-upload"
                      onFileChange={(e) =>
                        handleFilesSelected(e.target.files, "results", resultFiles)
                      }
                    />
                  </div>

                  <div className="bg-zinc-50/80 rounded-2xl p-5">
                    <ImageDropZone
                      label="参考图片"
                      files={refFiles}
                      onSelect={() => refInputRef.current?.click()}
                      onRemove={(i) => removeFile(i, "refs")}
                      onDropFiles={(files) =>
                        handleFilesSelected(files, "refs", refFiles)
                      }
                      disabled={uploading}
                      inputRef={refInputRef}
                      inputId="ref-upload"
                      onFileChange={(e) =>
                        handleFilesSelected(e.target.files, "refs", refFiles)
                      }
                    />
                  </div>
                </div>

                {/* ═══ 分区二：中部核心提示词（第二优先级） ═══ */}
                <div>
                  <label
                    htmlFor="promptContent"
                    className="block text-sm font-medium text-zinc-700 mb-2"
                  >
                    提示词 <span className="text-zinc-400 text-xs font-normal ml-0.5">*</span>
                  </label>
                  <textarea
                    id="promptContent"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="输入完整的提示词文本，支持多行编辑..."
                    rows={8}
                    className="w-full rounded-xl bg-zinc-50/80 border border-zinc-200 px-4 py-3.5 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white resize-none leading-relaxed"
                  />
                </div>

                {/* ═══ 分区三：中下基础信息（次优先级） ═══ */}
                <div className="grid grid-cols-3 gap-5">
                  <TextField
                    label="项目名称"
                    required
                    value={title}
                    onChange={setTitle}
                    placeholder="深圳湾文化广场"
                  />
                  <TextField
                    label="部门"
                    value={department}
                    onChange={setDepartment}
                    placeholder="方案二组"
                  />
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      AI工具 / 模型
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={aiTool}
                        onChange={(e) => setAiTool(e.target.value)}
                        placeholder="Midjourney"
                        className="flex-1 min-w-0 rounded-lg bg-zinc-50/80 border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white"
                      />
                      <span className="text-zinc-300 text-xs shrink-0">/</span>
                      <input
                        type="text"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        placeholder="V6"
                        className="flex-1 min-w-0 rounded-lg bg-zinc-50/80 border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* ═══ 分区四：底部专业标签（补充优先级） ═══ */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  <TagGroup
                    label="图片类型"
                    required
                    options={IMAGE_TYPE_OPTIONS}
                    selected={imageTypes}
                    onToggle={(tag) => toggleTag(imageTypes, setImageTypes, tag)}
                  />
                  <TagGroup
                    label="建筑类型"
                    options={BUILDING_TYPE_OPTIONS}
                    selected={buildingTypes}
                    onToggle={(tag) => toggleTag(buildingTypes, setBuildingTypes, tag)}
                  />
                  <TagGroup
                    label="光影天气"
                    options={WEATHER_TYPE_OPTIONS}
                    selected={weatherTypes}
                    onToggle={(tag) => toggleTag(weatherTypes, setWeatherTypes, tag)}
                  />
                  <TagGroup
                    label="分析图类型"
                    options={DIAGRAM_TYPE_OPTIONS}
                    selected={diagramTypes}
                    onToggle={(tag) => toggleTag(diagramTypes, setDiagramTypes, tag)}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* Upload status */}
                {statusText && (
                  <div className="flex items-center gap-2.5 text-sm text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800" />
                    {statusText}
                  </div>
                )}
              </div>

              {/* Footer (shrink-0 = always visible, no scroll needed to reach) */}
              <div className="shrink-0 px-8 py-4 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  className="px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-[#1c1c1e] hover:bg-black rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                >
                  {uploading ? "提交中..." : "提交"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ──

function TextField({
  label,
  required,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = label.replace(/\s/g, "");
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-700 mb-2"
      >
        {label}
        {required && (
          <span className="text-zinc-400 text-xs font-normal ml-0.5">*</span>
        )}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-zinc-50/80 border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white"
      />
    </div>
  );
}

function TagGroup({
  label,
  required,
  options,
  selected,
  onToggle,
}: {
  label: string;
  required?: boolean;
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-zinc-700 mb-2">
        {label}
        {required && (
          <span className="text-zinc-400 text-xs font-normal ml-0.5">*</span>
        )}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`relative rounded-lg px-2.5 py-1.5 text-xs leading-none transition-all duration-150 ${
                active
                  ? "text-white font-medium bg-[#1c1c1e] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 bg-zinc-100 hover:bg-zinc-200/80"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageDropZone({
  label,
  required,
  files,
  onSelect,
  onRemove,
  onDropFiles,
  disabled,
  inputRef,
  inputId,
  onFileChange,
}: {
  label: string;
  required?: boolean;
  files: File[];
  onSelect: () => void;
  onRemove: (idx: number) => void;
  onDropFiles: (fileList: FileList) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputId: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const hasFiles = files.length > 0;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(e.dataTransfer.files);
      }
    },
    [onDropFiles]
  );

  return (
    <div>
      {/* Label */}
      <span className="block text-sm font-medium text-zinc-700 mb-2">
        {label}
        {required && (
          <span className="text-zinc-400 text-xs font-normal ml-0.5">*</span>
        )}
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

      {/* Drop zone — the entire area is a drop target */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onClick={disabled ? undefined : onSelect}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) onSelect();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative w-full rounded-xl transition-all cursor-pointer select-none ${
          disabled ? "opacity-40 pointer-events-none" : ""
        } ${
          hasFiles
            ? // Filled state: solid border, white bg, image content
              `border border-zinc-200 bg-white ${
                dragOver ? "ring-2 ring-zinc-400 border-zinc-400" : ""
              }`
            : // Empty state: dashed border, subtle bg
              `border-2 border-dashed min-h-[200px] flex items-center justify-center ${
                dragOver
                  ? "border-zinc-800 bg-zinc-100"
                  : "border-zinc-200 hover:border-zinc-400 bg-white/60 hover:bg-white"
              }`
        }`}
      >
        {hasFiles ? (
          /* ── Filled: image previews replace dashed box ── */
          <div className="p-3">
            {/* Image grid */}
            <div
              className={`grid gap-2 ${
                files.length === 1
                  ? "grid-cols-1"
                  : files.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-3"
              }`}
            >
              {files.map((f, i) => (
                <div
                  key={i}
                  className={`relative group overflow-hidden rounded-lg bg-zinc-100 ${
                    files.length === 1 ? "aspect-[4/3]" : "aspect-square"
                  }`}
                >
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    disabled={disabled}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors text-xs disabled:hidden"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add-more hint */}
            <div
              className={`text-center ${
                files.length > 0 ? "mt-3" : ""
              }`}
            >
              <span className="text-xs text-zinc-400">
                {dragOver ? "释放以添加更多" : "点击或拖拽添加更多图片"}
              </span>
            </div>
          </div>
        ) : (
          /* ── Empty state: dashed box with + icon ── */
          <div className="text-center py-14">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto text-zinc-300 mb-2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="text-sm text-zinc-400">
              {dragOver ? "释放以上传" : "点击选择或拖拽图片"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
