-- Marketo v1.0 targeted correction: contextual catalog metadata and a payment-neutral Premium foundation.

begin;

-- Every category receives RU/KK helper text tied to its own name and vertical.
-- This is intentionally a forward-only correction over the immutable 0017 seed.
create or replace function private.apply_contextual_catalog_metadata()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  updated_count integer;
begin
with recursive presentation_profiles (
  root_slug,
  search_ru, search_kk,
  title_ru, title_kk,
  description_ru, description_kk
) as (
  values
    ('transport',
      'Поиск транспорта', 'Көлікті іздеу',
      'Укажите марку, модель и год', 'Маркасын, моделін және жылын көрсетіңіз',
      'Укажите тип транспорта, марку, модель, год, состояние и важные технические данные.',
      'Көлік түрін, маркасын, моделін, жылын, күйін және маңызды техникалық деректерін көрсетіңіз.'),
    ('parts',
      'Поиск запчастей', 'Қосалқы бөлшектерді іздеу',
      'Укажите деталь и совместимость', 'Бөлшек пен үйлесімділігін көрсетіңіз',
      'Укажите деталь, совместимость, производителя, артикул и состояние.',
      'Бөлшекті, үйлесімділігін, өндірушісін, артикулын және күйін көрсетіңіз.'),
    ('real-estate',
      'Поиск недвижимости', 'Жылжымайтын мүлікті іздеу',
      'Укажите объект и ключевые параметры', 'Нысан мен негізгі параметрлерді көрсетіңіз',
      'Укажите тип сделки, площадь, расположение, состояние объекта и условия.',
      'Мәміле түрін, ауданын, орналасуын, нысанның күйін және шарттарын көрсетіңіз.'),
    ('jobs',
      'Поиск вакансий', 'Бос орындарды іздеу',
      'Укажите должность и условия вакансии', 'Лауазым мен бос орын шарттарын көрсетіңіз',
      'Для вакансии опишите обязанности, требования, график, формат работы и условия оплаты.',
      'Бос орын үшін міндеттерді, талаптарды, кестені, жұмыс форматын және төлем шарттарын сипаттаңыз.'),
    ('services',
      'Поиск услуг', 'Қызметтерді іздеу',
      'Укажите конкретную услугу', 'Нақты қызметті көрсетіңіз',
      'Опишите состав услуги, результат, сроки, опыт исполнителя и порядок расчёта.',
      'Қызмет құрамын, нәтижесін, мерзімін, орындаушы тәжірибесін және есеп айырысу тәртібін сипаттаңыз.'),
    ('construction-repair',
      'Поиск строительных товаров', 'Құрылыс тауарларын іздеу',
      'Укажите материал, товар или инструмент', 'Материалды, тауарды немесе құралды көрсетіңіз',
      'Укажите назначение, материал, размер, количество, состояние и условия доставки.',
      'Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.'),
    ('goods-rental',
      'Поиск товаров напрокат', 'Жалға берілетін тауарларды іздеу',
      'Укажите предмет и срок проката', 'Жалға берілетін зат пен мерзімді көрсетіңіз',
      'Укажите срок проката, залог, комплект, доставку и правила использования.',
      'Жалға алу мерзімін, кепілдікті, жиынтықты, жеткізуді және пайдалану ережелерін көрсетіңіз.'),
    ('electronics',
      'Поиск электроники', 'Электрониканы іздеу',
      'Укажите устройство и точную модель', 'Құрылғы мен нақты моделін көрсетіңіз',
      'Укажите тип устройства, производителя, точную модель, состояние, комплект и гарантию.',
      'Құрылғы түрін, өндірушісін, нақты моделін, күйін, жиынтығын және кепілдігін көрсетіңіз.'),
    ('home-garden',
      'Поиск товаров для дома и сада', 'Үй мен бақша тауарларын іздеу',
      'Укажите товар для дома или сада', 'Үйге немесе бақшаға арналған тауарды көрсетіңіз',
      'Укажите назначение, размеры, материал, состояние, комплект и доставку.',
      'Мақсатын, өлшемдерін, материалын, күйін, жиынтығын және жеткізуді көрсетіңіз.'),
    ('personal',
      'Поиск одежды и аксессуаров', 'Киім мен аксессуарларды іздеу',
      'Укажите вещь, бренд и размер', 'Затты, брендті және өлшемді көрсетіңіз',
      'Укажите тип вещи, бренд, размер, материал, состояние и особенности посадки.',
      'Зат түрін, брендін, өлшемін, материалын, күйін және пішім ерекшеліктерін көрсетіңіз.'),
    ('kids',
      'Поиск детских товаров', 'Балалар тауарларын іздеу',
      'Укажите детский товар и возраст', 'Балалар тауары мен жасын көрсетіңіз',
      'Укажите возраст, размеры, состояние, комплект, безопасность и условия передачи.',
      'Жасын, өлшемдерін, күйін, жиынтығын, қауіпсіздігін және беру шарттарын көрсетіңіз.'),
    ('hobby',
      'Поиск товаров для хобби и спорта', 'Хобби мен спорт тауарларын іздеу',
      'Укажите товар, инвентарь или коллекцию', 'Тауарды, жабдықты немесе коллекцияны көрсетіңіз',
      'Укажите назначение, модель, состояние, комплект и важные характеристики.',
      'Мақсатын, моделін, күйін, жиынтығын және маңызды сипаттамаларын көрсетіңіз.'),
    ('animals',
      'Поиск животных и зоотоваров', 'Жануарлар мен зоотауарларды іздеу',
      'Укажите животное или зоотовар', 'Жануарды немесе зоотауарды көрсетіңіз',
      'Укажите вид, породу, возраст, состояние здоровья, документы и условия содержания.',
      'Түрін, тұқымын, жасын, денсаулық күйін, құжаттарын және күтіп-бағу шарттарын көрсетіңіз.'),
    ('business',
      'Поиск оборудования и бизнеса', 'Жабдықтар мен бизнесті іздеу',
      'Укажите оборудование, сырьё или бизнес', 'Жабдықты, шикізатты немесе бизнесті көрсетіңіз',
      'Укажите назначение, производителя, характеристики, состояние, документы и комплект.',
      'Мақсатын, өндірушісін, сипаттамаларын, күйін, құжаттарын және жиынтығын көрсетіңіз.'),
    ('exchange',
      'Поиск предложений для обмена', 'Айырбас ұсыныстарын іздеу',
      'Укажите предмет обмена', 'Айырбас затын көрсетіңіз',
      'Опишите предмет, его состояние, комплект и желаемые варианты обмена.',
      'Затты, оның күйін, жиынтығын және қалаған айырбас нұсқаларын сипаттаңыз.'),
    ('free',
      'Поиск бесплатных предложений', 'Тегін ұсыныстарды іздеу',
      'Укажите, что отдаёте бесплатно', 'Нені тегін беретініңізді көрсетіңіз',
      'Честно опишите предмет, его состояние, комплект и условия бесплатной передачи.',
      'Затты, оның күйін, жиынтығын және тегін беру шарттарын ашық сипаттаңыз.')
),
category_roots as (
  select category.id, category.slug as root_slug
  from public.categories as category
  where category.parent_id is null

  union all

  select child.id, parent.root_slug
  from public.categories as child
  join category_roots as parent on child.parent_id = parent.id
),
resolved as (
  select category.id, category.name_ru, category.name_kk, profile.*
  from public.categories as category
  join category_roots as root on root.id = category.id
  join presentation_profiles as profile on profile.root_slug = root.root_slug
)
update public.categories as category
set
  search_placeholder_ru = resolved.search_ru || ': «' || resolved.name_ru || '»',
  search_placeholder_kk = resolved.search_kk || ': «' || resolved.name_kk || '»',
  title_placeholder_ru = resolved.title_ru || ': «' || resolved.name_ru || '»',
  title_placeholder_kk = resolved.title_kk || ': «' || resolved.name_kk || '»',
  description_hint_ru = 'Категория: «' || resolved.name_ru || '». ' || resolved.description_ru,
  description_hint_kk = 'Санат: «' || resolved.name_kk || '». ' || resolved.description_kk,
  updated_at = current_timestamp
