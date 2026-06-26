"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Studying what this role needs",
  "Mapping your experience to it",
  "Rewriting your resume to fit",
  "Sharpening the wording",
  "Building your PDF",
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
        {/* animated emblem — fabric mark inside a breathing/spinning ring */}
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-brand-wash breathe" />
          <div className="ring-spinner absolute inset-2" />
          <div className="absolute inset-0 grid place-items-center">
            <svg viewBox="0 0 30 46" className="float h-9 w-auto" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="tailorFabric" x1="5.45" y1="1.04" x2="23.48" y2="41.84" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7c40de" />
                  <stop offset="1" stopColor="#a566f2" />
                </linearGradient>
              </defs>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="url(#tailorFabric)"
                d="M15.225 1.32715C13.6063 1.32715 11.9875 1.76946 10.8062 2.87523C9.625 4.02523 9.14375 5.5733 9.14375 7.25407V8.13869H13.125V7.25407C13.125 6.281 13.3875 5.88292 13.6062 5.66176C13.825 5.44061 14.2625 5.21946 15.225 5.21946H25.6812V7.16561C25.6812 7.51946 25.6375 8.93484 25.5938 9.06753C25.55 9.20023 25.5063 9.24446 25.5063 9.24446C25.5063 9.24446 25.4625 9.28869 25.3313 9.33292C25.2 9.37715 24.0625 9.42138 23.7125 9.42138H13.125H9.14375H5.775C4.1125 9.42138 2.5375 9.86369 1.4 11.0137C0.30625 12.1637 0 13.6675 0 15.0829V22.5579H7.9625V18.6656H3.98125V15.0829C3.98125 14.1541 4.2 13.8002 4.33125 13.6675C4.41875 13.5791 4.76875 13.3137 5.775 13.3137H9.14375H13.125H24.5875C25.9437 13.3137 27.3 13.0041 28.3062 11.9868C29.3125 10.9695 29.6625 9.64253 29.6625 8.35984V1.32715H15.225ZM13.125 14.5521H9.14375V17.8695V23.531V25.6541H13.125V23.531V17.8695V14.5521ZM14.35 18.6656V22.5579H20.7375V25.3887C20.7375 26.406 20.475 26.6714 20.4312 26.6714C20.3437 26.7598 19.9938 26.9368 19.1625 26.9368H13.125H9.14375H6.34375C4.50625 26.9368 2.8875 27.4233 1.70625 28.4848C0.481251 29.5906 0 31.0502 0 32.5541V44.1425H5.775C7.91875 44.1425 9.84375 43.656 11.2 42.4175C12.6 41.1348 13.125 39.4098 13.125 37.6406V32.0675H9.14375V37.5964C9.14375 38.6579 8.8375 39.1887 8.4875 39.4983C8.09375 39.8521 7.35 40.206 5.73125 40.206H3.9375V32.5098C3.9375 31.8906 4.15625 31.4925 4.375 31.2714C4.6375 31.0502 5.20625 30.7406 6.3 30.7406H8.88125H13.475H19.0312C20.2563 30.7406 21.7438 30.5195 22.925 29.5464C24.15 28.5291 24.6313 26.981 24.6313 25.3002V18.6656H14.35Z"
              />
            </svg>
          </div>
        </div>

        <h3 className="mt-6 font-semibold text-ink">Tailoring your resume</h3>
        <p className="mt-1 truncate text-sm text-muted">for {jobTitle}</p>

        {/* current step */}
        <p
          key={i}
          className="mt-5 text-sm font-medium text-brand-ink"
          style={{ animation: "fadeUp 0.4s ease both" }}
        >
          {step}
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
