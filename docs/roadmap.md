# Roadmap B2B fintech-платформы

Статус: основной план дальнейшей разработки, актуален на 10 сентября 2026 года.

## Решение по сервисам

| Компонент | Решение сейчас | Следующее действие |
|---|---|---|
| `auth-service` | Оставить отдельным и доработать | Закрыть P0 из [плана auth-service](services/auth-service-roadmap.md) |
| `user-service` | Оставить отдельным и доработать | Закрыть P0 из [плана user-service](services/user-service-roadmap.md) |
| `finance-core` | Создать следующим как модульный монолит | Реализовать [organization/membership slice](services/finance-core-plan.md) |
| notifications / analytics | Пока не создавать | Вернуться после надёжных financial events и реального consumer use case |
| отдельные organization/payment/ledger services | Не создавать | Рассматривать только по критериям выделения из плана `finance-core` |

То есть ближайшая работа — не третий маленький микросервис и не Kafka. Сначала
делаем воспроизводимыми гарантии двух существующих сервисов, затем строим одну
tenant-safe вертикаль в `finance-core`.

## Откуда начинаем

В репозитории уже есть:

- `auth-service`: accounts, sessions, refresh rotation, JWT/JWKS и transactional
  outbox;
- `user-service`: профиль, JWT verification, transactional inbox и обработка
  `auth.account-created.v1`;
- общий package версионированных integration-event contracts;
- отдельные PostgreSQL и Docker Compose;
- стандарты структуры сервисов и integration events.

Это foundation идентичности, но ещё не fintech domain. Следующая цель — один
сквозной сценарий Payment Request от tenant membership до безопасного ledger
posting. Новые финансовые возможности следует строить в одном модульном монолите
(`finance-core`), а не сразу создавать набор микросервисов.

## Правило работы над каждым модулем

До реализации зафиксировать:

1. business problem и владельца данных;
2. entities/value objects и термины;
3. invariants и state transitions;
4. transaction boundaries;
5. race conditions и выбранный механизм защиты;
6. idempotency scope и ключ;
7. schema/constraints/indexes;
8. use cases и API;
9. domain/integration events;
10. unit, PostgreSQL integration, concurrency и failure tests.

После этого реализуется только минимальная вертикаль с измеримым критерием
готовности.

## Этап 0. Закрепить foundation

Цель: не строить финансовый домен на неясной identity-модели.

- выполнить P0 из [roadmap user-service](services/user-service-roadmap.md);
- выполнить P0 из [roadmap auth-service](services/auth-service-roadmap.md);
- запускать PostgreSQL и contract tests обоих сервисов в CI;
- определить correlation ID между HTTP, outbox и incoming consumer;
- описать локальный bootstrap/demo environment и secret handling;
- принять соглашение о UUID, timestamps, money minor units и currency code.

Готово: новая регистрация надёжно создаёт профиль, повтор/сбой наблюдаемы, все
обязательные проверки воспроизводятся одной CI-командой.

## Этап 1. Organization, membership и permissions

Business problem: пользователь должен действовать только внутри организаций, в
которых состоит, с полномочиями для конкретного use case.

Минимальные модели: Organization, Membership, Role, Permission, RoleAssignment.
Начальный набор permissions может быть системным, а кастомные роли — данными.
Owner не должен случайно исчезнуть из организации; приглашение и активация
membership имеют явные состояния.

Ключевые проверки:

- tenant isolation на каждом query/command;
- уникальность активного membership `(organization, user)`;
- конкурентное принятие invitation;
- запрет последнему owner покинуть организацию;
- audit выдачи и отзыва permissions.

Готово: два tenant-а не видят данные друг друга, а permission checks проверены
негативными integration tests.

## Этап 2. Beneficiary и Payment Request

Модели: Beneficiary, PaymentRequest, Money, ExpenseCategory. Начальная state
machine: DRAFT → SUBMITTED → IN_REVIEW → APPROVED; альтернативы REJECTED,
CANCELLED, EXPIRED. PAYMENT_PENDING/PAID появляются только после payment phase.

Решения до реализации:

- какие поля разрешено менять после submit;
- snapshot каких beneficiary/account данных хранит request;
- кто может cancel на каждом состоянии;
- idempotency создания и submit;
- optimistic version для конкурентных переходов.

Готово: невозможный переход отвергается, повтор submit безопасен, история
изменений не теряется.

## Этап 3. Workflow и approvals

Отделить WorkflowDefinition/Version/Rule от конкретного WorkflowInstance и
ApprovalStep. Заявка должна сохранять выбранную версию workflow, чтобы изменение
правил не переписало уже начатое согласование.

Начать с последовательных шагов и детерминированных условий amount/category/
department. Параллельные branches, delegation и escalation добавлять позже.

Критические случаи: два решения одного approver-а, отзыв permission после
назначения, изменение суммы после approval, reject на позднем шаге, повторный
HTTP request.

