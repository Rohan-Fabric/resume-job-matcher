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

    def process_resume(self, *, raw_text: str):
        """Upload flow: persist resume, extract profile, find + score jobs.

        Raises ValueError if the text yields no usable profile (not a resume)."""
        # 1. LLM extracts structured details — do this BEFORE persisting, so a
        #    non-resume doesn't leave an orphan row behind.
        profile_data = self.llm.extract_profile(raw_text)
        if not (profile_data["name"] or profile_data["skills"] or profile_data["titles"]):
            raise ValueError("not_a_resume")

        resume = self.resume_repo.create(raw_text=raw_text)
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
                location=j.get("location", ""),
                country=j.get("country", ""),
                tier=j.get("tier", 4),
            )
            for j in found
        ]
        self.job_repo.bulk_create(rows)
        # Jobs are saved UNSCORED. The client scores them in batches via
        # score_pending(), so cards appear immediately and fill in live instead
        # of the user waiting on the whole scoring loop.
        return resume

    def find_more_jobs(
        self,
        *,
        resume_id: int,
        page: int = 2,
        location: str | None = None,
        work_type: str = "hybrid",
        replace: bool = False,
    ):
        """Fetch jobs for an existing resume with a work-type preference.

        work_type: "remote" (anywhere, city ignored), "onsite" (city only),
        or "hybrid" (both). replace=True clears prior matches first (a fresh
        search); replace=False appends, skipping any we already have."""
        resume = self.resume_repo.get(resume_id)
        if resume is None or not hasattr(resume, "profile"):
            return None

        if replace:
            self.job_repo.delete_for_resume(resume_id)

        p = resume.profile
        city = "" if work_type == "remote" else (location or p.location)
        profile = {
            "titles": p.titles,
            "skills": p.skills,
            "location": city,
            "country": p.country,
        }
        found = self.jobs.search(profile, page=page, remote=(work_type == "remote"))

        # work-type + location-scope filter. onsite/hybrid stay in the candidate's
        # country (so a Bangalore search never surfaces US onsite roles); remote
        # is anywhere.
        home = (p.country or "in").lower()
        if work_type == "remote":
            found = [j for j in found if j["is_remote"]]
        elif work_type == "onsite":
            found = [
                j for j in found
                if not j["is_remote"] and (j.get("country") or "").lower() == home
            ]
        else:  # hybrid: in-country onsite + remote anywhere
            found = [
                j for j in found
                if j["is_remote"] or (j.get("country") or "").lower() == home
            ]

        # dedup against jobs already saved for this resume
        seen = {
            j.source_url
            for j in self.job_repo.for_resume(resume_id)
            if j.source_url
        }
        fresh = [j for j in found if j["source_url"] and j["source_url"] not in seen]

        rows = [
            JobMatch(
                resume=resume,
                title=j["title"],
                company=j.get("company", ""),
                jd_text=j.get("jd_text", ""),
                source_url=j.get("source_url", ""),
                is_remote=j.get("is_remote", False),
                location=j.get("location", ""),
                country=j.get("country", ""),
                tier=j.get("tier", 4),
            )
            for j in fresh
        ]
        self.job_repo.bulk_create(rows)  # unscored — scored progressively via score_pending()
        return resume

    def score_pending(self, *, resume_id: int, batch: int = 8):
        """Score up to `batch` not-yet-scored jobs for this resume, in parallel.

        Upload/search save jobs unscored; the client calls this repeatedly so
        cards fill in live. Returns (resume, remaining); remaining == 0 means
        scoring is complete. LLM calls fan out in threads; DB writes happen back
        on this thread (Django ORM connections don't cross threads)."""
        resume = self.resume_repo.get(resume_id)
        if resume is None:
            return None

        pending = list(self.job_repo.pending_for_resume(resume_id, limit=batch))
        if pending:
            def _score(job):
                return job.pk, self.llm.score(resume.raw_text, job.jd_text)

            with ThreadPoolExecutor(max_workers=len(pending)) as pool:
                scored = list(pool.map(_score, pending))
            for pk, verdict in scored:
                self.job_repo.set_score(
                    pk, fit_score=verdict["score"], reasoning=verdict["reasoning"]
                )

        remaining = self.job_repo.pending_for_resume(resume_id).count()
        return resume, remaining

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
