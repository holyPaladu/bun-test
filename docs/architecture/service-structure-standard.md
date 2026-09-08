# Единый стандарт структуры сервисов

Статус: целевое соглашение для новых изменений и выравнивания существующего
кода. Добавление этого документа само по себе не означает, что сервисы уже
приведены к стандарту.

Основа — сборка `auth-service`: `container.ts` создаёт общую инфраструктуру,
`*.module.ts` собирает зависимости модуля, `app.ts` подключает HTTP,
`server.ts` управляет процессом. Контракт зависимости называется **port**.
**Repository** — конкретная реализация доступа к БД: SQL, преобразование строк
и обработка ошибок хранилища.

Этот документ — источник правил структуры, подключения модулей и именования
для всех сервисов. При расхождении со старыми примерами в планах применять его.
Гарантии доставки и правила версионирования событий описаны отдельно в
[стандарте integration events](integration-events-standard.md).

## Распределение ответственности

| Место | Ответственность |
|---|---|
| `server.ts` | Создать container и компоненты с жизненным циклом, собрать app, открыть порт, запустить worker; при остановке дождаться worker, остановить HTTP, закрыть БД |
| `container.ts` | Создать общие runtime-зависимости: env, SQL client, logger, JWT/crypto, Unit of Work, registry метрик |
| `app.ts` | Подключить общие HTTP-плагины, служебные routes и HTTP-модули |
| `modules/<name>/<name>.module.ts` | Собрать repositories, адаптеры, use cases и публичные возможности конкретного модуля |
| `http/` | Валидировать HTTP-вход, выполнить guard, преобразовать запрос в input сценария и вернуть ответ |
| `use-cases/` | Выполнить бизнес-сценарий через переданные ports и функции |
| `ports/` | Описать контракты зависимостей независимо от их реализации |
| `repo/` | Выполнить SQL, преобразовать DB row в entity, обработать известные ошибки БД |
| `entities/` | Описать доменные данные и правила без HTTP- и SQL-типов |
| `events/` | Создать исходящий бизнес-факт или связать входящее событие со сценарием модуля |

Feature-repositories и use cases создаются в `*.module.ts`, транзакционные
repositories — внутри реализации Unit of Work. В `container.ts` не добавляются
`authRepository`, `userProfileRepository` или отдельные бизнес-сценарии.

Импорт файла и вызов `createApp` не запускают HTTP listener, worker или таймеры.
Общий runtime-компонент создаётся один раз и передаётся всем его потребителям.
Как в `auth-service/server.ts`, один экземпляр integration-events используется
и для HTTP-метрик, и для запуска worker.

## Структура модуля

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
│       ├── ports/
│       │   └── user-profile.port.ts
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
    ├── ports/
    │   └── user-unit-of-work.port.ts
    └── database/
        ├── client.ts
        └── user-unit-of-work.ts
```

Создавать только нужные папки. HTTP-схемы находятся рядом с routes в `http/`.
DB row и mapper находятся в `repo/`, а не в `entities/`.
Контракт принадлежит использующему его модулю; общие для сервиса контракты,
например Unit of Work, находятся в `shared/ports/`.

`index.ts` не служит точкой сборки модуля. Импорты сборки явно указывают
`@/modules/<name>/<name>.module`. Между сервисами не импортируются исходники
модулей или repositories; общие межсервисные схемы берутся из
`packages/integration-event-contracts`.

## Подключение модулей по образцу auth-service

### HTTP-модуль

Фабрика `create<Name>Module` возвращает готовый Elysia-плагин, как текущая
`createAuthModule`. В `app.ts` он подключается через
`.use(create<Name>Module(container))`. Обёртку `{ routes }` для бизнес-модуля
не создавать.

Фабрика принимает минимальный `Pick<Container, ...>`. Если нужны возможности
другого модуля, они передаются отдельным типизированным объектом зависимостей.
SQL и env из container используются при сборке; use cases получают только
необходимые ports, функции и конкретные значения настроек.

Пример целевой сборки профиля:

```ts
import type { Container } from '@/container'
import { createUserProfileRoutes } from './http/user-profile.routes'
import { createUserProfileRepository } from './repo/user-profile.repository'
import { createGetMyProfileUseCase } from './use-cases/get-my-profile'
import { createUpdateMyProfileUseCase } from './use-cases/update-my-profile'

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

