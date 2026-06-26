"""API surface. Views receive requests, call the service, shape the response."""
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from .pdf_render import render_resume_pdf
from .pdf_text import extract_text
from .repositories import ResumeRepository
from .serializers import (
    ResumeOutputSerializer,
    ResumeUploadInputSerializer,
)
from .services import ResumeMatchService

MIN_RESUME_CHARS = 200  # less than this = empty/scanned/not a real resume


class ResumeViewSet(ViewSet):
    """POST /api/v1/resumes/            → upload, extract, find + score jobs
    GET  /api/v1/resumes/{id}/         → resume + profile + ranked matches
    """

    def create(self, request):
        serializer = ResumeUploadInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]

        raw_text = extract_text(upload)
        # Reject empty/scanned/non-resume PDFs before spending an LLM call.
        if len(raw_text.strip()) < MIN_RESUME_CHARS:
            return Response(
                {"detail": "We couldn't read enough text from this PDF. Upload a "
                           "text-based resume — scanned or image-only PDFs aren't "
                           "supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The PDF itself is never read again (scoring + tailoring use raw_text),
        # so we don't persist the file — just keep the extracted text.
        try:
            resume = ResumeMatchService().process_resume(raw_text=raw_text)
        except ValueError:
            return Response(
                {"detail": "This doesn't look like a resume — we couldn't find a "
                           "name, skills, or job titles in it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            ResumeOutputSerializer(resume).data, status=status.HTTP_201_CREATED
        )

    def retrieve(self, request, pk=None):
        resume = ResumeRepository().get(int(pk))
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeOutputSerializer(resume).data)

    @action(detail=True, methods=["post"])
    def more(self, request, pk=None):
        """POST /api/v1/resumes/{id}/more/ → fetch + score jobs (deduped).

        Body (all optional): {"page": 2, "location": "Bhopal",
        "work_type": "remote|onsite|hybrid", "replace": true}.
        replace=true clears prior matches (fresh search); else appends.
        """
        page = int(request.data.get("page") or 2)
        location = request.data.get("location") or None
        work_type = request.data.get("work_type") or "hybrid"
        replace = bool(request.data.get("replace"))
        resume = ResumeMatchService().find_more_jobs(
            resume_id=int(pk),
            page=page,
            location=location,
            work_type=work_type,
            replace=replace,
        )
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeOutputSerializer(resume).data)


class JobMatchViewSet(ViewSet):
    """POST /api/v1/matches/{id}/tailor/ → tailored resume as a PDF download."""

    @action(detail=True, methods=["post"])
    def tailor(self, request, pk=None):
        result = ResumeMatchService().tailor_for_job(job_id=int(pk))
        if result is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        data, filename = result
        pdf = render_resume_pdf(data)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
