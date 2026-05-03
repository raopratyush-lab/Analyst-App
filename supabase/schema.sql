-- ============================================================
-- Analyst Q&A Prediction Agent — Supabase Schema
-- Version: 1.0  |  PRD: v3.0 Final
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";


-- ============================================================
-- TAXONOMY
-- /taxonomy/signals/active  +  /taxonomy/signals/archived
-- /taxonomy/topics
-- ============================================================

create table if not exists taxonomy_topics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists taxonomy_signals (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid references taxonomy_topics(id) on delete cascade,
  name        text not null unique,
  description text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Seed parent topics (Indian IT sector)
insert into taxonomy_topics (name) values
  ('Profitability'),
  ('Revenue & Growth'),
  ('Deal Pipeline'),
  ('Headcount'),
  ('Guidance'),
  ('Capital Allocation'),
  ('Technology'),
  ('Macro & Sector')
on conflict (name) do nothing;

-- Seed initial leaf signals per PRD §6.7
insert into taxonomy_signals (topic_id, name, status) values
  ((select id from taxonomy_topics where name = 'Profitability'), 'EBITDA margin compression', 'active'),
  ((select id from taxonomy_topics where name = 'Profitability'), 'Wage inflation impact', 'active'),
  ((select id from taxonomy_topics where name = 'Profitability'), 'Subcontracting cost escalation', 'active'),
  ((select id from taxonomy_topics where name = 'Profitability'), 'Offshore mix shift', 'active'),

  ((select id from taxonomy_topics where name = 'Revenue & Growth'), 'Revenue miss vs. guidance', 'active'),
  ((select id from taxonomy_topics where name = 'Revenue & Growth'), 'Vertical softness - BFSI', 'active'),
  ((select id from taxonomy_topics where name = 'Revenue & Growth'), 'Vertical softness - hi-tech', 'active'),
  ((select id from taxonomy_topics where name = 'Revenue & Growth'), 'Geographic mix', 'active'),
  ((select id from taxonomy_topics where name = 'Revenue & Growth'), 'Pricing pressure', 'active'),

  ((select id from taxonomy_topics where name = 'Deal Pipeline'), 'Deal ramp slowdown', 'active'),
  ((select id from taxonomy_topics where name = 'Deal Pipeline'), 'TCV-to-revenue conversion lag', 'active'),
  ((select id from taxonomy_topics where name = 'Deal Pipeline'), 'Large deal dependency', 'active'),
  ((select id from taxonomy_topics where name = 'Deal Pipeline'), 'Deal win rate', 'active'),

  ((select id from taxonomy_topics where name = 'Headcount'), 'Bench utilisation spike', 'active'),
  ((select id from taxonomy_topics where name = 'Headcount'), 'Attrition normalisation', 'active'),
  ((select id from taxonomy_topics where name = 'Headcount'), 'Fresher absorption', 'active'),
  ((select id from taxonomy_topics where name = 'Headcount'), 'Pyramid restructuring', 'active'),

  ((select id from taxonomy_topics where name = 'Guidance'), 'Guidance credibility', 'active'),
  ((select id from taxonomy_topics where name = 'Guidance'), 'Commentary vagueness', 'active'),
  ((select id from taxonomy_topics where name = 'Guidance'), 'FY outlook revision', 'active'),
  ((select id from taxonomy_topics where name = 'Guidance'), 'Conservative vs. bullish framing', 'active'),

  ((select id from taxonomy_topics where name = 'Capital Allocation'), 'Cash conversion cycle', 'active'),
  ((select id from taxonomy_topics where name = 'Capital Allocation'), 'Dividend policy', 'active'),
  ((select id from taxonomy_topics where name = 'Capital Allocation'), 'Acquisition rationale', 'active'),
  ((select id from taxonomy_topics where name = 'Capital Allocation'), 'Buyback timing', 'active'),

  ((select id from taxonomy_topics where name = 'Technology'), 'GenAI revenue contribution', 'active'),
  ((select id from taxonomy_topics where name = 'Technology'), 'IP-led vs. services mix', 'active'),
  ((select id from taxonomy_topics where name = 'Technology'), 'Platform deal wins', 'active'),
  ((select id from taxonomy_topics where name = 'Technology'), 'AI headcount investment', 'active'),

  ((select id from taxonomy_topics where name = 'Macro & Sector'), 'US client budget freeze', 'active'),
  ((select id from taxonomy_topics where name = 'Macro & Sector'), 'BFSI recovery timeline', 'active'),
  ((select id from taxonomy_topics where name = 'Macro & Sector'), 'Visa cost pressures', 'active'),
  ((select id from taxonomy_topics where name = 'Macro & Sector'), 'Furlough impact', 'active')
on conflict (name) do nothing;


-- ============================================================
-- COMPANIES
-- ============================================================

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  ticker      text,
  exchange    text,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- ANALYSTS
-- /analysts/{analyst-id}/profile
-- ============================================================

create table if not exists analysts (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  firm                text,
  first_seen_quarter  text,
  history_depth_flag  boolean not null default false,  -- true when >= 3 quarters of data
  created_at          timestamptz not null default now(),
  unique (name, firm)
);


-- ============================================================
-- CORPUS — DOCUMENTS
-- /companies/{company}/transcripts/{quarter}/
-- /companies/{company}/reports/{quarter}/
-- /companies/{company}/results/{quarter}/
-- ============================================================

create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  quarter         text not null,    -- e.g. "Q3FY25"
  fiscal_year     text,             -- e.g. "FY25"
  doc_type        text not null check (doc_type in (
                    'transcript', 'analyst_report', 'press_release',
                    'investor_presentation', 'results_announcement', 'other'
                  )),
  source          text not null check (source in ('ir_scraper', 'pdf_upload', 'manual_drop')),
  file_path       text,             -- Supabase storage path
  file_name       text,
  ir_url          text,             -- source IR page URL if scraped
  ingested_at     timestamptz not null default now(),
  extraction_status text not null default 'pending'
                    check (extraction_status in ('pending', 'processing', 'complete', 'failed')),
  analyst_firm    text,             -- for analyst_report docs
  analyst_name    text              -- for analyst_report docs, if attributable to single analyst
);

