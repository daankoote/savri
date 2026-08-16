# TENANT_ENVAL migration archive

Status: historical source only; never executable as an active migration root.

`present-app-pre-baseline/` preserves the exact 29 migrations whose material
effects were flattened into
`supabase/migrations/20260816150000_app_current_baseline.sql`.
Historical row transformations are preserved here for provenance but are not
replayed by the empty-database baseline.

`absent-legacy/` preserves the exact 10 legacy migrations whose objects are
absent from CURRENT TENANT_ENVAL. They are not represented in the app baseline
and must never be registered as applied merely to advance migration tooling.

`replaced-connection/` preserves two formerly ignored sources:

- `20260720120000_app_ean_connection_domain_foundation.sql`, SHA-256
  `83f278d70c239e890d5892102118c20425e167a6a99b4406588521bb6398cbd4`:
  three connection tables, constraints/indexes, eight guards, nine triggers,
  RLS, policies and ACL. The baseline contains their flattened final catalog.
- `20260720143000_app_connection_write_rpcs.sql`, SHA-256
  `11131138f43fd0560189609160b824175549d1b9019c7781c4180dba1210b371`:
  five service-only connection audit/write RPCs and ACL. The baseline contains
  their flattened final catalog.

These two sources are not independently replayed because the baseline creates
their CURRENT material state directly. Exact cohort paths, hashes and reasons
are machine-checked in `scripts/tools/enval-migration-chain-manifest.mjs`.
