# Marketo v1.0 — финальный аудит Supabase foundation

Дата: 21 августа 2026 года  
Область проверки: локальная кодовая база и чистая PostgreSQL-совместимая тестовая БД.  
Удалённый production Supabase: **NOT EXECUTED / НЕ ИЗМЕНЯЛСЯ**.  
Cloudflare deployment: **NOT EXECUTED / НЕ ВЫПОЛНЯЛСЯ**.

## 1. Итоговый статус

| Проверка | Статус | Результат |
|---|---|---|
| Статическая проверка 12 migrations | PASS | порядок, транзакции, RLS coverage, grants, checksums |
| Реальное выполнение migrations | PASS | 12/12 выполнены по порядку в чистой PGlite PostgreSQL-compatible БД |
| Reference seed | PASS | 20 top-level units, 90 cities, 228 categories, 712 attributes, 1519 options |
| RLS | PASS | 23/23 public tables, 46 operation-specific policies |
| Security tests | PASS | spoofing, escalation, privacy, ownership и state transitions отклоняются |
| TypeScript | PASS | `npm run typecheck`, 0 ошибок |
| ESLint | PASS | `npm run lint`, 0 ошибок |
| Tests | PASS | 31/31 |
| Production build | PASS | Vinext/Cloudflare Worker artifact проверен |
| `.sh` с mode `0644` | PASS | build прошёл без executable bit, `Permission denied` не воспроизведён |
| Wrangler dry-run | PASS | 35 Worker modules, 58 assets, без upload/deploy |
| Реальный Supabase branch | REQUIRES REAL SUPABASE | не выполнялся без разрешения/credentials |
| Supabase Security Advisor/Linter | REQUIRES REAL SUPABASE | выполнить после первой branch/dev application |
| Полный официальный КАТО | NOT EXECUTED | importer готов, официальный normalized dataset ещё не утверждён |

## 2. Исправленные проблемы

1. Moderation RPC больше не переводит произвольный listing в `active`.
2. Authenticated-пользователь больше не получает table-wide `SELECT` по
   `profiles`; публичные и защищённые данные разделены grants/view/RPC.
3. `listing_images`, `listing_attribute_values` и
   `listing_attribute_option_values` получили явные parent-state SELECT
   policies.
4. Проверка category/attribute integrity стала исполняемой на реальной
   PostgreSQL-совместимой схеме, а не только regex-проверкой файлов.
5. Listing attribute trigger и составной FK доказанно блокируют чужую категорию
   и option от другого attribute.
6. Profile Auth trigger проверен на игнорирование signup metadata `role`,
   `status`, `verified_at`; обе вставки остаются idempotent через `ON CONFLICT`.
7. Исправлено неоднозначное PL/pgSQL-имя `conversation_id`, которое ломало
   создание диалога.
8. Триггер обновления `last_message_at` получил безопасный trigger-only
   `SECURITY DEFINER`; до исправления корректная отправка сообщения упиралась в
   отсутствие client UPDATE-права на `conversations`.
9. Документация больше не выдаёт 90 городов за полный справочник Казахстана и
   228 категорий за окончательно утверждённую бизнес-таксономию.
10. Добавлены migration manifest и SHA-256 для всех 12 migrations и seed.

## 3. Moderation transition matrix

| Action | Разрешённый переход | Дополнительное правило | Иные исходные состояния |
|---|---|---|---|
| `approve` | `pending → active` | устанавливает `published_at`, если его нет | DENIED |
| `reject` | `pending → rejected` | непустой `reason_code` обязателен | DENIED |
| `hide` | `active → archived` | непустой `reason_code` обязателен | DENIED |
| `restore` | `archived → active` | не очищает `deleted_at` и не оживляет deleted | DENIED |

Каждый допустимый переход выполняется под блокировкой строки, атомарно создаёт
`moderation_actions` и `admin_audit_log`. Любая ошибка откатывает весь вызов.
Тесты подтвердили запрет восстановления `draft`, `rejected`, `sold`, `expired`
и `deleted`.

## 4. Profile data visibility matrix

