-- Clarify the construction-goods vertical shown by every catalog surface.
-- Forward-only: released migrations and historical listing category ids stay immutable.

begin;

do $marketo_catalog_0026_preflight$
declare
  active_category_count integer;
  active_root_count integer;
  target_count integer;
begin
  select count(*) into active_category_count
  from public.categories
  where is_active;

  if active_category_count <> 1356 then
    raise exception '0026 active category count mismatch: expected 1356, got %', active_category_count;
  end if;

  select count(*) into active_root_count
  from public.categories
  where is_active and parent_id is null;

  if active_root_count <> 16 then
    raise exception '0026 active root count mismatch: expected 16, got %', active_root_count;
  end if;

  select count(*) into target_count
  from public.categories
  where slug = 'construction-repair'
    and parent_id is null
    and is_active
    and (
      (
        name_ru = 'Строительство и ремонт'
        and name_kk = 'Құрылыс және жөндеу'
        and search_placeholder_ru = 'Поиск строительных товаров: «Строительство и ремонт»'
        and search_placeholder_kk = 'Құрылыс тауарларын іздеу: «Құрылыс және жөндеу»'
        and title_placeholder_ru = 'Укажите материал, товар или инструмент: «Строительство и ремонт»'
        and title_placeholder_kk = 'Материалды, тауарды немесе құралды көрсетіңіз: «Құрылыс және жөндеу»'
        and description_hint_ru = 'Категория: «Строительство и ремонт». Укажите назначение, материал, размер, количество, состояние и условия доставки.'
        and description_hint_kk = 'Санат: «Құрылыс және жөндеу». Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.'
      )
      or
      (
        name_ru = 'Стройматериалы и инструменты'
        and name_kk = 'Құрылыс материалдары мен құралдар'
        and search_placeholder_ru = 'Поиск строительных товаров: «Стройматериалы и инструменты»'
        and search_placeholder_kk = 'Құрылыс тауарларын іздеу: «Құрылыс материалдары мен құралдар»'
        and title_placeholder_ru = 'Укажите материал, товар или инструмент: «Стройматериалы и инструменты»'
        and title_placeholder_kk = 'Материалды, тауарды немесе құралды көрсетіңіз: «Құрылыс материалдары мен құралдар»'
        and description_hint_ru = 'Категория: «Стройматериалы и инструменты». Укажите назначение, материал, размер, количество, состояние и условия доставки.'
        and description_hint_kk = 'Санат: «Құрылыс материалдары мен құралдар». Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.'
      )
    );

  if target_count <> 1 then
    raise exception '0026 refuses an unexpected construction-repair root contract';
  end if;
end;
$marketo_catalog_0026_preflight$;

update public.categories
set
  name_ru = 'Стройматериалы и инструменты',
  name_kk = 'Құрылыс материалдары мен құралдар',
  search_placeholder_ru = 'Поиск строительных товаров: «Стройматериалы и инструменты»',
  search_placeholder_kk = 'Құрылыс тауарларын іздеу: «Құрылыс материалдары мен құралдар»',
  title_placeholder_ru = 'Укажите материал, товар или инструмент: «Стройматериалы и инструменты»',
  title_placeholder_kk = 'Материалды, тауарды немесе құралды көрсетіңіз: «Құрылыс материалдары мен құралдар»',
  description_hint_ru = 'Категория: «Стройматериалы и инструменты». Укажите назначение, материал, размер, количество, состояние и условия доставки.',
  description_hint_kk = 'Санат: «Құрылыс материалдары мен құралдар». Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.',
  updated_at = current_timestamp
where slug = 'construction-repair'
  and parent_id is null
  and is_active;

do $marketo_catalog_0026_postflight$
declare
  target_count integer;
begin
  select count(*) into target_count
  from public.categories
  where slug = 'construction-repair'
    and parent_id is null
    and is_active
    and name_ru = 'Стройматериалы и инструменты'
    and name_kk = 'Құрылыс материалдары мен құралдар'
    and search_placeholder_ru = 'Поиск строительных товаров: «Стройматериалы и инструменты»'
    and search_placeholder_kk = 'Құрылыс тауарларын іздеу: «Құрылыс материалдары мен құралдар»'
    and title_placeholder_ru = 'Укажите материал, товар или инструмент: «Стройматериалы и инструменты»'
    and title_placeholder_kk = 'Материалды, тауарды немесе құралды көрсетіңіз: «Құрылыс материалдары мен құралдар»'
    and description_hint_ru = 'Категория: «Стройматериалы и инструменты». Укажите назначение, материал, размер, количество, состояние и условия доставки.'
    and description_hint_kk = 'Санат: «Құрылыс материалдары мен құралдар». Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.';

  if target_count <> 1 then
    raise exception '0026 postflight construction-repair root mismatch';
  end if;
end;
$marketo_catalog_0026_postflight$;

commit;
