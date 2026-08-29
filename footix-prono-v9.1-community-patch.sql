-- Footix Prono V9.1 — fonction publique sûre pour afficher un badge ADMIN
begin;
create or replace function public.is_profile_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.admins a where a.user_id = p_user_id);
$$;
revoke all on function public.is_profile_admin(uuid) from public;
grant execute on function public.is_profile_admin(uuid) to anon, authenticated;
commit;
