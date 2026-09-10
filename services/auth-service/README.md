# auth-service

Общий план развития платформы находится в
[`docs/roadmap.md`](../../docs/roadmap.md). Фактические endpoint-контракты следует
смотреть в OpenAPI сервиса; README описывает архитектуру и эксплуатацию.

Сервис аутентификации на Bun + Elysia. Владеет учётными записями
(`auth_accounts`), login email, password hash, статусом доступа, сессиями и
refresh-токенами. Пользовательские профили принадлежат отдельному
`user-service`. Регистрация атомарно пишет `auth.account-created.v1` в
PostgreSQL outbox; фоновый publisher доставляет событие в `user-service`.

Feature-модули собираются в явно названных `*.module.ts`; `index.ts` не содержит
composition logic. Общий `container.ts` предоставляет только runtime-инфраструктуру.

Механизм доставки находится в `modules/integration-events/outgoing`, общие
межсервисные контракты — в `packages/integration-event-contracts`.
Use case регистрации создаёт событие через `auth/events` и кладёт его в outbox
внутри своей транзакции; HTTP-доставка начинается после commit.

## Структура outgoing

| Путь внутри `modules/integration-events/outgoing/` | Ответственность |
|---|---|
| `outgoing.module.ts` | Сборка repository, metrics, sender, use cases и cron |
| `use-cases/deliver-pending-events.ts` | Claim одного batch и параллельный вызов доставки каждого события |
| `use-cases/deliver-event.ts` | Одна попытка и запись published/retry/DLQ с проверкой lease owner |
| `errors/event-delivery.error.ts` | Ошибка транспорта и классификация возможности повтора |
| `helpers/retry-policy.ts`, `helpers/error-message.ts` | Чистые retry-вычисления и ограниченное по длине сообщение ошибки |
| `cron/outbox.cron.ts` | Расписание, защита от overlap и lifecycle задачи |
| `types/integration-event.type.ts` | Единый union исходящих контрактов |
| `entities/outbox.entity.ts` | Зарезервированное событие `ClaimedOutboxEvent` |
| `repo/outbox.repository.ts`, `repo/outbox.mapper.ts` | SQL, модель PostgreSQL row и преобразование в entity |
| `http/send-event.http.ts` | HTTP-запрос к consumer-у |
| `metrics/delivery.metrics.ts` | Метрики попыток, длительности и задержки доставки |

`integration-events.module.ts` связывает outgoing с общим `/metrics` и
экспортирует `outboxCron`, `metricsRoutes`, `replayDeadLettered`. `server.ts`
создаёт модуль один раз и передаёт его в `createApp`.

Каждая следующая задача по расписанию получает свой `cron/<purpose>.cron.ts`
в модуле-владельце и уникальные имена плагина и job. Несколько задач outgoing
собираются в `outgoing.module.ts` в единый `outgoingCron`. Cron вызывает
прикладной сценарий; HTTP-адаптеры остаются в `http/`.

## Запуск

```bash
cp .env.example .env      # вписать DATABASE_URL
bun install
bun run db:migrate
bun run dev
```

## Скрипты