| Поля/операция | Anon | Authenticated: другой пользователь | Владелец | Moderator/Admin |
|---|---|---|---|---|
| `id`, `display_name`, avatar, bio, settlement, badge, joined date | active seller only | active seller only | да | seller view |
| language, account status, `last_seen_at`, updated timestamp | нет | нет | `get_my_profile()` | `get_profile_for_staff()` |
| private contact phone | нет | нет | owner-only `profile_private` | только будущий audited server flow |
| изменить display/avatar/bio/language/settlement | нет | нет | да | не через обычный profile update |
| изменить status/verification/role | нет | нет | DENIED | только controlled admin/server operation |

`seller_profiles` — security-invoker view только с seller-safe columns.
Underlying RLS продолжает скрывать suspended/banned/deleted профили от anon и
чужих обычных пользователей.

## 5. Permission model

| Роль | Разрешено |
|---|---|
| `anon` | active reference data; active/published/non-deleted listings и их public children; seller-safe active profiles |
| `authenticated` | всё public; собственный защищённый profile/contact; собственные drafts/favorites/notifications/reports; participant chat |
| owner | редактирование только разрешённых profile/listing columns; scalar/option values только draft/rejected; submit/archive/sold через RPC |
| moderator | строгая listing moderation, report resolution, staff profile lookup, queues/audit subset |
| admin | moderator capabilities плюс audited role assignment и admin audit read |
| service role | table grants/RLS bypass только для audited server/import/recovery; в browser не используется |

## 6. Listing child-table RLS

Для `listing_attribute_values`, `listing_attribute_option_values` и
`listing_images` публичный `SELECT` требует, чтобы parent listing одновременно
имел:

- `status = 'active'`;
- `published_at IS NOT NULL`;
- `deleted_at IS NULL`.

Authenticated owner отдельно видит children своих draft/pending/rejected/
archived/sold/expired listings. Moderator/admin получает role-gated read.
Scalar/option mutations доступны только owner для draft/rejected. Browser не
может INSERT/UPDATE/DELETE `listing_images` даже своего listing: R2 metadata
должен записать будущий server route после проверки object key, MIME и size.

Тестами подтверждено:

- чужой draft child не читается;
- anon не видит draft child;
- anon видит child active listing;
- чужой attribute INSERT отклоняется;
- image INSERT, sort update и delete из browser отклоняются.

## 7. Category integrity result

Статус: **PASS** для текущего seed.

- records: 228;
- reachable from roots: 228;
- duplicate slug: 0;
- duplicate sibling RU name: 0;
- duplicate sibling KK name: 0;
- orphan parent: 0;
- cycles: 0;
- current depth: 0–2;
- empty RU/KK: 0;
- active child under inactive parent: 0;
- duplicate sibling sort order: 0;
- malformed slug: 0 (DB constraint);
- `is_leaf`: отсутствует намеренно; leaf определяется отсутствием active child;
- semantic spot-check: `transport→cars→cars-suv` и
  `electronics→phones-accessories→smartphones` — PASS.

Статус контента: **initial Marketo reference taxonomy**. Это не утверждение, что
финальная бизнес-классификация для production уже согласована.

## 8. Category attribute integrity result

Статус: **PASS** для текущего seed.

- definitions: 712;
- options: 1519;
- duplicate `(category_id, key)`: 0, защищено UNIQUE;
- duplicate `(attribute_id, value)`: 0, защищено UNIQUE;
- orphan definitions/options: 0;
- invalid data type: 0, защищено CHECK;
- empty RU/KK labels: 0, защищено CHECK;
- inconsistent RU/KK units: 0, защищено CHECK;
- duplicate sort order within category/attribute: 0, защищено UNIQUE;
- option from another attribute: DENIED составным FK и trigger validation;
- attribute from another listing category: DENIED trigger validation.

## 9. Geography current status

**CURRENT:** 20 top-level administrative units and 90 major-city records.
Это city-level bootstrap для UI, а не полный реестр всех населённых пунктов.

**TARGET:** отдельно проверенный официальный КАТО с district, city district,
city, town, urban settlement, village и other nodes, `kato_code`, parent links,
RU/KK names, `is_active` и `is_selectable`.

## 10. Full KATO import readiness

