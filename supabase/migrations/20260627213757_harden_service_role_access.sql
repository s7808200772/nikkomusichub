-- Explicit service-role policies document the server-only access model.
create policy "service role manages stores"
on public.stores
for all
to service_role
using (true)
with check (true);

create policy "service role manages settings"
on public.settings
for all
to service_role
using (true)
with check (true);

-- This project-level event-trigger helper must never be callable through RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to postgres;
