"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PromptCard from "@/components/PromptCard";
import PromptModal from "@/components/PromptModal";
import SearchBar from "@/components/SearchBar";
import type { PromptCardItem, PromptItem } from "@/types/prompt";

/** 哪些一级类型需要展示二级标签筛选 */
const CATEGORIES_WITH_BUILDING = new Set(["效果图（低点）", "效果图（鸟瞰）"]);
const CATEGORIES_WITH_DIAGRAM = new Set(["分析图"]);

/** Shared pill button style — defined outside component to avoid recreation */
function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base font-medium text-center shrink-0 outline-none ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

/** 从所有 cards 中收集所有可选标签 */
function collectAllTags(cards: PromptCardItem[]) {
  const buildingSet = new Set<string>();
  const weatherSet = new Set<string>();
  const diagramSet = new Set<string>();
  for (const c of cards) {
    for (const t of c.prompt.buildingTypes ?? []) buildingSet.add(t);
    for (const t of c.prompt.weatherTypes ?? []) weatherSet.add(t);
    for (const t of c.prompt.diagramTypes ?? []) diagramSet.add(t);
  }
  return {
    allBuildingTypes: Array.from(buildingSet).sort(),
    allWeatherTypes: Array.from(weatherSet).sort(),
    allDiagramTypes: Array.from(diagramSet).sort(),
  };
}