`create<Name>Routes(deps)` описывает HTTP и получает готовые сценарии. Он не
создаёт repositories или use cases и не принимает весь container.

### Модуль без собственного HTTP и технический runtime

Как текущий `createSessionModule`, модуль без самостоятельного HTTP возвращает
именованные функции (`issueTokens`, `rotateTokens` и другие). Его подключает
владеющий им модуль через эти функции; `app.ts` не собирает session use cases.
Не создавать пустой Elysia-плагин только ради одинакового типа результата.

`integration-events` собирает технические возможности. Для этой роли в обоих
сервисах используется именованный объект по образцу auth:

- `incomingRoutes` — HTTP-приём событий, если сервис является consumer;
- `metricsRoutes` — HTTP-метрики, если они есть у модуля;
- `outboxWorker` — явные `start`/`stop`, если сервис отправляет события;
- `replayDeadLettered` — операция replay, если есть outbox.

Экспортировать только реализованные возможности. Имя `.routes` у одного
integration-events и `.metricsRoutes` у другого заменяется явными именами
назначения. Публичные HTTP-модули всегда возвращают плагин напрямую;
объект технического runtime не является альтернативной формой HTTP-модуля.

Если HTTP-модуль также обрабатывает события, его `*.module.ts` отдельно
экспортирует `create<Name>EventHandlers`. Она собирает обработчики модуля;
результат `create<Name>Module` при этом остаётся HTTP-плагином. Реестр
передаётся в integration-events при сборке, например:

```ts
// Фрагмент целевого user-service/app.ts.
// Фабрики импортируются из соответствующих *.module.ts.
const integrationEvents = createIntegrationEventsModule(container, {
  eventHandlers: createUserProfileEventHandlers(),
})

return new Elysia()
  .use(createErrorHandler(container.logger))
  .use(createAccessLog(container.logger))
  .use(openapiPlugin)
  .use(healthRoute(container.sql))
  .use(integrationEvents.incomingRoutes)
  .group('/api', app => app
    .use(successEnvelope)
    .use(createUserProfileModule(container))
  )
```

Это целевой пример: текущий user-service ещё использует `{ routes,
integrationEventHandlers }`. Обработчики получают ports текущей
inbox-транзакции при вызове, а не захватывают repositories общего SQL client
при сборке реестра. Технический приём событий не импортирует профильные
use cases напрямую.

Общий порядок HTTP-подключения повторяет `auth-service/app.ts`: error handler,
access log, OpenAPI, служебные routes, затем `/api` с `successEnvelope` и
бизнес-модулями. Health, JWKS, metrics и `/internal/events` подключаются до
`/api`: это учитывает поведение scoped-хука в текущем `success-envelope.ts`.

## Port — контракт, repository — работа с БД

| Назначение | Файл | Экспорт |
|---|---|---|
| Контракт хранения account | `auth/ports/auth.port.ts` | `AuthPort` |
| SQL-реализация account | `auth/repo/auth.repository.ts` | `createAuthRepository(sql): AuthPort` |
| Контракт хранения профиля | `user-profile/ports/user-profile.port.ts` | `UserProfilePort` |
| SQL-реализация профиля | `user-profile/repo/user-profile.repository.ts` | `createUserProfileRepository(sql): UserProfilePort` |
| Контракты сессий и токенов | `session/ports/session.port.ts`, `session/ports/refresh-token.port.ts` | `SessionPort`, `RefreshTokenPort` |
| SQL-реализации сессий и токенов | `session/repo/session.repository.ts`, `session/repo/refresh-token.repository.ts` | `createSessionRepository`, `createRefreshTokenRepository` |
| Контракты outbox | `integration-events/outgoing/ports/outbox.port.ts` | `OutboxAppendPort`, `OutboxDeliveryPort`, `OutboxStatsPort`, их объединение `OutboxPort` |
| SQL-реализация outbox | `integration-events/outgoing/repo/outbox.repository.ts` | `createOutboxRepository(sql): OutboxPort` |
| Контракт inbox | `integration-events/incoming/ports/inbox.port.ts` | `InboxPort` |
| SQL-реализация inbox | `integration-events/incoming/repo/inbox.repository.ts` | `createInboxRepository(sql): InboxPort` |