| Команда | Что делает |
|---|---|
| `bun run dev` | Сервер в watch-режиме |
| `bun run start` | Сервер без watch |
| `bun test` | Тесты (интеграционные пропускаются без `TEST_DATABASE_URL`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run db:migrate` | Применить миграции из `migrations/` |
| `bun run build` | Скомпилировать сервер в `build/.output` |
| `bun run build:migrate` | Собрать бандл миграций в `build/scripts/migrate.js` |
| `bun run build:start` | Скомпилировать и запустить бинарь |

Назначение каждого уровня тестов, настройка `auth_test` и последний
зафиксированный результат находятся в
[`docs/quality-gates.md`](../../docs/quality-gates.md). Важно: без
`TEST_DATABASE_URL` команда `bun test` пропускает PostgreSQL suite.

## Docker

`docker compose up --build` из корня репозитория. В образе лежит только сборка,
без исходников и `node_modules`: сервер — бинарь `/app/auth-service` (тот же,
что даёт `bun run build`), миграции до его старта — `bun /app/scripts/migrate.js`.

Production-сборка проходит обязательный quality gate: `bun run typecheck` и
`bun test`. При ошибке типов или тестов `docker build` завершается с ошибкой;
тестовые файлы и dev-зависимости в финальный образ не копируются. Только проверки
можно запустить отдельно командой `docker build --target test .`.

## API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/health/check` | Проверка живости |
| `GET` | `/health/db/ready` | Текущая проверка соединения с auth database; состояние возвращается в body |
| `GET` | `/metrics` | Outbox delivery/lag/pending/DLQ в формате Prometheus |
| `GET` | `/.well-known/jwks.json` | Публичные JWT-ключи |
| `POST` | `/api/auth/register` | Регистрация: 201 / 409 / 422 |
| `POST` | `/api/auth/login` | Вход и создание сессии |
| `POST` | `/api/auth/refresh-token` | Атомарная ротация refresh-токена |
| `POST` | `/api/auth/logout` | Завершение текущей сессии |
| `POST` | `/api/auth/logout-all` | Завершение всех сессий пользователя |
| `GET` | `/api/auth/sessions` | Страница активных сессий пользователя |
| `DELETE` | `/api/auth/session/:id` | Отзыв выбранной сессии пользователя |
| `PUT` | `/api/auth/change-password` | Смена пароля и отзыв сессий |

Точные body, query, response и security schemas публикуются в OpenAPI UI на
`/swagger`, JSON-описание — на `/swagger/json`.

`/health/db/ready` возвращает HTTP 200 после успешного `SELECT 1` и HTTP 503 при
недоступной auth database. Оба сервиса используют этот единый readiness contract;
`/health/check` остаётся liveness и не обращается к БД.

После миграции `0006_rename_users_to_auth_accounts.sql` доменная сущность и
таблица называются `AuthAccount`/`auth_accounts`, а статус входа —
`authStatus`/`auth_status`. `sessions.user_id` и `refresh_tokens.user_id`
продолжают ссылаться на канонический UUID учётной записи.

## Outbox и повторная доставка

Publisher забирает события lease-пакетами через `FOR UPDATE SKIP LOCKED` и
доставляет их at-least-once на `USER_EVENTS_URL`. `EVENT_DELIVERY_TOKEN` должен
совпадать с `EVENT_CONSUMER_TOKEN` user-service. Сетевые ошибки, HTTP 408, 429
и 5xx получают exponential retry: базовая задержка от 1 секунды до 5 минут,
затем jitter ±20% (итог может достигать 6 минут). После 10 попыток событие
переходит в DLQ; остальные 4xx отправляются в DLQ сразу.
Доставку запускает `@elysia/cron` прямо в процессе
сервиса: цикл состоит только из асинхронных SQL/HTTP-операций, поэтому отдельный
Bun Worker ему не нужен. Расписание и timezone задаются через
`OUTBOX_CRON_PATTERN` и `OUTBOX_CRON_TIMEZONE`; retry/lease policy находится в
`outgoing/outgoing.module.ts`.

Перед ручным replay сначала устранить причину и проверить `last_error`. Возврат
конкретного события из DLQ безопасен, поскольку consumer идемпотентен:

```sql
UPDATE outbox_events
SET dead_lettered_at = NULL,
    attempt_count = 0,
    next_attempt_at = now(),
    locked_until = NULL,
    lease_owner = NULL,
    last_error = NULL
WHERE id = '<event-uuid>' AND dead_lettered_at IS NOT NULL;
```

Этот SQL повторяет `replayDeadLettered(eventId)`: исходные `id`, payload,
event type и aggregate id сохраняются, попытки, lease и DLQ-состояние
сбрасываются. Следующий batch доставит тот же envelope.

## Добавление исходящего события

Для нового события тому же consumer-у по `USER_EVENTS_URL`:

1. Добавить schema, выведенный тип и example в `integration-event-contracts`;
   сначала развернуть поддержку consumer-а.
2. Включить тип в `OutgoingIntegrationEvent`; сохранять старые версии,
   пока они могут находиться в pending или DLQ.
3. Создать `events/create-<fact>.event.ts` в бизнес-модуле-владельце.
   Фабрика создаёт `eventId` один раз и возвращает конкретный контракт.
4. В use case вызвать `outboxEvents.append(event, aggregateId)` в той же
   Unit of Work, что и изменение бизнес-состояния.
5. Проверить реальную фабрику runtime-схемой, rollback и прохождение доставки;
   развернуть producer и наблюдать метрики.

Общий claim/sender/retry/cron не требует ветвления по `event.type`.
Другой независимый consumer требует отдельного решения для маршрутизации и
состояния каждой подписки: текущая outbox хранит одно состояние доставки
на envelope.

Формат ошибки одинаков для всех эндпоинтов:

```json
{ "error": { "code": "USER_ALREADY_EXISTS", "message": "..." } }
```
