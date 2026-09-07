# user-service

Сервис профилей пользователей. Он принимает access JWT от `auth-service`,
проверяет его локально через remote JWKS и хранит только профильные данные.
Приватных JWT-ключей, паролей, refresh-токенов и auth DB credentials здесь нет.

Feature-модули собираются в явно названных `*.module.ts`; `index.ts` не содержит
composition logic. Общий `container.ts` предоставляет только runtime-инфраструктуру.

Все входящие межсервисные события собраны в плоском модуле
`modules/integration-events`: контракты, inbox, dispatcher и HTTP-адаптер лежат
рядом и не смешиваются с публичными profile routes.

## Локальный запуск

```bash
cp .env.example .env
bun install
bun run db:migrate
bun run dev
```

По умолчанию HTTP-сервис слушает `3001`, PostgreSQL users database ожидается на
`5433`, а JWKS auth-service — на `http://localhost:3000/.well-known/jwks.json`.

## API

- `GET /health/check` — liveness;
- `GET /health/ready` — проверка соединения с users database;
- `POST /internal/events` — защищённый consumer `auth.account-created.v1`;
- `GET /api/users/me` — получить существующий профиль по проверенному JWT `sub`;
- `PATCH /api/users/me` — изменить только `displayName`, `avatarUrl`, `locale` и
  `timezone`.

OpenAPI UI доступен на `/swagger`, JSON-описание — на `/swagger/json`.

Событие и inbox reservation обрабатываются в одной DB-транзакции. Повторная
доставка того же `eventId` возвращает успешный no-op, поэтому publisher может
безопасно повторить запрос после сетевого сбоя. Lazy bootstrap удалён: новые
профили создаёт только consumer integration events.

## Нужен ли backfill

В коде постоянной backfill-job нет. Она не нужна для чистого развёртывания:
каждая новая регистрация уже создаёт outbox event. Backfill требуется только
один раз, если к моменту rollout в `auth_accounts` есть ценные существующие
записи без профилей. В таком случае это отдельная deployment-операция с
временными read credentials auth DB и write credentials users DB, а не часть
runtime `user-service`.

## Проверки

```bash
bun run typecheck
bun test
bun run build
```

Для внутреннего endpoint задайте `EVENT_CONSUMER_TOKEN` тем же случайным
значением (не менее 16 символов), что и `EVENT_DELIVERY_TOKEN` auth-service.
