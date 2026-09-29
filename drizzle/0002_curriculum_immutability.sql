-- Published curriculum is a historical record (ADR-0003).
-- Rejects INSERT, UPDATE and DELETE on the contents of a version whose status is `published`
-- (or `retired`, which used to be published), and limits changes to the version row itself.
-- The only edit a published version allows is moving it to `retired`.
-- Written by hand: drizzle-kit does not model triggers. Statements are split by the breakpoint marker.

CREATE FUNCTION curriculum_version_is_locked(version_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM curriculum_versions
    WHERE id = version_id AND status IN ('published', 'retired')
  )
$$;--> statement-breakpoint

CREATE FUNCTION curriculum_outcome_is_locked(target_outcome_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM curriculum_outcomes o
    JOIN curriculum_versions v ON v.id = o.curriculum_version_id
    WHERE o.id = target_outcome_id AND v.status IN ('published', 'retired')
  )
$$;--> statement-breakpoint

-- domains, topics, outcomes: each row carries curriculum_version_id.
CREATE FUNCTION curriculum_guard_locked_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND curriculum_version_is_locked(OLD.curriculum_version_id) THEN
    RAISE EXCEPTION 'curriculum version % is published; % on % is not allowed (ADR-0003)',
      OLD.curriculum_version_id, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND curriculum_version_is_locked(NEW.curriculum_version_id) THEN
    RAISE EXCEPTION 'curriculum version % is published; % on % is not allowed (ADR-0003)',
      NEW.curriculum_version_id, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER curriculum_domains_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON curriculum_domains
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_locked_content();--> statement-breakpoint

CREATE TRIGGER curriculum_topics_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON curriculum_topics
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_locked_content();--> statement-breakpoint

CREATE TRIGGER curriculum_outcomes_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON curriculum_outcomes
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_locked_content();--> statement-breakpoint

-- outcome sources: the version is reached through the outcome.
CREATE FUNCTION curriculum_guard_locked_outcome_links() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND curriculum_outcome_is_locked(OLD.outcome_id) THEN
    RAISE EXCEPTION 'outcome % belongs to a published curriculum version; % on curriculum_outcome_sources is not allowed (ADR-0003)',
      OLD.outcome_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND curriculum_outcome_is_locked(NEW.outcome_id) THEN
    RAISE EXCEPTION 'outcome % belongs to a published curriculum version; % on curriculum_outcome_sources is not allowed (ADR-0003)',
      NEW.outcome_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER curriculum_outcome_sources_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON curriculum_outcome_sources
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_locked_outcome_links();--> statement-breakpoint

-- outcome relationships: same rule, through the "from" outcome.
CREATE FUNCTION curriculum_guard_locked_relationships() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND curriculum_outcome_is_locked(OLD.from_outcome_id) THEN
    RAISE EXCEPTION 'outcome % belongs to a published curriculum version; % on outcome_relationships is not allowed (ADR-0003)',
      OLD.from_outcome_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND curriculum_outcome_is_locked(NEW.from_outcome_id) THEN
    RAISE EXCEPTION 'outcome % belongs to a published curriculum version; % on outcome_relationships is not allowed (ADR-0003)',
      NEW.from_outcome_id, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER outcome_relationships_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON outcome_relationships
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_locked_relationships();--> statement-breakpoint

-- The version row itself.
--   published -> retired is the only change a published version accepts.
--   retired versions never change; published and retired versions are never deleted.
--   draft -> published is refused while any outcome has no source link (defence in depth: the
--   publish command checks the same rule first and explains it).
CREATE FUNCTION curriculum_guard_version_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unsourced integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'retired') THEN
      RAISE EXCEPTION 'curriculum version % is % and cannot be deleted (ADR-0003)', OLD.id, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION 'curriculum version % is retired and cannot be changed (ADR-0003)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status <> 'retired'
       OR ROW(NEW.code, NEW.subject_id, NEW.title, NEW.levels, NEW.effective_from, NEW.published_at, NEW.published_by, NEW.created_at)
          IS DISTINCT FROM
          ROW(OLD.code, OLD.subject_id, OLD.title, OLD.levels, OLD.effective_from, OLD.published_at, OLD.published_by, OLD.created_at)
    THEN
      RAISE EXCEPTION 'curriculum version % is published; only moving it to retired is allowed (ADR-0003)', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    SELECT count(*) INTO unsourced
    FROM curriculum_outcomes o
    WHERE o.curriculum_version_id = OLD.id
      AND NOT EXISTS (SELECT 1 FROM curriculum_outcome_sources s WHERE s.outcome_id = o.id);
    IF unsourced > 0 THEN
      RAISE EXCEPTION 'curriculum version % cannot be published: % outcome(s) have no source link', OLD.id, unsourced
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

CREATE TRIGGER curriculum_versions_guard_row
  BEFORE UPDATE OR DELETE ON curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION curriculum_guard_version_row();
