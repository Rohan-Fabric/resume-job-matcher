"""Job-search API wrapper. Turns a candidate profile into real job postings.

Uses Adzuna (a job-listings API, not AI) as the primary source, plus Jooble
and Remotive as extra sources to widen coverage. Builds a location-first
result set across four tiers, biased toward the candidate's actual skills:

    Tier 1  candidate's city            (their country endpoint, where=city)
    Tier 2  rest of candidate's country (their country endpoint, no city; Jooble too)
    Tier 3  other countries, remote     (Remotive too)
    Tier 4  other countries, onsite
"""
from __future__ import annotations

import html
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone as dt_timezone

import requests
from django.conf import settings

SOURCE_TIMEOUT = 5  # seconds — one slow provider must never stall the whole search

ADZUNA_COUNTRIES = {
    "gb", "us", "at", "au", "be", "br", "ca", "ch", "de", "es",
    "fr", "in", "it", "mx", "nl", "nz", "pl", "sg", "za",
}

# For Tier 3/4, scan the most relevant other markets per home country
# (proximity, language, common remote-work corridors), in priority order.
# The home country is filtered out and the top 2 remaining are used.
TIER3_MARKETS: dict[str, list[str]] = {
    "in": ["us", "gb", "au"],          # India → US/UK/AU remote corridors
    "mx": ["us", "es", "ca"],          # Mexico → US proximity + Spanish market
    "br": ["us", "es", "gb"],          # Brazil → US + Spanish/EU
    "de": ["ch", "at", "nl"],          # Germany → DACH + neighbours
    "at": ["de", "ch", "nl"],
    "ch": ["de", "fr", "at"],
    "fr": ["be", "ch", "gb"],
    "be": ["nl", "fr", "de"],
    "nl": ["de", "be", "gb"],
    "es": ["gb", "fr", "mx"],          # Spain → EU + Spanish-speaking
    "it": ["ch", "fr", "de"],
    "pl": ["de", "gb", "nl"],
    "gb": ["us", "nl", "de"],
    "us": ["ca", "gb", "au"],
    "ca": ["us", "gb", "au"],
    "au": ["nz", "sg", "gb"],
    "nz": ["au", "sg", "gb"],
    "sg": ["au", "us", "gb"],
    "za": ["gb", "us", "nl"],
}
DEFAULT_TIER3 = ["us", "gb", "ca"]

# Country *names* per ISO code — used to tell "the candidate gave a real city"
# apart from "the candidate only gave their country". If location is just the
# country name (e.g. "India"), there's no city tier — everything in-country is
# one region tier, so results sort by score instead of by a meaningless split.
COUNTRY_NAMES: dict[str, set[str]] = {
    "in": {"india", "bharat"},
    "us": {"united states", "united states of america", "usa", "us", "america"},
    "gb": {"united kingdom", "uk", "great britain", "england", "scotland", "wales"},
    "au": {"australia"}, "ca": {"canada"}, "de": {"germany", "deutschland"},
    "fr": {"france"}, "es": {"spain", "españa"}, "it": {"italy", "italia"},
    "nl": {"netherlands", "holland"}, "br": {"brazil", "brasil"}, "mx": {"mexico", "méxico"},
    "at": {"austria"}, "be": {"belgium"}, "ch": {"switzerland"}, "nz": {"new zealand"},
    "pl": {"poland"}, "sg": {"singapore"}, "za": {"south africa"},
}

PER_PAGE = 5      # results per Adzuna call (keeps total scoring calls in check)
MAX_TOTAL = 25    # cap total jobs → caps the LLM scoring loop (free-tier safe)


def _clean_role(title: str) -> str:
    """'Backend Developer at Acme' → 'Backend Developer'."""
    title = re.split(r"\s+(?:at|@|for)\s+", title, flags=re.IGNORECASE)[0]
    title = re.split(r"\s*[|,/\-–—]\s*", title)[0]
    return title.strip()


