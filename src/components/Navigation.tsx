"use client";

import GlobalHeader from "@/components/GlobalHeader";
import type { FilterPanelProps } from "@/components/FilterPanel";

interface NavigationProps extends FilterPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function Navigation({ search, onSearchChange, ...filterProps }: NavigationProps) {
  return (
    <>
      <GlobalHeader search={search} onSearchChange={onSearchChange} {...filterProps} />
      {/* Offset fixed header — prevents content from hiding behind the capsule */}
      <div className="h-16 sm:h-20" />
    </>
  );
}
