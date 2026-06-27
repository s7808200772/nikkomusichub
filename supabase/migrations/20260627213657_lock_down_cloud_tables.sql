-- NikkoMusicHub Cloud is a server-only service_role application.
-- Browser roles must not read MQTT credentials or mutate management data.
alter table public.stores enable row level security;
alter table public.settings enable row level security;

revoke all privileges on table public.stores from anon, authenticated;
revoke all privileges on table public.settings from anon, authenticated;

grant select, insert, update, delete on table public.stores to service_role;
grant select, insert, update, delete on table public.settings to service_role;
