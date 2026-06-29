"""Database tables for the resume → jobs → tailored-resume flow.

Relationships:
    Resume (1) ──1:1── CandidateProfile
    Resume (1) ──< JobMatch (many)
    JobMatch (1) ──< TailoredResume (many)
"""
from django.db import models


class Resume(models.Model):
    """An uploaded resume, stored as its extracted plain text (the PDF itself is
    never persisted — only the text is needed for scoring + tailoring)."""

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
    titles = models.JSONField(default=list)   # ["Backend Engineer"] - detected from resume
    years_experience = models.FloatField(null=True, blank=True)
    search_role = models.CharField(max_length=255, blank=True)  # User's custom search role override

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
    location = models.CharField(max_length=255, blank=True)  # job's city/area, as posted
    country = models.CharField(max_length=8, blank=True)  # job's country, ISO alpha-2
    # 1 = candidate's city, 2 = candidate's country, 3 = remote abroad, 4 = onsite abroad
    tier = models.IntegerField(default=4)
    fit_score = models.FloatField(null=True, blank=True)   # 0–10
    reasoning = models.TextField(blank=True)
    created_date = models.DateTimeField(auto_now_add=True)

    # metadata the source APIs return but we used to discard
    posted_at = models.DateTimeField(null=True, blank=True)
    salary_raw = models.CharField(max_length=120, blank=True)  # source's own salary string, for display
    salary_min = models.FloatField(null=True, blank=True)      # first number parsed out of salary_raw, for filtering
    salary_max = models.FloatField(null=True, blank=True)      # maximum salary, for range display
    currency = models.CharField(max_length=8, blank=True)      # USD, EUR, GBP, INR, etc.
    salary_period = models.CharField(max_length=16, blank=True)  # annual, monthly, hourly
    job_type = models.CharField(max_length=32, blank=True)     # full_time / part_time / contract / internship / temporary
    source = models.CharField(max_length=16, blank=True)       # adzuna / jooble / remotive

    # scoring detail beyond the bare fit_score
    experience_fit = models.CharField(max_length=32, blank=True)  # e.g. "Good fit", "Underqualified"
    one_line_summary = models.CharField(max_length=128, blank=True)  # concise match summary
    matched_skills = models.JSONField(default=list, blank=True)
    missing_skills = models.JSONField(default=list, blank=True)

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
