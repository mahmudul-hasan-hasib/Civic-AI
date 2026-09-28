"use client";

import AshokaChakra from "@/components/AshokaChakra";

const LINKS = ["Privacy", "Accessibility", "Help & support", "Data policy"];

export default function CommandFooter() {
  return (
    <footer className="relative z-10 mt-8 border-t border-[#c9dced] bg-[#e5eefa]/80 dark:border-[#1b4578] dark:bg-[#0c2135]/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <AshokaChakra className="h-7 w-7 text-[#1d63b8]" />
          <p className="text-[12px] leading-tight text-slate-600 dark:text-slate-300">
            <span className="font-bold text-[#0f294a] dark:text-white">CivicLens</span>
            <span className="mx-1.5 text-slate-400">/</span>
            Digital Public Infrastructure for civic intelligence
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {LINKS.map((label) => (
            <span
              key={label}
              className="text-[11px] font-medium text-[#1d63b8] dark:text-sky-300"
            >
              {label}
            </span>
          ))}
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Designed for public service · 2026
          </span>
        </div>
      </div>
    </footer>
  );
}