from resolved
where category.id = resolved.id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

select private.apply_contextual_catalog_metadata();

do $$
declare
  catalog_count integer;
  contextual_count integer;
begin
  select count(*)::integer into catalog_count from public.categories;
  select count(*)::integer into contextual_count
  from public.categories as category
  where category.search_placeholder_ru like '%«' || category.name_ru || '»%'
    and category.search_placeholder_kk like '%«' || category.name_kk || '»%'
    and category.title_placeholder_ru like '%«' || category.name_ru || '»%'
    and category.title_placeholder_kk like '%«' || category.name_kk || '»%'
    and category.description_hint_ru like '%«' || category.name_ru || '»%'
    and category.description_hint_kk like '%«' || category.name_kk || '»%';

  if catalog_count <> 1356 or contextual_count <> catalog_count then
    raise exception 'contextual Master Catalog metadata incomplete: %/%', contextual_count, catalog_count;
  end if;
end;
$$;

create table public.city_premium_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_premium_accounts_display_name_check check (char_length(btrim(display_name)) between 2 and 120),
  constraint city_premium_accounts_status_check check (status in ('active', 'suspended', 'closed')),
  constraint city_premium_accounts_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table public.city_premium_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.city_premium_accounts(id) on delete restrict,
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  status text not null default 'draft',
  payment_status text not null default 'unbilled',
  amount_minor bigint,
  currency_code char(3) not null default 'KZT',
  payment_provider text,
  external_payment_reference text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_premium_orders_status_check check (status in ('draft', 'pending', 'confirmed', 'cancelled', 'completed')),
  constraint city_premium_orders_payment_status_check check (payment_status in ('unbilled', 'pending', 'authorized', 'settled', 'failed', 'voided', 'refunded')),
  constraint city_premium_orders_amount_check check (amount_minor is null or amount_minor >= 0),
  constraint city_premium_orders_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint city_premium_orders_window_check check (ends_at > starts_at),
  constraint city_premium_orders_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint city_premium_orders_id_account_unique unique (id, account_id)
);

