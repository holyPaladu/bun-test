# План рефакторинга outgoing events в auth-service

Статус: реализован 9 сентября 2026 года. Typecheck и 97 тестов прошли;
PostgreSQL-проверки добавлены, но не выполнены без `TEST_DATABASE_URL`.

Документ сохраняет описание целевого решения; результаты реализации и
ограничения проверки зафиксированы в разделе 11.

Область реализации: `services/auth-service`, его тесты, README и синхронизация
`docs/architecture/service-structure-standard.md` с новой группировкой outgoing.
Этот документ описывает следующий этап после нормализации incoming events
в `user-service`.
`user-service`, общий пакет контрактов и схема PostgreSQL в этот этап не входят.

## 1. Что исправляем

| Сейчас | Решение |
|---|---|
| `AccountCreatedV1` независимо объявлен исходящим типом в repository, sender и publisher | Один union `OutgoingIntegrationEvent` в `outgoing/types/integration-event.type.ts` |
| Тестовый in-memory DB импортирует event type из SQL-repository | Все не-SQL потребители импортируют тип из `types`, repository перестаёт быть источником прикладных типов |
| `ClaimedOutboxEvent` объявлен внутри `deliver-pending-events.ts` | Модель зарезервированного события переносится в `entities/outbox.entity.ts`; PostgreSQL row остаётся в `repo` |
| SQL row преобразуется в claimed event прямо внутри repository | Преобразование `row -> entity` выносится в `repo/outbox.mapper.ts` |
| `deliver-event.ts` импортирует весь `DeliverPendingEventsDeps`, включая ненужные ему `claimDue`, `batchSize` и `leaseMs` | Одна попытка доставки и batch-цикл получают собственные минимальные `Deps` |
| `deliver-pending-events.ts` одновременно является batch-циклом и местом сборки `deliverEvent` | `outgoing.module.ts` явно собирает repository, sender, metrics, одну попытку, batch и cron |
| Сценарии, ошибки, retry-логика и cron лежат вперемешку в корне outgoing | Файлы группируются по роли: `use-cases/`, `errors/`, `helpers/`, `cron/`; в корне остаётся сборка модуля |
| Корневой `integration-events.module.ts` знает обо всех внутренних файлах outgoing | Корневой модуль связывает публичные возможности `outgoing.module.ts` с общим metrics route |
| `AuthTransactionRepositories` описывает append через `ReturnType<typeof createOutboxRepository>` | Unit of Work объявляет минимальный append-port и не выставляет concrete repository type как application contract |
| `EventDeliveryError` переэкспортируется через batch-файл | Sender и тесты импортируют ошибку напрямую из `errors/event-delivery.error.ts` |
| README называет модуль плоским и ручной SQL replay не очищает `lease_owner` | README отражает фактическую структуру и тот же reset state, что `replayDeadLettered` |

Это структурный рефакторинг без изменения гарантий доставки. Сохраняются
transactional outbox, at-least-once, параллельная доставка batch, lease ownership,
retry с jitter, DLQ, ручной replay, Prometheus-метрики и cron lifecycle.

Не добавляем второй выдуманный production event, универсальный registry,
`auth-service.module.ts`, Bun Worker, generic repository или отдельную БД для
очереди. Новый слой вводится только там, где уже есть отдельная роль.

## 2. Целевая структура

```text
services/auth-service/src/
├── app.ts
├── server.ts
├── container.ts
├── shared/
│   └── database/
│       └── auth-unit-of-work.ts
└── modules/
    ├── auth/
    │   ├── auth.module.ts
    │   ├── use-cases/
    │   │   └── register-account.ts
    │   └── events/
    │       └── create-account-created.event.ts
    └── integration-events/
        ├── integration-events.module.ts
        └── outgoing/
            ├── outgoing.module.ts
            ├── use-cases/
            │   ├── deliver-pending-events.ts
            │   └── deliver-event.ts
            ├── errors/
            │   └── event-delivery.error.ts
            ├── helpers/
            │   ├── retry-policy.ts
            │   └── error-message.ts
            ├── cron/
            │   └── outbox.cron.ts
            ├── entities/
            │   └── outbox.entity.ts
            ├── types/
            │   └── integration-event.type.ts
            ├── repo/
            │   ├── outbox.repository.ts
            │   └── outbox.mapper.ts
            ├── http/
            │   └── send-event.http.ts
            └── metrics/
                └── delivery.metrics.ts
```

