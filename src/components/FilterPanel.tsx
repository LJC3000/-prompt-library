"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface FilterPanelProps {
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  selectedBuilding: string | null;
  onBuildingChange: (b: string | null) => void;
  allBuildingTypes: string[];
  selectedWeather: string | null;
  onWeatherChange: (w: string | null) => void;
  allWeatherTypes: string[];
  selectedDiagram: string | null;
  onDiagramChange: (d: string | null) => void;
  allDiagramTypes: string[];
  showBuildingFilters: boolean;
  showDiagramFilters: boolean;
}

export default function FilterPanel({
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
}: FilterPanelProps) {
  const showSecondary = showBuildingFilters || showDiagramFilters;

  return (
    <div className="sticky top-20 z-40 bg-white border-b border-zinc-100">
      <div className="mx-auto max-w-none px-3 sm:px-4 lg:px-5 pt-3 pb-3">
        {/* Primary row: 图片类型 */}
        {categories.length > 0 && (
          <FilterRow label="图片类型">
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
          </FilterRow>
        )}

        {/* Secondary sub-panel: accordion expand */}
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
              <div className="pt-3 space-y-2">
                {/* 建筑类型 + 光影天气 */}
                {showBuildingFilters && allBuildingTypes.length > 0 && (
                  <FilterRow label="建筑类型" level="secondary">
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
                  </FilterRow>
                )}
                {showBuildingFilters && allWeatherTypes.length > 0 && (
                  <FilterRow label="光影天气" level="secondary">
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
                  </FilterRow>
                )}

                {/* 分析图类型 */}
                {showDiagramFilters && allDiagramTypes.length > 0 && (
                  <FilterRow label="分析图类型" level="secondary">
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
                  </FilterRow>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** One filter row: label + pills */
function FilterRow({
  label,
  level = "primary",
  children,
}: {
  label: string;
  level?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-x-2 ${
        level === "secondary" ? "pl-8" : ""
      }`}
    >
      <span
        className={`shrink-0 leading-7 ${
          level === "secondary"
            ? "text-xs text-zinc-400"
            : "text-sm sm:text-base text-zinc-400"
        }`}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Pill button with animated sliding background via layoutId */
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
        size === "small" ? "px-3 py-1 text-sm" : "px-4 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base"
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
