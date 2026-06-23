import type { CandidateProfile } from "../lib/types";

export function ProfileSummary({ profile }: { profile: CandidateProfile }) {
  const initials =
    profile.name
      ?.split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface card-lift fade-up">
      {/* teal header band */}
      <div
        className="h-16"
        style={{ background: "linear-gradient(120deg, var(--brand), var(--brand-ink))" }}
      />
      <div className="px-5 pb-5">
        <div className="-mt-8 flex items-end gap-3">
          <span className="grid h-16 w-16 place-items-center rounded-2xl border-4 border-surface bg-brand-wash text-lg font-bold text-brand-ink">
            {initials}
          </span>
        </div>

        <p className="mt-3 truncate text-base font-semibold text-ink">
          {profile.name || "Your profile"}
        </p>
        <p className="truncate text-sm text-muted">
          {[profile.location, profile.country?.toUpperCase()]
            .filter(Boolean)
            .join(" · ") || "Profile extracted"}
        </p>

        {/* meta row */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-bg px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-ink">
              {profile.years_experience ?? "—"}
            </p>
            <p className="text-[11px] text-muted">years exp</p>
          </div>
          <div className="rounded-lg border border-line bg-bg px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-ink">
              {profile.skills?.length ?? 0}
            </p>
            <p className="text-[11px] text-muted">skills found</p>
          </div>
        </div>

        {profile.skills?.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Top skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.slice(0, 10).map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink-soft"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
