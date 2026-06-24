"use client";

import { useState } from "react";
import { uploadResume, tailorForJob } from "./lib/api";
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

  // tailoring state
  const [activeJob, setActiveJob] = useState<JobMatch | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
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

  function reset() {
    setPhase("idle");
    setResume(null);
    setDone(false);
  }

  const matches = resume?.matches ?? [];
  // best fit first, regardless of location (tier is just a label now)
  const sorted = [...matches].sort(
    (a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1),
  );

  return (
    <div className="hero-glow">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        {/* ── Hero (hidden once results show) ── */}
        {phase !== "results" && (
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Resume-to-role matching
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
              Upload once. <span className="text-brand">Match everywhere.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-ink-soft leading-relaxed">
              Drop your resume and we&apos;ll read it, find live roles that fit your
              background, and tailor your CV to any job in one click.
            </p>
          </div>
        )}

        {/* ── Phase content ── */}
        <div id="upload" className="mt-12">
          {phase === "idle" && (
            <div className="mx-auto max-w-md">
              <UploadCard onSubmit={handleUpload} />
            </div>
          )}

          {phase === "processing" && (
            <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface px-8 py-12 card-lift">
              <ProcessingPipeline done={done} />
            </div>
          )}

          {phase === "error" && (
            <div className="mx-auto max-w-md rounded-2xl border border-rose/30 bg-rose-wash p-6 text-center fade-up">
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

          {phase === "results" && resume && (
            <div className="fade-up">
              {/* results header band */}
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-ink">Your matches</h2>
                  <p className="mt-1 text-sm text-muted">
                    {sorted.length} {sorted.length === 1 ? "role" : "roles"} ranked by fit
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

              <div className="grid items-start gap-8 lg:grid-cols-[300px_1fr]">
                {/* left rail */}
                <aside className="lg:sticky lg:top-24">
                  {resume.profile && <ProfileSummary profile={resume.profile} />}
                </aside>

                {/* matches */}
                <section className="min-w-0">
                  {sorted.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-surface p-12 text-center card-lift">
                      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-bg text-xl">
                        🔍
                      </div>
                      <p className="font-medium text-ink">No roles found yet</p>
                      <p className="mt-1 text-sm text-muted">
                        Try a resume with a clearer job title and location.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {sorted.map((job, i) => (
                        <div key={job.id} className="fade-up" style={{ animationDelay: `${i * 70}ms` }}>
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
                </section>
              </div>
            </div>
          )}
        </div>

        {/* ── How it works (only on landing) ── */}
        {phase === "idle" && (
          <div id="how" className="mx-auto mt-20 max-w-3xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { n: "01", t: "Upload", d: "Drop your PDF resume. We read it instantly." },
                { n: "02", t: "Match", d: "We find live roles and score each by fit." },
                { n: "03", t: "Tailor", d: "One click rewrites your CV for any job." },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-line bg-surface p-5">
                  <span className="font-mono text-xs text-brand">{s.n}</span>
                  <p className="mt-2 font-semibold text-ink">{s.t}</p>
                  <p className="mt-1 text-sm text-ink-soft leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* tailoring overlay → auto-downloads PDF when done */}
      {activeJob && tailorLoading && <TailoringOverlay jobTitle={activeJob.title} />}
    </div>
  );
}
