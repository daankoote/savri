-- 20260518_revoke_audit_final_table_client_grants.sql
--
-- Purpose:
-- Defense-in-depth hardening for audit/final/derived analysis tables.
--
-- Context:
-- RLS already blocks anon/authenticated REST access.
-- However, broad table grants still existed for anon/authenticated on
-- final export and derived analysis tables. This migration removes that
-- unnecessary attack surface.
--
-- Boundary:
-- Service-role Edge Functions remain the write path.
-- No lifecycle, export, analysis, or retention behavior is changed.

revoke all privileges on table public.dossier_exports
from anon, authenticated;

revoke all privileges on table public.dossier_analysis_runs
from anon, authenticated;

revoke all privileges on table public.dossier_analysis_document
from anon, authenticated;

revoke all privileges on table public.dossier_analysis_charger
from anon, authenticated;

revoke all privileges on table public.dossier_analysis_summary
from anon, authenticated;

revoke all privileges on table public.dossier_document_observed_sources
from anon, authenticated;