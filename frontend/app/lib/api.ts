import type { JobMatch, Resume } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function uploadResume(file: File): Promise<Resume> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}/api/v1/resumes/`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
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
  role?: string;  // overrides the resume's detected title for this search
}

/** Fetch + score jobs for a resume. Returns resume shape with `matches` included. */
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
      role: opts.role || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Job search failed (${res.status})`);
  return res.json();
}

/** Compute diagnostic reasoning and skill gaps on demand when user clicks 'Why this match'.
 *  Sends the job's JD text in the request body — no DB lookup needed. */
export async function explainJobMatch(
  resumeId: number,
  job: JobMatch,
): Promise<Partial<JobMatch>> {
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/explain/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: job.title,
      company: job.company,
      jd_text: job.jd_text,
    }),
  });
  if (!res.ok) throw new Error(`Explanation failed (${res.status})`);
  return res.json();
}

/** Tailor the resume for a job; the backend returns a ready-made PDF blob.
 *  Sends job context in the request body — no DB lookup needed. */
export async function tailorForJob(resumeId: number, job: JobMatch): Promise<Blob> {
  const res = await fetch(`${BASE}/api/v1/resumes/${resumeId}/tailor/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: job.title,
      company: job.company,
      jd_text: job.jd_text,
    }),
  });
  if (!res.ok) throw new Error(`Tailoring failed (${res.status})`);
  return res.blob();
}
