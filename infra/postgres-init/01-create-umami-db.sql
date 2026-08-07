-- Runs once, on first container init (postgres only executes
-- docker-entrypoint-initdb.d/ scripts against an EMPTY data directory).
-- The main "porphyra" app database already exists via POSTGRES_DB; Umami
-- needs its own separate database so its schema never touches app tables.
CREATE DATABASE umami;
