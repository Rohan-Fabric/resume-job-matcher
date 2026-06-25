export interface CandidateProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  country: string;
  linkedin: string;
  github: string;
  skills: string[];
  titles: string[];
  years_experience: number | null;
}

export interface JobMatch {
  id: number;
  title: string;
  company: string;
  source_url: string;
  is_remote: boolean;
  location: string;
  country: string;
  tier: number;
  fit_score: number | null;
  reasoning: string;
}

export interface Resume {
  id: number;
  is_parsed: boolean;
  created_date: string;
  profile: CandidateProfile | null;
  matches: JobMatch[];
}

export interface TailoredResume {
  id: number;
  job_match: number;
  content: string;
  created_date: string;
}