### Назначение файлов и правила группировки

Сначала файлы объединяются по возможности — `integration-events/outgoing`,
затем внутри неё по роли. Названия `use-cases/`, `types/`, `entities/`,
`errors/`, `repo/` и `http/` следуют принятой в проекте форме. Для чистых
вспомогательных функций здесь выбираем `helpers/`; параллельную папку `utils/`
в outgoing не создаём.

| Файл внутри `outgoing/` | Для чего нужен |
|---|---|
| `outgoing.module.ts` | Собирает зависимости и возвращает возможности outgoing; здесь нет алгоритма доставки или расписания |
| `use-cases/deliver-pending-events.ts` | Сценарий одного batch: резервирует due events, вызывает готовый `deliverEvent` для каждого и ожидает завершения |
| `use-cases/deliver-event.ts` | Сценарий одной попытки: отправляет claim, выбирает published/retry/DLQ, фиксирует результат с проверкой lease owner и учитывает метрики |
| `errors/event-delivery.error.ts` | Объявляет `EventDeliveryError` и `isRetryableDeliveryError`: общий язык ошибок между транспортом и сценарием доставки |
| `helpers/retry-policy.ts` | Содержит чистые `getRetryDelayMs` и `shouldDeadLetter`, а также их `RetryPolicy`; вычисляет задержку и достижение лимита без I/O |
| `helpers/error-message.ts` | Содержит `errorMessage`: превращает `unknown` в строку с текущим ограничением 1 000 символов для логов и сохранения ошибки |
| `cron/outbox.cron.ts` | Адаптер запуска по расписанию: вызывает batch, задаёт защиту от overlap и подключает lifecycle задачи к Elysia |
| `types/integration-event.type.ts` | Объявляет единый `OutgoingIntegrationEvent` для append, entity, sender и тестов |
| `entities/outbox.entity.ts` | Описывает `ClaimedOutboxEvent` — зарезервированную запись с envelope, номером попытки и владельцем lease |
| `repo/outbox.repository.ts` | Выполняет SQL для append, claim, записи outcome, статистики и replay |
| `repo/outbox.mapper.ts` | Описывает PostgreSQL row и преобразует её в прикладную entity |
| `http/send-event.http.ts` | Отправляет envelope по HTTP, применяет transport timeout и переводит сетевые ошибки/статусы в delivery error |
| `metrics/delivery.metrics.ts` | Создаёт и обновляет Prometheus-метрики доставки |

`use-cases/` содержит прикладные сценарии модуля, включая техническую доставку.
Сценарию не обязательно менять auth aggregate: у доставки есть собственная
цель, зависимости и результат в outbox. Это согласуется с расположением
`incoming/use-cases/receive-integration-event.ts` в user-service.
`registerAccount` остаётся в `auth/use-cases`, а фабрика принадлежащего ему
события — в `auth/events`.

Фабрики доставки унифицируются с именованием use cases в проекте:
`createDeliverPendingEventsUseCase` и `createDeliverEventUseCase`. Возвращённые
функции по-прежнему называются `deliverPendingEvents` и `deliverEvent`.
Их минимальные `Deps`, input и result остаются рядом со своим сценарием.
`types/` используется для типов, общих нескольким частям outgoing, а не для
механического переноса всех интерфейсов. `RetryPolicy` остаётся рядом со своими
вычислениями, DB row — в `repo`, модель claim — в `entities`.

`errors/` владеет семантикой ошибки доставки, а `helpers/` — чистыми
вычислениями и форматированием. Существующий `delivery-error.ts` разделяется
по этой границе: класс и классификатор переезжают в `errors`, `errorMessage` —
в `helpers`. Helper не отправляет HTTP, не обращается к SQL, не запускает
расписание и не собирает сценарии.

