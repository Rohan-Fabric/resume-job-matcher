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


def _client(for_google: bool = False) -> OpenAI:
    if for_google and getattr(settings, "GOOGLE_API_KEY", ""):
        return OpenAI(
            api_key=settings.GOOGLE_API_KEY,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
    return OpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url=settings.OPENROUTER_BASE_URL,
    )


def _complete(prompt: str, max_tokens: int | None = None, model: str | None = None) -> str:
    """One chat completion call (OpenRouter or Google AI Studio). Returns raw text reply.

    Retries on rate-limit (429) with a short backoff — important now that scoring
    fans out concurrent calls.
    """
    target_model = model or settings.OPENROUTER_MODEL
    is_google = bool(getattr(settings, "GOOGLE_API_KEY", "")) and ("gemini" in target_model.lower())
    if is_google:
        target_model = target_model.split("/")[-1].split(":")[0]

    kwargs: dict = {
        "model": target_model,
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
            response = _client(for_google=is_google).chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        except RateLimitError:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))  # 1.5s, then 3s
    return ""


def _parse_json(text: str) -> dict:
    """Parse the model's JSON reply, tolerating ```json fences and surrounding
    prose (e.g. 'Here is the resume: {…}. Hope it helps!'). Without this, a
    chatty model drops us into the raw-text fallback and the resume loses all
    its structure."""
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])  # grab the outermost {…}
        raise


def _str(v) -> str:
    return str(v).strip() if v else ""


def _str_list(v) -> list[str]:
    """Coerce an LLM 'list' field to clean non-empty strings. Guards the later
    ' '.join(skills) from a TypeError when the model returns numbers or dicts."""
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        if x is None:
            continue  # else str(None) → literal "None" leaks into skills
        s = (x.get("name") or x.get("skill") or "") if isinstance(x, dict) else str(x)
        s = s.strip()
        if s:
            out.append(s)
    return out


def _num(v):
    """First number in v as float, else None ('5 years' → 5.0, '5+' → 5.0)."""
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def _clamp_score(v) -> float:
    """LLM score → float in [0,10]. Handles 8, '8', '8/10', '8 out of 10',
    negatives, and junk (-?\\d so '-5' clamps to 0, not 5)."""
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    n = float(m.group()) if m else 0.0
    return max(0.0, min(10.0, n))


# LinkedIn/GitHub have a fixed URL shape — regex them straight from the resume
# text instead of asking the LLM (no hallucinated handles, no prompt change).
_LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w%-]+", re.I)
_GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[\w-]+", re.I)


def _find_url(pattern: re.Pattern, text: str) -> str:
    """First URL matching `pattern`, normalized to https://. '' if none."""
    m = pattern.search(text)
    if not m:
        return ""
    url = m.group(0)
    return url if url.lower().startswith("http") else f"https://{url}"


_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _clean_email(value: str) -> str:
    """Models glue icon words onto the email (e.g. 'envelopemdrohan@x.com').
    An email has a fixed shape — pull it out instead of guessing every prefix."""
    m = _EMAIL_RE.search(value)
    return m.group(0) if m else value


_MAILTO_RE = re.compile(r"mailto:([\w.+-]+@[\w-]+\.[\w.-]+)", re.I)