def _strip_html(text: str) -> str:
    """Raw HTML (Remotive descriptions) → clean, readable plain text."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _format_adzuna_salary(lo: float | None, hi: float | None) -> str:
    """Adzuna gives numeric min/max with no currency string. A single-value
    posting has min == max — show it once instead of '224266-224266'."""
    if not lo or not hi:
        return ""
    return f"${lo:,.0f}" if lo == hi else f"${lo:,.0f}-${hi:,.0f}"


def _detect_currency(salary_str: str) -> str:
    """Extract currency from salary string. Default to USD if not found."""
    if not salary_str:
        return "USD"
    if "£" in salary_str or "GBP" in salary_str.upper():
        return "GBP"
    if "€" in salary_str or "EUR" in salary_str.upper():
        return "EUR"
    if "₹" in salary_str or "INR" in salary_str.upper():
        return "INR"
    if "$" in salary_str or "USD" in salary_str.upper():
        return "USD"
    return "USD"


def _detect_salary_period(salary_str: str, job_data: dict) -> str:
    """Detect if salary is annual, monthly, or hourly."""
    combined = f"{salary_str} {job_data.get('description', '')}".lower()
    if any(word in combined for word in ["/hr", "per hour", "hourly", "hour"]):
        return "hourly"
    if any(word in combined for word in ["/mo", "per month", "monthly", "month"]):
        return "monthly"
    # Default to annual for most job postings
    return "annual"


def _parse_salary_max(salary_raw: str) -> float | None:
    """Extract maximum salary from range like '$90,000 - $120,000' → 120000.0"""
    numbers = re.findall(r"[\d,]+(?:\.\d+)?", salary_raw)
    if len(numbers) >= 2:
        return float(numbers[-1].replace(",", ""))
    return None


def _parse_salary_min(salary_raw: str) -> float | None:
    """First number in the source's raw salary string, for >= filtering.
    '$90,000 - $120,000' → 90000.0. No number → None (filter just skips it)."""
    m = re.search(r"[\d,]+(?:\.\d+)?", salary_raw)
    return float(m.group().replace(",", "")) if m else None


def _parse_date(value: str) -> datetime | None:
    """Best-effort ISO date parse. Sources disagree on format — never let a
    bad/missing date blow up ingestion, just store None. Some sources (Jooble)
    give no timezone at all; assume UTC rather than store a naive datetime
    into a USE_TZ=True field."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=dt_timezone.utc)


def _is_real_city(location: str, home: str) -> bool:
    """True only if `location` looks like an actual city, not the country itself.

    A resume that says just "India" gives us no city to search — running a
    "city" tier on it would duplicate the country search and scramble ordering.
    """
    loc = location.strip().lower()
    if not loc:
        return False
    return loc not in COUNTRY_NAMES.get(home, set())


