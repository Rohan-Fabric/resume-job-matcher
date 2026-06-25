"""Extract plain text from an uploaded PDF. Free, local, no API call — pypdf only."""
from __future__ import annotations

from pypdf import PdfReader


def extract_text(file) -> str:
    """Django UploadedFile → plain text, plus any hyperlink URLs hidden behind
    icons/text. Resumes (esp. Overleaf) often show just a GitHub/LinkedIn icon
    whose URL lives in a PDF link annotation, not the visible text — so we append
    those URLs too, letting URL/email extraction see them."""
    try:
        reader = PdfReader(file)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:  # corrupt / not a real PDF — caller's length guard handles it
        return ""

    links: list[str] = []
    for page in reader.pages:
        for annot in page.get("/Annots") or []:
            try:
                uri = (annot.get_object().get("/A") or {}).get("/URI")
                if uri:
                    links.append(str(uri))
            except Exception:  # malformed annotation — skip, never break extraction
                continue
    if links:
        text += "\n" + "\n".join(links)
    return text
