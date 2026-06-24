"""Database tables for the resume → jobs → tailored-resume flow.

Relationships:
    Resume (1) ──1:1── CandidateProfile
    Resume (1) ──< JobMatch (many)
    JobMatch (1) ──< TailoredResume (many)
"""
from django.db import models


class Resume(models.Model):
    """An uploaded resume: the file plus its extracted plain text."""

    file_url = models.URLField(blank=True)
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
    skills = models.JSONField(default=list)   # ["Python", "Django"]
    titles = models.JSONField(default=list)   # ["Backend Engineer"]
    years_experience = models.FloatField(null=True, blank=True)

    def __str__(self) -> str:
        return f"CandidateProfile<{self.name or self.pk}>"


class JobMatch(models.Model):
    """A job found for a resume, scored for fit."""

    resume = models.ForeignKey(
        Resume, on_delete=models.CASCADE, related_name="matches"
    )
    title = models.CharField(max_length=255)
    company = models.CharField(max_length=255, blank=True)
    jd_text = models.TextField(blank=True)
    source_url = models.URLField(blank=True)
    is_remote = models.BooleanField(default=False)
    country = models.CharField(max_length=8, blank=True)  # job's country, ISO alpha-2
    # 1 = candidate's city, 2 = candidate's country, 3 = remote abroad, 4 = onsite abroad
    tier = models.IntegerField(default=4)
    fit_score = models.FloatField(null=True, blank=True)   # 0–10
    reasoning = models.TextField(blank=True)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        # best fit first, regardless of location (tier is shown only as a label)
        ordering = ["-fit_score"]

    def __str__(self) -> str:
        return f"JobMatch<{self.title} @ {self.company}>"


class TailoredResume(models.Model):
    """A resume rewritten for one specific job. Created on Download (Option B)."""

    job_match = models.ForeignKey(
        JobMatch, on_delete=models.CASCADE, related_name="tailored"
    )
    content = models.TextField()
    created_date = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TailoredResume<job={self.job_match_id}>"
