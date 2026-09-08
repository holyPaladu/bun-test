# auth-service

Сервис аутентификации на Bun + Elysia. Владеет учётными записями
(`auth_accounts`), login email, password hash, статусом доступа, сессиями и
refresh-токенами. Пользовательские профили принадлежат отдельному
`user-service`. Регистрация атомарно пишет `auth.account-created.v1` в
PostgreSQL outbox; фоновый publisher доставляет событие в `user-service`.

Feature-модули собираются в явно названных `*.module.ts`; `index.ts` не содержит
composition logic. Общий `container.ts` предоставляет только runtime-инфраструктуру.

Межсервисные контракты и механизм их доставки собраны в плоском модуле
`modules/integration-events`. Он не содержит auth-бизнес-правила: use case
регистрации только кладёт событие в outbox внутри своей транзакции.

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
| `GET` | `/metrics` | Outbox delivery/lag/pending/DLQ в формате Prometheus |
| `POST` | `/api/auth/register` | Регистрация: 201 / 409 / 422 |

После миграции `0006_rename_users_to_auth_accounts.sql` доменная сущность и
таблица называются `AuthAccount`/`auth_accounts`, а статус входа —
`authStatus`/`auth_status`. `sessions.user_id` и `refresh_tokens.user_id`
продолжают ссылаться на канонический UUID учётной записи.

## Outbox и повторная доставка

Publisher забирает события lease-пакетами через `FOR UPDATE SKIP LOCKED` и
доставляет их at-least-once на `USER_EVENTS_URL`. `EVENT_DELIVERY_TOKEN` должен
совпадать с `EVENT_CONSUMER_TOKEN` user-service. Сетевые ошибки и ответы не-2xx
получают экспоненциальную задержку от 1 секунды до 5 минут; после 10 попыток
событие переходит в DLQ. Доставку запускает `@elysia/cron` прямо в процессе
сервиса: цикл состоит только из асинхронных SQL/HTTP-операций, поэтому отдельный
Bun Worker ему не нужен. Расписание и timezone задаются через
`OUTBOX_CRON_PATTERN` и `OUTBOX_CRON_TIMEZONE`; retry/lease policy находится в
composition root модуля integration-events.

Перед ручным replay сначала устранить причину и проверить `last_error`. Возврат
конкретного события из DLQ безопасен, поскольку consumer идемпотентен:

```sql
UPDATE outbox_events
SET dead_lettered_at = NULL,
    attempt_count = 0,
    next_attempt_at = now(),
    locked_until = NULL,
    last_error = NULL
WHERE id = '<event-uuid>' AND published_at IS NULL;
```

Формат ошибки одинаков для всех эндпоинтов:

```json
{ "error": { "code": "USER_ALREADY_EXISTS", "message": "..." } }
```
