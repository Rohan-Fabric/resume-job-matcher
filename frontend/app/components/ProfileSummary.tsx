import type { CandidateProfile, JobMatch } from "../lib/types";
import { Mail, Phone, MapPin, CheckCircle } from "lucide-react";
import { FaLinkedin, FaGithub } from "react-icons/fa";

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
      className="group grid h-11 w-11 place-items-center rounded-full border border-line text-ink-soft transition-all duration-300 hover:border-brand hover:bg-brand hover:text-white hover:scale-110 hover:shadow-lg hover:shadow-brand/25"
    >
      {children}
    </a>
  );
}

export function ProfileSummary({ profile, matches }: { profile: CandidateProfile; matches?: JobMatch[] }) {
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

  // Profile completeness: checks key fields
  const completenessScore = [
    profile.email,
    profile.phone,
    profile.linkedin,
    profile.github,
    profile.skills?.length,
    profile.years_experience,
  ].filter(Boolean).length;
  const completenessLabel = completenessScore >= 5 ? "Strong" : completenessScore >= 3 ? "Good" : "Basic";
  const completenessColor = completenessScore >= 5 ? "text-brand" : completenessScore >= 3 ? "text-amber" : "text-rose";

  // Skill demand: count jobs requiring each skill (case-insensitive match)
  const skillDemand = matches ? profile.skills.slice(0, 5).map(skill => ({
    skill,
    count: matches.filter(j =>
      j.matched_skills?.some(s => s.toLowerCase() === skill.toLowerCase()) ||
      j.missing_skills?.some(s => s.toLowerCase() === skill.toLowerCase())
    ).length
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count) : [];

  return (
    <div className="rounded-3xl border border-line bg-surface card-lift fade-up max-h-[calc(100vh-6rem)] overflow-y-auto">
      {/* cover band */}
      <div
        className="h-24 shrink-0"
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
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <CheckCircle className={`h-3.5 w-3.5 ${completenessColor}`} />
          <span className={completenessColor}>Profile: {completenessLabel}</span>
        </p>
        {place && (
          <p className="mt-1.5 flex items-center justify-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5" />
            {place}
          </p>
        )}

        {/* contact — pretty icon buttons, only what the resume had */}
        {(profile.email || profile.phone || profile.linkedin || profile.github) && (
          <div className="mt-5 flex justify-center gap-2.5">
            {profile.email && (
              <ContactBtn href={`mailto:${profile.email}`} label={profile.email}>
                <Mail className="h-[18px] w-[18px]" />
              </ContactBtn>
            )}
            {profile.phone && (
              <ContactBtn href={`tel:${profile.phone}`} label={profile.phone}>
                <Phone className="h-[18px] w-[18px]" />
              </ContactBtn>
            )}
            {profile.linkedin && (
              <ContactBtn href={profile.linkedin} label="LinkedIn" external>
                <FaLinkedin className="h-[18px] w-[18px]" />
              </ContactBtn>
            )}
            {profile.github && (
              <ContactBtn href={profile.github} label="GitHub" external>
                <FaGithub className="h-[18px] w-[18px]" />
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

        {/* skills with demand */}
        {profile.skills?.length > 0 && (
          <div className="mt-6 text-left">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Top skills
            </p>
            {skillDemand.length > 0 ? (
              <div className="space-y-2">
                {skillDemand.map(({ skill, count }) => {
                  const maxCount = Math.max(...skillDemand.map(s => s.count));
                  const width = (count / maxCount) * 100;
                  return (
                    <div key={skill} className="flex items-center gap-2">
                      <span className="w-20 text-xs text-ink-soft truncate">{skill}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-brand transition-all duration-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted tabular-nums">{count} jobs</span>
                    </div>
                  );
                })}
              </div>
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
