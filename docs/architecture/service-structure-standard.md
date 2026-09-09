# Единый стандарт структуры сервисов

Статус: действующее соглашение для нового и изменяемого кода. Его цель — чтобы
сервис читался одинаково, а не чтобы в нём были все известные архитектурные
паттерны.

За основу взят способ сборки `auth-service`: `container.ts` создаёт общую
инфраструктуру, `*.module.ts` собирает feature, `app.ts` подключает HTTP,
`server.ts` управляет процессом, а фоновое расписание подключается как
Elysia-плагин. Этот документ — единственный источник правил для структуры
модулей, зависимостей и имён. Правила доставки и версии межсервисных
сообщений находятся в
[стандарте integration events](integration-events-standard.md).

## Главный принцип

**Repository — это SQL-адаптер. Port — это контракт, который принимает
потребляющая функция.** Это разные роли, но port не является обязательной папкой
или слоем.

Например, `get-my-profile.ts` зависит только от операции `findById`. Тип этой
операции объявляется рядом с use case; это и есть его port. SQL-реализация лежит
в `repo/user-profile.repository.ts` и подключается только при сборке модуля.

```ts
// modules/user-profile/use-cases/get-my-profile.ts
import type { UserProfile } from '../entities/user-profile.entity'
import { NotFoundError } from '@/shared/errors/app-error'

type GetMyProfilePort = {
  findById(userId: string): Promise<UserProfile | null>
}

type GetMyProfileDeps = {
  userProfiles: GetMyProfilePort
}

export const createGetMyProfileUseCase = ({ userProfiles }: GetMyProfileDeps) =>
  async ({ userId }: { userId: string }): Promise<UserProfile> => {
    const profile = await userProfiles.findById(userId)
    if (!profile) throw new NotFoundError('User profile')
    return profile
  }
```

Здесь нет импорта из `repo/`, SQL-типа или общего `UserProfilePort`. Объект,
возвращённый SQL-repository, подходит структурно. Fake в unit-тесте также
подходит структурно. Так контракт остаётся размером с потребность сценария, а
не растёт до искусственного CRUD-интерфейса всего модуля.

Название `*Port` допустимо для такого локального типа, когда оно делает роль
понятнее. `*Deps` уже описывает тот же контракт и не требует дополнительного
имени. Важна граница зависимости, а не слово `Port` в каждом файле.

## Зачем нужен port, если он локальный

Он нужен ровно для одного: use case должен описывать, **что ему необходимо**,
а не **как это сделано**. Без локального контракта сценарий импортирует SQL-file
или создаёт его сам. Тогда смена SQL-адаптера, добавление кэша либо простой fake
в тесте заставляют менять прикладной код. С локальным контрактом module делает
связывание один раз, а use case знает только `findById`.

Это не отдельный архитектурный слой и не полный hexagonal-шаблон. В TypeScript
его часто достаточно выразить типом `Deps` или функцией вроде
`type SendEvent = (...) => Promise<void>`. Если функцию не нужно собирать из
заменяемых зависимостей и тестировать отдельно, дополнительный port не создают.

## Когда выделять отдельный контракт

По умолчанию контракт живёт рядом с единственным потребителем: use case,
worker, handler или route. Отдельный файл `<name>.port.ts` создаётся только,
когда выполняется хотя бы одно условие:

- один и тот же контракт нужен нескольким независимым потребителям;
- контракт представляет границу сервиса: Unit of Work, отправку сообщения,
  object storage, платежи, внешний HTTP-клиент;
- у контракта есть собственная важная семантика, которую нужно документировать
  и проверять отдельно.

Такой файл кладётся рядом с главными потребителями, а не в обязательный общий
`ports/`-каталог. Например, общий контракт исходящей доставки при необходимости
находится рядом с потребляющими сценариями в `outgoing/use-cases/`;
контракт Unit of Work — рядом с его реализацией в
`shared/database/`. Если контракт опять стал нужен одному месту, отдельный файл
не сохраняют ради симметрии.