export default function Home() {
  const [cards, setCards] = useState<PromptCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedWeather, setSelectedWeather] = useState<string | null>(null);
  const [selectedDiagram, setSelectedDiagram] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const selectedIndexRef = useRef(-1);
  const scrollPos = useRef(0);

  useEffect(() => {
    fetch("/api/prompts")
      .then((res) => res.json())
      .then((data) => {
        const items = data.cards ?? [];
        setCards(items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Reset secondary filters when category changes
  useEffect(() => {
    if (!CATEGORIES_WITH_BUILDING.has(selectedCategory ?? "")) {
      setSelectedBuilding(null);
      setSelectedWeather(null);
    }
    if (!CATEGORIES_WITH_DIAGRAM.has(selectedCategory ?? "")) {
      setSelectedDiagram(null);
    }
  }, [selectedCategory]);

  // Collect tag options — only when secondary filters could be visible
  const { allBuildingTypes, allWeatherTypes, allDiagramTypes } = useMemo(() => {
    const cat = selectedCategory;
    if (!cat || (!CATEGORIES_WITH_BUILDING.has(cat) && !CATEGORIES_WITH_DIAGRAM.has(cat))) {
      return { allBuildingTypes: [], allWeatherTypes: [], allDiagramTypes: [] };
    }
    return collectAllTags(cards);
  }, [cards, selectedCategory]);


  const categories = useMemo(() => {
    const set = new Set(cards.map((c) => c.prompt.category));
    return Array.from(set).sort();
  }, [cards]);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      const p = c.prompt;

      // 一级：图片类型
      const matchesCategory =
        !selectedCategory || p.category === selectedCategory;

      // 二级：建筑类型 / 光影天气 / 分析图类型
      const matchesBuilding =
        !selectedBuilding ||
        (p.buildingTypes ?? []).includes(selectedBuilding);
      const matchesWeather =
        !selectedWeather ||
        (p.weatherTypes ?? []).includes(selectedWeather);
      const matchesDiagram =
        !selectedDiagram ||
        (p.diagramTypes ?? []).includes(selectedDiagram);

      // 关键词搜索：标题、内容、图片类型、二级标签
      const needle = search.toLowerCase();
      const matchesSearch =
        !search ||
        p.title.toLowerCase().includes(needle) ||
        p.content.toLowerCase().includes(needle) ||
        (p.imageTypes ?? []).some((t) => t.toLowerCase().includes(needle)) ||
        (p.buildingTypes ?? []).some((t) => t.toLowerCase().includes(needle)) ||
        (p.weatherTypes ?? []).some((t) => t.toLowerCase().includes(needle)) ||
        (p.diagramTypes ?? []).some((t) => t.toLowerCase().includes(needle));

      return matchesCategory && matchesBuilding && matchesWeather && matchesDiagram && matchesSearch;
    });
  }, [cards, search, selectedCategory, selectedBuilding, selectedWeather, selectedDiagram]);

  const handleSelect = useCallback((prompt: PromptItem, index: number) => {
    scrollPos.current = window.scrollY;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    setSelectedPrompt(structuredClone(prompt));
    setSelectedIndex(index);
    selectedIndexRef.current = index;
  }, []);

  const handleClose = useCallback(() => {
    setSelectedPrompt(null);
    setSelectedIndex(-1);
    selectedIndexRef.current = -1;

    requestAnimationFrame(() => {
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollPos.current);
    });
  }, []);

  const handleNext = useCallback(() => {
    const next = selectedIndexRef.current + 1;
    if (next < filtered.length) {
      setSelectedPrompt(structuredClone(filtered[next].prompt));
      setSelectedIndex(next);
      selectedIndexRef.current = next;
    }
  }, [filtered]);

  const handlePrev = useCallback(() => {
    const next = selectedIndexRef.current - 1;
    if (next >= 0) {
      setSelectedPrompt(structuredClone(filtered[next].prompt));
      setSelectedIndex(next);
      selectedIndexRef.current = next;
    }
  }, [filtered]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-none px-3 sm:px-4 lg:px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="shrink-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">
                Prompt Library
              </h1>
            </div>
            <div className="flex-1 max-w-sm">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          </div>

          {/* 一级筛选：图片类型 */}
          {categories.length > 0 && (
            <div className="grid grid-cols-[auto_1fr] gap-x-2 items-center mt-3">
              <span className="text-sm sm:text-base text-zinc-400 leading-7">图片类型</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <PillBtn active={selectedCategory === null} onClick={() => setSelectedCategory(null)}>
                  全部
                </PillBtn>
                {categories.map((cat) => (
                  <PillBtn key={cat} active={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>
                    {cat}
                  </PillBtn>
                ))}
              </div>
            </div>
          )}

          {/* 二级筛选区域 */}
          <div className="mt-3 space-y-2">
            {/* 建筑类型 + 光影天气（效果图）— 分成两行 */}
            <div
              style={{ display: selectedCategory && CATEGORIES_WITH_BUILDING.has(selectedCategory) ? '' : 'none' }}
            >
              <div className="grid grid-cols-[auto_1fr] gap-x-2 items-center">
                <span className="text-sm sm:text-base text-zinc-400 leading-7">建筑类型</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PillBtn active={selectedBuilding === null} onClick={() => setSelectedBuilding(null)}>
                    全部
                  </PillBtn>
                  {allBuildingTypes.map((t) => (
                    <PillBtn key={t} active={selectedBuilding === t} onClick={() => setSelectedBuilding(t)}>
                      {t}
                    </PillBtn>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 items-center mt-1.5">
                <span className="text-sm sm:text-base text-zinc-400 leading-7">光影天气</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PillBtn active={selectedWeather === null} onClick={() => setSelectedWeather(null)}>
                    全部
                  </PillBtn>
                  {allWeatherTypes.map((t) => (
                    <PillBtn key={t} active={selectedWeather === t} onClick={() => setSelectedWeather(t)}>
                      {t}
                    </PillBtn>
                  ))}
                </div>
              </div>
            </div>

            {/* 分析图类型 */}
            <div
              style={{ display: selectedCategory && CATEGORIES_WITH_DIAGRAM.has(selectedCategory) ? '' : 'none' }}
            >
              <div className="grid grid-cols-[auto_1fr] gap-x-2 items-center">
                <span className="text-sm sm:text-base text-zinc-400 leading-7">分析图类型</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PillBtn active={selectedDiagram === null} onClick={() => setSelectedDiagram(null)}>
                    全部
                  </PillBtn>
                  {allDiagramTypes.map((t) => (
                    <PillBtn key={t} active={selectedDiagram === t} onClick={() => setSelectedDiagram(t)}>
                      {t}
                    </PillBtn>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-5 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800" />
          </div>
        ) : error ? (
          <div className="py-32 text-center">
            <p className="text-sm text-zinc-400">
              Failed to load prompts. Please check your Feishu configuration.
            </p>
            <p className="mt-2 text-xs text-zinc-300">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-32 text-center">
            <p className="text-sm text-zinc-400">No prompts found.</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-6">
            {filtered.map((card, i) => (
              <PromptCard
                key={card.cardKey}
                card={card}
                index={i}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100">
        <div className="mx-auto max-w-none px-6 py-6 text-center text-sm text-zinc-300">
          JGY Prompt Library v1.0
        </div>
      </footer>

      <PromptModal
        prompt={selectedPrompt}
        hasNext={selectedIndex < filtered.length - 1}
        hasPrev={selectedIndex > 0}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
      />
    </div>
  );
}