alter table public.city_premium_settings alter column capacity set default 15;

insert into public.city_premium_settings (settlement_id)
select settlement.id
from public.settlements as settlement
where settlement.is_selectable
on conflict (settlement_id) do nothing;

alter table public.city_premium_placements
  add column account_id uuid references public.city_premium_accounts(id) on delete restrict,
  add column order_id uuid,
  add column priority smallint not null default 0,
  add column rotation_weight numeric(8,4) not null default 1.0000,
  add column rotation_metadata jsonb not null default '{}'::jsonb;

alter table public.city_premium_placements
  drop constraint city_premium_placements_status_check,
  add constraint city_premium_placements_status_check check (status in ('active', 'paused', 'cancelled', 'completed')),
  add constraint city_premium_placements_order_account_check check (order_id is null or account_id is not null),
  add constraint city_premium_placements_priority_check check (priority between -1000 and 1000),
  add constraint city_premium_placements_rotation_weight_check check (rotation_weight > 0 and rotation_weight <= 1000),
  add constraint city_premium_placements_rotation_metadata_check check (jsonb_typeof(rotation_metadata) = 'object'),
  add constraint city_premium_placements_order_account_fk
    foreign key (order_id, account_id)
    references public.city_premium_orders (id, account_id)
    on delete restrict;

