"""The ONLY layer that touches the DB. Services call these; never the ORM directly."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import CandidateProfile, JobMatch, Resume, TailoredResume


class ResumeRepository:
    def create(self, *, raw_text: str) -> Resume:
        return Resume.objects.create(raw_text=raw_text)

    def get(self, resume_id: int) -> Resume | None:
        return Resume.objects.filter(pk=resume_id).first()

    def mark_parsed(self, resume_id: int) -> None:
        Resume.objects.filter(pk=resume_id).update(is_parsed=True)


class CandidateProfileRepository:
    def create(self, *, resume: Resume, **fields) -> CandidateProfile:
        return CandidateProfile.objects.create(resume=resume, **fields)


class JobMatchRepository:
    def bulk_create(self, jobs: list[JobMatch]) -> list[JobMatch]:
        return JobMatch.objects.bulk_create(jobs)

    def for_resume(self, resume_id: int):
        return JobMatch.objects.filter(resume_id=resume_id)

    def for_resume_filtered(self, resume_id: int, *, posted_within: int | None = None,
                             job_type: list[str] | None = None, min_salary: float | None = None,
                             remote: bool | None = None, source: list[str] | None = None):
        """Same as for_resume(), narrowed server-side. A field with no data (e.g. an
        Adzuna job with no salary_raw) is never hidden by a filter the user didn't
        set — only an active filter excludes anything."""
        qs = JobMatch.objects.filter(resume_id=resume_id)
        if posted_within:
            qs = qs.filter(posted_at__gte=timezone.now() - timedelta(days=posted_within))
        if job_type:
            qs = qs.filter(job_type__in=job_type)
        if min_salary:
            qs = qs.filter(salary_min__gte=min_salary)
        if remote is not None:
            qs = qs.filter(is_remote=remote)
        if source:
            qs = qs.filter(source__in=source)
        return qs

    def pending_for_resume(self, resume_id: int, limit: int | None = None):
        """Jobs for this resume that haven't been scored yet (fit_score is null)."""
        qs = JobMatch.objects.filter(resume_id=resume_id, fit_score__isnull=True)
        return qs[:limit] if limit else qs

    def delete_for_resume(self, resume_id: int) -> None:
        JobMatch.objects.filter(resume_id=resume_id).delete()

    def get(self, job_id: int) -> JobMatch | None:
        return JobMatch.objects.filter(pk=job_id).first()

    def set_score(self, job_id: int, *, fit_score: float, reasoning: str,
                   experience_fit: str = "", one_line_summary: str = "",
                   matched_skills: list | None = None,
                   missing_skills: list | None = None) -> None:
        JobMatch.objects.filter(pk=job_id).update(
            fit_score=fit_score, reasoning=reasoning, experience_fit=experience_fit,
            one_line_summary=one_line_summary,
            matched_skills=matched_skills or [], missing_skills=missing_skills or [],
        )


class TailoredResumeRepository:
    def create(self, *, job_match: JobMatch, content: str) -> TailoredResume:
        return TailoredResume.objects.create(job_match=job_match, content=content)
