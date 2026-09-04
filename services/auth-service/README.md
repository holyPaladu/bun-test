# auth-service

Сервис аутентификации на Bun + Elysia. Modular Monolith с чистой архитектурой
внутри каждого модуля.

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

## API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/health/check` | Проверка живости |
| `POST` | `/auth/register` | Регистрация: 201 / 409 / 422 |

Формат ошибки одинаков для всех эндпоинтов:

```json
{ "error": { "code": "USER_ALREADY_EXISTS", "message": "..." } }
```
