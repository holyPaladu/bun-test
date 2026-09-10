# TODO auth-service

Статус: рабочий checklist к
[roadmap auth-service](../auth-service-roadmap.md). Актуален на 10 сентября 2026
года.

Этот файл предназначен для выполнения задач. Отмечать `[x]` только после того,
как код, тесты и документация из соответствующего блока завершены. Если решение
меняет архитектурное направление, сначала обновить roadmap, а не расширять TODO
по ходу реализации.

## С чего начать сейчас

**AUTH-1: унифицировать readiness** завершена: оба сервиса используют общий
контракт «liveness отдельно, readiness с HTTP 503 при недоступной БД». Следующая
задача — обязательные PostgreSQL-проверки из AUTH-2.

### AUTH-1. Единый readiness endpoint

- [x] В `services/auth-service/src/shared/http/routes/health/health.route.ts`
  переименовать `/db-ready` в `/db/ready`.
- [x] При успешном `SELECT 1` возвращать HTTP 200 и `{ "status": "ok" }`.
- [x] При ошибке БД возвращать HTTP 503 и `{ "status": "not ready" }`, как в
  `user-service`.
- [x] В `health.schema.ts` явно описать ответы 200 и 503.
- [x] Исправить auth e2e-тест: ожидать `/health/db/ready`.
- [x] Добавить тест недоступной БД и проверить именно status 503, а не только
  поле ответа.
- [x] Проверить, что `/health/check` остаётся liveness и не обращается к БД.
- [x] Обновить таблицу API в `services/auth-service/README.md`.
- [x] Удалить описание временного расхождения readiness из README и roadmap.
- [x] Запустить проверки блока ниже.

Проверки AUTH-1:

```bash
cd services/auth-service
bun run typecheck
bun run test:e2e
bun run test:unit
bun run build
```

Готово: оба сервиса используют `GET /health/db/ready`, успешная проверка даёт
200, недоступная БД — 503, а liveness продолжает отвечать независимо от БД.

## Затем: обязательные проверки PostgreSQL

### AUTH-2. Подготовить локальный PostgreSQL gate

- [ ] Запустить `auth-postgres` из корневого `docker-compose.yml`.
- [ ] Создать отдельную базу `auth_test`; не использовать development database
  `auth`.
- [ ] Выполнить существующий `test:postgres` с `TEST_DATABASE_URL`.
- [ ] Убедиться, что реально выполнились все PostgreSQL-тесты и нет `skip`.
- [ ] При найденной ошибке исправить код или тест до перехода к CI.

```bash
docker compose up -d auth-postgres
docker compose exec auth-postgres createdb -U postgres auth_test

cd services/auth-service
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/auth_test \
  bun run test:postgres
```

Повторный `createdb` может сообщить, что база уже существует. Это не ошибка
тестового окружения; создавать её повторно не нужно.

### AUTH-2.1. Добавить CI pipeline

- [ ] Создать CI workflow с PostgreSQL service/container и базой `auth_test`.
- [ ] Устанавливать зависимости через существующий lockfile.
- [ ] Запускать `bun run typecheck`.
- [ ] Запускать `bun run test:unit` и `bun run test:e2e`.
- [ ] Запускать `bun run test:postgres` с обязательным `TEST_DATABASE_URL`.
- [ ] Запускать `bun run build` и `bun run build:migrate`.
- [ ] Сделать job обязательным для merge.
- [ ] Не считать skipped PostgreSQL suite успешной проверкой.

### AUTH-2.2. Проверить настоящие миграции

Текущие PostgreSQL-тесты создают минимальные таблицы вручную. Поэтому отдельно
нужно доказать, что последовательность файлов `migrations/*.sql` применима.

- [ ] На пустой `auth_test` выполнить `bun run db:migrate`.
- [ ] Проверить повторный запуск мигратора: уже применённые миграции не должны
  выполняться повторно.
- [ ] Добавить автоматический тест чистой schema.
- [ ] Добавить upgrade-test с предыдущей поддерживаемой schema.
- [ ] Проверить ограничения и индексы итоговой schema, необходимые account,
  sessions, refresh rotation и outbox.

Готово, когда PR не может пройти без настоящего PostgreSQL и без успешного
применения миграций.

## После CI: эксплуатация outbox

### AUTH-3.1. Correlation и causation

- [ ] Зафиксировать формат `correlationId` и `causationId` в стандарте
  integration events.
- [ ] Принимать или создавать correlation ID на регистрации.
- [ ] Сохранять необходимые identifiers в event envelope/outbox без PII.
- [ ] Передавать identifiers в `user-service`.
- [ ] Добавлять `correlationId`, `eventId` и `eventType` в структурные логи без
  полного payload.
