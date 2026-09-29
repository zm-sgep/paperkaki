-- PaperKaki PostgreSQL reference schema
-- This is a design baseline. Convert into incremental migrations in implementation.
-- Use gen_random_uuid(), requiring pgcrypto on many PostgreSQL installations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('parent', 'admin');
CREATE TYPE primary_level AS ENUM ('P3', 'P4', 'P5', 'P6');
CREATE TYPE source_type AS ENUM (
  'official_moe',
  'official_seab',
  'official_school',
  'parent_provided',
  'historical_observation',
  'system_inference'
);
CREATE TYPE relationship_type AS ENUM ('prerequisite', 'reinforces', 'extends', 'related');
CREATE TYPE question_status AS ENUM ('draft', 'ai_reviewed', 'human_reviewed', 'approved', 'retired');
CREATE TYPE question_provenance AS ENUM (
  'original_human',
  'original_ai',
  'licensed',
  'public_domain',
  'organisation_owned'
);
CREATE TYPE question_role AS ENUM ('primary', 'secondary', 'prerequisite');
CREATE TYPE assessment_status AS ENUM ('draft', 'scope_confirmed', 'blueprint_ready', 'paper_generated', 'completed', 'archived');
CREATE TYPE assessment_type AS ENUM ('WA1', 'WA2', 'WA3', 'EOY', 'PRELIM', 'PSLE', 'CLASS_TEST', 'CUSTOM', 'GENERAL_PRACTICE');
CREATE TYPE blueprint_status AS ENUM ('draft', 'valid', 'invalid', 'used');
CREATE TYPE paper_status AS ENUM ('generating', 'generated', 'attempted', 'void');
CREATE TYPE review_actor_type AS ENUM ('ai', 'human');

-- AUTH/PROFILE -------------------------------------------------------------

CREATE TABLE parent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'parent',
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  moe_school_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  level primary_level NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  academic_year integer NOT NULL CHECK (academic_year BETWEEN 2000 AND 2200),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_children_parent ON children(parent_id);

-- SUBJECT/CURRICULUM -------------------------------------------------------

CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type source_type NOT NULL,
  publisher text,
  document_name text NOT NULL,
  canonical_url text,
  publication_date date,
  retrieved_date date,
  effective_from date,
  effective_to date,
  version_label text,
  storage_object_key text,
  checksum_sha256 text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE curriculum_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  name text NOT NULL,
  version_label text NOT NULL,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  source_document_id uuid REFERENCES source_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, version_label)
);

CREATE TABLE curriculum_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  official_label text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(curriculum_version_id, code)
);

CREATE TABLE curriculum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES curriculum_domains(id) ON DELETE SET NULL,
  parent_topic_id uuid REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  official_label text,
  level primary_level NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(curriculum_version_id, code, level)
);
CREATE INDEX idx_curriculum_topics_version_level ON curriculum_topics(curriculum_version_id, level);

CREATE TABLE curriculum_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  stable_code text NOT NULL,
  official_reference text,
  official_label text,
  normalized_label text NOT NULL,
  level primary_level NOT NULL,
  description text,
  assessable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(curriculum_version_id, stable_code)
);
CREATE INDEX idx_outcomes_version_level ON curriculum_outcomes(curriculum_version_id, level);
CREATE INDEX idx_outcomes_topic ON curriculum_outcomes(topic_id);

CREATE TABLE curriculum_outcome_sources (
  outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_or_section text,
  raw_excerpt text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outcome_id, source_document_id, page_or_section)
);

CREATE TABLE outcome_relationships (
  from_outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE CASCADE,
  to_outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE CASCADE,
  relationship relationship_type NOT NULL,
  notes text,
  PRIMARY KEY (from_outcome_id, to_outcome_id, relationship),
  CHECK (from_outcome_id <> to_outcome_id)
);

-- ASSESSMENTS --------------------------------------------------------------

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id),
  name text NOT NULL,
  assessment_type assessment_type NOT NULL,
  assessment_date date,
  status assessment_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessments_child_date ON assessments(child_id, assessment_date);
CREATE INDEX idx_assessments_status ON assessments(status);

