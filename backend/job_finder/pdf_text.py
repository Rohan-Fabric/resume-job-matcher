"""Extract plain text from an uploaded PDF. Free, local, no API call — pypdf only."""
from __future__ import annotations

from pypdf import PdfReader


def extract_text(file) -> str:
    """Django UploadedFile → plain text, page by page."""
    reader = PdfReader(file)
    return "\n".join(page.extract_text() or "" for page in reader.pages)
