"""Orchestration. Runs the flow synchronously, inline in the request.

    upload  → extract text → LLM profile → find jobs → score each      (process_resume)
    download→ LLM tailor resume for one job                            (tailor_for_job)

Services decide WHAT to do; repositories do the DB writes; clients do the API calls.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor

from .clients.jobs_client import JobsClient
from .clients.llm_client import LLMClient
from .models import JobMatch
from .repositories import (
    CandidateProfileRepository,
    JobMatchRepository,
    ResumeRepository,
    TailoredResumeRepository,
)


class ResumeMatchService:
    def __init__(self) -> None:
        self.resume_repo = ResumeRepository()
        self.profile_repo = CandidateProfileRepository()
        self.job_repo = JobMatchRepository()
        self.tailored_repo = TailoredResumeRepository()
        self.llm = LLMClient()
        self.jobs = JobsClient()

    def process_resume(self, *, file_url: str, raw_text: str):
        """Upload flow: persist resume, extract profile, find + score jobs."""
        resume = self.resume_repo.create(file_url=file_url, raw_text=raw_text)

        # 1. LLM extracts structured details
        profile_data = self.llm.extract_profile(raw_text)
        self.profile_repo.create(resume=resume, **profile_data)
        self.resume_repo.mark_parsed(resume.pk)

        # 2. find jobs from the internet using the profile
        found = self.jobs.search(profile_data)
        rows = [
            JobMatch(
                resume=resume,
                title=j["title"],
                company=j.get("company", ""),
                jd_text=j.get("jd_text", ""),
                source_url=j.get("source_url", ""),
                is_remote=j.get("is_remote", False),
                country=j.get("country", ""),
                tier=j.get("tier", 4),
            )
            for j in found
        ]
        jobs = self.job_repo.bulk_create(rows)

        # 3. score each job against the resume — concurrently, since each scoring
        #    call is independent. LLM calls fan out in threads; DB writes happen
        #    back on the main thread (Django ORM connections don't cross threads).
        def _score(job):
            return job.pk, self.llm.score(raw_text, job.jd_text)

        if jobs:
            with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
                scored = list(pool.map(_score, jobs))
            for pk, verdict in scored:
                self.job_repo.set_score(
                    pk, fit_score=verdict["score"], reasoning=verdict["reasoning"]
                )

        return resume

    def tailor_for_job(self, *, job_id: int) -> tuple[dict, str] | None:
        """Download flow (Option B): tailor the resume for one job, on demand.

        Returns (structured_resume, filename) — the view renders it to PDF.
        """
        job = self.job_repo.get(job_id)
        if job is None:
            return None
        data = self.llm.tailor_resume(job.resume.raw_text, job.jd_text)
        self.tailored_repo.create(job_match=job, content=json.dumps(data))

        def _slug(text: str, fallback: str) -> str:
            s = re.sub(r"[^\w\s-]", "", (text or "").strip())  # drop punctuation
            s = re.sub(r"\s+", "-", s)                          # spaces → hyphens
            return s or fallback

        name = _slug(data.get("name", ""), "candidate")
        company = _slug(job.company, "job")
        return data, f"{name}-{company}.pdf"
