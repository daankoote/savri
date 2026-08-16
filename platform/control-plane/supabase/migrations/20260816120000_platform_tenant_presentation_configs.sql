create table platform.tenant_presentation_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  environment text not null,
  version_sequence bigint not null,
  schema_version text not null,
  config_version text not null,
  display_name text not null,
  short_mark text not null,
  product_label text not null,
  tagline text null,
  logo_ref text not null,
  logo_inverse_ref text null,
  favicon_ref text null,
  social_image_ref text null,
  asset_alt_text text not null,
  export_basename text null,
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  created_from_request_id text not null,
  constraint platform_presentation_environment_chk check (
    environment = lower(environment)
    and environment = btrim(environment)
    and environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint platform_presentation_version_sequence_chk check (
    version_sequence > 0
  ),
  constraint platform_presentation_schema_version_chk check (
    schema_version = 'presentation-brand-config-v1'
  ),
  constraint platform_presentation_config_version_chk check (
    config_version = btrim(config_version)
    and config_version ~ '^[a-z][a-z0-9._-]{2,63}$'
  ),
  constraint platform_presentation_display_name_chk check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 80
  ),
  constraint platform_presentation_short_mark_chk check (
    short_mark = btrim(short_mark)
    and char_length(short_mark) between 1 and 8
  ),
  constraint platform_presentation_product_label_chk check (
    product_label = btrim(product_label)
    and char_length(product_label) between 1 and 80
  ),
  constraint platform_presentation_tagline_chk check (
    tagline is null or (
      tagline = btrim(tagline)
      and char_length(tagline) between 1 and 160
    )
  ),
  constraint platform_presentation_logo_ref_chk check (
    logo_ref ~ '^/assets/[a-z0-9][a-z0-9/_-]{0,200}\.(svg|png|jpg|jpeg|webp|ico)$'
    and logo_ref !~ '//|\.\.|\\|%|\?|#'
  ),
  constraint platform_presentation_logo_inverse_ref_chk check (
    logo_inverse_ref is null or (
      logo_inverse_ref ~ '^/assets/[a-z0-9][a-z0-9/_-]{0,200}\.(svg|png|jpg|jpeg|webp|ico)$'
      and logo_inverse_ref !~ '//|\.\.|\\|%|\?|#'
    )
  ),
  constraint platform_presentation_favicon_ref_chk check (
    favicon_ref is null or (
      favicon_ref ~ '^/assets/[a-z0-9][a-z0-9/_-]{0,200}\.(svg|png|jpg|jpeg|webp|ico)$'
      and favicon_ref !~ '//|\.\.|\\|%|\?|#'
    )
  ),
  constraint platform_presentation_social_image_ref_chk check (
    social_image_ref is null or (
      social_image_ref ~ '^/assets/[a-z0-9][a-z0-9/_-]{0,200}\.(svg|png|jpg|jpeg|webp|ico)$'
      and social_image_ref !~ '//|\.\.|\\|%|\?|#'
    )
  ),
  constraint platform_presentation_asset_alt_text_chk check (
    asset_alt_text = btrim(asset_alt_text)
    and char_length(asset_alt_text) between 1 and 120
  ),
  constraint platform_presentation_export_basename_chk check (
    export_basename is null or (
      export_basename = btrim(export_basename)
      and char_length(export_basename) between 1 and 80
      and export_basename ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
  ),
  constraint platform_presentation_created_actor_chk check (
    created_by_actor_ref = btrim(created_by_actor_ref)
    and char_length(created_by_actor_ref) between 1 and 200
  ),
  constraint platform_presentation_created_request_chk check (
    created_from_request_id = btrim(created_from_request_id)
    and char_length(created_from_request_id) between 1 and 200
  ),
  constraint platform_presentation_tenant_environment_sequence_unique unique (
    tenant_id,
    environment,
    version_sequence
  ),
  constraint platform_presentation_tenant_environment_config_unique unique (
    tenant_id,
    environment,
    config_version
  )
);

create index platform_tenant_presentation_current_idx
  on platform.tenant_presentation_configs (
    tenant_id,
    environment,
    version_sequence desc
  );

create view platform.current_tenant_presentation_configs
with (security_invoker = true)
as
select
  current_config.tenant_id,
  current_config.environment,
  current_config.version_sequence,
  current_config.schema_version,
  current_config.config_version,
  current_config.display_name,
  current_config.short_mark,
  current_config.product_label,
  current_config.tagline,
  current_config.logo_ref,
  current_config.logo_inverse_ref,
  current_config.favicon_ref,
  current_config.social_image_ref,
  current_config.asset_alt_text,
  current_config.export_basename
from platform.tenant_presentation_configs current_config
where not exists (
  select 1
  from platform.tenant_presentation_configs newer_config
  where newer_config.tenant_id = current_config.tenant_id
    and newer_config.environment = current_config.environment
    and newer_config.version_sequence > current_config.version_sequence
);

create or replace function platform.reject_tenant_presentation_config_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'platform_tenant_presentation_config_is_append_only';
end;
$$;

create trigger platform_tenant_presentation_config_reject_update_delete
before update or delete on platform.tenant_presentation_configs
for each row execute function platform.reject_tenant_presentation_config_mutation();

create trigger platform_tenant_presentation_config_reject_truncate
before truncate on platform.tenant_presentation_configs
for each statement execute function platform.reject_tenant_presentation_config_mutation();

alter table platform.tenant_presentation_configs enable row level security;
alter table platform.tenant_presentation_configs force row level security;

revoke all on platform.tenant_presentation_configs from public;
revoke all on platform.tenant_presentation_configs from anon;
revoke all on platform.tenant_presentation_configs from authenticated;
revoke all on platform.tenant_presentation_configs from service_role;
revoke all on platform.current_tenant_presentation_configs from public;
revoke all on platform.current_tenant_presentation_configs from anon;
revoke all on platform.current_tenant_presentation_configs from authenticated;
revoke all on platform.current_tenant_presentation_configs from service_role;
revoke all on function platform.reject_tenant_presentation_config_mutation()
  from public;
revoke all on function platform.reject_tenant_presentation_config_mutation()
  from anon;
revoke all on function platform.reject_tenant_presentation_config_mutation()
  from authenticated;
revoke all on function platform.reject_tenant_presentation_config_mutation()
  from service_role;

grant select on platform.tenant_presentation_configs to service_role;
grant select on platform.current_tenant_presentation_configs to service_role;
