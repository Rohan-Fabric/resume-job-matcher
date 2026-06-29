"""Render a structured resume dict → styled HTML → PDF bytes (WeasyPrint)."""
from __future__ import annotations

from django.template.loader import render_to_string

try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False


def render_resume_pdf(resume: dict) -> bytes:
    if not WEASYPRINT_AVAILABLE:
        raise RuntimeError(
            "PDF rendering requires weasyprint. On Windows with MSYS2, install system "
            "dependencies first: pacman -S mingw-w64-ucrt-x86_64-python-weasyprint"
        )
    html = render_to_string("resume.html", {"r": resume})
    return HTML(string=html).write_pdf()
