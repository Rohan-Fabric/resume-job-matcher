"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Reading your resume…",
  "Understanding your experience…",
  "Scanning live job openings…",
  "Matching roles to your profile…",
  "Scoring each role for fit…",
  "Almost there…",
];

/**
 * One cohesive, always-moving loader for the upload flow.
 * No fake per-step checklist — we don't know which step the backend is on,
 * so we never claim false progress. Indeterminate bar + rotating copy + timer.
 */
export function ProcessingPipeline({ done }: { done: boolean }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (done) return;
    const msg = setInterval(() => setI((v) => (v + 1) % MESSAGES.length), 2200);
    return () => clearInterval(msg);
  }, [done]);

  return (
    <div className="flex flex-col items-center text-center fade-up">
      {/* emblem with orbiting dots */}
      <div className="relative h-24 w-24">
        <div className="orbit absolute inset-0">
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-brand" />
          <span className="absolute left-1/2 bottom-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand/50" />
        </div>
        <div className="absolute inset-2 rounded-full bg-brand-wash breathe" />
        <div className="float absolute inset-0 grid place-items-center text-2xl font-bold text-brand">
          f
        </div>
      </div>

      {done ? (
        <p className="mt-7 flex items-center gap-2 text-base font-semibold text-ink">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-white text-xs">
            ✓
          </span>
          Matches ready
        </p>
      ) : (
        <p
          key={i}
          className="mt-7 text-base font-semibold text-ink"
          style={{ animation: "fadeUp 0.4s ease both" }}
        >
          {MESSAGES[i]}
        </p>
      )}

      {/* indeterminate bar */}
      <div className="indet-track mt-5 h-1.5 w-64 rounded-full bg-line">
        {!done && <div className="indet-bar" />}
        {done && <div className="aurora-bar h-full w-full rounded-full" />}
      </div>

      <p className="mt-4 text-xs text-muted">
        {done ? "Done" : "Hang tight — analysing across live job boards"}
      </p>
    </div>
  );
}
