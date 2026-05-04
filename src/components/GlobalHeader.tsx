"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FilterPanelProps } from "@/components/FilterPanel";

interface GlobalHeaderProps extends FilterPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function GlobalHeader({
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedBuilding,
  onBuildingChange,
  allBuildingTypes,
  selectedWeather,
  onWeatherChange,
  allWeatherTypes,
  selectedDiagram,
  onDiagramChange,
  allDiagramTypes,
  showBuildingFilters,
  showDiagramFilters,
}: GlobalHeaderProps) {
  const [isMobileSearchOpen, setMobileSearchOpen] = useState(false);
  const showSecondary = showBuildingFilters || showDiagramFilters;
  const hasFilters = categories.length > 0;
  const hasContent = hasFilters;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 42 }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/70 backdrop-blur-md shadow-sm border border-white/50 transition-[border-radius] duration-300 ${
        hasContent ? "rounded-3xl" : "rounded-full"
      }`}
      style={{ width: "80%", maxWidth: "96rem" }}
    >
      {/* Row 1: Logo (left) | Primary filters | Spacer | Search (right) */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {/* Logo */}
        <div className="w-44 shrink-0 pl-2">
          <span className="text-2xl font-semibold tracking-tight text-zinc-900">
            Prompt Library
          </span>
        </div>

        {/* Primary filters — centered between Logo and search */}
        {hasFilters ? (
          <div className="flex-1 flex flex-wrap items-center justify-center gap-1.5">
            <PillBtn
              active={selectedCategory === null}
              onClick={() => onCategoryChange(null)}
            >
              全部
            </PillBtn>
            {categories.map((cat) => (
              <PillBtn
                key={cat}
                active={selectedCategory === cat}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </PillBtn>
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Desktop search — grey pill */}
        <div className="hidden md:block shrink-0">
          <div className="relative w-44">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="搜索..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl bg-zinc-100 border-0 py-2 pl-9 pr-4 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
            />
          </div>
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
            transition={{ type: "spring", stiffness: 500, damping: 42 }}
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

      {/* Secondary filter sub-panel — dropdown below main row */}
      <AnimatePresence>
        {showSecondary && hasFilters && (
          <motion.div
            key={showBuildingFilters ? "building" : "diagram"}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 42 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
            <div className="border-t border-zinc-200/40 pt-2.5 space-y-2">
            {showBuildingFilters && allBuildingTypes.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="shrink-0 text-xs font-medium text-zinc-400">
                  建筑类型
                </span>
                <PillBtn active={selectedBuilding === null} onClick={() => onBuildingChange(null)} size="small">全部</PillBtn>
                {allBuildingTypes.map((t) => (
                  <PillBtn key={t} active={selectedBuilding === t} onClick={() => onBuildingChange(t)} size="small">{t}</PillBtn>
                ))}
              </div>
            )}
            {showBuildingFilters && allWeatherTypes.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="shrink-0 text-xs font-medium text-zinc-400">
                  光影天气
                </span>
                <PillBtn active={selectedWeather === null} onClick={() => onWeatherChange(null)} size="small">全部</PillBtn>
                {allWeatherTypes.map((t) => (
                  <PillBtn key={t} active={selectedWeather === t} onClick={() => onWeatherChange(t)} size="small">{t}</PillBtn>
                ))}
              </div>
            )}
            {showDiagramFilters && allDiagramTypes.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="shrink-0 text-xs font-medium text-zinc-400">
                  分析图类型
                </span>
                <PillBtn active={selectedDiagram === null} onClick={() => onDiagramChange(null)} size="small">全部</PillBtn>
                {allDiagramTypes.map((t) => (
                  <PillBtn key={t} active={selectedDiagram === t} onClick={() => onDiagramChange(t)} size="small">{t}</PillBtn>
                ))}
              </div>
            )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </motion.header>
  );
}

// ── Sub components ──

function PillBtn({
  active,
  onClick,
  size = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  size?: "default" | "small";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl px-3 py-1.5 text-sm leading-none outline-none ${
        active ? "text-white font-medium" : "text-zinc-400 hover:text-gray-900 transition-colors"
      }`}
    >
      {active && (
        <div className="absolute inset-0 bg-[#1c1c1e] rounded-xl" />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
