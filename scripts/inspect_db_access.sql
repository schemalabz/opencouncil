-- Full database access audit. Run as doadmin against each database:
-- psql "postgresql://doadmin:<pw>@<host>:25060/<db>?sslmode=require" -f scripts/inspect_db_access.sql

\echo '========================================'
\echo '  DATABASE ACCESS AUDIT'
\echo '========================================'
SELECT current_database() AS database, current_user AS connected_as;

\echo ''
\echo '=== 1. All roles in the cluster ==='
\echo '    (cluster-wide — same output regardless of which DB you connect to)'
SELECT rolname, rolcanlogin AS can_login, rolsuper AS superuser,
       rolcreaterole AS can_create_roles, rolcreatedb AS can_create_db
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname;

\echo ''
\echo '=== 2. Role membership (who inherits from whom) ==='
\echo '    Shows: "member" inherits all privileges of "member_of"'
\echo '    NOTE: In DO Managed PostgreSQL, doadmin is a member OF user roles'
\echo '    (so admin can manage them). This does NOT give user roles admin access.'
SELECT m.rolname AS member, r.rolname AS member_of
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE m.rolname NOT LIKE 'pg_%'
ORDER BY m.rolname, r.rolname;

\echo ''
\echo '=== 3. Database-level privileges ==='
\echo '    datacl format: grantee=privileges/grantor (C=connect, T=temp, c=create)'
SELECT datname, datacl
FROM pg_database
WHERE datname NOT LIKE 'template%' AND datname != '_dodb'
ORDER BY datname;

\echo ''
\echo '=== 4. Table ownership (this database) ==='
SELECT tableowner, count(*) AS tables_owned
FROM pg_tables
WHERE schemaname = 'public'
GROUP BY tableowner
ORDER BY tableowner;

\echo ''
\echo '=== 5. Explicit table grants (this database) ==='
\echo '    Only shows explicitly granted privileges, not inherited ones.'
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee NOT IN ('doadmin', 'PUBLIC')
  AND grantee NOT LIKE 'pg_%'
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

\echo ''
\echo '=== 6. Default privileges (ALTER DEFAULT PRIVILEGES) ==='
\echo '    Rules that auto-grant on future objects.'
SELECT pg_get_userbyid(defaclrole) AS granting_role,
       defaclnamespace::regnamespace AS schema,
       defaclobjtype AS object_type,
       defaclacl AS default_acl
FROM pg_default_acl;

\echo ''
\echo '=== 7. Schema privileges ==='
SELECT nspname AS schema,
       nspacl AS acl
FROM pg_namespace
WHERE nspname = 'public';
