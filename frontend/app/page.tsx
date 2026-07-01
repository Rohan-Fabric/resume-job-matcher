"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { uploadResume, tailorForJob, loadMoreJobs } from "./lib/api";
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

// Client-side filtering. Mirrors the backend semantics: an active filter
// excludes any job missing that value — never shows it silently.
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

// Active filters → removable chip descriptors.
function activeChips(f: JobFilters): { key: string; label: string; next: JobFilters }[] {
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

// CSS-safe view-transition-name from a job's source_url (unique per listing).
function vtName(job: JobMatch): string {
  return `job-${job.source_url.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState("");

  // tailoring state
  const [activeJob, setActiveJob] = useState<JobMatch | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);

  // job search controls
  type WorkType = "remote" | "onsite" | "hybrid";
  const [page, setPage] = useState(1);
  const [loc, setLoc] = useState("");
  const [workType, setWorkType] = useState<WorkType>("hybrid");
  const [filterErr, setFilterErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // prefs that produced the current list — load-more continues with these
  const [applied, setApplied] = useState<{ loc: string; type: WorkType }>({ loc: "", type: "hybrid" });

  // `roleQuery` is the live text; `appliedRole` is what produced the current list
  const [roleQuery, setRoleQuery] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  // Sync role fields from the backend exactly once per resume (React render-time
  // state-from-props pattern). Normalise to null so null !== undefined never loops.
  const [syncedResumeId, setSyncedResumeId] = useState<number | null>(null);
  const currentResumeId = resume?.id ?? null;
  if (currentResumeId !== syncedResumeId) {
    setSyncedResumeId(currentResumeId);
    const initial = resume?.profile?.search_role || resume?.profile?.titles?.[0] || "";
    setRoleQuery(initial);
    setAppliedRole(initial);
  }

  const transitionInProgress = useRef(false);

  // Optimistic client-side filters — all matches live in memory, zero latency.
  const [filters, setFilters] = useState<JobFilters>({});

  async function handleUpload(file: File) {
    setPhase("processing");
    setDone(false);
    setError("");
    const started = Date.now();
    try {
      const data = await uploadResume(file);
      const elapsed = Date.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 1200 - elapsed)));
      setDone(true);
      await new Promise((r) => setTimeout(r, 300));
      setResume(data);
      setPhase("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setSearching(true);
      try {
        const useRole = data?.profile?.titles?.[0] || undefined;
        const jobsData = await loadMoreJobs(data.id, 1, { workType: "hybrid", role: useRole });
        setResume(jobsData);
      } catch (err) {
        console.error("initial job search failed", err);
      } finally {
        setSearching(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
    }
  }

  // Wrap a state update in a View Transition so cards animate to new positions.
  function animateTo(next: Resume) {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
        updateCallbackDone: Promise<void>;
      };
    };

    if (!doc.startViewTransition || transitionInProgress.current) {
      setResume(next);
      return;
    }

    transitionInProgress.current = true;
    let transition;
    try {
      // flushSync forces a synchronous DOM update inside the callback so the
      // View Transition API can snapshot before/after correctly.
      transition = doc.startViewTransition(() => flushSync(() => setResume(next)));
    } catch {
      transitionInProgress.current = false;
      setResume(next);
      return;
    }

    // An aborted/skipped transition rejects all three promises with InvalidStateError.
    // Swallow every one — the DOM update already happened; losing the animation is cosmetic.
    const ignore = () => {};
    transition.ready.catch(ignore);
    transition.updateCallbackDone.catch(ignore);
    transition.finished.catch(ignore).finally(() => {
      transitionInProgress.current = false;
    });
  }

  async function handleTailor(job: JobMatch) {
    if (!resume) return;
    setActiveJob(job);
    setTailorLoading(true);
    const started = Date.now();
    try {
      const blob = await tailorForJob(resume.id, job);
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - started))));
      const slug = (text: string, fallback: string) =>
        (text || "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || fallback;
      const fileName = `${slug(resume.profile?.name ?? "", "candidate")}-${slug(job.company, "job")}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error("tailor download failed", e);
      alert("Tailoring is busy right now — please try again in a moment.");
    } finally {
      setTailorLoading(false);
      setActiveJob(null);
    }
  }

  // Fresh search — replaces the current list entirely.
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
        role: useRole || undefined,
      });
      animateTo(data);
      setPage(1);
      setApplied({ loc: useLoc, type: workType });
      setAppliedRole(useRole);
      if (roleOverride) setRoleQuery(roleOverride);
      setFilters({});
    } catch (e) {
      console.error("search failed", e);
    } finally {
      setSearching(false);
    }
  }

  // Load more — fetches the next page and appends, deduping by source_url.
  async function handleMore() {
    if (!resume) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await loadMoreJobs(resume.id, next, {
        location: applied.loc || undefined,
        workType: applied.type,
        role: appliedRole || undefined,
      });
      const existingUrls = new Set(resume.matches.map((j) => j.source_url));
      const fresh = data.matches.filter((j) => !existingUrls.has(j.source_url));
      // Keep existing matches; append only new ones. Take updated profile from response.
      animateTo({ ...data, matches: [...resume.matches, ...fresh] });
      setPage(next);
    } catch (e) {
      console.error("load more failed", e);
    } finally {
      setLoadingMore(false);
    }
  }

  function reset() {
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

  // Merge explanation fields back into the matching job (identity by source_url).
  function handleUpdateJob(updatedJob: JobMatch) {
    setResume((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) =>
          m.source_url === updatedJob.source_url ? updatedJob : m
        ),
      };
    });
  }

  const matches = resume?.matches ?? [];
  const sorted = [...matches].sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
  const visible = sorted.filter((j) => passesFilters(j, filters));
  const chips = activeChips(filters);
  const detectedRole = resume?.profile?.titles?.[0] ?? "";

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
                  {`${visible.length} ${visible.length === 1 ? "role" : "roles"}${chips.length ? " match your filters" : " ranked by fit"}`}
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

            {/* search bar — role · city · work type */}
            <div className="mb-6 rounded-2xl border border-line bg-surface p-2.5 card-lift">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
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

                <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5 lg:w-60">
                  <MapPin className="h-4 w-4 shrink-0 text-muted" />
                  <input
                    value={loc}
                    onChange={(e) => { setLoc(e.target.value); setFilterErr(""); }}
                    onKeyDown={(e) => e.key === "Enter" && !searching && runSearch()}
                    disabled={workType === "remote"}
                    placeholder={workType === "remote" ? "Anywhere · remote" : "City"}
                    className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-50"
                  />
                </div>

                <div className="inline-flex rounded-xl border border-line bg-bg p-1">
                  {(["remote", "hybrid", "onsite"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setWorkType(t); setFilterErr(""); }}
                      className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
                        workType === t ? "bg-brand text-white" : "text-ink-soft hover:text-ink"
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

              {filterErr && <p className="px-1.5 pt-2 text-xs text-rose">{filterErr}</p>}
            </div>

            {/* 3-column: filters · jobs · profile */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)_330px]">
              <aside className="order-2 h-fit xl:order-1 xl:sticky xl:top-24">
                <FilterBar filters={filters} onChange={setFilters} />
              </aside>

              <section className="order-1 min-w-0 xl:order-2">
                {(searching || loadingMore) && (
                  <div className="indet-track mb-4 h-1 w-full overflow-hidden rounded-full bg-line">
                    <div className="indet-bar" />
                  </div>
                )}

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

                {visible.length === 0 && searching ? (
                  <div className="space-y-4 fade-up">
                    <div className="relative overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-r from-brand-wash/60 via-surface to-brand-wash/30 p-8 text-center shadow-sm">
                      <div className="mx-auto mb-5 flex justify-center">
                        <svg
                          viewBox="-9 -2 48 48"
                          className="h-10 w-10 animate-pulse"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-label="fabric"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M15.225 1.32715C13.6063 1.32715 11.9875 1.76946 10.8062 2.87523C9.625 4.02523 9.14375 5.5733 9.14375 7.25407V8.13869H13.125V7.25407C13.125 6.281 13.3875 5.88292 13.6062 5.66176C13.825 5.44061 14.2625 5.21946 15.225 5.21946H25.6812V7.16561C25.6812 7.51946 25.6375 8.93484 25.5938 9.06753C25.55 9.20023 25.5063 9.24446 25.5063 9.24446C25.5063 9.24446 25.4625 9.28869 25.3313 9.33292C25.2 9.37715 24.0625 9.42138 23.7125 9.42138H13.125H9.14375H5.775C4.1125 9.42138 2.5375 9.86369 1.4 11.0137C0.30625 12.1637 0 13.6675 0 15.0829V22.5579H7.9625V18.6656H3.98125V15.0829C3.98125 14.1541 4.2 13.8002 4.33125 13.6675C4.41875 13.5791 4.76875 13.3137 5.775 13.3137H9.14375H13.125H24.5875C25.9437 13.3137 27.3 13.0041 28.3062 11.9868C29.3125 10.9695 29.6625 9.64253 29.6625 8.35984V1.32715H15.225ZM13.125 14.5521H9.14375V17.8695V23.531V25.6541H13.125V23.531V17.8695V14.5521ZM14.35 18.6656V22.5579H20.7375V25.3887C20.7375 26.406 20.475 26.6714 20.4312 26.6714C20.3437 26.7598 19.9938 26.9368 19.1625 26.9368H13.125H9.14375H6.34375C4.50625 26.9368 2.8875 27.4233 1.70625 28.4848C0.481251 29.5906 0 31.0502 0 32.5541V44.1425H5.775C7.91875 44.1425 9.84375 43.656 11.2 42.4175C12.6 41.1348 13.125 39.4098 13.125 37.6406V32.0675H9.14375V37.5964C9.14375 38.6579 8.8375 39.1887 8.4875 39.4983C8.09375 39.8521 7.35 40.206 5.73125 40.206H3.9375V32.5098C3.9375 31.8906 4.15625 31.4925 4.375 31.2714C4.6375 31.0502 5.20625 30.7406 6.3 30.7406H8.88125H13.475H19.0312C20.2563 30.7406 21.7438 30.5195 22.925 29.5464C24.15 28.5291 24.6313 26.981 24.6313 25.3002V18.6656H14.35Z"
                            fill="url(#paint0_linear_fabric_loading)"
                          />
                          <defs>
                            <linearGradient id="paint0_linear_fabric_loading" x1="5.44819" y1="1.04314" x2="23.4825" y2="41.8394" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#E9D7FF" />
                              <stop offset="1" stopColor="#A566F2" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                      <h3 className="font-display text-xl font-bold text-ink">We are conducting a deep global search...</h3>
                      <p className="mt-1.5 text-sm text-muted">Discovering high-fit opportunities and evaluating each role against your resume</p>
                      <div className="indet-track mx-auto mt-6 h-1.5 w-3/4 overflow-hidden rounded-full bg-line">
                        <div className="indet-bar bg-brand" />
                      </div>
                    </div>

                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm">
                        <span className="absolute inset-y-0 left-0 w-1 bg-line-strong animate-pulse" />
                        <div className="flex gap-4 pl-1">
                          <div className="h-12 w-12 shrink-0 rounded-full bg-bg border-4 border-line/40 animate-pulse" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="space-y-1.5">
                              <div className="h-5 w-2/5 rounded-md bg-line/60 animate-pulse" />
                              <div className="h-3.5 w-1/4 rounded-md bg-line/40 animate-pulse" />
                            </div>
                            <div className="space-y-2 pt-1">
                              <div className="h-3 w-full rounded-full bg-line/50 animate-pulse" />
                              <div className="h-3 w-4/5 rounded-full bg-line/40 animate-pulse" />
                            </div>
                            <div className="flex gap-2.5 pt-2">
                              <div className="h-8 w-24 rounded-lg bg-bg border border-line/60 animate-pulse" />
                              <div className="h-8 w-32 rounded-lg bg-bg border border-line/60 animate-pulse" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : visible.length === 0 ? (
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
                        key={job.source_url}
                        className="fade-up"
                        style={{ animationDelay: `${i * 70}ms`, viewTransitionName: vtName(job) }}
                      >
                        <JobCard
                          job={job}
                          resumeId={resume.id}
                          tailoring={tailorLoading && activeJob?.source_url === job.source_url}
                          onTailor={handleTailor}
                          onUpdateJob={handleUpdateJob}
                        />
                      </div>
                    ))}
                  </div>
                )}

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

              <aside className="order-3 h-fit xl:sticky xl:top-24">
                {resume.profile && <ProfileSummary profile={resume.profile} matches={resume.matches} />}
              </aside>
            </div>
          </div>
        ) : (
          /* ── Hero ── */
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

            <HowItWorks />
          </>
        )}
      </div>

      {activeJob && tailorLoading && <TailoringOverlay jobTitle={activeJob.title} />}
    </div>
  );
}
