"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { PromptCardItem } from "@/types/prompt";

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
}

export default function PromptCard({ card, index, onSelect }: PromptCardProps) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);

  const { prompt } = card;

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setRatio(img.naturalWidth / img.naturalHeight);
    },
    []
  );

  const bgColor = colorFromKey(card.cardKey);

  const imgSrc =
    card.resultImage && !imgError
      ? `/api/image?b64=${btoa(encodeURIComponent(card.resultImage.url!))}`
      : null;

  return (
    <motion.div
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
              className={`w-full align-middle ${ratio ? "block" : "absolute opacity-0"}`}
              onLoad={handleLoad}
              onError={() => setImgError(true)}
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
