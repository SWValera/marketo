# Marketo Master Catalog — semantic validation

Source of truth валидатора: `scripts/validate-master-catalog.mjs`.

Запуск:

```bash
npm run validate:catalog
```

Тот же контракт включён в `tests/master-catalog-semantic.test.mjs`, поэтому
обычный `npm test` не может обойти semantic gate.

## Что проверяется

- дерево не содержит orphan-узлов, циклов, повторных slug или неверных
  parent/root/path relations;
- RU/KK заполнены у категорий, атрибутов, единиц и options;
- sibling categories не являются смысловыми дублями после нормализации;
- обязательные verticals и benchmark-направления существуют;
- широкие группы не заканчиваются бессмысленным leaf, а популярные задачи
  завершаются конкретной категорией;
- каждая категория получает schema profile, а каждый leaf — seller attributes
  и хотя бы один реально filterable buyer field;
- `select`/`multiselect` имеют непустые уникальные stable values;
- зависимости ссылаются на существующий parent option;
- каждый dependent model dictionary имеет `other-model` и отдельное manual
  value, показываемое только при выборе fallback;
- taxonomy не спрашивает повторно тип кузова, тип устройства или тип услуги;
- seller `is_filterable` metadata фактически используется серверным catalog
  search RPC, включая exact/multiselect/boolean/range/date/text-search modes;
- vehicle models имеют явный body scope; допустимые multi-body variants
  перечислены явно;
- smartphone, tablet и e-reader dictionaries изолированы;
- быстро меняющиеся device dictionaries имеют source URL, `verifiedAt` и
  ограничение допустимого возраста справочника.
- все 1 356 категорий имеют explicit contextual `searchPlaceholder`,
  `titlePlaceholder` и `descriptionHint` на RU/KK; каждое поле сверяется с
  единым semantic source-of-truth и содержит название текущей категории;
- metadata моделей дополнительно сверяется с допустимым vehicle/device scope,
  а job/service/device regressions проверяются отдельно.

## Обязательные regressions

| Assertion | Ожидаемый результат |
|---|---|
| Toyota Camry в `cars-sedan` | valid |
| Toyota Camry в `cars-suv` | invalid |
| BMW X5 в `cars-suv` | valid |
| Реальные multi-body модели | присутствуют только в явно разрешённых кузовах |
| iPhone в tablet/e-reader dictionary | отсутствует |
| iPad в smartphone dictionary | отсутствует |
| Apple smartphone line | содержит актуальные поколения, включая iPhone 17/17e/Air/Pro/Pro Max |
| Ремонт кондиционеров | доступен по полному пятиуровневому пути |
| Широкие service groups | имеют минимум два содержательных потомка |
| SUV metadata | не содержит Camry |
| Маникюр / юридические услуги | не содержат контекст ремонта кондиционеров |
| Вакансии | все helper-поля используют job context на RU/KK |
| Смартфоны / планшеты | helper-поля используют правильный device context |

## Зафиксированный результат

На 2026-09-04:

```text
Master Catalog semantic validation passed:
1356 categories, 1137 leaves, 516426 assertions,
8136 contextual RU/KK metadata assignments,
14310 seller-attribute assignments, 84490 option assignments.
```

Это подтверждает semantic source-of-truth в памяти приложения. SQL migration,
seed и чистая PostgreSQL-совместимая база проверяются отдельными migration и
security tests; их итог нельзя подменять этим результатом.