create table public.city_premium_events (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.city_premium_placements(id) on delete cascade,
  account_id uuid references public.city_premium_accounts(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  deduplication_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint city_premium_events_type_check check (event_type in ('impression', 'click')),
  constraint city_premium_events_deduplication_key_check check (deduplication_key is null or char_length(deduplication_key) between 8 and 160),
  constraint city_premium_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table public.city_premium_daily_metrics (
  placement_id uuid not null references public.city_premium_placements(id) on delete cascade,
  account_id uuid references public.city_premium_accounts(id) on delete restrict,
  metric_date date not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (placement_id, metric_date),
  constraint city_premium_daily_metrics_impressions_check check (impressions >= 0),
  constraint city_premium_daily_metrics_clicks_check check (clicks >= 0)
);

create or replace function private.assign_city_premium_metric_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select placement.account_id into new.account_id
  from public.city_premium_placements as placement
  where placement.id = new.placement_id;

  if not found then
    raise exception 'premium metric placement does not exist';
  end if;
  return new;
end;
$$;

create trigger city_premium_events_assign_account
before insert or update of placement_id on public.city_premium_events
for each row execute function private.assign_city_premium_metric_account();

create trigger city_premium_daily_metrics_assign_account
before insert or update of placement_id on public.city_premium_daily_metrics
for each row execute function private.assign_city_premium_metric_account();

create trigger city_premium_accounts_set_updated_at
before update on public.city_premium_accounts
for each row execute function private.set_updated_at();

create trigger city_premium_orders_set_updated_at
before update on public.city_premium_orders
for each row execute function private.set_updated_at();

create trigger city_premium_daily_metrics_set_updated_at
before update on public.city_premium_daily_metrics
for each row execute function private.set_updated_at();

create index city_premium_accounts_owner_status_idx
on public.city_premium_accounts (owner_id, status, id);

create index city_premium_orders_account_status_window_idx
on public.city_premium_orders (account_id, status, starts_at, ends_at, id);

create unique index city_premium_orders_provider_reference_unique
on public.city_premium_orders (payment_provider, external_payment_reference)
where payment_provider is not null and external_payment_reference is not null;

create index city_premium_placements_account_status_idx
on public.city_premium_placements (account_id, status, starts_at, ends_at, id);

create index city_premium_placements_order_idx
on public.city_premium_placements (order_id)
where order_id is not null;

create index city_premium_placements_rotation_config_idx
on public.city_premium_placements (settlement_id, status, priority desc, rotation_weight desc, id);

create index city_premium_events_placement_occurred_idx
on public.city_premium_events (placement_id, occurred_at desc, id);

create index city_premium_events_account_occurred_idx
on public.city_premium_events (account_id, occurred_at desc, event_type)
where account_id is not null;

create unique index city_premium_events_deduplication_unique
on public.city_premium_events (placement_id, event_type, deduplication_key)
where deduplication_key is not null;

create index city_premium_daily_metrics_account_date_idx
on public.city_premium_daily_metrics (account_id, metric_date desc, placement_id)
where account_id is not null;

alter table public.city_premium_accounts enable row level security;
alter table public.city_premium_orders enable row level security;
alter table public.city_premium_events enable row level security;
alter table public.city_premium_daily_metrics enable row level security;

create policy city_premium_accounts_owner_read
on public.city_premium_accounts for select to authenticated
using (owner_id = (select auth.uid()));

create policy city_premium_orders_account_owner_read
on public.city_premium_orders for select to authenticated
using (
  exists (
    select 1
    from public.city_premium_accounts as account
    where account.id = city_premium_orders.account_id
      and account.owner_id = (select auth.uid())
  )
);

create policy city_premium_placements_account_owner_read
on public.city_premium_placements for select to authenticated
using (
  exists (
    select 1
    from public.city_premium_accounts as account
    where account.id = city_premium_placements.account_id
      and account.owner_id = (select auth.uid())
  )
);

create policy city_premium_events_account_owner_read
on public.city_premium_events for select to authenticated
using (
  exists (
    select 1
    from public.city_premium_accounts as account
    where account.id = city_premium_events.account_id
      and account.owner_id = (select auth.uid())
  )
);

create policy city_premium_daily_metrics_account_owner_read
on public.city_premium_daily_metrics for select to authenticated
using (
  exists (
    select 1
    from public.city_premium_accounts as account
    where account.id = city_premium_daily_metrics.account_id
      and account.owner_id = (select auth.uid())
  )
);

revoke all on table
  public.city_premium_accounts,
  public.city_premium_orders,
  public.city_premium_events,
  public.city_premium_daily_metrics
from anon, authenticated;

grant select on table
  public.city_premium_accounts,
  public.city_premium_orders,
  public.city_premium_events,
  public.city_premium_daily_metrics
to authenticated;

grant all on table
  public.city_premium_accounts,
  public.city_premium_orders,
  public.city_premium_events,
  public.city_premium_daily_metrics
to service_role;

commit;