Это уточнение меняет прежнее правило плоского outgoing в
`service-structure-standard.md`. Раздел «Cron и publisher», пути в примерах
ports и описание use cases в стандарте синхронизированы при реализации.

`outgoing.module.ts` нужен не ради симметрии папок. Он становится composition
root одного направления integration events: собирает доставку, но не подключает
её к Elysia app. Корневой `integration-events.module.ts` сохраняет единый
публичный API сервиса и сможет независимо подключить `incoming`, если такая
роль действительно появится.

### Почему cron отдельно от HTTP и как добавлять задачи

`http/` объединяет адаптеры HTTP, а `cron/` — адаптеры запуска по расписанию.
Использование Elysia для lifecycle не делает cron HTTP-обработчиком: у него
нет route, request или response. Последовательность вызовов такая:

```text
cron/outbox.cron.ts
  -> use-cases/deliver-pending-events.ts
     -> use-cases/deliver-event.ts
        -> переданные sendEvent/outbox
```

Стрелки показывают вызовы; конкретные функции и адаптеры связывает
`outgoing.module.ts`. Use cases не импортируют cron, Elysia или HTTP sender.

Если у outgoing появится другая задача, она получит собственный
`cron/<purpose>.cron.ts`, уникальные имена Elysia-плагина и cron job,
свои pattern/timezone и lifecycle. Каждый адаптер принимает только нужную
функцию сценария, logger и настройки расписания. Вызов SQL и сам алгоритм
работы остаются за пределами cron-файла.

Сейчас модуль возвращает единственный `outboxCron`. При появлении нескольких
задач outgoing их плагины собираются в `outgoing.module.ts` через `.use(...)`
в один `outgoingCron`; корневой модуль и `app.ts` подключают его один раз.
Такая замена публичного имени выполняется вместе с добавлением второй задачи,
сейчас дополнительный plugin-агрегатор не нужен. `protect` действует на свою
задачу; взаимное исключение разных задач при необходимости решается отдельно.

Задачи другой возможности, например обслуживания sessions, находятся в
`sessions/cron/` своего модуля. Общую папку всех cron-задач сервиса не вводим:
расписание остаётся рядом со сценарием, который запускает.

## 3. Единый тип исходящих событий

В `outgoing/types/integration-event.type.ts` находится полный список контрактов,
которые этот auth-service способен записать и доставить:

```ts
import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'

/** Integration events produced and delivered by auth-service. */
export type OutgoingIntegrationEvent = AccountCreatedV1
```

Этот тип используют:

- append-операция outbox;
- `ClaimedOutboxEvent`;
- HTTP sender;
- тестовый in-memory DB;
- тестовые sender-функции.

SQL-repository больше не экспортирует `OutgoingIntegrationEvent`, а
`use-cases/deliver-pending-events.ts` не объявляет локальную копию alias.

В отличие от incoming-стороны здесь не нужны schema-map и dispatcher. Producer
не выбирает обработчик по `type`: любой элемент union проходит один и тот же
алгоритм `append -> claim -> send -> persist outcome`. Runtime-schema каждого
event уже принадлежит `integration-event-contracts`, а конкретная фабрика
возвращает конкретный контракт. Текущий тест регистрации продолжает проверять
результат `createAccountCreatedEvent` общей runtime-схемой.

Добавление типа в union — осознанная регистрация producer-ом поддержки этого
контракта. Старую версию нельзя удалять из union, пока её события могут
оставаться pending или в DLQ. Иначе новый процесс перестанет типобезопасно
доставлять уже сохранённые envelopes.

## 4. Entity, PostgreSQL row и mapper

### Прикладная модель claim

В `outgoing/entities/outbox.entity.ts` переносится модель, которую используют
цикл и одна попытка доставки:

```ts
import type { OutgoingIntegrationEvent } from '../types/integration-event.type'

export interface ClaimedOutboxEvent {
  eventId: string
  event: OutgoingIntegrationEvent
  occurredAt: Date
  attemptCount: number
  leaseOwner: string
}
```

Поле `id` переименовывается в `eventId`, чтобы на всех границах claim/update/log
использовалось одно имя. Это переименование TypeScript-модели, не колонки БД и
не миграция. Envelope продолжает содержать тот же `event.eventId`; append
записывает его в `outbox_events.id` один раз.

