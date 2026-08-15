BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() = 'postgres'
  AND current_setting('transaction_read_only') = 'on'
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname = 'public'
  ) AS enval_local_catalog_ready,
  'ENVAL_LOCAL_READONLY_CATALOG_OK' AS enval_verify_marker;

ROLLBACK;
