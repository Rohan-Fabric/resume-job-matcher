import type { Resume } from "./types";

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
    }),
  });
  if (!res.ok) {
    throw new Error(`Job search failed (${res.status})`);
  }
  return res.json();
}

export interface ScoreBatchResult {
  resume: Resume;
  remaining: number;
  done: boolean;
}

/** Score the next batch of not-yet-scored jobs. Call repeatedly until `done`,
 *  so the UI can fill cards in live instead of waiting for the whole loop. */
export async function scoreBatch(
  resumeId: number,
  batch = 8,
): Promise<ScoreBatchResult> {
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/score/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch }),
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
