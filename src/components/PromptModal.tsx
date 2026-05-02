"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PromptItem } from "@/types/prompt";
import { imageSrc, proxyUrl, refreshTmpUrl } from "@/lib/imageUrl";

interface PromptModalProps {
  prompt: PromptItem | null;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  preloadedUrls: Record<string, string>;
}

const MORANDI_COLORS = [
  "#d4c8b8",
  "#b8c4c8",
  "#c4b8c8",
  "#c8c0b8",
  "#b8c8c0",
  "#c8b8b8",
  "#c0c0b8",
  "#b8bcc8",
];

function colorFromKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return MORANDI_COLORS[Math.abs(hash) % MORANDI_COLORS.length];
}

function NavButton({ side, onClick, disabled }: { side: "left" | "right"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`fixed top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all ${
        disabled ? "opacity-0 pointer-events-none" : ""
      } ${side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {side === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

interface ImageCache {
  ratio: number | null;
  loaded: boolean;
}

export default function PromptModal({ prompt, hasNext, hasPrev, onNext, onPrev, onClose, preloadedUrls }: PromptModalProps) {
  const [copied, setCopied] = useState(false);
  // sourceMode: "primary"=tmp_url, "refreshing"=waiting, "proxy"=/api/image, "failed"=placeholder
  const [sourceMode, setSourceMode] = useState<"primary" | "refreshing" | "proxy" | "failed">("primary");
  const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);
  const [mainImgLoaded, setMainImgLoaded] = useState(false);
  const [mainImgRatio, setMainImgRatio] = useState<number | null>(null);
  const [refLoadedMap, setRefLoadedMap] = useState<Record<string, boolean>>({});
  const [refreshedRefUrls, setRefreshedRefUrls] = useState<Record<string, string>>({});
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const sourceModeRef = useRef(sourceMode);

  const imageCacheRef = useRef<Map<string, ImageCache>>(new Map());

  useEffect(() => { sourceModeRef.current = sourceMode; }, [sourceMode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    if (prompt) {
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [prompt, onClose, onNext, onPrev]);

  // On prompt change: check cache, only reset if not cached
  useEffect(() => {
    setCopied(false);
    setSourceMode("primary");
    setRefreshedUrl(null);
    setRefLoadedMap({});
    setRefreshedRefUrls({});
    setViewerSrc(null);

    if (prompt) {
      const cached = imageCacheRef.current.get(prompt.id);
      if (cached) {
        setMainImgLoaded(cached.loaded);
        setMainImgRatio(cached.ratio);
      } else {
        setMainImgLoaded(false);
        setMainImgRatio(null);
      }
    }
  }, [prompt]);

  // Update cache when main image loads or ratio is known
  useEffect(() => {
    if (prompt && mainImgLoaded && mainImgRatio !== null) {
      imageCacheRef.current.set(prompt.id, { ratio: mainImgRatio, loaded: true });
    }
  }, [prompt, mainImgLoaded, mainImgRatio]);

  const handleRefLoad = useCallback((fileToken: string) => {
    setRefLoadedMap((prev) => ({ ...prev, [fileToken]: true }));
  }, []);

  const handleRefError = useCallback((file: NonNullable<PromptItem["results"]>[number]) => {
    if (!file.file_token) return;
    refreshTmpUrl(file.file_token, file.extra).then((url) => {
      if (url) setRefreshedRefUrls((prev) => ({ ...prev, [file.file_token]: url }));
    });
  }, []);

  const handleMainLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setMainImgLoaded(true);
    const img = e.currentTarget;
    setMainImgRatio(img.naturalWidth / img.naturalHeight);
  }, []);

  const triggerRefresh = useCallback(() => {
    const file = prompt?.results?.[0];
    if (!file?.file_token) {
      setSourceMode("proxy");
      return;
    }
    setSourceMode("refreshing");
    refreshTmpUrl(file.file_token, file.extra).then((url) => {
      if (url) {
        setRefreshedUrl(url);
        setSourceMode("primary");
      } else {
        setSourceMode("proxy");
      }
    });
  }, [prompt]);

  const handleMainError = useCallback(() => {
    if (sourceMode === "primary") {
      triggerRefresh();
    } else if (sourceMode === "proxy") {
      setSourceMode("failed");
    }
  }, [sourceMode, triggerRefresh]);

  if (!prompt) return null;

  const mainResultImg = sourceMode !== "failed" ? prompt.results?.[0] : undefined;
  const mainImgSrc = ((): string | null | undefined => {
    if (!mainResultImg || sourceMode === "refreshing") return null;
    const preloaded = preloadedUrls[mainResultImg.file_token];
    if (preloaded) return preloaded;
    if (sourceMode === "primary") return refreshedUrl ?? imageSrc(mainResultImg);
    if (sourceMode === "proxy") return proxyUrl(mainResultImg);
    return null;
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = prompt.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasRefImages = prompt.refImages && prompt.refImages.length > 0;

  const isTall = mainImgRatio !== null && mainImgRatio < 4 / 3;

  return (
    <AnimatePresence>
      <div key="modal" className="fixed inset-0 z-[100] flex justify-center overflow-y-auto items-start">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative z-10 mx-4"
          style={{
            willChange: "transform",
            marginTop: "8vh",
            marginBottom: "5vh",
            maxWidth: isTall ? undefined : "48rem",
          }}
          // 竖图不设宽度上限，保证右侧信息面板有足够空间
          onClick={(e) => e.stopPropagation()}
        >
          <div className={"rounded-2xl bg-white shadow-2xl" + (isTall ? " flex h-[80vh] overflow-hidden" : " overflow-hidden")}>
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* === Hero: generated result === */}
            {mainImgSrc && !isTall && (
              <div
                className="w-full border-b border-zinc-100 relative group"
                style={{ backgroundColor: colorFromKey(prompt.id) }}
              >
                <img
                  src={mainImgSrc}
                  alt={prompt.title}
                  className="w-full h-auto block transition-all duration-300 cursor-pointer"
                  style={{ opacity: mainImgLoaded ? 1 : 0 }}
                  onLoad={handleMainLoad}
                  onError={handleMainError}
                  onClick={() => setViewerSrc(mainImgSrc)}
                />
                {/* Hover hint */}
                <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/50 text-white/80 px-2.5 py-1.5 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  <span>查看原图</span>
                </div>
              </div>
            )}

            {/* === Two-column layout for tall images === */}
            {mainImgSrc && isTall && (
              <div className="relative group shrink-0 h-full">
                <img
                  src={mainImgSrc}
                  alt={prompt.title}
                  className="h-full w-auto block shrink-0 border-r border-zinc-100 transition-opacity duration-300 cursor-pointer"
                  style={{ opacity: mainImgLoaded ? 1 : 0, backgroundColor: colorFromKey(prompt.id) }}
                  onLoad={handleMainLoad}
                  onError={handleMainError}
                  onClick={() => setViewerSrc(mainImgSrc)}
                />
                {/* Hover hint */}
                <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/50 text-white/80 px-2.5 py-1.5 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  <span>查看原图</span>
                </div>
              </div>
            )}

            {/* === Right side: details (and ref images for tall layout) === */}
            <div className={"min-w-0" + (isTall ? " flex h-full" : " flex-1")}>
              {/* For non-tall: ref images + details flex row */}
              {!isTall && (
                <div className="flex flex-col lg:flex-row">
                  {/* Left column: reference images */}
                  <div className="lg:w-[45%] shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-100 p-6 lg:p-8 flex flex-col">
                    {hasRefImages && (
                      <>
                        <h4 className="text-xs font-medium tracking-wider text-zinc-400 uppercase mb-4">
                          Reference Images
                        </h4>
                        <div className="flex flex-col gap-4">
                          {prompt.refImages!.map((file, i) => {
                            const refSrc = refreshedRefUrls[file.file_token] ?? preloadedUrls[file.file_token] ?? imageSrc(file) ?? proxyUrl(file) ?? undefined;
                            return (
                              <div
                                key={file.file_token || `ref_${i}`}
                                className="rounded-xl overflow-hidden ring-1 ring-zinc-100 relative group/ref min-h-[100px]"
                                style={{ backgroundColor: MORANDI_COLORS[i % MORANDI_COLORS.length] }}
                              >
                                <img
                                  src={refSrc}
                                  alt="reference"
                                  className="w-full h-auto object-contain transition-opacity duration-300 cursor-pointer"
                                  style={{ opacity: refLoadedMap[file.file_token] ? 1 : 0 }}
                                  onLoad={() => handleRefLoad(file.file_token)}
                                  onError={() => handleRefError(file)}
                                  onClick={() => setViewerSrc(refSrc)}
                                />
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-black/40 text-white/60 px-1.5 py-1 text-[10px] opacity-0 group-hover/ref:opacity-100 transition-opacity pointer-events-none">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    <line x1="11" y1="8" x2="11" y2="14" />
                                    <line x1="8" y1="11" x2="14" y2="11" />
                                  </svg>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right column: details */}
                  <div className="flex-1 min-w-0 p-6 lg:p-8">
                    <ModalContent prompt={prompt} copied={copied} handleCopy={handleCopy} />
                  </div>
                </div>
              )}

              {/* For tall: right column */}
              {isTall && (
                <div className="flex flex-col w-[380px] shrink-0">
                  {/* Fixed top: title + copy + category */}
                  <div className="shrink-0 p-4 lg:p-5 pt-12 lg:pt-14 pb-3">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h2 className="text-base font-semibold text-zinc-900">
                        {prompt.project || prompt.title}
                      </h2>
                      <button
                        onClick={handleCopy}
                        className="shrink-0 flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                      >
                        {copied ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy Prompt
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400 uppercase tracking-wider">
                      {prompt.category}
                    </p>
                  </div>

                  {/* Scrollable middle: prompt text only */}
                  <div className="flex-1 overflow-y-auto min-h-0 px-4 lg:px-5 py-3">
                    <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
                      Prompt
                    </h4>
                    <div className="text-xs leading-relaxed text-zinc-600 whitespace-pre-wrap">
                      {prompt.content}
                    </div>
                  </div>

                  {/* Fixed bottom: AI Tool/Model + Department */}
                  <div className="shrink-0 px-4 lg:px-5 pb-4 lg:pb-5 pt-3 space-y-4">
                    {(prompt.aiTool || prompt.aiModel) && (
                      <div>
                        <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
                          AI Tool / Model
                        </h4>
                        <p className="text-xs text-zinc-700">
                          {[prompt.aiTool, prompt.aiModel].filter(Boolean).join(" — ")}
                        </p>
                      </div>
                    )}
                    {prompt.department && (
                      <div>
                        <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
                          Department
                        </h4>
                        <p className="text-xs text-zinc-700">{prompt.department}</p>
                      </div>
                    )}
                  </div>

                  <div className={hasRefImages ? "h-56 shrink-0 border-t border-zinc-100 p-4 lg:p-5 flex flex-col" : ""}>
                    {hasRefImages && (
                      <>
                        <h4 className="text-[9px] font-medium tracking-wider text-zinc-400 uppercase mb-1 shrink-0">
                          Reference Images
                        </h4>
                        <div className={`flex-1 flex gap-1 min-h-0 ${prompt.refImages!.length >= 2 ? "flex-row" : "flex-col"}`}>
                          {prompt.refImages!.map((file, i) => {
                            const refSrc = refreshedRefUrls[file.file_token] ?? preloadedUrls[file.file_token] ?? imageSrc(file) ?? proxyUrl(file) ?? undefined;
                            return (
                              <div
                                key={file.file_token || `ref_${i}`}
                                className="flex-1 min-w-0 rounded-sm overflow-hidden ring-1 ring-zinc-100 relative group/ref min-h-[60px]"
                              >
                                <img
                                  src={refSrc}
                                  alt="reference"
                                  className="w-full h-full object-contain transition-opacity duration-300 cursor-pointer"
                                  style={{ opacity: refLoadedMap[file.file_token] ? 1 : 0 }}
                                  onLoad={() => handleRefLoad(file.file_token)}
                                  onError={() => handleRefError(file)}
                                  onClick={() => setViewerSrc(refSrc)}
                                />
                                <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5 rounded-full bg-black/40 text-white/60 px-1 py-0.5 text-[8px] opacity-0 group-hover/ref:opacity-100 transition-opacity pointer-events-none">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    <line x1="11" y1="8" x2="11" y2="14" />
                                    <line x1="8" y1="11" x2="14" y2="11" />
                                  </svg>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Fixed position prev/next buttons — outside the card, on the sides */}
        <NavButton side="left" onClick={onPrev} disabled={!hasPrev} />
        <NavButton side="right" onClick={onNext} disabled={!hasNext} />
      </div>

      {/* Image viewer overlay */}
      <ImageViewer key="viewer"
        src={viewerSrc}
        onClose={() => setViewerSrc(null)}
      />
    </AnimatePresence>
  );
}

function ModalContent({ prompt, copied, handleCopy }: { prompt: PromptItem; copied: boolean; handleCopy: () => void }) {
  return (
    <>
      {/* Title row + Copy */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h2 className="text-base font-semibold text-zinc-900">
          {prompt.project || prompt.title}
        </h2>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Prompt
            </>
          )}
        </button>
      </div>

      {/* Category — minimal text */}
      <p className="text-xs text-zinc-400 mb-4 uppercase tracking-wider">
        {prompt.category}
      </p>

      {/* Info sections */}
      <div className="space-y-4">
        <div>
          <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
            Prompt
          </h4>
          <div className="text-xs leading-relaxed text-zinc-600 whitespace-pre-wrap">
            {prompt.content}
          </div>
        </div>

        {/* AI Tool + AI Model combined */}
        {(prompt.aiTool || prompt.aiModel) && (
          <div>
            <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
              AI Tool / Model
            </h4>
            <p className="text-xs text-zinc-700">
              {[prompt.aiTool, prompt.aiModel].filter(Boolean).join(" — ")}
            </p>
          </div>
        )}

        {prompt.department && (
          <div>
            <h4 className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase mb-1.5">
              Department
            </h4>
            <p className="text-xs text-zinc-700">{prompt.department}</p>
          </div>
        )}
      </div>
    </>
  );
}

function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panAtDragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const wheelContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [src, onClose]);

  // Native wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = wheelContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScale((prev) => Math.max(0.25, Math.min(prev + delta, 10)));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [src]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panAtDragStart.current = { ...pan };
  }, [pan]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPan({
        x: panAtDragStart.current.x + (e.clientX - dragStart.current.x),
        y: panAtDragStart.current.y + (e.clientY - dragStart.current.y),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  if (!src) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-5 right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-all"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div
        ref={wheelContainerRef}
        className="w-full h-full flex items-center justify-center p-10 select-none"
        onClick={onClose}
      >
        <div
          onMouseDown={handleMouseDown}
          className="w-full h-full"
          style={{ cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "default" }}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            className="w-full h-full object-contain block"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "center center",
              boxShadow: scale > 1 ? "0 0 60px rgba(0,0,0,0.4)" : "none",
              borderRadius: "4px",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
