interface Props {
  score: number | null;
}

/** Colour-codes the fit score: strong (teal), moderate (amber), low (rose). */
export function ScoreBadge({ score }: Props) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-xs text-muted">
        Not scored
      </span>
    );
  }

  const tier =
    score >= 7
      ? { wash: "var(--brand-wash)", ink: "var(--brand-ink)", label: "Strong fit" }
      : score >= 4
        ? { wash: "var(--amber-wash)", ink: "var(--amber)", label: "Moderate fit" }
        : { wash: "var(--rose-wash)", ink: "var(--rose)", label: "Low fit" };

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: tier.wash, color: tier.ink }}
      >
        <span className="text-sm">{score.toFixed(1)}</span>
        <span className="opacity-70">/10</span>
      </span>
      <span className="text-xs text-muted">{tier.label}</span>
    </div>
  );
}
