"use client";

import type { JobFilters } from "../lib/types";
import { Check } from "lucide-react";

interface Props {
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
}

const JOB_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"];
const POSTED_OPTIONS: { label: string; value: 1 | 7 | 30 | undefined }[] = [
  { label: "Any time", value: undefined },
  { label: "Last 24 hours", value: 1 },
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
];

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// A labelled section with a hairline divider above it (except the first).
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-brand" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function FilterBar({ filters, onChange }: Props) {
  const active = !!(
    filters.postedWithin ||
    filters.jobType?.length ||
    filters.minSalary ||
    filters.remote
  );

  function toggleJobType(t: string) {
    const cur = filters.jobType ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    onChange({ ...filters, jobType: next.length ? next : undefined });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 card-lift">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Filters</h3>
        {active && (
          <button
            onClick={() => onChange({})}
            className="text-xs font-medium text-brand transition-colors hover:text-brand-ink"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="mt-3">
        {/* Date posted — single select */}
        <Group title="Date posted">
          <div className="flex flex-col gap-0.5">
            {POSTED_OPTIONS.map((o) => {
              const selected = (filters.postedWithin ?? undefined) === o.value;
              return (
                <button
                  key={o.label}
                  onClick={() => onChange({ ...filters, postedWithin: o.value })}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    selected
                      ? "bg-brand-wash font-medium text-brand-ink"
                      : "text-ink-soft hover:bg-bg"
                  }`}
                >
                  <span
                    className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                      selected ? "border-brand" : "border-line-strong"
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </Group>

        {/* Job type — multi select */}
        <Group title="Job type">
          <div className="flex flex-col gap-0.5">
            {JOB_TYPES.map((t) => {
              const on = filters.jobType?.includes(t) ?? false;
              return (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-bg"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleJobType(t)}
                    className="sr-only"
                  />
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                      on ? "border-brand bg-brand text-white" : "border-line-strong"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {titleCase(t)}
                </label>
              );
            })}
          </div>
        </Group>

        {/* Minimum salary */}
        <Group title="Minimum salary">
          <input
            type="number"
            min={0}
            placeholder="e.g. 50000"
            value={filters.minSalary ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                minSalary: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
        </Group>

        {/* Workplace */}
        <Group title="Workplace">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-ink-soft">Remote only</span>
            <Toggle
              on={filters.remote ?? false}
              onClick={() =>
                onChange({ ...filters, remote: filters.remote ? undefined : true })
              }
            />
          </div>
        </Group>
      </div>
    </div>
  );
}
