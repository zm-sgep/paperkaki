-- Approved and retired question versions are historical records (ADR-0004).
-- A paper references an exact question version, so once a version is approved nothing about
-- what a child sees or how it is marked may change: corrections are a NEW version.
--
--   questions:         UPDATE of an approved version may only move status approved -> retired;
--                      a retired version never changes; approved and retired rows are never deleted.
--                      Moving to approved needs exactly one primary outcome (M2-01).
--                      A version must belong to the same curriculum version as its family.
--   question_outcomes: no INSERT, UPDATE or DELETE once the question is approved or retired.
--                      The outcome must belong to the question's curriculum version.
--   question_assets:   same lock as the outcome mappings.
--   question_reviews:  append-only (the audit trail).
-- Written by hand: drizzle-kit does not model triggers. Statements are split by the breakpoint marker.
-- The whole-row comparison uses to_jsonb(...), so a column added later is protected automatically.

CREATE FUNCTION question_is_locked(target_question_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM questions
    WHERE id = target_question_id AND status IN ('approved', 'retired')
  )
$$;--> statement-breakpoint

CREATE FUNCTION questions_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  family_version uuid;
  primaries integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'retired') THEN
      RAISE EXCEPTION 'question % is % and cannot be deleted; retire it or create a new version (ADR-0004)', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT curriculum_version_id INTO family_version FROM question_families WHERE id = NEW.family_id;
    IF family_version IS DISTINCT FROM NEW.curriculum_version_id THEN
      RAISE EXCEPTION 'question belongs to curriculum version %, but its family belongs to %', NEW.curriculum_version_id, family_version
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IN ('approved', 'retired') THEN
      RAISE EXCEPTION 'a question version must be created as a draft'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION 'question % is retired and cannot be changed; create a new version (ADR-0004)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status NOT IN ('approved', 'retired')
       OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
    THEN
      RAISE EXCEPTION 'question % is approved; only moving it to retired is allowed, a correction is a new version (ADR-0004)', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    SELECT count(*) INTO primaries FROM question_outcomes WHERE question_id = NEW.id AND role = 'primary';
    IF primaries <> 1 THEN
      RAISE EXCEPTION 'question % cannot be approved: it needs exactly one primary outcome (found %)', NEW.id, primaries
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF NEW.family_id <> OLD.family_id OR NEW.version <> OLD.version OR NEW.curriculum_version_id <> OLD.curriculum_version_id THEN
    RAISE EXCEPTION 'question % cannot move to another family, version number or curriculum version', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER questions_guard_row
  BEFORE INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_guard_row();--> statement-breakpoint

CREATE FUNCTION question_outcomes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  question_version uuid;
  outcome_version uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND question_is_locked(OLD.question_id) THEN
    RAISE EXCEPTION 'question % is approved or retired; % on question_outcomes is not allowed (ADR-0004)', OLD.question_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF question_is_locked(NEW.question_id) THEN
      RAISE EXCEPTION 'question % is approved or retired; % on question_outcomes is not allowed (ADR-0004)', NEW.question_id, TG_OP
        USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT curriculum_version_id INTO question_version FROM questions WHERE id = NEW.question_id;
    SELECT curriculum_version_id INTO outcome_version FROM curriculum_outcomes WHERE id = NEW.outcome_id;
    IF question_version IS DISTINCT FROM outcome_version THEN
      RAISE EXCEPTION 'outcome % is not part of the question''s curriculum version', NEW.outcome_id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER question_outcomes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON question_outcomes
  FOR EACH ROW EXECUTE FUNCTION question_outcomes_guard();--> statement-breakpoint

CREATE FUNCTION question_assets_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND question_is_locked(OLD.question_id) THEN
    RAISE EXCEPTION 'question % is approved or retired; % on question_assets is not allowed (ADR-0004)', OLD.question_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND question_is_locked(NEW.question_id) THEN
    RAISE EXCEPTION 'question % is approved or retired; % on question_assets is not allowed (ADR-0004)', NEW.question_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER question_assets_guard
  BEFORE INSERT OR UPDATE OR DELETE ON question_assets
  FOR EACH ROW EXECUTE FUNCTION question_assets_guard();--> statement-breakpoint

CREATE FUNCTION question_reviews_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'question_reviews is an append-only audit trail; % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint

CREATE TRIGGER question_reviews_append_only
  BEFORE UPDATE OR DELETE ON question_reviews
  FOR EACH ROW EXECUTE FUNCTION question_reviews_append_only();
