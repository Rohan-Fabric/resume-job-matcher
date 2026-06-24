"""All LLM calls live here. Three jobs: extract a profile, score a job, tailor a resume.

Uses OpenRouter via the OpenAI-compatible SDK (https://openrouter.ai/docs/quickstart).
The model is set by OPENROUTER_MODEL (and OPENROUTER_MODEL_TAILOR for tailoring) —
currently openai/gpt-oss-120b:free for all tasks.
"""
from __future__ import annotations

import json
import re
import time

from django.conf import settings
from openai import OpenAI, RateLimitError


def _client() -> OpenAI:
    return OpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url=settings.OPENROUTER_BASE_URL,
    )


def _complete(prompt: str, max_tokens: int | None = None, model: str | None = None) -> str:
    """One OpenRouter chat completion call. Returns the raw text reply.

    Retries on rate-limit (429) with a short backoff — important now that scoring
    fans out ~12 concurrent calls, which can briefly trip the free-tier limit.
    """
    kwargs: dict = {
        "model": model or settings.OPENROUTER_MODEL,
        "extra_headers": {
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Resume Job Matcher",
        },
        "messages": [{"role": "user", "content": prompt}],
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens

    for attempt in range(3):
        try:
            response = _client().chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        except RateLimitError:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))  # 1.5s, then 3s
    return ""


def _parse_json(text: str) -> dict:
    """Models sometimes wrap JSON in ```json fences — strip those before parsing."""
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


def _str(v) -> str:
    return str(v).strip() if v else ""


_ICON_PREFIX = re.compile(
    r"^(envelopp?e|telephone|phone|globe|location|map[- ]?marker)[:\s]*",
    re.IGNORECASE,
)


def _clean_contact(contact: str) -> str:
    """Strip icon-label words the model sometimes prepends to a contact value.

    Works per ' · ' segment and even when the word is glued to the value
    (e.g. 'envelopperohan@x.com' → 'rohan@x.com'). Only matches at the START of
    a segment, so it can never damage 'linkedin.com/...' or 'gmail.com'.
    """
    parts = [_ICON_PREFIX.sub("", p.strip()).strip() for p in contact.split("·")]
    return " · ".join(p for p in parts if p)


def _normalize_resume(raw: dict, fallback_text: str) -> dict:
    """Coerce the model's JSON into a safe, fully-typed shape for the template."""
    if not isinstance(raw, dict) or not raw:
        return {
            "name": "", "contact": "", "summary": fallback_text[:1200],
            "skills": [], "experience": [], "projects": [], "education": [], "awards": [],
        }

    def _list(v):
        return v if isinstance(v, list) else []

    def _bullets(e):
        return [_str(b) for b in _list(e.get("bullets")) if _str(b)]

    experience = [
        {
            "role": _str(e.get("role")),
            "company": _str(e.get("company")),
            "dates": _str(e.get("dates")),
            "bullets": _bullets(e),
        }
        for e in _list(raw.get("experience"))
        if isinstance(e, dict)
    ]
    projects = [
        {
            "name": _str(p.get("name")),
            "tech": _str(p.get("tech")),
            "dates": _str(p.get("dates")),
            "bullets": _bullets(p),
        }
        for p in _list(raw.get("projects"))
        if isinstance(p, dict)
    ]
    education = [
        {
            "institution": _str(ed.get("institution")),
            "detail": _str(ed.get("detail")),
            "dates": _str(ed.get("dates")),
        }
        for ed in _list(raw.get("education"))
        if isinstance(ed, dict)
    ]
    return {
        "name": _str(raw.get("name")),
        "contact": _clean_contact(_str(raw.get("contact"))),
        "summary": _str(raw.get("summary")),
        "skills": [_str(s) for s in _list(raw.get("skills")) if _str(s)],
        "experience": experience,
        "projects": projects,
        "education": education,
        "awards": [_str(a) for a in _list(raw.get("awards")) if _str(a)],
    }


class LLMClient:
    def extract_profile(self, resume_text: str) -> dict:
        """resume text → normalized profile dict matching CandidateProfile fields."""
        prompt = f"""Extract the candidate's profile from this resume.

For "country", return the 2-letter ISO country code where the candidate is based
(e.g. "in" for India, "us" for USA, "gb" for the UK), lowercase. Infer it from the
location if not stated.

For "titles", infer the candidate's primary professional role from the WHOLE resume
(weighing all their experience, projects, and skills together — not just their most
recent job). Return only the role, e.g. "Backend Developer" — not "Backend Developer
at Acme", and not the literal heading from one job.

Resume:
{resume_text}

Respond ONLY with JSON, no other text:
{{"name": "", "email": "", "phone": "", "location": "", "country": "", "skills": [], "titles": [], "years_experience": null}}"""
        try:
            raw = _parse_json(_complete(prompt))
        except (json.JSONDecodeError, Exception):
            raw = {}

        # Normalize to exactly the model's fields so create(**profile) is safe.
        years = raw.get("years_experience")
        return {
            "name": str(raw.get("name") or ""),
            "email": str(raw.get("email") or ""),
            "phone": str(raw.get("phone") or ""),
            "location": str(raw.get("location") or ""),
            "country": str(raw.get("country") or "").lower()[:8],
            "skills": raw.get("skills") if isinstance(raw.get("skills"), list) else [],
            "titles": raw.get("titles") if isinstance(raw.get("titles"), list) else [],
            "years_experience": years if isinstance(years, (int, float)) else None,
        }

    def score(self, resume_text: str, jd_text: str) -> dict:
        """resume + JD → {score: 0-10, reasoning}."""
        prompt = f"""Job description:
{jd_text}

Candidate resume:
{resume_text}

Score this candidate's fit from 0-10 and give a 2-sentence reason.
Respond ONLY with JSON, no other text:
{{"score": 0, "reasoning": ""}}"""
        try:
            return _parse_json(_complete(prompt))
        except (json.JSONDecodeError, Exception):
            return {"score": 0.0, "reasoning": ""}

    def tailor_resume(self, resume_text: str, jd_text: str) -> dict:
        """resume + JD → STRUCTURED resume tailored to the job (our template renders it)."""
        prompt = f"""Tailor this resume to the job description below. Keep every real fact
accurate — do NOT invent, drop, or merge details. Reword and reorder to emphasise what
this job needs.

Return ONLY JSON in EXACTLY this shape (no markdown, no commentary):
{{
  "name": "",
  "contact": "raw values only, e.g. '+91-9852661989 · name@email.com · linkedin.com/in/x' — NO icon words like 'envelope'/'phone'/'mail', NO labels, just the values separated by ' · '",
  "summary": "2-3 sentence professional summary",
  "skills": ["Languages: ...", "Technologies: ...", "Core: ..."],
  "experience": [
    {{"role": "", "company": "", "dates": "", "bullets": ["", ""]}}
  ],
  "projects": [
    {{"name": "", "tech": "", "dates": "", "bullets": [""]}}
  ],
  "education": [
    {{"institution": "", "detail": "", "dates": ""}}
  ],
  "awards": ["", ""]
}}

Job description:
{jd_text}

Original resume:
{resume_text}"""
        try:
            raw = _parse_json(
                _complete(prompt, max_tokens=2500, model=settings.OPENROUTER_MODEL_TAILOR)
            )
        except (json.JSONDecodeError, Exception):
            raw = {}
        return _normalize_resume(raw, resume_text)
