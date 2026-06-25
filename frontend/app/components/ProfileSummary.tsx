import type { CandidateProfile } from "../lib/types";

/* inline icons — currentColor so they inherit hover/text color, no icon dep */
const ICON = "h-[18px] w-[18px]";
const IconMail = () => (
  <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconLinkedIn = () => (
  <svg viewBox="0 0 24 24" className={ICON} fill="currentColor">
    <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM0 8h5v16H0V8zm7.5 0h4.78v2.2h.07c.67-1.2 2.3-2.46 4.73-2.46C21.8 7.74 24 10 24 14.6V24h-5v-8.2c0-1.96-.04-4.48-2.73-4.48-2.73 0-3.15 2.13-3.15 4.34V24h-5V8z" />
  </svg>
);
const IconGitHub = () => (
  <svg viewBox="0 0 24 24" className={ICON} fill="currentColor">
    <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0024 12.5C24 5.87 18.63.5 12 .5z" />
  </svg>
);
const IconPin = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

function ContactBtn({
  href, label, external, children,
}: {
  href: string; label: string; external?: boolean; children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink-soft transition-all hover:border-brand hover:bg-brand-wash hover:text-brand hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

export function ProfileSummary({ profile }: { profile: CandidateProfile }) {
  const initials =
    profile.name
      ?.split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  const place = [profile.location, profile.country?.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface card-lift fade-up">
      {/* cover band */}
      <div
        className="h-24"
        style={{ background: "linear-gradient(120deg, var(--brand), var(--brand-ink))" }}
      />

      <div className="-mt-14 px-6 pb-7 text-center">
        {/* avatar with gradient ring */}
        <span className="mx-auto grid h-28 w-28 place-items-center rounded-full border-4 border-surface bg-brand-wash text-3xl font-bold text-brand-ink shadow-sm">
          {initials}
        </span>

        <p className="mt-4 text-xl font-semibold text-ink">
          {profile.name || "Your profile"}
        </p>
        {profile.titles?.[0] && (
          <p className="mt-0.5 text-sm font-medium text-brand">{profile.titles[0]}</p>
        )}
        {place && (
          <p className="mt-1.5 flex items-center justify-center gap-1 text-sm text-muted">
            <IconPin />
            {place}
          </p>
        )}

        {/* contact — pretty icon buttons, only what the resume had */}
        {(profile.email || profile.phone || profile.linkedin || profile.github) && (
          <div className="mt-5 flex justify-center gap-2.5">
            {profile.email && (
              <ContactBtn href={`mailto:${profile.email}`} label={profile.email}>
                <IconMail />
              </ContactBtn>
            )}
            {profile.phone && (
              <ContactBtn href={`tel:${profile.phone}`} label={profile.phone}>
                <IconPhone />
              </ContactBtn>
            )}
            {profile.linkedin && (
              <ContactBtn href={profile.linkedin} label="LinkedIn" external>
                <IconLinkedIn />
              </ContactBtn>
            )}
            {profile.github && (
              <ContactBtn href={profile.github} label="GitHub" external>
                <IconGitHub />
              </ContactBtn>
            )}
          </div>
        )}

        {/* stats — instagram-style row */}
        <div className="mt-6 flex items-center justify-center divide-x divide-line rounded-2xl border border-line bg-bg">
          <div className="flex-1 px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {profile.years_experience ?? "—"}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">years exp</p>
          </div>
          <div className="flex-1 px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {profile.skills?.length ?? 0}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">skills</p>
          </div>
        </div>

        {/* skills */}
        {profile.skills?.length > 0 && (
          <div className="mt-6 text-left">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Top skills
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.skills.slice(0, 12).map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-ink-soft"
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
