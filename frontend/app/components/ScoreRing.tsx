interface Props {
  score: number | null;
}

/** Circular fit-score gauge — number sits dead-centre inside the ring. */
export function ScoreRing({ score }: Props) {
  const cx = 32;
  const cy = 32;
  const r = 26;
  const c = 2 * Math.PI * r;

  if (score === null || score === undefined) {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-full border border-dashed border-line-strong text-xs text-muted">
        n/a
      </div>
    );
  }

  const pct = Math.max(0, Math.min(1, score / 10));
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
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: "17px", fontWeight: 700, fill: "var(--ink)" }}
      >
        {score.toFixed(1)}
      </text>
    </svg>
  );
}
