-- Future Supabase/PostgreSQL schema. This migration is intentionally not run by the current Cloudflare build.
create extension if not exists pgcrypto;

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(), iso2 text not null unique, name_ru text not null, name_kk text not null,
  currency_code text not null default 'KZT', currency_symbol text not null default '₸', active boolean not null default true
);
create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(), country_id uuid not null references public.countries on delete restrict,
  code text not null, slug text not null, name_ru text not null, name_kk text not null, kind text not null,
  unique(country_id, code), unique(country_id, slug)
);
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(), region_id uuid not null references public.regions on delete restrict,
  parent_id uuid references public.settlements on delete set null, kato_code text, slug text not null,
  name_ru text not null, name_kk text not null, kind text not null default 'city', latitude numeric, longitude numeric,
  unique(region_id, slug)
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.categories on delete restrict,
  slug text not null unique, name_ru text not null, name_kk text not null, search_placeholder_ru text,
  search_placeholder_kk text, icon text, sort_order integer not null default 0, active boolean not null default true
);
create table if not exists public.category_attributes (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories on delete cascade,
  key text not null, label_ru text not null, label_kk text not null, field_type text not null,
  unit_ru text, unit_kk text, required boolean not null default false, filterable boolean not null default false,
  sort_order integer not null default 0, unique(category_id, key)
);
create table if not exists public.category_attribute_options (
  id uuid primary key default gen_random_uuid(), attribute_id uuid not null references public.category_attributes on delete cascade,
  value text not null, label_ru text not null, label_kk text not null, sort_order integer not null default 0,
  unique(attribute_id, value)
);
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade, display_name text, avatar_url text,
  settlement_id uuid references public.settlements on delete set null, bio text, verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles on delete cascade,
  category_id uuid not null references public.categories on delete restrict, settlement_id uuid not null references public.settlements on delete restrict,
  slug text not null unique, title text not null, description text not null, price_amount bigint,
  currency_code text not null default 'KZT', status text not null default 'draft', promoted_until timestamptz,
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists listings_catalog_idx on public.listings(status, category_id, settlement_id, published_at desc);
create index if not exists listings_owner_idx on public.listings(owner_id, created_at desc);
create table if not exists public.listing_attribute_values (
  listing_id uuid not null references public.listings on delete cascade,
  attribute_id uuid not null references public.category_attributes on delete cascade,
  value_json jsonb not null, primary key(listing_id, attribute_id)
);
create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings on delete cascade,
  storage_key text not null, sort_order integer not null default 0, width integer, height integer, created_at timestamptz not null default now()
);
create table if not exists public.favorites (
  user_id uuid not null references public.profiles on delete cascade, listing_id uuid not null references public.listings on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id, listing_id)
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), listing_id uuid references public.listings on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations on delete cascade, user_id uuid not null references public.profiles on delete cascade,
  last_read_at timestamptz, primary key(conversation_id, user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade, body text not null,
  created_at timestamptz not null default now(), edited_at timestamptz
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
  kind text not null, title text not null, body text not null, href text, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles on delete cascade,
  listing_id uuid references public.listings on delete cascade, reason text not null, details text,
  status text not null default 'open', created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles on delete cascade, role text not null, primary key(user_id, role)
);
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.listings on delete cascade,
  moderator_id uuid not null references public.profiles on delete restrict, action text not null, reason text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_attribute_values enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.user_roles enable row level security;
alter table public.moderation_actions enable row level security;

create policy "published listings are public" on public.listings for select using (status = 'published' or owner_id = auth.uid());
create policy "owners manage listings" on public.listings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "users manage own favorites" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members read conversations" on public.conversations for select using (exists (select 1 from public.conversation_members m where m.conversation_id = id and m.user_id = auth.uid()));
create policy "members read messages" on public.messages for select using (exists (select 1 from public.conversation_members m where m.conversation_id = conversation_id and m.user_id = auth.uid()));
create policy "members send messages" on public.messages for insert with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members m where m.conversation_id = conversation_id and m.user_id = auth.uid()));
create policy "users read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "users create reports" on public.reports for insert with check (reporter_id = auth.uid());
