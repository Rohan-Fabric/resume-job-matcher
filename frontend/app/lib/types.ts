export interface CandidateProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  country: string;
  linkedin: string;
  github: string;
  skills: string[];
  titles: string[];  // detected roles from resume
  years_experience: number | null;
  search_role: string;  // user's custom search role override
}

export interface JobMatch {
  // No `id` — jobs are ephemeral dicts returned by the search endpoint, never
  // persisted to the DB. Use `source_url` as the stable key within a session.
  title: string;
  company: string;
  source_url: string;
  jd_text: string;
  is_remote: boolean;
  location: string;
  country: string;
  tier: number;
  fit_score: number | null;
  reasoning: string;
  posted_at: string | null;
  salary_raw: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  salary_period: string;
  job_type: string;
  source: string;
  experience_fit: string;
  one_line_summary: string;
  matched_skills: string[];
  missing_skills: string[];
}

export interface JobFilters {
  postedWithin?: 1 | 7 | 30;
  jobType?: string[];
  remote?: boolean;
}

export interface Resume {
  id: number;
  is_parsed: boolean;
  created_date: string;
  profile: CandidateProfile | null;
  matches: JobMatch[];
}
