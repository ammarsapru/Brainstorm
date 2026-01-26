
-- 7. COLLECTIONS (New Table Fix)
create table if not exists public.collections (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.collections enable row level security;

-- Add Policy
create policy "Users can manage session collections" on public.collections for all using (
  exists (select 1 from public.sessions where id = collections.session_id and user_id = auth.uid())
);
