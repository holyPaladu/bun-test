# Проверки проекта: что запускать и зачем

Статус: действующий checklist. Последний ручной прогон — 10 сентября 2026 года.

Этот документ отвечает на три разных вопроса:

1. компилируется ли код и согласованы ли TypeScript-типы;
2. выполняется ли бизнес-поведение в изоляции и через HTTP-границу;
3. работают ли транзакции, блокировки и ограничения на настоящем PostgreSQL.

Одна зелёная команда не отвечает сразу на все три вопроса. В частности,
`bun test` без `TEST_DATABASE_URL` может закончиться успешно, но пропустить
PostgreSQL-тесты.

## Быстрая проверка изменённого сервиса

Запускать из каталога соответствующего сервиса:

```bash
bun run typecheck
bun test
bun run build
bun run build:migrate
```

| Команда | Для чего нужна | Чего не доказывает |
|---|---|---|
| `bun run typecheck` | Проверяет импорты, сигнатуры, exhaustiveness и TypeScript-контракты без запуска приложения | SQL, сетевое поведение и runtime validation |
| `bun test` | Запускает доступные тесты сервиса | PostgreSQL-сценарии, если не задан `TEST_DATABASE_URL` |
| `bun run build` | Проверяет, что production binary действительно собирается | Что контейнер стартует с реальными secrets и БД |
| `bun run build:migrate` | Проверяет сборку one-shot migration bundle для Docker image | Что миграции применяются к чистой и предыдущей schema |

Для `auth-service` можно быстрее локализовать проблему:

```bash
bun run test:unit
bun run test:e2e
bun run test:postgres
```

- `test:unit` проверяет use cases, JWT, retry/DLQ, outbox orchestration и
  технические helpers с fake/in-memory зависимостями.
- `test:e2e` проходит через реальный Elysia HTTP pipeline, но использует
  in-memory repositories; это проверка маршрутов и связки модулей, не PostgreSQL.
- `test:postgres` проверяет transaction rollback, lease ownership и конкурентный
  claim на реальной СУБД.

В `user-service` `test:postgres` отдельно проверяет атомарность inbox + profile и
конкурентную доставку одного `eventId`. Обычный `bun test` показывает эти тесты
как `skip`, когда тестовая БД не настроена.

## PostgreSQL-проверки

Тестовая база обязательна и должна иметь имя с окончанием `_test`. Это защита от
случайного `DROP TABLE` в development/production database.

Если PostgreSQL из `docker-compose.yml` уже запущены, один раз создать отдельные
базы:

```bash
docker compose exec auth-postgres createdb -U postgres auth_test
docker compose exec user-postgres createdb -U postgres users_test
```

Повторный `createdb` вернёт ошибку «already exists» — это нормально, существующую
тестовую базу можно использовать повторно. Затем из корня репозитория:

```bash
cd services/auth-service
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/auth_test bun run test:postgres

cd ../user-service
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/users_test bun run test:postgres
```

Эти наборы сейчас создают и удаляют свои таблицы. Не направлять их на базу с
ценными данными, даже если её имя случайно заканчивается на `_test`.

## Проверка общей вертикали

После локальных тестов нужен smoke-сценарий с двумя сервисами и двумя БД:

1. `docker compose config --quiet` — проверить синтаксис и подстановку Compose.
2. `docker compose up --build` — собрать images, применить миграции и запустить
   сервисы. Для auth-service заранее сгенерировать JWT keys по его README.
3. Проверить `GET /health/check` обоих сервисов и DB readiness endpoints.
4. Зарегистрировать новый account через `auth-service`.
5. Дождаться публикации `auth.account-created.v1` и получить профиль через
   `GET /api/users/me` с выданным access token.
6. Убедиться по `/metrics` auth-service, что pending/DLQ не растут.

Этот smoke доказывает wiring контейнеров и реальную доставку между процессами.
Он не заменяет тест повторной доставки, rollback и concurrency.

## Что обязательно должно быть в CI

В репозитории пока нет CI workflow. До начала `finance-core` нужен единый pipeline:

1. install с lockfile для обоих сервисов;
2. `typecheck` и обычные тесты;
3. отдельные PostgreSQL databases с суффиксом `_test` и оба `test:postgres`;
4. production build сервера и migration bundle;
5. `docker compose config --quiet`;
6. проверка относительных Markdown-ссылок в `docs/` и service README.

Quality gate считается зелёным только если PostgreSQL job **выполнен**, а не
помечен `skip` из-за отсутствующей переменной.

## Последний зафиксированный прогон

Среда: Bun 1.4.0, снимок репозитория от 10 сентября 2026 года.

| Область | Результат | Что именно проверено |
|---|---|---|
| `auth-service` typecheck | Прошёл | `tsc --noEmit` |
| `auth-service` unit | Прошёл: 89 | Включая cron и локальный HTTP sender; тестам нужен доступ к loopback-порту |
| `auth-service` HTTP e2e | Прошёл: 8 | Полный auth/session HTTP pipeline на in-memory DB |
| `auth-service` build | Прошёл | Server binary и migration bundle |
| `auth-service` PostgreSQL | Не запускался | Нет подготовленной `auth_test`; наличие тестов в коде не равно успешному прогону |
| `user-service` typecheck | Прошёл | `tsc --noEmit` |
| `user-service` tests без PostgreSQL | Прошёл: 21, пропущено: 4 | JWT/JWKS, routes, contract/dispatcher и rollback на fake UoW |
| `user-service` build | Прошёл | Server binary и migration bundle |
| `user-service` PostgreSQL | Не запускался | Четыре теста пропущены без `TEST_DATABASE_URL` |
| Docker Compose config | Прошёл | `docker compose config --quiet`; контейнерный smoke не запускался |
| Ссылки документации | Прошли | Проверены относительные ссылки во всех 13 Markdown-файлах |

Нельзя переносить эту таблицу в README как постоянный badge: это журнал одного
прогона. После настройки CI главным доказательством становится обязательный CI
status, а здесь остаются назначение команд и требования к gate.
