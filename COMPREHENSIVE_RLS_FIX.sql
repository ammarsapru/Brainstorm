
-- NUCLEAR OPTION: Reset and Fix RLS for the ENTIRE Database

-- 1. SESSIONS
alter table public.sessions enable row level security;
drop policy if exists "Users can manage own sessions" on public.sessions;
drop policy if exists "Enable access to all users" on public.sessions;
drop policy if exists "Users can all own sessions" on public.sessions;

create policy "Users can manage own sessions" on public.sessions 
for all 
using ( auth.uid() = user_id );

-- 2. COLLECTIONS
alter table public.collections enable row level security;
drop policy if exists "Users can manage session collections" on public.collections;
drop policy if exists "Users can manage collections in their sessions" on public.collections;

create policy "Users can manage session collections" on public.collections 
for all 
using (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
);

-- 3. CARDS
alter table public.cards enable row level security;
drop policy if exists "Users can manage session cards" on public.cards;
drop policy if exists "Users can manage cards in their sessions" on public.cards;

create policy "Users can manage session cards" on public.cards 
for all 
using (
  exists (select 1 from public.sessions where id = cards.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = cards.session_id and user_id = auth.uid())
);

-- 4. CONNECTIONS
alter table public.connections enable row level security;
drop policy if exists "Users can manage session connections" on public.connections;
drop policy if exists "Users can manage connections in their sessions" on public.connections;

create policy "Users can manage session connections" on public.connections 
for all 
using (
  exists (select 1 from public.sessions where id = connections.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = connections.session_id and user_id = auth.uid())
);

-- 5. FILES
alter table public.file_system_nodes enable row level security;
drop policy if exists "Users can manage session files" on public.file_system_nodes;

create policy "Users can manage session files" on public.file_system_nodes 
for all 
using (
  exists (select 1 from public.sessions where id = file_system_nodes.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = file_system_nodes.session_id and user_id = auth.uid())
);

-- 6. CHAT
alter table public.chat_messages enable row level security;
drop policy if exists "Users can manage session chat" on public.chat_messages;

create policy "Users can manage session chat" on public.chat_messages 
for all 
using (
  exists (select 1 from public.sessions where id = chat_messages.session_id and user_id = auth.uid())
)
with check (
  exists (select 1 from public.sessions where id = chat_messages.session_id and user_id = auth.uid())
);
