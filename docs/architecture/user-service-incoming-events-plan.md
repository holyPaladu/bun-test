# План рефакторинга incoming events в user-service

Статус: реализован 8 сентября 2026 года. PostgreSQL-сценарии
сохранены, но локально пропущены без `TEST_DATABASE_URL`.

Область реализации: `services/user-service`, его тесты и README. Этот документ
описывает изменения; `auth-service` и общий пакет контрактов в этап не входят.

## 1. Что исправляем

| Сейчас | Решение |
|---|---|
| `app.ts` импортирует внутренний `on-account-created.ts` и связывает его с incoming | Связывание выполняет существующий `integration-events.module.ts` через публичный экспорт `user-profile.module.ts` |
| `receive-integration-event.ts` лежит отдельно, его роль и имя отличаются от других сценариев | `incoming/use-cases/receive-integration-event.ts`, фабрика `createReceiveIntegrationEventUseCase` |
| Route принимает только `AccountCreatedV1` | Общая схема из карты всех поддерживаемых событий, различаемых по `type` |
| Receiver и inbox repository также принимают только `AccountCreatedV1` | Receiver получает union входящих событий; repository получает только метаданные inbox |
| В `entities/inbox.entity.ts` смешаны entity, SQL row и mapper | Entity содержит модель inbox; SQL-типы остаются рядом с SQL |
| Предыдущий план добавлял `user-service.module.ts` | Этот файл исключён; для сборки достаточно существующих module-файлов и `app.ts` |

Расширяемость здесь означает согласованное добавление **типа события, его
runtime-схемы и обработчика**. Перенос одного файла или добавление только registry
эту задачу не решает.

## 2. Целевая структура

```text
services/user-service/src/
├── app.ts
├── server.ts
├── container.ts
└── modules/
    ├── integration-events/
    │   ├── integration-events.module.ts
    │   └── incoming/
    │       ├── incoming.module.ts
    │       ├── entities/
    │       │   └── inbox.entity.ts
    │       ├── repo/
    │       │   └── inbox.repository.ts
    │       ├── use-cases/
    │       │   └── receive-integration-event.ts
    │       ├── http/
    │       │   ├── integration-events.routes.ts
    │       │   └── integration-events.schemas.ts
    │       ├── types/
    │       │   └── integration-event.type.ts
    │       └── utils/
    │           ├── bearer-token.ts
    │           └── dispatch-integration-event.ts
    └── user-profile/
        ├── user-profile.module.ts
        ├── entities/
        ├── repo/
        ├── use-cases/
        │   ├── create-user-profile.ts
        │   ├── get-my-profile.ts
        │   └── update-my-profile.ts
        ├── http/
        └── events/
            └── on-account-created.ts
```

Используем знакомые проекту роли: `*.module.ts` собирает зависимости,
`use-cases` выполняет сценарии, `http` принимает запросы, `repo` работает с БД,
`entities` описывает модель, `types` — общие типы, `utils` — небольшие функции.
Один сценарий в `use-cases` — нормальное начало; следующие появятся там же при
реальной потребности.

## 3. Что такое receiveIntegrationEvent

Это прикладной use case модуля incoming: **принять событие и атомарно применить
его обработчик, если eventId ещё не обработан**.

Поэтому:

- файл — `incoming/use-cases/receive-integration-event.ts`;
- фабрика — `createReceiveIntegrationEventUseCase(deps)`;
- возвращённая функция — `receiveIntegrationEvent(event)`;
- собственные `Input`, `Deps` и тип результата объявляются рядом со сценарием,
  как в `get-my-profile.ts`;
- зависимости — Unit of Work и функция обработки события.

Сценарий открывает транзакцию, резервирует inbox, пропускает duplicate,
вызывает переданный handler с репозиториями этой транзакции и ждёт commit.
Сохраняем результат `Promise<boolean>`: `true` — применено впервые,
`false` — повтор после ранее завершённой обработки.

Выбор обработчика вынесен в `utils/dispatch-integration-event.ts`. Эта функция
только сопоставляет `event.type` с handler и вызывает его; SQL, inbox,
управления транзакцией или HTTP в ней нет. Поэтому отдельный второй use case
для dispatch не нужен.

