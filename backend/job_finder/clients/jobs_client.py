"""Job-search API wrapper. Turns a candidate profile into real job postings.

Uses Adzuna (a job-listings API, not AI). Builds a location-first result set
across four tiers, biased toward the candidate's actual skills:

    Tier 1  candidate's city            (their country endpoint, where=city)
    Tier 2  rest of candidate's country (their country endpoint, no city)
    Tier 3  other countries, remote
    Tier 4  other countries, onsite
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings

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
MAX_TOTAL = 12    # cap total jobs → caps the LLM scoring loop (free-tier safe)


def _clean_role(title: str) -> str:
    """'Backend Developer at Acme' → 'Backend Developer'."""
    title = re.split(r"\s+(?:at|@|for)\s+", title, flags=re.IGNORECASE)[0]
    title = re.split(r"\s*[|,/\-–—]\s*", title)[0]
    return title.strip()


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
    def search(self, profile: dict) -> list[dict]:
        """profile → list of job dicts, each tagged with country + tier."""
        if not settings.ADZUNA_APP_ID or not settings.ADZUNA_APP_KEY:
            return []

        titles = profile.get("titles") or []
        skills = profile.get("skills") or []
        role = _clean_role(titles[0]) if titles else ""
        skill_terms = " ".join(skills[:5])
        location = profile.get("location") or ""

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
            for j in jobs:
                shaped = self._shape(j)
                key = shaped["source_url"] or f'{shaped["title"]}|{shaped["company"]}'
                if not key or key in seen:
                    continue
                seen.add(key)
                shaped["country"] = country
                # other-country jobs split by remote (3) vs onsite (4)
                shaped["tier"] = fixed_tier if fixed_tier else (3 if shaped["is_remote"] else 4)
                collected.append(shaped)

        url = lambda c: f"{settings.ADZUNA_BASE_URL}/{c}/search/1"  # noqa: E731

        # Build every tier's Adzuna request up front, in priority order:
        #   (url, params, country, fixed_tier)
        # Tier 1 — candidate's city, ONLY when we have a real city (not just the
        # country name). Otherwise skip straight to the region tier so in-country
        # jobs rank purely by score.
        tasks: list[tuple[str, dict, str, int | None]] = []
        if _is_real_city(location, home):
            tasks.append((url(home), {**auth, **query, "where": location}, home, 1))
        # Tier 2 — across the candidate's country
        tasks.append((url(home), {**auth, **query}, home, 2))
        # Tier 3/4 — most relevant other markets for this home country
        markets = TIER3_MARKETS.get(home, DEFAULT_TIER3)
        for oc in [c for c in markets if c != home and c in ADZUNA_COUNTRIES][:2]:
            tasks.append((url(oc), {**auth, **query}, oc, None))

        # Fire all tier calls concurrently — they're independent HTTP requests.
        # pool.map keeps results in task order, so dedup priority (city > country
        # > abroad) is preserved when we feed them through `add` below.
        with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            results = list(pool.map(lambda t: self._fetch(t[0], t[1]), tasks))

        for (_, _, country, fixed_tier), jobs in zip(tasks, results):
            add(jobs, country, fixed_tier)

        collected.sort(key=lambda d: d["tier"])
        return collected[:MAX_TOTAL]

    def _fetch(self, url: str, params: dict) -> list[dict]:
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            return r.json().get("results", [])
        except requests.RequestException:
            return []

    @staticmethod
    def _shape(job: dict) -> dict:
        title = job.get("title", "") or ""
        desc = job.get("description", "") or ""
        return {
            "title": title,
            "company": (job.get("company") or {}).get("display_name", ""),
            "jd_text": desc,
            "source_url": job.get("redirect_url", ""),
            "is_remote": "remote" in f"{title} {desc}".lower(),
        }
