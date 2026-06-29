import type { JobFilters, JobMatch, Resume } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function uploadResume(file: File): Promise<Resume> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}/api/v1/resumes/`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    // surface the backend's reason (e.g. "not a resume") instead of a generic code
    let msg = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) msg = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new Error(msg);
  }
  return res.json();
}

export interface JobSearchOpts {
  location?: string;
  workType?: "remote" | "onsite" | "hybrid";
  replace?: boolean;
  role?: string; // overrides the resume's detected title for this search only
}

/** Fetch + score jobs (deduped server-side). replace=true clears prior matches. */
export async function loadMoreJobs(
  resumeId: number,
  page: number,
  opts: JobSearchOpts = {},
): Promise<Resume> {
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/more/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page,
      location: opts.location || undefined,
      work_type: opts.workType,
      replace: opts.replace,
      role: opts.role || undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Job search failed (${res.status})`);
  }
  return res.json();
}

/** JobFilters → the query-param shape the backend's _filter_kwargs() expects.
 *  Shared by fetchFilteredResume (GET query string) and scoreBatch (POST body) —
 *  both need the active filter to reach the backend identically. */
function filterParams(filters: JobFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.postedWithin) params.posted_within = String(filters.postedWithin);
  if (filters.jobType?.length) params.job_type = filters.jobType.join(",");
  if (filters.remote !== undefined) params.remote = String(filters.remote);
  if (filters.source?.length) params.source = filters.source.join(",");
  return params;
}

/** Re-fetch the resume with its matches narrowed server-side by `filters` —
 *  no new job-search API call, just a different query against saved jobs. */
export async function fetchFilteredResume(
  resumeId: number,
  filters: JobFilters = {},
): Promise<Resume> {
  const params = new URLSearchParams(filterParams(filters));
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Filter fetch failed (${res.status})`);
  }
  return res.json();
}

export interface ScoreBatchResult {
  resume: Resume;
  remaining: number;
  done: boolean;
}

/** Score the next batch of not-yet-scored jobs. Call repeatedly until `done`,
 *  so the UI can fill cards in live instead of waiting for the whole loop.
 *  `filters` keeps the response's matches narrowed to whatever's currently
 *  active — every job still gets scored regardless, this only affects which
 *  ones come back in THIS response, so a live poll can't undo an active filter. */
export async function scoreBatch(
  resumeId: number,
  batch = 25,
  filters: JobFilters = {},
): Promise<ScoreBatchResult> {
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/score/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch, ...filterParams(filters) }),
  });
  if (!res.ok) {
    throw new Error(`Scoring failed (${res.status})`);
  }
  return res.json();
}

/** Tailor the resume for a job; the backend returns a ready-made PDF (blob). */
export async function tailorForJob(jobId: number): Promise<Blob> {
  const res = await fetch(`${BASE}/api/v1/matches/${jobId}/tailor/`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Tailoring failed (${res.status})`);
  }
  return res.blob();
}

/** Compute diagnostic reasoning and skill gaps on demand when user clicks 'Why this match'. */
export async function explainJobMatch(jobId: number): Promise<JobMatch> {
  const res = await fetch(`${BASE}/api/v1/matches/${jobId}/explain/`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Explanation failed (${res.status})`);
  }
  return res.json();
}
