# B2B Fintech / Expense & Payment Platform

Статус: действующее продуктовое и архитектурное направление.

## Цель

Платформа помогает компании управлять корпоративными расходами от намерения
потратить деньги до сверки с банком. Это backend-first учебный проект, но его
модель должна выдерживать реальные fintech-сценарии: повтор запроса, одновременные
действия, падение процесса между шагами и повторную доставку сообщений.

Основной процесс:

```text
Employee → Payment Request → Approval Workflow → Risk & Limits
         → Reservation → Payment → Provider → Ledger
         → Reconciliation → Analytics
```

## Главные понятия

- **Organization** — tenant и владелец финансовых данных.
- **Membership** — участие пользователя в организации; здесь находятся роли,
  permissions, department и статус участия.
- **Account** — корпоративный источник денег. Отображаемый balance не является
  произвольно изменяемым числом.
- **Beneficiary** — внешний получатель и его платёжные реквизиты.
- **Payment Request** — бизнес-намерение: зачем, кому и сколько хотят заплатить.
- **Workflow / Approval** — правила согласования и неизменяемая история решений.
- **Risk Evaluation** — решение ALLOW, REVIEW или BLOCK с зафиксированными
  причинами и версией правил.
- **Reservation** — конкурентно безопасное удержание доступных средств.
- **Payment** — логическая операция оплаты; **Payment Attempt** — отдельная
  попытка у provider-а. Одна заявка может породить несколько попыток.
- **Ledger Transaction / Entry** — бухгалтерское отражение движения денег по
  double-entry правилам.
- **Reconciliation** — сопоставление внутреннего результата с данными банка.
- **Audit Record** — append-only свидетельство бизнес-действия.

Payment Request, Payment, provider transaction и Ledger Transaction нельзя
объединять в одну сущность или одну универсальную таблицу `transactions`.

## Неприкосновенные инварианты

1. Любой доступ к tenant-данным проверяет membership и `organizationId` на
   сервере; идентификатор tenant-а из тела запроса сам по себе не является
   основанием доступа.
2. Денежная сумма хранится в minor units целым числом вместе с ISO currency.
   Арифметика разных валют запрещена без отдельной операции конвертации.
3. Каждый переход состояния явно разрешён state machine; терминальные состояния
   нельзя «откатывать» обычным update.
4. Каждая posted ledger transaction сбалансирована: сумма debit равна сумме
   credit. Posted entries не редактируются; исправление делается reversal.
5. Резервирование не позволяет двум конкурентным операциям потратить одни и те
   же доступные средства.
6. Идемпотентность обязательна для создания/исполнения платежа, provider
   webhook, event consumer и ledger posting.
7. Бизнес-изменение и его outbox event фиксируются одной DB-транзакцией.
   Consumer применяет inbox/unique constraint и бизнес-эффект атомарно.
8. Approval, risk decision, provider response, posting и reversal оставляют
   audit trail с actor, временем, причиной и correlation/causation identifiers.
9. Eventual consistency допустима для уведомлений и аналитики, но не заменяет
   транзакционную защиту резервов, лимитов и ledger.
10. Секреты и платёжные реквизиты не попадают в события, обычные логи и ответы,
    если это не требуется конкретным контрактом.

## Архитектурная граница

Репозиторий уже содержит отдельные `auth-service` и `user-service`. Не следует
из-за этого продолжать дробление на сервис для каждой сущности. Финансовое ядро
нужно начать как **модульный монолит** с одной PostgreSQL и модулями:

```text
organizations / access
beneficiaries
payment-requests
workflow / approvals
accounts / limits / reservations
risk
payments / provider-adapters
ledger
reconciliation
audit / notifications / analytics
```

Внутри финансового ядра синхронные инварианты могут пользоваться одной локальной
транзакцией, но модули не должны произвольно изменять таблицы друг друга. Снаружи
ядро интегрируется через версионированные API и integration events.

`auth-service` владеет credentials и sessions. `user-service` владеет глобальным
профилем человека. Membership, роли и permissions конкретной организации
принадлежат финансовому ядру, а не user-service: один пользователь может состоять
в нескольких организациях с разными полномочиями.

## Что сознательно не входит в первый релиз

- реальный банковский API вместо sandbox provider;
- ML antifraud;
- Kubernetes, Elasticsearch и отдельная БД на каждый модуль;
- Redis без измеренной задачи для cache, rate limit или distributed coordination;
- Kafka до появления нескольких независимых consumers или иных критериев из
  [решения по Kafka](../architecture/kafka-adoption.md);
- frontend до стабилизации главной domain model и use cases.

