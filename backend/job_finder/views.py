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
    JobMatchOutputSerializer,
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

    @staticmethod
    def _filter_kwargs(q) -> dict | None:
        """Parsed filter kwargs for filtered_matches(), or None if no filter is active.
        Shared by retrieve() and score() so a live scoring poll can't clobber an
        active filter with the full unfiltered list."""
        if not any(q.get(k) for k in ("posted_within", "job_type", "min_salary", "remote", "source")):
            return None
        remote = q.get("remote")
        return dict(
            posted_within=int(q["posted_within"]) if q.get("posted_within") else None,
            job_type=q["job_type"].split(",") if q.get("job_type") else None,
            min_salary=float(q["min_salary"]) if q.get("min_salary") else None,
            remote={"true": True, "false": False}.get(remote) if remote else None,
            source=q["source"].split(",") if q.get("source") else None,
        )

    def retrieve(self, request, pk=None):
        """GET /api/v1/resumes/{id}/?posted_within=7&job_type=full_time,contract
        &min_salary=50000&remote=true&source=adzuna,remotive

        Filter params narrow the already-saved matches server-side — no new
        job-search API call, just a different query. Omit a param to leave
        that dimension unfiltered (e.g. jobs with unknown salary still show
        unless min_salary is set)."""
        resume = ResumeRepository().get(int(pk))
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = ResumeOutputSerializer(resume).data
        kwargs = self._filter_kwargs(request.query_params)
        if kwargs is not None:
            _, filtered = ResumeMatchService().filtered_matches(resume_id=int(pk), **kwargs)
            data["matches"] = JobMatchOutputSerializer(filtered, many=True).data
        return Response(data)

    @action(detail=True, methods=["post"])
    def more(self, request, pk=None):
        """POST /api/v1/resumes/{id}/more/ → fetch + score jobs (deduped).

        Body (all optional): {"page": 2, "location": "Bhopal",
        "work_type": "remote|onsite|hybrid", "replace": true, "role": "Backend Engineer"}.
        replace=true clears prior matches (fresh search); else appends.
        role overrides the resume's detected title for this search only — the
        resume itself is never re-parsed.
        """
        page = int(request.data.get("page") or 2)
        location = request.data.get("location") or None
        work_type = request.data.get("work_type") or "hybrid"
        replace = bool(request.data.get("replace"))
        role = request.data.get("role") or None
        resume = ResumeMatchService().find_more_jobs(
            resume_id=int(pk),
            page=page,
            location=location,
            work_type=work_type,
            replace=replace,
            role=role,
        )
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeOutputSerializer(resume).data)

    @action(detail=True, methods=["post"])
    def score(self, request, pk=None):
        """POST /api/v1/resumes/{id}/score/ → score the next batch of unscored
        jobs so the client can fill cards in live. Returns the resume plus
        {remaining, done}; call repeatedly until done is true.

        Scoring always runs over every pending job regardless of filters (a
        filtered-out job still needs to get scored eventually) — but accepts
        the same filter params as GET retrieve() so the matches in THIS
        response stay narrowed; otherwise a live poll would overwrite an
        active filter with the full unfiltered list mid-poll."""
        batch = int(request.data.get("batch") or 8)
        result = ResumeMatchService().score_pending(resume_id=int(pk), batch=batch)
        if result is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        resume, remaining = result

        resume_data = ResumeOutputSerializer(resume).data
        kwargs = self._filter_kwargs(request.data)
        if kwargs is not None:
            _, filtered = ResumeMatchService().filtered_matches(resume_id=int(pk), **kwargs)
            resume_data["matches"] = JobMatchOutputSerializer(filtered, many=True).data

        return Response({
            "resume": resume_data,
            "remaining": remaining,
            "done": remaining == 0,
        })


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