Правила именования и зависимостей:

1. Контракт называется `<Name>Port` и находится в `ports/<name>.port.ts`.
   `AuthRepository` и `OutboxAppendRepository` не используются как имена
   интерфейсов. Тип контракта не выводится через `ReturnType` SQL-фабрики.
2. Реализация называется `create<Name>Repository` и находится в
   `repo/<name>.repository.ts`. При текущем единственном SQL-хранилище префикс
   `postgres-` и `createPostgres` не нужен. Пару
   `auth.repository.ts` + `postgres-auth.repository.ts` заменяет пара
   `ports/auth.port.ts` + `repo/auth.repository.ts`.
3. Port содержит только контракт: методы, входные и выходные типы, семантику
   результата. В нём нет SQL client, DB row, Elysia, env или импорта реализации.
   Типы портов используются через `import type`.
4. SQL-repository импортирует port и реализует его. Mapper и тип DB row лежат
   рядом в `repo/<name>.mapper.ts`. Известные constraint errors преобразуются
   в стабильные ошибки приложения внутри repository.
5. Use case зависит от port или минимального `Pick<...>`. Имена зависимостей
   обозначают назначение: `authAccounts`, `userProfiles`, `sessions`,
   `refreshTokens`, `outboxEvents`, `inbox`. Не чередовать для одной роли
   `sessionRepo`, `sessionRepository` и `sessions`.
6. `find...` возвращает entity или `null`. Для условного изменения явно
   описывается смысл `boolean`; PATCH различает отсутствующее поле и `null`.
   Методы отражают потребности сценариев; общий CRUD/base repository не нужен.
7. Для зависимости от HTTP, crypto или другой внешней возможности также
   используется port, если требуется отдельный контракт. Реализация находится
   в соответствующем `http/` или `shared/lib/`, SQL-папка `repo/` ей не нужна.

Пример контракта и зависимости сценария:

```ts
// modules/user-profile/ports/user-profile.port.ts
import type { UserProfile } from '../entities/user-profile.entity'

export interface UserProfilePort {
  findById(userId: string): Promise<UserProfile | null>
  // Остальные операции хранения профиля описываются здесь же.
}
```

```ts
// Фрагмент modules/user-profile/use-cases/get-my-profile.ts
import type { UserProfilePort } from '../ports/user-profile.port'

interface GetMyProfileDeps {
  userProfiles: Pick<UserProfilePort, 'findById'>
}
```

Направление зависимостей: use case → port; SQL-repository → тот же port;
`*.module.ts` связывает их. Импорт SQL-реализации из use case, entity или
event handler нарушает это правило даже при использовании только её типа.

## Use cases и транзакции

Один сценарий — один файл `use-cases/<action>.ts`. Фабрика называется
`create<Action>UseCase(deps)` и возвращает рабочую функцию. Рядом описываются
собственные `Input`, результат и минимальные `Deps`. HTTP Request, HTTP-схемы,
env и SQL client в сценарий не передаются. Общие настройки преобразуются
модулем в конкретные зависимости и значения.

Контракт Unit of Work также является port:

- `shared/ports/auth-unit-of-work.port.ts` содержит `AuthUnitOfWorkPort` и
  `AuthTransactionPorts`;
- `shared/ports/user-unit-of-work.port.ts` содержит `UserUnitOfWorkPort` и
  `UserTransactionPorts`;
- `shared/database/<service>-unit-of-work.ts` содержит SQL-реализацию
  `createAuthUnitOfWork` или `createUserUnitOfWork`.

