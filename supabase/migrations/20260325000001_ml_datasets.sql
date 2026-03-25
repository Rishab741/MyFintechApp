create table if not exists public.ml_datasets (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    generated_at timestamptz default now(),
    total_snapshots int,
    feature_rows jsonb not null default '[]',
    position_rows jsonb not null default '[]',
    summary jsonb not null default '{}'
);
create index ml_datasets_user_gen on public.ml_datasets(user_id, generated_at desc);
alter table public.ml_datasets enable row level security;
create policy "Users manage own ml_datasets" on public.ml_datasets for all using (auth.uid() = user_id);