Межсервисный event contract — другой случай. Его используют разные процессы,
поэтому runtime-schema, TypeScript-тип и пример остаются в
`packages/integration-event-contracts`. Это не замена локальному port use case:
событие описывает сообщение между сервисами, port — зависимость конкретной
функции внутри сервиса.

## Что обязательно соблюдать

| Правило | Зачем |
|---|---|
| `server.ts` создаёт app и обрабатывает сигналы процесса | Импорт не запускает процесс; остановка app активирует cleanup плагинов |
| I/O-bound фоновая работа запускается cron-адаптером в процессе сервиса | Для асинхронных SQL/HTTP-операций не создаётся лишняя граница потоков и IPC |
| Расписание задаёт `@elysia/cron`, а не собственные `start`/`stop` или таймеры | Lifecycle задачи принадлежит Elysia-плагину и подключается через `.use(...)` |
| `container.ts` создаёт только общую инфраструктуру | Feature-зависимости не расползаются по приложению |
| `*.module.ts` собирает feature из SQL-адаптеров, use cases и routes | Место связывания зависимостей видно по имени модуля |
| Публичный HTTP-модуль возвращает готовый Elysia-плагин | В `app.ts` он подключается одинаково: `.use(create<Name>Module(container))` |
| Route валидирует и преобразует HTTP, use case выполняет бизнес-правило | HTTP и бизнес-код не зависят друг от друга |
| Use case получает минимальные зависимости типами рядом с собой | SQL и конкретные адаптеры не проникают в прикладной код |
| `repo/` содержит только реализацию хранения | SQL, DB row, mapper и mapping ошибок БД не смешиваются с use case или entity |
| Связанные изменения выполняются через Unit of Work | Один transaction client обслуживает все операции атомарного сценария |
| События создаются в бизнес-транзакции, доставляются после commit | Обеспечиваются outbox, inbox и безопасный повтор доставки |

Остальные решения принимаются по необходимости. В частности, не обязательны
общий `ports/`, `services/`-слой, generic/base repository, `index.ts` для
сборки, классы вместо функций или отдельный интерфейс для каждого объекта.
Новый слой появляется только если у него есть конкретный потребитель и роль,
которую нельзя яснее выразить в существующем файле.

## Распределение файлов

```text
src/
├── server.ts
├── container.ts
├── app.ts
├── modules/
│   └── user-profile/
│       ├── user-profile.module.ts
│       ├── entities/
│       │   └── user-profile.entity.ts
│       ├── repo/
│       │   ├── user-profile.repository.ts
│       │   └── user-profile.mapper.ts
│       ├── use-cases/
│       │   ├── create-user-profile.ts
│       │   ├── get-my-profile.ts
│       │   └── update-my-profile.ts
│       ├── http/
│       │   ├── user-profile.routes.ts
│       │   └── user-profile.schemas.ts
│       └── events/
│           └── on-account-created.ts
└── shared/
    └── database/
        ├── client.ts
        └── user-unit-of-work.ts
```

Папки создаются только при наличии файлов этой роли. HTTP-schema находится в
`http/`; DB row и `row -> entity` mapper — рядом с SQL в `repo/`; entity не
содержит типы строк PostgreSQL. `index.ts` не используется как composition root:
импорт явно указывает `@/modules/<name>/<name>.module`.

## Подключение модулей

### HTTP feature

`create<Name>Module` возвращает готовый Elysia-плагин, как
`createAuthModule`. `app.ts` подключает его напрямую:

```ts
return new Elysia()
  .use(createErrorHandler(container.logger))
  .use(createAccessLog(container.logger))
  .use(openapiPlugin)
  .use(healthRoute(container.sql))
  .group('/api', app => app
    .use(successEnvelope)
    .use(createUserProfileModule(container))
  )
```

`create<Name>Module` принимает минимальный `Pick<Container, ...>`, создаёт SQL
repositories, собирает use cases и передаёт их в `create<Name>Routes`. Route не
создаёт use case или repository и не принимает весь container.