### SQL row и преобразование

`OutboxEventRow` переносится в `repo/outbox.mapper.ts` и остаётся DB-типом с
именами `occurred_at`, `attempt_count`, `lease_owner`. Там же находятся
`deserializeEvent` и `toClaimedOutboxEvent(row)`.

Mapper выполняет только адаптацию хранения:

- разбирает строковый JSON, если драйвер вернул строку;
- приводит `occurred_at` к `Date`;
- переводит snake_case в поля entity;
- возвращает `ClaimedOutboxEvent`.

Repository оставляет рядом с SQL только query-specific result types вроде
`{ id: string }` и статистики aggregate query. `claimDue` завершает запрос
через `rows.map(toClaimedOutboxEvent)`.

Повторную runtime-валидацию собственного payload при каждой отправке в этом
этапе не добавляем. Payload создаётся типизированной фабрикой, проверяется
contract-тестом и записывается тем же сервисом; внешняя runtime-граница остаётся
у consumer-а. Поведение для повреждённых вручную строк БД — отдельная задача
операционного hardening, иначе она потребует отдельного решения о quarantine,
а не простого `as` или бесконечного падения всего batch.

## 5. Разделение batch и одной попытки

### deliverPendingEvents

`createDeliverPendingEventsUseCase(deps)` в
`use-cases/deliver-pending-events.ts` отвечает только за один batch:

1. вызвать `claimDue` с `batchSize`, `leaseMs` и `publisherId`;
2. передать каждый claim в готовую функцию `deliverEvent`;
3. дождаться `Promise.all`.

Его зависимости описываются рядом и содержат только операцию claim, функцию
одной доставки и batch options:

```ts
interface DeliverPendingEventsDeps {
  outbox: {
    claimDue(input: {
      limit: number
      leaseMs: number
      leaseOwner: string
    }): Promise<ClaimedOutboxEvent[]>
  }
  deliverEvent(event: ClaimedOutboxEvent): Promise<void>
  options: {
    batchSize: number
    leaseMs: number
    publisherId: string
  }
}
```

Batch не знает про HTTP, retry, metrics и методы изменения delivery state.

### deliverEvent

`createDeliverEventUseCase(deps)` в `use-cases/deliver-event.ts` отвечает за
ровно одну зарезервированную запись:

- вызвать `sendEvent(claimed.event)`;
- классифицировать transport error;
- вычислить `published`, `retry` или `dead_letter`;
- записать ровно один outcome с текущим `eventId + leaseOwner`;
- записать метрики только после успешного state update актуальным владельцем;
- залогировать delivery failure или stale lease.

Его локальный outbox port содержит только `markPublished`, `markFailed` и
`markDeadLettered`. В options остаются только `maxAttempts`, `baseRetryMs`,
`maxRetryMs`, `jitterRatio`; `batchSize`, `leaseMs` и `publisherId` ему не нужны.
`sendEvent`, metrics, logger, `now` и `random` также объявляются здесь.

Так исчезает обратная зависимость `deliver-event.ts -> DeliverPendingEventsDeps`
и становится видно, какая операция действительно потребляет каждый метод
repository. Отдельный общий `OutboxPort` со всеми append/claim/update/stats/replay
не создаётся: конкретный repository структурно удовлетворяет нескольким
маленьким контрактам потребителей.

Сохраняется важная граница ошибок. Если HTTP прошёл, но `markPublished` упал,
ошибка выходит наружу и не превращается в `markFailed`: повторная доставка
возможна и допустима at-least-once семантикой. Ошибка metrics не меняет уже
записанный outcome.

## 6. Outbox repository и Unit of Work

`createOutboxRepository(sql)` остаётся одной PostgreSQL-фабрикой и реализует:

- `append(event, aggregateId)` для бизнес-транзакции;
- `claimDue(input)` для batch;
- `markPublished`, `markFailed`, `markDeadLettered` для одной попытки;
- `getStats` для metrics route;
- `replayDeadLettered(eventId)` для ручного восстановления.

