"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { uploadResume, tailorForJob, loadMoreJobs, scoreBatch } from "./lib/api";
import type { JobFilters, JobMatch, Resume } from "./lib/types";
import { Search, MapPin } from "lucide-react";
import { UploadCard } from "./components/UploadCard";
import { ProcessingPipeline } from "./components/ProcessingPipeline";
import { ProfileSummary } from "./components/ProfileSummary";
import { JobCard } from "./components/JobCard";
import { TailoringOverlay } from "./components/TailoringOverlay";
import { HowItWorks } from "./components/HowItWorks";
import { FilterBar } from "./components/FilterBar";

type Phase = "idle" | "processing" | "results" | "error";

// Optimistic client-side filtering. Mirrors the backend repository semantics:
// an active filter excludes any job missing that value (never shows it silently).
function passesFilters(job: JobMatch, f: JobFilters): boolean {
  if (f.remote && !job.is_remote) return false;
  if (f.jobType?.length && !f.jobType.includes(job.job_type)) return false;

  if (f.postedWithin) {
    if (!job.posted_at) return false;
    const days = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000;
    if (Number.isNaN(days) || days > f.postedWithin) return false;
  }
  return true;
}

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Active filters → removable chip descriptors (label + the next filter state
// once removed), so the results column shows what's narrowing it.
function activeChips(
  f: JobFilters,
): { key: string; label: string; next: JobFilters }[] {
  const chips: { key: string; label: string; next: JobFilters }[] = [];
  if (f.postedWithin) {
    const label = { 1: "Last 24 hours", 7: "Last 7 days", 30: "Last 30 days" }[f.postedWithin];
    chips.push({ key: "posted", label, next: { ...f, postedWithin: undefined } });
  }
  for (const t of f.jobType ?? []) {
    chips.push({
      key: `type-${t}`,
      label: titleCase(t),
      next: { ...f, jobType: (f.jobType ?? []).filter((x) => x !== t) || undefined },
    });
  }

  if (f.remote) {
    chips.push({ key: "remote", label: "Remote only", next: { ...f, remote: undefined } });
  }
  return chips;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState("");
  // progressive scoring — cards render unscored, then fill in batch-by-batch
  const [scoring, setScoring] = useState(false);
  const scoringRef = useRef<number | null>(null);

  // tailoring state
  const [activeJob, setActiveJob] = useState<JobMatch | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);

  // job search (work-type + city) / load-more
  type WorkType = "remote" | "onsite" | "hybrid";
  const [page, setPage] = useState(1);
  const [loc, setLoc] = useState("");
  const [workType, setWorkType] = useState<WorkType>("hybrid");
  const [filterErr, setFilterErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // prefs that produced the CURRENT list — load-more continues with these
  const [applied, setApplied] = useState<{ loc: string; type: WorkType }>({
    loc: "",
    type: "hybrid",
  });
  // Editable search role. `roleQuery` is the live text in the search box;
  // `appliedRole` is the role that produced the CURRENT list (so load-more
  // continues with it). Both default to the backend-persisted search_role,
  // else the resume's detected role. The resume is never re-parsed when this
  // changes — only the job-search query does.
  const [roleQuery, setRoleQuery] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  // Re-sync from the backend exactly once per resume — React's own pattern for
  // "reset derived state when a prop changes": setState during render, guarded
  // by comparing against the last-seen id, so it never fights a later user edit
  // and never loops (undefined-normalized so it can't spin on a null vs undefined).
  const [syncedResumeId, setSyncedResumeId] = useState<number | null>(null);
  const currentResumeId = resume?.id ?? null;
  if (currentResumeId !== syncedResumeId) {
    setSyncedResumeId(currentResumeId);
    const initial = resume?.profile?.search_role || resume?.profile?.titles?.[0] || "";
    setRoleQuery(initial);
    setAppliedRole(initial);
  }

  // Track if a view transition is in progress
  const transitionInProgress = useRef(false);

  // Result filters are applied OPTIMISTICALLY, client-side: every match (≤25)
  // already lives in memory, so filtering is a pure render-time derivation —
  // zero latency, no round-trip, and no way for a background scoring poll to
  // clobber the view. `resume.matches` always stays the full set.
  const [filters, setFilters] = useState<JobFilters>({});

  async function handleUpload(file: File) {
    setPhase("processing");
    setDone(false);
    setError("");
    const started = Date.now();
    try {
      const data = await uploadResume(file);
      // keep the pipeline visible for a beat so it doesn't flash
      const elapsed = Date.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 2600 - elapsed)));
      setDone(true);
      await new Promise((r) => setTimeout(r, 500));
      setResume(data);
      setPhase("results");
      runScoring(data.id); // cards are up — now fill scores in live
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
    }
  }

  // Re-render under a View Transition so cards slide into their new ranked
  // positions as scores land (falls back to an instant update where unsupported).
  function animateTo(next: Resume) {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
        updateCallbackDone: Promise<void>;
      };
    };

    // No support, or one's already running → update directly (never overlap two
    // transitions; the second would abort the first and reject its promises).
    if (!doc.startViewTransition || transitionInProgress.current) {
      setResume(next);
      return;
    }

    transitionInProgress.current = true;
    let transition;
    try {
      // flushSync forces the DOM to update synchronously inside this callback —
      // the View Transition API snapshots before/after state around it; without
      // it React's batched setState leaves the DOM stale when the browser takes
      // its "after" snapshot, which throws InvalidStateError.
      transition = doc.startViewTransition(() => flushSync(() => setResume(next)));
    } catch {
      transitionInProgress.current = false;
      setResume(next);
      return;
    }

    // An aborted/skipped transition rejects ALL of ready/finished/updateCallbackDone
    // with InvalidStateError. Swallow every one — an unhandled rejection on any of
    // them is what Next's dev overlay surfaces as a runtime error. The DOM update
    // already ran synchronously in the callback, so a lost animation is cosmetic.
    const ignore = () => {};
    transition.ready.catch(ignore);
    transition.updateCallbackDone.catch(ignore);
    transition.finished.catch(ignore).finally(() => {
      transitionInProgress.current = false;
    });
  }

  // Score not-yet-scored jobs in batches until none remain, updating live.
  async function runScoring(resumeId: number) {
    if (scoringRef.current === resumeId) return; // already scoring this resume
    scoringRef.current = resumeId;
    setScoring(true);
    try {
      let done = false;
      while (!done) {
        const res = await scoreBatch(resumeId);
        if (scoringRef.current !== resumeId) return; // superseded by a newer search
        animateTo(res.resume);
        done = res.done;
      }
    } catch (e) {
      console.error("scoring failed", e); // leave cards unscored, don't crash the page
    } finally {
      if (scoringRef.current === resumeId) {
        scoringRef.current = null;
        setScoring(false);
      }
    }
  }

  async function handleTailor(job: JobMatch) {
    setActiveJob(job);
    setTailorLoading(true);
    const started = Date.now();
    try {
      const blob = await tailorForJob(job.id);
      // let the overlay breathe so it never flashes
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - started))));
      const slug = (text: string, fallback: string) =>
        (text || "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || fallback;
      const fileName = `${slug(resume?.profile?.name ?? "", "candidate")}-${slug(job.company, "job")}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a); // must be in the DOM for .click() to fire reliably
      a.click();
      a.remove();
      // revoke AFTER the browser starts the download, else it cancels mid-stream
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error("tailor download failed", e); // don't swallow silently
    } finally {
      setTailorLoading(false);
      setActiveJob(null);
    }
  }

  // Fresh search — clears the current list, shows only new. `roleOverride`
  // lets the "reset to detected" link search a specific role without waiting
  // for roleQuery state to flush; otherwise the live search-box value is used.
  // The resume is never re-parsed — only the job-search query changes.
  async function runSearch(roleOverride?: string) {
    if (!resume) return;
    setFilterErr("");
    setSearching(true);
    const useLoc = workType === "remote" ? "" : loc.trim();
    const useRole = (roleOverride ?? roleQuery).trim();
    try {
      const data = await loadMoreJobs(resume.id, 1, {
        location: useLoc,
        workType,
        replace: true,
        role: useRole || undefined,
      });
      setResume(data);
      setPage(1);
      setApplied({ loc: useLoc, type: workType });
      setAppliedRole(useRole);
      if (roleOverride) setRoleQuery(roleOverride);
      setFilters({}); // a fresh search resets any active result filters
      runScoring(data.id);
    } catch (e) {
      console.error("search failed", e);
    } finally {
      setSearching(false);
    }
  }

  // Load more of the CURRENT result set (same prefs), skipping duplicates.
  async function handleMore() {
    if (!resume) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await loadMoreJobs(resume.id, next, {
        location: applied.loc || undefined,
        workType: applied.type,
        replace: false,
        role: appliedRole || undefined,
      });
      setResume(data);
      setPage(next);
      runScoring(data.id);
    } catch (e) {
      console.error("load more failed", e);
    } finally {
      setLoadingMore(false);
    }
  }

  function reset() {
    scoringRef.current = null; // stop any in-flight scoring loop
    setScoring(false);
    setPhase("idle");
    setResume(null);
    setDone(false);
    setPage(1);
    setLoc("");
    setWorkType("hybrid");
    setFilterErr("");
    setApplied({ loc: "", type: "hybrid" });
    setRoleQuery("");
    setFilters({});
  }

  function handleUpdateJob(updatedJob: JobMatch) {
    setResume((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) => (m.id === updatedJob.id ? updatedJob : m)),
      };
    });
  }

  const matches = resume?.matches ?? [];
  // best fit first; unscored (null) sink to the bottom and rise as they're scored
  const sorted = [...matches].sort(
    (a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1),
  );
  // client-side filter (mirrors the backend's semantics: a job with no value
  // for an active filter is excluded, never silently shown)
  const visible = sorted.filter((j) => passesFilters(j, filters));
  const chips = activeChips(filters);
  const scoredCount = visible.filter((m) => m.fit_score != null).length;
  const detectedRole = resume?.profile?.titles?.[0] ?? "";
  const roleOverridden =
    roleQuery.trim() !== "" && roleQuery.trim() !== detectedRole;

  return (
    <div className="hero-glow">
      <div className="px-6 py-20 sm:py-28 lg:px-8">
        {phase === "results" && resume ? (
          /* ── Results ── */
          <div className="fade-up mx-auto max-w-[1680px]">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-4xl text-ink">Your matches</h2>
                <p className="mt-1 text-sm text-muted">
                  {scoring
                    ? `Scoring ${scoredCount} of ${visible.length} matches…`
                    : `${visible.length} ${visible.length === 1 ? "role" : "roles"}${chips.length ? " match your filters" : " ranked by fit"}`}
                  {detectedRole ? " · based on your resume" : ""}
                </p>
              </div>
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                ↑ New search
              </button>
            </div>

            {/* search bar — what (role) · where (city) · work type */}
            <div className="mb-6 rounded-2xl border border-line bg-surface p-2.5 card-lift">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                {/* role */}
                <div className="flex flex-1 items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-muted" />
                  <input
                    value={roleQuery}
                    onChange={(e) => setRoleQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !searching && runSearch()}
                    placeholder="Job title or role"
                    className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                  />
                </div>

                {/* city */}
                <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5 lg:w-60">
                  <MapPin className="h-4 w-4 shrink-0 text-muted" />
                  <input
                    value={loc}
                    onChange={(e) => {
                      setLoc(e.target.value);
                      setFilterErr("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && !searching && runSearch()}
                    disabled={workType === "remote"}
                    placeholder={workType === "remote" ? "Anywhere · remote" : "City"}
                    className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-50"
                  />
                </div>

                {/* work-type segmented control */}
                <div className="inline-flex rounded-xl border border-line bg-bg p-1">
                  {(["remote", "hybrid", "onsite"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setWorkType(t);
                        setFilterErr("");
                      }}
                      className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
                        workType === t
                          ? "bg-brand text-white"
                          : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => runSearch()}
                  disabled={searching}
                  className="btn-primary rounded-xl px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:shadow-none"
                >
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>

              {filterErr && (
                <p className="px-1.5 pt-2 text-xs text-rose">{filterErr}</p>
              )}
            </div>

            {/* 3-column: filters · jobs · profile */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)_330px]">
              {/* filters */}
              <aside className="order-2 h-fit xl:order-1 xl:sticky xl:top-24">
                <FilterBar filters={filters} onChange={setFilters} />
              </aside>

              {/* jobs */}
              <section className="order-1 min-w-0 xl:order-2">
                {/* live loading bar — search/scoring only (filters are instant) */}
                {(searching || loadingMore || scoring) && (
                  <div className="indet-track mb-4 h-1 w-full overflow-hidden rounded-full bg-line">
                    <div className="indet-bar" />
                  </div>
                )}

                {/* active filter chips — remove one with a click */}
                {chips.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {chips.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setFilters(c.next)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-3 py-1 text-xs font-medium text-brand-ink transition-colors hover:bg-brand hover:text-white"
                      >
                        {c.label}
                        <span aria-hidden>✕</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setFilters({})}
                      className="text-xs font-medium text-muted transition-colors hover:text-ink"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {visible.length === 0 ? (
                  <div className="rounded-2xl border border-line bg-surface p-12 text-center card-lift">
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-bg text-xl">
                      🔍
                    </div>
                    <p className="font-medium text-ink">No roles match these filters</p>
                    <p className="mt-1 text-sm text-muted">
                      {chips.length > 0
                        ? "Loosen a filter, or start a new search above."
                        : "Try a different role, city, or work type above."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {visible.map((job, i) => (
                      <div
                        key={job.id}
                        className="fade-up"
                        style={{ animationDelay: `${i * 70}ms`, viewTransitionName: `job-${job.id}` }}
                      >
                        <JobCard
                          job={job}
                          tailoring={tailorLoading && activeJob?.id === job.id}
                          onTailor={handleTailor}
                          onUpdateJob={handleUpdateJob}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* load more — same prefs, skipping jobs already shown */}
                {visible.length > 0 && (
                  <button
                    onClick={handleMore}
                    disabled={loadingMore}
                    className="mt-5 w-full rounded-xl border border-line bg-surface py-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    {loadingMore ? "Finding more roles…" : "Load more jobs"}
                  </button>
                )}
              </section>

              {/* profile */}
              <aside className="order-3 h-fit xl:sticky xl:top-24">
                {resume.profile && <ProfileSummary profile={resume.profile} matches={resume.matches} />}
              </aside>
            </div>
          </div>
        ) : (
          /* ── Hero: centered, elegant ── */
          <>
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <h1 className="hero-headline">
                Agentic AI for
                <br />
                <em>your job search</em>
              </h1>

              <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-muted">
                Reading your resume, sourcing live roles, scoring every match, and
                tailoring your CV — each run by a specialized agent, coordinated as
                one team. You review ranked matches instead of doing the steps.
              </p>
            </div>

            {/* interactive — centered below the copy */}
            <div id="upload" className="mx-auto mt-10 w-full max-w-xl">
              {phase === "idle" && <UploadCard onSubmit={handleUpload} />}

              {phase === "processing" && (
                <div className="rounded-2xl border border-line bg-surface px-8 py-12 card-lift">
                  <ProcessingPipeline done={done} />
                </div>
              )}

              {phase === "error" && (
                <div className="rounded-2xl border border-rose/30 bg-rose-wash p-6 text-center fade-up">
                  <p className="font-medium text-ink">We couldn&apos;t process that</p>
                  <p className="mt-1 text-sm text-ink-soft">{error}</p>
                  <button
                    onClick={reset}
                    className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* How it works — stays visible through upload + loading */}
            <HowItWorks />
          </>
        )}
      </div>

      {/* tailoring overlay → auto-downloads PDF when done */}
      {activeJob && tailorLoading && <TailoringOverlay jobTitle={activeJob.title} />}
    </div>
  );
}
