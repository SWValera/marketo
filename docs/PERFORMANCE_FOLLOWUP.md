# Проверка задержек после отключения PWA — 2026-09-27

Baseline: `stage3-staging`, `5eb8fb4`; production Worker version
`2705ceb6-71bc-4461-8159-e781e1709628`. Старый build сохранён только в
игнорируемом `artifacts/performance-followup/baseline`.

## Подтверждённые причины

1. Прежние 0,97 с страницы объявления — `navigation.responseStart`, то есть
   браузерный TTFB от начала навигации, а не время CPU Worker. В трёх холодных
   замерах DNS занимал 9–11 мс, соединение 54–74 мс, редиректов не было.
   Request→responseStart: 881–991 мс, включая сеть и backend.
2. `findListingBySlug` уже разделял результат между metadata/content в пределах
   запроса; ненужной сессии или приватного профиля на публичной странице нет.
   Задержку создавали шесть HTTP-чтений в трёх последовательных волнах:
   listing → seller/values → definitions/options.
   Теперь анонимный PostgREST embed получает характеристики с объявлением;
   затем читается публичный seller view: два запроса в две волны.
   Выборка содержит только используемые поля. Все фото и их порядок сохранены.
3. Холодная категория загружала 1 676 812 байт справочника перед поиском
   объявлений, включая ненужные ей подсказки мастера публикации.
   Отдельная browse-выборка сохраняет иерархию, RU/KK, поиск, иконки и порядок,
   но исключает title/description hints: 693 501 байт (−58,6%). Мастер публикации
   по-прежнему получает полные данные. Кэши раздельные, по одному значению,
   прежний TTL 5 минут, без переноса pending Promise между Worker requests.
4. `/admin/moderation` имел async default без принятой в проекте синхронной
   обёртки. Добавлена обёртка; после прежней проверки доступа независимые
   queue/rules читаются параллельно. Политики доступа не изменены.

Диагностика compiled Worker на Mac с реальным публичным Supabase:
прогретое объявление 1029–1057 → 612–648 мс, 6 → 2 запроса.
Это измерение Node + сеть, а НЕ трассировка CPU внутри Cloudflare.
Холодный справочник категории: 1959 → 1731 мс, по одному диагностическому
прогону; такого количества недостаточно для статистического вывода о latency.
Браузерный trace холодного перехода подтвердил ожидание RSC; route chunks
после ответа загружались за 36–42 мс. Prefetch и router application code не менялись.

## Безопасность чтений

Нет общего кэша объявлений, новых миграций, RLS, privileged RPC или ключей.
Проверены: реальный anonymous join и совпадение значений с прежней выборкой;
изолированный SQL с применёнными миграциями (draft, edit, archive, deleted,
expiry и прямой доступ к дочерним значениям); compiled workerd RU/KK, 404 после
удаления из публичной выдачи и 307 гостю на admin/moderation.
Для просрочки в одноразовой локальной БД используется существующая стратегия
fixtures: только при подготовке данных временно отключается publication trigger,
затем включается до RLS-проверок. В production ничего подобного не выполняется.

## Исторические ошибки тестов

- `all Master Catalog profiles and legacy IDs have an explicit semantic mapping`:
  ожидался semantic icon, фактически `max_user_weight` и другие новые поля
  попадали в generic fallback. Добавлены соответствия существующим иконкам.
- `every effective category schema is covered in RU and KK without label or value input`:
  `cars/generation_other` не наследовал семантику parent field; исправлено.
- `category metadata is current, generated only from stable catalog profiles`:
  обновлён результат существующего генератора attribute-icon-contexts.
- `all 1,358 Master Catalog contracts are localized, composable and filter-safe`:
  тест знал только `other-model`; текущая схема имеет и `other-generation`.
  Проверяется объявленный fallback, включая обязательность ручного ввода.
- `every root vertical has a representative leaf with domain-specific seller fields and buyer filters`:
  устаревшие `home-sofas.dimensions` и generic fitness `sport` заменены проверкой
  утверждённых width/height/depth и специализированных fitness fields.
