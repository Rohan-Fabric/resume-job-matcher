"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { uploadResume, tailorForJob, loadMoreJobs, scoreBatch } from "./lib/api";
import type { JobMatch, Resume } from "./lib/types";
import { UploadCard } from "./components/UploadCard";
import { ProcessingPipeline } from "./components/ProcessingPipeline";
import { ProfileSummary } from "./components/ProfileSummary";
import { JobCard } from "./components/JobCard";
import { TailoringOverlay } from "./components/TailoringOverlay";

type Phase = "idle" | "processing" | "results" | "error";

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
      startViewTransition?: (cb: () => void) => void;
    };
    if (doc.startViewTransition) {
      doc.startViewTransition(() => flushSync(() => setResume(next)));
    } else {
      setResume(next);
    }
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

  // Fresh search with preferences — clears the current list, shows only new.
  async function runSearch() {
    if (!resume) return;
    // onsite/hybrid need a city; remote ignores it
    if (workType !== "remote" && !loc.trim()) {
      setFilterErr("Enter a city for onsite or hybrid roles.");
      return;
    }
    setFilterErr("");
    setSearching(true);
    const useLoc = workType === "remote" ? "" : loc.trim();
    try {
      const data = await loadMoreJobs(resume.id, 1, {
        location: useLoc,
        workType,
        replace: true,
      });
      setResume(data);
      setPage(1);
      setApplied({ loc: useLoc, type: workType });
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
  }

  const matches = resume?.matches ?? [];
  // best fit first; unscored (null) sink to the bottom and rise as they're scored
  const sorted = [...matches].sort(
    (a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1),
  );
  const scoredCount = matches.filter((m) => m.fit_score != null).length;

  return (
    <div className="hero-glow">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
        {phase === "results" && resume ? (
          /* ── Results ── */
          <div className="fade-up">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-4xl text-ink">Your matches</h2>
                <p className="mt-1 text-sm text-muted">
                  {scoring
                    ? `Scoring ${scoredCount} of ${sorted.length} matches…`
                    : `${sorted.length} ${sorted.length === 1 ? "role" : "roles"} ranked by fit`}
                  {resume.profile?.titles?.[0]
                    ? ` · based on your ${resume.profile.titles[0]} profile`
                    : ""}
                </p>
              </div>
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                ↑ New search
              </button>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-[380px_1fr]">
              <aside className="lg:sticky lg:top-24">
                {resume.profile && <ProfileSummary profile={resume.profile} />}
              </aside>

              <section className="min-w-0">
                {/* search — work type + city, minimal */}
                <div className="mb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* work-type segmented control */}
                    <div className="inline-flex rounded-full border border-line bg-bg p-1">
                      {(["remote", "hybrid", "onsite"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setWorkType(t);
                            setFilterErr("");
                          }}
                          className={`rounded-full px-3.5 py-1.5 text-sm capitalize transition-colors ${
                            workType === t
                              ? "bg-brand text-white"
                              : "text-ink-soft hover:text-ink"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {/* city */}
                    <input
                      value={loc}
                      onChange={(e) => {
                        setLoc(e.target.value);
                        setFilterErr("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && !searching && runSearch()}
                      disabled={workType === "remote"}
                      placeholder={
                        workType === "remote"
                          ? "Anywhere · remote"
                          : `City (e.g. ${resume.profile?.location || "your city"})`
                      }
                      className="min-w-[12rem] flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink outline-none transition-colors focus:border-brand disabled:opacity-50"
                    />

                    <button
                      onClick={runSearch}
                      disabled={searching}
                      className="btn-primary rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:shadow-none"
                    >
                      {searching ? "Searching…" : "Search"}
                    </button>
                  </div>
                  {filterErr && (
                    <p className="mt-2 px-1 text-xs text-rose">{filterErr}</p>
                  )}
                </div>

                {/* live loading bar — shows a backend call (search or scoring) is running */}
                {(searching || loadingMore || scoring) && (
                  <div className="indet-track mb-4 h-1 w-full overflow-hidden rounded-full bg-line">
                    <div className="indet-bar" />
                  </div>
                )}

                {sorted.length === 0 ? (
                  <div className="rounded-2xl border border-line bg-surface p-12 text-center card-lift">
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-bg text-xl">
                      🔍
                    </div>
                    <p className="font-medium text-ink">No roles for these filters</p>
                    <p className="mt-1 text-sm text-muted">
                      Try a different city or work type above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {sorted.map((job, i) => (
                      <div
                        key={job.id}
                        className="fade-up"
                        style={{ animationDelay: `${i * 70}ms`, viewTransitionName: `job-${job.id}` }}
                      >
                        <JobCard
                          job={job}
                          rank={i + 1}
                          tailoring={tailorLoading && activeJob?.id === job.id}
                          onTailor={handleTailor}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* load more — same prefs, skipping jobs already shown */}
                {sorted.length > 0 && (
                  <button
                    onClick={handleMore}
                    disabled={loadingMore}
                    className="mt-5 w-full rounded-xl border border-line bg-surface py-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    {loadingMore ? "Finding more roles…" : "Load more jobs"}
                  </button>
                )}
              </section>
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
            <div id="how" className="mx-auto mt-24 max-w-4xl">
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  { n: "01", t: "Upload", d: "Drop your PDF resume. We read it instantly." },
                  { n: "02", t: "Match", d: "We find live roles and score each by fit." },
                  { n: "03", t: "Tailor", d: "One click rewrites your CV for any job." },
                ].map((s) => (
                  <div key={s.n} className="card-interactive rounded-2xl border border-line bg-surface p-6">
                    <span className="font-mono text-sm font-medium text-brand">{s.n}</span>
                    <p className="mt-3 font-semibold text-ink">{s.t}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* tailoring overlay → auto-downloads PDF when done */}
      {activeJob && tailorLoading && <TailoringOverlay jobTitle={activeJob.title} />}
    </div>
  );
}