`user-profile/events/on-account-created.ts` переводит событие во вход
`createUserProfile`. Создание профиля остаётся самостоятельным профильным
сценарием.

## 4. Типы, схемы и обработчики расширяются вместе

### Тип поддерживаемых событий

В `incoming/types/integration-event.type.ts`:

```ts
import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'

export type IncomingIntegrationEvent = AccountCreatedV1
```

Это список событий, которые понимает именно user-service. Сейчас в общем
пакете существует один контракт. При появлении второго в union добавится
`| AnotherEventV1`; выдуманный production-контракт в этом этапе не создаём.

Use case и dispatcher импортируют этот тип из `types`, поэтому прикладной код
не зависит от `http` или Elysia.

### Валидация /internal/events

В `http/integration-events.schemas.ts` объявляем полную карту схем. Эскиз с
существующим контрактом:

```ts
import { t } from 'elysia'
import type { TUnsafe } from '@sinclair/typebox'
import {
  ACCOUNT_CREATED_V1,
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import type { IncomingIntegrationEvent } from '../types/integration-event.type'

type IncomingEventSchemas = {
  [Type in IncomingIntegrationEvent['type']]:
    TUnsafe<Extract<IncomingIntegrationEvent, { type: Type }>>
}

const incomingEventSchemas = {
  [ACCOUNT_CREATED_V1]: t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema),
} satisfies IncomingEventSchemas

export const integrationEventBodySchema =
  t.Union(Object.values(incomingEventSchemas))
```

Route подключает `body: integrationEventBodySchema` и общую response schema
из этого же файла. Конкретных `AccountCreatedV1` и `accountCreatedV1Schema`
в route больше нет.

Каждая ветка union содержит полный envelope: фиксированный `type`, свой
`data`, UUID, timestamp и ограничения на дополнительные поля. С добавлением
новой записи в карту общая runtime-валидация расширяется автоматически.

Пример будущего расширения карты, когда соответствующий контракт уже существует:

```ts
const incomingEventSchemas = {
  [ACCOUNT_CREATED_V1]: t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema),
  [ANOTHER_EVENT_V1]: t.Unsafe<AnotherEventV1>(anotherEventV1Schema),
} satisfies IncomingEventSchemas
```

`AnotherEventV1` здесь — условное имя для иллюстрации. Route и выражение
`t.Union(Object.values(...))` при этом остаются прежними.

### Полный набор handlers и dispatch

Тип `IntegrationEventHandlers` объявляется рядом с dispatcher:

```ts
export type IntegrationEventHandlers = {
  [Event in IncomingIntegrationEvent as Event['type']]: (
    event: Event,
    repositories: UserTransactionRepositories,
  ) => Promise<void>
}
```

Фабрика `createIntegrationEventDispatcher(handlers)` возвращает функцию
`handleEvent(event, repositories)`, которая выбирает обработчик через явный
`switch` по `event.type`. Ветки сужают тип payload; проверка оставшегося
дискриминатора через `never` обнаруживает пропущенное событие. В защитной
ветке выбрасывается ошибка. Обычный объект и функция достаточны, динамическая
регистрация не требуется.

Таким образом, расширение union требует:

1. схему в `IncomingEventSchemas`;
2. handler в `IntegrationEventHandlers`;
3. ветку dispatcher.

Пропуски проверяются TypeScript. Корректность самой JSON Schema и соответствие
payload проверяются runtime-тестами: `t.Unsafe<T>` служит адаптером существующих
контрактов, но само по себе не доказывает соответствие схемы указанному `T`.

## 5. Экспорт и сборка модулей

### user-profile.module.ts экспортирует реакцию профиля

`createUserProfileModule(container)` продолжает возвращать HTTP-плагин.
Тот же файл дополнительно экспортирует доступные обработчики:

```ts
import { ACCOUNT_CREATED_V1 } from '@test-project/integration-event-contracts'
import { onAccountCreated } from './events/on-account-created'

export const userProfileIntegrationEventHandlers = {
  [ACCOUNT_CREATED_V1]: onAccountCreated,
} as const
```

