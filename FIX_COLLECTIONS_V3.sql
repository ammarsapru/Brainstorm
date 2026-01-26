
-- 1. Drop ALL potential conflicting policies on 'collections'
drop policy if exists "Users can manage session collections" on public.collections;
drop policy if exists "Users can manage collections in their sessions" on public.collections; 

-- 2. Clean up 'sessions' policies if duplicates exist (based on your screenshot)
drop policy if exists "Users can manage own sessions" on public.sessions;
drop policy if exists "Users can manage their own sessions" on public.sessions;
-- Re-create the canonical one for sessions
create policy "Users can manage own sessions" on public.sessions for all using (
  auth.uid() = user_id
);


-- 3. Re-apply the correct Policy for collections
alter table public.collections enable row level security;

create policy "Users can manage session collections" on public.collections 
for all 
using (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
);
