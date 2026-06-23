import type { JobMatch } from "../lib/types";
import { ScoreRing } from "./ScoreRing";

interface Props {
  job: JobMatch;
  rank: number;
  tailoring: boolean;
  onTailor: (job: JobMatch) => void;
}

function tierLabel(score: number | null) {
  if (score === null || score === undefined) return { text: "Not scored", color: "var(--muted)" };
  if (score >= 7) return { text: "Strong fit", color: "var(--brand-ink)" };
  if (score >= 4) return { text: "Moderate fit", color: "var(--amber)" };
  return { text: "Low fit", color: "var(--rose)" };
}

/** Plain-English location label from the job's tier (1=city → 4=onsite abroad). */
function locationLabel(job: JobMatch): string {
  const c = job.country?.toUpperCase();
  switch (job.tier) {
    case 1:
      return `In your city · ${c}`;
    case 2:
      return `In your region · ${c}`;
    case 3:
      return `Remote · ${c}`;
    default:
      return `Onsite · ${c}`;
  }
}

export function JobCard({ job, rank, tailoring, onTailor }: Props) {
  const tier = tierLabel(job.fit_score);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all hover:border-line-strong hover:card-lift">
      <div className="flex gap-4">
        {/* score gauge */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <ScoreRing score={job.fit_score} />
          <span className="text-[11px] font-medium" style={{ color: tier.color }}>
            {tier.text}
          </span>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-bg font-semibold tabular-nums">
              {rank}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 font-medium text-ink-soft">
              {locationLabel(job)}
            </span>
          </div>

          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink break-words">
            {job.title}
          </h3>
          <p className="text-sm text-ink-soft break-words">{job.company || "—"}</p>

          {job.reasoning && (
            <p className="mt-2.5 text-sm leading-relaxed text-ink-soft break-words">
              {job.reasoning}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Apply ↗
            </a>
            <button
              onClick={() => onTailor(job)}
              disabled={tailoring}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-brand-wash hover:text-brand-ink disabled:opacity-50"
            >
              {tailoring ? (
                <>
                  <span className="spin h-3.5 w-3.5 rounded-full border-2 border-brand border-t-transparent" />
                  Tailoring…
                </>
              ) : (
                <>↓ Download tailored PDF</>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
