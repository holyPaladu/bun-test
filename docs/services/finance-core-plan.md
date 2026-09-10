# План finance-core

Статус: план нового сервиса; реализация ещё не начата. Актуален на 10 сентября
2026 года.

## Решение

Следующим новым runtime-сервисом будет `finance-core` с одной PostgreSQL. Это
модульный монолит: organization/access, payment requests, approvals, reservations,
payments и ledger разделяются в коде, но пока не разделяются сетью и базами.

Причина проста: резерв денег, смена состояния платежа и ledger posting требуют
строгих транзакций. Преждевременное деление на микросервисы добавит распределённые
сбои раньше, чем появятся нагрузка, команды или независимый lifecycle, которые
это оправдают.

## Что остаётся в старых сервисах

| Владелец | Его данные и решения | Чего там не должно быть |
|---|---|---|
| `auth-service` | Login email, password hash, auth status, sessions, JWT/JWKS | Профиль, membership, roles, payments |
| `user-service` | Глобальный профиль: имя, avatar reference, locale, timezone | Login secrets, organization roles, финансовые данные |
| `finance-core` | Organizations, membership/permissions и весь финансовый процесс | Пароли, refresh tokens, приватные JWT keys |

`finance-core` принимает access JWT, использует `sub` как глобальный user ID и
сам проверяет membership/permission для выбранной organization. Доверять одному
`organizationId` из body нельзя.

## Модули внутри finance-core

```text
organizations-access
beneficiaries
payment-requests
workflow-approvals
accounts-limits-reservations
risk
payments
provider-adapters
ledger
reconciliation
audit
```

Это каталоги/границы ответственности, а не отдельные deployable services. Модуль
владеет своими таблицами и не разрешает соседям выполнять произвольные update в
них. Межмодульный синхронный вызов идёт через типизированный use case/port;
domain events остаются внутри процесса, integration events предназначены для
внешних consumers.

Notifications и analytics не входят в первую вертикаль. Сначала они могут быть
простыми consumers финансовых событий; выделять отдельный сервис стоит только
после появления независимого масштабирования или lifecycle.

## Первый slice: organization и membership

Первый slice специально не содержит платежей. Его задача — доказать tenant
isolation, на которой будут стоять все последующие финансовые use cases.

### Минимальные данные

- `organizations`: `id`, `name`, `status`, timestamps;
- `memberships`: `id`, `organization_id`, `user_id`, `role`, `status`, timestamps;
- системные roles на старте: `OWNER`, `ADMIN`, `MEMBER`;
- явный permission catalog в коде; кастомные роли отложены.

До миграции нужно отдельно решить: нормализацию имени, можно ли иметь повторное
membership после удаления, состояния invitation и способ гарантировать хотя бы
одного активного OWNER.

### Минимальные use cases/API

Названия URL предварительные и должны быть закреплены в design document/OpenAPI
до реализации:

1. создать organization и atomically сделать requester её OWNER;
2. получить organization только при активном membership;
3. пригласить/add member при наличии permission;
4. получить список members с pagination;
5. изменить role без возможности удалить последнего OWNER;
6. деактивировать membership с audit reason.

Не добавлять общий CRUD repository наружу и не делать endpoint «изменить любые
поля membership». Каждый endpoint соответствует бизнес-действию и проверяет
actor, tenant, state transition и permission.

### Обязательные проверки slice

- пользователь tenant A не читает и не меняет tenant B;
- `organizationId` из body не обходит server-side membership check;
- создание organization + OWNER откатывается целиком при ошибке;
- повтор запроса с тем же idempotency key не создаёт вторую organization;
- два конкурентных принятия одного invitation дают один active membership;
- два конкурентных удаления OWNER не оставляют organization без владельца;
- pagination стабильна и ограничена;
- audit фиксирует actor, organization, действие, reason и correlation ID;
- миграции проходят на чистой и предыдущей schema.

Slice готов только после PostgreSQL integration и concurrency tests. Fake unit
test не доказывает row lock, unique constraint или transaction isolation.

## Следующие slices внутри того же сервиса

1. Beneficiary + draft Payment Request.
2. Submit и versioned state machine Payment Request.
3. Workflow definition/version + approval instance/history.
4. Account, limit и reservation с тестом concurrent overspend.
5. Rule-based risk с объяснимым snapshot/decision.
6. Payment + PaymentAttempt + sandbox provider/webhook.
7. Double-entry ledger и reversal.
8. Reconciliation, затем projections/analytics.

Подробные инварианты и критерии каждого этапа остаются в
[общем roadmap](../roadmap.md); этот документ отвечает за deployment boundary и
первую реализуемую вертикаль.

## Когда всё-таки выделять новый сервис

Выделение модуля рассматривается только при наличии хотя бы одной измеренной
причины:

- независимая команда и release cadence;
- существенно отдельный профиль нагрузки или масштабирования;
- отдельная security/compliance boundary;
- изоляция отказа важнее локальной транзакции;
- модуль уже имеет стабильный контракт и не требует общих таблиц/транзакций.

До этого новый бизнес-модуль создаётся внутри `finance-core`. Kafka, Redis и
отдельная БД не являются автоматической частью scaffolding.
