-- Marketo v1.0 passenger-vehicle reference upgrade.
-- Forward-only and safe for an already seeded database. No RLS or schema
-- permissions are changed. On a clean database this migration is a no-op until
-- the deterministic reference seed is loaded.

begin;

create temporary table marketo_passenger_categories (
  id uuid primary key
) on commit drop;

with recursive passenger_categories as (
  select category.id
  from public.categories as category
  where category.slug = 'cars'

  union all

  select child.id
  from public.categories as child
  join passenger_categories as parent on child.parent_id = parent.id
)
insert into marketo_passenger_categories (id)
select id from passenger_categories;

-- Move only the controlled passenger-car fields out of the canonical range
-- before the upsert. This avoids collisions with the per-category sort-order
-- constraint while preserving any independently curated attributes.
update public.category_attributes as attribute
set sort_order = attribute.sort_order + 10000
from marketo_passenger_categories as category
where attribute.category_id = category.id
  and attribute.key in (
    'brand', 'model', 'year', 'mileage', 'transmission', 'fuel', 'drive',
    'engine_volume', 'condition', 'body'
  )
  and attribute.sort_order < 10000;

create temporary table marketo_passenger_attributes (
  key text primary key,
  label_ru text not null,
  label_kk text not null,
  data_type text not null,
  unit_ru text,
  unit_kk text,
  is_required boolean not null,
  is_filterable boolean not null,
  is_searchable boolean not null,
  validation jsonb not null,
  sort_order integer not null
) on commit drop;

insert into marketo_passenger_attributes (
  key, label_ru, label_kk, data_type, unit_ru, unit_kk,
  is_required, is_filterable, is_searchable, validation, sort_order
)
values
  ('brand', 'Марка', 'Маркасы', 'select', null, null, true, true, false, '{}'::jsonb, 10),
  ('model', 'Модель автомобиля', 'Автомобиль моделі', 'text', null, null, true, true, true, '{"maxLength": 80}'::jsonb, 20),
  ('year', 'Год выпуска', 'Шығарылған жылы', 'number', 'год', 'жыл', true, true, false, '{"min": 1900, "max": 2100}'::jsonb, 30),
  ('mileage', 'Пробег', 'Жүрісі', 'number', 'км', 'км', false, true, false, '{"min": 0}'::jsonb, 40),
  ('transmission', 'Коробка передач', 'Беріліс қорабы', 'select', null, null, false, true, false, '{}'::jsonb, 50),
  ('fuel', 'Топливо', 'Отын түрі', 'select', null, null, false, true, false, '{}'::jsonb, 60),
  ('drive', 'Привод', 'Жетек', 'select', null, null, false, true, false, '{}'::jsonb, 70),
  ('engine_volume', 'Объём двигателя', 'Қозғалтқыш көлемі', 'number', 'л', 'л', false, true, false, '{"min": 0.1, "max": 20, "step": 0.1}'::jsonb, 80),
  ('condition', 'Состояние автомобиля', 'Автомобиль күйі', 'select', null, null, true, true, false, '{}'::jsonb, 90);

insert into public.category_attributes (
  category_id, key, label_ru, label_kk, data_type, unit_ru, unit_kk,
  is_required, is_filterable, is_searchable, inherits_to_children,
  validation, sort_order, is_active
)
select
  category.id,
  reference.key,
  reference.label_ru,
  reference.label_kk,
  reference.data_type,
  reference.unit_ru,
  reference.unit_kk,
  reference.is_required,
  reference.is_filterable,
  reference.is_searchable,
  false,
  reference.validation,
  reference.sort_order,
  true
from marketo_passenger_categories as category
cross join marketo_passenger_attributes as reference
on conflict (category_id, key) do update set
  label_ru = excluded.label_ru,
  label_kk = excluded.label_kk,
  data_type = excluded.data_type,
  unit_ru = excluded.unit_ru,
  unit_kk = excluded.unit_kk,
  is_required = excluded.is_required,
  is_filterable = excluded.is_filterable,
  is_searchable = excluded.is_searchable,
  inherits_to_children = excluded.inherits_to_children,
  validation = excluded.validation,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- The selected leaf category already is the body type (sedan, SUV, and so on).
