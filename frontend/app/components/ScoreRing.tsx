"use client";

import { useEffect, useState } from "react";

interface Props {
  score: number | null;
}

/** Circular fit-score gauge. On mount the ring sweeps from 0 and the number
 *  counts up to the score — one rAF loop drives both so they stay in sync. */
export function ScoreRing({ score }: Props) {
  const cx = 32;
  const cy = 32;
  const r = 26;
  const c = 2 * Math.PI * r;

  const target = score ?? 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (score === null || score === undefined) return;
    // respect reduced-motion: jump straight to the value
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — matches the app's curve
      setShown(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, target]);

  // null = not scored yet (the client scores progressively) → pulsing "scoring" ring
  if (score === null || score === undefined) {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-brand/40">
        <span className="breathe h-2.5 w-2.5 rounded-full bg-brand" />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(1, shown / 10));
  const color =
    score >= 7 ? "var(--brand)" : score >= 4 ? "var(--amber)" : "var(--rose)";

  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: "17px", fontWeight: 700, fill: "var(--ink)" }}
      >
        {shown.toFixed(1)}
      </text>
    </svg>
  );
}
