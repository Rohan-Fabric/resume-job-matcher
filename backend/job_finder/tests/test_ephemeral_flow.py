"""Integration & API tests for the ephemeral job search and tailoring flow.

Verifies that:
1. Job results returned by search (`more/`) are ephemeral dicts in the response payload and not saved to any database table.
2. Stateless explanation (`explain/`) accepts job data in the request body and returns enriched details.
3. Tailoring (`tailor/`) accepts job data in the request body, returns a PDF attachment, and correctly persists the job context inline in `TailoredResume`.
"""
from unittest.mock import MagicMock, patch
from django.urls import reverse
from openai import RateLimitError
from rest_framework import status
from rest_framework.test import APITestCase

from job_finder.clients.llm_client import _complete, LLMClient
from job_finder.models import Resume, CandidateProfile, TailoredResume




class EphemeralFlowAPITests(APITestCase):
    def setUp(self):
        self.resume = Resume.objects.create(
            raw_text="Experienced Software Engineer skilled in Python and Django."
        )
        self.profile = CandidateProfile.objects.create(
            resume=self.resume,
            name="Alice Developer",
            email="alice@example.com",
            skills=["Python", "Django"],
            titles=["Software Engineer"],
            location="San Francisco",
            country="us",
        )

    @patch("job_finder.services.LLMClient.score")
    @patch("job_finder.services.JobsClient.search")
    def test_ephemeral_search_returns_matches_without_db_persistence(self, mock_search, mock_score):
        mock_search.return_value = [
            {
                "title": "Backend Python Developer",
                "company": "Tech Corp",
                "jd_text": "Looking for a Python backend engineer with Django expertise.",
                "source_url": "https://example.com/job/123",
                "is_remote": True,
                "location": "Remote",
                "country": "us",
                "tier": 1,
            }
        ]
        mock_score.return_value = {
            "score": 9.2,
            "one_line_summary": "Great match for Python/Django skills.",
        }

        url = reverse("resume-more", args=[self.resume.pk])
        response = self.client.post(url, {"page": 1, "work_type": "remote"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("matches", data)
        self.assertEqual(len(data["matches"]), 1)

        match = data["matches"][0]
        self.assertEqual(match["title"], "Backend Python Developer")
        self.assertEqual(match["fit_score"], 9.2)
        self.assertEqual(match["one_line_summary"], "Great match for Python/Django skills.")

        # Ensure TailoredResume table wasn't written to during search
        self.assertEqual(TailoredResume.objects.count(), 0)

    @patch("job_finder.services.LLMClient.explain_match")
    def test_stateless_explain_endpoint(self, mock_explain):
        mock_explain.return_value = {
            "reasoning": "Candidate has strong Python experience matching the requirement.",
            "experience_fit": "Strong fit",
            "matched_skills": ["Python", "Django"],
            "missing_skills": ["Kubernetes"],
        }

        url = reverse("resume-explain", args=[self.resume.pk])
        payload = {
            "title": "Backend Python Developer",
            "company": "Tech Corp",
            "jd_text": "Looking for Python, Django, and Kubernetes.",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["experience_fit"], "Strong fit")
        self.assertEqual(data["matched_skills"], ["Python", "Django"])

    @patch("job_finder.services.LLMClient.tailor_resume")
    def test_tailor_endpoint_persists_context_and_returns_pdf(self, mock_tailor):
        mock_tailor.return_value = {
            "name": "Alice Developer",
            "email": "alice@example.com",
            "phone": "555-0100",
            "links": [],
            "summary": "Tailored summary focusing on Python backend architecture.",
            "skills": ["Python", "Django"],
            "experience": [
                {
                    "title": "Software Engineer",
                    "company": "Old Corp",
                    "dates": "2020 - Present",
                    "location": "Remote",
                    "bullets": ["Built Python microservices."],
                }
            ],
            "education": [],
        }

        url = reverse("resume-tailor", args=[self.resume.pk])
        payload = {
            "title": "Senior Python Developer",
            "company": "Acme Inc",
            "jd_text": "Need senior engineer familiar with Python.",
        }
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn('attachment; filename="Alice-Developer-Acme-Inc.pdf"', response["Content-Disposition"])

        # Verify that TailoredResume WAS created with inline job context
        self.assertEqual(TailoredResume.objects.count(), 1)
        tailored = TailoredResume.objects.first()
        self.assertEqual(tailored.resume_id, self.resume.pk)
        self.assertEqual(tailored.job_title, "Senior Python Developer")
        self.assertEqual(tailored.job_company, "Acme Inc")
        self.assertEqual(tailored.job_jd_text, "Need senior engineer familiar with Python.")

    @patch("job_finder.clients.llm_client.time.sleep")
    @patch("job_finder.clients.llm_client._client")
    def test_llm_complete_retries_on_rate_limit_and_succeeds(self, mock_client, mock_sleep):
        mock_create = MagicMock()
        mock_client.return_value.chat.completions.create = mock_create
        # Attempt 1 & 2 fail with 429 RateLimitError, Attempt 3 succeeds
        mock_create.side_effect = [
            RateLimitError("429 Too Many Requests", response=MagicMock(), body=None),
            RateLimitError("429 Too Many Requests", response=MagicMock(), body=None),
            MagicMock(choices=[MagicMock(message=MagicMock(content='{"score": 8.5}'))]),
        ]
        res = _complete("Test prompt")
        self.assertEqual(res, '{"score": 8.5}')
        self.assertEqual(mock_create.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("job_finder.clients.llm_client.time.sleep")
    @patch("job_finder.clients.llm_client._client")
    def test_llm_complete_exhausts_retries_gracefully(self, mock_client, mock_sleep):
        mock_create = MagicMock()
        mock_client.return_value.chat.completions.create = mock_create
        # All 3 attempts fail with 429 RateLimitError
        mock_create.side_effect = RateLimitError("429 Too Many Requests", response=MagicMock(), body=None)
        res = _complete("Test prompt")
        self.assertEqual(res, "")
        self.assertEqual(mock_create.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("job_finder.clients.llm_client._complete")
    def test_tailor_resume_raises_runtime_error_on_total_llm_failure(self, mock_complete):
        mock_complete.return_value = ""
        client = LLMClient()
        with self.assertRaisesMessage(RuntimeError, "tailor_failed"):
            client.tailor_resume("My resume text", "JD text")


