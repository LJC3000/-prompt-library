"use client";

import { motion } from "framer-motion";

interface UploadButtonProps {
  onClick: () => void;
}

export default function UploadButton({ onClick }: UploadButtonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="break-inside-avoid mb-6"
    >
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.03 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ willChange: "transform" }}
        className="w-full text-left group relative block overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.1)] hover:border-zinc-200"
      >
        <div className="relative w-full aspect-[4/3] flex items-center justify-center bg-white border-2 border-dashed border-zinc-200 rounded-xl group-hover:border-zinc-400 transition-colors">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-zinc-300 group-hover:text-zinc-500 transition-colors"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </motion.button>
    </motion.div>
  );
}
