"""API surface. Views receive requests, call the service, shape the response."""
from django.core.files.storage import default_storage
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


class ResumeViewSet(ViewSet):
    """POST /api/v1/resumes/            → upload, extract, find + score jobs
    GET  /api/v1/resumes/{id}/         → resume + profile + ranked matches
    """

    def create(self, request):
        serializer = ResumeUploadInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]

        raw_text = extract_text(upload)
        saved_path = default_storage.save(f"resumes/{upload.name}", upload)
        file_url = default_storage.url(saved_path)

        resume = ResumeMatchService().process_resume(
            file_url=file_url, raw_text=raw_text
        )
        return Response(
            ResumeOutputSerializer(resume).data, status=status.HTTP_201_CREATED
        )

    def retrieve(self, request, pk=None):
        resume = ResumeRepository().get(int(pk))
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
