"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { icon: "🔍", text: "Studying what this role needs" },
  { icon: "🧩", text: "Mapping your experience to it" },
  { icon: "✍️", text: "Rewriting your resume to fit" },
  { icon: "✨", text: "Sharpening the wording" },
  { icon: "📄", text: "Building your PDF" },
];

/** Full-screen, on-demand overlay shown while a single resume is being tailored. */
export function TailoringOverlay({ jobTitle }: { jobTitle: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, STEPS.length - 1)), 1300);
    return () => clearInterval(t);
  }, []);

  const step = STEPS[i];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center card-lift fade-up">
        {/* animated emblem */}
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-brand-wash breathe" />
          <div className="ring-spinner absolute inset-2" />
          <div className="absolute inset-0 grid place-items-center text-2xl">{step.icon}</div>
        </div>

        <h3 className="mt-6 font-semibold text-ink">Tailoring your resume</h3>
        <p className="mt-1 truncate text-sm text-muted">for {jobTitle}</p>

        {/* current step */}
        <p
          key={i}
          className="mt-5 text-sm font-medium text-brand-ink"
          style={{ animation: "fadeUp 0.4s ease both" }}
        >
          {step.text}
        </p>

        {/* step dots */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: idx === i ? 20 : 6,
                background: idx <= i ? "var(--brand)" : "var(--line-strong)",
              }}
            />
          ))}
        </div>

        <p className="mt-5 text-xs text-muted">Your PDF will download automatically.</p>
      </div>
    </div>
  );
}
