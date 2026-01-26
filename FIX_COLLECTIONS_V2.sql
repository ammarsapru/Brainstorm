
-- Force cleanup of potential bad state
drop policy if exists "Users can manage session collections" on public.collections;

-- Ensure table exists (idempotent)
create table if not exists public.collections (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Ensure RLS is on
alter table public.collections enable row level security;

-- Re-create Policy with explicit permissions for everything
create policy "Users can manage session collections" on public.collections 
for all 
using (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
);