CREATE TABLE assessment_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES curriculum_topics(id),
  outcome_id uuid REFERENCES curriculum_outcomes(id),
  original_text text,
  source_document_id uuid REFERENCES source_documents(id),
  source_kind source_type NOT NULL DEFAULT 'parent_provided',
  mapping_confidence numeric(5,4) CHECK (mapping_confidence IS NULL OR (mapping_confidence >= 0 AND mapping_confidence <= 1)),
  confirmed_by_parent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (topic_id IS NOT NULL OR outcome_id IS NOT NULL)
);
CREATE INDEX idx_scope_assessment ON assessment_scope_items(assessment_id);
CREATE INDEX idx_scope_outcome ON assessment_scope_items(outcome_id);

CREATE TABLE assessment_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  total_marks integer CHECK (total_marks IS NULL OR total_marks > 0),
  instructions text,
  requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by_parent boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE school_assessment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  level primary_level NOT NULL,
  academic_year integer NOT NULL,
  assessment_type assessment_type NOT NULL,
  source_document_id uuid REFERENCES source_documents(id),
  source_kind source_type NOT NULL,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  profile_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_school_profiles_lookup
ON school_assessment_profiles(school_id, subject_id, level, academic_year, assessment_type);

-- QUESTION BANK ------------------------------------------------------------

CREATE TABLE question_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_code text NOT NULL UNIQUE,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  level primary_level NOT NULL,
  title text NOT NULL,
  intent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES question_families(id),
  version integer NOT NULL CHECK (version > 0),
  status question_status NOT NULL DEFAULT 'draft',
  curriculum_version_id uuid NOT NULL REFERENCES curriculum_versions(id),
  question_type text NOT NULL,
  response_type text NOT NULL,
  cognitive_demand text NOT NULL,
  estimated_difficulty text NOT NULL CHECK (estimated_difficulty IN ('basic','standard','challenging')),
  empirical_difficulty numeric(6,5),
  marks integer NOT NULL CHECK (marks > 0),
  estimated_time_seconds integer CHECK (estimated_time_seconds IS NULL OR estimated_time_seconds > 0),
  question_content jsonb NOT NULL,
  answer_schema jsonb NOT NULL,
  worked_solution jsonb,
  marking_scheme jsonb,
  provenance question_provenance NOT NULL,
  provenance_reference text,
  rendering_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(family_id, version)
);
CREATE INDEX idx_questions_generation
ON questions(status, curriculum_version_id, estimated_difficulty, question_type);

CREATE TABLE question_outcomes (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE RESTRICT,
  role question_role NOT NULL,
  weight numeric(5,4),
  PRIMARY KEY (question_id, outcome_id, role)
);
CREATE INDEX idx_question_outcomes_outcome ON question_outcomes(outcome_id);

CREATE TABLE question_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('image','svg','table_data','diagram_data','other')),
  object_key text,
  payload jsonb,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (object_key IS NOT NULL OR payload IS NOT NULL)
);

CREATE TABLE question_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  actor_type review_actor_type NOT NULL,
  reviewer_id uuid REFERENCES parent_profiles(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject','request_changes')),
  curriculum_valid boolean,
  answer_valid boolean,
  clarity_valid boolean,
  age_appropriate boolean,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_reviews_question ON question_reviews(question_id);

-- BLUEPRINTS ---------------------------------------------------------------

CREATE TABLE assessment_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status blueprint_status NOT NULL DEFAULT 'draft',
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  total_marks integer NOT NULL CHECK (total_marks > 0),
  difficulty_basic_pct integer NOT NULL DEFAULT 30 CHECK (difficulty_basic_pct BETWEEN 0 AND 100),
  difficulty_standard_pct integer NOT NULL DEFAULT 50 CHECK (difficulty_standard_pct BETWEEN 0 AND 100),
  difficulty_challenging_pct integer NOT NULL DEFAULT 20 CHECK (difficulty_challenging_pct BETWEEN 0 AND 100),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  UNIQUE(assessment_id, version),
  CHECK (difficulty_basic_pct + difficulty_standard_pct + difficulty_challenging_pct = 100)
);