class JobsClient:
    def search(self, profile: dict, page: int = 1, remote: bool = False, include_skills: bool = True) -> list[dict]:
        """profile → list of job dicts, each tagged with country + tier.

        `page` advances the result page across sources, so "load more" fetches
        fresh listings instead of the same first page again.

        `remote` biases every source's query toward remote roles, so the home
        country's remote jobs surface too (not just US-centric remote boards).

        `include_skills` when False, searches only on role (ignores candidate skills)."""
        if not settings.ADZUNA_APP_ID or not settings.ADZUNA_APP_KEY:
            return []

        titles = profile.get("titles") or []
        skills = profile.get("skills") or []
        role = _clean_role(str(titles[0])) if titles else ""
        skill_terms = " ".join(str(s) for s in skills[:5])  # str(): never crash on join
        location = profile.get("location") or ""

        # nothing to search on → no point hitting the APIs with an empty query
        if not role and not skill_terms:
            return []

        # When include_skills=False, search only on role (ignore skills)
        if not include_skills:
            skill_terms = ""

        home = (profile.get("country") or "in").lower()
        if home not in ADZUNA_COUNTRIES:
            home = "in"

        auth = {
            "app_id": settings.ADZUNA_APP_ID,
            "app_key": settings.ADZUNA_APP_KEY,
            "results_per_page": PER_PAGE,
            "content-type": "application/json",
        }
        query = {"what": role, "what_or": skill_terms} if role else {"what_or": skill_terms}

        collected: list[dict] = []
        seen: set[str] = set()

        def add(jobs: list[dict], country: str, fixed_tier: int | None) -> None:
            for shaped in jobs:
                key = shaped["source_url"] or f'{shaped["title"]}|{shaped["company"]}'
                if not key or key in seen:
                    continue
                seen.add(key)
                shaped["country"] = country
                # other-country jobs split by remote (3) vs onsite (4)
                shaped["tier"] = fixed_tier if fixed_tier else (3 if shaped["is_remote"] else 4)
                collected.append(shaped)

        url = lambda c: f"{settings.ADZUNA_BASE_URL}/{c}/search/{page}"  # noqa: E731
        search_terms = role or skill_terms

        if remote:
            search_terms = f"{search_terms} remote".strip()
            query["what_or"] = f"{query.get('what_or', '')} remote".strip()

        # Each task is (fetch_callable, country, fixed_tier). Adzuna calls need
        # shaping; Jooble/Remotive return already-shaped dicts from their own
        # fetch methods. Built in priority order so dedup favours city > country
        # > Jooble/Remotive > abroad when the same job appears from two sources.
        tasks: list[tuple[object, str, int | None]] = []
        if _is_real_city(location, home):
            tasks.append((
                lambda: [self._shape(j) for j in self._fetch(url(home), {**auth, **query, "where": location})],
                home, 1,
            ))
        tasks.append((
            lambda: [self._shape(j) for j in self._fetch(url(home), {**auth, **query})],
            home, 2,
        ))
        tasks.append((lambda: self._fetch_jooble(search_terms, location, page), home, 2))
        tasks.append((lambda: self._fetch_remotive(search_terms), home, 3))
        markets = TIER3_MARKETS.get(home, DEFAULT_TIER3)
        for oc in [c for c in markets if c != home and c in ADZUNA_COUNTRIES][:2]:
            tasks.append((
                lambda oc=oc: [self._shape(j) for j in self._fetch(url(oc), {**auth, **query})],
                oc, None,
            ))

        # Fire every source concurrently — they're independent HTTP requests.
        with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            results = list(pool.map(lambda t: t[0](), tasks))

        for (_, country, fixed_tier), jobs in zip(tasks, results):
            print(f"[jobs] {country} tier={fixed_tier} raw={len(jobs)}")  # ponytail: drop once you've seen counts
            add(jobs, country, fixed_tier)

        collected.sort(key=lambda d: d["tier"])
        print(f"[jobs] total raw collected (pre-cap) = {len(collected)}")
        return collected[:MAX_TOTAL]

    def _fetch(self, url: str, params: dict) -> list[dict]:
        try:
            r = requests.get(url, params=params, timeout=SOURCE_TIMEOUT)
            r.raise_for_status()
            return r.json().get("results", [])
        except requests.RequestException:
            return []  # provider down/slow/timed out — other sources still return

    def _fetch_jooble(self, keywords: str, location: str, page: int = 1) -> list[dict]:
        """Jooble: free key, broad coverage similar to Adzuna. Returns shaped dicts."""
        if not settings.JOOBLE_API_KEY:
            return []
        try:
            r = requests.post(
                f"https://jooble.org/api/{settings.JOOBLE_API_KEY}",
                json={"keywords": keywords, "location": location, "page": str(page)},
                timeout=SOURCE_TIMEOUT,
            )
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
        except requests.RequestException:
            return []
        return [
            {
                "title": j.get("title", "") or "",
                "company": j.get("company", "") or "",
                "jd_text": j.get("snippet", "") or "",
                "source_url": j.get("link", "") or "",
                "location": j.get("location", "") or "",
                "is_remote": "remote" in f"{j.get('title', '')} {j.get('snippet', '')}".lower(),
                "posted_at": _parse_date(j.get("updated", "")),
                "salary_raw": j.get("salary", "") or "",
                "salary_min": _parse_salary_min(j.get("salary", "") or ""),
                "salary_max": _parse_salary_max(j.get("salary", "") or ""),
                "currency": _detect_currency(j.get("salary", "") or ""),
                "salary_period": _detect_salary_period(j.get("salary", "") or "", j),
                "job_type": j.get("type", "") or "",
                "source": "jooble",
            }
            for j in jobs[:PER_PAGE]
        ]

    def _fetch_remotive(self, search: str) -> list[dict]:
        """Remotive: free, no key, remote-only listings. Returns shaped dicts."""
        try:
            r = requests.get(
                "https://remotive.com/api/remote-jobs",
                params={"search": search, "limit": PER_PAGE},
                timeout=SOURCE_TIMEOUT,
            )
            r.raise_for_status()
            jobs = r.json().get("jobs", [])
        except requests.RequestException:
            return []
        return [
            {
                "title": j.get("title", "") or "",
                "company": j.get("company_name", "") or "",
                "jd_text": _strip_html(j.get("description", "") or ""),
                "source_url": j.get("url", "") or "",
                "location": j.get("candidate_required_location", "") or "",
                "is_remote": True,
                "posted_at": _parse_date(j.get("publication_date", "")),
                "salary_raw": j.get("salary", "") or "",
                "salary_min": _parse_salary_min(j.get("salary", "") or ""),
                "salary_max": _parse_salary_max(j.get("salary", "") or ""),
                "currency": _detect_currency(j.get("salary", "") or ""),
                "salary_period": _detect_salary_period(j.get("salary", "") or "", j),
                "job_type": j.get("job_type", "") or "",
                "source": "remotive",
            }
            for j in jobs[:PER_PAGE]
        ]

    @staticmethod
    def _shape(job: dict) -> dict:
        title = job.get("title", "") or ""
        desc = job.get("description", "") or ""
        salary_raw = _format_adzuna_salary(job.get("salary_min"), job.get("salary_max"))
        return {
            "title": title,
            "company": (job.get("company") or {}).get("display_name", ""),
            "jd_text": desc,
            "source_url": job.get("redirect_url", ""),
            "location": (job.get("location") or {}).get("display_name", ""),
            "is_remote": "remote" in f"{title} {desc}".lower(),
            "posted_at": _parse_date(job.get("created", "")),
            "salary_raw": salary_raw,
            "salary_min": job.get("salary_min"),  # Adzuna already gives this as a number
            "salary_max": job.get("salary_max"),  # Adzuna already gives this as a number
            "currency": "USD",  # Adzuna doesn't provide currency, default to USD
            "salary_period": "annual",  # Adzuna defaults to annual
            "job_type": (job.get("contract_time") or job.get("contract_type") or ""),
            "source": "adzuna",
        }