Разбивать одну SQL-реализацию на несколько файлов или создавать
`postgres-outbox.repository.ts` не нужно. Разделение проводится на стороне
потребителей через их минимальные структурные типы.

В `auth-unit-of-work.ts` конкретная фабрика по-прежнему используется только для
сборки repositories на одном transaction client. Но публичная форма
`AuthTransactionRepositories` больше не вычисляет append capability через
`ReturnType<typeof createOutboxRepository>`:

```ts
import type { OutgoingIntegrationEvent } from '@/modules/integration-events/outgoing/types/integration-event.type'

interface AppendOutboxEventPort {
  append(event: OutgoingIntegrationEvent, aggregateId: string): Promise<void>
}

export interface AuthTransactionRepositories {
  // остальные transaction repositories без изменений
  outboxEvents: AppendOutboxEventPort
}
```

`registerAccount` не меняет алгоритм: внутри одной `unitOfWork.run` создаёт
account и вызывает
`outboxEvents.append(createAccountCreatedEvent(account.id), account.id)`.
Доставка по HTTP начинается только после commit.

Сигнатуру append с двумя аргументами сохраняем: она уже закреплена в стандарте
и ясно разделяет envelope и routing/aggregate metadata. Отдельная outbox entity
для ещё одного объекта `{ event, aggregateId }` пользы не даёт.

## 7. Сборка модулей и lifecycle

### outgoing.module.ts

`createOutgoingModule(container)` принимает
`Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>` и выполняет
внутреннюю сборку в явном порядке:

1. создать outbox repository и delivery metrics;
2. создать HTTP sender;
3. через `createDeliverEventUseCase` создать `deliverEvent` с state-update port,
   retry policy и metrics;
4. через `createDeliverPendingEventsUseCase` создать `deliverPendingEvents`
   с claim port и `deliverEvent`;
5. через `createOutboxCron` из `cron/outbox.cron.ts` создать cron plugin,
   передав готовый batch-сценарий и настройки расписания.

Именно сюда из корневого module-файла переезжают `DELIVERY_OPTIONS`, request
timeout и создание уникального `publisherId` на экземпляр publisher-а.

Модуль возвращает внутреннему composition root только необходимые возможности:

```ts
return {
  outboxCron,
  collectOutboxStats: outbox.getStats,
  replayDeadLettered: outbox.replayDeadLettered,
}
```

`collectOutboxStats` нужен корневому module-файлу для сборки `/metrics` и не
становится возможностью, которую подключает `app.ts`.

### integration-events.module.ts

Корневой модуль создаёт outgoing один раз, подключает его collector к общему
`createMetricsRoutes` и возвращает стабильный публичный API:

```ts
export const createIntegrationEventsModule = (container: IntegrationEventsDeps) => {
  const outgoing = createOutgoingModule(container)

  return {
    outboxCron: outgoing.outboxCron,
    metricsRoutes: createMetricsRoutes({
      registry: container.metricsRegistry,
      namespace: 'auth',
      collectOutboxStats: outgoing.collectOutboxStats,
    }),
    replayDeadLettered: outgoing.replayDeadLettered,
  }
}
```

В `app.ts` остаются только imports публичных module-файлов. Runtime-путь
сохраняется: `server.ts` создаёт container и integration-events ровно один раз,
передаёт их в `createApp`, а app подключает `outboxCron` и `metricsRoutes` до
группы `/api`.

Текущую сигнатуру `createApp(container, integrationEvents =
createIntegrationEventsModule(container))` можно сохранить: production server
явно передаёт единственный экземпляр, а default удобен изолированному E2E setup.
В отличие от user-service, перенос создания модуля внутрь `app.ts` здесь не даёт
выигрыша: lifecycle фонового cron уже явно принадлежит `server.ts` и Elysia app.

Cron сохраняет `paused: true`, `protect: true`, Promise-returning `run`, resume
в `onStart` и stop в `onStop`. Отдельные `start/stop`, таймер или Worker не
добавляются.

## 8. Поведение и проверки

