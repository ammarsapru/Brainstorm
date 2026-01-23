
-- 1. PROFILES (Syncs with Auth)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. SESSIONS
create table public.sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  name text not null default 'Untitled Session',
  thumbnail text,
  viewport_x double precision default 0,
  viewport_y double precision default 0,
  viewport_zoom double precision default 1,
  last_modified bigint not null default extract(epoch from now()) * 1000,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. CARDS
create table public.cards (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  x double precision not null,
  y double precision not null,
  text text default '',
  content jsonb, -- For rich text / arbitrary content
  width double precision not null,
  height double precision not null,
  color text default '#ffffff',
  style jsonb default '{}'::jsonb,
  image text,
  file_name text,
  "collectionId" text -- Note: quoted to preserve case if needed, or use collection_id implies mapping change
);

-- 4. CONNECTIONS
create table public.connections (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  from_id text references public.cards(id) on delete cascade not null,
  to_id text references public.cards(id) on delete cascade not null,
  style text default 'solid',
  relation_type text default 'equivalence'
);

-- 5. FILE SYSTEM NODES (Previously 'files')
create table public.file_system_nodes (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  parent_id text, -- Self reference not strictly enforced due to flattening or optional
  type text not null check (type in ('file', 'folder')),
  name text not null,
  content text,
  media_type text,
  created_at bigint not null,
  is_open boolean default false
);

-- 6. CHAT HISTORY
create table public.chat_messages (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'model')),
  text text,
  timestamp bigint not null,
  model text,
  attachments jsonb
);

-- RLS POLICIES

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table cards enable row level security;
alter table connections enable row level security;
alter table file_system_nodes enable row level security;
alter table chat_messages enable row level security;

-- Profiles
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Sessions
create policy "Users can all own sessions" on sessions for all using (auth.uid() = user_id);

-- Cards
create policy "Users can manage session cards" on cards for all using (
  exists (select 1 from sessions where id = cards.session_id and user_id = auth.uid())
);

-- Connections
create policy "Users can manage session connections" on connections for all using (
  exists (select 1 from sessions where id = connections.session_id and user_id = auth.uid())
);

-- File System Nodes
create policy "Users can manage session files" on file_system_nodes for all using (
  exists (select 1 from sessions where id = file_system_nodes.session_id and user_id = auth.uid())
);

-- Chat
create policy "Users can manage session chat" on chat_messages for all using (
  exists (select 1 from sessions where id = chat_messages.session_id and user_id = auth.uid())
);
