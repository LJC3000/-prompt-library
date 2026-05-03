"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { PromptCardItem } from "@/types/prompt";
import { cardThumbSrc, proxyUrl, refreshTmpUrl } from "@/lib/imageUrl";

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

interface PromptCardProps {
  card: PromptCardItem;
  index: number;
  onSelect: (prompt: PromptCardItem["prompt"], index: number) => void;
  onImageLoaded?: (cardKey: string) => void;
  preloadedUrls: Record<string, string>;
}

export default function PromptCard({ card, index, onSelect, onImageLoaded, preloadedUrls }: PromptCardProps) {
  const [ratio, setRatio] = useState<number | null>(card.resultImage?.aspectRatio ?? null);
  // sourceMode: "primary"=tmp_url, "refreshing"=waiting, "proxy"=/api/image, "failed"=placeholder
  const [sourceMode, setSourceMode] = useState<"primary" | "refreshing" | "proxy" | "failed">("primary");
  const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceModeRef = useRef(sourceMode);

  const { prompt } = card;

  // Keep ref in sync for timeout callback
  useEffect(() => { sourceModeRef.current = sourceMode; }, [sourceMode]);

  // IntersectionObserver: only load image when card is near the viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Timeout: if image doesn't load within 45s, advance fallback
  useEffect(() => {
    if (shouldLoad && sourceMode !== "failed" && sourceMode !== "refreshing") {
      loadTimeoutRef.current = setTimeout(() => {
        const mode = sourceModeRef.current;
        if (mode === "primary") {
          triggerRefresh();
        } else {
          setSourceMode("failed");
        }
      }, 10_000);
    }
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [shouldLoad, sourceMode]);

  const triggerRefresh = useCallback(() => {
    if (!card.resultImage?.file_token) {
      setSourceMode("proxy");
      return;
    }
    setSourceMode("refreshing");
    refreshTmpUrl(card.resultImage.file_token, card.resultImage.extra).then((url) => {
      if (url) {
        setRefreshedUrl(url);
        setSourceMode("primary");
      } else {
        setSourceMode("proxy");
      }
    });
  }, [card.resultImage]);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      const img = e.currentTarget;
      setRatio(img.naturalWidth / img.naturalHeight);
      onImageLoaded?.(card.cardKey);
    },
    [onImageLoaded, card.cardKey]
  );

  const handleError = useCallback(() => {
    if (sourceMode === "primary") {
      triggerRefresh();
    } else if (sourceMode === "proxy") {
      setSourceMode("failed");
    }
    // In "refreshing" mode, do nothing — wait for the refresh promise
  }, [sourceMode, triggerRefresh]);

  const bgColor = colorFromKey(card.cardKey);

  // Build image source based on current fallback mode
  const imgSrc = ((): string | undefined | null => {
    if (!shouldLoad || !card.resultImage || sourceMode === "failed") return null;
    // Preloaded 24h URL — skip the expired tmp_url entirely
    const preloaded = preloadedUrls[card.resultImage.file_token];
    if (preloaded) return preloaded;
    if (sourceMode === "refreshing") return null;
    if (sourceMode === "primary") {
      return refreshedUrl ?? cardThumbSrc(card.resultImage);
    }
    // proxy mode
    return proxyUrl(card.resultImage);
  })();


  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.6), ease: "easeOut" }}
      className="break-inside-avoid mb-6"
    >
      <motion.button
        onClick={() => onSelect(prompt, index)}
        whileHover={{ scale: 1.03 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ willChange: "transform" }}
        className="w-full text-left group relative block overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.1)]"
      >
        {imgSrc ? (
          <div
            className="relative w-full overflow-hidden"
            style={{
              backgroundColor: bgColor,
              aspectRatio: ratio ? String(ratio) : "4/3",
            }}
          >
            {/* Morandi color block: visible while loading */}
            {!ratio && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: bgColor }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
            <img
              src={imgSrc}
              alt={prompt.title}
              loading="lazy"
              className={`w-full align-middle ${ratio ? "block" : "absolute opacity-0"}`}
              onLoad={handleLoad}
              onError={handleError}
            />
          </div>
        ) : (
          <div
            className="w-full flex items-center justify-center"
            style={{ aspectRatio: "4/3", backgroundColor: bgColor }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}

        {/* Hover overlay: bottom gradient bar with project name */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <p className="text-sm text-white font-light truncate">
              {prompt.project || prompt.category}
            </p>
          </div>
        </div>
      </motion.button>
    </motion.div>
  );
}