| Ситуация | Ожидаемое поведение |
|---|---|
| Регистрация account | Account и исходный envelope сохраняются в одной транзакции |
| Ошибка после insert account, но до commit | Откатываются и account, и outbox row |
| Due event и свободный lease | Claim получает уникального owner, attempt увеличивается один раз |
| Успешный HTTP-ответ | Актуальный owner записывает `published_at`, затем учитываются success metrics |
| Network error, 408, 429 или 5xx до лимита | Записывается retry с exponential backoff и jitter |
| Остальной 4xx | Событие сразу переводится в DLQ |
| Retryable error на последней попытке | Событие переводится в DLQ |
| Lease истёк и запись уже забрал другой publisher | Старый owner не меняет state и не записывает outcome metric |
| HTTP прошёл, но запись published state упала | Ошибка выходит из цикла; `markFailed` не вызывается, возможна повторная доставка |
| Metrics выбросили ошибку | Delivery state остаётся записанным, ошибка наблюдения только логируется |
| Replay DLQ | Сохраняются eventId/payload; attempt, next attempt, lock, owner, error и terminal state сбрасываются согласованно |
| Добавлен второй outgoing type для того же consumer | Append, claim, sender, retry, metrics и cron работают без новых веток по `type` |

Существующие unit-тесты сохраняются, но разделяются по реальным границам:

- `deliverPendingEvents`: параметры claim и передача всех записей в
  `deliverEvent`;
- `deliverEvent`: published/retry/DLQ, stale lease, persistence error и
  нефатальная ошибка metrics;
- HTTP sender: 2xx, retryable statuses, permanent 4xx и network failure;
- retry policy: границы exponential delay, cap и jitter;
- error helpers: сохранение классификации retryable/permanent/unknown и
  ограничения длины сообщения при переносе;
- cron: trigger, защита от overlap средствами plugin и cleanup при `app.stop()`;
- module composition: наружу возвращаются cron, metrics и replay, а один
  registry не регистрируется дважды.

PostgreSQL-тесты сохраняют rollback и expired owner и дополняются проверками:

- два publisher-а не получают одну доступную запись одновременно;
- stale owner не может выполнить ни один из трёх terminal/retry updates;
- replay сохраняет исходные `id`, `payload`, `event_type`, `aggregate_id` и
  очищает `lease_owner` вместе с `locked_until`;
- mapper корректно возвращает entity для jsonb payload и timestamp драйвера.

Contract-тест фабрики `createAccountCreatedEvent` остаётся рядом с auth use case:
он проверяет реальный producer payload через `accountCreatedV1Schema`. Менять
его на проверку одного вручную написанного example недостаточно.

Для проверки рецепта расширения при реализации провести временный typecheck-
эксперимент: добавить локальный второй контракт с другим payload, включить его
в `OutgoingIntegrationEvent`, создать фабрику и записать через существующий
append. Проверить, что тот же claim/entity/sender принимает оба типа без
изменений и что фабрика второго типа проходит собственную runtime-схему. Затем
удалить экспериментальный контракт; production-пакет им не загрязняется.

## 9. Порядок реализации

- [x] Синхронизировать `service-structure-standard.md`: группировка outgoing по ролям, технические use cases и размещение нескольких cron-задач в модуле-владельце.
- [x] Перенести сценарии в `outgoing/use-cases/`, retry policy в `outgoing/helpers/`, cron в `outgoing/cron/`; обновить imports в модуле и тестах.
- [x] Разделить `delivery-error.ts` на `errors/event-delivery.error.ts` (класс и классификатор) и `helpers/error-message.ts` (форматирование); обновить все потребители.
- [x] Переименовать фабрики в `createDeliverPendingEventsUseCase` и `createDeliverEventUseCase`, обновить сборку и тесты.
- [x] Добавить `OutgoingIntegrationEvent` в `outgoing/types` и перевести на него repository, sender и тестовые helpers.
- [x] Добавить `ClaimedOutboxEvent` в `entities`, переименовать application field `id` в `eventId`.
- [x] Вынести DB row и `row -> entity` преобразование в `repo/outbox.mapper.ts`.
- [x] Дать `deliverEvent` собственные минимальные deps и delivery-state port.
- [x] Сузить `deliverPendingEvents` до claim + вызова переданной функции одной доставки.
- [x] Убрать re-export `EventDeliveryError` из batch-файла; sender и тесты импортируют его из `errors/event-delivery.error.ts`.
- [x] Добавить `outgoing.module.ts`, перенести в него delivery options и сборку sender/use cases/cron; вычисления retry оставить в `helpers/retry-policy.ts`.
- [x] Оставить в `integration-events.module.ts` сборку публичных возможностей и metrics route.
- [x] Заменить concrete `ReturnType` outbox в `AuthTransactionRepositories` минимальным append-port.
- [x] Сохранить однократное создание `IntegrationEventsModule` в production-пути `server.ts -> createApp`.
- [x] Разделить unit-тесты по batch, single delivery, sender, retry, cron и module composition.
- [x] Дополнить PostgreSQL-проверки concurrency, всех stale-owner updates и replay.
- [x] Из `services/auth-service` выполнить `bun run typecheck` и `bun test`.
- [ ] При настроенной тестовой БД выполнить `bun run test:postgres`: `TEST_DATABASE_URL` сейчас отсутствует.
- [x] Обновить README auth-service: структура и роли файлов outgoing, расположение cron-задач, рецепт нового события и точный replay state reset.

