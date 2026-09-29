-- A generated paper is a historical record (ADR-0004): what a child was given must never change.
--
--   papers:           never deleted. The only UPDATE allowed moves status generated -> retired;
--                     nothing else about a paper (questions, seed, files, blueprint) may change.
--   paper_questions:  never updated or deleted. A row may be inserted only in the transaction that
--                     created its paper, so the question list is complete when the paper commits and
--                     frozen from then on. Only an approved question may be added.
-- Written by hand: drizzle-kit does not model triggers. Statements are split by the breakpoint marker.
-- The whole-row comparison uses to_jsonb(...), so a column added later is protected automatically.

CREATE FUNCTION papers_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'paper % cannot be deleted; papers are historical records (ADR-0004)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'paper % is frozen; only its status may change (ADR-0004)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'generated' AND NEW.status = 'retired') THEN
    RAISE EXCEPTION 'paper % can only move from generated to retired', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER papers_guard_row
  BEFORE UPDATE OR DELETE ON papers
  FOR EACH ROW EXECUTE FUNCTION papers_guard_row();--> statement-breakpoint

CREATE FUNCTION paper_questions_guard_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  paper_created_here boolean;
  question_status text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'the question list of paper % is frozen; % on paper_questions is not allowed (ADR-0004)', OLD.paper_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- INSERT: only while the paper row belongs to this very transaction.
  SELECT p.xmin = pg_current_xact_id()::xid INTO paper_created_here FROM papers p WHERE p.id = NEW.paper_id;
  IF paper_created_here IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'paper % is already generated; its questions can no longer be changed (ADR-0004)', NEW.paper_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT status::text INTO question_status FROM questions WHERE id = NEW.question_id;
  IF question_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'question % is not approved and cannot be put on a paper', NEW.question_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER paper_questions_guard_row
  BEFORE INSERT OR UPDATE OR DELETE ON paper_questions
  FOR EACH ROW EXECUTE FUNCTION paper_questions_guard_row();
