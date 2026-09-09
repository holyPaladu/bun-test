# Kafka: критерии и план внедрения

Статус решения: **отложено, интерфейсы готовим к замене транспорта**.

## Решение сейчас

Не добавлять Kafka на текущем этапе. Между `auth-service` и `user-service` есть
один producer, один consumer и уже работающая надёжная связка PostgreSQL outbox
→ HTTP → transactional inbox. Kafka не исправит доменную модель, multi-tenancy,
резервы или ledger, но добавит cluster operations, schema compatibility,
partitioning, consumer lag, retention, replay и новый класс отказов.

При этом integration event не должен зависеть от HTTP. Envelope, producer outbox
и consumer inbox сохраняются. Транспортный adapter можно заменить позже без
изменения бизнес-use-cases.

## Когда пересмотреть решение

Kafka становится обоснованной, когда выполняется хотя бы один сильный критерий:

- одно событие независимо потребляют три и более подсистемы, например audit,
  notifications, analytics и risk projections;
- HTTP fan-out и отдельное состояние доставки для каждого consumer-а становятся
  заметно сложнее брокера;
- нужен replay большого потока для восстановления projections;
- измеренный throughput/latency или пики превышают возможности текущих workers;
- consumers должны масштабироваться независимо и временно отставать без давления
  на producer;
- команде нужна долговечная event backbone и есть готовность её эксплуатировать:
  monitoring, on-call, capacity planning, upgrades и disaster recovery.

Сам по себе рост количества таблиц, сервисов или строк кода не является причиной
для Kafka.

## Где Kafka будет полезна в этой платформе

Вероятная первая точка — события после надёжно зафиксированного финансового
результата:

- `PaymentSucceeded` → ledger posting, notification, audit projection;
- `LedgerTransactionPosted` → analytics и reporting projections;
- `ReconciliationMatched/Failed` → operations dashboard и notifications.

Для критической цепочки «проверить доступный остаток → зарезервировать деньги →
разрешить payment» Kafka не заменяет одну строгую transaction boundary. На раннем
этапе эти действия должны оставаться внутри финансового модульного монолита.

## Целевая семантика

- доставка at-least-once; обещание exactly-once на уровне бизнеса не даётся;
- producer пишет domain state и outbox одной PostgreSQL-транзакцией;
- relay публикует стабильный event ID как message key/id;
- partition key выбирается по требуемому порядку, обычно `organizationId`,
  `paymentId` или `accountId`, а не случайно;
- consumer атомарно фиксирует inbox marker и локальный бизнес-эффект;
- порядок гарантируется только внутри partition и не используется как замена
  state/version checks;
- контракты версионируются, consumers сначала принимают новую версию, producer
  разворачивается после них;
- PII и банковские реквизиты минимизируются; события не становятся копией строки
  БД;
- retry topics/DLQ имеют владельца, alert и процедуру replay. DLQ без runbook —
  это потеря данных с задержкой.

## Этапы миграции

1. **Сейчас:** оставить HTTP delivery, стабилизировать envelope, event naming,
   outbox/inbox, correlation и contract tests.
2. **Накопить факты:** измерять event rate, payload size, delivery latency,
   retry/DLQ и число независимых consumers.
3. **Спроектировать:** topic ownership, partition keys, retention, ACL/TLS,
   quotas, schema compatibility и observability. Выбрать managed Kafka, если
   эксплуатация кластера не является отдельной целью обучения.
4. **Пилот:** перенести одно некритичное событие, например notification или
   analytics projection. На время миграции выбрать один канонический путь
   обработки либо применять тот же event ID для дедупликации dual delivery.
5. **Проверка:** duplicate, reorder, poison message, broker outage, consumer lag,
   rebalance и replay проходят автоматические failure tests.
6. **Расширение:** переносить остальные async consumers по одному. Денежные
   invariants и синхронные transaction boundaries не разрывать ради брокера.

## Что не делать

- не публиковать событие напрямую после commit без durable outbox;
- не считать offset достаточной бизнес-идемпотентностью;
- не создавать topic на каждую таблицу;
- не использовать Kafka как RPC с ожиданием немедленного ответа;
- не строить длинную choreography для резервов и ledger, пока одна локальная
  транзакция решает задачу надёжнее;
- не удалять inbox/unique constraints после перехода на broker.

