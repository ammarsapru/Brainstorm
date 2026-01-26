
-- 1. SECURITY: Drop potentially permissive methods
drop policy if exists "Enable access to all users" on public.sessions;
drop policy if exists "Users can all own sessions" on public.sessions;
drop policy if exists "Users can manage own sessions" on public.sessions;

-- 2. ENSURE RLS IS ON
alter table public.sessions enable row level security;

-- 3. CREATE STRICT POLICY
-- Only return rows where the user_id column matches the logged-in user's ID
create policy "Users can manage own sessions" on public.sessions 
for all 
using (
  auth.uid() = user_id
);

-- 4. VERIFY CARDS RLS (Optional but recommended)
drop policy if exists "Users can manage session cards" on public.cards;
create policy "Users can manage session cards" on public.cards 
for all 
using (
   exists (select 1 from public.sessions where id = cards.session_id and user_id = auth.uid())
);
