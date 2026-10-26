-- Migration 1: owner allowlist (database layer) + sign-up blocking hook.
--
-- Run it in the Supabase dashboard -> SQL Editor (or with `npx supabase db push`).
-- Afterwards, add your email (NOT stored in git, so this repo can be public):
--   insert into public.app_owner (email) values ('you@gmail.com');


-- 1. Who the owner is ---------------------------------------------------------
-- `id boolean ... check (id)` is a simple trick: the only allowed id is `true`,
-- so this table can never hold more than one row.
create table public.app_owner (
    id    boolean primary key default true check (id),
    email text not null
);

alter table public.app_owner enable row level security;
-- No policies on purpose: nobody can read or change this table through the API.
-- Only the dashboard / migrations (which bypass RLS) can edit it.


-- 2. is_owner(): the one check every RLS policy will use ---------------------
-- Returns true when the logged-in user's email (from their login token) is the owner's.
-- `security definer` lets it read app_owner even though app_owner has no policies.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.app_owner
        where lower(email) = lower(auth.jwt() ->> 'email')
    );
$$;

-- Every future table follows this pattern, in the same migration that creates it:
--   alter table public.<table> enable row level security;
--   create policy "owner only" on public.<table>
--       for all to authenticated using (public.is_owner()) with check (public.is_owner());


-- 3. Block sign-ups from anyone except the owner ------------------------------
-- Supabase calls this before creating a new user. Returning an "error" stops it.
-- Turn it on in: Authentication -> Hooks -> "Before User Created" -> this function.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_email text := lower(event -> 'user' ->> 'email');
begin
    if exists (select 1 from public.app_owner where lower(email) = new_email) then
        return '{}'::jsonb;  -- allowed
    end if;

    return jsonb_build_object(
        'error', jsonb_build_object(
            'http_code', 403,
            'message', 'Access denied: this app has a single owner.'
        )
    );
end;
$$;

-- Only Supabase's auth service may call the hook; normal users may not.
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