Миграция БД не требуется. Порядок лучше сохранять именно таким: сначала единые
правила размещения и перенос файлов с обновлением imports, затем общие
типы/entity/mapper и разделение функций, после этого module composition и
расширение проверок/README. Существующие тесты обновляются вместе с переносом
и переименованием файлов, чтобы промежуточные изменения оставались проверяемыми.

## 10. Рецепт добавления следующего исходящего события

Предполагается, что событие доставляется тому же consumer-у по
`USER_EVENTS_URL`. Для него:

1. В `integration-event-contracts` добавить закрытую schema, выведенный тип и
   example; сначала развернуть поддержку consumer-а.
2. Добавить тип в `OutgoingIntegrationEvent`, не удаляя версии, ещё лежащие в
   pending/DLQ.
3. В `events` бизнес-модуля-владельца создать `create-<fact>.event.ts`; фабрика
   создаёт `eventId` один раз и возвращает конкретный контракт.
4. В бизнес use case вызвать `outboxEvents.append(event, aggregateId)` внутри
   той же Unit of Work, что и изменение aggregate.
5. Проверить фабрику runtime-схемой, атомарный rollback и прохождение события
   через общий delivery pipeline.
6. Развернуть producer только после consumer-а и наблюдать delivery/DLQ metrics.

При этом `outgoing.module.ts`, `integration-events.module.ts`, repository,
sender, `deliverEvent`, `deliverPendingEvents`, cron и metrics не меняются.

Если новое событие должно доставляться другому независимому consumer-у, этот
рецепт неприменим: текущая таблица хранит один delivery state на envelope. Тогда
сначала нужен отдельный архитектурный план для маршрутизации и состояния каждой
подписки; простое ветвление URL по `event.type` потеряет независимые retry/DLQ
гарантии получателей.

## 11. Результаты реализации и проверки

- Реализовано дерево из раздела 2. Сценарии получают отдельные минимальные
  зависимости; SQL-запросы и delivery policy сохраняют прежнее поведение.
- Обновлены README и стандарт структуры. SQL-рецепт replay теперь повторяет
  `replayDeadLettered`, включая сброс `lease_owner` и условие выбора DLQ-записи.
- `bun run typecheck` — успешно.
- `bun test` — 97 pass, 0 fail, 7 skip. Пропущены пять PostgreSQL-сценариев
  и два hook-блока этой группы: `TEST_DATABASE_URL` не настроен.
  Для cron lifecycle и теста доставки через модуль потребовалось разрешить
  локальные listening sockets вне песочницы.
- Временный второй контракт с payload `{ enabled: boolean, label: string }`
  прошёл проверку своей runtime-схемой, общий typecheck и тест пути
  Unit of Work append -> claim/mapper -> batch -> single delivery -> HTTP sender.
  После проверки временный контракт и его тест удалены; production union
  содержит только реальный `AccountCreatedV1`.
- Миграции, `user-service` и общий пакет контрактов не изменены.
