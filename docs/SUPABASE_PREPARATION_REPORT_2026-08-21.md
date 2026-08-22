# Marketo v1.0 — отчёт подготовки Supabase

Дата: 21 августа 2026 года. Удалённые Supabase/Cloudflare проекты не изменялись.

1. **Обнаруженная архитектура.** Next.js/Vinext modular monolith на Cloudflare Worker; страницы по умолчанию server-rendered, интерактивные формы выделены в Client Components, пользовательские данные проходят через `lib/data/repositories.ts`.
2. **Drizzle.** В проекте был пустой SQLite/D1 starter. Он переведён на PostgreSQL; `db/schema.ts` теперь отражает 23 таблицы, а runtime использует Supabase HTTP/Auth clients, не прямое соединение из Worker.
3. **Существующие migrations.** Был один неприменённый широкий draft SQL без достаточного разделения grants/RLS. Удалённая история миграций отсутствовала. Draft заменён 12 логическими migration-файлами; в remote они не запускались.
4. **Mock/local data.** Фейковые пользователи/объявления/чаты удалены ранее; repository adapters возвращают честные empty states. Остались reference datasets, browser draft/location и локальное anonymous-favorite состояние. Полная карта находится в `MOCK_TO_SUPABASE_PLAN.md`.
5. **Таблицы.** `locales`, `countries`, `regions`, `settlements`, `profiles`, `profile_private`, `user_roles`, `categories`, `category_attributes`, `category_attribute_options`, `listings`, `listing_contacts`, два типа attribute values, `listing_images`, `favorites`, `conversations`, `conversation_participants`, `messages`, `notifications`, `reports`, `moderation_actions`, `admin_audit_log`.
6. **Связи.** Auth→profile; country→region→settlement; self-tree settlements/categories; category→attributes→options; profile/category/settlement→listing; listing aggregate; participant chat; owner notifications/reports/audit.
7. **FK.** Все доменные связи имеют FK; `profiles.id` ссылается только на PK `auth.users.id`; option values используют составной FK `(attribute_id, option_id)`.
8. **ON DELETE.** `RESTRICT` защищает reference hierarchy; `CASCADE` удаляет только чистые dependents; `SET NULL` сохраняет сообщения, жалобы и audit history. Перед удалением profile объявления архивируются.
9. **Индексы.** Добавлены partial active catalog indexes, keyset cursor, RU/KK trigram, FTS GIN, dynamic numeric/option filters, owner, favorites, chat, unread notifications, moderation queue и audit indexes. Дубли slug/image-sort indexes удалены.
10. **География.** Единая country-ready модель `Country → Region → Settlement`, где settlement поддерживает city/town/village/district и parent hierarchy без полиморфных FK.
11. **Category tree.** Одна unlimited-depth таблица с `parent_id`, стабильным slug, RU/KK, presentation fields и cycle trigger.
12. **Dynamic attributes.** Отдельные definitions/options с типами text/number/boolean/select/multiselect/range/date, required/filter/search flags и validation metadata.
13. **Listing attribute values.** Scalar/range значения хранятся в типизированных колонках; select/multiselect — в junction table. Triggers проверяют применимость, тип, active option и single-select concurrency.
14. **Listings.** UUID + unique stable slug, bigint minor units, currency code, controlled status checks, soft delete только здесь, leaf/reference validation и owner RPC transitions.
15. **R2.** PostgreSQL хранит только `storage_key`, order, dimensions, MIME, bytes. У browser role нет mutation grant/policy; metadata пишет будущий проверенный server upload flow после подтверждения R2.
16. **Favorites.** Composite PK `(user_id, listing_id)`, owner-only RLS, active-listing check, каскад endpoints.
17. **Conversations/messages.** Нормализованная participant pair uniqueness, atomic get/create RPC, explicit participants, per-participant `last_read_at`, participant-only RLS; прямой client insert разрешён только для text. Финальный аудит дополнительно исправил неоднозначное имя PL/pgSQL-переменной и безопасное обновление `last_message_at` триггером.
18. **Realtime.** Publication migration добавляет только `messages` и `notifications`, если `supabase_realtime` существует.
19. **Notifications.** `type + payload + read_at`; никакого сохранённого RU-only текста и никакого client INSERT.
20. **Reports/moderation.** Reporter-owned create/read, staff queue, role-checked listing/report RPCs и неизменяемая moderation history. Listing RPC теперь допускает только `pending→active`, `pending→rejected`, `active→archived`, `archived→active`.
21. **Admin roles.** Отдельная `user_roles`; assignment выполняет только audited admin RPC. Client-side `/admin` не предоставляет прав.
22. **Audit trail.** `moderation_actions` хранит решения по объявлениям; `admin_audit_log` — actor/action/entity/non-secret metadata.
23. **RLS coverage.** RLS включена на всех 23 public tables; тест сверяет это через PostgreSQL catalogs.
24. **Policies.** Создано 46 operation-specific policies: public references/active listings, explicit parent-state policies для listing child tables, owner profile/drafts/favorites, participant chat, owner notifications/reports, staff moderation/audit. Blanket private `USING (true)` отсутствует.
25. **Anon.** Только active reference data, active published listing aggregate и seller-safe profile columns через `seller_profiles`.
26. **Authenticated.** Public data, seller-safe cross-user profile columns, защищённый self RPC, собственные private contact/drafts/favorites/notifications/reports и participant chats.
27. **Owner-only.** Private contact, favorite rows, unpublished listings and aggregate values, notification read marker, conversation read marker.
28. **Admin/server operations.** Approval, report resolution, role assignment, system notifications/messages, verified R2 metadata, imports and recovery.
29. **Service secret.** Обычный UI в нём не нуждается. Он понадобится только контролируемому server route/job, где RLS bypass обоснован и выполняется предварительная авторизация.
30. **Защита service secret.** Отдельные public/server env modules, runtime guard, static Client Component scan, ignored env, no bundle references. Working tree и Git history не содержат credential-like values.
31. **Env.** Public: URL + publishable key; legacy anon fallback. Server-only: secret key; legacy service-role fallback. `DATABASE_URL` только tooling. Пример находится в `.env.example`.
32. **Migration files.** `0001` extensions/helpers; `0002` geo; `0003` profiles/roles; `0004` category/attributes; `0005` listings; `0006` favorites; `0007` chat; `0008` notifications; `0009` moderation/audit; `0010` RLS/grants; `0011` indexes/search/view; `0012` Realtime.
33. **Порядок.** Применять строго `0001`→`0012`, затем reference seed. Каждая migration транзакционная и forward-only.
34. **Seed strategy.** Schema отделена от reference data. Seed идемпотентен и не создаёт users/listings/reviews/chats.
35. **Kazakhstan geography.** Текущий seed честно содержит baseline 20 top-level units + 90 cities. Полный KATO загружается отдельным validated importer после review official export; baseline не выдаётся за все сёла/посёлки.
36. **Categories RU/KK.** Generator переносит 228 узлов, effective attributes и localized options из текущего единого typed frontend contract.
37. **Mock→Supabase.** Определены фазы A reference, B Auth/profile, C listings/R2, D favorites, E chat, F notifications, G moderation, H admin с source/pages/risk/tests.
38. **Frontend files следующего подключения.** Repository boundary, Auth form, publish/R2 route, listing adapters/actions, favorites, chat composer/subscription, notifications renderer, admin RPC UI; переключение только фазами.
39. **Typecheck.** `npm run typecheck` — успешно, 0 ошибок.
40. **Lint.** `npm run lint` — успешно, 0 ошибок.
41. **Tests.** После final security hardening 31/31 успешно: production Worker routes RU/KK/404/PWA/catalog, clean PostgreSQL migrations/seed, category/attribute integrity, Auth trigger, profile privacy, listing-child ownership, moderation state machine, conversation uniqueness, message spoofing, admin escalation, grants и secret scan.
42. **Production build.** `npm run build` — успешно. Дополнительно успешно при всех `.sh` с mode `0644`, поэтому executable bit не является условием Cloudflare build.
43. **Оставшиеся риски.** Нужны реальный Supabase branch test, Database Linter/Security Advisor, phone OTP/cookie test, full reviewed KATO import, R2 signed upload/rate limits, physical iPhone/Android test после будущего deploy.
44. **Нельзя делать вручную.** Не создавать таблицы через Table Editor как альтернативный source of truth; не вставлять service secret в browser/Git; не менять уже применённые migrations; не включать Realtime на весь schema; не запускать destructive SQL/seed в production без backup/branch review.
45. **Один следующий шаг.** После человеческого review открыть SQL Editor пустого Supabase project, выполнить **только** `supabase/migrations/0001_extensions_and_helpers.sql`, проверить успешный commit и остановиться до проверки результата.

Дополнительный Cloudflare QA: Wrangler 4.92.0 `deploy --dry-run` успешно использовал redirected generated config, собрал 35 Worker modules, прочитал 58 assets и завершился без upload. `nodejs_compat` имеет один production source в `wrangler.jsonc`; активных D1 bindings нет.
