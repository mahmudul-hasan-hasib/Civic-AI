"use client";

/* Day/Night switch. Self-contained so any route can drop it in without owning
   theme state: Day is the strict default and only an explicit stored "dark"
   opts into Night mode. */

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type CivicTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "civiclens-theme";

function readStoredTheme(): CivicTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: CivicTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useCivicTheme(): {
  theme: CivicTheme;
  toggleTheme: () => void;
} {
  const [theme, setTheme] = useState<CivicTheme>(readStoredTheme);

  /* React state is the source of truth; this effect mirrors it onto <html>,
     the CSS custom properties and localStorage. */
  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage blocked — the theme still applies for this session */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => (previous === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme };
}

export default function ThemeToggle() {
  const { theme, toggleTheme } = useCivicTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to Day mode" : "Switch to Night mode"}
      title={isDark ? "Day mode" : "Night mode"}
      data-testid="theme-toggle"
      className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border p-1 transition ${
        isDark
          ? "civic-glow border-civic-blue/40 bg-civic-soft"
          : "border-civic-line bg-civic-soft hover:border-civic-blue/40"
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
          isDark
            ? "text-civic-muted"
            : "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
          isDark
            ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
            : "text-civic-muted"
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}
