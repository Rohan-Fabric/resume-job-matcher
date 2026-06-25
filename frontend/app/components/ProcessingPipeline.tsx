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
        <div className="float absolute inset-0 grid place-items-center">
          <svg
            viewBox="-9 -2 48 48"
            className="h-10 w-10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="fabric"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.225 1.32715C13.6063 1.32715 11.9875 1.76946 10.8062 2.87523C9.625 4.02523 9.14375 5.5733 9.14375 7.25407V8.13869H13.125V7.25407C13.125 6.281 13.3875 5.88292 13.6062 5.66176C13.825 5.44061 14.2625 5.21946 15.225 5.21946H25.6812V7.16561C25.6812 7.51946 25.6375 8.93484 25.5938 9.06753C25.55 9.20023 25.5063 9.24446 25.5063 9.24446C25.5063 9.24446 25.4625 9.28869 25.3313 9.33292C25.2 9.37715 24.0625 9.42138 23.7125 9.42138H13.125H9.14375H5.775C4.1125 9.42138 2.5375 9.86369 1.4 11.0137C0.30625 12.1637 0 13.6675 0 15.0829V22.5579H7.9625V18.6656H3.98125V15.0829C3.98125 14.1541 4.2 13.8002 4.33125 13.6675C4.41875 13.5791 4.76875 13.3137 5.775 13.3137H9.14375H13.125H24.5875C25.9437 13.3137 27.3 13.0041 28.3062 11.9868C29.3125 10.9695 29.6625 9.64253 29.6625 8.35984V1.32715H15.225ZM13.125 14.5521H9.14375V17.8695V23.531V25.6541H13.125V23.531V17.8695V14.5521ZM14.35 18.6656V22.5579H20.7375V25.3887C20.7375 26.406 20.475 26.6714 20.4312 26.6714C20.3437 26.7598 19.9938 26.9368 19.1625 26.9368H13.125H9.14375H6.34375C4.50625 26.9368 2.8875 27.4233 1.70625 28.4848C0.481251 29.5906 0 31.0502 0 32.5541V44.1425H5.775C7.91875 44.1425 9.84375 43.656 11.2 42.4175C12.6 41.1348 13.125 39.4098 13.125 37.6406V32.0675H9.14375V37.5964C9.14375 38.6579 8.8375 39.1887 8.4875 39.4983C8.09375 39.8521 7.35 40.206 5.73125 40.206H3.9375V32.5098C3.9375 31.8906 4.15625 31.4925 4.375 31.2714C4.6375 31.0502 5.20625 30.7406 6.3 30.7406H8.88125H13.475H19.0312C20.2563 30.7406 21.7438 30.5195 22.925 29.5464C24.15 28.5291 24.6313 26.981 24.6313 25.3002V18.6656H14.35Z"
              fill="url(#loader_grad)"
            />
            <defs>
              <linearGradient id="loader_grad" x1="5.44819" y1="1.04314" x2="23.4825" y2="41.8394" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E9D7FF" />
                <stop offset="1" stopColor="#A566F2" />
              </linearGradient>
            </defs>
          </svg>
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