-- Keeping a second editable body field allowed contradictory combinations.
update public.category_attributes as attribute
set is_active = false,
    sort_order = 1000
from marketo_passenger_categories as category
where attribute.category_id = category.id
  and attribute.key = 'body';

create temporary table marketo_vehicle_brands (
  value text primary key,
  label_ru text not null,
  label_kk text not null,
  sort_order integer not null unique
) on commit drop;

insert into marketo_vehicle_brands (value, label_ru, label_kk, sort_order)
values
  ('acura', 'Acura', 'Acura', 10),
  ('alfa-romeo', 'Alfa Romeo', 'Alfa Romeo', 20),
  ('alpina', 'Alpina', 'Alpina', 30),
  ('aito', 'AITO', 'AITO', 40),
  ('arcfox', 'ARCFOX', 'ARCFOX', 50),
  ('aston-martin', 'Aston Martin', 'Aston Martin', 60),
  ('audi', 'Audi', 'Audi', 70),
  ('aurus', 'Aurus', 'Aurus', 80),
  ('avatr', 'Avatr', 'Avatr', 90),
  ('baic', 'BAIC', 'BAIC', 100),
  ('bentley', 'Bentley', 'Bentley', 110),
  ('bestune', 'Bestune', 'Bestune', 120),
  ('bmw', 'BMW', 'BMW', 130),
  ('brilliance', 'Brilliance', 'Brilliance', 140),
  ('bugatti', 'Bugatti', 'Bugatti', 150),
  ('buick', 'Buick', 'Buick', 160),
  ('byd', 'BYD', 'BYD', 170),
  ('cadillac', 'Cadillac', 'Cadillac', 180),
  ('changan', 'Changan', 'Changan', 190),
  ('changhe', 'Changhe', 'Changhe', 200),
  ('chery', 'Chery', 'Chery', 210),
  ('chevrolet', 'Chevrolet', 'Chevrolet', 220),
  ('chrysler', 'Chrysler', 'Chrysler', 230),
  ('citroen', 'Citroën', 'Citroën', 240),
  ('cupra', 'CUPRA', 'CUPRA', 250),
  ('dacia', 'Dacia', 'Dacia', 260),
  ('daewoo', 'Daewoo', 'Daewoo', 270),
  ('daihatsu', 'Daihatsu', 'Daihatsu', 280),
  ('datsun', 'Datsun', 'Datsun', 290),
  ('deepal', 'Deepal', 'Deepal', 300),
  ('denza', 'Denza', 'Denza', 310),
  ('dodge', 'Dodge', 'Dodge', 320),
  ('dongfeng', 'Dongfeng', 'Dongfeng', 330),
  ('ds', 'DS Automobiles', 'DS Automobiles', 340),
  ('exeed', 'EXEED', 'EXEED', 350),
  ('faw', 'FAW', 'FAW', 360),
  ('ferrari', 'Ferrari', 'Ferrari', 370),
  ('fiat', 'Fiat', 'Fiat', 380),
  ('fisker', 'Fisker', 'Fisker', 390),
  ('ford', 'Ford', 'Ford', 400),
  ('foton', 'Foton', 'Foton', 410),
  ('gac', 'GAC', 'GAC', 420),
  ('gaz', 'ГАЗ', 'ГАЗ', 430),
  ('geely', 'Geely', 'Geely', 440),
  ('genesis', 'Genesis', 'Genesis', 450),
  ('gmc', 'GMC', 'GMC', 460),
  ('great-wall', 'Great Wall', 'Great Wall', 470),
  ('haima', 'Haima', 'Haima', 480),
  ('haval', 'Haval', 'Haval', 490),
  ('honda', 'Honda', 'Honda', 500),
  ('hongqi', 'Hongqi', 'Hongqi', 510),
  ('hummer', 'Hummer', 'Hummer', 520),
  ('hyundai', 'Hyundai', 'Hyundai', 530),
  ('ineos', 'INEOS', 'INEOS', 540),
  ('infiniti', 'Infiniti', 'Infiniti', 550),
  ('iran-khodro', 'Iran Khodro', 'Iran Khodro', 560),
  ('isuzu', 'Isuzu', 'Isuzu', 570),
  ('iveco', 'Iveco', 'Iveco', 580),
  ('jac', 'JAC', 'JAC', 590),
  ('jaecoo', 'JAECOO', 'JAECOO', 600),
  ('jaguar', 'Jaguar', 'Jaguar', 610),
  ('jeep', 'Jeep', 'Jeep', 620),
  ('jetour', 'Jetour', 'Jetour', 630),
  ('jetta', 'Jetta', 'Jetta', 640),
  ('kaiyi', 'KAIYI', 'KAIYI', 650),
  ('kgm', 'KGM', 'KGM', 660),
  ('kia', 'Kia', 'Kia', 670),
  ('lamborghini', 'Lamborghini', 'Lamborghini', 680),
  ('lancia', 'Lancia', 'Lancia', 690),
  ('lada', 'Lada', 'Lada', 700),
  ('land-rover', 'Land Rover', 'Land Rover', 710),
  ('leapmotor', 'Leapmotor', 'Leapmotor', 720),
  ('lexus', 'Lexus', 'Lexus', 730),
  ('li-auto', 'Li Auto', 'Li Auto', 740),
  ('lifan', 'Lifan', 'Lifan', 750),
  ('lincoln', 'Lincoln', 'Lincoln', 760),
  ('lotus', 'Lotus', 'Lotus', 770),
  ('lucid', 'Lucid', 'Lucid', 780),
  ('luxeed', 'Luxeed', 'Luxeed', 790),
  ('lynk-co', 'Lynk & Co', 'Lynk & Co', 800),
  ('maserati', 'Maserati', 'Maserati', 810),
  ('maxus', 'Maxus', 'Maxus', 820),
  ('maybach', 'Maybach', 'Maybach', 830),
  ('mazda', 'Mazda', 'Mazda', 840),
  ('mclaren', 'McLaren', 'McLaren', 850),
  ('mercedes-benz', 'Mercedes-Benz', 'Mercedes-Benz', 860),
  ('mercury', 'Mercury', 'Mercury', 870),
  ('mg', 'MG', 'MG', 880),
  ('mini', 'MINI', 'MINI', 890),
  ('mitsubishi', 'Mitsubishi', 'Mitsubishi', 900),
  ('moskvich', 'Москвич', 'Москвич', 910),
  ('neta', 'Neta', 'Neta', 920),
  ('nio', 'NIO', 'NIO', 930),
  ('nissan', 'Nissan', 'Nissan', 940),
  ('oldsmobile', 'Oldsmobile', 'Oldsmobile', 950),
  ('omoda', 'OMODA', 'OMODA', 960),
  ('opel', 'Opel', 'Opel', 970),
  ('ora', 'ORA', 'ORA', 980),
  ('pagani', 'Pagani', 'Pagani', 990),
  ('peugeot', 'Peugeot', 'Peugeot', 1000),
  ('plymouth', 'Plymouth', 'Plymouth', 1010),
  ('polestar', 'Polestar', 'Polestar', 1020),
  ('pontiac', 'Pontiac', 'Pontiac', 1030),
  ('porsche', 'Porsche', 'Porsche', 1040),
  ('proton', 'Proton', 'Proton', 1050),
  ('ram', 'RAM', 'RAM', 1060),
  ('ravon', 'Ravon', 'Ravon', 1070),
  ('renault', 'Renault', 'Renault', 1080),
  ('rising-auto', 'Rising Auto', 'Rising Auto', 1090),
  ('rivian', 'Rivian', 'Rivian', 1100),
  ('rolls-royce', 'Rolls-Royce', 'Rolls-Royce', 1110),
  ('rover', 'Rover', 'Rover', 1120),
  ('saab', 'Saab', 'Saab', 1130),
  ('saturn', 'Saturn', 'Saturn', 1140),
  ('scion', 'Scion', 'Scion', 1150),
  ('seat', 'SEAT', 'SEAT', 1160),
  ('seres', 'SERES', 'SERES', 1170),
  ('skoda', 'Škoda', 'Škoda', 1180),
  ('skywell', 'Skywell', 'Skywell', 1190),
  ('smart', 'Smart', 'Smart', 1200),
  ('soueast', 'Soueast', 'Soueast', 1210),
  ('ssangyong', 'SsangYong', 'SsangYong', 1220),
  ('subaru', 'Subaru', 'Subaru', 1230),
  ('suzuki', 'Suzuki', 'Suzuki', 1240),
  ('tank', 'TANK', 'TANK', 1250),
  ('tata', 'Tata', 'Tata', 1260),
  ('tesla', 'Tesla', 'Tesla', 1270),
  ('toyota', 'Toyota', 'Toyota', 1280),
  ('uaz', 'УАЗ', 'УАЗ', 1290),
  ('vauxhall', 'Vauxhall', 'Vauxhall', 1300),
  ('volkswagen', 'Volkswagen', 'Volkswagen', 1310),
  ('volvo', 'Volvo', 'Volvo', 1320),
  ('voyah', 'VOYAH', 'VOYAH', 1330),
  ('wey', 'WEY', 'WEY', 1340),
  ('wuling', 'Wuling', 'Wuling', 1350),
  ('xiaomi', 'Xiaomi Auto', 'Xiaomi Auto', 1360),
  ('xpeng', 'XPeng', 'XPeng', 1370),
  ('zaz', 'ЗАЗ', 'ЗАЗ', 1380),
  ('zeekr', 'ZEEKR', 'ZEEKR', 1390),
  ('zotye', 'Zotye', 'Zotye', 1400),
  ('other', 'Другая марка', 'Басқа марка', 1410);

