"use client";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-lg">
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-300 mt-0.5"
        width="20"
        height="20"
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
        placeholder="Search prompts..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white py-3.5 pl-11 pr-4 text-lg text-zinc-800 placeholder-zinc-400 transition-colors duration-200 focus:border-zinc-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
