"""The ONLY layer that touches the DB. Services call these; never the ORM directly."""
from __future__ import annotations

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

    def delete_for_resume(self, resume_id: int) -> None:
        JobMatch.objects.filter(resume_id=resume_id).delete()

    def get(self, job_id: int) -> JobMatch | None:
        return JobMatch.objects.filter(pk=job_id).first()

    def set_score(self, job_id: int, *, fit_score: float, reasoning: str) -> None:
        JobMatch.objects.filter(pk=job_id).update(
            fit_score=fit_score, reasoning=reasoning
        )


class TailoredResumeRepository:
    def create(self, *, job_match: JobMatch, content: str) -> TailoredResume:
        return TailoredResume.objects.create(job_match=job_match, content=content)