- [ ] Добавить тест прохождения identifiers через factory → outbox → sender.

Если изменение envelope несовместимо с закрытой `v1` schema, не добавлять поле
в существующий контракт молча: выбрать новую версию или backward-compatible
metadata-модель и описать rollout consumer-first.

### AUTH-3.2. Метрики и alerts

- [ ] Зафиксировать назначение каждой outbox-метрики из `/metrics`.
- [ ] Определить warning/critical thresholds для pending age, DLQ count и
  delivery failures.
- [ ] Добавить тест, что retry, published и DLQ меняют нужные метрики.
- [ ] Описать действия оператора для каждого alert.
- [ ] Не включать `eventId`, `userId` и другие high-cardinality значения в
  labels Prometheus.

### AUTH-3.3. Управляемый replay

- [ ] Выбрать операторский интерфейс: CLI/admin job предпочтительнее публичного
  HTTP endpoint.
- [ ] Принимать только конкретный `eventId`; массовый replay делать отдельной
  явно подтверждаемой операцией.
- [ ] Разрешать replay только для DLQ event и сохранять исходный envelope.
- [ ] Логировать actor/reason, но не payload события.
- [ ] Добавить тесты: успешный replay, неизвестный ID, не-DLQ event и повторная
  команда.
- [ ] Обновить runbook в README и убрать ручной SQL как основной путь.

### AUTH-3.4. Retention и failure tests

- [ ] Определить сроки хранения published и dead-lettered rows.
- [ ] Реализовать cleanup небольшими batch без блокировки активного publisher-а.
- [ ] Никогда автоматически не удалять необработанный DLQ без отдельной policy.
- [ ] Проверить restart процесса во время активного lease.
- [ ] Проверить потерю HTTP response после commit consumer-а.
- [ ] Проверить длительную недоступность consumer-а и достижение DLQ.
- [ ] Описать восстановление и безопасный replay в runbook.

Готово, когда событие можно найти, объяснить его состояние и восстановить
доставку без прямого редактирования payload в БД.

## Lifecycle account

### AUTH-4. Сначала спроектировать

- [ ] Описать состояния account и разрешённые переходы block/unblock/delete.
- [ ] Для каждого перехода определить actor, permission, обязательный reason и
  audit record.
- [ ] Определить, что происходит с активными sessions и refresh tokens.
- [ ] Согласовать с `user-service`, нужен ли ему каждый lifecycle event и зачем.
- [ ] Определить retention/anonymization до реализации delete.

### AUTH-4. Реализовать только подтверждённые use cases

- [ ] Добавлять отдельный use case на бизнес-действие, а не универсальный PATCH
  `auth_status`.
- [ ] Изменение account, отзыв sessions и outbox event выполнять одной
  транзакцией там, где это один бизнес-переход.
- [ ] Сначала добавить поддержку нового события consumer-у, затем producer-у.
- [ ] Проверить повтор события, rollback и несовместимый payload.
- [ ] Обновить OpenAPI, README и integration-event contracts.

Не начинать AUTH-4 с добавления сразу всех трёх событий. Первым реализуется
только тот факт, у которого появился реальный consumer use case.

## Security hardening

AUTH-5 выполняется после P0 или раньше отдельными маленькими изменениями, если
сервис выходит в доступную извне среду.

- [ ] Rate limit для register/login/refresh с корректным client IP за proxy.
- [ ] Негативные тесты rate limit без раскрытия существования account.
- [ ] Runbook JWT key rotation с периодом overlap двух публичных keys.
- [ ] Тест токенов старого и нового `kid` во время rotation.
- [ ] Зафиксировать password policy и Argon2 rehash strategy.
- [ ] Добавить dependency/security scanning в CI.
- [ ] Проверить, что логи не содержат password, access token, refresh token и
  приватный JWT key.
- [ ] Добавить security headers и документировать proxy/TLS boundary.

## Финальный gate auth-service

- [x] AUTH-1 завершён.
- [ ] PostgreSQL и migration tests обязательны в CI.
- [ ] Все команды из [общего документа проверок](../../quality-gates.md) зелёные и
  PostgreSQL-тесты не пропущены.
- [ ] Есть outbox alerts, replay и recovery runbook.
- [ ] Lifecycle account реализован только для подтверждённых сценариев.
- [ ] README описывает текущее поведение, roadmap — только оставшуюся работу.
- [ ] Выполненные пункты этого TODO удалены после переноса сохраняемых правил в
  README/стандарты; история выполнения остаётся в Git.