CREATE TABLE blueprint_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES assessment_blueprints(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES curriculum_topics(id),
  outcome_id uuid REFERENCES curriculum_outcomes(id),
  target_marks integer CHECK (target_marks IS NULL OR target_marks >= 0),
  min_questions integer CHECK (min_questions IS NULL OR min_questions >= 0),
  max_questions integer CHECK (max_questions IS NULL OR max_questions >= 0),
  required boolean NOT NULL DEFAULT true,
  CHECK (topic_id IS NOT NULL OR outcome_id IS NOT NULL)
);
CREATE INDEX idx_blueprint_scope_blueprint ON blueprint_scope_items(blueprint_id);

CREATE TABLE blueprint_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES assessment_blueprints(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  rule_json jsonb NOT NULL,
  hard_constraint boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PAPERS -------------------------------------------------------------------

CREATE TABLE papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES assessment_blueprints(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status paper_status NOT NULL DEFAULT 'generating',
  title text NOT NULL,
  total_marks integer NOT NULL CHECK (total_marks > 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  student_pdf_object_key text,
  answer_pdf_object_key text,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, version)
);
CREATE INDEX idx_papers_assessment ON papers(assessment_id, status);

CREATE TABLE paper_questions (
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence > 0),
  display_number text NOT NULL,
  allocated_marks integer NOT NULL CHECK (allocated_marks > 0),
  section_label text,
  PRIMARY KEY (paper_id, sequence),
  UNIQUE (paper_id, question_id)
);

-- AI/AUDIT FOUNDATION ------------------------------------------------------

CREATE TABLE ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  provider text,
  model text,
  prompt_template_version text,
  input_reference_type text,
  input_reference_id uuid,
  output_json jsonb,
  validation_status text CHECK (validation_status IN ('valid','invalid','not_checked')),
  cost_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_profile_id uuid REFERENCES parent_profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor_time ON audit_logs(actor_profile_id, created_at DESC);

-- INITIAL SUBJECT SEED -----------------------------------------------------

INSERT INTO subjects (code, name)
VALUES
  ('MATH', 'Mathematics'),
  ('SCI', 'Science'),
  ('ENG', 'English Language'),
  ('CL', 'Chinese Language')
ON CONFLICT (code) DO NOTHING;

-- ATTEMPTS / MARKING / MASTERY -------------------------------------------

CREATE TYPE attempt_mode AS ENUM ('ipad', 'print_upload');
CREATE TYPE attempt_status AS ENUM ('not_started', 'in_progress', 'submitted', 'marked', 'void');
CREATE TYPE marking_method AS ENUM ('deterministic', 'ai_assisted', 'human_review');
CREATE TYPE mastery_state AS ENUM ('not_started', 'learning', 'developing', 'almost_mastered', 'mastered', 'retained');