`settlements` уже поддерживает `parent_id`, `kato_code`, `kind`, region,
selectability, activity, coordinates и source date. Parent обязан находиться в
том же регионе; cycle trigger защищает hierarchy.

`scripts/generate-kato-seed.mjs` принимает отдельно reviewed normalized JSON,
проверяет обязательные поля, KATO-code uniqueness, allowed kind, отсутствующий
parent, cross-region parent и cycles, затем генерирует отдельный transactional
SQL seed. Вымышленные сёла/посёлки не добавлялись.

## 11. SECURITY DEFINER audit

Статус: **PASS**, 14 функций. У каждой `search_path=''`; anon EXECUTE отсутствует.

Authenticated-callable, но с `auth.uid()`/role/input validation:

- `private.has_any_role`;
- `private.current_profile_is_active`;
- `private.is_conversation_participant`;
- `public.get_my_profile`;
- `public.get_profile_for_staff`;
- `public.submit_listing`;
- `public.archive_own_listing`;
- `public.mark_own_listing_sold`;
- `public.get_or_create_listing_conversation`;
- `public.moderate_listing`;
- `public.resolve_report`;
- `public.assign_user_role`.

Trigger-only, без browser EXECUTE:

- `private.handle_new_auth_user`;
- `private.touch_conversation_after_message`.

## 12. Function/table GRANT audit

- `anon`: нет EXECUTE elevated functions; profile SELECT column-limited.
- `authenticated`: нет table-wide profile SELECT; нет notification INSERT,
  report UPDATE, role INSERT или image metadata mutation grant.
- `authenticated` имеет EXECUTE только на 12 перечисленных RPC/helpers; каждый
  вызов дополнительно проверяется функцией.
- `service_role`: полные table grants для server/import/recovery; owner RPCs
  явно grant-нуты. Admin RPCs рассчитаны на user JWT, чтобы `auth.uid()` сохранял
  реального actor для audit trail.
- `private` schema не доступна anon; authenticated usage нужно только для
  безопасных policy helpers.

## 13. Realtime publication

Статус в clean test DB: **PASS**. В `supabase_realtime` добавлены ровно:

1. `messages`;
2. `notifications`.

Остальные 21 public tables не публикуются. Row visibility Realtime наследует
соответствующие SELECT/RLS policies.

## 14. Conversation uniqueness and message security

Conversation unique key: `(listing_id, participant_low_id,
participant_high_id)`. `get_or_create_listing_conversation()` нормализует пару,
использует `ON CONFLICT` и возвращает существующий row при повторном вызове.

Тест: два одинаковых вызова buyer+seller+listing вернули один UUID; в таблице
осталась одна conversation. Message INSERT требует одновременно:

- `sender_id = auth.uid()`;
- текущий user — participant;
- conversation active;
- current profile active;
- direct client message type только `text`.

Попытка buyer отправить сообщение от имени seller: **DENIED**.

## 15. Admin escalation protections

Обычный authenticated user в actual RLS test не смог:

- изменить profile `status`;
- установить `verified_at`;
- вставить себе `admin` role;
- вызвать `assign_user_role`;
- вызвать `moderate_listing`;
- прочитать protected staff profile RPC.

Signup metadata `status=admin`, `role=admin`, `verified_at=...` было
проигнорировано Auth trigger. Создан обычный active profile без roles/badge.

## 16. Favorites, notifications and reports

- Favorite uniqueness `(user_id, listing_id)` — PASS.
- Новый favorite разрешён только для active/non-deleted listing.
- Existing favorite может оставаться после archive, но listing details скрывает
  listing RLS; user может удалить собственную запись.
- Notification INSERT обычному client запрещён; owner читает и меняет только
  `read_at` своих rows.
- Report INSERT требует `reporter_id=auth.uid()`, open state и active profile.
  Reporter видит своё обращение, но не меняет status/moderator/resolution.

## 17. Secret scan

Статус: **PASS**.

- source scan проверил application, migrations, seed, docs, scripts и env
  example на Supabase secret/JWT, Postgres password URL, private keys;
- client modules отдельно проверяются на server imports/secret names;
- Git history value-pattern scan — PASS;
- реальные credential values не выводились и не добавлялись;
- production credentials не использовались.

## 18. Migration validation result