Это объект функций без изменяемого состояния. Обработчик получает
`userProfiles` от текущей inbox-транзакции. Репозиторий, созданный для
HTTP-модуля от общего SQL client, в этот путь не передаётся.

Тип зависимости самого `onAccountCreated` сужаем до нужной ему операции
`userProfiles.createIfAbsent`; вся `UserTransactionRepositories` по-прежнему
структурно подходит. Профильному handler не нужен доступ к inbox.

### integration-events.module.ts связывает публичные возможности

Связывание incoming с профильными обработчиками переносится из `app.ts` сюда.
Сам вызов `createIntegrationEventsModule(container)` остаётся в `app.ts`:

```ts
import type { Container } from '@/container'
import { userProfileIntegrationEventHandlers } from '@/modules/user-profile/user-profile.module'
import { createIncomingModule } from './incoming/incoming.module'
import type { IntegrationEventHandlers } from './incoming/utils/dispatch-integration-event'

export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
) => {
  const handlers = {
    ...userProfileIntegrationEventHandlers,
  } satisfies IntegrationEventHandlers

  return {
    incomingRoutes: createIncomingModule(container, handlers),
  }
}

export type IntegrationEventsModule =
  ReturnType<typeof createIntegrationEventsModule>
```

Допускается зависимость composition-файла от публичного API другого feature.
Так уже устроено `auth.module.ts → session.module.ts`. Внутренние файлы
`incoming/use-cases`, `http`, `repo` и `utils` профиль не импортируют.

На каждый event type пока предусмотрен один handler. Если несколько модулей
начнут реагировать на один type, обработчики нужно будет явно объединить в
одну транзакционную функцию: object spread с одинаковыми ключами перезаписывает
предыдущее значение и не является механизмом рассылки.

### incoming.module.ts собирает сценарий и HTTP-плагин

Принимает `Pick<Container, 'env' | 'unitOfWork'>` и
`IntegrationEventHandlers`. Создаёт dispatcher, затем
`createReceiveIntegrationEventUseCase({ unitOfWork, handleEvent })`, передаёт
полученную функцию и consumer token в routes и возвращает Elysia-плагин.

Граница `integration-events.module.ts` отвечает за подключение бизнес-модулей;
`incoming.module.ts` — за сборку самого приёма событий.

### app.ts создаёт и подключает модуль

`createApp(container)` собирает HTTP-приложение: создаёт integration-events
и подключает его incoming routes вместе с остальными модулями.

```ts
// app.ts
export const createApp = (container: Container) => {
  const integrationEvents = createIntegrationEventsModule(container)

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
}

// server.ts
const container = await createContainer()
const app = createApp(container).listen(container.env.PORT)
```

`app.ts` импортирует фабрики из публичных module-файлов. Профильные обработчики
подключаются внутри `integration-events.module.ts`, поэтому импорт
`on-account-created.ts` и передача handler из `app.ts` больше не нужны.
`server.ts` создаёт контейнер, запускает приложение и управляет его завершением.

Порядок: error handler, access log, OpenAPI, health, incoming routes,
затем `/api` с `successEnvelope` и профилем. Ответы `/internal/events`
сохраняют собственный формат. `container.ts` продолжает собирать общую
инфраструктуру.

## 6. Inbox: независимость от конкретного event

В `entities/inbox.entity.ts` достаточно модели `InboxEntry` с
`eventId`, `eventType`, `occurredAt`. Именно эти данные нужны операции
резервирования.

Use case передаёт `inbox.reserve({ eventId, eventType: event.type, occurredAt })`.
Repository принимает `InboxEntry`, а payload и `AccountCreatedV1` ему не нужны.
При расширении event union SQL и сигнатура repository остаются прежними.

Текущий `EventId = { event_id: string }` — SQL result type; его место внутри
`repo/inbox.repository.ts`, рядом с `RETURNING event_id`.

`EventInboxRow` и `toEventInbox` сейчас не используются: repository возвращает
boolean. Полный mapper понадобится при появлении чтения inbox; тогда ему место
в `repo/inbox.mapper.ts`, как у user-profile. Схему таблицы в этом этапе
сохраняем; в частности, `processed_at` в действующей миграции — `NOT NULL`.

## 7. Поведение и проверки

