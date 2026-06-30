"""Orchestration layer.

    upload   → extract text → LLM profile                        (process_resume)
    search   → fetch jobs → score all in parallel → return list  (search_jobs)
    explain  → LLM reasoning + skill gaps for one job            (explain_job_match)
    download → LLM tailor → persist context → return PDF data    (tailor_for_job)

Job results are never written to the DB. Each search_jobs call is self-contained:
fetch → score → return → forget. This matches how anonymous one-shot users
actually use the site and removes an entire DB table worth of complexity.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor

from .clients.jobs_client import JobsClient
from .clients.llm_client import LLMClient
from .repositories import CandidateProfileRepository, ResumeRepository, TailoredResumeRepository


def _slug(text: str, fallback: str) -> str:
    s = re.sub(r"[^\w\s-]", "", (text or "").strip())
    return re.sub(r"\s+", "-", s) or fallback


class ResumeMatchService:
    def __init__(self) -> None:
        self.resume_repo = ResumeRepository()
        self.profile_repo = CandidateProfileRepository()
        self.tailored_repo = TailoredResumeRepository()
        self.llm = LLMClient()
        self.jobs = JobsClient()

    def process_resume(self, *, raw_text: str):
        """Upload flow: persist resume + profile. Raises ValueError if not a resume."""
        profile_data = self.llm.extract_profile(raw_text)
        if not (profile_data["name"] or profile_data["skills"] or profile_data["titles"]):
            raise ValueError("not_a_resume")

        resume = self.resume_repo.create(raw_text=raw_text)
        self.profile_repo.create(resume=resume, **profile_data)
        self.resume_repo.mark_parsed(resume.pk)
        return self.resume_repo.get(resume.pk)

    def search_jobs(
        self,
        *,
        resume_id: int,
        page: int = 1,
        location: str | None = None,
        work_type: str = "hybrid",
        role: str | None = None,
    ) -> tuple | None:
        """Fetch + score jobs in one shot. Returns (resume, list[scored_job_dicts]).

        All LLM scoring calls fan out in parallel via ThreadPoolExecutor so the
        total latency is bounded by the slowest single call, not the sum. Nothing
        is written to the DB — the returned list is the only copy of these results.
        """
        resume = self.resume_repo.get(resume_id)
        if resume is None or not hasattr(resume, "profile"):
            return None

        p = resume.profile
        city = "" if work_type == "remote" else (location or p.location)

        if role and role.strip():
            search_titles = [role.strip()]
            p.search_role = role.strip()
            p.save(update_fields=["search_role"])
        elif p.search_role:
            search_titles = [p.search_role]
        else:
            search_titles = p.titles

        profile = {
            "titles": search_titles,
            "skills": p.skills,
            "location": city,
            "country": p.country,
        }
        include_skills = not (role and role.strip())
        found = self.jobs.search(
            profile, page=page, remote=(work_type == "remote"), include_skills=include_skills
        )

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

        if not found:
            return resume, []

        def _score(j: dict) -> dict:
            verdict = self.llm.score(resume.raw_text, j.get("jd_text", ""))
            return {
                **j,
                "fit_score": verdict["score"],
                "one_line_summary": verdict["one_line_summary"],
                # explain_job_match fills these on demand; default empty so the
                # frontend never gets undefined for array fields it reads eagerly.
                "reasoning": "",
                "experience_fit": "",
                "matched_skills": [],
                "missing_skills": [],
            }

        with ThreadPoolExecutor(max_workers=len(found)) as pool:
            scored = list(pool.map(_score, found))

        # best fit first
        scored.sort(key=lambda j: j.get("fit_score") or 0, reverse=True)
        return resume, scored

    def explain_job_match(
        self, *, resume_id: int, title: str, company: str, jd_text: str
    ) -> dict | None:
        """On-demand reasoning + skill gaps. Stateless — job data comes in the request."""
        resume = self.resume_repo.get(resume_id)
        if resume is None:
            return None
        return self.llm.explain_match(resume.raw_text, jd_text)

    def tailor_for_job(
        self, *, resume_id: int, title: str, company: str, jd_text: str
    ) -> tuple | None:
        """Tailor the resume for a specific job. Persists the output with inline job
        context so the result survives after the ephemeral job listing expires.
        Returns (structured_resume_dict, filename) for PDF rendering."""
        resume = self.resume_repo.get(resume_id)
        if resume is None:
            return None
        data = self.llm.tailor_resume(resume.raw_text, jd_text)
        self.tailored_repo.create(
            resume=resume,
            job_title=title,
            job_company=company,
            job_jd_text=jd_text,
            content=json.dumps(data),
        )
        name = _slug(data.get("name", ""), "candidate")
        company_slug = _slug(company, "job")
        return data, f"{name}-{company_slug}.pdf"