Готово: approval history append-only, единственное допустимое решение шага
фиксируется атомарно, итог request вычисляется однозначно.

## Этап 4. Accounts, limits и reservations

До внешних платежей реализовать безопасную модель доступности денег. Account
имеет currency/status; Reservation имеет amount, reason, lifecycle и expiry.
Материализованный available balance должен быть доказуемо связан с ledger или
контрольным balance model, а не обновляться произвольно.

Проверить конкурентный пример: при доступных 10M две заявки на 8M не могут обе
получить active reservation. Выбрать один понятный механизм — row lock либо
conditional atomic update с constraint — и доказать его concurrency test-ом.

Limits начать с organization daily и account daily. User/department/monthly
добавлять только с определённой семантикой timezone, периода, refund/reversal и
конкурентного счётчика.

Готово: reserve/capture/release/expire идемпотентны, overspend невозможен под
параллельной нагрузкой.

## Этап 5. Rule-based risk

RiskEvaluation хранит decision, причины, входной snapshot, версию rule set и
время. Первая версия: large payment, new beneficiary, daily limit и frequency.

ALLOW продолжает процесс; BLOCK завершает его по политике; REVIEW создаёт
отдельную manual-review задачу, а не маскируется approval-ом. Повтор evaluation
с тем же request version не создаёт противоречивых эффектов.

Готово: одинаковый snapshot и версия правил дают объяснимый результат, каждое
решение можно восстановить для аудита.

## Этап 6. Payments и sandbox provider

Разделить Payment и PaymentAttempt. Перед вызовом provider-а зафиксировать
attempt и stable idempotency key. Timeout означает UNKNOWN/PROCESSING, а не
автоматический FAILED и не немедленную новую оплату.

Нужны provider adapter, sandbox с управляемыми исходами, webhook signature,
deduplication, state machine и reconciliation-friendly external IDs.

Готово: повтор create/execute/webhook не создаёт второй перевод; неизвестный
результат разрешается polling/webhook, а не опасным retry.

## Этап 7. Double-entry ledger

Сначала определить chart of accounts и accounting mapping для reservation,
payment success, fee, failure и reversal. Затем реализовать LedgerTransaction и
две или более LedgerEntry с balance constraint до posting.

Posting получает уникальный business reference. Posted transaction immutable;
исправление создаёт связанную reversal transaction. Ledger не принимает
произвольные debit/credit команды из HTTP API — только типизированные business
operations от владельцев процессов.

Готово: debit=credit проверяется транзакционно, повтор posting безопасен,
reversal сохраняет полную трассу, balances сходятся с entries.

## Этап 8. Reliable events и решение о Kafka

Financial core создаёт domain events внутри процесса и integration events через
transactional outbox. Notifications, audit projection и analytics могут стать
первыми независимыми consumers.

На этом этапе применить критерии из [Kafka ADR](architecture/kafka-adoption.md).
Если критерии не достигнуты, продолжить с PostgreSQL workers/HTTP без ущерба для
архитектуры. Если достигнуты — провести один некритичный пилот, сохранив inbox и
бизнес-идемпотентность.

Готово: crash после commit, duplicate delivery, poison message и replay имеют
проверенное поведение и операционный runbook.

## Этап 9. Reconciliation

Импортировать immutable external bank transactions, запускать matching runs и
хранить result: MATCHED, UNMATCHED, AMOUNT_MISMATCH, DUPLICATE или
MISSING_EXTERNAL_TRANSACTION. Ручное разрешение mismatch требует reason и audit.

Готово: повторный импорт выписки безопасен, автоматический match объясним,
unmatched items видимы и не удаляются исправлением внутреннего payment задним
числом.

## Этап 10. Production engineering

- append-only audit records для критических действий;
- structured logs, metrics, traces и SLO;
- rate limits, secret rotation, webhook security и least privilege DB users;
- backup/restore и disaster-recovery drills;
- migration compatibility и zero-downtime rollout;
- load, concurrency, fault-injection и recovery tests;
- retention, privacy и incident runbooks.

## Этап 11. Analytics

Строить projections поверх ledger/payment/approval/risk events: spending по
периоду, категории и beneficiary, approval duration, payment failure rate,
risk-blocked amount. Dashboard не должен становиться вторым источником истины для
баланса.

## Ближайшие три результата

1. Закрытый P0 `auth-service` и `user-service`, обязательные PostgreSQL tests в
   CI и зелёный [набор проверок](quality-gates.md).
2. Уточнённый design document для Organization/Membership/Permissions на основе
   [плана `finance-core`](services/finance-core-plan.md) и правила десяти пунктов
   выше.
3. Первый вертикальный slice: создать organization, добавить membership, проверить
   permission и доказать tenant isolation — без Kafka и без payment CRUD.