CREATE TABLE attempt_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE RESTRICT,
  mode attempt_mode NOT NULL,
  status attempt_status NOT NULL DEFAULT 'not_started',
  started_at timestamptz,
  submitted_at timestamptz,
  elapsed_seconds integer CHECK (elapsed_seconds IS NULL OR elapsed_seconds >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_child_time ON attempt_sessions(child_id, created_at DESC);
CREATE INDEX idx_attempts_paper ON attempt_sessions(paper_id, status);

CREATE TABLE attempt_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES attempt_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  handwriting_object_key text,
  handwriting_vector_json jsonb,
  first_meaningful_submitted_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE marking_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES attempt_responses(id) ON DELETE CASCADE,
  method marking_method NOT NULL,
  proposed_score numeric(8,3) NOT NULL CHECK (proposed_score >= 0),
  max_score numeric(8,3) NOT NULL CHECK (max_score > 0),
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reason text,
  review_required boolean NOT NULL DEFAULT false,
  final_score numeric(8,3) CHECK (final_score IS NULL OR final_score >= 0),
  ai_run_id uuid REFERENCES ai_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_marking_response ON marking_decisions(response_id, created_at DESC);

CREATE TABLE marking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marking_decision_id uuid NOT NULL REFERENCES marking_decisions(id) ON DELETE CASCADE,
  reviewer_profile_id uuid REFERENCES parent_profiles(id) ON DELETE SET NULL,
  final_score numeric(8,3) NOT NULL CHECK (final_score >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mastery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE RESTRICT,
  question_id uuid REFERENCES questions(id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES attempt_sessions(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_id uuid,
  score_ratio numeric(5,4) CHECK (score_ratio IS NULL OR (score_ratio >= 0 AND score_ratio <= 1)),
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('basic','standard','challenging')),
  first_meaningful_attempt boolean NOT NULL DEFAULT true,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mastery_evidence_child_outcome_time ON mastery_evidence(child_id, outcome_id, created_at DESC);

CREATE TABLE mastery_profiles (
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES curriculum_outcomes(id) ON DELETE RESTRICT,
  state mastery_state NOT NULL DEFAULT 'not_started',
  mastery_score numeric(5,4) CHECK (mastery_score IS NULL OR (mastery_score >= 0 AND mastery_score <= 1)),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_evidence_at timestamptz,
  retention_due_at timestamptz,
  calculation_version text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, outcome_id)
);

-- GAMIFICATION / REWARDS ---------------------------------------------------

CREATE TYPE point_event_type AS ENUM (
  'earn_activity',
  'earn_improvement',
  'earn_mastery_bonus',
  'earn_review',
  'earn_retention',
  'earn_variety',
  'earn_challenge',
  'manual_parent_bonus',
  'redeem_reward',
  'refund_redemption',
  'manual_correction'
);

CREATE TYPE reward_redemption_status AS ENUM (
  'requested',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled'
);

CREATE TABLE reward_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('draft','active','retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  policy_json jsonb NOT NULL,
  change_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE TABLE point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount <> 0),
  event_type point_event_type NOT NULL,
  reason_code text NOT NULL,
  source_entity_type text,
  source_entity_id uuid,
  source_event_id text,
  reward_policy_id uuid REFERENCES reward_policies(id) ON DELETE RESTRICT,
  mastery_before mastery_state,
  mastery_after mastery_state,
  calculation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, source_event_id)
);
CREATE INDEX idx_point_ledger_child_time ON point_ledger(child_id, created_at DESC);
CREATE INDEX idx_point_ledger_source ON point_ledger(source_entity_type, source_entity_id);

CREATE TABLE child_point_balances (
  child_id uuid PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  cached_balance integer NOT NULL DEFAULT 0 CHECK (cached_balance >= 0),
  ledger_through timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parent_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  active boolean NOT NULL DEFAULT true,
  max_total_redemptions integer CHECK (max_total_redemptions IS NULL OR max_total_redemptions > 0),
  max_redemptions_per_week integer CHECK (max_redemptions_per_week IS NULL OR max_redemptions_per_week > 0),
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from)
);
CREATE INDEX idx_parent_rewards_parent ON parent_rewards(parent_id, active);
CREATE INDEX idx_parent_rewards_child ON parent_rewards(child_id, active);

CREATE TABLE reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES parent_rewards(id) ON DELETE RESTRICT,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status reward_redemption_status NOT NULL DEFAULT 'requested',
  points_cost_snapshot integer NOT NULL CHECK (points_cost_snapshot > 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  fulfilled_at timestamptz,
  decision_note text,
  debit_ledger_id uuid REFERENCES point_ledger(id) ON DELETE SET NULL,
  refund_ledger_id uuid REFERENCES point_ledger(id) ON DELETE SET NULL
);
CREATE INDEX idx_redemptions_child_status ON reward_redemptions(child_id, status);
CREATE INDEX idx_redemptions_reward ON reward_redemptions(reward_id);

CREATE TABLE reward_activity_counters (
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('topic','outcome','question_family')),
  scope_id uuid NOT NULL,
  window_key text NOT NULL,
  rewarded_count integer NOT NULL DEFAULT 0 CHECK (rewarded_count >= 0),
  last_rewarded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (child_id, scope_type, scope_id, window_key)
);


-- EXPERIENCE TELEMETRY -----------------------------------------------------
-- Store only low-sensitivity interaction metadata needed to understand UX friction.
CREATE TABLE experience_events (
  id bigserial PRIMARY KEY,
  parent_profile_id uuid REFERENCES parent_profiles(id) ON DELETE SET NULL,
  child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_experience_events_name_time ON experience_events(event_name, created_at DESC);
CREATE INDEX idx_experience_events_child_time ON experience_events(child_id, created_at DESC);
