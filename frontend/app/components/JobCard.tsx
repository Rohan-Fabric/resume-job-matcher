"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { JobMatch } from "../lib/types";
import { ScoreRing } from "./ScoreRing";

interface Props {
  job: JobMatch;
  tailoring: boolean;
  onTailor: (job: JobMatch) => void;
}

/** Accent colour for the card's left strip — mirrors the score-ring tiers.
 *  The colour is the only fit-tier signal now (no repeated text label). */
function accentColor(score: number | null): string {
  if (score === null || score === undefined) return "var(--line-strong)";
  if (score >= 7) return "var(--brand)";
  if (score >= 4) return "var(--amber)";
  return "var(--rose)";
}

/** Show the job's actual city/area. Falls back to country only if the source
 *  gave no location. Remote roles are flagged as such. */
function locationLabel(job: JobMatch): string {
  if (job.is_remote) {
    return job.location ? `Remote · ${job.location}` : "Remote";
  }
  return job.location || job.country?.toUpperCase() || "—";
}

/** "3d ago" / "2w ago" — null/invalid dates render nothing rather than guess. */
function postedLabel(postedAt: string | null): string | null {
  if (!postedAt) return null;
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return null;
  if (days === 0) return "Today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function jobTypeLabel(jobType: string): string {
  return jobType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function JobCard({ job, tailoring, onTailor }: Props) {
  const [expanded, setExpanded] = useState(false);

  const matched = job.matched_skills.length;
  const total = matched + job.missing_skills.length;
  // one quiet meta line instead of a row of pills
  const meta = [
    locationLabel(job),
    job.salary_raw,
    job.job_type && jobTypeLabel(job.job_type),
    postedLabel(job.posted_at),
  ]
    .filter(Boolean)
    .join(" · ");
  // resting summary: prefer the one-liner, fall back to the full reasoning
  const summary = job.one_line_summary || job.reasoning;
  const hasDetail = !!(job.reasoning || job.experience_fit || total > 0);

  return (
    <article className="group card-interactive relative overflow-hidden rounded-2xl border border-line bg-surface p-5">
      {/* tier accent strip — the only fit-tier signal besides the ring */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accentColor(job.fit_score) }}
      />

      <div className="flex gap-4 pl-1">
        <ScoreRing score={job.fit_score} />

        <div className="min-w-0 flex-1">
          {/* title + skill meter on one line */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-ink break-words">
                {job.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-medium text-ink-soft">{job.company || "—"}</span>
                {meta && <span> · {meta}</span>}
              </p>
            </div>

            {total > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-medium tabular-nums text-ink-soft">
                  {matched}/{total} skills
                </p>
                <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(matched / total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* resting summary, or shimmer while unscored */}
          {summary ? (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft break-words">
              {summary}
            </p>
          ) : job.fit_score == null ? (
            <div className="mt-3 space-y-2" aria-hidden="true">
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="skeleton h-3 w-3/4 rounded-full" />
            </div>
          ) : null}

          {/* actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Apply ↗
            </a>
            <button
              onClick={() => onTailor(job)}
              disabled={tailoring}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand-ink disabled:opacity-50"
            >
              {tailoring ? (
                <>
                  <span className="spin h-3.5 w-3.5 rounded-full border-2 border-brand border-t-transparent" />
                  Tailoring…
                </>
              ) : (
                <>↓ Download tailored PDF</>
              )}
            </button>

            {hasDetail && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-ink"
              >
                Why this match
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          {/* expanded detail — reasoning, experience fit, skill gap */}
          {expanded && hasDetail && (
            <div className="fade-up mt-3 rounded-xl bg-bg p-3.5">
              {job.experience_fit && (
                <p className="text-xs">
                  <span className="text-muted">Experience fit: </span>
                  <span className="font-medium text-ink">{job.experience_fit}</span>
                </p>
              )}
              {job.reasoning && (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft break-words">
                  {job.reasoning}
                </p>
              )}
              {total > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.matched_skills.map((s) => (
                    <span
                      key={`m-${s}`}
                      className="rounded-full bg-brand-wash px-2 py-0.5 text-[11px] text-brand-ink"
                    >
                      ✓ {s}
                    </span>
                  ))}
                  {job.missing_skills.map((s) => (
                    <span
                      key={`x-${s}`}
                      className="rounded-full bg-rose-wash px-2 py-0.5 text-[11px] text-rose"
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
    </article>
  );
}
