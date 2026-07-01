"""Database tables for the resume → tailored-resume flow.

Relationships:
    Resume (1) ──1:1── CandidateProfile
    Resume (1) ──< TailoredResume (many)

JobMatch is intentionally absent: job results are ephemeral (fetched, scored,
returned in one HTTP response, then forgotten). Anonymous one-shot users never
return to see the same results twice, and job listings go stale within days.
"""
from django.db import models


class Resume(models.Model):
    """An uploaded resume, stored as its extracted plain text."""

    raw_text = models.TextField(blank=True)
    is_parsed = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Resume<{self.pk}>"


class CandidateProfile(models.Model):
    """Structured details the LLM extracted from a resume."""

    resume = models.OneToOneField(
        Resume, on_delete=models.CASCADE, related_name="profile"
    )
    name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    location = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=8, blank=True)  # ISO alpha-2, e.g. "in"
    linkedin = models.URLField(blank=True)
    github = models.URLField(blank=True)
    skills = models.JSONField(default=list)   # ["Python", "Django"]
    titles = models.JSONField(default=list)   # ["Backend Engineer"] — detected from resume
    years_experience = models.FloatField(null=True, blank=True)
    search_role = models.CharField(max_length=255, blank=True)  # user's custom search role override

    def __str__(self) -> str:
        return f"CandidateProfile<{self.name or self.pk}>"


class TailoredResume(models.Model):
    """A resume rewritten for one specific job, stored for audit / re-download.

    Job context (title, company, JD) is stored inline because the job itself is
    ephemeral — there is no JobMatch row to reference after the session ends.

    source_url is the stable job identity within a session — used to look up a
    pre-tailored result so the download handler can skip the LLM call entirely.
    status=pending means the LLM call is in flight; done means it's ready to serve.
    """

    STATUS_PENDING = "pending"
    STATUS_DONE = "done"

    resume = models.ForeignKey(
        Resume, on_delete=models.CASCADE, related_name="tailored"
    )
    job_title = models.CharField(max_length=255, blank=True)
    job_company = models.CharField(max_length=255, blank=True)
    job_jd_text = models.TextField(blank=True)
    source_url = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, default=STATUS_PENDING)
    content = models.TextField(blank=True)  # JSON-serialised structured resume; empty while pending
    created_date = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TailoredResume<{self.job_title} @ {self.job_company}>"