create index if not exists idx_documents_company_quarter on documents(company_id, quarter);
create index if not exists idx_documents_doc_type on documents(doc_type);


-- ============================================================
-- TRANSCRIPT QUESTIONS
-- /companies/{company}/transcripts/{quarter}/ → extracted questions
-- /analysts/{analyst-id}/question-history/
-- ============================================================

create table if not exists transcript_questions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  analyst_id      uuid references analysts(id) on delete set null,
  quarter         text not null,
  question_text   text not null,
  question_index  integer,          -- position in transcript
  is_followup     boolean not null default false,
  signal_id       uuid references taxonomy_signals(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tq_analyst on transcript_questions(analyst_id);
create index if not exists idx_tq_company_quarter on transcript_questions(company_id, quarter);
create index if not exists idx_tq_signal on transcript_questions(signal_id);


-- ============================================================
-- ANALYST INTENT SIGNALS
-- /analysts/{analyst-id}/intent-signals/
-- Forward-looking concern language extracted from full reports
-- ============================================================

create table if not exists analyst_intent_signals (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references documents(id) on delete cascade,
  analyst_id          uuid references analysts(id) on delete set null,
  company_id          uuid not null references companies(id) on delete cascade,
  quarter             text not null,
  signal_id           uuid references taxonomy_signals(id) on delete set null,
  intent_type         text not null check (intent_type in ('followup_intent', 'unasked_flag')),
  exact_language      text not null,  -- verbatim quote from the report
  was_raised_on_call  boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists idx_ais_analyst on analyst_intent_signals(analyst_id);
create index if not exists idx_ais_company_quarter on analyst_intent_signals(company_id, quarter);
create index if not exists idx_ais_signal on analyst_intent_signals(signal_id);


-- ============================================================
-- COMPANY INTELLIGENCE
-- /companies/{company}/intelligence/{quarter}/
-- Extracted from full analyst reports
-- ============================================================

create table if not exists company_intelligence (
  id                      uuid primary key default gen_random_uuid(),
  document_id             uuid not null references documents(id) on delete cascade,
  company_id              uuid not null references companies(id) on delete cascade,
  analyst_id              uuid references analysts(id) on delete set null,
  quarter                 text not null,

  -- Estimate revisions
  revenue_revision        text,     -- e.g. "+2.1% vs prior"
  ebitda_revision         text,
  eps_revision            text,

  -- Valuation
  valuation_commentary    text,
  fair_value_change       text,
  multiple_assumptions    text,

  -- Recommendation
  recommendation          text check (recommendation in ('buy', 'hold', 'sell', 'neutral', 'outperform', 'underperform', 'other')),
  recommendation_change   text check (recommendation_change in ('upgrade', 'downgrade', 'maintain', 'initiate')),
  recommendation_rationale text,

  -- Consensus narrative
  consensus_narrative     text,

  created_at              timestamptz not null default now()
);

create index if not exists idx_ci_company_quarter on company_intelligence(company_id, quarter);


-- ============================================================
-- SEASONS
-- /seasons/{quarter}/
-- Season index — ingestion timestamps, peer sequence, prediction snapshots
-- ============================================================

create table if not exists seasons (
  id              uuid primary key default gen_random_uuid(),
  quarter         text not null unique,   -- e.g. "Q4FY26"
  peer_count      integer not null default 0,
  season_position text check (season_position in ('pre', 'early', 'mid', 'late')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists season_peers (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  ingested_at timestamptz not null default now(),
  unique (season_id, company_id)
);


-- ============================================================
-- PREDICTIONS
-- Generated per target company + quarter
-- ============================================================

create table if not exists predictions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  quarter               text not null,
  analyst_id            uuid references analysts(id) on delete set null,
  zone                  integer not null check (zone in (1, 2, 3)),

  predicted_question    text not null,
  signal_id             uuid references taxonomy_signals(id) on delete set null,

  -- Possibility Score (0-100)
  possibility_score     integer check (possibility_score between 0 and 100),

  -- Three independent dimensions
  signal_strength       text check (signal_strength in ('high', 'medium', 'low')),
  analyst_pattern_score integer check (analyst_pattern_score between 0 and 100),
  season_corroboration_score integer check (season_corroboration_score between 0 and 100),
  peer_transcripts_count integer not null default 0,

  -- Flags
  insufficient_history_flag boolean not null default false,
  season_driven_flag        boolean not null default false,

  -- Evidence
  evidence_type         text check (evidence_type in (
                          'own_company_history', 'peer_derived',
                          'report_intent_signal', 'unasked_flag', 'model_generated'
                        )),
  evidence_source       text,       -- specific transcript/report name

  -- Post-call actuals (filled by user after the call — V2 calibration)
  was_asked             boolean,
  actual_question       text,
  notes                 text,

  dismissed             boolean not null default false,

  generated_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_predictions_company_quarter on predictions(company_id, quarter);
create index if not exists idx_predictions_zone on predictions(zone);
create index if not exists idx_predictions_analyst on predictions(analyst_id);


-- ============================================================
-- INGESTION LOG
-- Audit trail for every scrape / upload / drop event
-- ============================================================

create table if not exists ingestion_log (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null check (event_type in ('ir_scrape', 'pdf_upload', 'manual_drop', 'extraction', 'prediction_run')),
  company_id  uuid references companies(id) on delete set null,
  quarter     text,
  document_id uuid references documents(id) on delete set null,
  status      text not null check (status in ('started', 'complete', 'failed')),
  detail      text,
  duration_ms integer,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard Storage tab,
-- or uncomment and run if using service-role key)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('corpus', 'corpus', false)
-- on conflict (id) do nothing;


-- ============================================================
-- ROW LEVEL SECURITY — single-user app, keep it simple
-- Enable RLS but allow all operations for authenticated users
-- ============================================================

alter table taxonomy_topics         enable row level security;
alter table taxonomy_signals        enable row level security;
alter table companies               enable row level security;
alter table analysts                enable row level security;
alter table documents               enable row level security;
alter table transcript_questions    enable row level security;
alter table analyst_intent_signals  enable row level security;
alter table company_intelligence    enable row level security;
alter table seasons                 enable row level security;
alter table season_peers            enable row level security;
alter table predictions             enable row level security;
alter table ingestion_log           enable row level security;

-- Allow all for authenticated users (single-user tool)
do $$
declare
  t text;
begin
  foreach t in array array[
    'taxonomy_topics','taxonomy_signals','companies','analysts','documents',
    'transcript_questions','analyst_intent_signals','company_intelligence',
    'seasons','season_peers','predictions','ingestion_log'
  ] loop
    execute format('create policy "authenticated_all_%s" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
exception when duplicate_object then null;
end $$;

-- Also allow anon for the single-user app (using anon key from client)
do $$
declare
  t text;
begin
  foreach t in array array[
    'taxonomy_topics','taxonomy_signals','companies','analysts','documents',
    'transcript_questions','analyst_intent_signals','company_intelligence',
    'seasons','season_peers','predictions','ingestion_log'
  ] loop
    execute format('create policy "anon_all_%s" on %I for all to anon using (true) with check (true)', t, t);
  end loop;
exception when duplicate_object then null;
end $$;
