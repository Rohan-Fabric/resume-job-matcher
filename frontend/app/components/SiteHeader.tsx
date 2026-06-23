export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        {/* brand */}
        <a href="/" className="group flex items-center gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white text-base font-bold shadow-sm transition-transform group-hover:scale-105"
            style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-ink))" }}
          >
            f
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight text-ink">
              fabric <span className="text-brand">JobMatch</span>
            </span>
            <span className="block text-[11px] text-muted -mt-0.5">
              resume-to-role, instantly
            </span>
          </span>
        </a>

        {/* right: tasteful AI badge (not a nav link) */}
        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs font-medium text-ink-soft">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" />
          AI-powered matching
        </span>
      </div>
    </header>
  );
}
