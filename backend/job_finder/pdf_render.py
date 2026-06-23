"""Render a structured resume dict → styled HTML → PDF bytes (WeasyPrint)."""
from __future__ import annotations

from django.template.loader import render_to_string
from weasyprint import HTML


def render_resume_pdf(resume: dict) -> bytes:
    html = render_to_string("resume.html", {"r": resume})
    return HTML(string=html).write_pdf()
