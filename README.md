# Resume Job Matcher

Upload a resume → AI extracts your details → finds best-matching jobs (location / remote aware)
→ per job you can **Apply** (go to the posting) or **Download** a resume tailored to that job's JD.

## Stack

- **backend/** — Django + DRF, Postgres. Synchronous: the service layer calls the LLM and
  job-search API inline during the request (no Celery/queue in v1).
- **frontend/** — Next.js (App Router). Talks to the backend over HTTP only.
- Orchestration via `docker-compose.local.yml` (backend, postgres, frontend).

## Architecture

```
frontend/  ──HTTP──▶  backend/  ──▶  Postgres
                         │  (view → service → repository → model)
                         │  service calls LLM + job API inline
                         ▼
                    LLM + job-search API
```

## Flow

```
1. Upload resume (PDF)
2. LLM extracts a profile: name/email/phone, skills, inferred role(titles),
   location, country, years_experience — inferred from the WHOLE resume,
   not just the most recent job
3. Find live jobs via Adzuna, ranked into four location tiers (in priority order):
     Tier 1 — candidate's own city          (onsite + remote)
     Tier 2 — rest of candidate's country   (onsite + remote)
     Tier 3 — other countries, REMOTE roles
     Tier 4 — other countries, ONSITE roles
   (Tier 1 is skipped if the resume only gives a country, not a real city —
   see _is_real_city in jobs_client.py — so results don't duplicate across tiers.)
4. Each job is scored 0-10 by an LLM against the resume, with a short reason
5. Results sort by tier, then by fit_score within a tier
6. Each job card shows: [Apply → posting link]  [Download tailored PDF]
7. Tailoring happens ON DEMAND, only when the user clicks Download — the LLM
   rewrites the resume as structured JSON (facts unchanged, just reworded/
   reordered to match that JD), which the backend renders into a PDF via an
   HTML/CSS template + WeasyPrint (not the AI emitting raw text/markdown)
```

## Quick start

```bash
# 1. env  (then paste your OPENROUTER_API_KEY into .env)
cp .env.dev.example .env

# 2. database + backend (single command — postgres comes up via depends_on)
docker compose -f docker-compose.local.yml up backend        # API on http://localhost:8000

# 3. frontend (separate terminal, not Docker — see frontend/README.md)
cd frontend && npm run dev                                   # UI on http://localhost:3000
```

Useful variants:
```bash
docker compose -f docker-compose.local.yml up -d backend     # detached
docker compose -f docker-compose.local.yml logs -f backend   # tail logs
docker compose -f docker-compose.local.yml down              # stop everything
```

> The `frontend` service defined in `docker-compose.local.yml` is currently unused for
> local dev (no `frontend/Dockerfile` exists yet) — run the frontend with `npm run dev`
> on the host instead.

## AI calls (OpenRouter)

| Step | Model setting | Purpose |
|------|---------------|---------|
| Extract profile | `OPENROUTER_MODEL` | Resume text → structured profile JSON |
| Score each job | `OPENROUTER_MODEL` | Resume + JD → `{score 0-10, reasoning}` |
| Tailor resume | `OPENROUTER_MODEL_TAILOR` | Resume + JD → structured resume JSON (own model, since tailoring needs longer, higher-quality generation) |

Adzuna (job search) is **not** an AI call — it's a plain REST jobs API, hit up to 4
times per upload (once per location tier), capped at `MAX_TOTAL = 12` jobs total to
keep the scoring-call count bounded on free-tier rate limits.

## Data model

| Table | Holds |
|-------|-------|
| `Resume` | uploaded file URL, raw text, is_parsed |
| `CandidateProfile` | extracted name/email/phone/skills/titles/location/country/years_experience (1:1 Resume) |
| `JobMatch` | a found job + JD text + source url + fit_score + reasoning + country + tier (many per Resume) |
| `TailoredResume` | structured tailored-resume JSON, created on Download (many per JobMatch) |
