# Roadmap auth-service

Статус: план доработки существующего сервиса, актуален на 10 сентября 2026 года.

Практический порядок выполнения с чекбоксами находится в
[TODO auth-service](todo/auth-service-todo.md). Этот roadmap объясняет решения и
границы, TODO отвечает на вопрос «какой файл менять следующим».

## Текущая ответственность

`auth-service` — единственный владелец login identity и секретов аутентификации:
email для входа, password hash, auth status, sessions, refresh tokens и приватный
JWT key. Сервис уже реализует регистрацию, login, refresh rotation/reuse
detection, logout, управление сессиями, смену пароля, JWT/JWKS и transactional
outbox события `auth.account-created.v1`.

Профиль пользователя, организации, роли, permissions и финансовые операции сюда
не добавляются.

## Что уже достаточно и не требует переписывания

- account и outbox event сохраняются одной транзакцией;
- refresh rotation и отзыв session выполняются транзакционно;
- outbox использует lease owner, retry/backoff, DLQ и ручной replay;
- публичный ключ доступен через JWKS, приватный ключ остаётся в auth-service;
- unit и HTTP e2e покрывают основную auth/session вертикаль;
- `/health/check` отделён от `/health/db/ready`, а недоступная БД возвращается как
  HTTP 503;
- production binary и migration bundle собираются отдельно от исходников.

Следующая работа должна закрывать конкретные пробелы, а не заменять Bun/Elysia,
переносить outbox на Kafka или объединять auth-service с user-service.

## Следующая работа

### AUTH-2. Сделать PostgreSQL и migration tests обязательными — приоритет P0

Тесты rollback account + outbox, lease ownership и concurrent publishers уже
есть, но без `TEST_DATABASE_URL` пропускаются. Нужны CI database, применение всех
миграций на чистой schema и upgrade-test хотя бы с предыдущей версии.

Готово, когда pull request не может стать зелёным при skipped PostgreSQL suite.

### AUTH-3. Закрыть эксплуатацию outbox — приоритет P0

- документировать alert thresholds для pending age, DLQ count и delivery errors;
- добавить correlation/causation ID от регистрации до consumer log;
- предоставить контролируемую operator-команду или admin job для replay вместо
  ручного SQL как единственного интерфейса;
- определить retention/cleanup опубликованных outbox rows;
- проверить restart во время lease, потерянный HTTP response и недоступность
  consumer-а отдельными failure tests.

Готово, когда событие можно обнаружить, диагностировать и безопасно повторить по
runbook без редактирования payload.

### AUTH-4. Определить lifecycle account — приоритет P0

В модели есть `auth_status`, но публичные use cases block/unblock/delete пока не
определены. До добавления endpoints зафиксировать allowed transitions, actor и
audit reason. Если другим владельцам данных действительно нужен этот факт,
добавлять versioned events consumer-first: `auth.account-blocked.v1`,
`auth.account-unblocked.v1`, `auth.account-deletion-requested.v1`.

Не публиковать событие только потому, что изменилось поле таблицы. Нужен
конкретный consumer use case и политика PII/retention.

### AUTH-5. Security hardening — приоритет P1

- rate limit login, refresh и register с понятным ключом и поведением за proxy;
- key rotation runbook: публикация нескольких JWKS keys, overlap и отзыв;
- password policy и стратегия rehash при смене параметров Argon2;
- secret rotation, security headers и dependency scanning;
- audit успешных/неуспешных security-sensitive действий без токенов и паролей.

## Рекомендуемый порядок

1. AUTH-2 — сделать PostgreSQL и migration tests обязательными.
2. AUTH-3 — обеспечить наблюдаемость и восстановление уже существующей доставки.
3. Параллельно закрыть P0 `user-service` из его roadmap.
4. Начать первый organization slice в `finance-core`.
5. AUTH-4 добавлять по реальному lifecycle use case; AUTH-5 усиливать до
   production-подобного развёртывания.

## Критерий «auth-service достаточно готов»

- readiness единообразно сигнализирует failure через 503;
- PostgreSQL и migration suites обязательны в CI;
- регистрация + outbox и refresh/session race cases проверяются на PostgreSQL;
- DLQ, replay, retention и alerts имеют операционный runbook;
- lifecycle account и JWT key rotation имеют явный контракт;
- financial core зависит только от JWT/JWKS и integration events, но не от auth DB.
