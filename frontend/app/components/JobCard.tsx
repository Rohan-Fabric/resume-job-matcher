"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { JobMatch } from "../lib/types";
import { explainJobMatch } from "../lib/api";
import { ScoreRing } from "./ScoreRing";

interface Props {
  job: JobMatch;
  resumeId: number;
  tailoring: boolean;
  onTailor: (job: JobMatch) => void;
  onUpdateJob?: (job: JobMatch) => void;
}

function accentColor(score: number | null): string {
  if (score === null || score === undefined) return "var(--line-strong)";
  if (score >= 7) return "var(--brand)";
  if (score >= 4) return "var(--amber)";
  return "var(--rose)";
}

function locationLabel(job: JobMatch): string {
  if (job.is_remote) return job.location ? `Remote · ${job.location}` : "Remote";
  return job.location || job.country?.toUpperCase() || "—";
}

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

export function JobCard({ job, resumeId, tailoring, onTailor, onUpdateJob }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const matched = job.matched_skills.length;
  const total = matched + job.missing_skills.length;

  const meta = [
    locationLabel(job),
    job.salary_raw,
    job.job_type && jobTypeLabel(job.job_type),
    postedLabel(job.posted_at),
  ]
    .filter(Boolean)
    .join(" · ");

  const summary = job.one_line_summary || job.reasoning;
  const canExplain = job.fit_score != null || !!(job.reasoning || job.experience_fit || total > 0);

  async function handleToggleExplain() {
    if (!expanded && !job.reasoning && !explaining) {
      setExpanded(true);
      setExplaining(true);
      try {
        const explanation = await explainJobMatch(resumeId, job);
        onUpdateJob?.({ ...job, ...explanation });
      } catch (e) {
        console.error("Failed to explain job", e);
      } finally {
        setExplaining(false);
      }
    } else {
      setExpanded(!expanded);
    }
  }

  return (
    <article className="group card-interactive relative overflow-hidden rounded-2xl border border-line bg-surface p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accentColor(job.fit_score) }}
      />

      <div className="flex gap-4 pl-1">
        <ScoreRing score={job.fit_score} />

        <div className="min-w-0 flex-1">
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
          </div>

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

            {canExplain && (
              <button
                onClick={handleToggleExplain}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-ink"
              >
                {explaining ? "Analyzing…" : "Why this match"}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          {expanded && canExplain && (
            <div className="fade-up mt-3 rounded-xl bg-bg p-3.5">
              {explaining ? (
                <div className="space-y-2.5 py-1" aria-hidden="true">
                  <div className="skeleton h-3 w-1/3 rounded-full" />
                  <div className="skeleton h-3 w-full rounded-full" />
                  <div className="skeleton h-3 w-4/5 rounded-full" />
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
