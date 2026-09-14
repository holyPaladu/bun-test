# Переход сервисов на Elysia 2 beta

Статус: **предлагается поэтапная beta-миграция; реализация не начата**.

Дата проверки: **14 сентября 2026 года**.

Этот документ описывает переход `user-service` и `auth-service` с Elysia 1.4 на
Elysia 2 beta. Миграция не должна одновременно менять публичные HTTP-контракты,
JWT/JWKS, integration events или бизнес-логику сервисов.

После завершения перехода документ следует удалить, а сохраняемые правила
перенести в
[единый стандарт структуры сервисов](service-structure-standard.md), README
сервисов и [quality gates](../quality-gates.md).

## Решение

Переезжать последовательно:

1. зафиксировать текущие контракты тестами и измерить baseline;
2. перенести `user-service` как менее рискованный пилот;
3. выпустить его canary и проверить эксплуатационные показатели;
4. отдельно перенести `auth-service`, включая cron и outbox delivery;
5. рассматривать AOT только после функциональной миграции.

Не выполнять одномоментный перевод обоих production-сервисов и не совмещать
первый переход с внедрением AOT. Elysia 2 является полной переработкой
фреймворка и пока остаётся beta, в том числе из-за продолжающейся миграции
плагинов. Elysia 1.4 при этом переведена в режим преимущественно security fixes.

Источники:

- [Elysia 2.0: новый runtime, изменения API и статус beta](https://elysiajs.com/blog/elysia-20);
- [опубликованные версии Elysia](https://www.npmjs.com/package/elysia?activeTab=versions);
- [Elysia GitHub releases](https://github.com/elysiajs/elysia/releases).

## Текущее состояние проекта

Оба сервиса работают на Bun 1.4.0 и используют:

- `elysia` 1.4.30;
- `@elysiajs/openapi` 1.4.16;
- `@sinclair/typebox` 0.34.52;
- глобальный error handler;
- scoped `mapResponse` для success envelope;
- scoped `resolve` для auth context;
- группы бизнес-маршрутов под `/api`;
- request/response schemas через `t.*` и именованные `.model(...)`.

`auth-service` дополнительно использует `@elysia/cron` 1.4.2 и запускает и
останавливает outbox job через `onStart` и `onStop`.

В проекте нет WebSocket, macros, file schemas, `t.Composite`, `aot: false` и
schema-bearing guard, поэтому наиболее сложные несовместимости Elysia 2 к нему
не относятся.

## Зафиксированная матрица beta-зависимостей

Ниже приведена комбинация, на которой выполнен изолированный пробный перенос.
Перед рабочей миграцией версии нужно проверить повторно и зафиксировать точно в
`package.json` и lockfile. Не использовать плавающие `next` или `experimental` в
production-ветке.

| Пакет | Проверенная версия | Где нужен |
|---|---:|---|
| `elysia` | `2.0.0-beta.14` | оба сервиса |
| `@elysia/openapi` | `2.0.0-beta.4` | оба сервиса |
| `@elysia/cron` | `2.0.0-beta.1` | `auth-service` |
| `typebox` | `1.3.0` | оба сервиса |
| `exact-mirror` | `1.2.6` | оба сервиса |
| `croner` | `6.0.7` | `auth-service` |
| `@types/bun` | `1.4.1` | оба сервиса |

Актуальные prerelease-версии плагинов публикуются отдельно:

- [версии `@elysia/openapi`](https://www.npmjs.com/package/@elysia/openapi?activeTab=versions);
- [версии `@elysia/cron`](https://www.npmjs.com/package/@elysia/cron?activeTab=versions).

Прямая фиксация `exact-mirror` нужна, чтобы старый lockfile не оставил
несовместимую транзитивную версию. Фиксация `croner` предотвращает появление в
`auth-service` двух номинально несовместимых типов cron job.

## Обязательные изменения в коде

| Elysia 1.4 | Elysia 2 beta | Действие в проекте |
|---|---|---|
| `.get(path, handler, options)` | `.get(path, options, handler)` | Переставить аргументы всех route handlers |
| `onRequest`, `onError` | `request`, `error` | Обновить lifecycle plugins |
| `onStart`, `onStop` | `setup`, `cleanup` | Обновить управление outbox cron |
| scope `scoped` | scope `plugin` | Исправить success envelope и auth guard |
| `resolve` | `derive` | Перенести вычисление auth context |
| error hook с полем `code` | классы ошибок и `instanceof` | Переписать глобальный error handler |
| `response` в `mapResponse` | `responseValue` | Сохранить текущий success envelope |
| `ElysiaCustomStatusResponse` | `ElysiaStatus` | Обновить исключение для status responses |
| `@elysiajs/openapi` | `@elysia/openapi` | Заменить пакет и import |
| `typeof schema.static` | `Type.Static<typeof schema>` | Обновить TypeScript-типы DTO |

Порядок подключения scoped/plugin hooks должен остаться явным. Маршруты, которые
должны получить success envelope или auth context, регистрируются после
соответствующего plugin hook. Перенос не должен случайно расширить область
действия hook на health, metrics, JWKS или internal endpoints.

### Ошибки и HTTP-контракт

Elysia 2 по умолчанию возвращает framework errors в формате RFC 9457
`application/problem+json`. Проект должен продолжить возвращать собственный
JSON-контракт `{ error: ... }` и не менять status codes или структуру validation
details в рамках этой миграции.

Вместо проверки строкового `code` error handler должен использовать классы
`ValidationError`, `NotFound` и `ParseError`, экспортируемые Elysia, а также
собственные доменные классы через `instanceof`. Собственный класс
`NotFoundError` переименовывать нельзя: это доменная ошибка проекта, а не
framework `NotFound`.

До изменения handler нужно зафиксировать тестами:

- malformed JSON;
- неизвестный маршрут;
- validation error, включая отсутствующее обязательное поле;
- `401`, `403`, `409`, `422`, `429`, `500` и `503`, где они применимы;
- отсутствие success envelope вокруг error/status response;
- точный `Content-Type` и форму тела ответа.

### TypeBox 1

Переход с `@sinclair/typebox` 0.34 на `typebox` 1 является отдельной частью
миграции. Новый пакет ESM-only, меняет imports, получение статических типов и
формат validation errors. Официальное описание изменений:
[TypeBox 1.0 migration guide](https://github.com/sinclairzx81/typebox/blob/main/changelog/1.0.0-migration.md).

Основные преобразования:

```ts
import Type from 'typebox'
import Value from 'typebox/value'

export type Env = Type.Static<typeof envSchema>
```

`Value.Errors` больше не предоставляет старый `path`. Для обычных ошибок нужно
использовать `instancePath`; для отсутствующих обязательных полей путь требуется
восстановить из `params.requiredProperties`. Один и тот же adapter должен
использоваться в HTTP validation details и диагностике env, чтобы внешняя форма
ошибок не изменилась.

Legacy-маркер `Symbol.for('TypeBox.Kind')` в shared integration contract не
является блокером: обёртка `Type.Unsafe` с ним проходит проверку TypeBox 1. После
стабилизации beta его следует заменить нейтральной JSON Schema, но не смешивать
эту чистку с функциональной миграцией.

### OpenAPI

Нужно заменить `@elysiajs/openapi` на `@elysia/openapi`. Текущая Scalar theme
`dark` не принимается beta-типами; в пробном переносе использована `deepSpace`.

Регрессионный тест должен запросить `/swagger/json` и проверить как минимум:

- наличие всех публичных paths;
- request/response schemas;
- tags;
- security requirements защищённых routes;
- отсутствие internal endpoints, если они сейчас скрыты.

### Cron в auth-service

В Elysia 2 нельзя сохранять существующую зависимость от прямого `app.store`.
Cron job следует захватить через контролируемый state/plugin wrapper и явно
предоставить только операции, необходимые lifecycle и тестам.

Нужно проверить:

- job изначально paused;
- `setup` запускает delivery только после готовности зависимостей;
- `cleanup` дожидается остановки job;
- повторный старт не создаёт второй worker;
- overlap protection сохраняется;
- остановка HTTP-сервера не оставляет активный cron;
- readiness/logging не объявляют приложение готовым до выполнения setup.

## Ограничения codemod

Официальный codemod можно использовать только для предварительного просмотра:

```bash
bunx @elysia/codemod@latest --check --to 2 .
```

Источник: [`@elysia/codemod`](https://www.npmjs.com/package/@elysia/codemod).

На текущем коде пробный запуск:

- правильно обнаружил перестановку route arguments, lifecycle names, scope и
  переименование OpenAPI package;
- ошибочно переименовал доменный `NotFoundError`;
- предложил `elysia: 2.0.0@experimental` вместо проверенной beta;
- не завершил преобразование `resolve` в `derive`;
- не исправил TypeBox imports, `.static`, validation paths, Scalar theme и cron;
- оставил несовместимые поля в error handler и `mapResponse`.

Поэтому результат codemod нельзя применять или коммитить без построчного review.
Предпочтительный порядок: `--check`, сохранение diff, ручные изменения небольшими
коммитами, затем typecheck и тесты после каждого смыслового блока.

## План выполнения

### Этап 0. Защитить контракты и измерить baseline

1. Добавить точные тесты success/error envelopes и validation details.
2. Зафиксировать OpenAPI paths, tags и security requirements.
3. Проверить JWT/JWKS и integration event contracts между сервисами.
4. Выполнить все PostgreSQL-тесты с отдельными `_test` databases.
5. Измерить startup до readiness, RSS/peak memory, p95/p99, build time, размер
   binary/image и текущий уровень HTTP errors.
6. Сохранить lockfiles Elysia 1 как простой путь отката.

### Этап 1. Пилот на user-service

1. Создать отдельную migration branch.
2. Запустить codemod только в режиме `--check`.
3. Точно зафиксировать beta-зависимости и пересоздать lockfile.
4. Перенести route signatures, lifecycle, scope и `resolve`/`derive`.
5. Перенести TypeBox, env validation и JWT verifier.
6. Адаптировать error handler, success envelope и OpenAPI.
7. Запустить проверки из [quality gates](../quality-gates.md), включая
   PostgreSQL и production build.
8. Собрать Docker image и выполнить service smoke-test.

Gate этапа: публичные контракты не изменились, все тесты реально выполнены, а не
пропущены, и measured показатели укладываются в согласованные бюджеты.

### Этап 2. Canary user-service

1. Развернуть только `user-service` на Elysia 2.
2. Наблюдать startup/readiness, RSS, latency и долю `4xx`/`5xx`.
3. Проверить авторизованный профиль и доставку `auth.account-created.v1`.
4. При регрессии откатить только `user-service` на сохранённый Elysia 1 build.

Продолжать переход только после согласованного периода стабильной работы.

### Этап 3. Auth-service

1. Повторить общую миграцию Elysia, TypeBox и OpenAPI.
2. Перенести cron wrapper и lifecycle на `setup`/`cleanup`.
3. Проверить login, refresh, logout, sessions, JWKS и degradation внешних
   зависимостей.
4. Выполнить unit, HTTP e2e и PostgreSQL suites.
5. Проверить outbox delivery, retry/DLQ, overlap, метрики и отсутствие дублей.
6. Собрать Docker image и выполнить общую вертикаль из двух сервисов.

Gate этапа: ни один auth/event контракт не изменён, delivery не теряет и не
дублирует бизнес-эффект, а auth-service можно откатить независимо от
`user-service`.

### Этап 4. Последовательный production rollout

1. Выпустить `auth-service` canary.
2. Сопоставить показатели с baseline Elysia 1.
3. Следить за `401`, `422`, `500`, `503`, pending outbox, retry/DLQ и duplicate
   delivery.
4. Зафиксировать точную проверенную матрицу prerelease-зависимостей.
5. Обновлять beta только отдельными regression PR, не автоматически внутри
   несвязанных изменений.

### Этап 5. Отдельная оценка AOT

AOT Elysia 2 выполняет dry-run приложения при сборке. Сейчас создание server app
читает обязательный env, создаёт SQL/JWT зависимости и cron. Поэтому сначала
нужно отделить описание маршрутов от runtime side effects:

1. экспортировать app factory/build manifest;
2. исключить реальную БД, secrets, network и cron во время manifest capture;
3. добавить отдельный AOT build script;
4. сравнить build time, peak memory, startup и размер binary/image с baseline;
5. оставить AOT только при измеримой выгоде, оправдывающей усложнение сборки.

## Проверенный пробный перенос

Миграция была воспроизведена в изолированной временной копии репозитория без
изменения рабочих файлов.

| Проверка | Результат |
|---|---|
| `user-service` typecheck | прошёл |
| `user-service` tests без PostgreSQL | 21 прошло, 4 пропущено |
| `user-service` production build | прошёл |
| `auth-service` typecheck | прошёл |
| `auth-service` unit | 89 прошло |
| `auth-service` HTTP e2e | 9 прошло |
| `auth-service` production build | прошёл |
| auth OpenAPI paths/tags/security | проверены |
| PostgreSQL suites после миграции | не проверены: тестовая БД не была доступна |
| Docker smoke после миграции | не выполнялся |

Без AOT размер compiled binary уменьшился только примерно на 64–68 KiB, то есть
менее чем на 0,1%. Бинарник в текущем формате в основном состоит из встроенного
Bun runtime, поэтому маркетинговое уменьшение JavaScript bundle нельзя считать
выигрышем проекта без отдельного измерения AOT.

Официально Elysia 2 ориентируется прежде всего на уменьшение memory usage и
ускорение startup; значительного роста throughput авторы не обещают. Эти
преимущества нужно подтвердить проектными измерениями, а не принимать как
готовый результат.

## Плюсы перехода

- переход на основную развиваемую ветку Elysia;
- потенциально меньшие startup time и memory usage;
- возможность вынести schema compilation в AOT build;
- более явные lifecycle names и scopes;
- типизированная обработка ошибок через классы;
- миграция уже подтверждена typecheck, unit/e2e tests и build в изолированной
  копии;
- небольшой и относительно простой Elysia surface в текущих сервисах.

## Минусы и риски

- полная переработка фреймворка всё ещё находится в beta;
- OpenAPI и особенно cron plugin также beta и могут менять API;
- TypeBox 1 требует самостоятельной миграции и contract tests;
- codemod даёт как неполные, так и семантически неверные изменения;
- меняются default error format, validation errors, scopes и lifecycle timing;
- без AOT размер текущего compiled binary почти не изменяется;
- AOT пока не совместим с текущей runtime-инициализацией без рефакторинга;
- beta-обновления потребуют точных pins, регулярного regression run и готового
  rollback;
- ожидаемая выгода относится к startup/memory, а не к заметному росту
  throughput.

## Критерий завершения миграции

Переход считается завершённым, когда:

- оба сервиса используют одну зафиксированную совместимую beta/stable-матрицу;
- typecheck, unit, HTTP e2e, PostgreSQL suites, builds и Docker smoke зелёные;
- HTTP, OpenAPI, JWT/JWKS и integration event contracts не изменились;
- cron/outbox сохраняет delivery semantics и корректно останавливается;
- canary не показал неприемлемой регрессии startup, memory, latency или errors;
- для каждого сервиса проверен независимый rollback;
- README сервисов, стандарт структуры и quality gates отражают итоговое
  состояние;
- этот временный migration plan удалён.
