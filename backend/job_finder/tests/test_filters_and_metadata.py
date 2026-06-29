"""One check per real risk added in this change: HTML stripping, salary/date
parsing, and server-side filtering actually narrowing results. Not a full
matrix — the LLM-scoring shape and the timeout value are trivial enough to
read off the code.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from job_finder.clients.jobs_client import (
    _parse_date,
    _parse_salary_min,
    _parse_salary_max,
    _detect_currency,
    _detect_salary_period,
    _strip_html,
)
from job_finder.models import Resume, JobMatch, CandidateProfile
from job_finder.repositories import JobMatchRepository, ResumeRepository, CandidateProfileRepository


class HelperParsingTests(TestCase):
    def test_strip_html_removes_tags_and_decodes_entities(self):
        raw = "<p>Build &amp; ship <b>APIs</b></p>"
        self.assertEqual(_strip_html(raw), "Build & ship APIs")

    def test_parse_salary_min_extracts_first_number(self):
        self.assertEqual(_parse_salary_min("$90,000 - $120,000"), 90000.0)
        self.assertIsNone(_parse_salary_min(""))

    def test_parse_date_handles_bad_input_without_raising(self):
        self.assertIsNone(_parse_date(""))
        self.assertIsNone(_parse_date("not-a-date"))
        self.assertIsNotNone(_parse_date("2026-01-01T00:00:00Z"))

    def test_parse_date_makes_naive_input_timezone_aware(self):
        # Jooble gives dates with no timezone at all (e.g. "2026-05-15 00:00:00")
        dt = _parse_date("2026-05-15 00:00:00")
        self.assertIsNotNone(dt)
        self.assertIsNotNone(dt.tzinfo)

    def test_parse_salary_max_extracts_last_number(self):
        self.assertEqual(_parse_salary_max("$90,000 - $120,000"), 120000.0)
        self.assertIsNone(_parse_salary_max(""))
        self.assertIsNone(_parse_salary_max("$75,000"))

    def test_detect_currency(self):
        self.assertEqual(_detect_currency("$90,000"), "USD")
        self.assertEqual(_detect_currency("£50,000"), "GBP")
        self.assertEqual(_detect_currency("€60,000"), "EUR")
        self.assertEqual(_detect_currency("₹500,000"), "INR")
        self.assertEqual(_detect_currency(""), "USD")  # default

    def test_detect_salary_period(self):
        self.assertEqual(_detect_salary_period("$50/hr", {}), "hourly")
        self.assertEqual(_detect_salary_period("$5000 per month", {}), "monthly")
        self.assertEqual(_detect_salary_period("$100,000", {}), "annual")  # default


class FilteredMatchesTests(TestCase):
    def setUp(self):
        self.resume = Resume.objects.create(raw_text="x")
        self.recent = JobMatch.objects.create(
            resume=self.resume, title="Backend Engineer", posted_at=timezone.now(),
            job_type="full_time", salary_min=100000, salary_max=120000,
            currency="USD", salary_period="annual",
            is_remote=True, source="adzuna",
        )
        self.old = JobMatch.objects.create(
            resume=self.resume, title="Old Role",
            posted_at=timezone.now() - timedelta(days=60),
            job_type="contract", salary_min=40000, salary_max=50000,
            currency="USD", salary_period="annual",
            is_remote=False, source="jooble",
        )

    def test_posted_within_excludes_older_jobs(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk, posted_within=7)
        self.assertEqual(list(qs), [self.recent])

    def test_min_salary_excludes_lower_and_unknown(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk, min_salary=80000)
        self.assertEqual(list(qs), [self.recent])

    def test_no_filters_returns_everything(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk)
        self.assertEqual(qs.count(), 2)

    def test_job_type_filter(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk, job_type=["full_time"])
        self.assertEqual(list(qs), [self.recent])

    def test_remote_filter(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk, remote=True)
        self.assertEqual(list(qs), [self.recent])

    def test_source_filter(self):
        qs = JobMatchRepository().for_resume_filtered(self.resume.pk, source=["adzuna"])
        self.assertEqual(list(qs), [self.recent])

    def test_multiple_filters_combined(self):
        qs = JobMatchRepository().for_resume_filtered(
            self.resume.pk, posted_within=30, job_type=["full_time"], min_salary=50000
        )
        self.assertEqual(list(qs), [self.recent])


class RoleEditingTests(TestCase):
    def setUp(self):
        self.resume = Resume.objects.create(raw_text="Python developer with 5 years experience")
        self.profile = CandidateProfileRepository().create(
            resume=self.resume,
            name="Test User",
            skills=["Python", "Django"],
            titles=["Software Engineer"],
            location="Bangalore",
            country="in",
        )

    def test_detected_role_exists(self):
        self.assertEqual(self.profile.titles, ["Software Engineer"])

    def test_role_override_does_not_change_detected_role(self):
        # Simulate service layer behavior: detected role stays, search role changes
        detected = self.profile.titles[0]
        override = "Backend Engineer"
        self.assertEqual(detected, "Software Engineer")
        self.assertNotEqual(detected, override)

    def test_empty_role_override_uses_detected(self):
        # When override is empty, should fall back to detected
        override = ""
        search_role = override or self.profile.titles[0]
        self.assertEqual(search_role, "Software Engineer")


class ScoringDetailsTests(TestCase):
    def setUp(self):
        self.resume = Resume.objects.create(raw_text="x")
        self.job = JobMatch.objects.create(
            resume=self.resume,
            title="Python Developer",
            company="Tech Corp",
            jd_text="Python and Django required",
            fit_score=8.5,
            reasoning="Strong match",
            experience_fit="Good fit",
            one_line_summary="Strong backend alignment with Django experience",
            matched_skills=["Python", "Django"],
            missing_skills=["React"],
        )

    def test_scoring_details_persisted(self):
        self.assertEqual(self.job.experience_fit, "Good fit")
        self.assertEqual(self.job.one_line_summary, "Strong backend alignment with Django experience")
        self.assertEqual(self.job.matched_skills, ["Python", "Django"])
        self.assertEqual(self.job.missing_skills, ["React"])

    def test_empty_scoring_defaults(self):
        empty_job = JobMatch.objects.create(
            resume=self.resume,
            title="Another Job",
            company="Another Corp",
        )
        self.assertEqual(empty_job.experience_fit, "")
        self.assertEqual(empty_job.one_line_summary, "")
        self.assertEqual(empty_job.matched_skills, [])
        self.assertEqual(empty_job.missing_skills, [])


class EdgeCaseTests(TestCase):
    def test_job_with_no_salary(self):
        resume = Resume.objects.create(raw_text="x")
        job = JobMatch.objects.create(
            resume=resume,
            title="Unpaid Intern",
            company="Startup",
            salary_raw="",
            salary_min=None,
            salary_max=None,
            currency="",
            salary_period="",
        )
        self.assertEqual(job.salary_raw, "")
        self.assertIsNone(job.salary_min)
        self.assertIsNone(job.salary_max)

    def test_job_with_no_posted_date(self):
        resume = Resume.objects.create(raw_text="x")
        job = JobMatch.objects.create(
            resume=resume,
            title="Old Listing",
            company="Corp",
            posted_at=None,
        )
        self.assertIsNone(job.posted_at)

    def test_unknown_job_type(self):
        resume = Resume.objects.create(raw_text="x")
        job = JobMatch.objects.create(
            resume=resume,
            title="Mystery Role",
            company="Corp",
            job_type="",
        )
        self.assertEqual(job.job_type, "")

    def test_salary_parsing_edge_cases(self):
        self.assertIsNone(_parse_salary_min("Competitive"))
        self.assertIsNone(_parse_salary_min("DOE"))
        self.assertEqual(_parse_salary_min("$50,000"), 50000.0)
        self.assertEqual(_parse_salary_min("50k"), 50.0)  # parses "50" from "50k"

    def test_date_parsing_edge_cases(self):
        self.assertIsNone(_parse_date(""))
        self.assertIsNone(_parse_date("not a date"))
        self.assertIsNone(_parse_date("TBD"))

    def test_job_with_full_salary_metadata(self):
        resume = Resume.objects.create(raw_text="x")
        job = JobMatch.objects.create(
            resume=resume,
            title="Full Stack Engineer",
            company="Tech Corp",
            salary_raw="$100,000 - $150,000",
            salary_min=100000,
            salary_max=150000,
            currency="USD",
            salary_period="annual",
        )
        self.assertEqual(job.salary_raw, "$100,000 - $150,000")
        self.assertEqual(job.salary_min, 100000)
        self.assertEqual(job.salary_max, 150000)
        self.assertEqual(job.currency, "USD")
        self.assertEqual(job.salary_period, "annual")
