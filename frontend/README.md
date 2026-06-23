# Resume Job Matcher — frontend

Next.js (App Router) UI. Talks to the Django backend over plain HTTP — no
server actions or API routes of its own. See the [root README](../README.md)
for the full system flow.

## Run it

The backend runs in Docker; the frontend runs directly on the host (no
`frontend/Dockerfile` exists, so don't try to bring it up via
`docker compose`):

```bash
# from this directory
npm install   # first time only
npm run dev   # http://localhost:3000
```

Make sure the backend is already running first (`docker compose -f
../docker-compose.local.yml up backend` from the project root), and that
`NEXT_PUBLIC_API_URL` in `.env` (project root) points at it — defaults to
`http://localhost:8000`.

## Structure

```
app/
  page.tsx                  — top-level flow: idle → processing → results
  lib/api.ts                — fetch wrappers (upload, tailorForJob)
  lib/types.ts               — shared TS types (Resume, CandidateProfile, JobMatch)
  components/
    UploadCard.tsx           — drag/drop or pick a resume file
    ProcessingPipeline.tsx   — upload-phase loading animation
    ProfileSummary.tsx       — extracted profile, left rail on results
    JobCard.tsx               — one job: score ring, location chip, Apply / Download
    ScoreRing.tsx             — SVG fit-score ring (0-10, centered number)
    TailoringOverlay.tsx     — loading state while a tailored PDF is generated
```

## Key behaviors to know before touching this

- **Tailoring downloads a PDF, not JSON.** `tailorForJob()` returns a `Blob`
  (`res.blob()`, not `res.json()`) — the backend renders the PDF server-side
  and streams raw bytes back. `handleTailor()` in `page.tsx` builds an object
  URL, appends a hidden `<a download>` to the DOM, clicks it, and revokes the
  URL *after* a short delay — revoking immediately cancels the download
  mid-stream, so don't "simplify" that timeout away.
- **Job ordering is `tier` first, then `fit_score`** (`sorted` in `page.tsx`):
  tier 1 = candidate's city, 2 = candidate's country, 3 = remote abroad, 4 =
  onsite abroad. Within a tier, higher score wins.
- **No client-side PDF generation.** There used to be a jsPDF renderer
  (`lib/pdf.ts`) — it's gone. All PDF layout lives in the backend's
  `templates/resume.html` + WeasyPrint.
