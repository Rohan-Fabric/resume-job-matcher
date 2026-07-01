"""The ONLY layer that touches the DB. Services call these; never the ORM directly."""
from __future__ import annotations

from .models import CandidateProfile, Resume, TailoredResume


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


class TailoredResumeRepository:
    def create(
        self,
        *,
        resume: Resume,
        job_title: str = "",
        job_company: str = "",
        job_jd_text: str = "",
        source_url: str = "",
        status: str = TailoredResume.STATUS_PENDING,
        content: str = "",
    ) -> TailoredResume:
        return TailoredResume.objects.create(
            resume=resume,
            job_title=job_title,
            job_company=job_company,
            job_jd_text=job_jd_text,
            source_url=source_url,
            status=status,
            content=content,
        )

    def get_done(self, *, resume_id: int, source_url: str) -> TailoredResume | None:
        return TailoredResume.objects.filter(
            resume_id=resume_id,
            source_url=source_url,
            status=TailoredResume.STATUS_DONE,
        ).first()

    def get_or_create_pending(
        self, *, resume: Resume, job_title: str, job_company: str, job_jd_text: str, source_url: str
    ) -> tuple[TailoredResume, bool]:
        return TailoredResume.objects.get_or_create(
            resume=resume,
            source_url=source_url,
            defaults={
                "job_title": job_title,
                "job_company": job_company,
                "job_jd_text": job_jd_text,
                "status": TailoredResume.STATUS_PENDING,
                "content": "",
            },
        )

    def mark_done(self, *, pk: int, content: str) -> None:
        TailoredResume.objects.filter(pk=pk).update(
            content=content,
            status=TailoredResume.STATUS_DONE,
        )