```ts
export const createUserProfileModule = (
  container: Pick<Container, 'sql' | 'jwtVerifier'>,
) => {
  const userProfiles = createUserProfileRepository(container.sql)

  return createUserProfileRoutes({
    jwtVerifier: container.jwtVerifier,
    getMyProfile: createGetMyProfileUseCase({ userProfiles }),
    updateMyProfile: createUpdateMyProfileUseCase({ userProfiles }),
  })
}
```

Не возвращать `{ routes }`: публичный feature имеет одну естественную форму —
плагин. Обработчики входящих событий остаются функциями бизнес-модуля и явно
передаются в integration-events composition root.

### Модуль без HTTP и фоновые задачи

Модуль без собственных routes возвращает именованные возможности, как
`createSessionModule`: `issueTokens`, `rotateTokens` и другие. Его подключает
владеющий feature, а не `app.ts`.

`integration-events` возвращает именованные возможности, потому что у него
несколько разных точек подключения:

- `incomingRoutes` — приём входящих сообщений;
- `metricsRoutes` — технические метрики;
- `outboxCron` — готовый Elysia-плагин с cron-расписанием;
- `replayDeadLettered` — ручной replay, когда сервис владеет outbox.

Экспортируются только реализованные возможности. `server.ts` создаёт модуль один
раз и передаёт его в `createApp`. `app.ts` подключает `outboxCron` так же, как
любой другой плагин:

```ts
return new Elysia()
  .use(integrationEvents.outboxCron)
  .use(integrationEvents.metricsRoutes)
  // ...
```

#### Cron и publisher

Доставка состоит из асинхронных SQL- и HTTP-операций, поэтому выполняется в
процессе сервиса. Bun Worker здесь не ускоряет работу, зато требует отдельного
entrypoint, повторной сборки зависимостей и IPC для результатов и метрик.
Файлы объединяются по возможности, затем по роли внутри неё:

```text
modules/integration-events/outgoing/
├── outgoing.module.ts
├── use-cases/
│   ├── deliver-event.ts
│   └── deliver-pending-events.ts
├── errors/
│   └── event-delivery.error.ts
├── helpers/
│   ├── retry-policy.ts
│   └── error-message.ts
├── cron/
│   └── outbox.cron.ts
├── types/
│   └── integration-event.type.ts
├── entities/
│   └── outbox.entity.ts
├── repo/
│   ├── outbox.repository.ts
│   └── outbox.mapper.ts
├── http/
│   └── send-event.http.ts
└── metrics/
    └── delivery.metrics.ts
```

`outgoing.module.ts` собирает repository, metrics, sender, одну попытку,
batch-сценарий и cron; корневой `integration-events.module.ts` связывает его
возможности с metrics route. `errors/` владеет классом и классификацией ошибок
доставки, `helpers/` — чистыми retry-вычислениями и форматированием ошибок.
Параллельные `helpers/` и `utils/` для одной роли внутри outgoing не создаются.
Общий union событий находится в `types/`, модель claim — в `entities/`,
PostgreSQL row и mapper — в `repo/`; локальные `Deps` остаются у потребителя.

Cron — адаптер запуска сценария по расписанию, поэтому лежит в `cron/` своего
модуля. Принадлежность Elysia lifecycle не делает его HTTP-адаптером.
Каждая новая задача получает `cron/<purpose>.cron.ts`, уникальные имена плагина
и job, своё расписание и lifecycle. При нескольких задачах outgoing module
собирает их через `.use(...)` в один `outgoingCron`, который app подключает
один раз; пока задача одна, используется `outboxCron`. `protect` действует
на отдельную задачу и не синхронизирует разные jobs. Задачи другой feature
остаются в её собственном `cron/`, а не в общей папке расписаний сервиса.

