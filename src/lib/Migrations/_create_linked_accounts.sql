-- Create a table for linked investment accounts
create table linked_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  provider_item_id text unique, -- The Plaid/SnapTrade Item ID
  access_token text not null,   -- Encrypt this in production!
  institution_name text,
  status text default 'active',
  last_synced timestamp with time zone default now()
);

-- Enable RLS for security
alter table linked_accounts enable row level security;
create policy "Users can see their own linked accounts" 
on linked_accounts for select using (auth.uid() = user_id);