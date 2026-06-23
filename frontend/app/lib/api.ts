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
    throw new Error(`Upload failed (${res.status})`);
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
