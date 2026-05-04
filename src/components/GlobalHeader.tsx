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
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/70 backdrop-blur-md shadow-sm border border-white/50 ${
        hasContent ? "rounded-3xl" : "rounded-full"
      }`}
      style={{ width: "calc(100% - 2rem)", maxWidth: "48rem" }}
    >
      {/* Row 1: Logo + Nav + Search */}
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
              className="w-full rounded-full bg-zinc-100 border-0 py-2 pl-9 pr-4 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
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

      {/* Separator between nav row and filter area */}
      {hasFilters && <div className="border-t border-zinc-200/40 mx-4" />}

      {/* Filter area */}
      {hasFilters && (
        <div className="px-4 pb-3 pt-2.5">
          {/* Primary filter row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-400 mr-1 shrink-0">
              图片类型
            </span>
            <PillBtn
              active={selectedCategory === null}
              onClick={() => onCategoryChange(null)}
              layoutId="active-primary-filter"
            >
              全部
            </PillBtn>
            {categories.map((cat) => (
              <PillBtn
                key={cat}
                active={selectedCategory === cat}
                onClick={() => onCategoryChange(cat)}
                layoutId="active-primary-filter"
              >
                {cat}
              </PillBtn>
            ))}
          </div>

          {/* Secondary filter sub-panel */}
          <AnimatePresence mode="wait">
            {showSecondary && (
              <motion.div
                key={showBuildingFilters ? "building" : "diagram"}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-2 pl-6">
                  {showBuildingFilters && allBuildingTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-400 mr-1 shrink-0">
                        建筑类型
                      </span>
                      <PillBtn
                        active={selectedBuilding === null}
                        onClick={() => onBuildingChange(null)}
                        layoutId="active-secondary-filter"
                        size="small"
                      >
                        全部
                      </PillBtn>
                      {allBuildingTypes.map((t) => (
                        <PillBtn
                          key={t}
                          active={selectedBuilding === t}
                          onClick={() => onBuildingChange(t)}
                          layoutId="active-secondary-filter"
                          size="small"
                        >
                          {t}
                        </PillBtn>
                      ))}
                    </div>
                  )}
                  {showBuildingFilters && allWeatherTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-400 mr-1 shrink-0">
                        光影天气
                      </span>
                      <PillBtn
                        active={selectedWeather === null}
                        onClick={() => onWeatherChange(null)}
                        layoutId="active-secondary-filter"
                        size="small"
                      >
                        全部
                      </PillBtn>
                      {allWeatherTypes.map((t) => (
                        <PillBtn
                          key={t}
                          active={selectedWeather === t}
                          onClick={() => onWeatherChange(t)}
                          layoutId="active-secondary-filter"
                          size="small"
                        >
                          {t}
                        </PillBtn>
                      ))}
                    </div>
                  )}
                  {showDiagramFilters && allDiagramTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-400 mr-1 shrink-0">
                        分析图类型
                      </span>
                      <PillBtn
                        active={selectedDiagram === null}
                        onClick={() => onDiagramChange(null)}
                        layoutId="active-secondary-filter"
                        size="small"
                      >
                        全部
                      </PillBtn>
                      {allDiagramTypes.map((t) => (
                        <PillBtn
                          key={t}
                          active={selectedDiagram === t}
                          onClick={() => onDiagramChange(t)}
                          layoutId="active-secondary-filter"
                          size="small"
                        >
                          {t}
                        </PillBtn>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.header>
  );
}

// ── Sub components ──

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

function PillBtn({
  active,
  onClick,
  layoutId,
  size = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  layoutId: string;
  size?: "default" | "small";
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`relative rounded-full font-medium outline-none transition-colors ${
        size === "small"
          ? "px-3 py-1 text-sm"
          : "px-3.5 py-1.5 text-sm"
      } ${active ? "text-white" : "text-zinc-400 hover:text-zinc-600"}`}
    >
      {active && (
        <motion.div
          layoutId={layoutId}
          className="absolute inset-0 bg-zinc-900 rounded-full"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
