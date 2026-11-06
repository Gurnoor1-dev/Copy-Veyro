export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-xs text-slate-400 dark:text-slate-500 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded flex items-center justify-center bg-black border border-black dark:border-neutral-900 overflow-hidden">
            <img
              src="/logo.png"
              alt="VEYRO"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <span className="font-bold text-slate-800 dark:text-slate-200">VEYRO</span>
          <span>• Infinite Flight Pilot &amp; ATC Analytics</span>
        </div>

        <div className="text-center sm:text-right space-y-0.5">
          <p className="text-slate-500 dark:text-slate-400">
            Independent analytics tool for Infinite Flight.
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Powered by Infinite Flight Live API v2. In-memory temporary cache (5 min).
          </p>
        </div>
      </div>
    </footer>
  );
}