- `async pages avoid duplicate vinext probes without losing dynamic HTTP errors`:
  исправлена фактическая обёртка admin/moderation, см. выше.
- `request-driven mutations do not schedule a duplicate replace plus refresh navigation`:
  scanner ошибочно считал альтернативные ветви owner controls двойным переходом.
  Теперь настоящий action исполняется с mock router для edit/archive/delete ×
  200/409/500: ровно одна навигация при успехе, ни одной при ошибке.
  Консервативная проверка остальных компонентов сохранена.

Тесты не удалены и не пропущены. Новый browse cache включён в прежний контракт
отсутствия cross-request I/O promises; число проверяемых кэшей выросло с 5 до 6.

## Витрина и память

Deadline остаётся 10 секунд. Тест подтверждает abort поддерживающего отмену
fetch/чтения body, single-flight, отсутствие автоматического retry и задержки
быстрого успеха. Production React fixture проверяет поздний ответ старого города,
смену scope, один timer, background recovery и работу остальных элементов.

80 реальных внутренних переходов в production Chromium, mobile viewport
390×844, guest, GC только в диагностическом браузере: после прогрева на шаге 16
heap 6,24 МБ, на шаге 80 — 6,65 МБ. На пяти одинаковых checkpoint-страницах:
513 DOM nodes, 225 listeners, 0 pending requests, 0 WebSockets.
Повторная диагностическая серия со snapshot 16/80 объяснила рост преимущественно
JIT InstructionStream/bytecode/feedback и browser ResourceTiming/DevTools data.
История ограничилась 50 entries. Проверены лимиты reference/showcase/route caches
и cleanup таймеров/подписок; оснований для исправления утечки не обнаружено.
Это ограниченная гостевая проверка, не доказательство отсутствия всех утечек.
Авторизованные chat polling/Realtime не выдаются за проверенные этим сценарием.

## Повторяемые измерения

Игнорируемые результаты: `artifacts/performance-followup`.

- `scripts/trace-listing-read.mjs before|after`: после безопасной загрузки
  gitignored public build env; `JEVU_TRACE_ARTIFACT` выбирает сохранённый build.
  Только allowlisted публичные GET; тела/ключи/идентификаторы не логируются.
- `scripts/measure-route-clicks.mjs before|after`: 3 изолированных Chromium
  profiles, 1440×1000, native network/CPU, guest. Click→полезное содержимое,
  отдельно первое фото; проверяет URL/scroll при возврате и фильтры/город.
- `scripts/measure-navigation-soak.mjs before|after`: 80 переходов, одинаковая
  search-страница каждые 16. `JEVU_HEAP_SNAPSHOTS=1` включает snapshots.
- `scripts/measure-web-navigation.mjs`: `JEVU_PERF_SCENARIO=listing` ограничивает
  прежний document-load сценарий, не смешивая его с внутренними переходами.

Новым диагностическим scripts можно передать `JEVU_PERF_LISTING_PATH` (публичный
`/listing/...`); иначе используют сохранённый исходный HTTP report. Кликовые
сценарии требуют прежнее публичное тестовое объявление в Петропавловске за
10 млн ₸; если оно изменилось, результаты несопоставимы и fixture надо выбрать
явно. Никаких сообщений/записей в production эти scripts не создают.

Выделенные production test account credentials в доступной конфигурации
не найдены. Реальные профиль с объявлениями/чат/отправка сообщения между
тестовыми аккаунтами BLOCKED; guest login shell не считается такой проверкой.

## Публикация

Production-env build, typecheck, lint, targeted/compiled/workerd/SQL gates.
Сохранены retirement SW/headers, immutable assets, auth/moderation/promotion
настройки фактического baseline. Никаких изменений published_at/expires_at,
VIP/X2/showcase/bump, dependencies, secrets или миграций.
После commit/push штатный deploy с keep_vars; затем проверяются version100%,
settings, hash client artifact, реальные клики/загрузка и доступный Safari.
При критической регрессии штатный rollback Worker к baseline version; изменения
БД отсутствуют. Итоговые production-метрики и version приводятся в отчёте релиза.
