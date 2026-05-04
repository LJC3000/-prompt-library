"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GlobalHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function GlobalHeader({ search, onSearchChange }: GlobalHeaderProps) {
  const [isMobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <motion.header
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/70 backdrop-blur-md shadow-sm border border-white/50 ${
        isMobileSearchOpen ? "rounded-3xl" : "rounded-full"
      }`}
      style={{ width: "calc(100% - 2rem)", maxWidth: "48rem" }}
    >
      {/* Main row: Logo + Nav + Search/Icon */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {/* Logo */}
        <div className="shrink-0 pl-2">
          <span className="text-base font-semibold tracking-tight text-zinc-900">
            Prompt Library
          </span>
        </div>

        {/* Global nav items */}
        <div className="flex items-center gap-1 ml-4">
          <NavPill active>图库</NavPill>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Desktop search */}
        <div className="hidden md:block shrink-0">
          <SearchInline value={search} onChange={onSearchChange} />
        </div>

        {/* Mobile search toggle */}
        <button
          type="button"
          className="md:hidden shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors"
          onClick={() => setMobileSearchOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* Mobile search expansion */}
      <AnimatePresence>
        {isMobileSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              <input
                type="text"
                placeholder="搜索 Prompt..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                autoFocus
                className="w-full rounded-xl bg-zinc-100 border-0 py-2.5 px-4 text-base text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/** Global nav pill — e.g. 图库, 我的收集 */
function NavPill({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
      }`}
    >
      {active && (
        <motion.div
          layoutId="active-global-nav"
          className="absolute inset-0 bg-zinc-100 rounded-full"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

/** Desktop search — grey pill, no border */
function SearchInline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-48">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="搜索..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full bg-zinc-100 border-0 py-2 pl-9 pr-4 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
      />
    </div>
  );
}