**Static validation — PASS:** exact 12-file order, transaction boundaries,
23/23 RLS tables, no unrestricted private policy, single Cloudflare
`nodejs_compat`, no active D1 binding, checksum match.

**Actual execution — PASS:** все 12 migrations и reference seed реально
исполнены в clean PGlite PostgreSQL-compatible database с `pgcrypto`, `pg_trgm`,
Supabase roles/Auth stub и Realtime publication. Это сильнее regex-проверки, но
не заменяет реальный Supabase branch.

**Real Supabase — REQUIRES REAL SUPABASE:** remote extensions, PostgREST,
Database Linter, Security Advisor и dashboard publication ещё не проверялись.

## 19. Build and test result

| Команда/сценарий | Результат |
|---|---|
| clean `npm ci` через hardened install flow | PASS, 532 packages |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run validate:db` | PASS |
| `node --test tests/*.test.mjs` | PASS, 31/31 |
| `npm run build` | PASS |
| build при всех `.sh` = `0644` | PASS |
| Wrangler 4.92.0 `deploy --dry-run` | PASS, no upload |

## 20. Cloudflare regression result

- `.sh Permission denied`: PASS, не воспроизводится при `0644`;
- `nodejs_compat`: PASS, один production source в `wrangler.jsonc`;
- duplicate `compatibility_flags` в `vite.config.ts`: отсутствует;
- generated Wrangler config: PASS;
- active D1 placeholder binding: отсутствует;
- Worker entry: ESM default object с callable `fetch` — PASS;
- Cloudflare deploy: **NOT EXECUTED**, как требовалось.

## 21. Что ещё не production-complete

1. 12 migrations не применены в реальном Supabase.
2. Нет результата Supabase Database Linter/Security Advisor.
3. Полный официальный КАТО не импортирован.
4. Final category taxonomy требует business review.
5. UI пока не переключён с repository empty adapters на Supabase.
6. Phone OTP/cookies и Auth trigger не проверены реальным Supabase Auth.
7. R2 signed upload route, MIME sniffing, size/rate limits и cleanup не
   реализованы.
8. Realtime не проверен между двумя физическими clients.
9. Rate limiting для OTP/messages/reports/listings/search — future server task.
10. Backup/PITR и migration recovery rehearsal требуют реального проекта.

## 22. Exact ordered migration list

1. `0001_extensions_and_helpers.sql`
2. `0002_geography.sql`
3. `0003_profiles_and_roles.sql`
4. `0004_categories_and_attributes.sql`
5. `0005_listings.sql`
6. `0006_favorites.sql`
7. `0007_chat.sql`
8. `0008_notifications.sql`
9. `0009_reports_moderation_and_audit.sql`
10. `0010_rls_and_grants.sql`
11. `0011_indexes_and_search.sql`
12. `0012_realtime.sql`
13. Отдельно после schema review: `seeds/001_marketo_reference.sql`.

Точный dependency/purpose manifest: `supabase/MIGRATION_MANIFEST.md`.
SQL digests: `supabase/CHECKSUMS.sha256`.

## 23. Действия, которые нельзя выполнять вручную

- не запускать все 12 migrations одним нерассмотренным блоком;
- не создавать параллельную schema через Table Editor;
- не менять applied migration — только новая forward migration;
- не добавлять service/secret key в `NEXT_PUBLIC_*`, browser, Git или logs;
- не импортировать непроверенный КАТО;
- не включать Realtime на весь public schema;
- не давать browser прямой write к R2 metadata;
- не выполнять destructive SQL в production без branch test и backup plan.

## 24. Выполненные внешние действия

- Production Supabase mutation: **NOT EXECUTED**.
- Production credentials connection: **NOT EXECUTED**.
- Cloudflare deployment: **NOT EXECUTED**.
- GitHub publish/push: **NOT EXECUTED**.

## 25. Один следующий безопасный шаг после независимого review

После внешнего review открыть SQL Editor **пустого** Supabase project, выполнить
**только** `supabase/migrations/0001_extensions_and_helpers.sql`, проверить, что
транзакция завершилась без ошибки, и остановиться. Не запускать 0002–0012 и seed
до проверки результата первой migration.

