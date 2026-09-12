alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_capability_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish',
      'evidence.review.correction.supersede',
      'customer.information_request.manage'
    )
  );

alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_shape_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide',
        'evidence.review.correction.publish',
        'evidence.review.correction.supersede',
        'customer.information_request.manage'
      )
      and location_id is null
      and case_location_relation_id is null
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and location_id is not null
      and case_location_relation_id is not null
    )
  );

create or replace function public.app_customer_information_request_authorize_v1(
  p_auth_user_id uuid,
  p_case_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.app_workforce_authorize_v1(
    p_auth_user_id,
    'customer.information_request.manage',
    p_case_id,
    null,
    p_at
  );
end;
$$;

comment on function public.app_customer_information_request_authorize_v1(
  uuid, uuid, timestamptz
) is
  'Internal authority predicate requiring the exact active customer.information_request.manage capability and case-scope assignment.';