Поля `AuthTransactionPorts` и `UserTransactionPorts` имеют типы соответствующих
портов. Параметр callback называется `ports` или сразу деструктурируется
по назначению:

```ts
await unitOfWork.run(async ({ authAccounts, outboxEvents }) => {
  const account = await authAccounts.insert({ email, passwordHash })
  await outboxEvents.append(createAccountCreatedEvent(account.id), account.id)
})
```

SQL-реализация открывает транзакцию и создаёт все эти repositories с одним
transaction client. Контракт не импортирует эту реализацию. Поэтому use cases
не зависят от файла, который одновременно объявляет интерфейс и выполняет SQL.

Внутри одной атомарной операции используются только ports её транзакции.
Для inbox это reservation и бизнес-изменение; для регистрации — account и
outbox. Event handler получает уже открытые transaction ports, передаёт их
use case и не открывает вложенную независимую транзакцию. HTTP-доставка
исходящего события выполняется worker после commit.

## Что привести к стандарту в текущем коде

`auth-service` задаёт основу сборки, но его оставшиеся несогласованности также
подлежат выравниванию. Текущие файлы не отменяют правила выше.

| Сейчас | Целевое изменение |
|---|---|
| `createAuthModule` возвращает routes, `createUserProfileModule` — `{ routes, integrationEventHandlers }` | Оба HTTP-модуля возвращают плагин; сборка профильных event handlers экспортируется отдельно |
| Входящий integration-events возвращает `.routes` | Экспортировать `.incomingRoutes`; для метрик использовать `.metricsRoutes`, как в auth |
| Интерфейсы auth/profile/outbox/inbox находятся в `repo/*.repository.ts`, SQL — в `repo/postgres-*.repository.ts` | Перенести контракты в `ports/*.port.ts`, SQL — в `repo/*.repository.ts`; убрать `Postgres` из фабрик |
| Session и refresh-token объявляют интерфейс и SQL-фабрику с одинаковым именем | Вынести `SessionPort`/`RefreshTokenPort`, оставить в repo фабрики `create*Repository` |
| В session entities находятся DB row и mapper | Перенести их в соответствующие `repo/*.mapper.ts` |
| Unit of Work объединяет интерфейс и SQL-сборку в `shared/database` | Вынести контракты в `shared/ports`, переименовать `*TransactionRepositories` в `*TransactionPorts` |
| `LoginAccountUseCase`, `ChangePasswordUseCase` и session-фабрики соседствуют с `createRegisterAccountUseCase` | Использовать `create<Action>UseCase` во всех модулях |
| `authRepository`, `sessionRepo`, `sessionRepository` в зависимостях сценариев | Использовать согласованные имена назначения и типы `*Port` |

При реализации переносить contract, SQL-файл, импорты, module wiring, Unit of
Work и тестовые реализации согласованно. Не оставлять второй вариант как
новый образец для копирования. Это структурное изменение не требует миграций
таблиц, новых HTTP-путей или изменения event payload.

## Проверка нового или изменённого модуля

- Структура и имена соответствуют этому документу; в `repo/` находятся
  реализации БД, в `ports/` — контракты.
- HTTP-модуль подключается как auth; технические возможности имеют явные имена;
  компоненты с жизненным циклом создаются один раз.
- Use cases и event handlers зависят от ports и функций, не импортируют
  repositories или SQL client.
- Unit-тесты подставляют fake-объекты, реализующие ports, и проверяют поведение
  сценариев. HTTP-тесты проверяют routes, guards и формат ответов после сборки.
- Для затронутого транзакционного кода проверки на PostgreSQL подтверждают
  rollback, конкуренцию и повторную доставку. In-memory fake не доказывает
  корректность SQL-блокировок.
- В каждом изменённом сервисе проходят `bun run typecheck` и `bun test`.
  DB-проверки запускаются через `TEST_DATABASE_URL=<url> bun run test:postgres`
  с тестовой БД, имя которой заканчивается на `_test`. Этот список относится
  к реализации изменений в коде; для правки документа достаточно проверить
  согласованность примеров и ссылок.
