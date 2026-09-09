# user-service

Сервис профилей пользователей. Он принимает access JWT от `auth-service`,
проверяет его локально через remote JWKS и хранит только профильные данные.
Приватных JWT-ключей, паролей, refresh-токенов и auth DB credentials здесь нет.

Feature-модули собираются в явно названных `*.module.ts`; `index.ts` не содержит
composition logic. Общий `container.ts` предоставляет только runtime-инфраструктуру.

Входящие межсервисные события принимает
`modules/integration-events/incoming`. Внутри него HTTP-валидация, inbox
repository, транзакционный use case и dispatcher разделены по ролям.
Бизнес-модули хранят свои обработчики в `events` и экспортируют их через
публичный `*.module.ts`; все обработчики связывает
`integration-events.module.ts`.

## Локальный запуск

```bash
cp .env.example .env
bun install
bun run db:migrate
bun run dev
```

По умолчанию HTTP-сервис слушает `3001`, PostgreSQL users database ожидается на
`5433`, а JWKS auth-service — на `http://localhost:3000/.well-known/jwks.json`.

## Docker

Из корня репозитория `docker compose up --build` запускает оба сервиса, отдельную
PostgreSQL для каждого из них и миграции перед стартом приложений. Для запуска
только user-service с его БД используйте `docker compose up --build user-service`.
JWT-ключи предварительно должны быть заполнены в `services/auth-service/.env`.
Общий токен доставки событий можно переопределить через `EVENT_TOKEN` в корневом
`.env`.

## API

- `GET /health/check` — liveness;
- `GET /health/ready` — проверка соединения с users database;
- `POST /internal/events` — защищённый consumer поддерживаемых событий
  (сейчас `auth.account-created.v1`);
- `GET /api/users/me` — получить существующий профиль по проверенному JWT `sub`;
- `PATCH /api/users/me` — изменить только `displayName`, `avatarUrl`, `locale` и
  `timezone`.

OpenAPI UI доступен на `/swagger`, JSON-описание — на `/swagger/json`.

Событие и inbox reservation обрабатываются в одной DB-транзакции. Повторная
доставка того же `eventId` возвращает успешный no-op, поэтому publisher может
безопасно повторить запрос после сетевого сбоя. Lazy bootstrap удалён: новые
профили создаёт только consumer integration events.

## Как добавить входящее событие

Версионированный контракт сначала публикует producer в
`@test-project/integration-event-contracts`. После этого в user-service:

1. добавьте тип в `incoming/types/integration-event.type.ts`;
2. добавьте runtime-схему в карту `integration-events.schemas.ts`;
3. создайте `events/on-<fact>.ts` в бизнес-модуле и экспортируйте handler
   через его `*.module.ts`;
4. подключите handler map в `integration-events.module.ts` и добавьте ветку
   в `dispatch-integration-event.ts`;
5. проверьте валидный и невалидный payload, duplicate и rollback
   бизнес-эффекта.

TypeScript требует полный набор схем, handlers и веток dispatcher для
всех типов из `IncomingIntegrationEvent`. HTTP route, inbox repository и
`receiveIntegrationEvent` при этом не меняются.

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