Расписание описывается плагином
[`@elysia/cron`](https://elysiajs.com/plugins/cron). Это актуальное имя
официального пакета; имя `@elysiajs/cron` не используется. Пакет
добавляется в runtime dependencies командой `bun add @elysia/cron`. В
шестипольном pattern первое поле — секунды. Cron callback возвращает Promise
самого publisher-а:

```ts
return new Elysia({ name: 'outbox-cron' })
  .use(cron({
    name: 'outboxDelivery',
    pattern: options.pattern,
    paused: true,
    protect: true,
    catch: error => logger.error('Outbox delivery failed', { error }),
    run: options.deliverPendingEvents,
  }))
  .onStart(({ store }) => store.cron.outboxDelivery.resume())
  .onStop(({ store }) => store.cron.outboxDelivery.stop())
```

`paused: true` не даёт фабрике app запустить расписание. Elysia активирует cron
в `onStart`, а `onStop` останавливает job. `protect: true` запрещает новый
cron-run, пока не завершён предыдущий. Конкретные pattern и timezone приходят
из типизированной config, а не читаются внутри плагина.

Сценарий `use-cases/deliver-pending-events.ts` остаётся обычной async-функцией
без зависимости от Elysia и cron. Он резервирует batch и вызывает переданную
функцию `deliverEvent`. Соседний `use-cases/deliver-event.ts` отвечает за одну
попытку и фиксацию её результата. Фабрики называются
`createDeliverPendingEventsUseCase` и `createDeliverEventUseCase`. Unit-тесты
подставляют ports напрямую; тест cron-адаптера проверяет запуск и cleanup при
`app.stop()`.

Служебные routes подключаются до `/api`: error handler, access log, OpenAPI,
health, JWKS, metrics, `/internal/events`, затем бизнес-routes с
`successEnvelope`. Это важно для scoped-хука в текущем `success-envelope.ts`.

## Repository и локальные ports

### SQL-repository

`repo/<name>.repository.ts` — единственное место SQL-доступа feature. Он
получает `DatabaseClient`, выполняет SQL, преобразует известные constraint
errors в application errors и возвращает entity или значение операции. Фабрика
называется `create<Name>Repository`:

```ts
// modules/user-profile/repo/user-profile.repository.ts
export const createUserProfileRepository = (sql: DatabaseClient) => ({
  findById: async (userId: string): Promise<UserProfile | null> => {
    const [row] = await sql<UserProfileRow[]>`
      SELECT user_id, display_name, avatar_url, locale, timezone, created_at, updated_at
      FROM user_profiles
      WHERE user_id = ${userId}
    `
    return row ? toUserProfile(row) : null
  },
})
```

При одном PostgreSQL-хранилище не нужны пары
`auth.repository.ts`/`postgres-auth.repository.ts`, имена
`createPostgresAuthRepository` и `PostgresAuthRepository`. `repo` уже означает
конкретную SQL-реализацию. Если позднее появится второй способ хранения, он
получает свой очевидный адаптер, например `repo/cached-user-profile.repository.ts`.
Это не повод заранее вводить абстракцию.

`find...` возвращает entity или `null`. Условный update возвращает `boolean` и
в документации метода объясняется, что означает `false`. PATCH различает
отсутствующее поле и `null`. Общий CRUD/base repository не используется:
операции появляются из потребностей сценариев.

### Локальный port сценария

Use case импортирует entity и application errors, но не импортирует файл из
`repo/`. Он принимает только нужную форму объекта. Это применимо не только к
БД: `sendEvent`, `hashPassword`, `verifyToken`, `clock` и внешний HTTP-клиент
также передаются как функции или маленькие объекты рядом с потребителем.

```ts
// modules/integration-events/outgoing/use-cases/deliver-pending-events.ts
type DeliverPendingEventsDeps = {
  outbox: {
    claimDue(input: {
      limit: number
      leaseMs: number
      leaseOwner: string
    }): Promise<ClaimedOutboxEvent[]>
  }
  deliverEvent(event: ClaimedOutboxEvent): Promise<void>
  options: { batchSize: number; leaseMs: number; publisherId: string }
}
```

Здесь `outbox.claimDue` и `deliverEvent` — ports batch-сценария. Одна попытка
объявляет собственный `DeliverEventDeps` с `markPublished`, `markFailed`,
`markDeadLettered`, `sendEvent`, metrics, logger и retry options. Module
связывает эти контракты с repository и HTTP sender. Batch не получает методы
записи outcome, а одна попытка не получает claim и batch options. Контракты
не обязаны называться repository и не требуют папки `ports/`.

Если несколько use cases используют одинаковый полный набор операций, сначала
проверяется, не является ли это следствием слишком широкого repository. Если
контракт действительно общий, его выделяют рядом с use cases, например
`use-cases/user-profile.port.ts`, и дают имя по роли потребителя, а не по
технологии. Не делать такой файл для одного `findById`.

## Use cases и транзакции

Один сценарий — один файл `use-cases/<action>.ts`. Фабрика называется
`create<Action>UseCase(deps)` и возвращает рабочую функцию. В том же файле
находятся `Input`, результат и минимальный тип зависимостей. HTTP Request,
HTTP-schema, env и SQL client в use case не передаются.

Use case выражает прикладную цель модуля: это может быть регистрация account,
приём integration event или доставка outbox. Техническому сценарию не
обязательно менять бизнес-aggregate, чтобы находиться в `use-cases/`.

Unit of Work — единая транзакционная граница сервиса. В текущем масштабе его
контракт и SQL-реализация могут лежать вместе в
`shared/database/<service>-unit-of-work.ts`: это не repository и файл описывает
одну неразделимую ответственность. Callback получает объекты операций текущей
транзакции. Для ясности их поля называют по назначению:

```ts
await unitOfWork.run(async ({ authAccounts, outboxEvents }) => {
  const account = await authAccounts.insert({ email, passwordHash })
  await outboxEvents.append(createAccountCreatedEvent(account.id), account.id)
})
```

SQL-реализация Unit of Work создаёт все repositories с одним transaction client.
Handler входящего события использует полученные операции и не открывает вторую
независимую транзакцию. Для регистрации это атомарная запись account + outbox;
для inbox — reservation + бизнес-изменение. HTTP-доставка из outbox начинается
только после commit.

## Contracts событий и HTTP

HTTP route — входной адаптер. Он проверяет schema и credentials, переводит body
в input use case и сопоставляет application error code со статусом ответа.
Бизнес-сценарий не получает Elysia context или `Request`.

Event — внешний контракт. Schema, выведенный TypeScript-тип и пример находятся
в `packages/integration-event-contracts`; сервисы не импортируют исходники друг
друга. Producer создаёт event в бизнес-транзакции и сохраняет его в outbox.
Consumer проверяет envelope, резервирует `eventId` в inbox и вызывает handler
в той же транзакции. Handler переводит payload в input use case.

## Проверка изменения

- Module подключён по своей роли: HTTP-plugin напрямую, технический runtime —
  именованным объектом, cron-задача — готовым Elysia-плагином.
- I/O-bound фоновая задача использует `@elysia/cron` с `protect: true` и
  останавливает расписание вместе с app; отдельный Worker добавляется только для
  действительно CPU-bound работы.
- Use case и handler не импортируют `DatabaseClient` или конкретный файл
  `repo/`; его зависимости описаны рядом с потребляющей функцией.
- SQL, DB row, mapper и DB error mapping находятся в `repo/`; в проекте нет
  пары общего интерфейса repository и `postgres-*` реализации без второй БД.
- Тест use case подставляет обычный fake нужной формы. Тест route проверяет
  HTTP-границу. Для изменённого transaction-кода PostgreSQL-тесты проверяют
  rollback, конкуренцию и повторную доставку.
- В изменённом сервисе проходят `bun run typecheck` и `bun test`. SQL-проверки
  запускаются через `TEST_DATABASE_URL=<url> bun run test:postgres` с базой,
  имя которой заканчивается на `_test`.
