-- Database dumps do not carry cluster roles. Seed restores also omit grants.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notis_reader') THEN
    CREATE ROLE notis_reader NOLOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'notis_reader'::regrole) THEN
    RAISE EXCEPTION 'notis_reader inherits from another role; view containment is not enforced';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO notis_reader;
GRANT SELECT ON notis_users, notis_fanout_targets, notis_meeting_events,
  notis_sessions, notis_admin_sessions TO notis_reader;

COMMIT;