| Ситуация | Ожидаемое поведение |
|---|---|
| Поддерживаемый type, корректные credentials и payload | Нужный handler, commit, затем `202 { accepted: true, duplicate: false }` |
| Повтор того же eventId после commit | Handler не вызывается, `200 { accepted: false, duplicate: true }` |
| Неизвестный type или неподдерживаемая версия при корректных credentials | Ошибка валидации `422`, до inbox дело не доходит |
| Payload не соответствует своему type | `422`, другой handler не подбирается |
| Отсутствуют обязательные поля, неверны UUID/timestamp или есть запрещённые поля | Ошибка валидации без бизнес-эффекта |
| Нет подходящего bearer token при корректном body | `401`, сценарий не вызывается |
| Handler падает после изменения профиля | Rollback inbox и профиля, ответ об ошибке вместо успешного подтверждения |
| Два конкурентных запроса с одним eventId | Бизнес-эффект применяется один раз |
| В union добавлен type, но забыта schema, handler или ветка dispatch | Ошибка проверки типов |

Существующие unit-тесты уже проверяют первый приём, duplicate и распространение
ошибки. PostgreSQL-тесты проверяют настоящий rollback и конкурентную доставку.
Сохраняем их и дополняем проверками HTTP-валидации, dispatch и публичной сборки.

Для проверки рецепта расширения при реализации провести эксперимент во
временной проверочной копии user-service: добавить локальный тестовый контракт
с другим payload, расширить union, schema map, handlers и dispatcher, затем
отправить оба типа через общий `/internal/events`. Проверить успешный запрос
второго типа и отклонение payload первого типа под именем второго; убрать по
очереди schema, handler и ветку dispatch и убедиться в ошибках typecheck.
Этот эксперимент проверяет фактический путь расширения; тестовое событие не
включается в итоговый production-код или общий пакет контрактов. После добавления
реального второго события соответствующие проверки становятся постоянными.

## 8. Порядок реализации

- [x] Перенести receiver в `use-cases`, переименовать фабрику и обновить импорты.
- [x] Выделить `IncomingIntegrationEvent` в `types`; receiver принимает этот union.
- [x] Привести inbox entity и SQL result types к своим ролям; `reserve` принимает метаданные.
- [x] Добавить полную карту схем и общий union в `http/integration-events.schemas.ts`.
- [x] Подключить body/response schemas в route, убрать привязку route к `AccountCreatedV1`.
- [x] Добавить типизированный dispatcher в `utils` с проверкой всех веток.
- [x] Экспортировать профильные handlers из `user-profile.module.ts` и сузить зависимости handler.
- [x] Собрать receiver и routes в `incoming.module.ts`, подключить handlers через `integration-events.module.ts`.
- [x] Оставить создание integration-events в `app.ts`: вызывать `createIntegrationEventsModule(container)`, убрать импорт и передачу профильного handler; сохранить `createApp(container)` в `server.ts`.
- [x] Обновить существующие тесты, добавить проверки из раздела 7.
- [x] Из `services/user-service` выполнить `bun run typecheck`, `bun test`; при настроенной тестовой PostgreSQL — `bun run test:postgres`.
- [x] Обновить README user-service с фактической структурой и рецептом добавления события.

## 9. Рецепт добавления следующего события

Предполагается, что версионированный контракт уже опубликован producer-ом.

1. Добавить его тип в `IncomingIntegrationEvent`.
2. Зарегистрировать его схему в `incomingEventSchemas`.
3. Создать `events/on-<fact>.ts` в бизнес-модуле и экспортировать через
   `<feature>.module.ts`.
4. Подключить экспорт в `integration-events.module.ts`, если он приходит из
   нового feature; для уже подключённой handler map достаточно расширить её.
5. Добавить соответствующую ветку dispatcher.
6. Проверить валидный и неверный payload, повтор и rollback бизнес-эффекта.

При этом `app.ts`, `server.ts`, HTTP route, алгоритм
`receiveIntegrationEvent` и inbox repository не меняются. Если новый сценарий
требует другой таблицы, её repository отдельно подключается к общей
`UserUnitOfWork`, чтобы сохранить одну транзакцию.
