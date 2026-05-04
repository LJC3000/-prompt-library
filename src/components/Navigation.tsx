"use client";

import GlobalHeader from "@/components/GlobalHeader";
import FilterPanel, { type FilterPanelProps } from "@/components/FilterPanel";

interface NavigationProps extends FilterPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function Navigation({ search, onSearchChange, ...filterProps }: NavigationProps) {
  return (
    <>
      <GlobalHeader search={search} onSearchChange={onSearchChange} />
      {/* Offset for fixed GlobalHeader; FilterPanel is sticky within this space */}
      <div className="pt-[4.75rem]">
        <FilterPanel {...filterProps} />
      </div>
    </>
  );
}
