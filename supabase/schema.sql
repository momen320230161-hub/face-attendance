create extension if not exists vector;

create table if not exists people (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    embedding vector(512) not null,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users(id)
);

create table if not exists attendance_log (
    id uuid primary key default gen_random_uuid(),
    person_id uuid not null references people(id) on delete cascade,
    "timestamp" timestamptz not null default now(),
    confidence real not null check (confidence >= 0 and confidence <= 1)
);

create table if not exists staff (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null default 'staff' check (role in ('admin', 'staff')),
    created_at timestamptz not null default now()
);

create index if not exists people_embedding_idx on people using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists attendance_log_timestamp_idx on attendance_log ("timestamp" desc);

create or replace function match_person(query_embedding vector(512), match_threshold float)
returns table (id uuid, name text, similarity float)
language sql stable
as $$
    select p.id, p.name, (1 - (p.embedding <=> query_embedding))::float as similarity
    from people p
    where 1 - (p.embedding <=> query_embedding) >= match_threshold
    order by p.embedding <=> query_embedding
    limit 1;
$$;

alter table people enable row level security;
alter table attendance_log enable row level security;
alter table staff enable row level security;

create policy "staff can read people" on people for select using (
    exists (select 1 from staff where user_id = auth.uid())
);
create policy "staff can insert people" on people for insert with check (
    exists (select 1 from staff where user_id = auth.uid())
);
create policy "staff can read attendance" on attendance_log for select using (
    exists (select 1 from staff where user_id = auth.uid())
);