update public.category_attribute_options as option
set sort_order = option.sort_order + 10000
from public.category_attributes as attribute
join marketo_passenger_categories as category on category.id = attribute.category_id
where option.attribute_id = attribute.id
  and attribute.key = 'brand'
  and option.sort_order < 10000;

insert into public.category_attribute_options (
  attribute_id, value, label_ru, label_kk, sort_order, is_active
)
select
  attribute.id,
  reference.value,
  reference.label_ru,
  reference.label_kk,
  reference.sort_order,
  true
from public.category_attributes as attribute
join marketo_passenger_categories as category on category.id = attribute.category_id
cross join marketo_vehicle_brands as reference
where attribute.key = 'brand'
on conflict (attribute_id, value) do update set
  label_ru = excluded.label_ru,
  label_kk = excluded.label_kk,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

create temporary table marketo_vehicle_conditions (
  value text primary key,
  label_ru text not null,
  label_kk text not null,
  sort_order integer not null unique
) on commit drop;

insert into marketo_vehicle_conditions (value, label_ru, label_kk, sort_order)
values
  ('new', 'Новое', 'Жаңа', 10),
  ('used', 'С пробегом', 'Жүрілген', 20),
  ('needs-repair', 'Требует ремонта', 'Жөндеуді қажет етеді', 30);

update public.category_attribute_options as option
set sort_order = option.sort_order + 10000
from public.category_attributes as attribute
join marketo_passenger_categories as category on category.id = attribute.category_id
where option.attribute_id = attribute.id
  and attribute.key = 'condition'
  and option.sort_order < 10000;

insert into public.category_attribute_options (
  attribute_id, value, label_ru, label_kk, sort_order, is_active
)
select
  attribute.id,
  reference.value,
  reference.label_ru,
  reference.label_kk,
  reference.sort_order,
  true
from public.category_attributes as attribute
join marketo_passenger_categories as category on category.id = attribute.category_id
cross join marketo_vehicle_conditions as reference
where attribute.key = 'condition'
on conflict (attribute_id, value) do update set
  label_ru = excluded.label_ru,
  label_kk = excluded.label_kk,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

commit;
