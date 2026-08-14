-- Custom SQL migration file, put your code below! --

-- Trigger-based audit logging for security-relevant tables. Closes the gap
-- named in docs/THREAT_MODEL.md and apps/app/src/lib/*'s own doc comments:
-- audit_log existed in the schema (packages/db/src/schema.ts) but nothing
-- ever wrote to it. An application-layer call site (a track()-style
-- function) was considered and rejected here on purpose: that's exactly
-- the shape of mechanism that already produced the gap — a call a future
-- route can simply forget to make. A trigger fires regardless of which
-- code path performed the write, including writes Better Auth itself makes
-- directly through the same underlying connection (session, account,
-- two_factor) that no app code in this repo ever touches directly.
--
-- Deliberately NOT using a session variable (e.g. current_setting) to
-- attribute these entries — every table below already carries user_id (or
-- account.user_id) on the row itself, so each trigger reads NEW.user_id
-- directly. That's simpler and strictly more reliable than plumbing a
-- SET LOCAL through every mutating code path (including Better Auth's own
-- internal queries, which this codebase doesn't control) — see
-- docs/ARCHITECTURE_UPLIFT_PLAN.md §3.3/§5.1 for why session-variable
-- attribution is still the right tool for Row-Level Security policies
-- specifically (§5.1), just not needed here.
--
-- Known limitation, stated plainly rather than left implicit: audit_log's
-- `ip` and `user_agent` columns stay NULL for every row these triggers
-- write. A database trigger has no access to the HTTP request that caused
-- it — only the application layer does. If IP/user-agent attribution is
-- ever needed for these specific actions, it has to be captured at the
-- route layer instead (the network layer request already flows through
-- apps/app/src/lib/rateLimit.ts's clientIpFrom, which is the ready-made
-- source for it). session.ip_address / session.user_agent are already
-- captured on the session row itself by Better Auth, which is why "login"
-- doesn't lose that information — a JOIN against session.id (stored in
-- this trigger's own metadata) recovers it when needed.

CREATE OR REPLACE FUNCTION audit_session_login() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (NEW.user_id, 'login', jsonb_build_object('session_id', NEW.id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_session_login_trigger
  AFTER INSERT ON session
  FOR EACH ROW
  EXECUTE FUNCTION audit_session_login();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_account_password_change() RETURNS trigger AS $$
BEGIN
  IF OLD.password IS DISTINCT FROM NEW.password AND NEW.password IS NOT NULL THEN
    INSERT INTO audit_log (user_id, action, metadata)
    VALUES (NEW.user_id, 'password_change', jsonb_build_object('account_id', NEW.id, 'provider_id', NEW.provider_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_account_password_change_trigger
  AFTER UPDATE ON account
  FOR EACH ROW
  WHEN (OLD.password IS DISTINCT FROM NEW.password)
  EXECUTE FUNCTION audit_account_password_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_two_factor_enrolled() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (NEW.user_id, 'two_factor_enrolled', jsonb_build_object('two_factor_id', NEW.id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_two_factor_enrolled_trigger
  AFTER INSERT ON two_factor
  FOR EACH ROW
  EXECUTE FUNCTION audit_two_factor_enrolled();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_two_factor_verified() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (NEW.user_id, 'two_factor_verified', jsonb_build_object('two_factor_id', NEW.id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_two_factor_verified_trigger
  AFTER UPDATE ON two_factor
  FOR EACH ROW
  WHEN (OLD.verified IS DISTINCT FROM NEW.verified AND NEW.verified = true)
  EXECUTE FUNCTION audit_two_factor_verified();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_user_keys_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (NEW.user_id, 'vault_bootstrapped', jsonb_build_object('key_version', NEW.key_version));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_user_keys_created_trigger
  AFTER INSERT ON user_keys
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_keys_created();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_user_keys_rotated() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (
    NEW.user_id,
    'key_rotation',
    jsonb_build_object('from_version', OLD.key_version, 'to_version', NEW.key_version)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_user_keys_rotated_trigger
  AFTER UPDATE ON user_keys
  FOR EACH ROW
  WHEN (OLD.key_version IS DISTINCT FROM NEW.key_version)
  EXECUTE FUNCTION audit_user_keys_rotated();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_application_state_changed() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, metadata)
  VALUES (
    NEW.user_id,
    'application_state_changed',
    jsonb_build_object('application_id', NEW.id, 'from_state', OLD.state, 'to_state', NEW.state)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_application_state_changed_trigger
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION audit_application_state_changed();
