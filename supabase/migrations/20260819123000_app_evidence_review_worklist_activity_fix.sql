begin;

-- REVIEW17 correction: GREATEST is SQL conditional syntax, not a callable
-- pg_catalog function. Guard the exact prior definition before replacing only
-- the two invalid qualifications; all worklist semantics and ACL stay intact.

do $migration$
declare
  v_definition text;
  v_occurrences integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.app_evidence_review_worklist_source_read_v2(uuid)'::regprocedure
  ) into v_definition;

  v_occurrences := (
    pg_catalog.char_length(v_definition) -
    pg_catalog.char_length(pg_catalog.replace(
      v_definition, 'pg_catalog.greatest', ''
    ))
  ) / pg_catalog.char_length('pg_catalog.greatest');

  if v_occurrences <> 3 then
    raise exception 'unexpected worklist v2 GREATEST definition';
  end if;

  execute pg_catalog.replace(
    v_definition, 'pg_catalog.greatest', 'greatest'
  );
end;
$migration$;

comment on function public.app_evidence_review_worklist_source_read_v2(uuid) is
  'Service-role-only fact-manifest worklist read. It authorizes evidence.review.view per exact active case scope, derives ACTIVE_REVIEW, WAITING_CUSTOMER, REVIEW_COMPLETE or explicit REVIEW_MODEL_UNAVAILABLE from the current fact manifest and its exact immutable round, and writes no state.';

commit;
