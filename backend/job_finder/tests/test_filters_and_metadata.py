"""Tests for pure-logic helpers and model behaviour.

JobMatch-related tests were removed when that model was dropped — job results
are now ephemeral dicts, never written to the DB. Filtering is client-side.
"""
from job_finder.clients.jobs_client import (
    _detect_currency,
    _detect_salary_period,
    _parse_date,
    _parse_salary_max,
    _parse_salary_min,
    _strip_html,
)
from job_finder.models import CandidateProfile, Resume
from job_finder.repositories import CandidateProfileRepository

from django.test import TestCase


class HelperParsingTests(TestCase):
    def test_strip_html_removes_tags_and_decodes_entities(self):
        self.assertEqual(_strip_html("<p>Build &amp; ship <b>APIs</b></p>"), "Build & ship APIs")

    def test_parse_salary_min_extracts_first_number(self):
        self.assertEqual(_parse_salary_min("$90,000 - $120,000"), 90000.0)
        self.assertIsNone(_parse_salary_min(""))

    def test_parse_salary_max_extracts_last_number(self):
        self.assertEqual(_parse_salary_max("$90,000 - $120,000"), 120000.0)
        self.assertIsNone(_parse_salary_max(""))
        self.assertIsNone(_parse_salary_max("$75,000"))  # single value → no max

    def test_parse_date_handles_bad_input_without_raising(self):
        self.assertIsNone(_parse_date(""))
        self.assertIsNone(_parse_date("not-a-date"))
        self.assertIsNotNone(_parse_date("2026-01-01T00:00:00Z"))

    def test_parse_date_makes_naive_input_timezone_aware(self):
        # Jooble gives dates with no timezone (e.g. "2026-05-15 00:00:00")
        dt = _parse_date("2026-05-15 00:00:00")
        self.assertIsNotNone(dt)
        self.assertIsNotNone(dt.tzinfo)

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

    def test_salary_parsing_edge_cases(self):
        self.assertIsNone(_parse_salary_min("Competitive"))
        self.assertIsNone(_parse_salary_min("DOE"))
        self.assertEqual(_parse_salary_min("$50,000"), 50000.0)

    def test_date_parsing_edge_cases(self):
        self.assertIsNone(_parse_date(""))
        self.assertIsNone(_parse_date("not a date"))
        self.assertIsNone(_parse_date("TBD"))


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
        detected = self.profile.titles[0]
        self.assertEqual(detected, "Software Engineer")
        self.assertNotEqual(detected, "Backend Engineer")

    def test_empty_role_override_falls_back_to_detected(self):
        override = ""
        search_role = override or self.profile.titles[0]
        self.assertEqual(search_role, "Software Engineer")
