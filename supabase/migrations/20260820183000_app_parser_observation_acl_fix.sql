-- CUSTOMER04C2: make parser-observation ACL deterministic across migration roles.

revoke all on table public.app_parser_observation_envelopes from service_role;
grant select, insert on table public.app_parser_observation_envelopes to service_role;
