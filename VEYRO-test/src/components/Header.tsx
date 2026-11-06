import { useState } from "react";
import { Plane, Search, Radio, Headphones, Sun, Moon, Map as MapIcon } from "lucide-react";

interface HeaderProps {
  currentUsername?: string;
  onSearch: (username: string) => void;
  onHomeClick: () => void;
  isLiveFlying?: boolean;
  isLiveControlling?: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  isMapActive?: boolean;
  onToggleMap?: () => void;
}

export default function Header({
  currentUsername,
  onSearch,
  onHomeClick,
  isLiveFlying,
  isLiveControlling,
  isDarkMode,
  onToggleDarkMode,
  isMapActive,
  onToggleMap,
}: HeaderProps) {
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setQuery("");
      setMobileSearchOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3.5 py-2.5 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button
            id="brand-home-btn"
            onClick={onHomeClick}
            className="group flex items-center gap-2.5 text-left focus:outline-none cursor-pointer"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-black border border-black dark:border-neutral-900 transition-transform group-hover:scale-105 overflow-hidden p-0.5">
              <img
                src="/logo.png"
                alt="VEYRO"
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
              {isLiveFlying && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                VEYRO
              </span>
              <span className="hidden text-xs text-slate-400 dark:text-slate-400 sm:inline font-normal">
                Infinite Flight Stats
              </span>
            </div>
          </button>
        </div>

        {/* Quick search in header (Desktop) */}
        {currentUsername && (
          <form
            onSubmit={handleSubmit}
            className="hidden sm:flex items-center relative max-w-xs w-full mx-4"
          >
            <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              id="header-pilot-search"
              type="text"
              placeholder="Search pilot (e.g. Tyler)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 py-1.5 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 transition focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
            />
          </form>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile search toggle button */}
          {currentUsername && (
            <button
              id="mobile-search-toggle-btn"
              type="button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Search pilot"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          {isLiveControlling ? (
            <div className="flex items-center gap-1 sm:gap-1.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs text-sky-800 dark:text-sky-300 font-medium">
              <Headphones className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-pulse text-sky-500 shrink-0" />
              <span>Controlling</span>
            </div>
          ) : isLiveFlying ? (
            <div className="flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              <Radio className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-pulse text-emerald-500 shrink-0" />
              <span>Airborne</span>
            </div>
          ) : null}

          {/* Map Button (Only available on Tablet and Desktop) */}
          {onToggleMap && (
            <button
              id="header-map-btn"
              type="button"
              onClick={onToggleMap}
              className={`hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition cursor-pointer ${
                isMapActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs font-semibold"
                  : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              aria-label="Approach Controller Whiteboard Map"
              title="Approach Controller Whiteboard Map (Tablet & Desktop)"
            >
              <MapIcon className="h-3.5 w-3.5 shrink-0 text-current opacity-80" />
              <span>Map</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          {onToggleDarkMode && (
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={onToggleDarkMode}
              className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition cursor-pointer"
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={isDarkMode ? "Light Mode" : "Dark Mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-white" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Search Input Drawer (Visible only when toggled on mobile) */}
      {currentUsername && mobileSearchOpen && (
        <div className="sm:hidden px-3.5 pb-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <form onSubmit={handleSubmit} className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              id="mobile-header-pilot-search"
              type="text"
              autoFocus
              placeholder="Search pilot IFC username..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </form>
        </div>
      )}
    </header>
  );
}
