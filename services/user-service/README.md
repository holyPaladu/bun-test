# user-service

Сервис профилей пользователей. Он принимает access JWT от `auth-service`,
проверяет его локально через remote JWKS и хранит только профильные данные.
Приватных JWT-ключей, паролей, refresh-токенов и auth DB credentials здесь нет.

Feature-модули собираются в явно названных `*.module.ts`; `index.ts` не содержит
composition logic. Общий `container.ts` предоставляет только runtime-инфраструктуру.

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
- `GET /api/users/me` — получить профиль; при отсутствии строки временно создаёт
  пустой профиль по проверенному JWT `sub`;
- `PATCH /api/users/me` — изменить только `displayName`, `avatarUrl`, `locale` и
  `timezone`.

OpenAPI UI доступен на `/swagger`, JSON-описание — на `/swagger/json`.

## Проверки

```bash
bun run typecheck
bun test
bun run build
```

Lazy bootstrap является переходным механизмом до появления transactional outbox
и consumer-а события `auth.account-created.v1`.