def _find_email(text: str) -> str:
    """The candidate's email, cleanly. A 'mailto:' link (from the PDF's link
    annotation) is the trustworthy source — visible text can have icon-glyph
    junk glued on (e.g. 'perohan@…') that a bare email regex can't strip. Fall
    back to the first plain email match only if there's no mailto link."""
    m = _MAILTO_RE.search(text)
    if m:
        return m.group(1)
    m = _EMAIL_RE.search(text)
    return m.group(0) if m else ""


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

    # build then drop entries with no real content, so an empty section never
    # renders a blank header (a fresher may legitimately have no experience).
    experience = [
        e for e in (
            {
                "role": _str(x.get("role")),
                "company": _str(x.get("company")),
                "dates": _str(x.get("dates")),
                "bullets": _bullets(x),
            }
            for x in _list(raw.get("experience"))
            if isinstance(x, dict)
        )
        if e["role"] or e["company"] or e["bullets"]
    ]
    projects = [
        p for p in (
            {
                "name": _str(x.get("name")),
                "tech": _str(x.get("tech")),
                "dates": _str(x.get("dates")),
                "bullets": _bullets(x),
            }
            for x in _list(raw.get("projects"))
            if isinstance(x, dict)
        )
        if p["name"] or p["bullets"]
    ]
    education = [
        ed for ed in (
            {
                "institution": _str(x.get("institution")),
                "detail": _str(x.get("detail")),
                "dates": _str(x.get("dates")),
            }
            for x in _list(raw.get("education"))
            if isinstance(x, dict)
        )
        if ed["institution"] or ed["detail"]
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
    def extract_profile(self, resume_text: str, model: str | None = None) -> dict:
        """resume text → normalized profile dict matching CandidateProfile fields."""
        prompt = f"""Extract the candidate's profile from this resume.

For "country", return the 2-letter ISO country code where the candidate is based
(e.g. "in" for India, "us" for USA, "gb" for the UK), lowercase. Infer it from the
location if not stated.

For "titles", infer the candidate's primary professional role from the WHOLE resume
(weighing all their experience, projects, and skills together — not just their most
recent job). Return only the role, e.g. "Backend Developer" — not "Backend Developer
at Acme", and not the literal heading from one job.

For "years_experience", calculate or estimate the candidate's total professional work
or internship experience in years as a float (e.g. 1.5, 3.0, or 0.5 for internships).
If they are a student/fresher with projects or internships, estimate realistically (e.g. 0.5 or 1.0). Do not return null.

Resume:
{resume_text}

Respond ONLY with JSON, no other text:
{{"name": "", "email": "", "phone": "", "location": "", "country": "", "skills": [], "titles": [], "years_experience": 0.0}}"""
        try:
            use_model = model or getattr(settings, "OPENROUTER_MODEL_EXTRACT", settings.OPENROUTER_MODEL)
            raw = _parse_json(_complete(prompt, model=use_model))
        except (json.JSONDecodeError, Exception):
            raw = {}

        # Normalize to exactly the model's fields so create(**profile) is safe.
        return {
            "name": str(raw.get("name") or ""),
            "email": _find_email(resume_text) or _clean_email(str(raw.get("email") or "")),
            "phone": _ICON_PREFIX.sub("", str(raw.get("phone") or "")).strip(),
            "location": _ICON_PREFIX.sub("", str(raw.get("location") or "")).strip(),
            "country": str(raw.get("country") or "").lower()[:8],
            "linkedin": _find_url(_LINKEDIN_RE, resume_text),
            "github": _find_url(_GITHUB_RE, resume_text),
            "skills": _str_list(raw.get("skills")),
            "titles": _str_list(raw.get("titles")),
            "years_experience": _num(raw.get("years_experience")),
        }

    def score(self, resume_text: str, jd_text: str) -> dict:
        """Lightweight scoring: resume + JD → {score, one_line_summary}.
        Fast evaluation so card badges appear in seconds."""
        prompt = f"""Job description:
{jd_text[:3500]}

Candidate resume:
{resume_text[:3500]}

Evaluate this candidate's fit for the role on a 0 to 10 scale.
Scoring Rubric:
- 8 to 10: Excellent/Strong fit. Candidate has the core domain skills, relevant title/experience, or strong transferable qualifications.
- 5 to 7: Moderate fit. Candidate has foundational skills or partial overlap.
- 0 to 4: Weak fit. Completely unrelated field or major missing requirements.

Note: If the candidate is applying for SDE, intern, entry-level, or general software roles and has solid academic projects, skills, or transferable background, score them generously (8-10). Do not penalize interns or freshers for years of experience or missing niche buzzwords.
Respond ONLY with JSON, no other text:
{{"score": 0, "one_line_summary": ""}}"""
        try:
            raw = _parse_json(_complete(prompt, max_tokens=100))
        except (json.JSONDecodeError, Exception):
            raw = {}
        return {
            "score": _clamp_score(raw.get("score")),
            "reasoning": "",
            "experience_fit": "",
            "one_line_summary": _str(raw.get("one_line_summary"))[:128],
            "matched_skills": [],
            "missing_skills": [],
        }

    def explain_match(self, resume_text: str, jd_text: str) -> dict:
        """On-demand diagnostic: resume + JD → {reasoning, experience_fit, matched_skills, missing_skills}."""
        prompt = f"""Job description:
{jd_text}

Candidate resume:
{resume_text}

Give a 2-sentence reason explaining the candidate's fit for this job.
Also give: experience_fit (one short phrase, e.g. "Good fit" / "Underqualified" / "Overqualified"),
matched_skills (skill names from the JD the candidate already has, deduplicated),
missing_skills (skill names the JD wants that the candidate's resume doesn't show). Skill names only, no sentences. Keep both lists short (max 6 each).
Respond ONLY with JSON, no other text:
{{"reasoning": "", "experience_fit": "", "matched_skills": [], "missing_skills": []}}"""
        try:
            raw = _parse_json(_complete(prompt))
        except (json.JSONDecodeError, Exception):
            raw = {}
        return {
            "reasoning": _str(raw.get("reasoning")),
            "experience_fit": _str(raw.get("experience_fit"))[:32],
            "matched_skills": _str_list(raw.get("matched_skills"))[:6],
            "missing_skills": _str_list(raw.get("missing_skills"))[:6],
        }

    def tailor_resume(self, resume_text: str, jd_text: str) -> dict:
        """resume + JD → STRUCTURED resume tailored to the job (our template renders it)."""
        prompt = f"""You are a senior resume writer and ATS (Applicant Tracking System) expert
with 10+ years getting resumes past automated screeners and in front of recruiters. Rewrite
the candidate's resume so it is tailored to the job description and maximally ATS-friendly.

ACCURACY — non-negotiable:
- Use ONLY facts present in the original resume. NEVER invent, exaggerate, or add skills,
  employers, titles, dates, or metrics the candidate does not actually have.
- You may reword, reorder, and re-emphasise. You may NOT fabricate.

ATS OPTIMISATION:
- Mirror the EXACT keywords, tool names, and skill phrasing from the job description wherever
  the candidate genuinely has that experience — ATS software matches on exact terms.
- Put the most JD-relevant experience, projects, and skills FIRST.
- Start every experience/project bullet with a strong action verb (Built, Led, Designed,
  Optimised, Shipped, Automated) and quantify impact whenever a number exists in the source.
- Group skills under clear categories the JD uses (Languages, Frameworks, Tools, Core).
- Plain text only — no tables, columns, emojis, or symbols an ATS parser can choke on.

SOURCE may be prose/paragraphs, not a formatted resume. Either way, extract the real roles,
projects, education, and achievements into the structured fields — never dump into "summary".

OUTPUT — strict, obey exactly:
- Return ONE valid JSON object and NOTHING else: no markdown, no code fences, no comments,
  no text before or after the JSON.
- Use EXACTLY these keys and value types. Omit an item entirely rather than returning an
  empty or placeholder one. Every bullet must be a real, specific sentence.
- "contact": raw values only, separated by ' · ' (e.g. '+91-9852661989 · name@email.com ·
  linkedin.com/in/x') — NO icon words ('envelope'/'phone'/'mail'), NO labels.

{{
  "name": "",
  "contact": "",
  "summary": "2-3 sentences targeting THIS role, front-loaded with JD keywords the candidate truly matches",
  "skills": ["Languages: ...", "Frameworks: ...", "Tools: ...", "Core: ..."],
  "experience": [
    {{"role": "", "company": "", "dates": "", "bullets": ["action verb + what + quantified impact"]}}
  ],
  "projects": [
    {{"name": "", "tech": "", "dates": "", "bullets": [""]}}
  ],
  "education": [
    {{"institution": "", "detail": "", "dates": ""}}
  ],
  "awards": [""]
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
