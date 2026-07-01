"""API surface. Views receive requests, call the service, shape the response."""
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from .pdf_render import render_resume_pdf
from .pdf_text import extract_text
from .repositories import ResumeRepository
from .serializers import ResumeOutputSerializer, ResumeUploadInputSerializer
from .services import ResumeMatchService

MIN_RESUME_CHARS = 200  # less than this = empty/scanned/not a real resume


class ResumeViewSet(ViewSet):
    """
    POST /api/v1/resumes/                → upload + profile extraction
    GET  /api/v1/resumes/{id}/           → resume + profile
    POST /api/v1/resumes/{id}/more/      → fetch + score jobs, return enriched list
    POST /api/v1/resumes/{id}/explain/   → LLM reasoning for one job (job data in body)
    POST /api/v1/resumes/{id}/tailor/    → tailor resume for one job, return PDF
    """

    def create(self, request):
        serializer = ResumeUploadInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]

        raw_text = extract_text(upload)
        if len(raw_text.strip()) < MIN_RESUME_CHARS:
            return Response(
                {"detail": "We couldn't read enough text from this PDF. Upload a "
                           "text-based resume — scanned or image-only PDFs aren't supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resume = ResumeMatchService().process_resume(raw_text=raw_text)
        except ValueError:
            return Response(
                {"detail": "This doesn't look like a resume — we couldn't find a "
                           "name, skills, or job titles in it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(ResumeOutputSerializer(resume).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        resume = ResumeRepository().get(int(pk))
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeOutputSerializer(resume).data)

    @action(detail=True, methods=["post"])
    def more(self, request, pk=None):
        """Fetch + score jobs for this resume. Returns the resume shape with a
        `matches` list of fully-scored job dicts — nothing is written to the DB."""
        result = ResumeMatchService().search_jobs(
            resume_id=int(pk),
            page=int(request.data.get("page") or 1),
            location=request.data.get("location") or None,
            work_type=request.data.get("work_type") or "hybrid",
            role=request.data.get("role") or None,
        )
        if result is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        resume, matches = result
        data = ResumeOutputSerializer(resume).data
        data["matches"] = matches
        return Response(data)

    @action(detail=True, methods=["post"])
    def explain(self, request, pk=None):
        """LLM reasoning + skill gaps for one job.

        Body: { "title": "...", "company": "...", "jd_text": "..." }
        The frontend already holds the full job object — it just sends the fields
        the LLM needs rather than a DB ID to look up."""
        result = ResumeMatchService().explain_job_match(
            resume_id=int(pk),
            title=request.data.get("title", ""),
            company=request.data.get("company", ""),
            jd_text=request.data.get("jd_text", ""),
        )
        if result is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(result)

    @action(detail=True, methods=["post"])
    def tailor(self, request, pk=None):
        """Tailor the resume for a specific job, return as a PDF download.

        Body: { "title": "...", "company": "...", "jd_text": "..." }"""
        try:
            result = ResumeMatchService().tailor_for_job(
                resume_id=int(pk),
                title=request.data.get("title", ""),
                company=request.data.get("company", ""),
                jd_text=request.data.get("jd_text", ""),
            )
        except RuntimeError:
            # LLM failed to produce a tailored resume (rate limit / bad output).
            return Response(
                {"detail": "Tailoring is busy right now — please try again in a moment."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if result is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        data, filename = result
        pdf = render_resume_pdf(data)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
